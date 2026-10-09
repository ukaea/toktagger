"use client";

import { useEffect, useMemo } from "react";
import {
  Content,
  ContextualHelp,
  Switch,
  Divider,
  Flex,
  Heading,
  Text,
} from "@adobe/react-spectrum";

import { useVideoSession } from "@/app/video/components/video-session";
import { useSample } from "@/app/contexts/SampleContext";
import { useVideoUiState } from "@/app/contexts/VideoContext";
import { ClassPanel as VideoClassPanel } from "@/app/video/components/ui_elements";

export function VideoToolbox() {
  const session = useVideoSession();
  const { annotationLabels } = useSample();
  const { videoLastClassName, setVideoLastClassName } = useVideoUiState();
  const labels = annotationLabels;

  // Restore the last selected class, or default to the first configured label.
  useEffect(() => {
    if (session.selection.className) return;

    const firstClassName = labels[0]?.name ?? null;
    const lastClassName =
      videoLastClassName &&
      labels.some((label) => label.name === videoLastClassName)
        ? videoLastClassName
        : null;
    const nextClassName = lastClassName ?? firstClassName;

    if (!nextClassName) return;

    session.setSelection({
      className: nextClassName,
      trackId: null,
      source: null,
    });

    if (nextClassName !== videoLastClassName) {
      setVideoLastClassName(nextClassName);
    }
  }, [labels, session, setVideoLastClassName, videoLastClassName]);

  const classItems = useMemo(() => {
    return labels.map((c) => ({ name: c.name }));
  }, [labels]);

  const onSelectClassName = (name: string | null) => {
    const cls = (name ?? "").trim();
    if (!cls) return;

    session.setSelection({ className: cls, trackId: null, source: "explicit" });
    setVideoLastClassName(cls);
  };

  return (
    <div className="w-full">
      <Divider size="S" marginX="size-200" />
      <div className="px-4 py-4">
        <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Frame Tools
        </div>
        <Flex
          alignItems="center"
          justifyContent="center"
          direction="column"
          gap="size-100"
        >
          <div className="w-[170px] flex justify-start">
            <Flex direction="row" alignItems="center" gap="size-50">
              <Switch
                isSelected={session.editMode && session.propagate}
                isDisabled={!session.editMode}
                onChange={session.setPropagate}
              >
                Propagation
              </Switch>
              <ContextualHelp
                aria-label="Propagation help"
                placement="end bottom"
              >
                <Heading>Forward Propagation</Heading>
                <Content>
                  <Text>
                    When enabled in Edit mode, pressing Next copies manual
                    annotations to the next frame when they are not already
                    present there. Existing annotations are not overwritten, and
                    model-created annotations are not propagated.
                    <br />
                    <br />
                    When reviewing frames, use View mode to avoid restoring an
                    intentionally removed annotation.
                  </Text>
                </Content>
              </ContextualHelp>
            </Flex>
          </div>
          <div className="w-[170px] flex justify-start">
            <Switch
              isSelected={session.hideAnnotations}
              onChange={session.setHideAnnotations}
            >
              <span className="whitespace-nowrap">Hide annotations</span>
            </Switch>
          </div>
        </Flex>
      </div>
      <Divider size="S" marginX="size-200" />

      <div className="px-4 py-4">
        <VideoClassPanel
          items={classItems}
          selectedClassName={session.selection.className}
          setSelectedClassName={onSelectClassName}
        />
      </div>
    </div>
  );
}
