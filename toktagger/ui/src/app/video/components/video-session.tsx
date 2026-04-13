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
import {
  useAnnotator,
  type AnnotoriousOpenSeadragonAnnotator,
  type ImageAnnotation,
} from "@annotorious/react";

import type { Annotation, DataParams } from "@/types";
import { VideoBoundingBoxSchema, VideoPolygonSchema } from "@/types";
import type {
  ByFrameMap,
  DrawingTool,
  FrameIndex,
  InstanceProfile,
  Selection,
  VideoAnnotationShape,
  VideoBoundingBox,
  VideoPolygon,
} from "./types";
import { buildSourceKey } from "./types";
import {
  allocateNextTrackId,
  buildNextTrackIdState,
  deleteTrackAcrossFrames,
  canonicalizeTrackId,
  deriveInstances,
  forwardPropagateIfEmpty,
  mapClearAll,
  mapClearFrame,
  mapSetFrame,
  existingTrackIdsForClass,
  uniqueReadableTrackId,
} from "./video-utils";
import {
  annoToVideoAnnotation,
  getLabelTrack,
  videoBBoxToAnno,
  videoPolygonToAnno,
  stampLabelAndTrack,
  normalizeOverlayForSession,
} from "./anno-utils";
import { clampOverlayToNaturalImage, sameOverlay } from "./overlay-sync-utils";

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

  drawingTool: DrawingTool;
  setDrawingTool: (tool: DrawingTool) => void;
  /** When true, drawing is disabled and frame drag/pan is enabled. */
  panMode: boolean;
  setPanMode: (v: boolean) => void;
  propagate: boolean;
  setPropagate: (v: boolean) => void;

  /** Natural image dimensions for the currently loaded frame (used for clamping). */
  imageNatural: { w: number; h: number } | null;
  setImageNatural: (n: { w: number; h: number } | null) => void;

  /** Popup helpers so view components don't need direct access to the Annotorious API. */
  deleteAnnotation: (id: string) => void;
  closePopup: () => void;
  requestFocusInstance: (
    className: string,
    trackId: string,
    opts?: { onlyIfOnCurrentFrame?: boolean; targetFrame?: FrameIndex },
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
  collectAllVideoAnnotations: () => VideoAnnotationShape[];

  // seeding from db annotations (one-shot helper)
  seedFromDbIfEmpty: (dbAnnotations: Annotation[]) => void;
};

const Ctx = createContext<VideoSessionCtx | null>(null);

type FocusRequest = {
  className: string;
  trackId: string;
  onlyIfOnCurrentFrame: boolean;
  targetFrame: FrameIndex | null;
};

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

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
  propagate: boolean;
  setPropagate: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const { projectId, sampleId, propagate, setPropagate, children } = props;

  const api = useAnnotator<AnnotoriousOpenSeadragonAnnotator>();

  /**
   * Annotorious emits create/update/delete events even when annotations are set
   * programmatically (e.g. when we sync the overlay on frame change).
   *
   * This ref guards against re-entrant feedback loops during those programmatic writes.
   * Session state (`byFrame`) remains the source of truth; Annotorious is the interactive editor.
   */
  const isProgrammaticAnnoSyncRef = useRef(false);
  const commitFromAnnotoriousRef = useRef<
    (rawOverride?: ImageAnnotation[]) => void
  >(() => {});
  const shiftPanActiveRef = useRef(false);
  const panModeBeforeShiftRef = useRef(false);
  const pendingFocusRef = useRef<FocusRequest | null>(null);
  const nextTrackNumsRef = useRef<Map<string, number>>(
    buildNextTrackIdState(props.dbAnnotations),
  );

  const [imageNatural, setImageNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const [videoFrame, setVideoFrame] = useState<number | null>(null);

  // For video we assume backend returns { frame: number, values: base64, ... }
  const frameFromBackend = useMemo(() => {
    if (!props.data) return 0;
    const maybe = props.data as { frame?: number };
    return maybe?.frame ?? 0;
  }, [props.data]);

  useLayoutEffect(() => {
    if (!props.data) return;

    const dp = props.dataParams as {
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
  const [drawingTool, setDrawingToolState] = useState<DrawingTool>("rectangle");
  const [panMode, setPanModeState] = useState(false);

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

  const markSaved = useCallback(() => setDirty(false), []);

  const setSelection = useCallback((next: Selection) => {
    setSelectionState(next);
  }, []);

  const flushPendingOverlay = useCallback(() => {
    if (isProgrammaticAnnoSyncRef.current) return;
    const raw = api?.getAnnotations?.();
    if (!raw) return;
    commitFromAnnotoriousRef.current(raw);
  }, [api]);

  const setDrawingTool = useCallback(
    (tool: DrawingTool) => {
      api?.setSelected?.();
      flushPendingOverlay();
      setDrawingToolState(tool);
    },
    [api, flushPendingOverlay],
  );

  const setPanMode = useCallback(
    (v: boolean) => {
      api?.setSelected?.();
      flushPendingOverlay();
      setPanModeState(v);
    },
    [api, flushPendingOverlay],
  );

  const clearCurrentFrame = useCallback(() => {
    api?.setSelected?.();
    flushPendingOverlay();
    pendingFocusRef.current = null;

    setByFrame((prev) => mapClearFrame(prev, frame));
    setDirty(true);

    isProgrammaticAnnoSyncRef.current = true;
    try {
      api?.cancelDrawing?.();
      api?.setSelected?.();
      api?.setAnnotations?.([], true);
    } finally {
      isProgrammaticAnnoSyncRef.current = false;
    }
  }, [api, flushPendingOverlay, frame]);

  const clearAllFrames = useCallback(() => {
    api?.setSelected?.();
    flushPendingOverlay();
    pendingFocusRef.current = null;

    setByFrame((prev) => mapClearAll(prev));
    setDirty(true);

    isProgrammaticAnnoSyncRef.current = true;
    try {
      api?.cancelDrawing?.();
      api?.setSelected?.();
      api?.setAnnotations?.([], true);
    } finally {
      isProgrammaticAnnoSyncRef.current = false;
    }
  }, [api, flushPendingOverlay]);

  useEffect(() => {
    const releaseShiftPan = () => {
      if (!shiftPanActiveRef.current) return;
      shiftPanActiveRef.current = false;
      setPanMode(panModeBeforeShiftRef.current);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      if (event.repeat) return;
      if (shiftPanActiveRef.current) return;
      if (isEditableEventTarget(event.target)) return;

      panModeBeforeShiftRef.current = panMode;
      shiftPanActiveRef.current = true;
      setPanMode(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      releaseShiftPan();
    };

    const onWindowBlur = () => {
      releaseShiftPan();
    };

    const onVisibilityChange = () => {
      if (!document.hidden) return;
      releaseShiftPan();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [panMode, setPanMode]);

  const applyAnnotatorInteractionMode = useCallback(() => {
    if (!api) return;

    const hasSelected = (api.getSelected?.() ?? []).length > 0;
    const canDraw = !panMode && Boolean(selection.className) && !hasSelected;
    api.setDrawingTool(drawingTool);
    api.setDrawingEnabled(canDraw);

    if (!canDraw) {
      api.cancelDrawing?.();
    }
  }, [api, drawingTool, panMode, selection.className]);

  const createNewInstanceForClass = useCallback((className: string) => {
    const cname = (className || "").trim();
    const trackId = allocateNextTrackId(nextTrackNumsRef.current, cname);

    setSelectionState({ className: cname, trackId, source: "auto" });
    return { className: cname, trackId };
  }, []);

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
        const shape = annoToVideoAnnotation(a, f);
        if (shape?.type === "video_bounding_box") out.push(shape);
      }
    }
    return out;
  }, [byFrame]);

  /** Convert the session overlays into backend video annotation shapes. */
  const collectAllVideoAnnotations = useCallback(() => {
    const out: VideoAnnotationShape[] = [];
    for (const [f, list] of byFrame.entries()) {
      for (const a of list ?? []) {
        const shape = annoToVideoAnnotation(a, f);
        if (shape) out.push(shape);
      }
    }
    return out;
  }, [byFrame]);

  /**
   * Seed session overlays from backend annotations if the user hasn't edited anything yet.
   * This is intentionally conservative:
   * - no-op if session is dirty
   * - no-op if we already have in-memory overlays
   * - only consumes supported video annotation entries
   */
  const seedFromDbIfEmpty = useCallback(
    (dbAnnotations: Annotation[]) => {
      if (dirty) return;
      if (byFrame.size > 0) return;
      if (!dbAnnotations || dbAnnotations.length === 0) return;

      const byF = new Map<number, ImageAnnotation[]>();

      let invalid = 0;

      for (const a of dbAnnotations) {
        const parsed =
          a.type === "video_bounding_box"
            ? VideoBoundingBoxSchema.safeParse(a)
            : a.type === "video_polygon"
              ? VideoPolygonSchema.safeParse(a)
              : null;

        if (!parsed) continue;

        if (!parsed.success) {
          invalid += 1;
          continue;
        }

        const dbAnno = parsed.data;
        const key = buildSourceKey({
          projectId,
          sampleId,
          frame: dbAnno.frame,
        });
        const anno =
          dbAnno.type === "video_bounding_box"
            ? videoBBoxToAnno(dbAnno as VideoBoundingBox, key)
            : videoPolygonToAnno(dbAnno as VideoPolygon, key);

        const cur = byF.get(dbAnno.frame) ?? [];
        cur.push(anno);
        byF.set(dbAnno.frame, cur);
      }

      if (invalid > 0) {
        console.warn(
          `[video] seedFromDbIfEmpty: skipped ${invalid} invalid video annotation(s) from backend.`,
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
      if (isProgrammaticAnnoSyncRef.current) return;

      // Some Annotorious events pass a single annotation (not an array).
      const raw = rawOverride ?? api.getAnnotations();

      // Enforce image bounds so shapes can't persist outside the frame.
      // In OSD mode, imageNatural can occasionally lag; fall back to viewer content size.
      const viewerNatural = (() => {
        const item = api.viewer?.world?.getItemAt?.(0);
        if (!item) return null;
        const size = item.getContentSize?.();
        const w = Math.round(Number(size?.x ?? 0));
        const h = Math.round(Number(size?.y ?? 0));
        if (!(w > 0 && h > 0)) return null;
        return { w, h };
      })();

      const clampNatural = imageNatural ?? viewerNatural;
      const clamped = clampOverlayToNaturalImage(raw, clampNatural);

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
        isProgrammaticAnnoSyncRef.current = true;
        try {
          api.setSelected?.();
          api.setAnnotations?.(normalized, true);
          applyAnnotatorInteractionMode();
        } finally {
          isProgrammaticAnnoSyncRef.current = false;
        }
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
      applyAnnotatorInteractionMode,
      setFrameList,
    ],
  );

  useEffect(() => {
    commitFromAnnotoriousRef.current = commitFromAnnotorious;
  }, [commitFromAnnotorious]);

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
   */
  const desiredOverlay = useMemo(
    () => byFrame.get(frame) ?? [],
    [byFrame, frame],
  );

  const overlayHasInstance = useCallback(
    (list: ImageAnnotation[], req: FocusRequest) => {
      const wantClass = (req.className || "").trim();
      const wantTrackId = canonicalizeTrackId(req.trackId || "");
      if (!wantClass || !wantTrackId) return false;

      return list.some((annotation) => {
        const got = getLabelTrack(annotation);
        return (
          (got.className ?? "").trim() === wantClass &&
          canonicalizeTrackId(got.trackId ?? "") === wantTrackId
        );
      });
    },
    [],
  );

  const selectAnnotationById = useCallback(
    (id: string) => {
      if (!id) return false;
      if (!api) return false;

      api.setSelected(id, true);
      return true;
    },
    [api],
  );

  const tryFocusPending = useCallback(
    (rawOverride?: ImageAnnotation[]) => {
      if (!api) return false;

      const pending = pendingFocusRef.current;
      if (!pending) return false;
      if (pending.targetFrame != null && frame !== pending.targetFrame) {
        return false;
      }

      const raw = rawOverride ?? api.getAnnotations();
      const hit = raw.find((annotation) => {
        const got = getLabelTrack(annotation);
        return (
          (got.className ?? "").trim() === pending.className &&
          canonicalizeTrackId(got.trackId ?? "") === pending.trackId
        );
      });

      if (!hit?.id) {
        if (
          pending.onlyIfOnCurrentFrame &&
          !overlayHasInstance(desiredOverlay, pending)
        ) {
          pendingFocusRef.current = null;
        }
        if (
          pending.targetFrame != null &&
          frame === pending.targetFrame &&
          !overlayHasInstance(desiredOverlay, pending)
        ) {
          pendingFocusRef.current = null;
        }
        return false;
      }

      if (!selectAnnotationById(hit.id)) return false;

      pendingFocusRef.current = null;
      return true;
    },
    [api, desiredOverlay, frame, overlayHasInstance, selectAnnotationById],
  );

  const requestFocusInstance = useCallback(
    (
      className: string,
      trackId: string,
      opts?: { onlyIfOnCurrentFrame?: boolean; targetFrame?: FrameIndex },
    ) => {
      const cls = (className || "").trim();
      const tid = canonicalizeTrackId(trackId || "");

      if (!cls || !tid) {
        pendingFocusRef.current = null;
        return;
      }

      pendingFocusRef.current = {
        className: cls,
        trackId: tid,
        onlyIfOnCurrentFrame: Boolean(opts?.onlyIfOnCurrentFrame),
        targetFrame:
          typeof opts?.targetFrame === "number" &&
          Number.isFinite(opts.targetFrame)
            ? opts.targetFrame
            : null,
      };
      setFocusNonce((n) => n + 1);
    },
    [],
  );

  // Required integration boundary: Annotorious keeps its own internal overlay
  // state, so we must push session state on frame/overlay changes.
  useEffect(() => {
    if (!api) return;

    let rafId: number | null = null;
    const cur = api.getAnnotations();
    if (sameOverlay(cur, desiredOverlay)) {
      applyAnnotatorInteractionMode();
      rafId = requestAnimationFrame(() => {
        tryFocusPending();
      });
      return () => {
        if (rafId != null) cancelAnimationFrame(rafId);
      };
    }

    isProgrammaticAnnoSyncRef.current = true;
    try {
      // Clear selection so popup closes when switching frames / overlays
      api.setSelected();
      api.setAnnotations(desiredOverlay, true);
      applyAnnotatorInteractionMode();
      rafId = requestAnimationFrame(() => {
        tryFocusPending();
      });
    } finally {
      isProgrammaticAnnoSyncRef.current = false;
    }
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [api, applyAnnotatorInteractionMode, desiredOverlay, tryFocusPending]);

  /**
   * Event wiring:
   * - create/update/delete all funnel through commitFromAnnotorious
   * - selectionChanged kept only for the "deselect commits" behavior
   */
  useEffect(() => {
    if (!api?.on || !api?.off || !api?.getAnnotations) return;

    const onClickAnnotation = (
      clicked: ImageAnnotation,
      _originalEvent: PointerEvent,
    ) => {
      if (isProgrammaticAnnoSyncRef.current) return;
      if (panMode) return;

      const id = clicked?.id;
      if (id) {
        api.setSelected(id, true);
      }

      const got = getLabelTrack(clicked);
      const className = (got.className ?? "").trim();
      const trackId = canonicalizeTrackId(got.trackId ?? "");
      if (className) {
        setSelectionState({
          className,
          trackId: trackId || null,
          source: "explicit",
        });
      }

      // While an annotation is selected, prioritize reshape/move over new drawing.
      api.cancelDrawing?.();
      api.setDrawingEnabled(false);
    };

    const onSelectionChanged = (arr: ImageAnnotation[]) => {
      if (isProgrammaticAnnoSyncRef.current) return;

      if (arr.length > 0) {
        if (!panMode) {
          const selected = arr[0];
          const got = getLabelTrack(selected);
          const className = (got.className ?? "").trim();
          const trackId = canonicalizeTrackId(got.trackId ?? "");

          if (className) {
            setSelectionState({
              className,
              trackId: trackId || null,
              source: "explicit",
            });
          }

          // While selected, keep drawing off so edit handles work predictably.
          api.cancelDrawing?.();
          api.setDrawingEnabled(false);
        }
        return;
      }

      if (arr.length === 0) {
        commitFromAnnotorious();
        setSelectionState((prev) =>
          prev.trackId ? { ...prev, trackId: null } : prev,
        );
        applyAnnotatorInteractionMode();
      }
    };

    const onCreate = (created: ImageAnnotation) => {
      if (isProgrammaticAnnoSyncRef.current) return;

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

      // Important: patch only the newly created annotation via updateAnnotation.
      // Avoid full clear/set rewrite during create, which can break OSD draw state.
      const patched = normalizeOverlayForSession({
        raw: [stampLabelAndTrack(created, cls, String(trackId))],
        frameKey,
        fallback: { className: cls, trackId: String(trackId) },
        enforceBothBodies: true,
        dedupeByInstance: false,
      })[0];

      if (patched?.id === createdId) {
        api.updateAnnotation?.(patched);
      } else {
        commitFromAnnotorious();
      }
      api.setSelected?.();
      applyAnnotatorInteractionMode();
    };

    const onUpdate = (
      _updated: ImageAnnotation,
      _previous: ImageAnnotation,
    ) => {
      commitFromAnnotorious();
      applyAnnotatorInteractionMode();
    };

    const onDelete = (_deleted: ImageAnnotation) => {
      commitFromAnnotorious();
    };

    api.on("clickAnnotation", onClickAnnotation);
    api.on("createAnnotation", onCreate);
    api.on("updateAnnotation", onUpdate);
    api.on("deleteAnnotation", onDelete);
    api.on("selectionChanged", onSelectionChanged);

    return () => {
      api.off("clickAnnotation", onClickAnnotation);
      api.off("createAnnotation", onCreate);
      api.off("updateAnnotation", onUpdate);
      api.off("deleteAnnotation", onDelete);
      api.off("selectionChanged", onSelectionChanged);
    };
  }, [
    api,
    applyAnnotatorInteractionMode,
    byFrame,
    commitFromAnnotorious,
    frameKey,
    panMode,
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

  useEffect(() => {
    if (focusNonce === 0) return;

    const rafId = requestAnimationFrame(() => {
      tryFocusPending();
    });

    return () => cancelAnimationFrame(rafId);
  }, [focusNonce, tryFocusPending]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      tryFocusPending();
    });

    return () => cancelAnimationFrame(rafId);
  }, [frame, tryFocusPending]);

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
      drawingTool,
      setDrawingTool,
      panMode,
      setPanMode,
      propagate,
      setPropagate,
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
      collectAllVideoAnnotations,
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
      drawingTool,
      setDrawingTool,
      panMode,
      setPanMode,
      propagate,
      setPropagate,
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
      collectAllVideoAnnotations,
      seedFromDbIfEmpty,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
