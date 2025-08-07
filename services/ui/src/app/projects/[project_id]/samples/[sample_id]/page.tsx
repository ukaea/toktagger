"use client";
import { use, useState, useEffect } from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
} from "@adobe/react-spectrum";
import {
  Annotations,
  CompositeDataSchema,
  Data,
  MultiVariateTimeSeriesDataSchema,
  Project,
  Sample,
  SpectrogramDataSchema,
  SpectrogramViewParams,
  ViewParams,
} from "@/types";
import { ELMView } from "@/app/elms/components/elms";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import { DisruptionView } from "@/app/disruption/components/disruption";
import ToolBar from "@/app/components/tools/toolbar";

type SampleDataBreadCrumbsInfo = {
  project: Project;
  sample: Sample;
};
export const SampleDataBreadCrumbs = ({
  project,
  sample,
}: SampleDataBreadCrumbsInfo) => {
  return (
    <Provider theme={defaultTheme}>
      <Breadcrumbs>
        <Item
          key="projects"
          href={`${process.env.NEXT_PUBLIC_API_URL}/projects`}
        >
          Projects
        </Item>
        <Item
          key="project"
          href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${project._id}`}
        >
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
  annotations: Annotations;
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations
  ) => void;
};

const SampleView = ({
  project,
  data,
  annotations,
  setAnnotations,
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
  } else if (project.task == "MHD") {
    const result = CompositeDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for MHD view");
    }
    const mhdData = SpectrogramDataSchema.safeParse(
      result.data.values["mirnov"]
    );
    if (!mhdData.success) {
      throw new Error("Invalid data for MHD view");
    }
    return (
      <SpectrogramView
        data={mhdData.data}
        annotations={annotations}
        setAnnotations={setAnnotations}
      />
    );
  }
}

export async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  return payload as T;
}

async function getSample(
  project_id: string,
  sample_id: string
): Promise<Sample> {
  return await getData<Sample>(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`
  );
}

async function getProject(project_id: string): Promise<Project> {
  return await getData<Project>(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`
  );
}

async function getAnnotations(
  project_id: string,
  sample_id: string
): Promise<Annotations> {
  return await getData<Annotations>(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`
  );
}

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

  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [annotations, setAnnotations] = useState<Annotations>([]);
  const [viewParams, setViewParams] = useState<ViewParams>({ name: "identity" });

  useEffect(() => {

    const refreshData = async (params: ViewParams) => {
      const project = await getProject(project_id);
      setProject(project);

      const sample = await getSample(project_id, sample_id);
      setSample(sample);

      const dbAnnotations = await getAnnotations(project_id, sample_id);
      setAnnotations(dbAnnotations);

      if (project.task == "MHD") {
        params = {
          ...params,
          name: "spectrogram",
          nperseg: 256,
        } as SpectrogramViewParams;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`,
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

  }, [project_id, sample_id, viewParams]);

  if (!data || !project || !sample) {
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
          />
          <div className="flex-1 justify-center">
            <SampleView
              project={project}
              data={data}
              annotations={annotations}
              setAnnotations={setAnnotations}
            />
          </div>
        </div>
      </Provider>
    </div>
  );
}
