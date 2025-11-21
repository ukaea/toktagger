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
  ImageAnnotator
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

/** (Kept for later phases) Jump to frame via Spectrum SearchField.
 *  For Phase 2 we still treat UI as single-frame, but this is ready for later.
 */
export function FrameSearch({
  setDataParams
}: {
  setDataParams: (updater: (prev: DataParams) => DataParams) => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onSearchSubmit = async (newValue: string) => {
    if (newValue === "") {
      setErrorMessage("");
    } else if (/^[0-9]*$/.test(newValue)) {
      setErrorMessage("");
      const frame_num = newValue;
      try {
        setDataParams((prev) => ({
          ...prev,
          name: "image",
          frame: Number(frame_num)
        }));
      } catch (err) {
        console.error("Failed to fetch data:", err);
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
 * Phase 2: Minimal frame annotator + per-frame localStorage.
 *
 * - Takes base64 PNG string from ImageData.values
 * - Renders <img> inside Annotorious ImageAnnotator
 * - Tool: rectangle
 * - LocalStorage per frame via W3CImageFormat + buildSourceKey
 * - Still NO navigation, NO profiles, NO toolbar wiring.
 */
export function FrameView({
  data,
  projectId,
  sampleId
}: {
  data: ImageData;
  projectId: string;
  sampleId: string;
}) {
  const bridgeRef = useRef<BridgeHandle | null>(null);

  // For Phase 2, we still don't use profiles or classes.
  const getSelectedProfile = useCallback(() => null, []);
  const getSelectedClassName = useCallback(() => null, []);
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

  // --- Phase 2: hydrate from localStorage when the annotator is ready ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = await adapter.read();
      if (cancelled || !stored || stored.length === 0) return;

      const attemptHydrate = async () => {
        if (cancelled) return;
        const ready = bridgeRef.current?.isAnnotatorReady?.() ?? false;
        if (!ready) {
          // try again shortly until Annotorious is ready
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

  // --- Phase 2: background auto-save via dirty helpers ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const interval = window.setInterval(() => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      if (bridge.hasUnsaved()) {
        void (async () => {
          try {
            const list = await bridge.persistWorkingNow(frameKey);
            await adapter.write(list);
            bridge.markSaved();
          } catch (err) {
            // For now we just log; failures shouldn't break the UI
            console.error("Auto-save failed:", err);
          }
        })();
      }
    }, 1000); // small, cheap check once a second

    return () => {
      window.clearInterval(interval);
    };
  }, [adapter, frameKey]);

  // --- Phase 2: expose dirty helpers on window for future toolbar wiring ---
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

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-700">
        Frame: {frameLabel}
      </p>
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

        {/* Imperative bridge – now used for localStorage + dirty tracking */}
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
};

/**
 * Phase 2 UFOView:
 *
 * - Just wraps FrameView.
 * - Ignores global annotations + toolbar for now.
 * - Single-frame focus.
 */
export const UFOView = ({
  data,
  annotations, // unused for Phase 2
  setAnnotations, // unused for Phase 2
  dataParams, // unused for Phase 2
  setDataParams, // unused for Phase 2
  projectId,
  sampleId
}: UFOViewInfo) => {
  return (
    <div className="flex space-y-3">
      <div className="flex-1 text-center items-center">
        <FrameView
          data={data}
          projectId={projectId}
          sampleId={sampleId}
        />
      </div>
    </div>
  );
};
