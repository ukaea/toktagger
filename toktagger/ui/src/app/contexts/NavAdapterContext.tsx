"use client";

import React, { createContext, useContext } from "react";
import { useSample } from "@/app/contexts/SampleContext";
import { useAuth } from "@/app/contexts/AuthContext";
import {
  deleteAnnotationsByIds,
  deleteSampleAnnotations,
  removedAnnotationIds,
} from "@/app/core";
import { type Annotation, type NavAdapter } from "@/types";

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

// Handles deletions explicitly since a batch save only replaces the caller's own annotations.
export function useSyncRemovals(): () => Promise<void> {
  const { annotations, serverAnnotations, project, sample } = useSample();
  const { user } = useAuth();

  return async () => {
    if (!project?._id || !sample?._id) return;
    const removed = removedAnnotationIds(
      serverAnnotations,
      annotations,
      user?.username,
    );
    if (removed.length === 0) return;
    await deleteAnnotationsByIds(project._id, sample._id, removed);
  };
}

export function useNavAdapter(): NavAdapter {
  const navAdapter = useNavAdapterOptional();
  const { annotations, setAnnotations, project, sample } = useSample();
  const { user } = useAuth();
  const syncRemovals = useSyncRemovals();

  if (navAdapter) {
    return navAdapter;
  }

  return {
    getAnnotations: () => annotations,
    syncRemovals,
    afterSave: () => {
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
      setAnnotations((previousAnnotations: Annotation[]) =>
        previousAnnotations.filter(
          (annotation) =>
            annotation.created_by !== user?.username &&
            annotation.created_by !== "manual",
        ),
      );
    },
  };
}
