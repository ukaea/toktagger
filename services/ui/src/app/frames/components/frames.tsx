"use client";

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
import { SearchField } from "@adobe/react-spectrum";
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
 * Simple Jump control: user types a frame number, we call onJump(n).
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
      label="Jump to Frame"
      onSubmit={onSearchSubmit}
      validationState={errorMessage ? "invalid" : undefined}
      errorMessage={errorMessage}
    />
  );
}

/**
 * Phase 3 + 4: Frame annotator + per-frame localStorage + dumb navigation +
 * window helpers for toolbar integration.
 *
 * Phase 5 bits:
 * - forward propagation on Next
 * - selected profile / class are read from global UFO toolbar via window.*.
 *
 * Phase 2 bits:
 * - onAutoQuickAdd wiring to auto-create new instances when a duplicate
 *   (class_name, track_id) is drawn.
 *
 * Phase 3 bits:
 * - ImageAnnotationPopup + ClassInfoPopup
 * - onDeleted → save, re-count annotations, empty-instance cleanup flow.
 *
 * - base64 PNG → <img src="data:image/png;base64,...">
 * - Rectangle-only drawing
 * - Per-frame storage via W3CImageFormat + buildSourceKey
 * - Prev/Next/Jump:
 *   - On navigate: save current frame via bridge.persistWorkingNow → adapter.write.
 *   - Then call onPrev/onNext/onJump (which just tweak dataParams upstream).
 * - Expose:
 *   - window.ufoHasUnsavedChanges()
 *   - window.ufoMarkSaved()
 *   - window.ufoCollectForSave()
 *   - window.ufoClearCurrent()
 *   - window.ufoClearAllFrames()
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

  // Bump this whenever the toolbar changes the selected instance,
  // so drawingEnabled can react.
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

  // Empty-instance cleanup state (Phase 3)
  const [emptyInstanceModalOpen, setEmptyInstanceModalOpen] =
    useState(false);
  const [emptyInstanceProfile, setEmptyInstanceProfile] = useState<{
    class_name?: string;
    track_id?: string;
  } | null>(null);

  // --- Hydrate from localStorage when the annotator is ready ---
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

  // Helper: persist current frame immediately
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

  // Forward propagation: seed next frame with current annotations if it's empty
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

  // --- Background auto-save loop (small, cheap) ---
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

  // --- Expose dirty helpers on window for future toolbar wiring ---
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

  // --- Expose save collector on window: flush current frame, then sweep ALL frames in this sample ---
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

  // --- Expose Clear Current on window for toolbar integration ---
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

  // --- Expose Clear ALL (multi-frame wipe) on window for toolbar integration ---
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

  // --- Navigation handlers: save → then call upstream handler ---
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

  // Count annotations for a given (class_name, track_id) across ALL frames in this sample
  const countAnnotationsForInstance = useCallback(
    async (info: { class_name?: string; track_id?: string }) => {
      if (typeof window === "undefined") return 0;

      const className = (info.class_name || "").toLowerCase();
      const trackKey = canonicalizeTrackId(info.track_id || "");

      if (!className || !trackKey) return 0;

      const storage = window.localStorage;
      const prefix =
        "anno::w3c::" + `app://p/${projectId}/s/${sampleId}/f/`;

      let total = 0;

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
          }
        }
      }

      return total;
    },
    [projectId, sampleId]
  );

  // Phase 2 – Quick-add-by-drawing (auto instance creation)
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

      // Resolve a "pretty" class name from LABEL_MAP (e.g. "Minor UFO")
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

      // Persist last class, as in the old branch
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

  // Phase 3 — onDeleted handler: persist, re-count, empty-instance cleanup
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

  // Phase 3 — ConfirmModal handlers for deleting empty instance profile
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

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Simple nav bar */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={!onPrev}
            className="px-3 py-1 rounded border border-gray-400 text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-gray-700">
            Frame: {frameLabel}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!onNext}
            className="px-3 py-1 rounded border border-gray-400 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>

        {onJump && (
          <div className="mt-1">
            <FrameSearch onJump={handleJump} />
          </div>
        )}
      </div>

      {/* Annotorious + image */}
      <Annotorious>
        <ImageAnnotator
          tool="rectangle"
          drawingEnabled={drawingEnabled}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${data.values}`}
            alt={`Frame ${frameLabel}`}
            style={{ imageRendering: "pixelated" }}
          />
        </ImageAnnotator>

        {/* Annotation popup – label + track + Delete */}
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

      {/* Phase 3 – Delete empty instance? */}
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
 * Phase 3/4 UFOView:
 *
 * - Wraps FrameView.
 * - Still ignores global annotations + toolbar for now.
 * - Adds navigation via onPrev/onNext/onJump.
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
    <div className="flex space-y-3">
      <div className="flex-1 text-center items-center">
        <FrameView
          data={data}
          projectId={projectId}
          sampleId={sampleId}
          onPrev={onPrev}
          onNext={onNext}
          onJump={onJump}
        />
      </div>
    </div>
  );
};
