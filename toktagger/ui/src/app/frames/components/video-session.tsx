"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ImageAnnotation } from "@annotorious/react";

import type { Annotation } from "@/types"; // used only for one-shot seeding from backend payload
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

/**
 * Session state for the frame-by-frame annotation workflow.
 * Owns the in-memory per-frame overlays, selection (class/instance), and helpers for
 * forward propagation and converting overlays to/from backend shapes.
 */
type VideoSessionCtx = {
  projectId: string;
  sampleId: string;

  frame: FrameIndex;
  setFrame: (n: FrameIndex) => void;

  /** Stable source key for the current frame (used as target.source on annotations). */
  frameKey: string;

  /** Per-frame overlay storage (native Annotorious annotation objects). */
  byFrame: ByFrameMap;

  /** True if in-memory session has changes that haven't been saved to backend. */
  dirty: boolean;
  markSaved: () => void;

  /** Current "armed" selection for drawing and instance operations. */
  selection: Selection;
  setSelection: (next: Selection) => void;

  /** Derived instance summary across all frames (used by sidebar UI). */
  instances: InstanceProfile[];

  // frame ops
  getFrameList: (frame: FrameIndex) => ImageAnnotation[];
  /** Set overlay for a frame without marking dirty (used for seeding). */
  seedFrame: (frame: FrameIndex, list: ImageAnnotation[]) => void;
  /** Set overlay for a frame and mark dirty (used for edits). */
  setFrameList: (frame: FrameIndex, list: ImageAnnotation[]) => void;
  clearCurrentFrame: () => void;
  clearAllFrames: () => void;

  // instance ops
  /** Allocate/select the next track id for a class (used by "new instance" flows). */
  createNewInstanceForClass: (className: string) => { className: string; trackId: string };
  /** Delete the currently selected instance across all frames. */
  deleteSelectedInstanceAcrossFrames: () => void;

  // forward propagation
  /** Seed next frame with current overlay if the next frame has no annotations. */
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

/**
 * Provides shared session state for the video annotation UI.
 * The page owns the current frame number; this provider owns the overlays and selection.
 */
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

  const frameKey = useMemo(
    () => buildSourceKey({ projectId, sampleId, frame }),
    [projectId, sampleId, frame]
  );

  // Instances are derived from byFrame so UI can render a stable sidebar list.
  const instances = useMemo(() => deriveInstances(byFrame, getLabelTrack), [byFrame]);

  const getFrameList = useCallback(
    (f: FrameIndex) => byFrame.get(f) ?? [],
    [byFrame]
  );

  const seedFrame = useCallback((f: FrameIndex, list: ImageAnnotation[]) => {
    setByFrame((prev) => mapSetFrame(prev, f, list));
    // Seeding should not mark the session dirty.
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
      deleteTrackAcrossFrames(
        prev,
        { className: selection.className, trackId: selection.trackId },
        getLabelTrack
      )
    );
    setDirty(true);
  }, [selection.className, selection.trackId]);

  /**
   * Copies current frame annotations into `nextFrame` if it's empty.
   * Any copied annotations get their target.source updated to match the destination frame.
   */
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

        // Only mark dirty if we actually seeded the next frame.
        if (next !== prev) setDirty(true);

        return next;
      });
    },
    [frame, projectId, sampleId]
  );

  /** Flatten all per-frame overlays into a single list (useful for debugging/export). */
  const collectAllNative = useCallback(() => {
    const out: ImageAnnotation[] = [];
    for (const list of byFrame.values()) out.push(...(list ?? []));
    return out;
  }, [byFrame]);

  /** Convert the session overlays into backend video bounding boxes. */
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
   * Seed session overlays from backend annotations if the user hasn't edited anything yet.
   * This is intentionally conservative:
   * - no-op if session is dirty
   * - no-op if we already have in-memory overlays
   * - only consumes `video_bounding_box` entries
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

        // Normalize backend payload into our minimal VideoBoundingBox shape.
        const vb: VideoBoundingBox = {
          type: "video_bounding_box",
          frame: frameNum,

          // Track id and label can arrive under different names depending on history.
          track_id: String(anyA.track_id ?? anyA.trackId ?? ""),
          label: String(anyA.label ?? anyA.class_name ?? anyA.className ?? "UFO"),
          class_id: Number(anyA.class_id ?? classIdForName(String(anyA.label ?? "UFO"))),

          // Geometry
          x_min: Number(anyA.x_min ?? anyA.x ?? 0),
          y_min: Number(anyA.y_min ?? anyA.y ?? 0),
          width: Number(anyA.width ?? anyA.w ?? 0),
          height: Number(anyA.height ?? anyA.h ?? 0),

          created_by: String(anyA.created_by ?? "db"),
          timestamp: typeof anyA.timestamp === "string" ? anyA.timestamp : undefined,
        };

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

  const value = useMemo<VideoSessionCtx>(
    () => ({
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
    }),
    [
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
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Normalizes a raw overlay list into our session invariants:
 * - rectangles only
 * - stamps the frame source key
 * - ensures class/track bodies exist (allocating track ids when needed)
 * - optional per-instance de-duplication within the frame
 *
 * The caller is responsible for writing the returned list into session state.
 */
export function commitOverlayToSession(args: {
  raw: ImageAnnotation[];
  frameKey: string;
  fallback: { className: string | null; trackId: string | null };
  allocTrackId?: (className: string) => string;
  enforceBothBodies?: boolean;
  dedupeByInstance?: boolean;
}): ImageAnnotation[] {
  return normalizeOverlay(args.raw, args.frameKey, args.fallback, args.allocTrackId, {
    enforceBothBodies: args.enforceBothBodies ?? true,
    dedupeByInstance: args.dedupeByInstance ?? true,
  });
}
