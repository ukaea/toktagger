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
  isUfoWorkingDirty,
  sampleFramePrefix,
  setUfoWorkingDirty,
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

type InstanceProfile = {
  id: string;
  class_name: string;
  class_id: number;
  track_id: string;
};

type SelectedProfile = {
  class_id?: number;
  class_name?: string;
  track_id?: string;
} | null;

type BulkDeleteRequestDetail = {
  profile?: { class_name?: string; track_id?: string };
};

function isImageAnnotation(v: unknown): v is ImageAnnotation {
  return (
    !!v &&
    typeof v === "object" &&
    "id" in v &&
    typeof (v as { id: unknown }).id === "string"
  );
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

declare global {
  interface Window {
    ufoNotifySelectionChanged?: () => void;

    ufoInstanceProfiles?: InstanceProfile[];
    ufoSelectedProfileId?: string | null;
    ufoSelectedClassName?: string | null;
    ufoSelectedTrackId?: string | null;
    ufoSelectionSource?: "auto" | "explicit" | null;

    ufoHasUnsavedChanges?: () => boolean;
    ufoMarkSaved?: () => void;

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
  const bridgeRef = useRef<BridgeHandle | null>(null);

  // Increment this whenever the toolbar changes the selected instance
  // so drawingEnabled can react to the latest window.* selection.
  const [, setSelectionTick] = useState(0);

  // Local toast for notifications (quick-add, delete, etc.)
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastOpen(true);

    setTimeout(() => setToastOpen(false), 2000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoNotifySelectionChanged = () => {
      setSelectionTick((tick) => tick + 1);
    };

    return () => {
      delete window.ufoNotifySelectionChanged;
    };
  }, []);

  // Profiles / classes are owned by the left toolbar (global UFO toolbar).
  // We just read the current selection from window so AnnoBridge can use it.
  const getSelectedProfile = useCallback((): SelectedProfile => {
    if (typeof window === "undefined") return null;

    const selectedId = window.ufoSelectedProfileId ?? null;
    const list = window.ufoInstanceProfiles ?? [];

    if (!selectedId) return null;
    const found = list.find((p) => p.id === selectedId);
    return found ?? null;
  }, []);

  const getSelectedClassName = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return window.ufoSelectedClassName ?? null;
  }, []);

  // Tracking mode: enable track IDs for UFO
  const includeTrackIds = true;

  // Use the persisted class registry (shared with the toolbar via localStorage)
  const classRegistry: ClassRegistry = useMemo(() => loadClassRegistry(), []);

  // Enable drawing if user has selected a class (armed), even if no instance exists yet.
  const drawingEnabled = !!getSelectedProfile() || !!getSelectedClassName();

  const frameNumber = data.frame;
  const frameLabel = Number.isFinite(frameNumber) ? frameNumber : "?";

  // Stable per-frame identity -> adapter for localStorage
  const frameKey = useMemo(
    () =>
      buildSourceKey({
        projectId,
        sampleId,
        frame: frameNumber,
      }),
    [projectId, sampleId, frameNumber],
  );

  const adapter = useMemo(() => W3CImageFormat(frameKey), [frameKey]);

  // List of annotations for this frame used by ClassInfoPopup
  const [popupList, setPopupList] = useState<ImageAnnotation[]>([]);

  // Tracks whether an instance has become empty across all frames,
  // so we can prompt to delete the instance profile.
  const [emptyInstanceModalOpen, setEmptyInstanceModalOpen] = useState(false);
  const [emptyInstanceProfile, setEmptyInstanceProfile] = useState<{
    class_name?: string;
    track_id?: string;
  } | null>(null);

  // Per-instance bulk delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalProfile, setDeleteModalProfile] = useState<{
    class_name?: string;
    track_id?: string;
  } | null>(null);
  const [deletePreviewCounts, setDeletePreviewCounts] = useState<{
    total: number;
    frames: number;
  } | null>(null);

  // Global delete-all modal and preview state
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [deleteAllPreview, setDeleteAllPreview] = useState<{
    totalAnnotations: number;
    totalInstances: number;
    totalFrames: number;
  } | null>(null);

  // Refresh behavior safety: on browser reload, clear local cache + marker.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined;

    const navType = nav?.type;

    if (navType === "reload") {
      clearW3CForSample(projectId, sampleId);
      setUfoWorkingDirty(projectId, sampleId, false);
    }
  }, [projectId, sampleId]);

  const bootstrapInstancesFromStorage = useCallback(async () => {
    if (typeof window === "undefined") return;

    const storage = window.localStorage;
    const prefix = sampleFramePrefix(projectId, sampleId);

    const all: ImageAnnotation[] = [];

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
        // ignore
      }
    }

    // Derive unique profiles from annotations
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

    const classRegistryWire: Record<string, number> = {};
    for (const def of Object.values(classRegistry)) {
      const n = Number(def.id);
      classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
    }

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

  useEffect(() => {
    void bootstrapInstancesFromStorage();
  }, [bootstrapInstancesFromStorage]);

  useEffect(() => {
    let cancelled = false;

    const seedFromBackendIfNeeded = async () => {
      if (typeof window === "undefined") return;

      // If user has an in-progress local session, do NOT overwrite it.
      if (isUfoWorkingDirty(projectId, sampleId)) return;

      // Clear any leftover per-frame cache to avoid conflicts
      clearW3CForSample(projectId, sampleId);

      // Convert db → W3C grouped by frame
      const byFrame = videoBBoxesToW3CByFrame({
        projectId,
        sampleId,
        annotations: dbAnnotations as unknown[],
      });

      // Write to localStorage per frame so your existing system works
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

  // Hydrate overlay from localStorage when the annotator is ready.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = await adapter.read();
      if (cancelled || !stored || stored.length === 0) return;

      setPopupList(stored as ImageAnnotation[]);

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

  // Persist current frame immediately and mark saved.
  const saveCurrentFrame = useCallback(async (): Promise<ImageAnnotation[]> => {
    const bridge = bridgeRef.current;
    if (!bridge) return [];

    try {
      const list = await bridge.persistWorkingNow(frameKey);
      await adapter.write(list);
      setUfoWorkingDirty(projectId, sampleId, true);
      setPopupList(list as ImageAnnotation[]);
      bridge.markSaved();
      return list;
    } catch (err) {
      console.error("Auto-save failed:", err);
      return [];
    }
  }, [adapter, frameKey, projectId, sampleId]);

  // Forward propagation: seed the next frame if empty.
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

  // Background auto-save loop.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const interval = window.setInterval(() => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      if (bridge.hasUnsaved()) void saveCurrentFrame();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [saveCurrentFrame]);

  // Expose dirty helpers on window for toolbar buttons.
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

  // Expose ufoCollectForSave on window.
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoCollectForSave = async () => {
      await saveCurrentFrame();

      const storage = window.localStorage;
      const prefix = "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      const all: ImageAnnotation[] = [];

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

  // Expose ufoClearCurrent on window.
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

  // Expose ufoClearAllFrames on window.
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

  // Navigation handlers: always save current frame before calling upstream.
  const handlePrev = useCallback(async () => {
    if (!onPrev) return;
    await saveCurrentFrame();
    clearInstanceSelectionUnlessExplicit();
    onPrev();
  }, [onPrev, saveCurrentFrame, clearInstanceSelectionUnlessExplicit]);

  const handleNext = useCallback(async () => {
    if (!onNext) return;

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

  const countAnnotationsForInstance = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      const { total } = await countAnnotationsForProfile(info);
      return total;
    },
    [countAnnotationsForProfile],
  );

  /**
   * Delete annotations for a profile across ALL frames.
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

  // Auto quick-add (duplicate instance) -> create new profile & notify toolbar.
  const onAutoQuickAdd = useCallback(
    async ({ class_name }: { class_name: string }) => {
      if (typeof window === "undefined") return null;

      const cnameKey = (class_name || "").toLowerCase();
      if (!cnameKey) return null;

      const existingProfiles = window.ufoInstanceProfiles ?? [];

      const labelDef =
        LABEL_MAP.categories.find((c) => c.name.toLowerCase() === cnameKey) ||
        null;

      const prettyClassName = labelDef?.name ?? class_name;

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

      const selectedKey = `${prettyClassName.toLowerCase()}:${track_id}`;

      const classRegistryWire: Record<string, number> = {};
      for (const def of Object.values(classRegistry)) {
        const n = Number(def.id);
        classRegistryWire[def.name] = Number.isFinite(n) ? n : 1;
      }

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

      saveLastClassName(prettyClassName);
      showToast(`New ${prettyClassName} instance: #${track_id}`);

      return { class_id, class_name: prettyClassName, track_id };
    },
    [classRegistry, showToast],
  );

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

  const confirmDeleteEmptyInstance = useCallback(() => {
    if (typeof window === "undefined" || !emptyInstanceProfile) {
      setEmptyInstanceModalOpen(false);
      setEmptyInstanceProfile(null);
      return;
    }

    const classNameKey = (emptyInstanceProfile.class_name || "").toLowerCase();
    const trackKey = canonicalizeTrackId(emptyInstanceProfile.track_id || "");

    const existingProfiles = window.ufoInstanceProfiles ?? [];

    const remaining = existingProfiles.filter((p) => {
      const pClass = (p.class_name || "").toLowerCase();
      const pTrack = canonicalizeTrackId(p.track_id || "");
      return !(pClass === classNameKey && pTrack === trackKey);
    });

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

  const confirmBulkDelete = useCallback(async () => {
    if (!deleteModalProfile) {
      setDeleteModalOpen(false);
      setDeletePreviewCounts(null);
      return;
    }

    const { totalDeleted } =
      await deleteAnnotationsForProfile(deleteModalProfile);

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

    saveLastClassName("");

    setDeleteAllModalOpen(false);
    setDeleteAllPreview(null);

    showToast("All instances and annotations cleared for this sample.");
  }, [projectId, sampleId, classRegistry, showToast]);

  const cancelDeleteAllInstances = useCallback(() => {
    setDeleteAllModalOpen(false);
    setDeleteAllPreview(null);
  }, []);

  // Toolbar event wiring: bulk delete + delete-all.
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
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="w-full flex justify-center">
        <div className="inline-flex flex-col items-center gap-4 max-w-5xl">
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

          <div className="overflow-visible">
            <Annotorious>
              <ImageAnnotator tool="rectangle" drawingEnabled={drawingEnabled}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${data.values}`}
                  alt={`Frame ${frameLabel}`}
                  className="block mx-auto max-w-full h-auto object-contain max-h-[calc(100dvh-220px)] sm:max-h-[calc(100dvh-210px)]"
                  style={{
                    imageRendering: "pixelated",
                    maxHeight: "calc(100dvh - 240px)",
                  }}
                  draggable={false}
                />
              </ImageAnnotator>

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

// Branch1 uses Annotation[] (no Annotations alias)
type UFOViewInfo = {
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
 * UFOView:
 * Thin wrapper around FrameView. Keeps the same props surface as backup.
 * (dataParams are unused here but preserved for compatibility.)
 */
export const UFOView = ({
  data,
  annotations,
  setAnnotations: _setAnnotations,
  dataParams: _dataParams,
  setDataParams: _setDataParams,
  projectId,
  sampleId,
  onPrev,
  onNext,
  onJump,
}: UFOViewInfo) => {
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
