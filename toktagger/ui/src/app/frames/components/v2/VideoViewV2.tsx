"use client";

import React, { useEffect, useLayoutEffect, useState } from "react";
import type { Annotation, DataParams } from "@/types";
import { ImageDataSchema } from "@/types";
import { BACKEND_API_URL } from "@/app/core";

import { SearchField, Button, ButtonGroup } from "@adobe/react-spectrum";

import { VideoSessionProvider, useVideoSession } from "@/app/frames/components/v2/video-session";
import { FrameAnnotatorHostV2 } from "./FrameAnnotatorHostV2";

/**
 * Backend save helper (same endpoint used by your existing VideoToolbar).
 */
async function saveVideoAnnotations(
  project_id: string,
  sample_id: string,
  annotations: Annotation[],
) {
  const url = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotations),
  });
  return response;
}

/**
 * Simple "jump to frame N" control (copied from the old view).
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

export type VideoViewV2Props = {
  data: unknown; // ImageData
  annotations: Annotation[];
  projectId: string;
  sampleId: string;

  dataParams: DataParams;
  setDataParams: (updater: (prev: DataParams) => DataParams | DataParams) => void;

  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
};

/**
 * VideoChromeV2
 * This lives INSIDE <VideoSessionProvider>, so it can call useVideoSession()
 * and do forward propagation on Next.
 *
 * NOTE: We deliberately removed the inline VideoToolbarV2 from here,
 * because the v2 left sidebar will own class/instance selection + save + sample nav.
 */
function VideoChromeV2(props: {
  imageBase64: string;
  dbAnnotations: Annotation[];
  onSaveBackend: (payload: Annotation[]) => Promise<void>;
  goToFrame: (n: number) => void;

  frameLabel: number;

  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
}) {
  const session = useVideoSession();

  // One-shot seed from backend annotations (no-op if session already has data)
  useEffect(() => {
    session.seedFromDbIfEmpty(props.dbAnnotations);
  }, [session, props.dbAnnotations]);

  const handlePrev = () => {
    props.onPrev?.();
    props.goToFrame(props.frameLabel - 1);
  };

  const handleNext = () => {
    const next = props.frameLabel + 1;

    // ✅ Forward propagate current -> next if next is empty
    session.forwardPropToNextIfEmpty(next);

    props.onNext?.();
    props.goToFrame(next);
  };

  const handleJump = (n: number) => {
    props.onJump?.(n);
    props.goToFrame(n);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Top controls (mirrors old FrameView UX) */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-60 text-center">
          <div className="text-[13px] text-gray-200 mb-1">Jump to Frame</div>
          <FrameSearch onJump={handleJump} />
        </div>

        <div className="flex justify-center">
          <ButtonGroup>
            <Button variant="primary" onPress={handlePrev}>
              Prev
            </Button>
            <Button variant="primary" isDisabled>
              Frame {props.frameLabel}
            </Button>
            <Button variant="primary" onPress={handleNext}>
              Next
            </Button>
          </ButtonGroup>
        </div>
      </div>

      {/* Main v2 UI */}
      <div className="w-full flex flex-col gap-3">
        <FrameAnnotatorHostV2 imageBase64={props.imageBase64} />
      </div>
    </div>
  );
}

/**
 * Providerless inner view:
 * Use this when the page/layout already wraps VideoSessionProvider
 * (so the left sidebar can also access useVideoSession()).
 */
export function VideoViewV2Inner(props: VideoViewV2Props) {
  const parsed = ImageDataSchema.safeParse(props.data);
  if (!parsed.success) {
    throw new Error("Invalid data for UFO view (expected ImageData)");
  }

  const imageBase64 = parsed.data.values;
  const frameFromBackend = Number(parsed.data.frame);

  if (!Number.isFinite(frameFromBackend)) {
    throw new Error("UFO ImageData.frame is not a finite number");
  }

  const frameLabel = frameFromBackend;

  /**
   * Single navigation primitive: request frame n from backend
   */
  const goToFrame = (n: number) => {
    if (!Number.isFinite(n)) return;
    const target = Math.max(0, Math.trunc(n));

    props.setDataParams((prev) => ({
      ...(prev as any),
      name: "image",
      frame: target,
    }) as DataParams);
  };

  const onSaveBackend = async (payload: Annotation[]) => {
    const res = await saveVideoAnnotations(props.projectId, props.sampleId, payload);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `Failed to save video annotations (${res.status}): ${txt || res.statusText}`,
      );
    }
  };

  return (
    <div className="flex-1 flex justify-center">
      <div className="w-full max-w-5xl px-4 py-3">
        <VideoChromeV2
          imageBase64={imageBase64}
          dbAnnotations={props.annotations}
          onSaveBackend={onSaveBackend}
          goToFrame={goToFrame}
          frameLabel={frameLabel}
          onPrev={props.onPrev}
          onNext={props.onNext}
          onJump={props.onJump}
        />
      </div>
    </div>
  );
}

/**
 * Backwards-compatible wrapper (still works standalone).
 * We will NOT use this in SamplePage UFO-v2 mode, because it would create a second provider.
 */
export function VideoViewV2(props: VideoViewV2Props) {
  const parsed = ImageDataSchema.safeParse(props.data);
  if (!parsed.success) {
    throw new Error("Invalid data for UFO view (expected ImageData)");
  }

  const frameFromBackend = Number(parsed.data.frame);
  if (!Number.isFinite(frameFromBackend)) {
    throw new Error("UFO ImageData.frame is not a finite number");
  }

  const [frame, setFrame] = useState<number>(frameFromBackend);

  useLayoutEffect(() => {
    if (frame !== frameFromBackend) setFrame(frameFromBackend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameFromBackend]);

  return (
    <VideoSessionProvider
      projectId={props.projectId}
      sampleId={props.sampleId}
      frame={frame}
      setFrame={setFrame}
    >
      <VideoViewV2Inner {...props} />
    </VideoSessionProvider>
  );
}
