"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
} from "react";
import { ToastQueue } from "@adobe/react-spectrum";
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
  ImageData,
  ImageDataSchema,
  TaskType,
  DataParams,
} from "@/types";
import { BACKEND_API_URL } from "@/app/core";

interface SampleContextType {
  project: Project | null;
  sample: Sample | null;
  data: Data | null;
  annotations: Annotation[];
  dataParams: DataParams;
  viewParams: ViewParams;
  plotProps: PlotProps;
  isLoading: boolean;
  error: string | null;
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;
  setDataParams: (params: DataParams) => void;
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
    `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}`,
  );
}

async function getProject(projectId: string): Promise<Project> {
  return await getData<Project>(`${BACKEND_API_URL}/projects/${projectId}`);
}

async function getAnnotations(
  projectId: string,
  sampleId: string,
): Promise<Annotation[]> {
  return await getData<Annotation[]>(
    `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}/annotations`,
  );
}

async function parseData(
  data: Data,
  task: TaskType,
): Promise<
  MultiVariateTimeSeriesData | SpectrogramData | ImageData | undefined
> {
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
      result.data.values["mirnov"],
    );
    if (!mhdData.success) {
      throw new Error("Invalid data for spectrogram view");
    }

    return mhdData.data;
  } else if (task == TaskType.Video) {
    const result = ImageDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for video view");
    }
    return result.data;
  }

  return undefined;
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

  const [dataParams, setDataParams] = useState<DataParams>({
    name: "identity",
  });

  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const lastGoodVideoFrameRef = useRef<number | null>(null);

  function extractDetail(payload: unknown): string {
    if (!payload) return "Unknown error";
    if (typeof payload === "string") return payload;
    if (typeof payload === "object") {
      const d = (payload as { detail?: unknown }).detail;
      if (typeof d === "string" && d.trim()) return d;
      if (Array.isArray(d)) {
        const first = d.find((x) => typeof x === "string" && x.trim());
        if (typeof first === "string") return first;
      }
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return "Unknown error";
    }
  }

  function isMissingFrameError(status: number, detail: string): boolean {
    // Your backend message example: "Could not find image on disk for this frame index"
    // Treat 404 + that phrasing as "navigation boundary" rather than fatal.
    if (status === 404) return true;
    const msg = (detail || "").toLowerCase();
    return (
      msg.includes("could not find image") ||
      msg.includes("file not found") ||
      msg.includes("no such file") ||
      msg.includes("frame index")
    );
  }

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

        // ------------------------------------------------------------
        // video projects must request image data parameters.
        // Backend ImageDataLoader requires params.name === "image".
        // frame: null means "backend picks first frame automatically".
        // ------------------------------------------------------------
        let effectiveDataParams: DataParams = dataParams;

        if (projectData.task === TaskType.Video) {
          const prev = dataParams as unknown as {
            name?: string;
            frame?: number | null;
          };

          effectiveDataParams = {
            ...(dataParams as Record<string, unknown>),
            name: "image",
            frame: prev.frame ?? null,
          } as DataParams;
        }

        const response = await fetch(
          `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}/data`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ params: effectiveDataParams, view: params }),
          },
        );

        if (!response.ok) {
          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            // ignore; payload stays null
          }

          const detail = extractDetail(payload);

          // Video-only: treat missing frame as "boundary" and stay on last good frame.
          if (projectData.task === TaskType.Video) {
            const requestedFrame = (effectiveDataParams)?.frame as
              | number
              | null
              | undefined;

            const lastGood = lastGoodVideoFrameRef.current;

            if (
              typeof requestedFrame === "number" &&
              typeof lastGood === "number" &&
              requestedFrame !== lastGood &&
              isMissingFrameError(response.status, detail)
            ) {
              ToastQueue.negative(`Frame ${requestedFrame} not found.`, {
                timeout: 2500,
              });

              // Roll back params; do NOT set error and do NOT clear data.
              setDataParams((prev) => ({
                ...(prev),
                name: "image",
                frame: lastGood,
              }));
              setIsLoading(false);
              return;
            }
          }

          setError(detail);
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

        // video: remember last good frame so we can roll back on missing-frame errors
        if (projectData.task === TaskType.Video) {
          const frame = (viewData as unknown as { frame?: unknown }).frame;
          if (typeof frame === "number" && Number.isFinite(frame)) {
            lastGoodVideoFrameRef.current = frame;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    refreshData();
  }, [projectId, sampleId, dataParams, viewParams, plotProps]);

  const value: SampleContextType = {
    project,
    sample,
    data,
    annotations,
    dataParams,
    viewParams,
    plotProps,
    isLoading,
    error,
    setAnnotations,
    setPlotProps,
    setViewParams,
    setDataParams,
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
