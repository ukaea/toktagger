"use client";
import { useState, useEffect } from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
} from "@adobe/react-spectrum";
import {
  Annotation,
  CompositeDataSchema,
  Data,
  MultiVariateTimeSeriesDataSchema,
  Project,
  Sample,
  SpectrogramDataSchema,
  SpectrogramViewParams,
  PlotProps,
  ViewParams,
  CompositeData,
  MultiVariateTimeSeriesData,
  SpectrogramData,
} from "@/types";
import { TimeSeriesView } from "@/app/time_series/components/time-series";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
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
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[]
  ) => void;
  plotProps: PlotProps;
  forceResetZoom?: boolean;
};

const SampleView = ({
  project,
  data,
  annotations,
  setAnnotations,
  plotProps,
}: SampleViewInfo) => {
  const [result, setResult] = useState<
    MultiVariateTimeSeriesData | CompositeData | SpectrogramData | null
  >(null);

  useEffect(() => {
    if (project.task == "time-series") {
      const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
      if (!result.success) {
        throw new Error("Invalid data for time series view");
      }
      setResult(result.data);
    } else if (project.task == "spectrogram") {
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
      setResult(mhdData.data);
    }
  }, [data, project.task]);

  if (result == null) {
    return null;
  }

  if (project.task == "time-series") {
    return (
      <TimeSeriesView
        data={result as MultiVariateTimeSeriesData}
        annotations={annotations}
        setAnnotations={setAnnotations}
      />
    );
  } else if (project.task == "spectrogram") {
    return (
      <SpectrogramView
        data={result as SpectrogramData}
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
  sample_id: string
): Promise<Sample> {
  return await getData<Sample>(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}`
  );
}

async function getProject(project_id: string): Promise<Project> {
  return await getData<Project>(`${BACKEND_API_URL}/projects/${project_id}`);
}

async function getAnnotations(
  project_id: string,
  sample_id: string
): Promise<Annotation[]> {
  return await getData<Annotation[]>(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`
  );
}

export default function SamplePage() {
  const { project_id, sample_id } = useParams();
  const hasIds = project_id !== undefined && sample_id !== undefined;

  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [viewParams, setViewParams] = useState<ViewParams>({
    name: "identity",
  });
  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  }); // Set default color map

  useEffect(() => {
    const refreshData = async (params: ViewParams) => {
      if (!hasIds) {
        return;
      }

      const project = await getProject(project_id);
      setProject(project);

      const sample = await getSample(project_id, sample_id);
      setSample(sample);

      const dbAnnotations = await getAnnotations(project_id, sample_id);
      setAnnotations(dbAnnotations);

      if (project.task == "spectrogram") {
        params = {
          ...params,
          name: "spectrogram",
          nperseg: 256,
        } as SpectrogramViewParams;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        }
      );
      const data: Data = await response.json();
      setData(data);
    };

    const run = async (viewParams: ViewParams) => {
      await refreshData(viewParams);
    };

    run(viewParams);
  }, [project_id, sample_id, viewParams, hasIds]);

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
              plotProps={plotProps}
            />
          </div>
        </div>
      </Provider>
    </div>
  );
}
