"use client";

import React from "react";
import { NavAdapterProvider } from "@/app/contexts/NavAdapterContext";
import {
  type Annotation,
  type NavAdapter,
  VideoBoundingBoxAnnotationSchema,
  VideoPolygonSchema,
} from "@/types";
import { useVideoSession } from "./video-session";

export function VideoNavAdapterBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useVideoSession();

  const adapter: NavAdapter = {
    getAnnotations: () => {
      const nowIso = new Date().toISOString();
      return session
        .collectAllVideoAnnotations()
        .map((annotation): Annotation => {
          if (annotation.type === "video_bounding_box") {
            const parsed = VideoBoundingBoxAnnotationSchema.parse(annotation);
            return {
              ...parsed,
              timestamp: parsed.timestamp ?? nowIso,
            };
          }
          const parsed = VideoPolygonSchema.parse(annotation);
          return {
            ...parsed,
            timestamp: parsed.timestamp ?? nowIso,
          };
        });
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
