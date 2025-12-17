"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
  ToastQueue,
} from "@adobe/react-spectrum";
import {
  Annotation,
  CompositeDataSchema,
  Data,
  MultiVariateTimeSeriesDataSchema,
  ImageDataSchema,
  Project,
  Sample,
  SpectrogramDataSchema,
  SpectrogramViewParams,
  PlotProps,
  ViewParams,
  DataParams,
} from "@/types";
import { ELMView } from "@/app/elms/components/elms";
import { UFOView } from "@/app/frames/components/frames";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import { DisruptionView } from "@/app/disruption/components/disruption";
import ToolBar from "@/app/components/tools/toolbar";
import { useHref, useNavigate, useParams } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}
function finiteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function detailMessage(payload: unknown): string {
  if (!isRecord(payload)) return "Unknown error";
  const d = payload.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d)) {
    const first = d.find((x) => typeof x === "string" && x.trim());
    if (typeof first === "string") return first;
  }
  return "Unknown error";
}

type SampleDataBreadCrumbsInfo = {
  project: Project;
  sample: Sample;
};

const SampleDataBreadCrumbs = ({ project, sample }: SampleDataBreadCrumbsInfo) => {
  const navigate = useNavigate();
  return (
    <Provider theme={defaultTheme} router={{ navigate, useHref }}>
      <Breadcrumbs>
        <Item key="projects" href={`/ui/projects`}>
          Projects
        </Item>
        <Item key="project" href={`/ui/projects/${project._id}`}>
          Project: {project.name}
        </Item>
        <Item key="samples">Shot: {sample.shot_id}</Item>
      </Breadcrumbs>
    </Provider>
  );
};

type SampleViewInfo = {
  project: Project;
  sample: Sample;
  projectId: string;
  sampleId: string;

  data: Data;
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;

  dataParams: DataParams;
  setDataParams: (
    updater: (dataParams: DataParams) => DataParams | DataParams,
  ) => void;

  plotProps: PlotProps;

  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (n: number) => void;
};

const SampleView = ({
  project,
  sample: _sample,
  projectId,
  sampleId,
  data,
  annotations,
  setAnnotations,
  dataParams,
  setDataParams,
  plotProps,
  onPrev,
  onNext,
  onJump,
}: SampleViewInfo) => {
  if (project.task === "disruption") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for disruption view");
    }
    return (
      <DisruptionView
        data={result.data}
        annotations={annotations}
        setAnnotations={setAnnotations}
      />
    );
  }

  if (project.task === "ELM") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for ELM view");
    }
    return (
      <ELMView
        data={result.data}
        annotations={annotations}
        setAnnotations={setAnnotations}
      />
    );
  }

  if (project.task === "UFO") {
    const result = ImageDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for UFO view");
    }
    return (
      <UFOView
        data={result.data}
        annotations={annotations}
        setAnnotations={setAnnotations}
        dataParams={dataParams}
        setDataParams={setDataParams}
        projectId={projectId}
        sampleId={sampleId}
        onPrev={onPrev}
        onNext={onNext}
        onJump={onJump}
      />
    );
  }

  if (project.task === "MHD") {
    const result = CompositeDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for MHD view");
    }
    const mirnov = (result.data.values as UnknownRecord)["mirnov"];
    const mhdData = SpectrogramDataSchema.safeParse(mirnov);
    if (!mhdData.success) {
      throw new Error("Invalid data for MHD view");
    }
    return (
      <SpectrogramView
        data={mhdData.data}
        annotations={annotations}
        setAnnotations={setAnnotations}
        plotProps={plotProps}
      />
    );
  }

  return null;
};

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as unknown;
  return payload as T;
}

async function getSample(project_id: string, sample_id: string): Promise<Sample> {
  return await getData<Sample>(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}`,
  );
}

async function getProject(project_id: string): Promise<Project> {
  return await getData<Project>(`${BACKEND_API_URL}/projects/${project_id}`);
}

async function getAnnotations(
  project_id: string,
  sample_id: string,
): Promise<Annotation[]> {
  return await getData<Annotation[]>(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`,
  );
}

export default function SamplePage() {
  const { project_id, sample_id } = useParams();
  const hasIds = project_id !== undefined && sample_id !== undefined;

  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [dataParams, setDataParams] = useState<DataParams>({
    name: "identity",
  });
  const [viewParams, setViewParams] = useState<ViewParams>({
    name: "identity",
  });
  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  });

  // ------------------------------
  // UFO frame navigation driver
  // ------------------------------
  const ufoInitRef = useRef(false);

  type FrameBounds = {
    min?: number;
    max?: number;
    available?: number[];
  };

  const [frameBounds, setFrameBounds] = useState<FrameBounds | null>(null);

  const isUfo = project?.task === "UFO";

  const currentFrame = useMemo(() => {
    if (!isUfo) return 0;

    if (data) {
      const parsed = ImageDataSchema.safeParse(data);
      if (parsed.success && typeof parsed.data.frame === "number") {
        return parsed.data.frame;
      }
    }

    // Fallback: read frame from dataParams if present
    const dp = dataParams as unknown;
    if (isRecord(dp)) {
      const f = finiteNumber(dp.frame);
      if (typeof f === "number") return f;
    }

    return 0;
  }, [isUfo, data, dataParams]);

  const clampToBounds = useCallback(
    (n: number) => {
      const min =
        typeof frameBounds?.min === "number" && Number.isFinite(frameBounds.min)
          ? frameBounds.min
          : 0;

      const max =
        typeof frameBounds?.max === "number" && Number.isFinite(frameBounds.max)
          ? frameBounds.max
          : undefined;

      let target = Number.isFinite(n) ? n : min;
      if (target < min) target = min;
      if (typeof max === "number" && target > max) target = max;
      return target;
    },
    [frameBounds],
  );

  const nextAvailable = useCallback(
    (from: number) => {
      const avail = frameBounds?.available;
      if (Array.isArray(avail) && avail.length > 0) {
        const sorted = Array.from(
          new Set(avail.filter((x) => typeof x === "number" && Number.isFinite(x))),
        ).sort((a, b) => a - b);

        for (const f of sorted) if (f > from) return f;
        return from;
      }

      const max = frameBounds?.max;
      const candidate = from + 1;
      if (typeof max === "number" && Number.isFinite(max) && candidate > max) return from;
      return candidate;
    },
    [frameBounds],
  );

  const prevAvailable = useCallback(
    (from: number) => {
      const avail = frameBounds?.available;
      if (Array.isArray(avail) && avail.length > 0) {
        const sorted = Array.from(
          new Set(avail.filter((x) => typeof x === "number" && Number.isFinite(x))),
        ).sort((a, b) => a - b);

        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i] < from) return sorted[i];
        }
        return from;
      }

      const min = frameBounds?.min ?? 0;
      const candidate = from - 1;
      if (candidate < min) return from;
      return candidate;
    },
    [frameBounds],
  );

  const goToFrame = useCallback(
    (n: number) => {
      const target = clampToBounds(n);
      setDataParams(() => ({ name: "image", frame: target } as DataParams));
    },
    [clampToBounds],
  );

  const onPrev = useCallback(() => {
    if (!isUfo) return;
    goToFrame(prevAvailable(currentFrame));
  }, [isUfo, goToFrame, prevAvailable, currentFrame]);

  const onNext = useCallback(() => {
    if (!isUfo) return;
    goToFrame(nextAvailable(currentFrame));
  }, [isUfo, goToFrame, nextAvailable, currentFrame]);

  const onJump = useCallback(
    (n: number) => {
      if (!isUfo) return;
      goToFrame(n);
    },
    [isUfo, goToFrame],
  );

  useEffect(() => {
    if (!isUfo || !data) return;

    const d = data as unknown;
    if (!isRecord(d)) return;

    const rawBounds = isRecord(d.frame_bounds)
      ? d.frame_bounds
      : isRecord(d.frameBounds)
        ? d.frameBounds
        : null;

    if (!rawBounds) return;

    const min =
      finiteNumber(rawBounds.min) ?? finiteNumber(rawBounds.min_frame) ?? undefined;

    const max =
      finiteNumber(rawBounds.max) ?? finiteNumber(rawBounds.max_frame) ?? undefined;

    const rawAvail = rawBounds.available ?? rawBounds.available_frames;
    const available = Array.isArray(rawAvail)
      ? rawAvail.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      : undefined;

    if (min !== undefined || max !== undefined || available !== undefined) {
      setFrameBounds({ min, max, available });
    }
  }, [isUfo, data]);

  // ------------------------------
  // Sample/project refresh
  // ------------------------------
  useEffect(() => {
    if (!hasIds) return;

    ufoInitRef.current = false;
    setFrameBounds(null);

    const refreshSample = async () => {
      const proj = await getProject(project_id as string);
      setProject(proj);

      if (proj.task === "UFO" && !ufoInitRef.current) {
        ufoInitRef.current = true;
        setDataParams({ name: "image", frame: 292 } as DataParams);
      }

      const samp = await getSample(project_id as string, sample_id as string);
      setSample(samp);

      const dbAnnotations = await getAnnotations(
        project_id as string,
        sample_id as string,
      );
      setAnnotations(dbAnnotations);
    };

    void refreshSample();
  }, [project_id, sample_id, hasIds]);

  // ------------------------------
  // Data refresh
  // ------------------------------
  useEffect(() => {
    const refreshData = async (dp: DataParams, vp: ViewParams) => {
      if (!project || !sample) return;

      let nextViewParams: ViewParams = vp;

      if (project.task === "MHD") {
        nextViewParams = {
          ...vp,
          name: "spectrogram",
          nperseg: 256,
        } as SpectrogramViewParams;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project._id}/samples/${sample._id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ params: dp, view: nextViewParams }),
        },
      );

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const msg = detailMessage(payload);
        console.error("Error:", msg);
        ToastQueue.negative(`Error: ${msg}`);
        return;
      }

      setData(payload as Data);
    };

    void refreshData(dataParams, viewParams);
  }, [project, sample, dataParams, viewParams]);

  if (!data || !project || !sample || !hasIds) {
    return null;
  }

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />
        <div className="flex">
          <ToolBar
            project={project}
            sample={sample}
            data={data}
            annotations={annotations}
            setAnnotations={setAnnotations}
            viewParams={viewParams}
            setViewParams={setViewParams}
            dataParams={dataParams}
            setDataParams={setDataParams}
            plotProps={plotProps}
            setPlotProps={setPlotProps}
          />
          <div className="flex-1 justify-center">
            <SampleView
              project={project}
              sample={sample}
              projectId={project._id ?? (project_id as string)}
              sampleId={sample._id ?? (sample_id as string)}
              data={data}
              annotations={annotations}
              setAnnotations={setAnnotations}
              dataParams={dataParams}
              setDataParams={setDataParams}
              plotProps={plotProps}
              onPrev={onPrev}
              onNext={onNext}
              onJump={onJump}
            />
          </div>
        </div>
      </Provider>
    </div>
  );
}
