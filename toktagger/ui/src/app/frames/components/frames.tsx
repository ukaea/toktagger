"use client";
// UFO frame annotator view: integrates Annotorious, per-frame storage,
// toolbar window.* integration, navigation, and bulk-delete / clear flows.
import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect
} from "react";
import {
  Annotorious,
  ImageAnnotator,
  ImageAnnotationPopup,
  type ImageAnnotation
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import {
  ImageData,
  Annotations,
  DataParams
} from "@/types";
import { SearchField, Button, ButtonGroup } from "@adobe/react-spectrum";
import "react-contexify/ReactContexify.css";

import { AnnoBridge, type BridgeHandle } from "./bridge";
import { W3CImageFormat, buildSourceKey } from "./adapters";
import {
  loadClassRegistry,
  type ClassRegistry,
  LABEL_MAP,
  FIXED_CLASS_REG,
  canonicalizeTrackId,
  uniqueReadableId,
  saveLastClassName,
  extractClassLabel
} from "./lib";
import {
  Toast,
  ClassInfoPopup,
  ConfirmModal
} from "./ui";

/**
 * Simple "jump to frame N" control.
 * User types a frame number, we validate and call onJump(n).
 */
export function FrameSearch({
  onJump
}: {
  onJump: (n: number) => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onSearchSubmit = (newValue: string) => {
    if (newValue === "") {
      setErrorMessage("");
      return;
    }

    if (/^[0-9]*$/.test(newValue)) {
      setErrorMessage("");
      const n = Number(newValue);
      if (Number.isFinite(n)) {
        onJump(n);
      }
    } else {
      setErrorMessage("Please enter a number.");
    }
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
  onPrev,
  onNext,
  onJump
}: {
  data: ImageData;
  projectId: string;
  sampleId: string;
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
    // Simple auto-dismiss
    window.setTimeout(() => {
      setToastOpen(false);
    }, 2000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoNotifySelectionChanged = () => {
      setSelectionTick((tick) => tick + 1);
    };

    return () => {
      delete (window as any).ufoNotifySelectionChanged;
    };
  }, []);

  // Profiles / classes are owned by the left toolbar (global UFO toolbar).
  // We just read the current selection from window so AnnoBridge can use it.
  const getSelectedProfile = useCallback(() => {
    if (typeof window === "undefined") return null;

    const w = window as any;
    const selectedId = w.ufoSelectedProfileId;
    const list = (w.ufoInstanceProfiles || []) as any[];

    if (!selectedId || !Array.isArray(list)) {
      return null;
    }

    const found = list.find((p) => p && p.id === selectedId);
    return found ?? null;
  }, []);

  const getSelectedClassName = useCallback(() => {
    if (typeof window === "undefined") return null;
    // Toolbar writes this when project.task === "UFO"
    return (window as any).ufoSelectedClassName ?? null;
  }, []);

  // Tracking mode: enable track IDs for UFO
  const includeTrackIds = true;

  // Use the persisted class registry (shared with the toolbar via localStorage)
  const classRegistry: ClassRegistry = useMemo(
    () => loadClassRegistry(),
    []
  );

  const drawingEnabled = !!getSelectedProfile();

  const frameNumber: number =
    typeof data.frame === "number" ? data.frame : 0;
  const frameLabel = Number.isFinite(frameNumber) ? frameNumber : "?";

  // Stable per-frame identity -> adapter for localStorage
  const frameKey = useMemo(
    () =>
      buildSourceKey({
        projectId,
        sampleId,
        frame: frameNumber
      }),
    [projectId, sampleId, frameNumber]
  );

  const adapter = useMemo(
    () => W3CImageFormat(frameKey),
    [frameKey]
  );

  // List of annotations for this frame used by ClassInfoPopup
  const [popupList, setPopupList] = useState<ImageAnnotation[]>([]);

  // Tracks whether an instance has become empty across all frames,
  // so we can prompt to delete the instance profile.
  const [emptyInstanceModalOpen, setEmptyInstanceModalOpen] =
    useState(false);
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
  const [deleteAllModalOpen, setDeleteAllModalOpen] =
    useState(false);
  const [deleteAllPreview, setDeleteAllPreview] = useState<{
    totalAnnotations: number;
    totalInstances: number;
    totalFrames: number;
  } | null>(null);

  // Hydrate overlay from localStorage when the annotator is ready.
  // Reads stored annotations, waits for AnnoBridge readiness, then hydrates.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = await adapter.read();
      if (cancelled || !stored || stored.length === 0) return;

      // Keep a local copy for popups
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
          console.error(
            "Failed to hydrate overlay from localStorage",
            err
          );
        }
      };

      void attemptHydrate();
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [adapter, frameKey]);

  // Helper: persist current frame immediately (to adapter + popupList) and
  // mark the bridge as "saved".
  const saveCurrentFrame = useCallback(
    async (): Promise<ImageAnnotation[]> => {
      const bridge = bridgeRef.current;
      if (!bridge) return [];

      try {
        const list = await bridge.persistWorkingNow(frameKey);
        await adapter.write(list);
        // Keep popupList in sync with the latest persisted state
        setPopupList(list as ImageAnnotation[]);
        bridge.markSaved();
        return list;
      } catch (err) {
        console.error("Auto-save failed:", err);
        return [];
      }
    },
    [adapter, frameKey]
  );

  // Forward propagation: seed the next frame with clones of the current
  // annotations if that frame has no stored annotations yet.
  const propagateForwardIfEmpty = useCallback(
    async (currentList: ImageAnnotation[], nextFrameNumber: number) => {
      // Nothing to propagate
      if (!currentList || currentList.length === 0) return;

      // Build the next frame's source key
      const nextKey = buildSourceKey({
        projectId,
        sampleId,
        frame: nextFrameNumber
      });

      const nextAdapter = W3CImageFormat(nextKey);

      // Check if next frame already has stored annotations
      const existing = await nextAdapter.read();
      if (Array.isArray(existing) && existing.length > 0) {
        // Next frame already has something – do not override it
        return;
      }

      // Seed next frame by cloning current annotations and retargeting source
      const seeded = currentList.map((annotation) => ({
        ...(typeof annotation === "object" && annotation
          ? JSON.parse(JSON.stringify(annotation))
          : annotation),
        target: {
          ...(annotation.target || {}),
          source: nextKey
        }
      })) as ImageAnnotation[];

      await nextAdapter.write(seeded);
    },
    [projectId, sampleId]
  );

  // Background auto-save loop:
  // once per second, if the bridge reports unsaved changes, persist them.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const interval = window.setInterval(() => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      if (bridge.hasUnsaved()) {
        void saveCurrentFrame();
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [saveCurrentFrame]);

  // Expose "dirty" helpers on window for toolbar buttons:
  // - ufoHasUnsavedChanges()
  // - ufoMarkSaved()
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoHasUnsavedChanges = () =>
      bridgeRef.current?.hasUnsaved?.() ?? false;

    (window as any).ufoMarkSaved = () => {
      bridgeRef.current?.markSaved?.();
    };

    return () => {
      delete (window as any).ufoHasUnsavedChanges;
      delete (window as any).ufoMarkSaved;
    };
  }, []);

  // Expose ufoCollectForSave on window:
  // 1) Flush current frame to localStorage.
  // 2) Sweep localStorage for ALL frames in this sample and return annotations.
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoCollectForSave = async () => {
      // 1) Flush current frame to localStorage
      await saveCurrentFrame();

      // 2) Sweep all frames for this sample from localStorage
      const storage = window.localStorage;
      const prefix =
        "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

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
          for (const ann of parsed as any[]) {
            all.push(ann as ImageAnnotation);
          }
        }
      }

      return all;
    };

    return () => {
      delete (window as any).ufoCollectForSave;
    };
  }, [projectId, sampleId, saveCurrentFrame]);

  // Expose ufoClearCurrent on window:
  // clears the current frame's overlay and stored annotations.
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoClearCurrent = async () => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      // Clear overlay and wipe this frame's stored annotations
      await bridge.clearOverlaySilently();
      await adapter.write([]);
      setPopupList([]);
    };

    return () => {
      delete (window as any).ufoClearCurrent;
    };
  }, [adapter]);

  // Expose ufoClearAllFrames on window:
  // clears annotations for ALL frames in this sample, plus the current overlay.
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoClearAllFrames = async () => {
      const storage = window.localStorage;
      const prefix =
        "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      const keysToDelete: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        storage.removeItem(key);
      }

      // Also clear current overlay so the user sees the wipe immediately
      await bridgeRef.current?.clearOverlaySilently?.();
      setPopupList([]);
    };

    return () => {
      delete (window as any).ufoClearAllFrames;
    };
  }, [projectId, sampleId]);

  // Navigation handlers: always save current frame before calling upstream.
  const handlePrev = useCallback(async () => {
    if (!onPrev) return;
    await saveCurrentFrame();
    onPrev();
  }, [onPrev, saveCurrentFrame]);

  const handleNext = useCallback(
    async () => {
      if (!onNext) return;

      // 1) Save current frame and get the final list
      const currentList = await saveCurrentFrame();

      // 2) Seed the NEXT frame if it is empty (localStorage-based)
      await propagateForwardIfEmpty(currentList, frameNumber + 1);

      // 3) Trigger upstream navigation (which will load the next frame data)
      onNext();
    },
    [onNext, saveCurrentFrame, propagateForwardIfEmpty, frameNumber]
  );

  const handleJump = useCallback(
    async (n: number) => {
      if (!onJump) return;
      await saveCurrentFrame();
      onJump(n);
    },
    [onJump, saveCurrentFrame]
  );

  /**
   * Count annotations for a given (class_name, track_id)
   * across ALL frames in this sample, with frame counts for preview.
   */
  const countAnnotationsForProfile = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      if (typeof window === "undefined") {
        return { total: 0, frames: 0 };
      }

      const className = (info.class_name || "").toLowerCase();
      const trackKey = canonicalizeTrackId(info.track_id || "");

      if (!className || !trackKey) {
        return { total: 0, frames: 0 };
      }

      const storage = window.localStorage;
      const prefix =
        "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

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

        for (const ann of parsed as any[]) {
          const label = extractClassLabel(
            ann as ImageAnnotation
          );
          if (!label) continue;

          const annClass =
            (label.class_name || "").toLowerCase();
          const annTrack = canonicalizeTrackId(
            label.track_id || ""
          );

          if (annClass === className && annTrack === trackKey) {
            total += 1;
            frameHas = true;
          }
        }

        if (frameHas) frames += 1;
      }

      return { total, frames };
    },
    [projectId, sampleId]
  );

  // Helper: return only the total annotation count for a given instance.
  const countAnnotationsForInstance = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      const { total } = await countAnnotationsForProfile(info);
      return total;
    },
    [countAnnotationsForProfile]
  );

  /**
   * Delete annotations for a profile across ALL frames.
   * Returns how many annotations and frames were affected.
   */
  const deleteAnnotationsForProfile = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      if (typeof window === "undefined") {
        return { totalDeleted: 0, framesTouched: 0 };
      }

      const className = (info.class_name || "").toLowerCase();
      const trackKey = canonicalizeTrackId(info.track_id || "");

      if (!className || !trackKey) {
        return { totalDeleted: 0, framesTouched: 0 };
      }

      const storage = window.localStorage;
      const prefix =
        "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

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

        const original = parsed as any[];

        const filtered = original.filter((ann: any) => {
          const label = extractClassLabel(
            ann as ImageAnnotation
          );
          if (!label) return true;

          const annClass =
            (label.class_name || "").toLowerCase();
          const annTrack = canonicalizeTrackId(
            label.track_id || ""
          );

          const match =
            annClass === className && annTrack === trackKey;
          if (match) totalDeleted += 1;

          // Keep only non-matching annotations
          return !match;
        });

        if (filtered.length !== original.length) {
          framesTouched += 1;
          if (filtered.length > 0) {
            storage.setItem(key, JSON.stringify(filtered));
          } else {
            storage.removeItem(key);
          }
        }
      }

      return { totalDeleted, framesTouched };
    },
    [projectId, sampleId]
  );

  // Quick-add-by-drawing (auto instance creation) when a duplicate
  // (class_name, track_id) is drawn. Creates a new profile and updates toolbar.
  const onAutoQuickAdd = useCallback(
    async ({ class_name }: { class_name: string }) => {
      if (typeof window === "undefined") return null;

      // Hint is lowercased in AnnoBridge; normalize
      const cnameKey = (class_name || "").toLowerCase();
      if (!cnameKey) return null;

      const w = window as any;

      // Current instance profiles live on the UFO toolbar and are mirrored here
      const existingProfiles = Array.isArray(w.ufoInstanceProfiles)
        ? (w.ufoInstanceProfiles as any[])
        : [];

      // Resolve a "pretty" class name from LABEL_MAP (for example "Minor UFO")
      const labelDef =
        LABEL_MAP.categories.find(
          (c) => c.name.toLowerCase() === cnameKey
        ) || null;

      const prettyClassName = labelDef?.name ?? class_name;

      // Track IDs already used for this class
      const existingTrackIds = existingProfiles
        .filter(
          (p) =>
            typeof p?.class_name === "string" &&
            p.class_name.toLowerCase() === cnameKey &&
            typeof p?.track_id === "string"
        )
        .map((p) => p.track_id as string);

      // Generate a new readable, unique track_id
      const readable = uniqueReadableId(existingTrackIds);
      const track_id = canonicalizeTrackId(readable);

      // Resolve class_id from registry or fixed map
      const reg = classRegistry;
      const regEntry =
        reg[cnameKey] || reg[prettyClassName] || undefined;

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

      const nextProfiles = [
        ...existingProfiles,
        {
          id,
          class_name: prettyClassName,
          class_id,
          track_id
        }
      ];

      // Mirror into window.* so AnnoBridge + toolbar see the new instance
      w.ufoInstanceProfiles = nextProfiles;
      w.ufoSelectedProfileId = id;
      w.ufoSelectedClassName = prettyClassName;
      w.ufoSelectedTrackId = track_id;
      w.ufoNotifySelectionChanged?.();

      // Post a ufo:state snapshot so the left toolbar updates its React state
      const profilePayload = nextProfiles.map((p: any) => ({
        class_name: p.class_name,
        class_id: p.class_id,
        track_id: p.track_id
      }));

      const selectedKey = `${prettyClassName.toLowerCase()}:${track_id}`;

      const detail = {
        includeTrackIds: true,
        profiles: profilePayload,
        selectedKey,
        selectedClassName: prettyClassName,
        lastClassName: prettyClassName,
        classRegistry
        // profileCounts is optional here; toolbar will keep its own scanner
      };

      window.dispatchEvent(
        new CustomEvent("ufo:state", { detail })
      );

      // Persist last class so it can be restored in future sessions
      saveLastClassName(prettyClassName);

      // Toast to confirm auto-created instance
      showToast(
        `New ${prettyClassName} instance: #${track_id}`
      );

      // Return descriptor so AnnoBridge can rewrite the duplicate annotation
      return { class_id, class_name: prettyClassName, track_id };
    },
    [classRegistry, showToast]
  );

  // onDeleted handler:
  // - persist current frame after deletion
  // - show a toast
  // - if the instance is now empty across all frames, prompt to delete it
  const handleAnnotationDeleted = useCallback(
    async (label: { class_name?: string; track_id?: string }) => {
      // Persist current frame after deletion
      await saveCurrentFrame();

      // Always show a simple deletion toast
      showToast("Annotation deleted.");

      const class_name = label.class_name;
      const track_id_raw = label.track_id;

      if (!class_name || !track_id_raw) {
        return;
      }

      const canonicalProfile = {
        class_name,
        track_id: canonicalizeTrackId(track_id_raw)
      };

      const total = await countAnnotationsForInstance(
        canonicalProfile
      );

      if (total === 0) {
        setEmptyInstanceProfile(canonicalProfile);
        setEmptyInstanceModalOpen(true);
      }
    },
    [saveCurrentFrame, countAnnotationsForInstance, showToast]
  );

  // ConfirmModal handler for deleting an empty instance profile.
  // When an instance has no annotations anywhere, we can also remove the
  // profile from the toolbar list and choose a sensible new selection.
  const confirmDeleteEmptyInstance = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !emptyInstanceProfile
    ) {
      setEmptyInstanceModalOpen(false);
      setEmptyInstanceProfile(null);
      return;
    }

    const w = window as any;

    const classNameKey =
      (emptyInstanceProfile.class_name || "").toLowerCase();
    const trackKey = canonicalizeTrackId(
      emptyInstanceProfile.track_id || ""
    );

    const existingProfiles = Array.isArray(w.ufoInstanceProfiles)
      ? (w.ufoInstanceProfiles as any[])
      : [];

    const remaining = existingProfiles.filter((p: any) => {
      const pClass = (p.class_name || "").toLowerCase();
      const pTrack = canonicalizeTrackId(p.track_id || "");
      return !(pClass === classNameKey && pTrack === trackKey);
    });

    let selectedProfileId: string | null =
      w.ufoSelectedProfileId ?? null;

    // If we just removed the selected profile, choose a fallback
    if (selectedProfileId) {
      const removedWasSelected = existingProfiles.some(
        (p: any) => {
          const pClass = (p.class_name || "").toLowerCase();
          const pTrack = canonicalizeTrackId(
            p.track_id || ""
          );
          return (
            p.id === selectedProfileId &&
            pClass === classNameKey &&
            pTrack === trackKey
          );
        }
      );

      if (removedWasSelected) {
        if (remaining.length > 0) {
          const last = remaining[remaining.length - 1];
          selectedProfileId = last.id;
          w.ufoSelectedProfileId = last.id;
          w.ufoSelectedClassName = last.class_name;
          w.ufoSelectedTrackId = last.track_id;
        } else {
          selectedProfileId = null;
          w.ufoSelectedProfileId = null;
          w.ufoSelectedClassName = null;
          w.ufoSelectedTrackId = null;
        }
      }
    }

    // Mirror back to window and notify FrameView / toolbar
    w.ufoInstanceProfiles = remaining;
    w.ufoNotifySelectionChanged?.();

    const profilePayload = remaining.map((p: any) => ({
      class_name: p.class_name,
      class_id: p.class_id,
      track_id: p.track_id
    }));

    let selectedKey: string | null = null;
    if (selectedProfileId && remaining.length > 0) {
      const matched = remaining.find(
        (p: any) => p.id === selectedProfileId
      );
      if (matched) {
        selectedKey = `${String(
          matched.class_name
        ).toLowerCase()}:${canonicalizeTrackId(
          matched.track_id || ""
        )}`;
      }
    }

    const detail = {
      includeTrackIds: true,
      profiles: profilePayload,
      selectedKey,
      selectedClassName:
        w.ufoSelectedClassName ?? null,
      lastClassName: w.ufoSelectedClassName ?? null,
      classRegistry
    };

    window.dispatchEvent(
      new CustomEvent("ufo:state", { detail })
    );

    setEmptyInstanceModalOpen(false);
    setEmptyInstanceProfile(null);
  }, [emptyInstanceProfile, classRegistry]);

  const cancelDeleteEmptyInstance = useCallback(() => {
    setEmptyInstanceModalOpen(false);
    setEmptyInstanceProfile(null);
  }, []);

  /**
   * Handler for "ufo:requestBulkDelete" events from the toolbar.
   * Computes a preview of how many annotations/frames will be affected,
   * then opens the per-instance bulk delete modal.
   */
  const onRequestBulkDelete = useCallback(
    async (profile: {
      class_name?: string;
      track_id?: string;
    }) => {
      if (!profile.class_name || !profile.track_id) return;

      const { total, frames } =
        await countAnnotationsForProfile(profile);

      setDeleteModalProfile({
        class_name: profile.class_name,
        track_id: profile.track_id
      });
      setDeletePreviewCounts({ total, frames });
      setDeleteModalOpen(true);
    },
    [countAnnotationsForProfile]
  );

  /**
   * Confirm bulk delete of instance annotations across ALL frames.
   * After deletion, refreshes the current frame overlay and optionally
   * triggers empty-instance cleanup.
   */
  const confirmBulkDelete = useCallback(async () => {
    if (!deleteModalProfile) {
      setDeleteModalOpen(false);
      setDeletePreviewCounts(null);
      return;
    }

    const { totalDeleted } = await deleteAnnotationsForProfile(
      deleteModalProfile
    );

    // Refresh current frame overlay and popup list
    try {
      const updated = await adapter.read();
      await bridgeRef.current?.clearOverlaySilently?.();
      if (updated && updated.length > 0) {
        await bridgeRef.current?.hydrateOverlay?.(
          updated,
          frameKey
        );
      }
      setPopupList((updated || []) as ImageAnnotation[]);
    } catch (err) {
      console.error(
        "Failed to refresh overlay after bulk delete",
        err
      );
    }

    showToast(
      totalDeleted > 0
        ? `Deleted ${totalDeleted} annotations for this instance.`
        : "No annotations to delete for this instance."
    );

    // After deletion, check if instance is now empty across all frames
    const remaining = await countAnnotationsForInstance(
      deleteModalProfile
    );
    if (remaining === 0) {
      setEmptyInstanceProfile({
        class_name: deleteModalProfile.class_name,
        track_id: canonicalizeTrackId(
          deleteModalProfile.track_id || ""
        )
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
    countAnnotationsForInstance
  ]);

  const cancelBulkDelete = useCallback(() => {
    setDeleteModalOpen(false);
    setDeletePreviewCounts(null);
    setDeleteModalProfile(null);
  }, []);

  /**
   * Compute preview for "Delete ALL instances & annotations" in this sample:
   * - total annotations
   * - total instances
   * - frames with annotations
   */
  const openDeleteAllInstances = useCallback(async () => {
    if (typeof window === "undefined") return;

    const w = window as any;
    const instanceProfiles = Array.isArray(w.ufoInstanceProfiles)
      ? (w.ufoInstanceProfiles as any[])
      : [];

    const storage = window.localStorage;
    const prefix =
      "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

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

      const anns = parsed as any[];
      if (anns.length > 0) {
        totalFrames += 1;
        totalAnnotations += anns.length;
      }
    }

    setDeleteAllPreview({
      totalAnnotations,
      totalInstances: instanceProfiles.length,
      totalFrames
    });
    setDeleteAllModalOpen(true);
  }, [projectId, sampleId]);

  /**
   * Confirm delete of ALL instances and annotations in this sample.
   * Wipes all per-frame keys in localStorage, clears the current overlay,
   * resets instance profiles on window.*, and notifies the toolbar.
   */
  const confirmDeleteAllInstances = useCallback(async () => {
    if (typeof window === "undefined") {
      setDeleteAllModalOpen(false);
      setDeleteAllPreview(null);
      return;
    }

    const storage = window.localStorage;
    const prefix =
      "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

    const keysToDelete: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      storage.removeItem(key);
    }

    // Clear current frame overlay
    await bridgeRef.current?.clearOverlaySilently?.();
    setPopupList([]);

    // Clear instance profiles and selection from window and notify toolbar
    const w = window as any;
    w.ufoInstanceProfiles = [];
    w.ufoSelectedProfileId = null;
    w.ufoSelectedClassName = null;
    w.ufoSelectedTrackId = null;
    w.ufoNotifySelectionChanged?.();

    const detail = {
      includeTrackIds: true,
      profiles: [],
      selectedKey: null,
      selectedClassName: null,
      lastClassName: null,
      classRegistry
    };
    window.dispatchEvent(
      new CustomEvent("ufo:state", { detail })
    );

    // Best-effort: clear "last class" info
    saveLastClassName("");

    setDeleteAllModalOpen(false);
    setDeleteAllPreview(null);

    showToast(
      "All instances and annotations cleared for this sample."
    );
  }, [projectId, sampleId, classRegistry, showToast]);

  const cancelDeleteAllInstances = useCallback(() => {
    setDeleteAllModalOpen(false);
    setDeleteAllPreview(null);
  }, []);

  /**
   * Event wiring from the toolbar:
   * - "ufo:requestBulkDelete" → open per-instance delete modal.
   * - "ufo:deleteAllInstances" → open delete-all modal.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const bulkHandler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      const profile = detail?.profile;
      if (!profile) return;
      void onRequestBulkDelete(profile);
    };

    window.addEventListener(
      "ufo:requestBulkDelete",
      bulkHandler as any
    );

    return () => {
      window.removeEventListener(
        "ufo:requestBulkDelete",
        bulkHandler as any
      );
    };
  }, [onRequestBulkDelete]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      void openDeleteAllInstances();
    };

    window.addEventListener(
      "ufo:deleteAllInstances",
      handler as any
    );

    return () => {
      window.removeEventListener(
        "ufo:deleteAllInstances",
        handler as any
      );
    };
  }, [openDeleteAllInstances]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Outer row: center our whole column (controls + image) in the remaining space */}
      <div className="w-full flex justify-center">
        {/* Inner column shrinks to content width (image) up to max-w-5xl */}
        <div className="inline-flex flex-col items-center gap-4 max-w-5xl">
          {/* Top bar: Jump-to-Frame centered ABOVE the navigation */}
          <div className="flex flex-col items-center gap-2">
            {onJump && (
              <div className="w-60 text-center">
                {/* Centered label above the field */}
                <div className="text-[13px] text-gray-200 mb-1">
                  Jump to Frame
                </div>
                <FrameSearch onJump={handleJump} />
              </div>
            )}

            {/* Centered navigation below the search field */}
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

          {/* Main area: image centered; viewport-bounded; no cropping */}
          <div className="overflow-visible">
            <Annotorious>
              <ImageAnnotator
                tool="rectangle"
                drawingEnabled={drawingEnabled}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${data.values}`}
                  alt={`Frame ${frameLabel}`}
                  /* Fit within the available area while preserving aspect ratio */
                  className="block mx-auto max-w-full h-auto object-contain max-h-[calc(100dvh-220px)] sm:max-h-[calc(100dvh-210px)]"
                  style={{
                    imageRendering: "pixelated",
                    maxHeight: "calc(100dvh - 240px)"
                  }}
                  draggable={false}
                />
              </ImageAnnotator>

              {/* Annotation popup – shows label + track + Delete for the clicked annotation */}
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

              {/* Imperative bridge – used for localStorage + dirty tracking */}
              <AnnoBridge
                ref={bridgeRef as any}
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

      {/* Modal: delete annotations for a single instance across all frames */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Delete instance annotations?"
        message="This will delete all annotations for this instance across all frames in this sample."
        details={
          deletePreviewCounts ? (
            <div className="space-y-1">
              <div>
                <strong>Total annotations:</strong>{" "}
                {deletePreviewCounts.total}
              </div>
              <div>
                <strong>Frames affected:</strong>{" "}
                {deletePreviewCounts.frames}
              </div>
            </div>
          ) : null
        }
        confirmLabel="Delete annotations"
        cancelLabel="Cancel"
        onConfirm={confirmBulkDelete}
        onCancel={cancelBulkDelete}
      />

      {/* Modal: delete ALL instances and annotations in this sample */}
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

      {/* Modal: delete empty instance profile once it has no annotations anywhere */}
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

// Props contract for UFOView; kept aligned with other task views
// even though some fields are unused here (for now).
type UFOViewInfo = {
  data: ImageData;
  annotations: Annotations;
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations
  ) => void;
  dataParams: DataParams;
  setDataParams: (
    updater: (dataParams: DataParams) => DataParams | DataParams
  ) => void;
  projectId: string;
  sampleId: string;
  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
};

/**
 * UFOView:
 *
 * Thin wrapper around FrameView that keeps the same props surface as
 * other task views (annotations/dataParams are currently unused here,
 * but preserved for future integration).
 */
export const UFOView = ({
  data,
  annotations,        // unused for now
  setAnnotations,      // unused for now
  dataParams,          // unused for now
  setDataParams,       // unused for now
  projectId,
  sampleId,
  onPrev,
  onNext,
  onJump
}: UFOViewInfo) => {
  return (
    <div className="w-full">
      <FrameView
        data={data}
        projectId={projectId}
        sampleId={sampleId}
        onPrev={onPrev}
        onNext={onNext}
        onJump={onJump}
      />
    </div>
  );
};
