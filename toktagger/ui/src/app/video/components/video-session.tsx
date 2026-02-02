"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useLayoutEffect,
} from "react";
import type { ImageAnnotation } from "@annotorious/react";

import type { Annotation, DataParams } from "@/types";
import { VideoBoundingBoxSchema } from "@/types";
import type {
  ByFrameMap,
  FrameIndex,
  InstanceProfile,
  Selection,
  VideoBoundingBox,
} from "./types";
import { buildSourceKey } from "./types";
import {
  deleteTrackAcrossFrames,
  canonicalizeTrackId,
  deriveInstances,
  forwardPropagateIfEmpty,
  mapClearAll,
  mapClearFrame,
  mapSetFrame,
  nextTrackIdForClass,
} from "./video-utils";
import {
  annoToVideoBBox,
  getLabelTrack,
  normalizeOverlay,
  videoBBoxToAnno,
} from "./anno-utils";

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
  createNewInstanceForClass: (className: string) => {
    className: string;
    trackId: string;
  };

  /**
   * Delete a specific instance across all frames (does NOT rely on selection state).
   * This avoids "needs two clicks" bugs when callers first set selection then delete.
   */
  deleteInstanceAcrossFrames: (className: string, trackId: string) => void;

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
  if (!v)
    throw new Error(
      "useVideoSession must be used within <VideoSessionProvider>",
    );
  return v;
}

/**
 * Provides shared session state for the video annotation UI.
 * This provider owns the current frame number, overlays, and selection.
 */
export function VideoSessionProvider(props: {
  projectId: string;
  sampleId: string;
  data: unknown;
  dataParams: DataParams;
  children: React.ReactNode;
}) {
  const { projectId, sampleId, children } = props;

  const [videoFrame, setVideoFrame] = useState<number | null>(null);

  // For video we assume backend returns { frame: number, values: base64, ... }
  const frameFromBackend = useMemo(() => {
    if (!props.data) return 0;
    const maybe = props.data as unknown as { frame?: number };
    return maybe?.frame ?? 0;
  }, [props.data]);

  useLayoutEffect(() => {
    if (!props.data) return;

    const dp = props.dataParams as unknown as {
      name?: string;
      frame?: number | null;
    };

    if (dp.name === "image" && dp.frame != null) {
      if (frameFromBackend !== dp.frame) return;
    }

    setVideoFrame(frameFromBackend);
  }, [props.data, frameFromBackend, props.dataParams]);

  const frame: FrameIndex = (videoFrame ?? frameFromBackend) as FrameIndex;

  const setFrame = useCallback((n: FrameIndex) => {
    setVideoFrame(n);
  }, []);

  const [byFrame, setByFrame] = useState<ByFrameMap>(() => new Map());
  const [dirty, setDirty] = useState(false);

  const [selection, setSelectionState] = useState<Selection>({
    className: null,
    trackId: null,
    source: null,
  });

  const frameKey = useMemo(
    () => buildSourceKey({ projectId, sampleId, frame }),
    [projectId, sampleId, frame],
  );

  // Instances are derived from byFrame so UI can render a stable sidebar list.
  const instances = useMemo(
    () => deriveInstances(byFrame, getLabelTrack),
    [byFrame],
  );

  const getFrameList = useCallback(
    (f: FrameIndex) => byFrame.get(f) ?? [],
    [byFrame],
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
      const cname = (className || "").trim();
      const trackId = nextTrackIdForClass(byFrame, cname, getLabelTrack);

      setSelectionState({ className: cname, trackId, source: "auto" });
      return { className: cname, trackId };
    },
    [byFrame],
  );

  /**
   * Delete a specific (className, trackId) across all frames.
   * IMPORTANT: does not depend on selection being updated first.
   */
  const deleteInstanceAcrossFrames = useCallback(
    (className: string, trackId: string) => {
      const cls = (className || "").trim();
      const tid = canonicalizeTrackId(trackId || "");
      if (!cls || !tid) return;

      setByFrame((prev) =>
        deleteTrackAcrossFrames(
          prev,
          { className: cls, trackId: tid },
          getLabelTrack,
        ),
      );

      // If the deleted instance is currently selected, clear selection.trackId
      setSelectionState((prev) => {
        const prevCls = (prev.className || "").trim();
        const prevTid = canonicalizeTrackId(prev.trackId || "");
        if (prevCls === cls && prevTid === tid) {
          return { ...prev, trackId: null };
        }
        return prev;
      });

      setDirty(true);
    },
    [],
  );

  /**
   * Backwards-compatible helper: delete the currently selected instance.
   * Now implemented via deleteInstanceAcrossFrames to avoid stale selection issues.
   */
  const deleteSelectedInstanceAcrossFrames = useCallback(() => {
    if (!selection.className || !selection.trackId) return;
    deleteInstanceAcrossFrames(selection.className, selection.trackId);
  }, [deleteInstanceAcrossFrames, selection.className, selection.trackId]);

  /**
   * Copies current frame annotations into `nextFrame` if it's empty.
   * Any copied annotations get their target.source updated to match the destination frame.
   */
  const forwardPropToNextIfEmpty = useCallback(
    (nextFrame: FrameIndex) => {
      setByFrame((prev) => {
        const next = forwardPropagateIfEmpty(
          prev,
          frame,
          nextFrame,
          (a, nf) => {
            const nextKey = buildSourceKey({ projectId, sampleId, frame: nf });
            return {
              ...a,
              target: { ...a.target, source: nextKey },
            };
          },
        );

        // Only mark dirty if we actually seeded the next frame.
        if (next !== prev) setDirty(true);

        return next;
      });
    },
    [frame, projectId, sampleId],
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
        const parsed = VideoBoundingBoxSchema.safeParse(a);
        if (!parsed.success) continue;

        const vb = parsed.data;
        const key = buildSourceKey({ projectId, sampleId, frame: vb.frame });
        const anno = videoBBoxToAnno(vb, key);

        const cur = byF.get(vb.frame) ?? [];
        cur.push(anno);
        byF.set(vb.frame, cur);
      }

      if (byF.size === 0) return;

      setByFrame(byF);
      setDirty(false);
    },
    [byFrame.size, dirty, projectId, sampleId],
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
      deleteInstanceAcrossFrames,
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
      deleteInstanceAcrossFrames,
      deleteSelectedInstanceAcrossFrames,
      forwardPropToNextIfEmpty,
      collectAllNative,
      collectAllVideoBBoxes,
      seedFromDbIfEmpty,
    ],
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
  return normalizeOverlay(
    args.raw,
    args.frameKey,
    args.fallback,
    args.allocTrackId,
    {
      enforceBothBodies: args.enforceBothBodies ?? true,
      dedupeByInstance: args.dedupeByInstance ?? true,
    },
  );
}
