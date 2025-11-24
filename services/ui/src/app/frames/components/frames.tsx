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
import type { ClassRegistry } from "./lib";
import { W3CImageFormat, buildSourceKey } from "./adapters";

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
 * - selected profile / class are read from global UFO toolbar via window.*
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

  // Profiles / classes are owned by the left toolbar (global UFO toolbar).
  // We just read the current selection from window so AnnoBridge can use it.
  const getSelectedProfile = useCallback(() => {
    if (typeof window === "undefined") return null;
    // Toolbar writes this when project.task === "UFO"
    return (window as any).ufoSelectedProfileId ?? null;
  }, []);

  const getSelectedClassName = useCallback(() => {
    if (typeof window === "undefined") return null;
    // Toolbar writes this when project.task === "UFO"
    return (window as any).ufoSelectedClassName ?? null;
  }, []);

  // Track IDs are still disabled in this branch
  const includeTrackIds = false;
  const classRegistry: ClassRegistry = useMemo(() => ({}), []);

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

  // --- Hydrate from localStorage when the annotator is ready ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = await adapter.read();
      if (cancelled || !stored || stored.length === 0) return;

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

  // Helper: persist current frame immediately
  const saveCurrentFrame = useCallback(
    async (): Promise<ImageAnnotation[]> => {
      const bridge = bridgeRef.current;
      if (!bridge) return [];

      try {
        const list = await bridge.persistWorkingNow(frameKey);
        await adapter.write(list);
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

  // --- Expose minimal save collector on window for toolbar integration ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoCollectForSave = async () => {
      // One-frame only for now (no sweep across localStorage)
      const list =
        (await bridgeRef.current?.persistWorkingNow?.(frameKey)) ?? [];
      return list;
    };

    return () => {
      delete (window as any).ufoCollectForSave;
    };
  }, [frameKey]);

  // --- Expose Clear Current on window for toolbar integration ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).ufoClearCurrent = async () => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      // Clear overlay and wipe this frame's stored annotations
      await bridge.clearOverlaySilently();
      await adapter.write([]);
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
        {/* Rectangle drawing enabled at all times for now */}
        <ImageAnnotator tool="rectangle" drawingEnabled={true}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${data.values}`}
            alt={`Frame ${frameLabel}`}
            style={{ imageRendering: "pixelated" }}
          />
        </ImageAnnotator>

        {/* Imperative bridge – used for localStorage + dirty tracking */}
        <AnnoBridge
          ref={bridgeRef as any}
          getSelectedProfile={getSelectedProfile}
          getSelectedClassName={getSelectedClassName}
          includeTrackIds={includeTrackIds}
          classRegistry={classRegistry}
        />
      </Annotorious>
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
