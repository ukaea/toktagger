"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useAnnotator, type ImageAnnotation } from "@annotorious/react";
import type { Annotator } from "@annotorious/annotorious";

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
  existingTrackIdsForClass,
  uniqueReadableTrackId,
} from "./video-utils";
import {
  annoToVideoBBox,
  getLabelTrack,
  videoBBoxToAnno,
  stampLabelAndTrack,
  normalizeOverlayForSession,
} from "./anno-utils";
import {
  clampOverlayToNaturalImage,
  doubleRAF,
  sameOverlay,
} from "./overlay-sync-utils";

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

  /** Natural image dimensions for the currently loaded frame (used for clamping). */
  imageNatural: { w: number; h: number } | null;
  setImageNatural: (n: { w: number; h: number } | null) => void;

  /** Popup helpers so view components don't need direct access to the Annotorious API. */
  deleteAnnotation: (id: string) => void;
  closePopup: () => void;

  /**
   * Sidebar focus helper:
   * A click in the sidebar can request focusing a (className, trackId) instance.
   * This queues a request which we attempt to fulfill against the LIVE Annotorious overlay.
   */
  requestFocusInstance: (
    className: string,
    trackId: string,
    opts?: { onlyIfOnCurrentFrame?: boolean },
  ) => void;

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
  dbAnnotations: Annotation[];
  children: React.ReactNode;
}) {
  const { projectId, sampleId, children } = props;

  const api = useAnnotator<Annotator<ImageAnnotation, ImageAnnotation>>();

  /**
   * Guard against feedback loops: when we call `api.setAnnotations`, Annotorious
   * emits update events. During that window we ignore change handlers.
   */
  const suppressRef = useRef(false);

  // Track pending focus requests from sidebar (single click or double click)
  const focusRequestRef = useRef<{
    className: string;
    trackId: string;
    onlyIfOnCurrentFrame?: boolean;
  } | null>(null);

  // bump to trigger effects when a focus request happens on the same frame
  const [focusNonce, setFocusNonce] = useState(0);

  const [imageNatural, setImageNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);

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

  const requestFocusInstance = useCallback(
    (
      className: string,
      trackId: string,
      opts?: { onlyIfOnCurrentFrame?: boolean },
    ) => {
      const cls = (className || "").trim();
      const tid = canonicalizeTrackId(trackId || "");
      if (!cls || !tid) return;
      focusRequestRef.current = {
        className: cls,
        trackId: tid,
        onlyIfOnCurrentFrame: Boolean(opts?.onlyIfOnCurrentFrame),
      };
      // force a React update so effects can process the ref
      setFocusNonce((n) => n + 1);
    },
    [],
  );

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
        const next = forwardPropagateIfEmpty(prev, frame, nextFrame, {
          projectId,
          sampleId,
        });
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
      let invalid = 0;

      for (const a of dbAnnotations) {
        const parsed = VideoBoundingBoxSchema.safeParse(a);
        if (!parsed.success) {
          invalid += 1;
          continue;
        }

        const vb = parsed.data;
        const key = buildSourceKey({ projectId, sampleId, frame: vb.frame });
        const vbForAnno: VideoBoundingBox = {
          ...vb,
          timestamp: vb.timestamp ?? undefined,
        };
        const anno = videoBBoxToAnno(vbForAnno, key);

        const cur = byF.get(vb.frame) ?? [];
        cur.push(anno);
        byF.set(vb.frame, cur);
      }

      if (invalid > 0) {
        console.warn(
          `[video] seedFromDbIfEmpty: skipped ${invalid} invalid annotation(s) from backend (failed VideoBoundingBoxSchema).`,
        );
      }

      if (byF.size === 0) return;

      setByFrame(byF);
      setDirty(false);
    },
    [byFrame.size, dirty, projectId, sampleId],
  );

  // Seed session state from backend annotations once (no-op if the session already has data).
  useEffect(() => {
    if (!props.dbAnnotations || props.dbAnnotations.length === 0) return;
    seedFromDbIfEmpty(props.dbAnnotations);
  }, [props.dbAnnotations, seedFromDbIfEmpty]);

  /**
   * Single commit point for all Annotorious mutations (create/update/delete).
   * This normalizes bodies, clamps geometry to image bounds, and syncs the session store.
   */
  const commitFromAnnotorious = useCallback(
    (rawOverride?: ImageAnnotation[]) => {
      if (!api?.getAnnotations) return;
      if (suppressRef.current) return;

      // Some Annotorious events pass a single annotation (not an array).
      const raw = rawOverride ?? api.getAnnotations();

      // Enforce image bounds so rectangles can't persist outside the frame.
      const clamped = clampOverlayToNaturalImage(raw, imageNatural);

      const firstClassFrom = (list: ImageAnnotation[]) => {
        for (const a of list ?? []) {
          const { className } = getLabelTrack(a);
          const s = (className ?? "").trim();
          if (s) return s;
        }
        return null;
      };

      const cls = selection.className ?? firstClassFrom(clamped);
      const fallbackTrackId = selection.trackId ?? null;

      // Allocator is only needed within THIS normalization pass.
      // It allocates unique ids per-class for annotations missing trackId.
      const allocTrackId = fallbackTrackId
        ? undefined
        : (() => {
            const usedByClass = new Map<string, Set<string>>();

            return (className: string) => {
              const c = (className || "").trim() || "UFO";

              let used = usedByClass.get(c);
              if (!used) {
                const existing = existingTrackIdsForClass(byFrame, c);
                used = new Set(existing.map((t) => canonicalizeTrackId(t)));
                usedByClass.set(c, used);
              }

              const next = uniqueReadableTrackId(used);
              used.add(canonicalizeTrackId(next));
              return next;
            };
          })();

      const normalized = normalizeOverlayForSession({
        raw: clamped,
        frameKey,
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
      const prev = getFrameList(frame);
      if (!sameOverlay(prev, normalized)) {
        setFrameList(frame, normalized);
      }
    },
    [
      api,
      byFrame,
      frame,
      frameKey,
      getFrameList,
      imageNatural,
      selection.className,
      selection.trackId,
      setFrameList,
    ],
  );

  const desiredOverlay = useMemo(
    () => byFrame.get(frame) ?? [],
    [byFrame, frame],
  );

  // --- Focus/selection helpers ---
  const findMatch = useCallback(
    (list: ImageAnnotation[], cls: string, tid: string) => {
      const wantCls = (cls || "").trim();
      const wantTid = canonicalizeTrackId(tid || "");
      if (!wantCls || !wantTid) return null;

      return (
        list.find((a) => {
          const got = getLabelTrack(a);
          return (
            (got.className ?? "").trim() === wantCls &&
            canonicalizeTrackId(got.trackId ?? "") === wantTid
          );
        }) ?? null
      );
    },
    [],
  );

  const selectAnno = useCallback(
    (anno: ImageAnnotation) => {
      const id = anno?.id as string | undefined;
      if (!id) return false;

      const setSelected = api?.setSelected as
        | ((id?: string, editable?: boolean) => void)
        | undefined;

      if (!setSelected) return false;

      try {
        setSelected(id, true); // true => editable (move/resize immediately)
        return true;
      } catch {
        try {
          setSelected(id);
          return true;
        } catch {
          return false;
        }
      }
    },
    [api],
  );

  const tryFocusPending = useCallback(async () => {
    const pending = focusRequestRef.current;
    if (!pending) return;

    if (!api?.getAnnotations) return;

    // Always search in the LIVE annotorious overlay, not desiredOverlay
    // (desiredOverlay objects/ids can differ from api's internal objects)
    const live = api.getAnnotations() ?? [];
    const match = findMatch(live, pending.className, pending.trackId);

    if (!match) {
      if (pending.onlyIfOnCurrentFrame) {
        focusRequestRef.current = null;
      }
      return;
    }

    // Small re-read to avoid races if Annotorious mutates objects between frames.
    const live2 = api.getAnnotations() ?? [];
    const match2 =
      findMatch(live2, pending.className, pending.trackId) ?? match;

    const ok = selectAnno(match2);
    if (ok) {
      focusRequestRef.current = null; // one-shot
    }
  }, [api, findMatch, selectAnno]);

  // process focus requests even if we're staying on the same frame and overlay doesn't change
  useEffect(() => {
    void tryFocusPending();
  }, [focusNonce, tryFocusPending]);

  /**
   * Keep the Annotorious overlay in sync with the session source-of-truth.
   *
   * Annotorious maintains its own internal annotation state and does not automatically
   * swap overlays when our notion of "current frame" changes (or when session state
   * changes due to seeding, forward-prop, clear/delete actions).
   *
   * So when either:
   *  - the active frame changes, OR
   *  - the session overlay for the active frame changes,
   * we push the session overlay into Annotorious.
   *
   * Note: focus requests from the sidebar are fulfilled against the LIVE Annotorious overlay
   * (api.getAnnotations), because ids/objects in desiredOverlay can diverge from Annotorious' internal state.
   */
  useEffect(() => {
    if (!api?.setAnnotations) return;

    const cur = api.getAnnotations ? api.getAnnotations() : [];
    const overlayChanged = !sameOverlay(cur, desiredOverlay);

    if (overlayChanged) {
      suppressRef.current = true;

      // Set overlay first
      api.setAnnotations(desiredOverlay, true);

      suppressRef.current = false;
    }

    // Whether overlay changed or not, try focus:
    // - single click often happens without overlay changing
    void tryFocusPending();
  }, [api, desiredOverlay, tryFocusPending]);

  // Also retry focus when the frame changes (covers quick next/prev navigation)
  useEffect(() => {
    void tryFocusPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  /**
   * Event wiring:
   * - create/update/delete all funnel through commitFromAnnotorious
   * - selectionChanged kept only for the "deselect commits" behavior
   */
  useEffect(() => {
    if (!api?.on || !api?.off || !api?.getAnnotations) return;

    const onSelectionChanged = (arr: ImageAnnotation[]) => {
      if (arr.length === 0) {
        if (!suppressRef.current) commitFromAnnotorious();
      }
    };

    const onCreate = (created: ImageAnnotation) => {
      if (suppressRef.current) return;

      const cls = selection.className;
      if (!cls) return;

      const createdId = created?.id;
      if (!createdId) {
        commitFromAnnotorious();
        return;
      }

      const raw = api.getAnnotations();

      // Track ids already used for this class (session + current overlay).
      const used = new Set<string>();

      for (const tid of existingTrackIdsForClass(byFrame, cls)) {
        const c = canonicalizeTrackId(tid);
        if (c) used.add(c);
      }

      for (const a of raw) {
        const got = getLabelTrack(a);
        if ((got.className ?? "").trim() !== cls) continue;

        const tid = canonicalizeTrackId(got.trackId ?? "");
        if (tid) used.add(tid);
      }

      let trackId = selection.trackId ?? null;
      if (!trackId) {
        trackId = uniqueReadableTrackId(used);
      }

      const stamped = raw.map((a) =>
        a?.id === createdId ? stampLabelAndTrack(a, cls, String(trackId)) : a,
      );

      commitFromAnnotorious(stamped);
    };

    const onUpdate = () => {
      commitFromAnnotorious();
    };

    const onDelete = () => {
      commitFromAnnotorious();
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
    byFrame,
    commitFromAnnotorious,
    selection.className,
    selection.trackId,
  ]);

  const closePopup = useCallback(() => {
    api?.setSelected?.();
  }, [api]);

  const deleteAnnotation = useCallback(
    (id: string) => {
      if (!id) return;
      api?.removeAnnotation?.(id);
      api?.setSelected?.();
    },
    [api],
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
      imageNatural,
      setImageNatural,
      deleteAnnotation,
      closePopup,
      requestFocusInstance,
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
      imageNatural,
      setImageNatural,
      deleteAnnotation,
      closePopup,
      requestFocusInstance,
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
