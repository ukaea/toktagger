"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo
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

/** (Kept for later phases) Jump to frame via Spectrum SearchField.
 *  For Phase 1 we won't actually use it inside UFOView yet.
 */
export function FrameSearch({ setDataParams }: { setDataParams: (updater: (prev: DataParams) => DataParams) => void }) {
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
          frame: Number(frame_num),
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
 * Phase 1: Minimal frame annotator.
 *
 * - Takes base64 PNG string from ImageData.values
 * - Renders <img> inside Annotorious ImageAnnotator
 * - Tool: rectangle
 * - No caching, no localStorage, no profiles, no toolbar wiring.
 */
export function FrameView({ data }: { data: ImageData }) {
  const bridgeRef = useRef<BridgeHandle | null>(null);

  // For Phase 1, we don't use profiles or classes yet.
  const getSelectedProfile = useCallback(() => null, []);
  const getSelectedClassName = useCallback(() => null, []);
  const includeTrackIds = false;
  const classRegistry: ClassRegistry = useMemo(() => ({}), []);

  const frameLabel = typeof data.frame === "number" ? data.frame : "?";

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-700">Frame: {frameLabel}</p>
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

        {/* Imperative bridge – ready for later features (localStorage, save, etc.) */}
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
};

/**
 * Phase 1 UFOView:
 *
 * - Just wraps FrameView.
 * - Ignores global annotations + toolbar for now.
 * - We **do not** use FrameSearch yet (single-frame focus).
 */
export const UFOView = ({
  data,
  annotations,        // unused for Phase 1
  setAnnotations,      // unused for Phase 1
  dataParams,          // unused for Phase 1
  setDataParams        // unused for Phase 1
}: UFOViewInfo) => {
  return (
    <div className="flex space-y-3">
      <div className="flex-1 text-center items-center">
        <FrameView data={data} />
      </div>
    </div>
  );
};
