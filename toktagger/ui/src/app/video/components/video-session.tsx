/**
 * The video session, the core of the video view: the current frame, the byFrame cache, the
 * selection and drawing state. It keeps SampleContext, byFrame and Annotorious in step.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import {
  UserSelectAction,
  useAnnotator,
  type AnnotoriousOpenSeadragonAnnotator,
  type ImageAnnotation,
} from "@annotorious/react";

import type { Annotation, VideoFrameLabel, VideoPointInput } from "@/types";
import { useSample } from "@/app/contexts/SampleContext";
import { useVideoUiState } from "@/app/contexts/VideoContext";
import { VideoFrameLabelSchema, VideoShapeSchema } from "@/types";
import type {
  ActiveDrawingTool,
  ByFrameMap,
  FrameIndex,
  InstanceProfile,
  Selection,
} from "./types";
import { buildSourceKey } from "./types";
import {
  deleteTrackAcrossFrames,
  canonicalizeTrackId,
  deriveFrameLabelInstances,
  deriveInstances,
  existingFrameLabelTrackIdsForClass,
  forwardPropagateMissingManualAnnotations,
  mapClearAll,
  mapClearFrame,
  mapSetFrame,
  mergeInstanceProfiles,
  existingTrackIdsForClass,
  isEditableEventTarget,
  propagateMissingManualFrameLabels,
  uniqueReadableTrackId,
} from "./video-utils";
import {
  annoToVideoAnnotation,
  getLabelTrack,
  normalizeOverlay,
  videoBBoxToAnno,
  videoPointToAnno,
  videoPolygonToAnno,
  stampPoint,
  stampLabelAndTrack,
  toAnnotoriousDrawingTool,
} from "./anno-utils";
import {
  clampOverlayToNaturalImage,
  replaceAnnotoriousOverlay,
  sameOverlay,
} from "./overlay-sync-utils";

/** Everything the session shares through useVideoSession(). */
type VideoSessionCtx = {
  projectId: string;
  sampleId: string;

  frame: FrameIndex;

  /** Stable source key for the current frame (used as target.source on annotations). */
  frameKey: string;

  /** Per-frame editor cache derived from SampleContext annotations. */
  byFrame: ByFrameMap;

  /** The class label and track ID the next annotation will use. */
  selection: Selection;
  setSelection: (next: Selection) => void;

  /** One entry per instance (class label + track ID) across all frames, for the annotations table. */
  instances: InstanceProfile[];

  /** Whole-frame class labels applied to the current frame. */
  frameLabels: VideoFrameLabel[];
  /** Tag the current frame: adds a new instance, or toggles the armed one off/on. */
  toggleFrameLabel: () => void;
  removeFrameLabel: (className: string, trackId: string) => void;

  drawingTool: ActiveDrawingTool;
  setDrawingTool: (tool: ActiveDrawingTool) => void;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  drawIntent: boolean;
  canDrawShape: boolean;
  canDrawPoint: boolean;
  canTagFrame: boolean;
  propagate: boolean;
  setPropagate: (v: boolean) => void;
  hideAnnotations: boolean;
  setHideAnnotations: (v: boolean) => void;

  /** Reports the frame's natural image size, used to clamp shapes. */
  setImageNatural: (n: { w: number; h: number } | null) => void;

  /** Annotorious operations for components, so they never call its API directly. */
  createPointAnnotation: (point: { x: number; y: number }) => void;
  deleteAnnotation: (id: string) => void;
  closePopup: () => void;
  requestFocusInstance: (
    className: string,
    trackId: string,
    opts?: { onlyIfOnCurrentFrame?: boolean; targetFrame?: FrameIndex },
  ) => void;

  // frame ops
  /** Commit the current Annotorious overlay into SampleContext before frame navigation. */
  flushCurrentFrameOverlay: () => void;
  clearCurrentFrame: () => void;
  clearAllFrames: () => void;

  // instance ops
  /** Deletes an instance on every frame. Takes the instance directly rather than reading the selection. */
  deleteInstanceAcrossFrames: (className: string, trackId: string) => void;

  /** Delete a specific instance on the current frame only, leaving its other frames intact. */
  deleteInstanceOnCurrentFrame: (className: string, trackId: string) => void;

  /** Append missing manual instances from the current frame to the next frame in Edit mode. */
  forwardPropMissingManualToNext: (nextFrame: FrameIndex) => void;
};

const Ctx = createContext<VideoSessionCtx | null>(null);

type FocusRequest = {
  className: string;
  trackId: string;
  onlyIfOnCurrentFrame: boolean;
  targetFrame: FrameIndex | null;
};

// Events Annotorious fires during the sync are ignored, so the flag is only cleared on the next animation frame
function withProgrammaticSync(syncRef: RefObject<boolean>, fn: () => void) {
  syncRef.current = true;
  try {
    fn();
  } finally {
    requestAnimationFrame(() => {
      syncRef.current = false;
    });
  }
}

function readImageSize(
  api: AnnotoriousOpenSeadragonAnnotator,
): { w: number; h: number } | null {
  const item = api.viewer?.world?.getItemAt?.(0);
  if (!item) return null;
  const size = item.getContentSize?.();
  const w = Math.round(Number(size?.x ?? 0));
  const h = Math.round(Number(size?.y ?? 0));
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

/** The selection a shape stands for, or null when it has no class label. */
function selectionFromAnnotation(
  annotation: ImageAnnotation,
): Selection | null {
  const got = getLabelTrack(annotation);
  const className = (got.className ?? "").trim();
  if (!className) return null;
  return {
    className,
    trackId: canonicalizeTrackId(got.trackId ?? "") || null,
  };
}

function clearTrackId(selection: Selection): Selection {
  return selection.trackId ? { ...selection, trackId: null } : selection;
}

function videoAnnotationDedupeKey(annotation: Annotation): string | null {
  if (annotation.type === "video_frame_label") {
    const parsed = VideoFrameLabelSchema.safeParse(annotation);
    if (!parsed.success) return null;

    const { frame, label } = parsed.data;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return null;

    return `video_frame_label::${frame}::${trimmedLabel}`;
  }

  const parsed = VideoShapeSchema.safeParse(annotation);
  if (!parsed.success) return null;

  const item = parsed.data;
  const label = (item.label ?? "").trim();
  const trackId = canonicalizeTrackId(item.track_id ?? "");
  if (!label || !trackId) return null;

  return `${item.frame}::${label}::${trackId}`;
}

/** Drops repeated video annotations for the same frame and instance, keeping the last one. */
function dedupeVideoAnnotations(annotations: Annotation[]): {
  annotations: Annotation[];
  duplicates: number;
} {
  const nonVideoAnnotations: Annotation[] = [];
  const videoAnnotationsByKey = new Map<string, Annotation>();
  const videoKeys: string[] = [];
  let duplicates = 0;

  for (const annotation of annotations ?? []) {
    const key = videoAnnotationDedupeKey(annotation);
    if (!key) {
      nonVideoAnnotations.push(annotation);
      continue;
    }

    if (!videoAnnotationsByKey.has(key)) {
      videoKeys.push(key);
    } else {
      duplicates += 1;
    }

    // Last write wins, matching normalizeOverlay's per-frame instance behavior.
    videoAnnotationsByKey.set(key, annotation);
  }

  return {
    annotations: [
      ...nonVideoAnnotations,
      ...videoKeys
        .map((key) => videoAnnotationsByKey.get(key))
        .filter((annotation): annotation is Annotation => Boolean(annotation)),
    ],
    duplicates,
  };
}

/** A content fingerprint of the video annotations, used to tell our own writes apart from outside changes. */
function videoAnnotationSignature(annotations: Annotation[]): string {
  const entries: string[] = [];

  for (const annotation of annotations ?? []) {
    const parsed = VideoShapeSchema.safeParse(annotation);
    if (!parsed.success) continue;

    const item = parsed.data;
    if (item.type === "video_bounding_box") {
      entries.push(
        JSON.stringify({
          type: item.type,
          frame: item.frame,
          track_id: item.track_id,
          label: item.label,
          x_min: item.x_min,
          y_min: item.y_min,
          width: item.width,
          height: item.height,
          created_by: item.created_by,
          timestamp: item.timestamp,
        }),
      );
      continue;
    }

    if (item.type === "video_polygon") {
      entries.push(
        JSON.stringify({
          type: item.type,
          frame: item.frame,
          track_id: item.track_id,
          label: item.label,
          segmentation: item.segmentation,
          created_by: item.created_by,
          timestamp: item.timestamp,
        }),
      );
      continue;
    }

    if (item.type === "video_point") {
      entries.push(
        JSON.stringify({
          type: item.type,
          frame: item.frame,
          track_id: item.track_id,
          label: item.label,
          x: item.x,
          y: item.y,
          created_by: item.created_by,
          timestamp: item.timestamp,
        }),
      );
    }
  }

  return entries.sort().join("\n");
}

/** Builds the byFrame cache (Annotorious format) from the backend-format annotations. */
function videoAnnotationsToByFrame(args: {
  dbAnnotations: Annotation[];
  projectId: string;
  sampleId: string;
}): ByFrameMap {
  const byFrame = new Map<number, ImageAnnotation[]>();

  for (const annotation of args.dbAnnotations ?? []) {
    const parsed = VideoShapeSchema.safeParse(annotation);
    if (!parsed.success) continue;

    const dbAnno = parsed.data;
    const key = buildSourceKey({
      projectId: args.projectId,
      sampleId: args.sampleId,
      frame: dbAnno.frame,
    });

    let anno: ImageAnnotation | null = null;
    if (dbAnno.type === "video_bounding_box") {
      anno = videoBBoxToAnno(dbAnno, key);
    } else if (dbAnno.type === "video_polygon") {
      anno = videoPolygonToAnno(dbAnno, key);
    } else if (dbAnno.type === "video_point") {
      anno = videoPointToAnno(dbAnno, key);
    }
    if (!anno) continue;

    const cur = byFrame.get(dbAnno.frame) ?? [];
    cur.push(anno);
    byFrame.set(dbAnno.frame, cur);
  }

  return byFrame;
}

// Leaves out video_frame_label on purpose: frame labels live only in SampleContext, never in byFrame.
function isVideoAnnotationType(annotation: Annotation): boolean {
  return (
    annotation.type === "video_bounding_box" ||
    annotation.type === "video_polygon" ||
    annotation.type === "video_point"
  );
}

function parseFrameLabel(annotation: Annotation): VideoFrameLabel | null {
  if (annotation.type !== "video_frame_label") return null;

  const parsed = VideoFrameLabelSchema.safeParse(annotation);
  return parsed.success ? parsed.data : null;
}

/** True if `annotation` is the whole-frame label for this (className, trackId) instance. */
function frameLabelMatchesInstance(
  annotation: Annotation,
  className: string,
  trackId: string,
): boolean {
  const parsed = parseFrameLabel(annotation);
  if (!parsed) return false;

  return (
    parsed.label === className &&
    canonicalizeTrackId(parsed.track_id) === trackId
  );
}

function videoAnnotationsFromByFrame(byFrame: ByFrameMap): Annotation[] {
  const out: Annotation[] = [];

  for (const [frame, list] of byFrame.entries()) {
    for (const annotation of list ?? []) {
      const shape = annoToVideoAnnotation(annotation, frame);
      if (!shape) continue;

      const parsed = VideoShapeSchema.safeParse(shape);
      if (parsed.success) out.push(parsed.data);
    }
  }

  return out;
}

/** Swaps the video shapes in `annotations` for those in byFrame, keeping everything else. */
function replaceVideoAnnotations(
  annotations: Annotation[],
  byFrame: ByFrameMap,
): Annotation[] {
  return [
    ...(annotations ?? []).filter(
      (annotation) => !isVideoAnnotationType(annotation),
    ),
    ...videoAnnotationsFromByFrame(byFrame),
  ];
}

export function useVideoSession(): VideoSessionCtx {
  const v = useContext(Ctx);
  if (!v)
    throw new Error(
      "useVideoSession must be used within <VideoSessionProvider>",
    );
  return v;
}

/** Holds the session state and keeps SampleContext, byFrame and Annotorious in step. */
export function VideoSessionProvider(props: {
  projectId: string;
  sampleId: string;
  propagate: boolean;
  setPropagate: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const { projectId, sampleId, propagate, setPropagate, children } = props;
  const {
    data,
    dataParams,
    annotations,
    isLoading,
    setAnnotations: setSampleAnnotations,
  } = useSample();
  const {
    videoEditMode,
    setVideoEditMode,
    videoDrawingTool,
    setVideoDrawingTool,
  } = useVideoUiState();

  const api = useAnnotator<AnnotoriousOpenSeadragonAnnotator>();

  // True while we push annotations into Annotorious, so the events this triggers are not treated as user edits
  const isProgrammaticAnnoSyncRef = useRef(false);
  // Always the latest commitFromAnnotorious, for callbacks created before it last changed
  const commitFromAnnotoriousRef = useRef<
    (rawOverride?: ImageAnnotation[]) => void
  >(() => {});
  // An instance waiting to be selected once its frame's annotations are in Annotorious
  const pendingFocusRef = useRef<FocusRequest | null>(null);
  // The last outside change and our own last write, so the sync effect can tell them apart
  const lastExternalAnnotationSignatureRef = useRef<string | null>(null);
  const lastLocalAnnotationSignatureRef = useRef<string | null>(null);

  const [imageNatural, setImageNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const [videoFrame, setVideoFrame] = useState<number | null>(null);

  // For video we assume backend returns { frame: number, values: base64, ... }
  const frameFromBackend = useMemo(() => {
    if (!data) return 0;
    const maybe = data as { frame?: number };
    return maybe?.frame ?? 0;
  }, [data]);

  // Only move to a new frame once the backend has returned the image for the requested one
  useLayoutEffect(() => {
    if (!data) return;

    const dp = dataParams as {
      name?: string;
      frame?: number | null;
    };

    if (dp.name === "image" && dp.frame != null) {
      if (frameFromBackend !== dp.frame) return;
    }

    setVideoFrame(frameFromBackend);
  }, [data, dataParams, frameFromBackend]);

  const frame: FrameIndex = (videoFrame ?? frameFromBackend) as FrameIndex;

  const [byFrame, setByFrame] = useState<ByFrameMap>(() => new Map());
  // Refs mirror state so event handlers registered earlier still read the latest value
  const byFrameRef = useRef<ByFrameMap>(new Map());
  const annotationsRef = useRef<Annotation[]>(annotations);

  const [selection, setSelectionState] = useState<Selection>({
    className: null,
    trackId: null,
  });
  const [drawingTool, setDrawingToolState] =
    useState<ActiveDrawingTool>(videoDrawingTool);
  const [editMode, setEditModeState] = useState(videoEditMode);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [hideAnnotations, setHideAnnotationsState] = useState(false);
  const hideAnnotationsRef = useRef(false);

  const isFramePending =
    isLoading &&
    dataParams.name === "image" &&
    typeof dataParams.frame === "number" &&
    Number.isFinite(dataParams.frame) &&
    dataParams.frame !== frame;

  // Drawing needs edit mode with Ctrl held. The can* flags also need a tool and a class picked.
  const drawIntent = editMode && ctrlHeld && !hideAnnotations;
  const canCreate =
    drawIntent &&
    drawingTool !== null &&
    Boolean(selection.className) &&
    !isFramePending;
  const canDrawShape =
    canCreate && (drawingTool === "rectangle" || drawingTool === "polygon");
  const canDrawPoint = canCreate && drawingTool === "point";
  const canTagFrame = canCreate && drawingTool === "frame";
  const drawIntentRef = useRef(drawIntent);
  drawIntentRef.current = drawIntent;

  const setHideAnnotations = useCallback(
    (v: boolean) => {
      hideAnnotationsRef.current = v;
      setHideAnnotationsState(v);

      if (v) {
        api?.cancelDrawing?.();
        api?.setSelected?.();
        setCtrlHeld(false);
        setEditModeState(false);
        setVideoEditMode(false);
        setDrawingToolState(null);
        setVideoDrawingTool(null);
      }
    },
    [api, setVideoDrawingTool, setVideoEditMode],
  );

  const frameKey = useMemo(
    () => buildSourceKey({ projectId, sampleId, frame }),
    [projectId, sampleId, frame],
  );

  // Instances merge shapes and frame labels, since both share one track-id pool per class.
  const shapeInstances = useMemo(
    () => deriveInstances(byFrame, getLabelTrack),
    [byFrame],
  );
  const instances = useMemo(
    () =>
      mergeInstanceProfiles(
        shapeInstances,
        deriveFrameLabelInstances(annotations),
      ),
    [annotations, shapeInstances],
  );

  // Frame labels are plain context annotations, so they are derived straight from there.
  const frameLabels = useMemo(() => {
    const out: VideoFrameLabel[] = [];

    for (const annotation of annotations ?? []) {
      const parsed = parseFrameLabel(annotation);
      if (parsed?.frame === frame) out.push(parsed);
    }

    return out;
  }, [annotations, frame]);

  /** Track ids already used by a class, across both shapes and frame labels. */
  const collectUsedTrackIdsForClass = useCallback(
    (cls: string, raw?: ImageAnnotation[]) => {
      const used = new Set<string>();

      for (const tid of existingTrackIdsForClass(byFrameRef.current, cls)) {
        const c = canonicalizeTrackId(tid);
        if (c) used.add(c);
      }

      for (const tid of existingFrameLabelTrackIdsForClass(
        annotationsRef.current,
        cls,
      )) {
        if (tid) used.add(tid);
      }

      for (const annotation of raw ?? []) {
        const got = getLabelTrack(annotation);
        if ((got.className ?? "").trim() !== cls) continue;
        const tid = canonicalizeTrackId(got.trackId ?? "");
        if (tid) used.add(tid);
      }

      return used;
    },
    [],
  );

  const removeFrameLabel = useCallback(
    (className: string, trackId: string) => {
      const cls = (className || "").trim();
      const tid = canonicalizeTrackId(trackId || "");
      if (!cls || !tid) return;

      setSampleAnnotations((prev) =>
        prev.filter(
          (annotation) =>
            !(
              frameLabelMatchesInstance(annotation, cls, tid) &&
              parseFrameLabel(annotation)?.frame === frame
            ),
        ),
      );
    },
    [frame, setSampleAnnotations],
  );

  // Frame Label tool click: removes this class's label from the frame if it has one, otherwise adds one
  const toggleFrameLabel = useCallback(() => {
    const cls = (selection.className ?? "").trim();
    if (!cls) return;

    const trackId =
      selection.trackId ??
      uniqueReadableTrackId(collectUsedTrackIdsForClass(cls));

    const created = VideoFrameLabelSchema.safeParse({
      type: "video_frame_label",
      frame,
      track_id: trackId,
      label: cls,
      created_by: "manual",
    });
    if (!created.success) return;

    setSampleAnnotations((prev) => {
      const matchesCurrentClass = (annotation: Annotation) =>
        annotation.type === "video_frame_label" &&
        annotation.frame === frame &&
        annotation.label.trim() === cls;

      if (prev.some(matchesCurrentClass)) {
        return prev.filter((annotation) => !matchesCurrentClass(annotation));
      }

      return [...prev, created.data];
    });
  }, [
    collectUsedTrackIdsForClass,
    frame,
    selection.className,
    selection.trackId,
    setSampleAnnotations,
  ]);

  useEffect(() => {
    byFrameRef.current = byFrame;
  }, [byFrame]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Rebuilds byFrame when SampleContext changes from outside the session, e.g. an import
  useEffect(() => {
    const { annotations: dbAnnotations, duplicates } =
      dedupeVideoAnnotations(annotations);
    const signature = videoAnnotationSignature(dbAnnotations);

    // Write the de-duplicated list back so the duplicates are never saved
    if (duplicates > 0) {
      setSampleAnnotations(() => dbAnnotations);
    }

    if (signature === lastExternalAnnotationSignatureRef.current) return;
    // This change is our own write from commitByFrame, so byFrame is already up to date
    if (signature === lastLocalAnnotationSignatureRef.current) {
      lastExternalAnnotationSignatureRef.current = signature;
      return;
    }

    const nextByFrame = videoAnnotationsToByFrame({
      dbAnnotations,
      projectId,
      sampleId,
    });

    pendingFocusRef.current = null;
    byFrameRef.current = nextByFrame;
    setByFrame(nextByFrame);
    lastExternalAnnotationSignatureRef.current = signature;
    lastLocalAnnotationSignatureRef.current = null;
  }, [annotations, projectId, sampleId, setSampleAnnotations]);

  /** Writes byFrame and the matching video annotations in SampleContext. */
  const commitByFrame = useCallback(
    (next: ByFrameMap) => {
      byFrameRef.current = next;
      setByFrame(next);
      setSampleAnnotations((prev) => {
        const nextAnnotations = replaceVideoAnnotations(prev, next);
        lastLocalAnnotationSignatureRef.current =
          videoAnnotationSignature(nextAnnotations);
        return nextAnnotations;
      });
    },
    [setSampleAnnotations],
  );

  const updateByFrame = useCallback(
    (updater: (prev: ByFrameMap) => ByFrameMap) => {
      const prev = byFrameRef.current;
      const next = updater(prev);
      if (next === prev) return;
      commitByFrame(next);
    },
    [commitByFrame],
  );

  const setSelection = useCallback((next: Selection) => {
    setSelectionState(next);
  }, []);

  const flushPendingOverlay = useCallback(() => {
    if (isProgrammaticAnnoSyncRef.current) return;
    if (hideAnnotationsRef.current) return;
    const raw = api?.getAnnotations?.();
    if (!raw) return;
    commitFromAnnotoriousRef.current(raw);
  }, [api]);

  const flushCurrentFrameOverlay = useCallback(() => {
    // Deselecting first ends any edit in progress before we read the shapes
    api?.setSelected?.();
    flushPendingOverlay();
  }, [api, flushPendingOverlay]);

  const setDrawingTool = useCallback(
    (tool: ActiveDrawingTool) => {
      api?.cancelDrawing?.();
      api?.setSelected?.();
      flushPendingOverlay();
      setDrawingToolState(tool);
      setVideoDrawingTool(tool);
    },
    [api, flushPendingOverlay, setVideoDrawingTool],
  );

  const setEditMode = useCallback(
    (v: boolean) => {
      if (hideAnnotationsRef.current) return;
      api?.cancelDrawing?.();
      api?.setSelected?.();
      flushPendingOverlay();
      setCtrlHeld(false);
      setEditModeState(v);
      setVideoEditMode(v);
    },
    [api, flushPendingOverlay, setVideoEditMode],
  );

  // e toggles edit mode and holding Ctrl draws. Ctrl is released on blur so drawing never sticks.
  useEffect(() => {
    const releaseCtrl = () => {
      setCtrlHeld(false);
      api?.cancelDrawing?.();
      api?.viewer?.setMouseNavEnabled(true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;

      if (event.key === "Control") {
        if (event.repeat) return;
        // Commit an in-progress edit first so the overlay sync doesn't revert it.
        if (editMode) flushCurrentFrameOverlay();
        setCtrlHeld(true);
        return;
      }

      if (
        event.key.toLowerCase() === "e" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !hideAnnotationsRef.current
      ) {
        setEditMode(!editMode);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") releaseCtrl();
    };

    const onVisibilityChange = () => {
      if (document.hidden) releaseCtrl();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseCtrl);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseCtrl);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [api, editMode, flushCurrentFrameOverlay, setEditMode]);

  const clearFrames = useCallback(
    (which: "current" | "all") => {
      api?.setSelected?.();
      flushPendingOverlay();
      pendingFocusRef.current = null;

      updateByFrame((prev) =>
        which === "current" ? mapClearFrame(prev, frame) : mapClearAll(prev),
      );
      setSampleAnnotations((prev) =>
        prev.filter((annotation) =>
          which === "current"
            ? parseFrameLabel(annotation)?.frame !== frame
            : !parseFrameLabel(annotation),
        ),
      );

      withProgrammaticSync(isProgrammaticAnnoSyncRef, () => {
        api?.cancelDrawing?.();
        api?.setSelected?.();
        api?.setAnnotations?.([], true);
      });
    },
    [api, flushPendingOverlay, frame, setSampleAnnotations, updateByFrame],
  );

  const clearCurrentFrame = useCallback(
    () => clearFrames("current"),
    [clearFrames],
  );
  const clearAllFrames = useCallback(() => clearFrames("all"), [clearFrames]);

  /** Tells Annotorious what clicks do (select, edit or nothing) and whether drawing is on. */
  const applyAnnotatorInteractionMode = useCallback(() => {
    if (!api) return;

    api.setUserSelectAction(
      hideAnnotations || drawIntent
        ? UserSelectAction.NONE
        : editMode
          ? UserSelectAction.EDIT
          : UserSelectAction.SELECT,
    );

    if (drawingTool) {
      api.setDrawingTool(toAnnotoriousDrawingTool(drawingTool));
    }

    if (drawIntent) {
      api.setSelected?.();
    }

    api.setDrawingEnabled(canDrawShape);

    if (!canDrawShape) {
      api.cancelDrawing?.();
    }

    // Stop OpenSeadragon panning on click while placing points or frame labels
    if (api.viewer && (canDrawPoint || canTagFrame)) {
      api.viewer.setMouseNavEnabled(false);
    } else if (api.viewer && !canDrawShape) {
      api.viewer.setMouseNavEnabled(true);
    }
  }, [
    api,
    canDrawPoint,
    canDrawShape,
    canTagFrame,
    drawIntent,
    drawingTool,
    editMode,
    hideAnnotations,
  ]);

  const deleteInstanceAcrossFrames = useCallback(
    (className: string, trackId: string) => {
      const cls = (className || "").trim();
      const tid = canonicalizeTrackId(trackId || "");
      if (!cls || !tid) return;

      updateByFrame((prev) =>
        deleteTrackAcrossFrames(
          prev,
          { className: cls, trackId: tid },
          getLabelTrack,
        ),
      );
      setSampleAnnotations((prev) =>
        prev.filter(
          (annotation) => !frameLabelMatchesInstance(annotation, cls, tid),
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
    },
    [setSampleAnnotations, updateByFrame],
  );

  const deleteInstanceOnCurrentFrame = useCallback(
    (className: string, trackId: string) => {
      const cls = (className || "").trim();
      const tid = canonicalizeTrackId(trackId || "");
      if (!cls || !tid) return;

      updateByFrame((prev) =>
        mapSetFrame(
          prev,
          frame,
          (prev.get(frame) ?? []).filter((annotation) => {
            const got = getLabelTrack(annotation);
            return !(
              (got.className ?? "").trim() === cls &&
              canonicalizeTrackId(got.trackId ?? "") === tid
            );
          }),
        ),
      );
      removeFrameLabel(cls, tid);
    },
    [frame, removeFrameLabel, updateByFrame],
  );

  /** Append missing manual instances from the current frame to `nextFrame` in Edit mode. */
  const forwardPropMissingManualToNext = useCallback(
    (nextFrame: FrameIndex) => {
      if (!editMode) return;

      updateByFrame((prev) =>
        forwardPropagateMissingManualAnnotations(prev, frame, nextFrame, {
          projectId,
          sampleId,
        }),
      );

      const nextAnnotations = propagateMissingManualFrameLabels(
        annotations,
        frame,
        nextFrame,
      );
      if (nextAnnotations !== annotations) {
        setSampleAnnotations((prev) =>
          propagateMissingManualFrameLabels(prev, frame, nextFrame),
        );
      }
    },
    [
      annotations,
      frame,
      editMode,
      projectId,
      sampleId,
      setSampleAnnotations,
      updateByFrame,
    ],
  );

  // Annotorious has no point tool, so points are built here and pushed in directly
  const createPointAnnotation = useCallback(
    (point: { x: number; y: number }) => {
      if (!api?.getAnnotations) return;

      const cls = (selection.className ?? "").trim();
      if (!cls) return;

      const rawX = Number(point.x);
      const rawY = Number(point.y);
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;

      const natural = imageNatural ?? readImageSize(api);
      const x = natural
        ? Math.max(0, Math.min(natural.w - 1, Math.floor(rawX)))
        : Math.floor(rawX);
      const y = natural
        ? Math.max(0, Math.min(natural.h - 1, Math.floor(rawY)))
        : Math.floor(rawY);

      const raw = api.getAnnotations();
      const used = collectUsedTrackIdsForClass(cls, raw);

      const trackId = selection.trackId ?? uniqueReadableTrackId(used);
      const dbPoint: VideoPointInput = {
        type: "video_point",
        frame,
        track_id: String(trackId),
        label: cls,
        x,
        y,
        created_by: "manual",
      };
      const pointAnnotation = videoPointToAnno(dbPoint, frameKey);
      const normalized = normalizeOverlay([...raw, pointAnnotation], frameKey, {
        className: cls,
        trackId: String(trackId),
      });

      updateByFrame((prevByFrame) =>
        mapSetFrame(prevByFrame, frame, normalized),
      );

      withProgrammaticSync(isProgrammaticAnnoSyncRef, () => {
        api.cancelDrawing?.();
        api.setSelected?.();
        replaceAnnotoriousOverlay(api, normalized);
        applyAnnotatorInteractionMode();
      });
    },
    [
      api,
      applyAnnotatorInteractionMode,
      collectUsedTrackIdsForClass,
      frame,
      frameKey,
      imageNatural,
      selection.className,
      selection.trackId,
      updateByFrame,
    ],
  );

  /** Saves the frame's shapes from Annotorious: clamps them, fills in labels and track IDs, then writes byFrame. */
  const commitFromAnnotorious = useCallback(
    (rawOverride?: ImageAnnotation[]) => {
      if (!api?.getAnnotations) return;
      if (isProgrammaticAnnoSyncRef.current) return;
      if (hideAnnotationsRef.current) return;

      // Use the caller's list when given, e.g. one with a newly created shape already patched
      const raw = rawOverride ?? api.getAnnotations();

      // Keep shapes inside the image. imageNatural can lag behind a new frame, so fall back to the viewer.
      const clampNatural = imageNatural ?? readImageSize(api);
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

      // With no track selected, shapes missing a track ID each get a new readable one
      const allocTrackId = fallbackTrackId
        ? undefined
        : (() => {
            const usedByClass = new Map<string, Set<string>>();

            return (className: string) => {
              const c = (className || "").trim() || "UFO";

              let used = usedByClass.get(c);
              if (!used) {
                used = collectUsedTrackIdsForClass(c);
                usedByClass.set(c, used);
              }

              const next = uniqueReadableTrackId(used);
              used.add(canonicalizeTrackId(next));
              return next;
            };
          })();

      const normalized = normalizeOverlay(
        clamped,
        frameKey,
        { className: cls, trackId: fallbackTrackId },
        allocTrackId,
      );

      // If clamping or labelling changed anything, show the corrected shapes in Annotorious too
      if (!sameOverlay(raw, normalized)) {
        withProgrammaticSync(isProgrammaticAnnoSyncRef, () => {
          const rawById = new Map(
            raw
              .filter((annotation) => annotation.id)
              .map((annotation) => [String(annotation.id), annotation]),
          );
          const canPatchInPlace =
            Boolean(api.updateAnnotation) &&
            raw.length === normalized.length &&
            normalized.every((annotation) =>
              annotation.id ? rawById.has(String(annotation.id)) : false,
            );

          // Patch shapes in place when possible, as replacing the whole overlay can disrupt drawing
          if (canPatchInPlace) {
            for (const annotation of normalized) {
              const prev = rawById.get(String(annotation.id));
              if (!prev || sameOverlay([prev], [annotation])) continue;
              api.updateAnnotation?.(annotation);
            }
          } else {
            api.setSelected?.();
            replaceAnnotoriousOverlay(api, normalized);
          }

          applyAnnotatorInteractionMode();
        });
      }

      // Persist normalized overlay for this frame in the session store.
      const prev = byFrame.get(frame) ?? [];
      if (!sameOverlay(prev, normalized)) {
        updateByFrame((prevByFrame) =>
          mapSetFrame(prevByFrame, frame, normalized),
        );
      }
    },
    [
      api,
      byFrame,
      collectUsedTrackIdsForClass,
      frame,
      frameKey,
      imageNatural,
      selection.className,
      selection.trackId,
      applyAnnotatorInteractionMode,
      updateByFrame,
    ],
  );

  useEffect(() => {
    commitFromAnnotoriousRef.current = commitFromAnnotorious;
  }, [commitFromAnnotorious]);

  // What Annotorious should show: the current frame's shapes, or nothing while annotations are hidden
  const desiredOverlay = useMemo(() => {
    if (hideAnnotations) return [];
    return byFrame.get(frame) ?? [];
  }, [byFrame, frame, hideAnnotations]);

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

      api.setSelected(id, editMode);
      return true;
    },
    [api, editMode],
  );

  /** Selects the pending instance once it is in Annotorious, or drops the request if it never will be. */
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

  /** Asks for an instance to be selected. This happens later, once its frame's shapes are in Annotorious. */
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

  // Annotorious keeps its own copy of the shapes, so push the frame's list in whenever it changes
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

    withProgrammaticSync(isProgrammaticAnnoSyncRef, () => {
      // Clear selection so popup closes when switching frames / overlays
      api.setSelected();
      replaceAnnotoriousOverlay(api, desiredOverlay);
      applyAnnotatorInteractionMode();
      rafId = requestAnimationFrame(() => {
        tryFocusPending();
      });
    });
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [api, applyAnnotatorInteractionMode, desiredOverlay, tryFocusPending]);

  // Annotorious events: create, update, delete and deselect all save through commitFromAnnotorious
  useEffect(() => {
    if (!api?.on || !api?.off || !api?.getAnnotations) return;

    const onClickAnnotation = (
      clicked: ImageAnnotation,
      _originalEvent: PointerEvent,
    ) => {
      if (isProgrammaticAnnoSyncRef.current) return;
      if (hideAnnotations) return;
      if (drawIntentRef.current) return;

      const id = clicked?.id;
      if (id) {
        api.setSelected(id, editMode);
      }

      const next = selectionFromAnnotation(clicked);
      if (next) setSelectionState(next);
    };

    const onSelectionChanged = (arr: ImageAnnotation[]) => {
      if (isProgrammaticAnnoSyncRef.current) return;

      if (drawIntentRef.current && arr.length > 0) {
        api.setSelected?.();
        return;
      }

      if (arr.length > 0) {
        if (!hideAnnotations) {
          const next = selectionFromAnnotation(arr[0]);
          if (next) setSelectionState(next);
        }
        return;
      }

      if (arr.length === 0) {
        if (hideAnnotations) {
          setSelectionState(clearTrackId);
          applyAnnotatorInteractionMode();
          return;
        }

        commitFromAnnotorious();
        setSelectionState(clearTrackId);
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
      const used = collectUsedTrackIdsForClass(cls, raw);

      let trackId = selection.trackId ?? null;
      if (!trackId) {
        trackId = uniqueReadableTrackId(used);
      }

      // Patch only the new shape: replacing the whole overlay mid-create can break OpenSeadragon's drawing
      const createdForTool =
        drawingTool === "point" ? stampPoint(created) : created;
      const patched = normalizeOverlay(
        [stampLabelAndTrack(createdForTool, cls, String(trackId))],
        frameKey,
        { className: cls, trackId: String(trackId) },
        undefined,
        { dedupeByInstance: false },
      )[0];

      if (patched?.id === createdId) {
        api.updateAnnotation?.(patched);
        const nextRaw = raw.map((annotation) =>
          annotation.id === createdId ? patched : annotation,
        );
        commitFromAnnotorious(nextRaw);
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
    collectUsedTrackIdsForClass,
    commitFromAnnotorious,
    drawingTool,
    frameKey,
    hideAnnotations,
    editMode,
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

  // Retry a pending focus after each new request and frame change, a frame later so Annotorious has the shapes
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
      frameKey,
      byFrame,
      selection,
      setSelection,
      instances,
      frameLabels,
      toggleFrameLabel,
      removeFrameLabel,
      drawingTool,
      setDrawingTool,
      editMode,
      setEditMode,
      drawIntent,
      canDrawShape,
      canDrawPoint,
      canTagFrame,
      propagate,
      setPropagate,
      hideAnnotations,
      setHideAnnotations,
      setImageNatural,
      createPointAnnotation,
      deleteAnnotation,
      closePopup,
      requestFocusInstance,
      flushCurrentFrameOverlay,
      clearCurrentFrame,
      clearAllFrames,
      deleteInstanceAcrossFrames,
      deleteInstanceOnCurrentFrame,
      forwardPropMissingManualToNext,
    }),
    [
      projectId,
      sampleId,
      frame,
      frameKey,
      byFrame,
      selection,
      setSelection,
      instances,
      frameLabels,
      toggleFrameLabel,
      removeFrameLabel,
      drawingTool,
      setDrawingTool,
      editMode,
      setEditMode,
      drawIntent,
      canDrawShape,
      canDrawPoint,
      canTagFrame,
      propagate,
      setPropagate,
      hideAnnotations,
      setHideAnnotations,
      setImageNatural,
      createPointAnnotation,
      deleteAnnotation,
      closePopup,
      requestFocusInstance,
      flushCurrentFrameOverlay,
      clearCurrentFrame,
      clearAllFrames,
      deleteInstanceAcrossFrames,
      deleteInstanceOnCurrentFrame,
      forwardPropMissingManualToNext,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
