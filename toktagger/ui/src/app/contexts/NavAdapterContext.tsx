"use client";

import { useEffect, useRef } from "react";
import { useSample } from "@/app/contexts/SampleContext";
import { useAuth } from "@/app/contexts/AuthContext";
import { useWorkspace } from "@/app/contexts/WorkspaceContext";
import {
  deleteAnnotationsByIds,
  deleteSampleAnnotations,
  removedAnnotationIds,
} from "@/app/core";
import { type Annotation, type NavAdapter } from "@/types";

/** Registers the save/clear behaviour of one panel with the workspace navigation. */
export function useRegisterNavAdapter(panelId: string, adapter: NavAdapter) {
  const { registerNavAdapter } = useWorkspace();
  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  });

  useEffect(
    () =>
      registerNavAdapter(panelId, {
        getAnnotations: () => adapterRef.current.getAnnotations(),
        clear: (includeOthers?: boolean) =>
          adapterRef.current.clear(includeOthers),
        syncRemovals: () =>
          adapterRef.current.syncRemovals?.() ?? Promise.resolve(),
        afterSave: () => adapterRef.current.afterSave?.(),
      }),
    [panelId, registerNavAdapter],
  );
}

// Handles deletions explicitly since a batch save only replaces the caller's own annotations.
export function useSyncRemovals(): () => Promise<void> {
  const { annotations, serverAnnotations, project, sample } = useSample();
  const { user } = useAuth();

  return async () => {
    if (!project?._id || !sample?._id) return;
    const removed = removedAnnotationIds(
      serverAnnotations,
      annotations,
      user?._id,
    );
    if (removed.length === 0) return;
    await deleteAnnotationsByIds(project._id, sample._id, removed);
  };
}

/** Combines the adapters of all panels; panels without one use the sample-level default. */
export function useNavAdapter(): NavAdapter {
  const {
    annotations,
    serverAnnotations,
    setAnnotations,
    setServerAnnotations,
    project,
    sample,
  } = useSample();
  const { user } = useAuth();
  const syncRemovals = useSyncRemovals();
  const { panelIds, getNavAdapters } = useWorkspace();

  const fallback: NavAdapter = {
    getAnnotations: () => annotations,
    syncRemovals,
    afterSave: () => {
      setServerAnnotations(annotations);
      // Mirrors the server-side validation so saved annotator output isn't discarded.
      setAnnotations((previousAnnotations: Annotation[]) =>
        previousAnnotations.map((annotation: Annotation) => ({
          ...annotation,
          validated: true,
        })),
      );
    },
    clear: async (includeOthers?: boolean) => {
      // Deleted explicitly since a save's replace step is scoped to the caller's own created_by.
      if (includeOthers) {
        if (project?._id && sample?._id) {
          await deleteSampleAnnotations(project._id, sample._id);
        }
        setAnnotations(() => []);
        return;
      }

      // "manual" is the placeholder created_by used until the auth context resolves.
      const isOthers = (annotation: Annotation) =>
        annotation.created_by !== user?._id &&
        annotation.created_by !== "manual";

      const ownIds = serverAnnotations
        .filter((annotation) => !isOthers(annotation))
        .map((annotation) => annotation._id)
        .filter((id): id is string => Boolean(id));
      if (project?._id && sample?._id && ownIds.length > 0) {
        await deleteAnnotationsByIds(project._id, sample._id, ownIds);
      }
      setServerAnnotations((previousAnnotations: Annotation[]) =>
        previousAnnotations.filter(isOthers),
      );
      setAnnotations((previousAnnotations: Annotation[]) =>
        previousAnnotations.filter(isOthers),
      );
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
    // Removals are found from the sample's annotations, so one call covers every panel.
    syncRemovals,
    clear: async (includeOthers?: boolean) => {
      await Promise.all(
        activeAdapters().map((adapter) => adapter.clear(includeOthers)),
      );
    },
    afterSave: () =>
      activeAdapters().forEach((adapter) => adapter.afterSave?.()),
  };
}
