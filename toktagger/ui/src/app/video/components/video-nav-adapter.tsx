"use client";

import React from "react";
import { useSample } from "@/app/contexts/SampleContext";
import { NavAdapterProvider } from "@/app/contexts/NavAdapterContext";
import { type Annotation, type NavAdapter, VideoBoundingBoxSchema } from "@/types";
import { useVideoSession } from "./video-session";

export function VideoNavAdapterBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useVideoSession();
  const { annotations } = useSample();

  const adapter: NavAdapter = {
    getAnnotations: () => {
      const shotLabels = (annotations ?? []).filter(
        (annotation): annotation is Annotation =>
          annotation.type === "class_label",
      );
      const videoBoxes = session.collectAllVideoBBoxes().map((box) => {
        const parsedBox = VideoBoundingBoxSchema.parse(box);
        const sanitizedBox = (({
          timestamp: _timestamp,
          time_min: _timeMin,
          time_max: _timeMax,
          ...rest
        }) => rest)(parsedBox);

        return sanitizedBox as Annotation;
      });

      return [...shotLabels, ...videoBoxes];
    },
    clear: () => {
      session.clearCurrentFrame();
    },
    afterSave: () => {
      session.markSaved();
    },
  };

  return <NavAdapterProvider value={adapter}>{children}</NavAdapterProvider>;
}
