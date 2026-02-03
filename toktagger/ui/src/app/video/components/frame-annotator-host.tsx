"use client";

import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import {
  ImageAnnotator,
  ImageAnnotationPopup,
  useAnnotator,
  type ImageAnnotation,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import { useVideoSession } from "@/app/video/components/video-session";
import {
  getLabelTrack,
  readRectGeometry,
  stampLabelAndTrack,
  normalizeOverlayForSession,
} from "./anno-utils";
import {
  canonicalizeTrackId,
  existingTrackIdsForClass,
  uniqueReadableTrackId,
} from "./video-utils";
import { AnnotationPopup } from "./annotation-popup";
import type { Annotator } from "@annotorious/annotorious";

type UnknownRecord = Record<string, unknown>;

/**
 * Stable signature for comparing overlays by content (not by reference).
 * Used to avoid feedback loops when we programmatically call `setAnnotations`.
 */
function annoSig(a: ImageAnnotation): string {
  const sel = a.target.selector;
  const source = a.target.source ?? "";
  const g = readRectGeometry(a);
  const { className, trackId } = getLabelTrack(a);

  return [
    a.id ?? "",
    sel?.type ?? "",
    source,
    g?.x ?? "",
    g?.y ?? "",
    g?.w ?? "",
    g?.h ?? "",
    className ?? "",
    trackId ?? "",
  ].join("|");
}

function sameOverlay(a: ImageAnnotation[], b: ImageAnnotation[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const as = a.map(annoSig).sort();
  const bs = b.map(annoSig).sort();
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
  return true;
}

/**
 * Wait two animation frames so DOM + Annotorious internal state settles
 * after programmatic `setAnnotations` calls.
 */
async function doubleRAF() {
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
}

function clamp01(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Clamp a rectangle to the image bounds in natural pixel space.
 * Returns null when the rectangle has no overlap with the image.
 */
function clampRectToImage(
  g: { x: number; y: number; w: number; h: number },
  nw: number,
  nh: number,
): { x: number; y: number; w: number; h: number } | null {
  // Normalize into corners first (defensive against negative sizes)
  const x1 = Math.min(g.x, g.x + g.w);
  const y1 = Math.min(g.y, g.y + g.h);
  const x2 = Math.max(g.x, g.x + g.w);
  const y2 = Math.max(g.y, g.y + g.h);

  const cx1 = clamp01(x1, 0, nw);
  const cy1 = clamp01(y1, 0, nh);
  const cx2 = clamp01(x2, 0, nw);
  const cy2 = clamp01(y2, 0, nh);

  const w = cx2 - cx1;
  const h = cy2 - cy1;

  if (!(w > 0 && h > 0)) return null;
  return { x: cx1, y: cy1, w, h };
}

/** Return a copy of the annotation with updated rectangle geometry (and bounds). */
function withRectGeometry(
  a: ImageAnnotation,
  g: { x: number; y: number; w: number; h: number },
): ImageAnnotation {
  const geom = a.target.selector.geometry as unknown;

  const base =
    geom && typeof geom === "object"
      ? (geom as UnknownRecord)
      : ({} as UnknownRecord);

  const nextGeom = {
    ...base,
    x: g.x,
    y: g.y,
    w: g.w,
    h: g.h,
    bounds: { minX: g.x, minY: g.y, maxX: g.x + g.w, maxY: g.y + g.h },
  } as unknown as ImageAnnotation["target"]["selector"]["geometry"];

  return {
    ...a,
    target: {
      ...a.target,
      selector: {
        ...a.target.selector,
        geometry: nextGeom,
      },
    },
  };
}

/**
 * Clamp all rectangle annotations to the currently loaded image bounds.
 * Boxes that end up fully outside the image are dropped.
 */
function clampOverlayToImage(
  list: ImageAnnotation[],
  img: HTMLImageElement | null,
): ImageAnnotation[] {
  if (!img) return list;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return list;

  let changed = false;
  const out: ImageAnnotation[] = [];

  for (const a of list) {
    const g = readRectGeometry(a);
    if (!g) {
      out.push(a);
      continue;
    }

    const clamped = clampRectToImage(g, nw, nh);
    if (!clamped) {
      changed = true;
      continue;
    }

    const same =
      clamped.x === g.x &&
      clamped.y === g.y &&
      clamped.w === g.w &&
      clamped.h === g.h;

    if (same) {
      out.push(a);
    } else {
      changed = true;
      out.push(withRectGeometry(a, clamped));
    }
  }

  return changed ? out : list;
}

/**
 * Top-level host that provides the Annotorious context and renders the annotator.
 */
export function FrameAnnotatorHost(props: { imageBase64: string }) {
  return <Inner imageBase64={props.imageBase64} />;
}

/**
 * Core annotator integration:
 * - syncs per-frame overlay between Annotorious and the session store
 * - assigns track ids on create (based on current class selection)
 * - popup uses Annotorious ImageAnnotationPopup (no manual positioning)
 */
function Inner({ imageBase64 }: { imageBase64: string }) {
  const session = useVideoSession();
  const api = useAnnotator<Annotator<ImageAnnotation, ImageAnnotation>>();

  /**
   * Guard against feedback loops: when we call `api.setAnnotations`, Annotorious
   * emits update events. During that window we ignore change handlers.
   */
  const suppressRef = useRef(false);

  // --- Responsive upscale measurement state ---
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [containerW, setContainerW] = useState<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Seed once immediately (important: avoids "0 width" if RO fires late)
    const seed = () => {
      const w = el.getBoundingClientRect().width;
      if (w) setContainerW(w);
    };
    seed();

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setContainerW(cr.width);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayWidth = useMemo(() => {
    if (!containerW) return undefined;

    // Tune these three values as needed
    const TARGET = 900; // "comfortable" tagging width
    const MAX = 1100; // don't exceed this even on huge screens
    const MAX_SCALE = 3; // don't upscale more than 3× natural

    const maxAvailable = Math.min(containerW, MAX);

    // Before image loads, just take the available width nicely
    if (!natural?.w) return maxAvailable;

    const maxScaled = natural.w * MAX_SCALE;

    // Upscale small images towards TARGET, but:
    // - never exceed container/max
    // - never exceed MAX_SCALE × natural
    // - never go below natural unless container is smaller (then fit)
    const desired = Math.max(natural.w, Math.min(TARGET, maxAvailable));
    return Math.min(maxAvailable, maxScaled, desired);
  }, [containerW, natural]);

  const overlayForFrame = useMemo(
    () => session.getFrameList(session.frame),
    [session],
  );

  /**
   * Track id allocator for "AUTO" mode (no explicit trackId selected).
   * The allocator memoizes per-class used ids across calls.
   */
  const makeAllocator = useCallback(() => {
    const usedByClass = new Map<string, Set<string>>();

    return (className: string) => {
      const cls = (className || "").trim() || "UFO";

      let used = usedByClass.get(cls);
      if (!used) {
        const existing = existingTrackIdsForClass(
          session.byFrame,
          cls,
          getLabelTrack,
        );
        used = new Set(existing.map((t) => canonicalizeTrackId(t)));
        usedByClass.set(cls, used);
      }

      const next = uniqueReadableTrackId(used);
      used.add(canonicalizeTrackId(next));
      return next;
    };
  }, [session.byFrame]);

  /**
   * Single commit point for all Annotorious mutations (create/update/delete).
   * This normalizes bodies, clamps geometry to image bounds, and syncs the session store.
   */
  const onAnyChange = useCallback(
    (rawOverride?: ImageAnnotation[]) => {
      if (!api?.getAnnotations) return;
      if (suppressRef.current) return;

      const firstClassFrom = (list: ImageAnnotation[]) => {
        for (const a of list ?? []) {
          const { className } = getLabelTrack(a);
          const s = (className ?? "").trim();
          if (s) return s;
        }
        return null;
      };

      // Some Annotorious events pass a single annotation (not an array).
      const raw = rawOverride ?? api.getAnnotations();

      // Enforce image bounds so rectangles can't persist outside the frame.
      const clamped = clampOverlayToImage(raw, imgRef.current);

      const cls = session.selection.className ?? firstClassFrom(clamped);

      const fallbackTrackId = session.selection.trackId ?? null;
      const allocTrackId = fallbackTrackId ? undefined : makeAllocator();

      const normalized = normalizeOverlayForSession({
        raw: clamped,
        frameKey: session.frameKey,
        fallback: { className: cls, trackId: fallbackTrackId },
        allocTrackId,
        enforceBothBodies: true,
        dedupeByInstance: true,
      });

      // Push corrected overlay back into Annotorious when it diverges.
      if (!sameOverlay(raw, normalized)) {
        suppressRef.current = true;
        api.setAnnotations?.(normalized, true);
        void doubleRAF().then(() => {
          suppressRef.current = false;
        });
      }

      // Persist normalized overlay for this frame in the session store.
      const prev = session.getFrameList(session.frame);
      if (!sameOverlay(prev, normalized)) {
        session.setFrameList(session.frame, normalized);
      }
    },
    [api, session, makeAllocator],
  );

  /**
   * When the frame changes, replace the annotator overlay from the session store.
   */
  useEffect(() => {
    if (!api?.setAnnotations) return;

    const cur = api.getAnnotations ? api.getAnnotations() : [];
    if (sameOverlay(cur, overlayForFrame ?? [])) return;

    // Clear selection so popup closes when switching frames
    api.setSelected?.();

    suppressRef.current = true;
    api.setAnnotations(overlayForFrame ?? [], true);

    void doubleRAF().then(() => {
      suppressRef.current = false;
    });
  }, [api, overlayForFrame]);

  /**
   * Event wiring:
   * - create/update/delete all funnel through onAnyChange
   * - selectionChanged kept only for the "deselect commits" behavior you already had
   */
  useEffect(() => {
    if (!api?.on || !api?.off || !api?.getAnnotations) return;

    const onSelectionChanged = (arr: ImageAnnotation[]) => {
      if (arr.length === 0) {
        if (!suppressRef.current) onAnyChange();
      }
    };

    const onCreate = (created: ImageAnnotation) => {
      if (suppressRef.current) return;

      const cls = session.selection.className;
      if (!cls) return;

      const createdId = created?.id;
      if (!createdId) {
        onAnyChange();
        return;
      }

      const raw = api.getAnnotations();

      // Track ids already used for this class (session + current overlay).
      const used = new Set<string>();

      for (const tid of existingTrackIdsForClass(
        session.byFrame,
        cls,
        getLabelTrack,
      )) {
        const c = canonicalizeTrackId(tid);
        if (c) used.add(c);
      }

      for (const a of raw) {
        const got = getLabelTrack(a);
        if ((got.className ?? "").trim() !== cls) continue;

        const tid = canonicalizeTrackId(got.trackId ?? "");
        if (tid) used.add(tid);
      }

      let trackId = session.selection.trackId ?? null;
      if (!trackId) {
        trackId = uniqueReadableTrackId(used);
      }

      const stamped = raw.map((a) =>
        a?.id === createdId ? stampLabelAndTrack(a, cls, String(trackId)) : a,
      );

      onAnyChange(stamped);
    };

    const onUpdate = (_updated: ImageAnnotation, _previous: ImageAnnotation) => {
      onAnyChange();
    };

    const onDelete = (_deleted: ImageAnnotation) => {
      onAnyChange();
    };

    api.on("createAnnotation", onCreate);
    api.on("updateAnnotation", onUpdate);
    api.on("deleteAnnotation", onDelete);
    api.on("selectionChanged", onSelectionChanged);

    return () => {
      api.off("createAnnotation", onCreate);
      api.off("updateAnnotation", onUpdate);
      api.off("deleteAnnotation", onDelete);
      api.off("selectionChanged", onSelectionChanged);
    };
  }, [
    api,
    session.byFrame,
    session.selection.className,
    session.selection.trackId,
    onAnyChange,
  ]);

  const drawingEnabled = !!session.selection.className;
  const label = session.frame;

  return (
    // This keeps your previous centering approach:
    // - outer flex justify-center centers the inline-block content
    // - inner inline-block shrink-wraps to the image width we set
    <div ref={containerRef} className="w-full flex justify-center">
      <div className="relative inline-block max-w-full">
        <ImageAnnotator tool="rectangle" drawingEnabled={drawingEnabled} autoSave>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={`data:image/png;base64,${imageBase64}`}
            alt={`Frame ${label}`}
            draggable={false}
            onLoad={() => {
              const img = imgRef.current;
              if (img) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            className="block mx-auto h-auto object-contain select-none"
            // Key change: explicitly set width on the IMG so Annotorious can't shrink-wrap it away.
            style={{
              imageRendering: "pixelated",
              width: displayWidth ? `${displayWidth}px` : undefined,
              maxWidth: "100%",
              height: "auto",
              maxHeight: "calc(100dvh - 240px)",
            }}
          />
        </ImageAnnotator>

        {/* Built-in Annotorious popup positioning (no manual geometry->pixel mapping) */}
        <ImageAnnotationPopup
          popup={(props) => {
            const annotation = props.annotation as ImageAnnotation;

            const { className, trackId } = getLabelTrack(annotation);
            const geometry = readRectGeometry(annotation);

            return (
              <AnnotationPopup
                className={className}
                trackId={trackId}
                geometry={geometry}
                onDeleteBox={() => {
                  const id = annotation?.id;
                  if (!id) return;
                  api.removeAnnotation?.(id);
                  // Clear selection so the popup closes immediately
                  api.setSelected?.();
                }}
                onClose={() => {
                  api.setSelected?.();
                }}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
