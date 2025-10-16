"use client";
import { useState, useEffect } from "react";
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
  DataParams
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
};

const SampleView = ({
  project,
  data,
  annotations,
  setAnnotations,
  dataParams,
  setDataParams,
  plotProps,
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

      // 2) Build the "view" object we’ll send to the backend
      let effectiveViewParams: ViewParams = currentViewParams;

      if (project.task === "MHD") {
        effectiveViewParams = {
          ...currentViewParams,
          name: "spectrogram",
          nperseg: 256,
        } as SpectrogramViewParams;
      }

      // 3) Fetch data using { params, view }
      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            params: currentDataParams,
            view: effectiveViewParams,
          }),
        },
      );

      const payload: Data = await response.json();

      if (!response.ok) {
        ToastQueue.negative("Error:", (payload as any).detail);
      } else {
        setData(payload);
      }
    };

    refreshData(dataParams, viewParams);
  }, [project_id, sample_id, dataParams, viewParams, hasIds]);

  if (!data || !project || !sample || !hasIds) {
    return;
  }

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs
          project={project}
          sample={sample}
        ></SampleDataBreadCrumbs>
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
              data={data}
              annotations={annotations}
              setAnnotations={setAnnotations}
              dataParams={dataParams}
              setDataParams={setDataParams}
              plotProps={plotProps}
            />
          </div>
        </div>
      </Provider>
    </div>
  );
}
