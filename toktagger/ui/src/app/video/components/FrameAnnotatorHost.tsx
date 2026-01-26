"use client";

import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import {
  Annotorious,
  ImageAnnotator,
  useAnnotator,
  type ImageAnnotation,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import {
  useVideoSession,
  commitOverlayToSession,
} from "@/app/video/components/video-session";
import { getLabelTrack, readRectGeometry, stampLabelAndTrack } from "./anno-utils";
import {
  canonicalizeTrackId,
  existingTrackIdsForClass,
  uniqueReadableTrackId,
} from "./video-utils";
import { AnnotationPopup } from "./AnnotationPopup";

/**
 * Narrow API surface we rely on from Annotorious.
 * We keep it small so the component doesn't depend on internal implementation details.
 */
type AnnotatorApi = {
  getAnnotations?: () => unknown;
  setAnnotations?: (anns: ImageAnnotation[], replace?: boolean) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
};

type UnknownRecord = Record<string, unknown>;

function isFunction(v: unknown): v is (...args: unknown[]) => unknown {
  return typeof v === "function";
}

/**
 * Best-effort adapter for the object returned by `useAnnotator()`.
 * If the expected methods aren't present, we treat the API as unavailable.
 */
function asAnnotatorApi(a: unknown): AnnotatorApi | null {
  if (!a || (typeof a !== "object" && typeof a !== "function")) return null;
  const r = a as Record<string, unknown>;
  if ("getAnnotations" in r && r.getAnnotations != null && !isFunction(r.getAnnotations))
    return null;
  if ("setAnnotations" in r && r.setAnnotations != null && !isFunction(r.setAnnotations))
    return null;
  if ("on" in r && r.on != null && !isFunction(r.on)) return null;
  if ("off" in r && r.off !=null && !isFunction(r.off)) return null;
  return a as AnnotatorApi;
}

/**
 * Normalize Annotorious return shapes into a plain list.
 * Some versions return arrays; others return an object with a `.list` field.
 */
function toAnnoList(got: unknown): ImageAnnotation[] {
  if (Array.isArray(got)) return got as ImageAnnotation[];

  if (got && typeof got === "object") {
    const rec = got as UnknownRecord;
    const list = rec["list"];
    if (Array.isArray(list)) return list as ImageAnnotation[];
  }
  return [];
}

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
    geom && typeof geom === "object" ? (geom as UnknownRecord) : ({} as UnknownRecord);

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
  return (
    <Annotorious>
      <Inner imageBase64={props.imageBase64} />
    </Annotorious>
  );
}

/**
 * Core annotator integration:
 * - syncs per-frame overlay between Annotorious and the session store
 * - assigns track ids on create (based on current class selection)
 * - keeps a small popup anchored to the selected rectangle
 */
function Inner({ imageBase64 }: { imageBase64: string }) {
  const session = useVideoSession();
  const annoRaw = useAnnotator();
  const api = useMemo(() => asAnnotatorApi(annoRaw), [annoRaw]);

  /**
   * Guard against feedback loops: when we call `api.setAnnotations`, Annotorious
   * emits update events. During that window we ignore change handlers.
   */
  const suppressRef = useRef(false);

  // Selection + popup state (driven by Annotorious selectionChanged)
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<{
    className: string | null;
    trackId: string | null;
    geom: { x: number; y: number; w: number; h: number } | null;
  } | null>(null);
  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  const clearPopup = useCallback(() => {
    setSelectedId(null);
    setSelectedMeta(null);
    setPopupPos(null);
  }, []);

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
        const existing = existingTrackIdsForClass(session.byFrame, cls, getLabelTrack);
        used = new Set(existing.map((t) => canonicalizeTrackId(t)));
        usedByClass.set(cls, used);
      }

      const next = uniqueReadableTrackId(used);
      used.add(canonicalizeTrackId(next));
      return next;
    };
  }, [session.byFrame]);

  /**
   * Convert annotation geometry in natural pixels to a popup position
   * in the displayed image's client space.
   */
  const computePopupPos = useCallback(
    (g: { x: number; y: number; w: number; h: number }) => {
      const img = imgRef.current;
      if (!img) return null;

      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) return null;

      const cw = img.clientWidth;
      const ch = img.clientHeight;
      if (!cw || !ch) return null;

      const scaleX = cw / nw;
      const scaleY = ch / nh;

      // Anchor near the top-right corner of the rectangle, with padding.
      let left = (g.x + g.w) * scaleX + 8;
      let top = g.y * scaleY + 8;

      // Keep the popup inside the image bounds.
      left = Math.max(8, Math.min(left, cw - 8));
      top = Math.max(8, Math.min(top, ch - 8));

      return { left, top };
    },
    [],
  );

  /**
   * Re-read the selected annotation after programmatic updates so the popup
   * follows the most recent geometry.
   */
  const refreshPopupForId = useCallback(
    async (id: string) => {
      if (!id || !api?.getAnnotations) return;

      await doubleRAF();

      const raw = toAnnoList(api.getAnnotations());
      const hit = raw.find((a) => a?.id === id);
      if (!hit) {
        clearPopup();
        return;
      }

      const lt = getLabelTrack(hit);
      const geom = readRectGeometry(hit);

      setSelectedMeta({ className: lt.className, trackId: lt.trackId, geom });
      setPopupPos(geom ? computePopupPos(geom) : null);
    },
    [api, clearPopup, computePopupPos],
  );

  /**
   * Single commit point for all Annotorious mutations (create/update/delete).
   * This normalizes bodies, clamps geometry to image bounds, and syncs the session store.
   */
  const onAnyChange = useCallback(
    (rawOverride?: unknown) => {
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
      const raw = Array.isArray(rawOverride)
        ? (rawOverride as ImageAnnotation[])
        : toAnnoList(api.getAnnotations());

      // Enforce image bounds so rectangles can't persist outside the frame.
      const clamped = clampOverlayToImage(raw, imgRef.current);

      const cls = session.selection.className ?? firstClassFrom(clamped);

      const fallbackTrackId = session.selection.trackId ?? null;
      const allocTrackId = fallbackTrackId ? undefined : makeAllocator();

      const normalized = commitOverlayToSession({
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

      if (selectedId) void refreshPopupForId(selectedId);
    },
    [api, session, makeAllocator, selectedId, refreshPopupForId],
  );

  /**
   * When the frame changes, replace the annotator overlay from the session store.
   */
  useEffect(() => {
    if (!api?.setAnnotations) return;

    const cur = api.getAnnotations ? toAnnoList(api.getAnnotations()) : [];
    if (sameOverlay(cur, overlayForFrame ?? [])) return;

    clearPopup();

    suppressRef.current = true;
    api.setAnnotations(overlayForFrame ?? [], true);

    void doubleRAF().then(() => {
      suppressRef.current = false;
    });
  }, [api, overlayForFrame, clearPopup]);

  /**
   * Event wiring:
   * - selectionChanged updates popup state
   * - create/update/delete all funnel through onAnyChange
   */
  useEffect(() => {
    if (!api?.on || !api?.off || !api?.getAnnotations) return;

    const onSelectionChanged = (selected: unknown) => {
      // Keep selection UI responsive even during suppression.
      const arr = Array.isArray(selected) ? (selected as ImageAnnotation[]) : [];

      if (arr.length === 0) {
        clearPopup();
        if (!suppressRef.current) onAnyChange();
        return;
      }

      const first = arr[0] as ImageAnnotation | undefined;
      const id = first?.id;
      if (!id) return;

      setSelectedId(id);

      const lt = getLabelTrack(first);
      const geom = readRectGeometry(first);
      setSelectedMeta({ className: lt.className, trackId: lt.trackId, geom });
      setPopupPos(geom ? computePopupPos(geom) : null);

      void refreshPopupForId(id);
    };

    /**
     * On creation we assign a track id for the current class selection.
     * This ensures new rectangles immediately satisfy the "label + track" invariant.
     */
    const onCreate = (...args: unknown[]) => {
      if (suppressRef.current) return;

      const cls = session.selection.className;
      if (!cls) return;

      const created = args[0] as ImageAnnotation | undefined;
      const createdId = created?.id;
      if (!createdId) {
        onAnyChange();
        return;
      }

      const raw = toAnnoList(api.getAnnotations());

      // Track ids already used for this class (session + current overlay).
      const used = new Set<string>();
      for (const tid of existingTrackIdsForClass(session.byFrame, cls, getLabelTrack)) {
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

    api.on("createAnnotation", onCreate);
    api.on("updateAnnotation", onAnyChange);
    api.on("deleteAnnotation", onAnyChange);
    api.on("selectionChanged", onSelectionChanged);

    return () => {
      api.off?.("createAnnotation", onCreate);
      api.off?.("updateAnnotation", onAnyChange);
      api.off?.("deleteAnnotation", onAnyChange);
      api.off?.("selectionChanged", onSelectionChanged);
    };
  }, [api, session, onAnyChange, clearPopup, computePopupPos, refreshPopupForId]);

  const drawingEnabled = !!session.selection.className;
  const label = session.frame;

  const onDeleteBox = () => {
    if (!selectedId || !api?.getAnnotations) return;
    const raw = toAnnoList(api.getAnnotations());
    const next = raw.filter((a) => a?.id !== selectedId);
    clearPopup();
    onAnyChange(next);
  };

  return (
    <div className="w-full flex justify-center">
      <div className="relative inline-block max-w-full">
        <ImageAnnotator tool="rectangle" drawingEnabled={drawingEnabled} autoSave={true}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={`data:image/png;base64,${imageBase64}`}
            alt={`Frame ${label}`}
            className="block mx-auto max-w-full h-auto object-contain max-h-[calc(100dvh-220px)] sm:max-h-[calc(100dvh-210px)]"
            style={{ imageRendering: "pixelated", maxHeight: "calc(100dvh - 240px)" }}
            draggable={false}
            onLoad={() => {
              if (selectedId) void refreshPopupForId(selectedId);
            }}
          />
        </ImageAnnotator>

        {selectedId && selectedMeta && popupPos && (
          <AnnotationPopup
            left={popupPos.left}
            top={popupPos.top}
            className={selectedMeta.className}
            trackId={selectedMeta.trackId}
            geometry={selectedMeta.geom}
            onDeleteBox={onDeleteBox}
            onClose={clearPopup}
          />
        )}
      </div>
    </div>
  );
}
