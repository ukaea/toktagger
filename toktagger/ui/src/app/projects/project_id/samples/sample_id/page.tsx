"use client";
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
import { useState, useEffect } from "react";
=======

import { use, useState, useEffect } from "react";
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
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
  ImageViewParams,
  PlotProps,
  ViewParams,
  DataParams,
} from "@/types";
import { ELMView } from "@/app/elms/components/elms";
import { UFOView } from "@/app/frames/components/ufos";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import { DisruptionView } from "@/app/disruption/components/disruption";
import ToolBar from "@/app/components/tools/toolbar";
import { useHref, useNavigate, useParams } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";

type SampleDataBreadCrumbsInfo = {
  project: Project;
  sample: Sample;
};
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
const SampleDataBreadCrumbs = ({
=======

export const SampleDataBreadCrumbs = ({
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
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
  sample,
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
        projectId={project._id}
        sampleId={sample._id}
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
    const mhdData = SpectrogramDataSchema.safeParse(
      result.data.values["mirnov"],
    );
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

<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
export default function SamplePage() {
  const { project_id, sample_id } = useParams();
  const hasIds = project_id !== undefined && sample_id !== undefined;
=======
type SampleViewProps = {
  project_id: string;
  sample_id: string;
};

export default function SamplePage({
  params,
}: {
  params: Promise<SampleViewProps>;
}) {
  const { project_id, sample_id } = use(params);
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx

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

  useEffect(() => {
    const refreshData = async (
      currentDataParams: DataParams,
      currentViewParams: ViewParams,
    ) => {
      if (!hasIds) {
        return;
      }

      // 1) Load project, sample, annotations
      const project = await getProject(project_id);
      setProject(project);

      const sample = await getSample(project_id, sample_id);
      setSample(sample);

      const dbAnnotations = await getAnnotations(project_id, sample_id);
      setAnnotations(dbAnnotations);

<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
      // 2) Build the "view" object we’ll send to the backend
      let effectiveViewParams: ViewParams = currentViewParams;

      if (project.task === "MHD") {
        effectiveViewParams = {
          ...currentViewParams,
=======
  useEffect(() => {
    const refreshData = async (
      currentDataParams: DataParams,
      currentViewParams: ViewParams,
    ) => {
      if (!project || !sample) {
        return;
      }

      let effectiveViewParams: ViewParams = currentViewParams;

      if (project.task == "MHD") {
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
        viewParams = {
          ...viewParams,
>>>>>>> 29945032 (Give SampleView access to the current sample. Pipe project._id and sample._id into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
=======
        effectiveViewParams = {
          ...currentViewParams,
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
          name: "spectrogram",
          nperseg: 256,
        } as SpectrogramViewParams;
      }

<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
      // 3) Fetch data using { params, view }
=======
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
=======
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
          body: JSON.stringify({
            params: currentDataParams,
            view: effectiveViewParams,
          }),
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
=======
          body: JSON.stringify({ params: dataParams, view: viewParams }),
>>>>>>> 29945032 (Give SampleView access to the current sample. Pipe project._id and sample._id into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
        },
      );

      const payload: Data = await response.json();

      if (!response.ok) {
<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
        ToastQueue.negative("Error:", (payload as any).detail);
      } else {
        setData(payload);
=======
        ToastQueue.negative("Error:", (data as any).detail);
      } else {
        setData(data);
>>>>>>> 29945032 (Give SampleView access to the current sample. Pipe project._id and sample._id into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
      }
    };

    refreshData(dataParams, viewParams);
  }, [project_id, sample_id, dataParams, viewParams, hasIds]);
=======
        },
      );
      const payload: Data = await response.json();
      if (!response.ok) {
        ToastQueue.negative("Error:", (payload as any).detail);
      } else {
        setData(payload);
      }
    };

    const run = async (
      currentDataParams: DataParams,
      currentViewParams: ViewParams,
    ) => {
      await refreshData(currentDataParams, currentViewParams);
    };
>>>>>>> e2551668 (Wire navigation in SamplePage via dataParams. dataParams becomes the source of truth: { name: image, frame }. onPrev, onNext, onJump just compute a new frame number and call setDataParams. We pass those into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx

<<<<<<< HEAD:toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
  if (!data || !project || !sample || !hasIds) {
    return;
=======
    run(dataParams, viewParams);
  }, [project, sample, dataParams, viewParams, project_id, sample_id]);

  useEffect(() => {}, [plotProps]);

  // Phase 3: dumb frame navigation for UFO task via dataParams
  const currentFrame =
    data && typeof (data as any).frame === "number"
      ? ((data as any).frame as number)
      : undefined;

  const goToFrame = (n: number) => {
    if (!Number.isFinite(n)) {
      return;
    }
    const target = Math.max(0, Math.floor(n));
    setDataParams((previous: DataParams | any) => ({
      ...(previous || {}),
      name: "image",
      frame: target,
    }));
  };

  const onPrev = () => {
    if (typeof currentFrame !== "number") {
      return;
    }
    goToFrame(currentFrame - 1);
  };

  const onNext = () => {
    if (typeof currentFrame !== "number") {
      return;
    }
    goToFrame(currentFrame + 1);
  };

  const onJump = (n: number) => {
    goToFrame(n);
  };

  if (!data || !project || !sample) {
    return null;
>>>>>>> 29945032 (Give SampleView access to the current sample. Pipe project._id and sample._id into UFOView.):services/ui/src/app/projects/[project_id]/samples/[sample_id]/page.tsx
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
            plotProps={plotProps}
            setPlotProps={setPlotProps}
          />
          <div className="flex-1 justify-center">
            <SampleView
              project={project}
              sample={sample}
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
