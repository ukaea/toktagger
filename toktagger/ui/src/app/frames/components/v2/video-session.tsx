"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ImageAnnotation } from "@annotorious/react";

import type { Annotation } from "@/types"; // v1 already uses this; we only use it for seeding filter
import type { ByFrameMap, FrameIndex, InstanceProfile, Selection, VideoBoundingBox } from "./types";
import { buildSourceKey, classIdForName } from "./types";
import {
  deleteTrackAcrossFrames,
  deriveInstances,
  forwardPropagateIfEmpty,
  mapClearAll,
  mapClearFrame,
  mapSetFrame,
  nextTrackIdForClass,
} from "./video-utils";
import { annoToVideoBBox, getLabelTrack, normalizeOverlay, videoBBoxToAnno } from "./anno-utils";

type VideoSessionCtx = {
  projectId: string;
  sampleId: string;

  frame: FrameIndex;
  setFrame: (n: FrameIndex) => void;

  frameKey: string;

  byFrame: ByFrameMap;

  dirty: boolean;
  markSaved: () => void;

  selection: Selection;
  setSelection: (next: Selection) => void;

  instances: InstanceProfile[];

  // frame ops
  getFrameList: (frame: FrameIndex) => ImageAnnotation[];
  seedFrame: (frame: FrameIndex, list: ImageAnnotation[]) => void; // does not set dirty
  setFrameList: (frame: FrameIndex, list: ImageAnnotation[]) => void; // sets dirty
  clearCurrentFrame: () => void;
  clearAllFrames: () => void;

  // instance ops
  createNewInstanceForClass: (className: string) => { className: string; trackId: string };
  deleteSelectedInstanceAcrossFrames: () => void;

  // forward propagation
  forwardPropToNextIfEmpty: (nextFrame: FrameIndex) => void;

  // conversion helpers for backend save
  collectAllNative: () => ImageAnnotation[];
  collectAllVideoBBoxes: () => VideoBoundingBox[];

  // seeding from db annotations (one-shot helper)
  seedFromDbIfEmpty: (dbAnnotations: Annotation[]) => void;
};

const Ctx = createContext<VideoSessionCtx | null>(null);

export function useVideoSession(): VideoSessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVideoSession must be used within <VideoSessionProvider>");
  return v;
}

export function VideoSessionProvider(props: {
  projectId: string;
  sampleId: string;
  frame: FrameIndex;
  setFrame: (n: FrameIndex) => void;
  children: React.ReactNode;
}) {
  const { projectId, sampleId, frame, setFrame, children } = props;

  const [byFrame, setByFrame] = useState<ByFrameMap>(() => new Map());
  const [dirty, setDirty] = useState(false);

  const [selection, setSelectionState] = useState<Selection>({
    className: null,
    trackId: null,
    source: null,
  });

  const frameKey = useMemo(() => buildSourceKey({ projectId, sampleId, frame }), [projectId, sampleId, frame]);

  const instances = useMemo(() => deriveInstances(byFrame, getLabelTrack), [byFrame]);

  const getFrameList = useCallback(
    (f: FrameIndex) => byFrame.get(f) ?? [],
    [byFrame]
  );

  const seedFrame = useCallback((f: FrameIndex, list: ImageAnnotation[]) => {
    setByFrame((prev) => mapSetFrame(prev, f, list));
    // does NOT set dirty
  }, []);

  const setFrameList = useCallback((f: FrameIndex, list: ImageAnnotation[]) => {
    setByFrame((prev) => mapSetFrame(prev, f, list));
    setDirty(true);
  }, []);

  const clearCurrentFrame = useCallback(() => {
    setByFrame((prev) => mapClearFrame(prev, frame));
    setDirty(true);
  }, [frame]);

  const clearAllFrames = useCallback(() => {
    setByFrame((prev) => mapClearAll(prev));
    setDirty(true);
  }, []);

  const markSaved = useCallback(() => setDirty(false), []);

  const setSelection = useCallback((next: Selection) => {
    setSelectionState(next);
  }, []);

  const createNewInstanceForClass = useCallback(
    (className: string) => {
      const cname = (className || "").trim() || "UFO";
      const nextId = nextTrackIdForClass(byFrame, cname, getLabelTrack);
      const trackId = String(nextId);

      setSelectionState({ className: cname, trackId, source: "auto" });
      return { className: cname, trackId };
    },
    [byFrame]
  );

  const deleteSelectedInstanceAcrossFrames = useCallback(() => {
    if (!selection.className || !selection.trackId) return;
    setByFrame((prev) =>
      deleteTrackAcrossFrames(prev, { className: selection.className, trackId: selection.trackId }, getLabelTrack)
    );
    setDirty(true);
  }, [selection.className, selection.trackId]);

  const forwardPropToNextIfEmpty = useCallback(
    (nextFrame: FrameIndex) => {
        setByFrame((prev) => {
        const next = forwardPropagateIfEmpty(prev, frame, nextFrame, (a, nf) => {
            const nextKey = buildSourceKey({ projectId, sampleId, frame: nf });
            return {
            ...a,
            target: { ...(a.target as any), source: nextKey } as any,
            };
        });

        // Only mark dirty if we actually changed something (seeded next frame).
        if (next !== prev) setDirty(true);

        return next;
        });
    },
    [frame, projectId, sampleId]
    );

  const collectAllNative = useCallback(() => {
    const out: ImageAnnotation[] = [];
    for (const list of byFrame.values()) out.push(...(list ?? []));
    return out;
  }, [byFrame]);

  const collectAllVideoBBoxes = useCallback(() => {
    const out: VideoBoundingBox[] = [];
    for (const [f, list] of byFrame.entries()) {
      for (const a of list ?? []) {
        const b = annoToVideoBBox(a, f);
        if (b) out.push(b);
      }
    }
    return out;
  }, [byFrame]);

  /**
   * One-shot seeding helper:
   * - only runs if byFrame is empty AND not dirty
   * - filters dbAnnotations for video_bounding_box entries
   * - groups by frame, converts to native ImageAnnotation[] and stores in byFrame
   */
  const seedFromDbIfEmpty = useCallback(
    (dbAnnotations: Annotation[]) => {
      if (dirty) return;
      if (byFrame.size > 0) return;
      if (!dbAnnotations || dbAnnotations.length === 0) return;

      const byF = new Map<number, ImageAnnotation[]>();

      for (const a of dbAnnotations) {
        const anyA = a as any;
        if (!anyA || anyA.type !== "video_bounding_box") continue;
        const frameNum = Number(anyA.frame);
        if (!Number.isFinite(frameNum)) continue;

        const vb: VideoBoundingBox = {
          type: "video_bounding_box",
          frame: frameNum,

          // track_id can arrive under different names depending on backend/history
          track_id: String(anyA.track_id ?? anyA.trackId ?? ""),

          // label/class name
          label: String(anyA.label ?? anyA.class_name ?? anyA.className ?? "UFO"),
          class_id: Number(
            anyA.class_id ?? classIdForName(String(anyA.label ?? "UFO")),
          ),

          // box geometry
          x_min: Number(anyA.x_min ?? anyA.x ?? 0),
          y_min: Number(anyA.y_min ?? anyA.y ?? 0),
          width: Number(anyA.width ?? anyA.w ?? 0),
          height: Number(anyA.height ?? anyA.h ?? 0),

          created_by: String(anyA.created_by ?? "db"),
          timestamp: typeof anyA.timestamp === "string" ? anyA.timestamp : undefined,
        };

        // build vb + convert...
        const key = buildSourceKey({ projectId, sampleId, frame: frameNum });
        const anno = videoBBoxToAnno(vb, key);

        const cur = byF.get(frameNum) ?? [];
        cur.push(anno);
        byF.set(frameNum, cur);
      }

      if (byF.size === 0) return;

      setByFrame(byF);
      setDirty(false);
    },
    [byFrame.size, dirty, projectId, sampleId]
  );

  const value = useMemo<VideoSessionCtx>(() => ({
    projectId,
    sampleId,
    frame,
    setFrame,
    frameKey,
    byFrame,
    dirty,
    markSaved,
    selection,
    setSelection,
    instances,
    getFrameList,
    seedFrame,
    setFrameList,
    clearCurrentFrame,
    clearAllFrames,
    createNewInstanceForClass,
    deleteSelectedInstanceAcrossFrames,
    forwardPropToNextIfEmpty,
    collectAllNative,
    collectAllVideoBBoxes,
    seedFromDbIfEmpty,
  }), [
    projectId,
    sampleId,
    frame,
    setFrame,
    frameKey,
    byFrame,
    dirty,
    markSaved,
    selection,
    setSelection,
    instances,
    getFrameList,
    seedFrame,
    setFrameList,
    clearCurrentFrame,
    clearAllFrames,
    createNewInstanceForClass,
    deleteSelectedInstanceAcrossFrames,
    forwardPropToNextIfEmpty,
    collectAllNative,
    collectAllVideoBBoxes,
    seedFromDbIfEmpty,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/**
 * Helper used by the host:
 * given a raw overlay list, normalize + stamp + write into session for current frame.
 */
export function commitOverlayToSession(args: {
  raw: ImageAnnotation[];
  frameKey: string;
  fallback: { className: string; trackId: string };
}): ImageAnnotation[] {
  return normalizeOverlay(args.raw, args.frameKey, args.fallback);
}
