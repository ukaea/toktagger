"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  Project,
  Sample,
  Data,
  Annotation,
  ViewParams,
  PlotProps,
  SpectrogramViewParams,
  MultiVariateTimeSeriesData,
  SpectrogramData,
  MultiVariateTimeSeriesDataSchema,
  CompositeDataSchema,
  SpectrogramDataSchema,
  TaskType,
} from "@/types";
import { BACKEND_API_URL } from "@/app/core";

interface SampleContextType {
  project: Project | null;
  sample: Sample | null;
  data: Data | null;
  annotations: Annotation[];
  viewParams: ViewParams;
  plotProps: PlotProps;
  isLoading: boolean;
  error: string | null;
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[]
  ) => void;
  setViewParams: (params: ViewParams) => void;
  setPlotProps: (props: PlotProps) => void;
}

const SampleContext = createContext<SampleContextType | undefined>(undefined);

interface SampleProviderProps {
  projectId: string;
  sampleId: string;
  children: ReactNode;
}

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  return payload as T;
}

async function getSample(projectId: string, sampleId: string): Promise<Sample> {
  return await getData<Sample>(
    `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}`
  );
}

async function getProject(projectId: string): Promise<Project> {
  return await getData<Project>(`${BACKEND_API_URL}/projects/${projectId}`);
}

async function getAnnotations(
  projectId: string,
  sampleId: string
): Promise<Annotation[]> {
  return await getData<Annotation[]>(
    `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}/annotations`
  );
}

async function parseData(
  data: Data,
  task: TaskType
): Promise<MultiVariateTimeSeriesData | SpectrogramData | undefined> {
  if (task == TaskType.TimeSeries) {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for time series view");
    }
    return result.data;
  } else if (task == TaskType.Spectrogram) {
    const result = CompositeDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for spectrogram view");
    }
    const mhdData = SpectrogramDataSchema.safeParse(
      result.data.values["mirnov"]
    );
    if (!mhdData.success) {
      throw new Error("Invalid data for spectrogram view");
    }
    return mhdData.data;
  }
}

export function SampleProvider({
  projectId,
  sampleId,
  children,
}: SampleProviderProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [viewParams, setViewParams] = useState<ViewParams>({
    name: "identity",
  });
  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Consolidated data fetching - fetch everything together
  useEffect(() => {
    const refreshData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch project, sample, and annotations in parallel
        const [projectData, sampleData, dbAnnotations] = await Promise.all([
          getProject(projectId),
          getSample(projectId, sampleId),
          getAnnotations(projectId, sampleId),
        ]);

        setProject(projectData);
        setSample(sampleData);
        setAnnotations(dbAnnotations);

        let params = viewParams;
        if (projectData.task === TaskType.Spectrogram) {
          params = {
            ...params,
            name: "spectrogram",
            nperseg: 256,
          } as SpectrogramViewParams;
        }

        const response = await fetch(
          `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}/data`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
          }
        );

        if (!response.ok) {
          const body = await response.json();
          setError(`${body.detail}`);
          setData(null);
          setIsLoading(false);
          return;
        }

        const fetchedData: Data = await response.json();

        const viewData = await parseData(fetchedData, projectData.task);
        if (!viewData) {
          setError("Data could not read the data for the selected view");
          return;
        }

        setData(viewData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    refreshData();
  }, [projectId, sampleId, viewParams, plotProps]);

  const value: SampleContextType = {
    project,
    sample,
    data,
    annotations,
    viewParams,
    plotProps,
    isLoading,
    error,
    setAnnotations,
    setViewParams,
    setPlotProps,
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
