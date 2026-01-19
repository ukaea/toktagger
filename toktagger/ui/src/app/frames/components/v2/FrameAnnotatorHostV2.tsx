"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  Annotorious,
  ImageAnnotator,
  useAnnotator,
  type ImageAnnotation,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import { useVideoSession, commitOverlayToSession } from "./video-session";
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

async function doubleRAF() {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
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
  const overlayForFrame = useMemo(() => session.getFrameList(session.frame), [session, session.frame]);

  // Hydrate overlay whenever frame changes OR session overlay changes for this frame
  useEffect(() => {
    if (!api?.setAnnotations) return;

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
      const fallbackClass = session.selection.className ?? "UFO";
      const fallbackTrack = session.selection.trackId ?? "1";

      const normalized = commitOverlayToSession({
        raw,
        frameKey: session.frameKey,
        fallback: { className: fallbackClass, trackId: fallbackTrack },
      });

      // If normalization changed bodies/source etc, re-apply silently so popup/edit is consistent
      suppressRef.current = true;
      api.setAnnotations?.(normalized, true);
      void doubleRAF().then(() => {
        suppressRef.current = false;
      });

      session.setFrameList(session.frame, normalized);
    };

    // Create/update/delete are enough; selectionChanged([]) is a decent “commit boundary”
    const onSelectionChanged = (selected: unknown) => {
      if (suppressRef.current) return;
      if (Array.isArray(selected) && selected.length === 0) onAnyChange();
    };

    api.on("createAnnotation", onAnyChange);
    api.on("updateAnnotation", onAnyChange);
    api.on("deleteAnnotation", onAnyChange);
    api.on("selectionChanged", onSelectionChanged);

    return () => {
      api.off?.("createAnnotation", onAnyChange);
      api.off?.("updateAnnotation", onAnyChange);
      api.off?.("deleteAnnotation", onAnyChange);
      api.off?.("selectionChanged", onSelectionChanged);
    };
  }, [api, session]);

  const drawingEnabled = !!session.selection.className && !!session.selection.trackId;

  // If user has class but no track, still allow creating a track via toolbar.
  // We keep drawing disabled until both are set (v2 invariant).
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

      {/* Tiny debug helper (delete if you hate it) */}
      <div className="mt-2 text-xs opacity-70">
        Armed: {session.selection.className ?? "—"} / {session.selection.trackId ?? "—"}{" "}
        | Overlay anns: {overlayForFrame.length}
      </div>
    </div>
  );
}
