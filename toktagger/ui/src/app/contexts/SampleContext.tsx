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
  SpectrogramDataSchema,
  ImageData,
  ImageDataSchema,
  TaskType,
  DataParams,
} from "@/types";
import { BACKEND_API_URL } from "@/app/core";
import { getSignalNames } from "../utils";
interface SampleContextType {
  project: Project | null;
  sample: Sample | null;
  data: Data | null;
  annotations: Annotation[];
  dataParams: DataParams;
  viewParams: ViewParams | SpectrogramViewParams | null;
  plotProps: PlotProps;
  isLoading: boolean;
  isValidated: boolean | null;
  error: string | null;
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;
  setDataParams: (params: DataParams) => void;
  setViewParams: (params: ViewParams | SpectrogramViewParams) => void;
  setPlotProps: (props: PlotProps) => void;
  setIsValidated: (validated: boolean) => void;
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

async function getSampleData(
  project: Project,
  sample: Sample,
  dataParams: DataParams,
  viewParams: ViewParams | null,
  setError: (error: string | null) => void,
  setIsLoading: (isLoading: boolean) => void,
  setDataParams: (params: DataParams) => void,
  setData: (data: Data | null) => void,
  lastGoodVideoFrameRef: React.MutableRefObject<number | null>,
): Promise<MultiVariateTimeSeriesData | SpectrogramData | ImageData | null> {
  if (!viewParams) return null;

  const response = await fetch(
    `${BACKEND_API_URL}/projects/${project._id}/samples/${sample._id}/data`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params: dataParams, view: viewParams }),
    },
  );

  if (!response.ok) {
    // error handling
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // ignore; payload stays null
    }

    const detail = extractDetail(payload);

    // Video-only: treat missing frame as "boundary" and stay on last good frame.
    if (project.task === TaskType.Video) {
      const requestedFrame = dataParams?.frame as number | null | undefined;

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
          ...prev,
          name: "image",
          frame: lastGood,
        }));
        setIsLoading(false);
        return null;
      }
    }

    setError(detail);
    setData(null);
    setIsLoading(false);
    return null;
  }

  const fetchedData: Data = await response.json();

  const viewData = await parseData(fetchedData, project.task);
  if (!viewData) {
    setError("Data could not read the data for the selected view");
    return null;
  }

  return viewData;
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
    const result = SpectrogramDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for spectrogram view");
    }
    return result.data;
  } else if (task == TaskType.Video) {
    const result = ImageDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for video view");
    }
    return result.data;
  }

  return undefined;
}

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

export function SampleProvider({
  projectId,
  sampleId,
  children,
}: SampleProviderProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [viewParams, setViewParams] = useState<
    ViewParams | SpectrogramViewParams | null
  >();

  const [dataParams, setDataParams] = useState<DataParams>({
    name: "identity",
  });

  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [isValidated, setIsValidated] = useState<boolean | null>(null);

  const [error, setError] = useState<string | null>(null);

  const lastGoodVideoFrameRef = useRef<number | null>(null);

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
        setIsValidated(sampleData.validated_annotations);

        setViewParams((prevViewParams) => {
          if (prevViewParams) {
            return prevViewParams;
          }

          // Set default viewParams based on project task
          if (
            projectData.task === TaskType.TimeSeries ||
            projectData.task === TaskType.Video
          ) {
            return {
              name: "identity",
            };
          } else if (projectData.task === TaskType.Spectrogram) {
            return {
              name: "spectrogram",
              signal_name: getSignalNames(sampleData)[0],
              nfft: 256,
              nperseg: 256,
              noverlap: 128,
            } as SpectrogramViewParams;
          }
          return null;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
      }
    };

    refreshData();
  }, [projectId, sampleId, dataParams]);

  useEffect(() => {
    const fetchDataAsync = async () => {
      if (!project || !sample || !viewParams) return;

      setIsLoading(true);
      setError(null);

      // ------------------------------------------------------------
      // video projects must request image data parameters.
      // Backend ImageDataLoader requires params.name === "image".
      // frame: null means "backend picks first frame automatically".
      // ------------------------------------------------------------
      let effectiveDataParams: DataParams = dataParams;

      if (project.task === TaskType.Video) {
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

      try {
        const fetchedData = await getSampleData(
          project,
          sample,
          effectiveDataParams,
          viewParams,
          setError,
          setIsLoading,
          setDataParams,
          setData,
          lastGoodVideoFrameRef,
        );

        setData(fetchedData);

        // video: remember last good frame so we can roll back on missing-frame errors
        if (project.task === TaskType.Video) {
          const frame = (fetchedData as unknown as { frame?: unknown }).frame;
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

    fetchDataAsync();
  }, [project, sample, dataParams, viewParams]);

  const value: SampleContextType = {
    project,
    sample,
    data,
    annotations,
    dataParams,
    viewParams,
    plotProps,
    isLoading,
    isValidated,
    error,
    setAnnotations,
    setPlotProps,
    setViewParams,
    setDataParams,
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
