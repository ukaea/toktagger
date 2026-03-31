"use client";

import React from "react";
import { useSample } from "@/app/contexts/SampleContext";
import { NavAdapterProvider } from "@/app/contexts/NavAdapterContext";
import { type Annotation, type NavAdapter } from "@/types";
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
      const videoAnnotations =
        session.collectAllVideoAnnotations() as Annotation[];

      return [...shotLabels, ...videoAnnotations];
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
