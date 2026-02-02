"use client";

import React, {useState } from "react";
import type { Annotation, DataParams } from "@/types";
import { ImageDataSchema } from "@/types";
import { BACKEND_API_URL } from "@/app/core";

import { SearchField, Button, ButtonGroup } from "@adobe/react-spectrum";

import { useVideoSession } from "@/app/video/components/video-session";
import { FrameAnnotatorHost } from "@/app/video/components/frame-annotator-host";

/**
 * Small "jump to frame" input with validation. Delegates the actual navigation
 * to the parent via `onJump`.
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

export type VideoViewProps = {
  data: unknown; // ImageData
  projectId: string;
  sampleId: string;

  dataParams: DataParams;
  setDataParams: (
    updater: (prev: DataParams) => DataParams | DataParams,
  ) => void;

  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
};

/**
 * Frame annotator UI wrapper:
 * - Renders the frame navigation (prev/next + jump)
 * - Shows the current frame index (from session state)
 * - Seeds the session overlay from backend annotations (one-shot)
 *
 * Note: this component does not fetch frames. The parent drives frame changes by
 * updating dataParams and passing the new image when the backend responds.
 */
function VideoFrameAnnotator(props: {
  imageBase64: string;
  goToFrame: (n: number) => void;

  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
}) {

  const session = useVideoSession();

  const handlePrev = () => {
    const prev = Math.max(0, session.frame - 1);
    props.onPrev?.();
    props.goToFrame(prev);
  };

  const handleNext = () => {
    const next = session.frame + 1;

    // Forward-propagate current annotations into the next frame if that frame is empty.
    // This is purely in-session state; image loading is driven by goToFrame().
    session.forwardPropToNextIfEmpty(next);

    props.onNext?.();
    props.goToFrame(next);
  };

  const handleJump = (n: number) => {
    const target = Math.max(0, Math.trunc(n));
    props.onJump?.(target);
    props.goToFrame(target);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
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
              Frame {session.frame}
            </Button>
            <Button variant="primary" onPress={handleNext}>
              Next
            </Button>
          </ButtonGroup>
        </div>
      </div>

      {/* Frame annotator canvas (image + Annotorious overlay). */}
      <div className="w-full flex flex-col items-center gap-3">
        <FrameAnnotatorHost imageBase64={props.imageBase64} />
      </div>
    </div>
  );
}

/**
 * Render the image view and wire "go to frame" to the host page via dataParams.
 * This component assumes it is already inside a VideoSessionProvider.
 */
export function VideoViewInner(props: VideoViewProps) {
  const parsed = ImageDataSchema.safeParse(props.data);
  if (!parsed.success) {
    throw new Error("Invalid data for UFO view (expected ImageData)");
  }

  const imageBase64 = parsed.data.values;

  /**
   * Request a specific frame from the backend by updating dataParams.
   * The host page owns the fetch and is responsible for updating the session frame
   * once the backend response arrives.
   */
  const goToFrame = (n: number) => {
    if (!Number.isFinite(n)) return;
    const target = Math.max(0, Math.trunc(n));

    props.setDataParams(
      (prev) =>
        ({
          ...(prev as Record<string, unknown>),
          name: "image",
          frame: target,
        }) as DataParams,
    );
  };

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-5xl mx-auto px-4 py-3">
        <VideoFrameAnnotator
          imageBase64={imageBase64}
          goToFrame={goToFrame}
          onPrev={props.onPrev}
          onNext={props.onNext}
          onJump={props.onJump}
        />
      </div>
    </div>
  );
}
