"use client";

import { useEffect, useRef } from "react";
import { useSample } from "@/app/contexts/SampleContext";
import { useWorkspace } from "@/app/contexts/WorkspaceContext";
import { type Annotation, type NavAdapter } from "@/types";

/** Registers the save/clear behaviour of one panel with the workspace navigation. */
export function useRegisterNavAdapter(panelId: string, adapter: NavAdapter) {
  const { registerNavAdapter } = useWorkspace();
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  useEffect(
    () =>
      registerNavAdapter(panelId, {
        getAnnotations: () => adapterRef.current.getAnnotations(),
        clear: () => adapterRef.current.clear(),
        afterSave: () => adapterRef.current.afterSave?.(),
      }),
    [panelId, registerNavAdapter],
  );
}

/** Combines the adapters of all panels; panels without one use the sample-level default. */
export function useNavAdapter(): NavAdapter {
  const { annotations, setAnnotations } = useSample();
  const { panelIds, getNavAdapters } = useWorkspace();

  const fallback: NavAdapter = {
    getAnnotations: () => annotations,
    afterSave: () => {
      // Mirrors the server-side validation so saved annotator output isn't discarded.
      setAnnotations((previousAnnotations: Annotation[]) =>
        previousAnnotations.map((annotation: Annotation) => ({
          ...annotation,
          validated: true,
        })),
      );
    },
    clear: () => {
      setAnnotations(() => []);
    },
  };

  const activeAdapters = (): NavAdapter[] => {
    const registered = getNavAdapters();
    const adapters = panelIds.flatMap((panelId) => {
      const adapter = registered.get(panelId);
      return adapter ? [adapter] : [];
    });
    return adapters.length < panelIds.length || adapters.length === 0
      ? [...adapters, fallback]
      : adapters;
  };

  return {
    // Every adapter reads the same sample annotations, so the first one is enough.
    getAnnotations: () => activeAdapters()[0].getAnnotations(),
    clear: () => activeAdapters().forEach((adapter) => adapter.clear()),
    afterSave: () =>
      activeAdapters().forEach((adapter) => adapter.afterSave?.()),
  };
}
