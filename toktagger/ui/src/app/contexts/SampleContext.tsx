"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Project, Sample, Annotation, PlotProps, TaskType } from "@/types";
import {
  ApiError,
  BACKEND_API_URL,
  apiFetch,
  ensureOk,
  isOwnAnnotation,
} from "@/app/core";
import { useProjectRole } from "@/app/hooks/useProjectRole";

const colorMapKey = (projectId: string) => `color-map-${projectId}`;

function readSavedColorMap(projectId: string): string | null {
  if (!projectId) return null;
  return sessionStorage.getItem(colorMapKey(projectId));
}

interface SampleContextType {
  project: Project | null;
  sample: Sample | null;
  annotations: Annotation[];
  // The annotations as the server last returned them, so a save can tell which the user removed locally.
  serverAnnotations: Annotation[];
  plotProps: PlotProps;
  annotationLabels: { id: number; name: string }[];
  isLoading: boolean;
  isValidated: boolean | null;
  error: string | null;
  // HTTP status behind `error`, when it came from the API - lets the page tell "no access" (403) apart from a genuine failure.
  errorStatus: number | null;
  // Sourced here, not per-consumer, so remounts on sample change (see page.tsx) don't reset a local role hook and re-enable gated controls.
  canAnnotate: boolean;
  // Held here for the same reason as canAnnotate, so the nav bar does not re-fetch the preference on every sample.
  showOthers: boolean;
  setShowOthers: React.Dispatch<React.SetStateAction<boolean>>;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  setServerAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  // Replaces the working set with a freshly fetched one, so `serverAnnotations` stays the baseline a save diffs against.
  syncAnnotationsFromServer: (annotations: Annotation[]) => void;
  // Takes only other authors' annotations from a fetch, keeping the local working copy of the user's own, so a visibility change does not discard unsaved work.
  mergeOthersFromServer: (
    annotations: Annotation[],
    userId: string | undefined,
  ) => void;
  setPlotProps: (props: PlotProps) => void;
  setIsValidated: (validated: boolean) => void;
}

const SampleContext = createContext<SampleContextType | undefined>(undefined);

interface SampleProviderProps {
  projectId: string;
  sampleId: string;
  children: ReactNode;
}

async function getData<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await ensureOk(await apiFetch(url, { signal }));
  const payload: unknown = await response.json();
  return payload as T;
}

export function SampleProvider({
  projectId,
  sampleId,
  children,
}: SampleProviderProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [serverAnnotations, setServerAnnotations] = useState<Annotation[]>([]);
  const { canAnnotate, showOthers, setShowOthers } = useProjectRole(projectId);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isValidated, setIsValidated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const [plotProps, setPlotProps] = useState<PlotProps>(() => ({
    colorMap: readSavedColorMap(projectId) ?? "Cividis",
  }));

  // Persist only the colour map - thresholdActive has its own source of truth.
  useEffect(() => {
    if (!projectId || !plotProps.colorMap) return;
    sessionStorage.setItem(colorMapKey(projectId), plotProps.colorMap);
  }, [plotProps.colorMap, projectId]);

  useEffect(() => {
    const controller = new AbortController();

    const refreshSample = async () => {
      setIsLoading(true);
      setError(null);
      setErrorStatus(null);

      try {
        const base = `${BACKEND_API_URL}/projects/${projectId}`;
        const [projectData, sampleData, dbAnnotations] = await Promise.all([
          getData<Project>(base, controller.signal),
          getData<Sample>(`${base}/samples/${sampleId}`, controller.signal),
          getData<Annotation[]>(
            `${base}/samples/${sampleId}/annotations`,
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;

        setProject(projectData);
        setSample(sampleData);
        setAnnotations(dbAnnotations);
        setServerAnnotations(dbAnnotations);
        setIsValidated(sampleData.validated_annotations);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          // Reported as a refusal rather than as a missing project, so a user who lost access - or never had it - can act on the message.
          setError(err.message || "You are not a member of this project.");
          setErrorStatus(403);
        } else if (err instanceof ApiError && err.status === 404) {
          setError("Project not found.");
          setErrorStatus(404);
        } else {
          setError(err instanceof Error ? err.message : "An error occurred");
          setErrorStatus(err instanceof ApiError ? err.status : null);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    refreshSample();

    return () => {
      controller.abort();
    };
  }, [projectId, sampleId]);

  const syncAnnotationsFromServer = useCallback((fetched: Annotation[]) => {
    setAnnotations(fetched);
    setServerAnnotations(fetched);
  }, []);

  const mergeOthersFromServer = useCallback(
    (fetched: Annotation[], userId: string | undefined) => {
      const others = fetched.filter(
        (annotation) => !isOwnAnnotation(annotation, userId),
      );
      const merge = (previous: Annotation[]) => [
        ...previous.filter((annotation) => isOwnAnnotation(annotation, userId)),
        ...others,
      ];
      setAnnotations(merge);
      setServerAnnotations(merge);
    },
    [],
  );

  const annotationLabels =
    project?.task === TaskType.Video || project?.task === TaskType.MultiPanel
      ? (project.video_bounding_box_labels || []).map((name, i) => ({
          id: i + 1,
          name,
        }))
      : [];

  const value: SampleContextType = {
    project,
    sample,
    annotations,
    serverAnnotations,
    plotProps,
    annotationLabels,
    isLoading,
    isValidated,
    error,
    errorStatus,
    canAnnotate,
    showOthers,
    setShowOthers,
    setAnnotations,
    setServerAnnotations,
    syncAnnotationsFromServer,
    mergeOthersFromServer,
    setPlotProps,
    setIsValidated,
  };

  return (
    <SampleContext.Provider value={value}>{children}</SampleContext.Provider>
  );
}

export function useSample() {
  const context = useContext(SampleContext);
  if (context === undefined) {
    throw new Error("useSample must be used within a SampleProvider");
  }
  return context;
}
