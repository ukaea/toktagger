"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ImageAnnotator,
  ImageAnnotationPopup,
  type ImageAnnotation,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import { useVideoSession } from "@/app/video/components/video-session";
import { getLabelTrack, readRectGeometry } from "./anno-utils";
import { AnnotationPopup } from "./annotation-popup";

/**
 * Top-level host that provides the Annotorious context and renders the annotator.
 */
export function FrameAnnotatorHost(props: { imageBase64: string }) {
  return <Inner imageBase64={props.imageBase64} />;
}

/**
 * View-only annotator host:
 * - renders the Annotorious ImageAnnotator + popup UI for the current frame
 * - reports the image’s natural size to the session (used for bounds clamping)
 *
 * Note: all Annotorious integration (create/update/delete/selectionChanged),
 * overlay normalization/clamping, and session persistence now live in
 * VideoSessionProvider. This component should not sync overlays or write back
 * to the session store directly.
 */
function Inner({ imageBase64 }: { imageBase64: string }) {
  const { frame, setImageNatural, selection, deleteAnnotation, closePopup } =
    useVideoSession();

  // --- Responsive upscale measurement state ---
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [containerW, setContainerW] = useState<number>(0);

  useEffect(() => {
    setNatural(null);
    setImageNatural(null);
  }, [frame, setImageNatural]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const onLoad = () => {
      const next = { w: img.naturalWidth, h: img.naturalHeight };
      if (next.w > 0 && next.h > 0) {
        setNatural(next);
        setImageNatural(next);
      }
    };

    // Handle cached images that may already be complete before listener registration.
    if (img.complete && img.naturalWidth > 0) onLoad();

    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [imageBase64, setImageNatural]);

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

  const drawingEnabled = !!selection.className;
  const label = frame;

  return (
    // This keeps centering approach:
    // - outer flex justify-center centers the inline-block content
    // - inner inline-block shrink-wraps to the image width we set
    <div ref={containerRef} className="w-full flex justify-center">
      <div className="relative inline-block max-w-full">
        <ImageAnnotator
          tool="rectangle"
          drawingEnabled={drawingEnabled}
          autoSave
          style={(_annotation, state) => ({
            strokeWidth: state?.selected ? 3 : state?.hovered ? 3 : 2,
          })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={`data:image/png;base64,${imageBase64}`}
            alt={`Frame ${label}`}
            draggable={false}
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
                  deleteAnnotation(id);
                }}
                onClose={() => {
                  closePopup();
                }}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
