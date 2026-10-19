/**
 * Entry point for the video view: the providers it needs and the page layout.
 * Also owns frame navigation, which works by asking SampleContext for a new frame.
 */
import React, { useEffect } from "react";
import { Annotorious } from "@annotorious/react";
import { ImageDataSchema } from "@/types";
import {
  ActionButton,
  Button,
  Flex,
  Grid,
  ProgressCircle,
  Text,
} from "@adobe/react-spectrum";
import Label from "@spectrum-icons/workflow/Label";
import {
  VideoSessionProvider,
  useVideoSession,
} from "@/app/video/components/video-session";
import { FrameAnnotatorHost } from "@/app/video/components/frame-annotator-host";
import { VideoAnnotationToolbar } from "@/app/video/components/video-annotation-toolbar";
import { FrameJumpField } from "@/app/video/components/ui_elements";
import { VideoAnnotationsTable } from "@/app/video/components/video-annotations-table";
import { useSample } from "@/app/contexts/SampleContext";
import { VideoNavAdapterBridge } from "@/app/video/components/video-nav-adapter";
import {
  VideoUiStateProvider,
  useVideoUiState,
} from "@/app/contexts/VideoContext";
import { useParams } from "react-router-dom";

import { AnnotationPopup } from "@/app/video/components/annotation-popup";

/** Badges for the current frame's frame labels. Clicking one opens its popup. */
function FrameLabelBadges() {
  const { frame, frameLabels, hideAnnotations, editMode, removeFrameLabel } =
    useVideoSession();
  const [selectedBadgeKey, setSelectedBadgeKey] = React.useState<string | null>(
    null,
  );

  useEffect(() => {
    setSelectedBadgeKey(null);
  }, [frame, frameLabels, hideAnnotations]);

  if (hideAnnotations || frameLabels.length === 0) return null;

  return (
    <Flex direction="column" gap="size-100" alignItems="start">
      {frameLabels.map((frameLabel) => {
        const badgeKey = `${frameLabel.label}::${frameLabel.track_id}`;
        const isSelected = selectedBadgeKey === badgeKey;

        return (
          <Flex key={badgeKey} position="relative">
            <ActionButton
              aria-label={`Frame label: ${frameLabel.label}`}
              onPress={() =>
                setSelectedBadgeKey((prev) =>
                  prev === badgeKey ? null : badgeKey,
                )
              }
            >
              <Label aria-hidden="true" />
              <Text>{frameLabel.label}</Text>
            </ActionButton>

            {isSelected && (
              <Flex
                position="absolute"
                zIndex={60}
                direction="column"
                gap="size-100"
                left="100%"
                top={0}
              >
                <AnnotationPopup
                  className={frameLabel.label}
                  trackId={frameLabel.track_id}
                  heading="Frame label"
                  details={`Frame ${frame} · ${frameLabel.created_by}`}
                  deleteDisabled={!editMode}
                  onDeleteBox={() => {
                    setSelectedBadgeKey(null);
                    removeFrameLabel(frameLabel.label, frameLabel.track_id);
                  }}
                  onClose={() => setSelectedBadgeKey(null)}
                />
              </Flex>
            )}
          </Flex>
        );
      })}
    </Flex>
  );
}

/** The Prev / Frame / Next controls and the image. Saves the frame's edits before leaving it. */
function VideoFrameAnnotator(props: {
  imageBase64: string;
  desiredFrame: number;
  goToFrame: (n: number) => boolean;
  goToRelativeFrame: (delta: number, fallbackFrame: number) => number | null;
}) {
  const session = useVideoSession();
  const { videoFrameBounds, isLoading } = useSample();
  const isFramePending = isLoading && props.desiredFrame !== session.frame;

  const prevDisabled =
    props.desiredFrame <= 0 ||
    (videoFrameBounds.min !== null &&
      props.desiredFrame <= videoFrameBounds.min);
  const nextDisabled =
    videoFrameBounds.max !== null && props.desiredFrame >= videoFrameBounds.max;

  const handlePrev = () => {
    if (prevDisabled) return;
    const prev = props.goToRelativeFrame(-1, session.frame);
    if (prev === null) return;
    session.flushCurrentFrameOverlay();
  };

  const handleNext = () => {
    if (nextDisabled) return;
    const next = props.goToRelativeFrame(1, session.frame);
    if (next === null) return;

    session.flushCurrentFrameOverlay();

    // Propagation: copy manual instances that are missing from the next frame onto it
    if (session.editMode && session.propagate) {
      session.forwardPropMissingManualToNext(next);
    }
  };

  const handleJump = (n: number) => {
    const target = Math.max(0, Math.trunc(n));
    if (!props.goToFrame(target)) return;
    session.flushCurrentFrameOverlay();
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <Flex alignItems="start" gap="size-100">
        <Button
          variant="primary"
          onPress={handlePrev}
          isDisabled={prevDisabled}
        >
          Prev
        </Button>
        <FrameJumpField frame={props.desiredFrame} onJump={handleJump} />
        <Button
          variant="primary"
          onPress={handleNext}
          isDisabled={nextDisabled}
        >
          Next
        </Button>
      </Flex>

      {/* Frame label badges, then the image. The empty spacer column keeps the image centred. */}
      <Grid
        width="100%"
        columns={["size-1600", "1fr", "size-1600"]}
        areas={["labels viewer spacer"]}
        columnGap="size-200"
        alignItems="start"
      >
        <Flex gridArea="labels" alignItems="end">
          <FrameLabelBadges />
        </Flex>
        <Flex
          gridArea="viewer"
          position="relative"
          width="100%"
          direction="column"
          alignItems="center"
          gap="size-150"
        >
          <FrameAnnotatorHost imageBase64={props.imageBase64} />
          {isFramePending && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <ProgressCircle
                aria-label={`Loading frame ${props.desiredFrame}`}
                size="L"
                isIndeterminate
              />
            </div>
          )}
        </Flex>
      </Grid>
    </div>
  );
}

/** Providers for the video view. They also wrap the left toolbox, so it can use the session. */
export function VideoProviders({ children }: { children: React.ReactNode }) {
  return (
    <VideoUiStateProvider>
      <VideoProvidersInner>{children}</VideoProvidersInner>
    </VideoUiStateProvider>
  );
}

function VideoProvidersInner({ children }: { children: React.ReactNode }) {
  const { project_id, sample_id } = useParams();
  const { data } = useSample();
  const { videoPropagate, setVideoPropagate } = useVideoUiState();

  if (!project_id || !sample_id || !data) {
    return <>{children}</>;
  }

  return (
    <Annotorious>
      {/* Keyed by sample so the session starts fresh for each sample. */}
      <VideoSessionProvider
        key={`${project_id}:${sample_id}`}
        projectId={project_id}
        sampleId={sample_id}
        propagate={videoPropagate}
        setPropagate={setVideoPropagate}
      >
        <VideoNavAdapterBridge>{children}</VideoNavAdapterBridge>
      </VideoSessionProvider>
    </Annotorious>
  );
}

/** The video view's layout. Must be rendered inside VideoProviders. */
export function VideoView() {
  const { data, dataParams, setDataParams } = useSample();
  // The requested frame, updated straight away so quick repeated clicks step on from it
  const desiredFrameRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (
      dataParams.name === "image" &&
      typeof dataParams.frame === "number" &&
      Number.isFinite(dataParams.frame)
    ) {
      desiredFrameRef.current = dataParams.frame;
      return;
    }

    const currentData = ImageDataSchema.safeParse(data);
    if (currentData.success) {
      desiredFrameRef.current = currentData.data.frame;
    }
  }, [data, dataParams]);

  if (!data) return null;

  const parsed = ImageDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid data for video view (expected ImageData)");
  }

  const imageBase64 = parsed.data.values;
  const desiredFrame =
    dataParams.name === "image" &&
    typeof dataParams.frame === "number" &&
    Number.isFinite(dataParams.frame)
      ? dataParams.frame
      : parsed.data.frame;

  // SampleContext fetches the frame when dataParams changes, so this only sets the request
  const goToFrame = (n: number): boolean => {
    if (!Number.isFinite(n)) return false;
    const target = Math.max(0, Math.trunc(n));
    const currentDesiredFrame = desiredFrameRef.current ?? desiredFrame;
    if (target === currentDesiredFrame) return false;

    desiredFrameRef.current = target;

    setDataParams((prev) => {
      if (prev.name === "image" && prev.frame === target) return prev;

      return {
        ...prev,
        name: "image",
        frame: target,
      };
    });

    return true;
  };

  const goToRelativeFrame = (
    delta: number,
    fallbackFrame: number,
  ): number | null => {
    if (!Number.isFinite(delta)) return null;

    const currentDesiredFrame =
      desiredFrameRef.current ?? Math.max(0, Math.trunc(fallbackFrame));
    const target = Math.max(
      0,
      Math.trunc(currentDesiredFrame + Math.trunc(delta)),
    );
    if (target === currentDesiredFrame) return null;

    desiredFrameRef.current = target;

    setDataParams((prev) => {
      const previousDesiredFrame =
        prev.name === "image" &&
        typeof prev.frame === "number" &&
        Number.isFinite(prev.frame)
          ? prev.frame
          : Math.max(0, Math.trunc(fallbackFrame));
      const nextFrame = Math.max(
        0,
        Math.trunc(previousDesiredFrame + Math.trunc(delta)),
      );

      if (nextFrame === previousDesiredFrame) return prev;

      return {
        ...prev,
        name: "image",
        frame: nextFrame,
      };
    });

    return target;
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="flex w-full justify-between">
        <div className="min-w-0 flex-1 px-4 py-3">
          <Flex direction="column" gap="size-200">
            <VideoFrameAnnotator
              imageBase64={imageBase64}
              desiredFrame={desiredFrame}
              goToFrame={goToFrame}
              goToRelativeFrame={goToRelativeFrame}
            />
            <VideoAnnotationsTable />
          </Flex>
        </div>
        <VideoAnnotationToolbar desiredFrame={desiredFrame} />
      </div>
    </div>
  );
}
