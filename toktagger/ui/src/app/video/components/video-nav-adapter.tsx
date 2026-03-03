"use client";

import React, { createContext, useContext } from "react";
import { useSample } from "@/app/contexts/SampleContext";
import type { Annotation } from "@/types";
import { useVideoSession } from "./video-session";

export type NavAdapter = {
  getAnnotations: () => Annotation[];
  clear: () => void;
  afterSave?: () => void;
};

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
