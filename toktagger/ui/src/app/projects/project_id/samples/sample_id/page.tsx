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

type SampleDataBreadCrumbsInfo = {
  project: Project;
  sample: Sample;
};
const SampleDataBreadCrumbs = ({
  project,
  sample,
}: SampleDataBreadCrumbsInfo) => {
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
  if (project.task == "disruption") {
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
  } else if (project.task == "ELM") {
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
  } else if (project.task == "UFO") {
    console.log({ data });
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
  } else if (project.task == "MHD") {
    console.log(data);
    const result = CompositeDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for MHD view");
    }
    const mhdData = SpectrogramDataSchema.safeParse(result.data.values["mirnov"]);
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
};

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
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
  }); // Set default color map

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

    const f = (dataParams as any)?.frame;
    return typeof f === "number" ? f : 0;
  }, [isUfo, data, dataParams]);

  const clampToBounds = useCallback(
    (n: number) => {
      const min = Number.isFinite(frameBounds?.min as any)
        ? (frameBounds!.min as number)
        : 0;
      const max = Number.isFinite(frameBounds?.max as any)
        ? (frameBounds!.max as number)
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
          new Set(
            avail.filter((x) => typeof x === "number" && Number.isFinite(x)),
          ),
        ).sort((a, b) => a - b);

        for (const f of sorted) if (f > from) return f;
        return from;
      }

      const max = frameBounds?.max;
      const candidate = from + 1;
      if (typeof max === "number" && Number.isFinite(max) && candidate > max)
        return from;
      return candidate;
    },
    [frameBounds],
  );

  const prevAvailable = useCallback(
    (from: number) => {
      const avail = frameBounds?.available;
      if (Array.isArray(avail) && avail.length > 0) {
        const sorted = Array.from(
          new Set(
            avail.filter((x) => typeof x === "number" && Number.isFinite(x)),
          ),
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
      setDataParams(
        () =>
          ({
            name: "image",
            frame: target,
          } as any),
      );
    },
    [clampToBounds, setDataParams],
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

    const b = (data as any)?.frame_bounds ?? (data as any)?.frameBounds ?? null;
    if (!b || typeof b !== "object") return;

    const min =
      (typeof (b as any).min === "number" && (b as any).min) ??
      (typeof (b as any).min_frame === "number" && (b as any).min_frame) ??
      undefined;

    const max =
      (typeof (b as any).max === "number" && (b as any).max) ??
      (typeof (b as any).max_frame === "number" && (b as any).max_frame) ??
      undefined;

    const available = Array.isArray((b as any).available)
      ? (b as any).available
      : Array.isArray((b as any).available_frames)
        ? (b as any).available_frames
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
      const project = await getProject(project_id as string);
      setProject(project);

      if (project.task === "UFO" && !ufoInitRef.current) {
        ufoInitRef.current = true;
        setDataParams({ name: "image", frame: 292 } as any);
      }

      const sample = await getSample(project_id as string, sample_id as string);
      setSample(sample);

      const dbAnnotations = await getAnnotations(
        project_id as string,
        sample_id as string,
      );
      setAnnotations(dbAnnotations);
    };

    refreshSample();
  }, [project_id, sample_id, hasIds]);

  // ------------------------------
  // Data refresh
  // ------------------------------
  useEffect(() => {
    const refreshData = async (dataParams: DataParams, viewParams: ViewParams) => {
      if (!project || !sample) {
        return;
      }

      if (project.task == "MHD") {
        viewParams = {
          ...viewParams,
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
          body: JSON.stringify({ params: dataParams, view: viewParams }),
        },
      );

      const data: Data = await response.json();
      if (!response.ok) {
        console.error("Error:", (data as any).detail);
        ToastQueue.negative("Error:", (data as any).detail);
      } else {
        setData(data);
      }
    };

    const run = async (dataParams: DataParams, viewParams: ViewParams) => {
      await refreshData(dataParams, viewParams);
    };

    run(dataParams, viewParams);
  }, [project, sample, dataParams, viewParams]);

  if (!data || !project || !sample || !hasIds) {
    return;
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
