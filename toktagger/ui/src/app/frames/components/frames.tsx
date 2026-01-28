"use client";
// UFO frame annotator view: integrates Annotorious, per-frame storage,
// toolbar window.* integration, navigation, and bulk-delete / clear flows.
import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  Annotorious,
  ImageAnnotator,
  ImageAnnotationPopup,
  type ImageAnnotation,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import type { Annotation, DataParams, ImageData } from "@/types";
import { SearchField, Button, ButtonGroup } from "@adobe/react-spectrum";
import "react-contexify/ReactContexify.css";

import { AnnoBridge, type BridgeHandle } from "./bridge";
import {
  W3CImageFormat,
  buildSourceKey,
  clearW3CForSample,
  isVideoWorkingDirty,
  sampleFramePrefix,
  setVideoWorkingDirty,
} from "./adapters";
import {
  loadClassRegistry,
  type ClassRegistry,
  LABEL_MAP,
  FIXED_CLASS_REG,
  canonicalizeTrackId,
  uniqueReadableId,
  saveLastClassName,
  extractClassLabel,
  videoBBoxesToW3CByFrame,
} from "./lib";
import { Toast, ClassInfoPopup, ConfirmModal } from "./ui";

/**
 * InstanceProfile
 * UI-level "instance row" for the toolbar:
 * - class_name/class_id describe the category
 * - track_id is the per-object identity across frames
 * - id is a stable composite key (class_name + track_id)
 */
type InstanceProfile = {
  id: string;
  class_name: string;
  class_id: number;
  track_id: string;
};

/**
 * SelectedProfile
 * "Currently armed instance" from the toolbar. When present, new rectangles
 * get stamped with this exact (class_id/class_name/track_id).
 */
type SelectedProfile = {
  class_id?: number;
  class_name?: string;
  track_id?: string;
} | null;

/**
 * BulkDeleteRequestDetail
 * Payload sent by the toolbar via a CustomEvent("ufo:requestBulkDelete").
 */
type BulkDeleteRequestDetail = {
  profile?: { class_name?: string; track_id?: string };
};

/**
 * Minimal runtime check used when we read annotations from localStorage.
 * (We only require an id string; other fields are trusted by downstream code.)
 */
function isImageAnnotation(v: unknown): v is ImageAnnotation {
  return (
    !!v &&
    typeof v === "object" &&
    "id" in v &&
    typeof (v as { id: unknown }).id === "string"
  );
}

/** Cheap deep clone for localStorage payloads / forward propagation. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * window.* "contract" between:
 * - the left toolbar (global UI)
 * - the per-frame annotator view (this file)
 *
 * This is intentionally simple/imperative so the toolbar can be decoupled from
 * Annotorious internals (AnnoBridge exposes the "real" annotator hooks).
 */
declare global {
  interface Window {
    // Called by toolbar whenever selection changes (forces FrameView to re-read window.*)
    ufoNotifySelectionChanged?: () => void;

    // Toolbar-owned state: list of known instances and which one is selected
    ufoInstanceProfiles?: InstanceProfile[];
    ufoSelectedProfileId?: string | null;
    ufoSelectedClassName?: string | null; // armed class even if no instance
    ufoSelectedTrackId?: string | null;
    ufoSelectionSource?: "auto" | "explicit" | null; // used to preserve explicit selection across navigation

    // Exposed by FrameView/AnnoBridge so toolbar can show "unsaved" state
    ufoHasUnsavedChanges?: () => boolean;
    ufoMarkSaved?: () => void;

    // Exposed by FrameView so toolbar can collect all frames for backend save
    ufoCollectForSave?: () => Promise<unknown>;
    ufoClearCurrent?: () => Promise<void>;
    ufoClearAllFrames?: () => Promise<void>;
  }
}

/**
 * Simple "jump to frame N" control.
 * User types a frame number, we validate and call onJump(n).
 */
export function FrameSearch({ onJump }: { onJump: (n: number) => void }) {
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Validate user input (non-empty integer >= 0), then forward to the parent.
  const onSearchSubmit = (newValue: string) => {
    if (newValue === "") {
      setErrorMessage("");
      return;
    }

    const n = Number(newValue);

    if (Number.isInteger(n) && n >= 0) {
      setErrorMessage("");
      onJump(n);
      return;
    }

    setErrorMessage("Please enter a number.");
  };

  return (
    <SearchField
      aria-label="Jump to Frame"
      onSubmit={onSearchSubmit}
      validationState={errorMessage ? "invalid" : undefined}
      errorMessage={errorMessage}
    />
  );
}

/**
 * FrameView
 *
 * Core UFO frame annotator:
 * - Renders a single frame image inside Annotorious (rectangle-only for now).
 * - Persists per-frame annotations to localStorage via W3CImageFormat.
 * - Coordinates Prev/Next/Jump navigation with upstream callbacks.
 * - Integrates with the UFO toolbar via window.* helpers and "ufo:*" events.
 * - Supports bulk delete / clear flows across all frames in a sample.
 *
 * IMPORTANT:
 * - The "source of truth" during an annotation session is localStorage (per frame).
 * - Backend annotations are used only for the initial seeding step.
 */
export function FrameView({
  data,
  projectId,
  sampleId,
  dbAnnotations,
  onPrev,
  onNext,
  onJump,
}: {
  data: ImageData;
  projectId: string;
  sampleId: string;
  dbAnnotations: Annotation[];
  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
}) {
  /**
   * AnnoBridge is our imperative adapter around Annotorious.
   * We store its handle in a ref so we can call:
   * - hydrateOverlay / clearOverlaySilently
   * - persistWorkingNow
   * - hasUnsaved / markSaved
   */
  const bridgeRef = useRef<BridgeHandle | null>(null);

  /**
   * Increment this whenever the toolbar changes the selected instance
   * so drawingEnabled can react to the latest window.* selection.
   *
   * (We don't store selection in React state; window.* is the shared "bus".)
   */
  const [, setSelectionTick] = useState(0);

  // Local toast for small UX feedback (quick-add, delete, bulk operations).
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastOpen(true);

    setTimeout(() => setToastOpen(false), 2000);
  }, []);

  /**
   * Hook toolbar -> FrameView re-render:
   * Toolbar calls window.ufoNotifySelectionChanged(), which bumps selectionTick.
   * That forces drawingEnabled and other window reads to update.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoNotifySelectionChanged = () => {
      setSelectionTick((tick) => tick + 1);
    };

    return () => {
      delete window.ufoNotifySelectionChanged;
    };
  }, []);

  /**
   * Read the currently selected instance profile from window state.
   * - SelectedProfileId points into window.ufoInstanceProfiles.
   * - Returning null means "no instance selected".
   */
  const getSelectedProfile = useCallback((): SelectedProfile => {
    if (typeof window === "undefined") return null;

    const selectedId = window.ufoSelectedProfileId ?? null;
    const list = window.ufoInstanceProfiles ?? [];

    if (!selectedId) return null;
    const found = list.find((p) => p.id === selectedId);
    return found ?? null;
  }, []);

  /**
   * Read the currently armed class name from window.
   * This supports "drawing enabled" even when the instance list is empty.
   */
  const getSelectedClassName = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return window.ufoSelectedClassName ?? null;
  }, []);

  /**
   * Tracking mode: for UFO we always write track IDs so instances persist
   * across frames. (This determines how normalizeWithMode behaves in AnnoBridge.)
   */
  const includeTrackIds = true;

  /**
   * classRegistry is a persisted mapping shared with toolbar (localStorage).
   * Used when we need to infer numeric class_id from a selected class name.
   */
  const classRegistry: ClassRegistry = useMemo(() => loadClassRegistry(), []);

  /**
   * User can draw only when they have a class "armed":
   * - either they selected an existing instance (profile)
   * - or they picked a class name to create the first instance
   */
  const drawingEnabled = !!getSelectedProfile() || !!getSelectedClassName();

  const frameNumber = data.frame;
  const frameLabel = Number.isFinite(frameNumber) ? frameNumber : "?";

  /**
   * frameKey is the canonical W3C "target.source" for this frame:
   *   app://p/<projectId>/s/<sampleId>/f/<frameNumber>
   *
   * It is also used as the localStorage key prefix (via W3CImageFormat adapter).
   */
  const frameKey = useMemo(
    () =>
      buildSourceKey({
        projectId,
        sampleId,
        frame: frameNumber,
      }),
    [projectId, sampleId, frameNumber],
  );

  /**
   * adapter abstracts localStorage IO for the current frame.
   * - read(): returns ImageAnnotation[] for this frame
   * - write(list): persists ImageAnnotation[] for this frame
   */
  const adapter = useMemo(() => W3CImageFormat(frameKey), [frameKey]);

  // List of annotations for this frame used by ClassInfoPopup (popup needs full list).
  const [popupList, setPopupList] = useState<ImageAnnotation[]>([]);

  // Tracks whether an instance has become empty across all frames,
  // so we can prompt to delete the instance profile (instance list hygiene).
  const [emptyInstanceModalOpen, setEmptyInstanceModalOpen] = useState(false);
  const [emptyInstanceProfile, setEmptyInstanceProfile] = useState<{
    class_name?: string;
    track_id?: string;
  } | null>(null);

  // Per-instance bulk delete modal state (delete one track across all frames).
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalProfile, setDeleteModalProfile] = useState<{
    class_name?: string;
    track_id?: string;
  } | null>(null);
  const [deletePreviewCounts, setDeletePreviewCounts] = useState<{
    total: number;
    frames: number;
  } | null>(null);

  // Global delete-all modal and preview state (wipe the sample's local annotations).
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [deleteAllPreview, setDeleteAllPreview] = useState<{
    totalAnnotations: number;
    totalInstances: number;
    totalFrames: number;
  } | null>(null);

  // --- Responsive upscale measurement state (for small frames like MAST) ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [containerW, setContainerW] = useState<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Seed once immediately (avoids 0 width if ResizeObserver fires late)
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

    const TARGET = 900; // "comfortable" tagging width for small frames
    const MAX_SCALE = 3; // don't upscale more than 3× natural

    // Before image loads, just fit available width.
    if (!natural?.w) return containerW;

    // For already-large images: keep previous behavior (fit container, no forced cap).
    if (natural.w >= TARGET) return Math.min(containerW, natural.w);

    // For small images: upscale toward TARGET but respect container and MAX_SCALE.
    const fit = Math.min(containerW, natural.w); // never exceed container
    const up = Math.min(containerW, TARGET, natural.w * MAX_SCALE);

    // Pick whichever is larger (i.e., upscale when possible, otherwise fit).
    return Math.max(fit, up);
  }, [containerW, natural]);

  /**
   * Refresh behavior safety:
   * If the user hard-reloads the browser tab, we clear local cached frames and
   * reset the "dirty" flag so we seed from backend again.
   *
   * (This avoids confusion where stale localStorage dominates after a reload.)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined;

    const navType = nav?.type;

    if (navType === "reload") {
      clearW3CForSample(projectId, sampleId);
      setVideoWorkingDirty(projectId, sampleId, false);
    }
  }, [projectId, sampleId]);

  /**
   * Bootstrap the toolbar "instance list" from whatever is currently in localStorage.
   * This scans all stored frames for the sample, extracts (class_name, track_id),
   * and rebuilds window.ufoInstanceProfiles + emits a "ufo:state" event for toolbar.
   */
  const bootstrapInstancesFromStorage = useCallback(async () => {
    if (typeof window === "undefined") return;

    const storage = window.localStorage;
    const prefix = sampleFramePrefix(projectId, sampleId);

    const all: ImageAnnotation[] = [];

    // Collect all annotations across frames (only within this sample prefix).
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;

      const raw = storage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const ann of parsed) {
            if (isImageAnnotation(ann)) all.push(ann);
          }
        }
      } catch {
        // ignore malformed entries
      }
    }

    // Derive unique instance profiles from extracted labels.
    const map = new Map<string, InstanceProfile>();
    for (const ann of all) {
      const lbl = extractClassLabel(ann);
      if (!lbl?.class_name || !lbl.track_id) continue;

      const class_name = lbl.class_name;
      const class_id =
        typeof lbl.class_id === "number" && Number.isFinite(lbl.class_id)
          ? lbl.class_id
          : (FIXED_CLASS_REG[class_name.toLowerCase()] ?? 1);

      const track_id = canonicalizeTrackId(lbl.track_id);
      const id = `${class_name}:${track_id}`;

      if (!map.has(id)) {
        map.set(id, { id, class_name, class_id, track_id });
      }
    }

    const profiles = Array.from(map.values());

    // Update window + notify toolbar
    window.ufoInstanceProfiles = profiles;

    // Toolbar expects a simple name->id map for class id lookups.
    const classRegistryWire: Record<string, number> = {};
    for (const def of Object.values(classRegistry)) {
      const n = Number(def.id);
      classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
    }

    // ufo:state is the toolbar's "single source" event to refresh its UI.
    window.dispatchEvent(
      new CustomEvent("ufo:state", {
        detail: {
          includeTrackIds: true,
          profiles: profiles.map((p) => ({
            class_name: p.class_name,
            class_id: p.class_id,
            track_id: p.track_id,
          })),
          selectedKey: null,
          selectedClassName: window.ufoSelectedClassName ?? null,
          lastClassName: window.ufoSelectedClassName ?? null,
          classRegistry: classRegistryWire,
        },
      }),
    );
  }, [projectId, sampleId, classRegistry]);

  // Build instance list from localStorage on mount (and when ids change).
  useEffect(() => {
    void bootstrapInstancesFromStorage();
  }, [bootstrapInstancesFromStorage]);

  /**
   * Seed localStorage from backend annotations if needed.
   *
   * Rules:
   * - If localStorage is marked "dirty" (user has started editing), do nothing.
   * - Otherwise:
   *   1) clear per-frame cache
   *   2) convert backend VideoBoundingBox[] -> W3C ImageAnnotation[] by frame
   *   3) write each frame to localStorage
   *   4) hydrate the current frame overlay immediately
   *   5) rebuild instance list from seeded storage
   */
  useEffect(() => {
    let cancelled = false;

    const seedFromBackendIfNeeded = async () => {
      if (typeof window === "undefined") return;

      // If user has an in-progress local session, do NOT overwrite it.
      if (isVideoWorkingDirty(projectId, sampleId)) return;

      // Clear any leftover per-frame cache to avoid conflicts
      clearW3CForSample(projectId, sampleId);

      // Convert db → W3C grouped by frame
      const byFrame = videoBBoxesToW3CByFrame({
        projectId,
        sampleId,
        annotations: dbAnnotations as unknown[],
      });

      // Write to localStorage per frame so the per-frame adapter can load it
      for (const [frame, list] of byFrame.entries()) {
        const key = buildSourceKey({ projectId, sampleId, frame });
        const a = W3CImageFormat(key);
        await a.write(list);
      }

      if (cancelled) return;

      // Hydrate current frame overlay immediately (so user sees boxes on first visit)
      const listForCurrent = byFrame.get(frameNumber) ?? [];
      if (listForCurrent.length > 0) {
        setPopupList(listForCurrent);

        // Annotorious may not be ready yet; retry until it is.
        const attemptHydrate = async () => {
          if (cancelled) return;
          const ready = bridgeRef.current?.isAnnotatorReady?.() ?? false;
          if (!ready) {
            setTimeout(attemptHydrate, 32);
            return;
          }
          await bridgeRef.current?.hydrateOverlay?.(listForCurrent, frameKey);
        };

        void attemptHydrate();
      }

      // Populate Instances list from seeded storage
      await bootstrapInstancesFromStorage();
    };

    void seedFromBackendIfNeeded();

    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    sampleId,
    dbAnnotations,
    frameNumber,
    frameKey,
    bootstrapInstancesFromStorage,
  ]);

  /**
   * Hydrate overlay from localStorage when the annotator is ready.
   * This runs on frameKey change, so navigation loads the correct frame overlay.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = await adapter.read();
      if (cancelled || !stored || stored.length === 0) return;

      // Keep popup list aligned with the overlay that will be shown.
      setPopupList(stored as ImageAnnotation[]);

      // Annotorious may not be ready; retry until it is.
      const attemptHydrate = async () => {
        if (cancelled) return;
        const ready = bridgeRef.current?.isAnnotatorReady?.() ?? false;
        if (!ready) {
          setTimeout(attemptHydrate, 32);
          return;
        }
        try {
          await bridgeRef.current?.hydrateOverlay?.(stored, frameKey);
        } catch (err) {
          console.error("Failed to hydrate overlay from localStorage", err);
        }
      };

      void attemptHydrate();
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [adapter, frameKey]);

  /**
   * Save current frame immediately and mark saved.
   *
   * This:
   * - asks AnnoBridge to persist the in-memory overlay into a list
   * - writes that list to localStorage for this frame
   * - marks the sample as "dirty" (so backend seeding won't override)
   * - updates popupList so the popup sees the same data
   */
  const saveCurrentFrame = useCallback(async (): Promise<ImageAnnotation[]> => {
    const bridge = bridgeRef.current;
    if (!bridge) return [];

    try {
      const list = await bridge.persistWorkingNow(frameKey);
      await adapter.write(list);
      setVideoWorkingDirty(projectId, sampleId, true);
      setPopupList(list as ImageAnnotation[]);
      bridge.markSaved();
      return list;
    } catch (err) {
      console.error("Auto-save failed:", err);
      return [];
    }
  }, [adapter, frameKey, projectId, sampleId]);

  /**
   * Forward propagation:
   * When moving NEXT, if the next frame has no stored annotations yet,
   * seed it with the current frame's annotations (source updated to next frameKey).
   *
   * This creates "tracking-like" behavior where annotations can be nudged frame-to-frame.
   */
  const propagateForwardIfEmpty = useCallback(
    async (currentList: ImageAnnotation[], nextFrameNumber: number) => {
      if (!currentList || currentList.length === 0) return;

      const nextKey = buildSourceKey({
        projectId,
        sampleId,
        frame: nextFrameNumber,
      });

      const nextAdapter = W3CImageFormat(nextKey);
      const existing = await nextAdapter.read();
      if (Array.isArray(existing) && existing.length > 0) return;

      const seeded = currentList.map((annotation) => ({
        ...deepClone(annotation),
        target: {
          ...(annotation.target || {}),
          source: nextKey,
        },
      })) as ImageAnnotation[];

      await nextAdapter.write(seeded);
    },
    [projectId, sampleId],
  );

  /**
   * Background auto-save loop:
   * Every second, if AnnoBridge reports "unsaved", persist the current frame to storage.
   * (This keeps localStorage in sync without needing explicit Save clicks.)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const interval = window.setInterval(() => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      if (bridge.hasUnsaved()) void saveCurrentFrame();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [saveCurrentFrame]);

  /**
   * Expose dirty helpers on window for toolbar buttons/indicators.
   * Toolbar calls these to show "unsaved changes" and to clear the unsaved marker.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoHasUnsavedChanges = () =>
      bridgeRef.current?.hasUnsaved?.() ?? false;

    window.ufoMarkSaved = () => {
      bridgeRef.current?.markSaved?.();
    };

    return () => {
      delete window.ufoHasUnsavedChanges;
      delete window.ufoMarkSaved;
    };
  }, []);

  /**
   * Expose ufoCollectForSave on window:
   * Toolbar uses this to gather all annotations across all frames for backend save.
   *
   * We always save the current frame first to avoid losing in-memory changes.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoCollectForSave = async () => {
      await saveCurrentFrame();

      const storage = window.localStorage;
      const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      const all: ImageAnnotation[] = [];

      // Gather every frame payload for this sample, flattening into one list.
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        const raw = storage.getItem(key);
        if (!raw) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        if (Array.isArray(parsed)) {
          for (const ann of parsed) {
            if (isImageAnnotation(ann)) all.push(ann);
          }
        }
      }

      return all;
    };

    return () => {
      delete window.ufoCollectForSave;
    };
  }, [projectId, sampleId, saveCurrentFrame]);

  /**
   * Expose ufoClearCurrent on window:
   * Toolbar uses this to clear just the currently displayed frame.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoClearCurrent = async () => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      await bridge.clearOverlaySilently();
      await adapter.write([]);
      setPopupList([]);
    };

    return () => {
      delete window.ufoClearCurrent;
    };
  }, [adapter]);

  /**
   * Expose ufoClearAllFrames on window:
   * Toolbar uses this to wipe all localStorage frames for the current sample.
   * (This does not touch the backend; it clears the working set.)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoClearAllFrames = async () => {
      const storage = window.localStorage;
      const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      const keysToDelete: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) keysToDelete.push(key);
      }

      for (const key of keysToDelete) storage.removeItem(key);

      await bridgeRef.current?.clearOverlaySilently?.();
      setPopupList([]);
    };

    return () => {
      delete window.ufoClearAllFrames;
    };
  }, [projectId, sampleId]);

  /**
   * When navigating frames we may want to clear the instance selection.
   *
   * Behavior:
   * - If user explicitly selected an instance ("explicit"), keep it across frames.
   * - If selection was auto-created ("auto"), clear instance selection on nav but
   *   keep the class armed (so the user can keep drawing).
   */
  const clearInstanceSelectionUnlessExplicit = useCallback(() => {
    if (typeof window === "undefined") return;

    const w = window;
    const source = w.ufoSelectionSource ?? null;

    // If user explicitly picked an instance, keep it across frames.
    if (source === "explicit") return;

    // Clear only the instance selection; keep class armed.
    w.ufoSelectedProfileId = null;
    w.ufoSelectedTrackId = null;
    w.ufoSelectionSource = null;

    w.ufoNotifySelectionChanged?.();

    // Also tell the toolbar to clear the highlighted instance row.
    const profiles = (w.ufoInstanceProfiles ?? []).map((p) => ({
      class_name: p.class_name,
      class_id: p.class_id,
      track_id: p.track_id,
    }));

    const classRegistryWire: Record<string, number> = {};
    for (const def of Object.values(classRegistry)) {
      const n = Number(def.id);
      classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
    }

    w.dispatchEvent(
      new CustomEvent("ufo:state", {
        detail: {
          includeTrackIds: true,
          profiles,
          selectedKey: null,
          selectedClassName: w.ufoSelectedClassName ?? null,
          lastClassName: w.ufoSelectedClassName ?? null,
          classRegistry: classRegistryWire,
        },
      }),
    );
  }, [classRegistry]);

  /**
   * Navigation handlers: always save current frame before calling upstream.
   * This ensures the in-memory overlay is persisted before changing the frame.
   */
  const handlePrev = useCallback(async () => {
    if (!onPrev) return;
    await saveCurrentFrame();
    clearInstanceSelectionUnlessExplicit();
    onPrev();
  }, [onPrev, saveCurrentFrame, clearInstanceSelectionUnlessExplicit]);

  const handleNext = useCallback(async () => {
    if (!onNext) return;

    // Save this frame, then forward-propagate if the next frame has no data yet.
    const currentList = await saveCurrentFrame();
    await propagateForwardIfEmpty(currentList, frameNumber + 1);

    clearInstanceSelectionUnlessExplicit();
    onNext();
  }, [
    onNext,
    saveCurrentFrame,
    propagateForwardIfEmpty,
    frameNumber,
    clearInstanceSelectionUnlessExplicit,
  ]);

  const handleJump = useCallback(
    async (n: number) => {
      if (!onJump) return;
      await saveCurrentFrame();
      clearInstanceSelectionUnlessExplicit();
      onJump(n);
    },
    [onJump, saveCurrentFrame, clearInstanceSelectionUnlessExplicit],
  );

  /**
   * Count annotations for a given (class_name, track_id) across ALL frames.
   * Used for bulk delete preview + deciding if an instance is now empty.
   */
  const countAnnotationsForProfile = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      if (typeof window === "undefined") return { total: 0, frames: 0 };

      const className = (info.class_name || "").toLowerCase();
      const trackKey = canonicalizeTrackId(info.track_id || "");
      if (!className || !trackKey) return { total: 0, frames: 0 };

      const storage = window.localStorage;
      const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      let total = 0;
      let frames = 0;

      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        const raw = storage.getItem(key);
        if (!raw) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        if (!Array.isArray(parsed)) continue;

        let frameHas = false;
        for (const ann of parsed) {
          if (!isImageAnnotation(ann)) continue;

          const label = extractClassLabel(ann);
          if (!label) continue;

          const annClass = (label.class_name || "").toLowerCase();
          const annTrack = canonicalizeTrackId(label.track_id || "");
          if (annClass === className && annTrack === trackKey) {
            total += 1;
            frameHas = true;
          }
        }

        if (frameHas) frames += 1;
      }

      return { total, frames };
    },
    [projectId, sampleId],
  );

  // Convenience wrapper when we only care about total count.
  const countAnnotationsForInstance = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      const { total } = await countAnnotationsForProfile(info);
      return total;
    },
    [countAnnotationsForProfile],
  );

  /**
   * Delete annotations for a profile across ALL frames.
   * This edits localStorage directly (frame-by-frame) and does not touch backend.
   */
  const deleteAnnotationsForProfile = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      if (typeof window === "undefined") {
        return { totalDeleted: 0, framesTouched: 0 };
      }

      const className = (info.class_name || "").toLowerCase();
      const trackKey = canonicalizeTrackId(info.track_id || "");
      if (!className || !trackKey) return { totalDeleted: 0, framesTouched: 0 };

      const storage = window.localStorage;
      const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      let totalDeleted = 0;
      let framesTouched = 0;

      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        const raw = storage.getItem(key);
        if (!raw) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        if (!Array.isArray(parsed)) continue;

        const original = parsed as unknown[];

        let changed = false;
        const filtered: unknown[] = [];

        for (const ann of original) {
          if (!isImageAnnotation(ann)) {
            filtered.push(ann);
            continue;
          }

          const label = extractClassLabel(ann);
          if (!label) {
            filtered.push(ann);
            continue;
          }

          const annClass = (label.class_name || "").toLowerCase();
          const annTrack = canonicalizeTrackId(label.track_id || "");
          const match = annClass === className && annTrack === trackKey;

          if (match) {
            totalDeleted += 1;
            changed = true;
            continue;
          }

          filtered.push(ann);
        }

        // If a frame changed, rewrite its localStorage entry (or remove if empty).
        if (changed) {
          framesTouched += 1;
          if (filtered.length > 0)
            storage.setItem(key, JSON.stringify(filtered));
          else storage.removeItem(key);
        }
      }

      return { totalDeleted, framesTouched };
    },
    [projectId, sampleId],
  );

  /**
   * Auto quick-add:
   * When the popup "quick add" is used, we create a NEW instance profile for the
   * same class_name with a new unique track_id, select it, and notify toolbar.
   *
   * This is how users create multiple instances of the same class.
   */
  const onAutoQuickAdd = useCallback(
    async ({ class_name }: { class_name: string }) => {
      if (typeof window === "undefined") return null;

      const cnameKey = (class_name || "").toLowerCase();
      if (!cnameKey) return null;

      const existingProfiles = window.ufoInstanceProfiles ?? [];

      // Use the canonical label casing from LABEL_MAP where possible.
      const labelDef =
        LABEL_MAP.categories.find((c) => c.name.toLowerCase() === cnameKey) ||
        null;

      const prettyClassName = labelDef?.name ?? class_name;

      // Generate a readable unique id that doesn't collide for this class.
      const existingTrackIds = existingProfiles
        .filter(
          (p) =>
            typeof p.class_name === "string" &&
            p.class_name.toLowerCase() === cnameKey &&
            typeof p.track_id === "string",
        )
        .map((p) => p.track_id);

      const readable = uniqueReadableId(existingTrackIds);
      const track_id = canonicalizeTrackId(readable);

      // Determine numeric class_id from local registry, then fixed fallback.
      const reg = classRegistry;
      const regEntry = reg[cnameKey] || reg[prettyClassName] || undefined;

      const regId =
        regEntry && typeof regEntry.id === "string"
          ? Number(regEntry.id)
          : undefined;

      const fixedId =
        FIXED_CLASS_REG[cnameKey] ??
        FIXED_CLASS_REG[prettyClassName.toLowerCase()];

      const class_id =
        (typeof regId === "number" && !Number.isNaN(regId)
          ? regId
          : undefined) ??
        (typeof fixedId === "number" ? fixedId : undefined) ??
        1;

      const id = `${prettyClassName}:${track_id}`;

      const nextProfiles: InstanceProfile[] = [
        ...existingProfiles,
        { id, class_name: prettyClassName, class_id, track_id },
      ];

      // Update window selection + mark as "auto" (so it can be cleared on navigation).
      window.ufoInstanceProfiles = nextProfiles;
      window.ufoSelectedProfileId = id;
      window.ufoSelectedClassName = prettyClassName;
      window.ufoSelectedTrackId = track_id;
      window.ufoSelectionSource = "auto";
      window.ufoNotifySelectionChanged?.();

      const profilePayload = nextProfiles.map((p) => ({
        class_name: p.class_name,
        class_id: p.class_id,
        track_id: p.track_id,
      }));

      // Toolbar uses selectedKey = "<classLower>:<trackId>".
      const selectedKey = `${prettyClassName.toLowerCase()}:${track_id}`;

      const classRegistryWire: Record<string, number> = {};
      for (const def of Object.values(classRegistry)) {
        const n = Number(def.id);
        classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
      }

      // Broadcast the updated instance list + selection to the toolbar.
      window.dispatchEvent(
        new CustomEvent("ufo:state", {
          detail: {
            includeTrackIds: true,
            profiles: profilePayload,
            selectedKey,
            selectedClassName: prettyClassName,
            lastClassName: prettyClassName,
            classRegistry: classRegistryWire,
          },
        }),
      );

      // Persist last class so user can continue drawing quickly after reload.
      saveLastClassName(prettyClassName);
      showToast(`New ${prettyClassName} instance: #${track_id}`);

      return { class_id, class_name: prettyClassName, track_id };
    },
    [classRegistry, showToast],
  );

  /**
   * Called after a single annotation delete from the popup.
   * We:
   * - save frame (localStorage)
   * - show toast
   * - if the instance now has 0 annotations globally, prompt to delete its profile.
   */
  const handleAnnotationDeleted = useCallback(
    async (label: { class_name?: string; track_id?: string }) => {
      await saveCurrentFrame();
      showToast("Annotation deleted.");

      const class_name = label.class_name;
      const track_id_raw = label.track_id;

      if (!class_name || !track_id_raw) return;

      const canonicalProfile = {
        class_name,
        track_id: canonicalizeTrackId(track_id_raw),
      };

      const total = await countAnnotationsForInstance(canonicalProfile);
      if (total === 0) {
        setEmptyInstanceProfile(canonicalProfile);
        setEmptyInstanceModalOpen(true);
      }
    },
    [saveCurrentFrame, countAnnotationsForInstance, showToast],
  );

  /**
   * Confirm deletion of an instance profile that has no remaining annotations.
   * This only edits the toolbar instance list (window.ufoInstanceProfiles).
   */
  const confirmDeleteEmptyInstance = useCallback(() => {
    if (typeof window === "undefined" || !emptyInstanceProfile) {
      setEmptyInstanceModalOpen(false);
      setEmptyInstanceProfile(null);
      return;
    }

    const classNameKey = (emptyInstanceProfile.class_name || "").toLowerCase();
    const trackKey = canonicalizeTrackId(emptyInstanceProfile.track_id || "");

    const existingProfiles = window.ufoInstanceProfiles ?? [];

    // Remove the matching instance row.
    const remaining = existingProfiles.filter((p) => {
      const pClass = (p.class_name || "").toLowerCase();
      const pTrack = canonicalizeTrackId(p.track_id || "");
      return !(pClass === classNameKey && pTrack === trackKey);
    });

    // If the removed profile was selected, choose a new selection (last item) or clear.
    let selectedProfileId: string | null = window.ufoSelectedProfileId ?? null;

    if (selectedProfileId) {
      const removedWasSelected = existingProfiles.some((p) => {
        const pClass = (p.class_name || "").toLowerCase();
        const pTrack = canonicalizeTrackId(p.track_id || "");
        return (
          p.id === selectedProfileId &&
          pClass === classNameKey &&
          pTrack === trackKey
        );
      });

      if (removedWasSelected) {
        if (remaining.length > 0) {
          const last = remaining[remaining.length - 1];
          selectedProfileId = last.id;
          window.ufoSelectedProfileId = last.id;
          window.ufoSelectedClassName = last.class_name;
          window.ufoSelectedTrackId = last.track_id;
          window.ufoSelectionSource = "auto";
        } else {
          selectedProfileId = null;
          window.ufoSelectedProfileId = null;
          window.ufoSelectedClassName = null;
          window.ufoSelectedTrackId = null;
          window.ufoSelectionSource = null;
        }
      }
    }

    window.ufoInstanceProfiles = remaining;
    window.ufoNotifySelectionChanged?.();

    const profilePayload = remaining.map((p) => ({
      class_name: p.class_name,
      class_id: p.class_id,
      track_id: p.track_id,
    }));

    // Compute toolbar selectedKey from remaining selection (if any).
    let selectedKey: string | null = null;
    if (selectedProfileId && remaining.length > 0) {
      const matched = remaining.find((p) => p.id === selectedProfileId);
      if (matched) {
        selectedKey = `${String(matched.class_name).toLowerCase()}:${canonicalizeTrackId(
          matched.track_id || "",
        )}`;
      }
    }

    const classRegistryWire: Record<string, number> = {};
    for (const def of Object.values(classRegistry)) {
      const n = Number(def.id);
      classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
    }

    // Notify toolbar of updated instance list and selection.
    window.dispatchEvent(
      new CustomEvent("ufo:state", {
        detail: {
          includeTrackIds: true,
          profiles: profilePayload,
          selectedKey,
          selectedClassName: window.ufoSelectedClassName ?? null,
          lastClassName: window.ufoSelectedClassName ?? null,
          classRegistry: classRegistryWire,
        },
      }),
    );

    setEmptyInstanceModalOpen(false);
    setEmptyInstanceProfile(null);
  }, [emptyInstanceProfile, classRegistry]);

  const cancelDeleteEmptyInstance = useCallback(() => {
    setEmptyInstanceModalOpen(false);
    setEmptyInstanceProfile(null);
  }, []);

  /**
   * Trigger the "bulk delete instance across frames" modal.
   * This is typically requested by toolbar via the ufo:requestBulkDelete event.
   */
  const onRequestBulkDelete = useCallback(
    async (profile: { class_name?: string; track_id?: string }) => {
      if (!profile.class_name || !profile.track_id) return;

      const { total, frames } = await countAnnotationsForProfile(profile);
      setDeleteModalProfile({
        class_name: profile.class_name,
        track_id: profile.track_id,
      });
      setDeletePreviewCounts({ total, frames });
      setDeleteModalOpen(true);
    },
    [countAnnotationsForProfile],
  );

  /**
   * Execute bulk delete:
   * - delete matching annotations from all frame localStorage keys
   * - refresh current overlay from adapter
   * - if instance is now empty globally, prompt to delete instance profile
   */
  const confirmBulkDelete = useCallback(async () => {
    if (!deleteModalProfile) {
      setDeleteModalOpen(false);
      setDeletePreviewCounts(null);
      return;
    }

    const { totalDeleted } =
      await deleteAnnotationsForProfile(deleteModalProfile);

    // Refresh current frame overlay so user sees the delete immediately.
    try {
      const updated = await adapter.read();
      await bridgeRef.current?.clearOverlaySilently?.();
      if (updated && updated.length > 0) {
        await bridgeRef.current?.hydrateOverlay?.(updated, frameKey);
      }
      setPopupList((updated || []) as ImageAnnotation[]);
    } catch (err) {
      console.error("Failed to refresh overlay after bulk delete", err);
    }

    showToast(
      totalDeleted > 0
        ? `Deleted ${totalDeleted} annotations for this instance.`
        : "No annotations to delete for this instance.",
    );

    const remaining = await countAnnotationsForInstance(deleteModalProfile);
    if (remaining === 0) {
      setEmptyInstanceProfile({
        class_name: deleteModalProfile.class_name,
        track_id: canonicalizeTrackId(deleteModalProfile.track_id || ""),
      });
      setEmptyInstanceModalOpen(true);
    }

    setDeleteModalOpen(false);
    setDeletePreviewCounts(null);
    setDeleteModalProfile(null);
  }, [
    deleteModalProfile,
    deleteAnnotationsForProfile,
    adapter,
    frameKey,
    showToast,
    countAnnotationsForInstance,
  ]);

  const cancelBulkDelete = useCallback(() => {
    setDeleteModalOpen(false);
    setDeletePreviewCounts(null);
    setDeleteModalProfile(null);
  }, []);

  /**
   * Open the global "delete all instances & annotations" modal.
   * We compute a small preview (counts) for user confirmation.
   */
  const openDeleteAllInstances = useCallback(async () => {
    if (typeof window === "undefined") return;

    const instanceProfiles = window.ufoInstanceProfiles ?? [];

    const storage = window.localStorage;
    const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

    let totalAnnotations = 0;
    let totalFrames = 0;

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;

      const raw = storage.getItem(key);
      if (!raw) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      if (!Array.isArray(parsed)) continue;

      const anns = parsed as unknown[];
      if (anns.length > 0) {
        totalFrames += 1;
        totalAnnotations += anns.length;
      }
    }

    setDeleteAllPreview({
      totalAnnotations,
      totalInstances: instanceProfiles.length,
      totalFrames,
    });
    setDeleteAllModalOpen(true);
  }, [projectId, sampleId]);

  /**
   * Confirm global delete:
   * - remove all frame keys for this sample from localStorage
   * - clear current overlay
   * - reset window selection/instance list
   * - notify toolbar via ufo:state
   */
  const confirmDeleteAllInstances = useCallback(async () => {
    if (typeof window === "undefined") {
      setDeleteAllModalOpen(false);
      setDeleteAllPreview(null);
      return;
    }

    const storage = window.localStorage;
    const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

    const keysToDelete: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) keysToDelete.push(key);
    }

    for (const key of keysToDelete) storage.removeItem(key);

    await bridgeRef.current?.clearOverlaySilently?.();
    setPopupList([]);

    window.ufoInstanceProfiles = [];
    window.ufoSelectedProfileId = null;
    window.ufoSelectedClassName = null;
    window.ufoSelectedTrackId = null;
    window.ufoSelectionSource = null;
    window.ufoNotifySelectionChanged?.();

    const classRegistryWire: Record<string, number> = {};
    for (const def of Object.values(classRegistry)) {
      const n = Number(def.id);
      classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
    }

    window.dispatchEvent(
      new CustomEvent("ufo:state", {
        detail: {
          includeTrackIds: true,
          profiles: [],
          selectedKey: null,
          selectedClassName: null,
          lastClassName: null,
          classRegistry: classRegistryWire,
        },
      }),
    );

    // Clear last class so UI doesn't auto-arm on next load after wipe.
    saveLastClassName("");

    setDeleteAllModalOpen(false);
    setDeleteAllPreview(null);

    showToast("All instances and annotations cleared for this sample.");
  }, [projectId, sampleId, classRegistry, showToast]);

  const cancelDeleteAllInstances = useCallback(() => {
    setDeleteAllModalOpen(false);
    setDeleteAllPreview(null);
  }, []);

  /**
   * Toolbar event wiring: bulk delete.
   * Toolbar dispatches CustomEvent("ufo:requestBulkDelete", { detail: { profile } })
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const bulkHandler = (e: Event) => {
      const detail = (e as CustomEvent<BulkDeleteRequestDetail>).detail;
      const profile = detail?.profile;
      if (!profile) return;
      void onRequestBulkDelete(profile);
    };

    window.addEventListener("ufo:requestBulkDelete", bulkHandler);
    return () => {
      window.removeEventListener("ufo:requestBulkDelete", bulkHandler);
    };
  }, [onRequestBulkDelete]);

  /**
   * Toolbar event wiring: delete all instances.
   * Toolbar dispatches Event("ufo:deleteAllInstances")
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      void openDeleteAllInstances();
    };

    window.addEventListener("ufo:deleteAllInstances", handler);
    return () => {
      window.removeEventListener("ufo:deleteAllInstances", handler);
    };
  }, [openDeleteAllInstances]);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <div className="inline-flex flex-col items-center gap-4 max-w-5xl">
        <div className="inline-flex flex-col items-center gap-4 max-w-5xl">
          {/* Top controls: jump-to-frame + prev/next */}
          <div className="flex flex-col items-center gap-2">
            {onJump && (
              <div className="w-60 text-center">
                <div className="text-[13px] text-gray-200 mb-1">
                  Jump to Frame
                </div>
                <FrameSearch onJump={handleJump} />
              </div>
            )}

            <div className="flex justify-center">
              <ButtonGroup>
                <Button
                  variant="primary"
                  onPress={handlePrev}
                  isDisabled={!onPrev}
                >
                  Prev
                </Button>
                <Button variant="primary" isDisabled>
                  Frame {frameLabel}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleNext}
                  isDisabled={!onNext}
                >
                  Next
                </Button>
              </ButtonGroup>
            </div>
          </div>

          <div className="overflow-visible flex justify-center">
            <div className="relative inline-block max-w-full">
              <Annotorious>
                {/* drawingEnabled gates rectangle creation until a class/instance is armed */}
                <ImageAnnotator
                  tool="rectangle"
                  drawingEnabled={drawingEnabled}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    // Backend returns base64 PNG bytes for the current frame.
                    src={`data:image/png;base64,${data.values}`}
                    alt={`Frame ${frameLabel}`}
                    draggable={false}
                    onLoad={() => {
                      const img = imgRef.current;
                      if (img)
                        setNatural({
                          w: img.naturalWidth,
                          h: img.naturalHeight,
                        });
                    }}
                    className="block mx-auto h-auto object-contain select-none"
                    // Key change: explicitly set width so small frames upscale
                    style={{
                      imageRendering: "pixelated",
                      width: displayWidth ? `${displayWidth}px` : undefined,
                      maxWidth: "100%",
                      height: "auto",
                      maxHeight: "calc(100dvh - 240px)",
                    }}
                  />
                </ImageAnnotator>

                {/* Popup for selecting/inspecting class + instance; also supports delete */}
                <ImageAnnotationPopup
                  popup={(props) => (
                    <ClassInfoPopup
                      {...props}
                      list={popupList}
                      includeTrackIds={true}
                      onDeleted={handleAnnotationDeleted}
                    />
                  )}
                />

                {/* Bridge wires Annotorious events -> normalization + local storage persistence */}
                <AnnoBridge
                  ref={bridgeRef}
                  getSelectedProfile={getSelectedProfile}
                  getSelectedClassName={getSelectedClassName}
                  includeTrackIds={includeTrackIds}
                  classRegistry={classRegistry}
                  onAutoQuickAdd={onAutoQuickAdd}
                />
              </Annotorious>
            </div>
          </div>
        </div>
      </div>

      {/* Per-instance bulk delete confirmation modal */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Delete instance annotations?"
        message="This will delete all annotations for this instance across all frames in this sample."
        details={
          deletePreviewCounts ? (
            <div className="space-y-1">
              <div>
                <strong>Total annotations:</strong> {deletePreviewCounts.total}
              </div>
              <div>
                <strong>Frames affected:</strong> {deletePreviewCounts.frames}
              </div>
            </div>
          ) : null
        }
        confirmLabel="Delete annotations"
        cancelLabel="Cancel"
        onConfirm={confirmBulkDelete}
        onCancel={cancelBulkDelete}
      />

      {/* Global delete-all confirmation modal */}
      <ConfirmModal
        open={deleteAllModalOpen}
        title="Delete ALL instances & annotations?"
        message="This will delete every instance profile and annotation in this sample across all frames."
        details={
          deleteAllPreview ? (
            <div className="space-y-1">
              <div>
                <strong>Total instances:</strong>{" "}
                {deleteAllPreview.totalInstances}
              </div>
              <div>
                <strong>Total annotations:</strong>{" "}
                {deleteAllPreview.totalAnnotations}
              </div>
              <div>
                <strong>Frames with annotations:</strong>{" "}
                {deleteAllPreview.totalFrames}
              </div>
            </div>
          ) : null
        }
        confirmLabel="Delete all"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteAllInstances}
        onCancel={cancelDeleteAllInstances}
      />

      {/* Prompt to delete an instance profile when it becomes empty */}
      <ConfirmModal
        open={emptyInstanceModalOpen}
        title="Delete empty instance?"
        message="This instance no longer has any annotations. Do you also want to remove the instance profile from the list?"
        confirmLabel="Delete instance"
        cancelLabel="Keep instance"
        onConfirm={confirmDeleteEmptyInstance}
        onCancel={cancelDeleteEmptyInstance}
      />

      <Toast open={toastOpen} message={toastMessage} />
    </div>
  );
}

type VideoViewInfo = {
  data: ImageData;
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;
  dataParams: DataParams;
  setDataParams: (
    updater: (dataParams: DataParams) => DataParams | DataParams,
  ) => void;
  projectId: string;
  sampleId: string;
  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
};

/**
 * VideoView:
 * Thin wrapper around FrameView. Keeps the same props surface as backup.
 * (dataParams are unused here but preserved for compatibility.)
 *
 * Responsibility:
 * - Translate "frame navigation" into setDataParams({ name:"image", frame:n })
 *   so the upstream page can request a new frame from the backend.
 */
export const VideoView = ({
  data,
  annotations,
  setAnnotations: _setAnnotations,
  dataParams: _dataParams,
  setDataParams,
  projectId,
  sampleId,
}: VideoViewInfo) => {
  // Normalize current frame index from backend data (fallback to 0).
  const currentFrame = useMemo(() => {
    const frame = data.frame;
    return typeof frame === "number" && Number.isFinite(frame) ? frame : 0;
  }, [data.frame]);

  /**
   * Single navigation primitive:
   * Update dataParams to request a specific frame from the backend.
   */
  const goToFrame = useCallback(
    (n: number) => {
      if (!Number.isFinite(n)) return;
      const target = Math.max(0, Math.trunc(n));
      setDataParams(() => ({ name: "image", frame: target }) as DataParams);
    },
    [setDataParams],
  );

  const onPrev = useCallback(() => {
    goToFrame(currentFrame - 1);
  }, [goToFrame, currentFrame]);

  const onNext = useCallback(() => {
    goToFrame(currentFrame + 1);
  }, [goToFrame, currentFrame]);

  const onJump = useCallback(
    (n: number) => {
      goToFrame(n);
    },
    [goToFrame],
  );

  return (
    <div className="w-full">
      <FrameView
        data={data}
        projectId={projectId}
        sampleId={sampleId}
        dbAnnotations={annotations}
        onPrev={onPrev}
        onNext={onNext}
        onJump={onJump}
      />
    </div>
  );
};
