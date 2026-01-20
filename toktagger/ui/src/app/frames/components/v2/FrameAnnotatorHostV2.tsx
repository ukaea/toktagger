"use client";

import React, { useEffect, useMemo, useRef, useCallback } from "react";
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
} from "@/app/frames/components/v2/video-session";
import { getLabelTrack } from "./anno-utils";

type AnnotatorApi = {
  getAnnotations?: () => unknown;
  setAnnotations?: (anns: ImageAnnotation[], replace?: boolean) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
};

function isFunction(v: unknown): v is (...args: unknown[]) => unknown {
  return typeof v === "function";
}

function asAnnotatorApi(a: unknown): AnnotatorApi | null {
  if (!a || (typeof a !== "object" && typeof a !== "function")) return null;
  const r = a as Record<string, unknown>;
  if ("getAnnotations" in r && r.getAnnotations != null && !isFunction(r.getAnnotations)) return null;
  if ("setAnnotations" in r && r.setAnnotations != null && !isFunction(r.setAnnotations)) return null;
  if ("on" in r && r.on != null && !isFunction(r.on)) return null;
  if ("off" in r && r.off != null && !isFunction(r.off)) return null;
  return a as AnnotatorApi;
}

function toAnnoList(got: unknown): ImageAnnotation[] {
  if (Array.isArray(got)) return got as ImageAnnotation[];
  if (got && typeof got === "object" && "list" in (got as any)) {
    const list = (got as any).list;
    if (Array.isArray(list)) return list as ImageAnnotation[];
  }
  return [];
}

function annoSig(a: ImageAnnotation): string {
  const sel = (a as any)?.target?.selector;
  const g = sel?.geometry ?? {};
  const source = (a as any)?.target?.source ?? "";
  const { className, trackId } = getLabelTrack(a);

  return [
    a.id ?? "",
    sel?.type ?? "",
    source,
    g.x ?? "",
    g.y ?? "",
    g.w ?? "",
    g.h ?? "",
    className ?? "",
    trackId ?? "",
  ].join("|");
}

function sameOverlay(a: ImageAnnotation[], b: ImageAnnotation[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  // order can differ; compare by signatures
  const as = a.map(annoSig).sort();
  const bs = b.map(annoSig).sort();
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
  return true;
}

async function doubleRAF() {
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
}

export function FrameAnnotatorHostV2(props: { imageBase64: string }) {
  return (
    <Annotorious>
      <Inner imageBase64={props.imageBase64} />
    </Annotorious>
  );
}

function Inner({ imageBase64 }: { imageBase64: string }) {
  const session = useVideoSession();
  const annoRaw = useAnnotator();
  const api = useMemo(() => asAnnotatorApi(annoRaw), [annoRaw]);

  const suppressRef = useRef(false);

  // Overlay for current frame comes from session.byFrame
  const overlayForFrame = useMemo(
    () => session.getFrameList(session.frame),
    [session, session.frame],
  );

  // NEW: Auto-create a track on first draw if class is selected but trackId is missing.
  const ensureTrackSelected = useCallback((): string | null => {
    const cls = session.selection.className;
    if (!cls) return null;

    // If already armed, keep it.
    if (session.selection.trackId) return session.selection.trackId;

    // Auto-create instance for this class
    const created = session.createNewInstanceForClass(cls);
    const trackId = created?.trackId;

    if (trackId) {
      session.setSelection({ className: cls, trackId, source: "auto" });
      return trackId;
    }

    return null;
  }, [session]);

  // Hydrate overlay whenever frame changes OR session overlay changes for this frame
  useEffect(() => {
    if (!api?.setAnnotations) return;

    // If Annotorious already has the same overlay, don't re-hydrate.
    const cur = api.getAnnotations ? toAnnoList(api.getAnnotations()) : [];
    if (sameOverlay(cur, overlayForFrame ?? [])) return;

    suppressRef.current = true;
    api.setAnnotations(overlayForFrame ?? [], true);

    void doubleRAF().then(() => {
      suppressRef.current = false;
    });
  }, [api, overlayForFrame]);

  // Any change -> normalize -> store in session (marks dirty)
  useEffect(() => {
    if (!api?.on || !api?.off || !api?.getAnnotations) return;

    const onAnyChange = () => {
      if (suppressRef.current) return;

      const raw = toAnnoList(api.getAnnotations());

      // If class is missing, we can't label. Keep behavior predictable.
      const cls = session.selection.className;
      if (!cls) return;

      // Ensure we have a trackId at the moment we persist anything.
      const trackId = ensureTrackSelected() ?? session.selection.trackId;
      if (!trackId) return;

      const normalized = commitOverlayToSession({
        raw,
        frameKey: session.frameKey,
        fallback: { className: cls, trackId },
      });

      // Only re-apply to Annotorious if normalization actually changed something
      if (!sameOverlay(raw, normalized)) {
        suppressRef.current = true;
        api.setAnnotations?.(normalized, true);
        void doubleRAF().then(() => {
          suppressRef.current = false;
        });
      }

      // Only update React/session state if session doesn’t already match
      const prev = session.getFrameList(session.frame);
      if (!sameOverlay(prev, normalized)) {
        session.setFrameList(session.frame, normalized);
      }
    };

    const onSelectionChanged = (selected: unknown) => {
      if (suppressRef.current) return;
      if (Array.isArray(selected) && selected.length === 0) onAnyChange();
    };

    // IMPORTANT: for createAnnotation, force track creation first,
    // then run the normal pipeline.
    const onCreate = () => {
      if (suppressRef.current) return;
      ensureTrackSelected();
      onAnyChange();
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
  }, [api, session, ensureTrackSelected]);

  // UX: allow drawing as soon as class is selected. We'll auto-create a track on first draw.
  const drawingEnabled = !!session.selection.className;

  const label = session.frame;

  return (
    <div className="w-full">
      <ImageAnnotator tool="rectangle" drawingEnabled={drawingEnabled} autoSave={true}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${imageBase64}`}
          alt={`Frame ${label}`}
          className="block mx-auto max-w-full h-auto object-contain max-h-[calc(100dvh-220px)] sm:max-h-[calc(100dvh-210px)]"
          style={{ imageRendering: "pixelated", maxHeight: "calc(100dvh - 240px)" }}
          draggable={false}
        />
      </ImageAnnotator>

    </div>
  );
}