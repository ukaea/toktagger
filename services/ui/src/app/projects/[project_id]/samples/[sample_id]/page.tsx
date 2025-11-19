"use client";
import { use, useState, useEffect } from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
  ToastQueue,
} from "@adobe/react-spectrum";
import {
  Annotations,
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
import { UFOView } from "@/app/ufos/components/ufos";
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
    updater: (annotations: Annotations) => Annotations | Annotations,
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
    console.log({data})
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

export async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  return payload as T;
}

async function getSample(
  project_id: string,
  sample_id: string,
): Promise<Sample> {
  return await getData<Sample>(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`,
  );
}

async function getProject(project_id: string): Promise<Project> {
  return await getData<Project>(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`,
  );
}

async function getAnnotations(
  project_id: string,
  sample_id: string,
): Promise<Annotations> {
  return await getData<Annotations>(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`,
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
  const [dataParams, setDataParams] = useState<DataParams>({
    name: "identity",
  });
  const [viewParams, setViewParams] = useState<ViewParams>({
    name: "identity",
  });
  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  }); // Set default color map

  useEffect(() => {
    const refreshSample = async () => {
      const project = await getProject(project_id);
      setProject(project);

      const sample = await getSample(project_id, sample_id);
      setSample(sample);

      const dbAnnotations = await getAnnotations(project_id, sample_id);
      setAnnotations(dbAnnotations);
    };
    refreshSample();
  }, [project_id, sample_id]);


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
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ params: dataParams, view: viewParams}),
        },
      );
      const data: Data = await response.json();
      if (!response.ok) {
        ToastQueue.negative("Error:", data.detail)
      } else {
        setData(data);
      };
    };

    const run = async (dataParams: DataParams, viewParams: ViewParams) => {
      await refreshData(dataParams, viewParams);
    };

    run(dataParams, viewParams);
  }, [project, sample, dataParams, viewParams]);

  useEffect(() => {}, [plotProps]);

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
