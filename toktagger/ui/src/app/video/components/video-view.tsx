"use client";

import React, { useState } from "react";
import { Annotorious } from "@annotorious/react";
import type { DataParams } from "@/types";
import { ImageDataSchema } from "@/types";
import { SearchField, Button, ButtonGroup } from "@adobe/react-spectrum";
import {
  VideoSessionProvider,
  useVideoSession,
} from "@/app/video/components/video-session";
import { FrameAnnotatorHost } from "@/app/video/components/frame-annotator-host";
import { useSample } from "@/app/contexts/SampleContext";
import { VideoNavAdapterBridge } from "@/app/video/components/video-nav-adapter";
import { useParams } from "react-router-dom";

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
}) {
  const session = useVideoSession();
  const { videoFrameBounds } = useSample();

  const prevDisabled =
    videoFrameBounds.min !== null && session.frame <= videoFrameBounds.min;
  const nextDisabled =
    videoFrameBounds.max !== null && session.frame >= videoFrameBounds.max;

  const handlePrev = () => {
    if (prevDisabled) return;
    const prev = Math.max(0, session.frame - 1);
    props.goToFrame(prev);
  };

  const handleNext = () => {
    if (nextDisabled) return;
    const next = session.frame + 1;

    // Forward-propagate current annotations into the next frame if that frame is empty.
    // This is purely in-session state; image loading is driven by goToFrame().
    if (session.propagate) session.forwardPropToNextIfEmpty(next);

    props.goToFrame(next);
  };

  const handleJump = (n: number) => {
    const target = Math.max(0, Math.trunc(n));
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
            <Button
              variant="primary"
              onPress={handlePrev}
              isDisabled={prevDisabled}
            >
              Prev
            </Button>
            <Button variant="primary" isDisabled>
              Frame {session.frame}
            </Button>
            <Button
              variant="primary"
              onPress={handleNext}
              isDisabled={nextDisabled}
            >
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

export function VideoProviders({ children }: { children: React.ReactNode }) {
  const { project_id, sample_id } = useParams();
  const { data, annotations, dataParams } = useSample();

  if (!project_id || !sample_id || !data) {
    return <>{children}</>;
  }

  return (
    <Annotorious>
      <VideoSessionProvider
        key={`${project_id}:${sample_id}`}
        projectId={project_id}
        sampleId={sample_id}
        data={data}
        dataParams={dataParams}
        dbAnnotations={annotations ?? []}
      >
        <VideoNavAdapterBridge>{children}</VideoNavAdapterBridge>
      </VideoSessionProvider>
    </Annotorious>
  );
}

/**
 * Render the image view and wire "go to frame" through SampleContext.
 * This component assumes it is already inside a VideoSessionProvider.
 */
export function VideoView() {
  const { data, setDataParams } = useSample();

  if (!data) return null;

  const parsed = ImageDataSchema.safeParse(data);
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

    setDataParams(
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
        <VideoFrameAnnotator imageBase64={imageBase64} goToFrame={goToFrame} />
      </div>
    </div>
  );
}
