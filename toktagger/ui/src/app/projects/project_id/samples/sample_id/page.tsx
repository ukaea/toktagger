"use client";
import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
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
import { VideoViewV2Inner } from "@/app/frames/components/VideoViewV2";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import { DisruptionView } from "@/app/disruption/components/disruption";
import ToolBar from "@/app/components/tools/toolbar";
import { ModelTrainModal } from "@/app/components/tools/modelTrain";
import { ModelPredictModal } from "@/app/components/tools/modelPredict";
import { useHref, useNavigate, useParams } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";
import { z } from "zod";
import { VideoSessionProvider } from "@/app/frames/components/video-session";
import { ImageDataSchema as ImageDataSchemaForFrameParse } from "@/types";

type UnknownRecord = Record<string, unknown>;

const ErrorPayloadSchema = z.object({
  detail: z.union([z.string(), z.array(z.unknown())]).optional(),
});

function detailMessage(payload: unknown): string {
  const parsed = ErrorPayloadSchema.safeParse(payload);
  if (!parsed.success) return "Unknown error";

  const d = parsed.data.detail;
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
  if (project.task === "disruption") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
    if (!result.success) throw new Error("Invalid data for disruption view");
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
    if (!result.success) throw new Error("Invalid data for ELM view");
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
    if (!result.success) throw new Error("Invalid data for UFO view");

    return (
      <VideoViewV2Inner
        data={result.data}
        annotations={annotations}
        projectId={projectId}
        sampleId={sampleId}
        dataParams={dataParams}
        setDataParams={setDataParams}
        onPrev={onPrev}
        onNext={onNext}
        onJump={onJump}
      />
    );
  }

  if (project.task === "MHD") {
    const result = CompositeDataSchema.safeParse(data);
    if (!result.success) throw new Error("Invalid data for MHD view");

    const mirnov = (result.data.values as UnknownRecord)["mirnov"];
    const mhdData = SpectrogramDataSchema.safeParse(mirnov);
    if (!mhdData.success) throw new Error("Invalid data for MHD view");

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

async function getSample(
  project_id: string,
  sample_id: string,
): Promise<Sample> {
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
  const [dataParams, setDataParams] = useState<DataParams>({ name: "identity" });
  const [viewParams, setViewParams] = useState<ViewParams>({ name: "identity" });
  const [plotProps, setPlotProps] = useState<PlotProps>({ colorMap: "Cividis" });

  const videoInitRef = useRef(false);

  // Whether we're in the frame-based (video) workflow.
  const isUfo = project?.task === "UFO";

  // Only parse image payloads when the current task expects them.
  const parsedImage = useMemo(() => {
    if (!isUfo || !data) return null;
    return ImageDataSchemaForFrameParse.safeParse(data);
  }, [isUfo, data]);

  /**
   * Frame index reported by the backend in the image payload.
   * Used as the source of truth for the session frame.
   */
  const frameFromBackend = useMemo(() => {
    if (!isUfo || !parsedImage?.success) return 0;
    const n = Number(parsedImage.data.frame);
    return Number.isFinite(n) ? n : 0;
  }, [isUfo, parsedImage]);

  // Session frame (shown in UI, used by annotator session state).
  const [videoFrame, setVideoFrame] = useState<number>(0);

  useLayoutEffect(() => {
    if (!isUfo) return;

    /**
     * When navigation requests a specific frame, only update the session frame once
     * the backend response matches the requested frame. This prevents displaying a
     * "new" frame number while still showing the previous image on fetch errors.
     */
    const requested =
      (dataParams as any)?.name === "image" ? (dataParams as any)?.frame : null;

    if (typeof requested === "number" && Number.isFinite(requested)) {
      if (frameFromBackend !== requested) return;
    }

    setVideoFrame(frameFromBackend);
  }, [isUfo, frameFromBackend, dataParams]);

  /**
   * Refresh project/sample metadata and annotations when the route changes.
   * Also resets per-sample session init behavior.
   */
  useEffect(() => {
    if (!hasIds) return;

    videoInitRef.current = false;

    const refreshSample = async () => {
      const proj = await getProject(project_id as string);
      setProject(proj);

      // Initialize image mode once for UFO projects (drives first data fetch).
      if (proj.task === "UFO" && !videoInitRef.current) {
        videoInitRef.current = true;
        setDataParams({ name: "image", frame: null } as DataParams);
      }

      const samp = await getSample(project_id as string, sample_id as string);
      setSample(samp);

      const dbAnnotations = await getAnnotations(project_id as string, sample_id as string);
      setAnnotations(dbAnnotations);
    };

    void refreshSample();
  }, [project_id, sample_id, hasIds]);

  /**
   * Fetch the current data payload whenever params/view change.
   * Errors are surfaced via toast and we keep the last good `data` in state.
   */
  useEffect(() => {
    const refreshData = async (dp: DataParams, vp: ViewParams) => {
      if (!project || !sample) return;

      let nextViewParams: ViewParams = vp;
      if (project.task === "MHD") {
        nextViewParams = { ...vp, name: "spectrogram", nperseg: 256 } as SpectrogramViewParams;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project._id}/samples/${sample._id}/data`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: dp, view: nextViewParams }),
        }
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

  // All hooks run above; it's safe to early-return UI states here.
  if (!data || !project || !sample || !hasIds) {
    return (
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <div className="p-4 text-sm opacity-70">Loading sample…</div>
      </Provider>
    );
  }

  const projectIdResolved = project._id ?? (project_id as string);
  const sampleIdResolved = sample._id ?? (sample_id as string);

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />

        <ModelTrainModal project={project} />
        <ModelPredictModal project={project} />

        <div className="flex">
          {isUfo ? (
             /**
             * For frame-based annotation, we provide a single session context that both
             * the toolbar and the main view consume.
             *
             * Keyed by project+sample to ensure a clean session when navigating.
             */
            <VideoSessionProvider
              key={`${projectIdResolved}:${sampleIdResolved}`}
              projectId={projectIdResolved}
              sampleId={sampleIdResolved}
              frame={videoFrame}
              setFrame={setVideoFrame}
            >
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

              <div className="flex-1 flex justify-center">
                <SampleView
                  project={project}
                  sample={sample}
                  projectId={projectIdResolved}
                  sampleId={sampleIdResolved}
                  data={data}
                  annotations={annotations}
                  setAnnotations={setAnnotations}
                  dataParams={dataParams}
                  setDataParams={setDataParams}
                  plotProps={plotProps}
                />
              </div>
            </VideoSessionProvider>
          ) : (
            <>
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

              <div className="flex-1 flex justify-center">
                <SampleView
                  project={project}
                  sample={sample}
                  projectId={projectIdResolved}
                  sampleId={sampleIdResolved}
                  data={data}
                  annotations={annotations}
                  setAnnotations={setAnnotations}
                  dataParams={dataParams}
                  setDataParams={setDataParams}
                  plotProps={plotProps}
                />
              </div>
            </>
          )}
        </div>
      </Provider>
    </div>
  );
}
