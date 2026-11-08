"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Project, Sample, Annotation, PlotProps, TaskType } from "@/types";
import { BACKEND_API_URL } from "@/app/core";

const colorMapKey = (projectId: string) => `color-map-${projectId}`;

function readSavedColorMap(projectId: string): string | null {
  if (!projectId) return null;
  return sessionStorage.getItem(colorMapKey(projectId));
}

interface SampleContextType {
  project: Project | null;
  sample: Sample | null;
  annotations: Annotation[];
  plotProps: PlotProps;
  annotationLabels: { id: number; name: string }[];
  isLoading: boolean;
  isValidated: boolean | null;
  error: string | null;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
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
  const response = await fetch(url, { signal });
  const payload = await response.json();
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isValidated, setIsValidated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setIsValidated(sampleData.validated_annotations);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    refreshSample();

    return () => {
      controller.abort();
    };
  }, [projectId, sampleId]);

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
    plotProps,
    annotationLabels,
    isLoading,
    isValidated,
    error,
    setAnnotations,
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
