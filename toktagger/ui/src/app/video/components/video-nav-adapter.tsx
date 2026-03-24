"use client";

import React, { createContext, useContext } from "react";
import { useSample } from "@/app/contexts/SampleContext";
import {
  type Annotation,
  type NavAdapter,
  VideoBoundingBoxSchema,
} from "@/types";
import { useVideoSession } from "./video-session";

const NavAdapterContext = createContext<NavAdapter | null>(null);

export function NavAdapterProvider({
  value,
  children,
}: {
  value: NavAdapter;
  children: React.ReactNode;
}) {
  return (
    <NavAdapterContext.Provider value={value}>
      {children}
    </NavAdapterContext.Provider>
  );
}

export function useNavAdapterOptional(): NavAdapter | null {
  return useContext(NavAdapterContext);
}

export function useNavAdapter(): NavAdapter {
  const navAdapter = useNavAdapterOptional();
  const { annotations, setAnnotations } = useSample();

  if (navAdapter) {
    return navAdapter;
  }

  return {
    getAnnotations: () => annotations,
    clear: () => {
      setAnnotations(() => []);
    },
  };
}

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
