"use client";

import React, { useEffect, useState } from "react";
import { Annotorious } from "@annotorious/react";
import type { DataParams } from "@/types";
import { ImageDataSchema } from "@/types";
import { TextField, Button, Flex, Text } from "@adobe/react-spectrum";
import {
  VideoSessionProvider,
  useVideoSession,
} from "@/app/video/components/video-session";
import { FrameAnnotatorHost } from "@/app/video/components/frame-annotator-host";
import { useSample } from "@/app/contexts/SampleContext";
import { useSampleHistory } from "@/app/contexts/SampleHistoryContext";
import { VideoNavAdapterBridge } from "@/app/video/components/video-nav-adapter";
import { useParams } from "react-router-dom";

/**
 * Editable center control for frame navigation.
 * Keeps the current frame visible and supports Enter-to-jump with validation.
 */
export function FrameJumpField(props: {
  frame: number;
  onJump: (n: number) => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [draftValue, setDraftValue] = useState<string>(String(props.frame));

  useEffect(() => {
    setDraftValue(String(props.frame));
    setErrorMessage("");
  }, [props.frame]);

  const onSubmit = () => {
    const trimmed = draftValue.trim();
    if (trimmed === "") {
      setDraftValue(String(props.frame));
      setErrorMessage("");
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 0) {
      setErrorMessage("");
      props.onJump(Math.trunc(parsed));
      return;
    }

    setErrorMessage("Please enter a number.");
  };

  return (
    <Flex direction="column" alignItems="center" gap="size-50">
      <Flex alignItems="center" gap="size-100">
        <Text>Frame</Text>
        <TextField
          aria-label="Frame number"
          isQuiet
          value={draftValue}
          onChange={(value) => {
            setDraftValue(value);
            if (errorMessage) setErrorMessage("");
          }}
          onFocus={(event) => {
            if (event.target instanceof HTMLInputElement) {
              event.target.select();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
          onBlur={() => {
            setDraftValue(String(props.frame));
            setErrorMessage("");
          }}
          validationState={errorMessage ? "invalid" : undefined}
          errorMessage={errorMessage || undefined}
          width="size-600"
        />
      </Flex>
    </Flex>
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
    session.frame <= 0 ||
    (videoFrameBounds.min !== null && session.frame <= videoFrameBounds.min);
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
        <div className="flex justify-center">
          <div className="flex items-start gap-2">
            <Button
              variant="primary"
              onPress={handlePrev}
              isDisabled={prevDisabled}
            >
              Prev
            </Button>
            <FrameJumpField frame={session.frame} onJump={handleJump} />
            <Button
              variant="primary"
              onPress={handleNext}
              isDisabled={nextDisabled}
            >
              Next
            </Button>
          </div>
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
  const { videoPropagate, setVideoPropagate } = useSampleHistory();

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
        propagate={videoPropagate}
        setPropagate={setVideoPropagate}
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
