"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Text,
  Item,
  ToastContainer,
  Tabs,
  TabList,
  TabPanels,
  Flex,
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
  FileDataLoaderSchema,
} from "@/types";
import { TimeSeriesView } from "@/app/time_series/components/time_series";
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
  sample_id: string,
  task_name: string
): Promise<Annotation[]> {
  return await getData<Annotation[]>(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations?task_name=${task_name}`
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

  const [dataLoadingFailed, setDataLoadingFailed] = useState<boolean>(false);
  const [dataIsLoading, setDataIsLoading] = useState<boolean>(true);

  const [plotProps, setPlotProps] = useState<PlotProps>({
    colorMap: "Cividis",
  }); // Set default color map

  const [selected, setSelected] = useState<number>(0);
  const [result, setResult] = useState<
    MultiVariateTimeSeriesData | CompositeData | SpectrogramData | null
  >(null);

  const refreshData = useCallback(
    async (params: ViewParams) => {
      setDataIsLoading(true);
      setData(null);

      if (!hasIds) {
        return;
      }

      const project = await getProject(project_id);
      setProject(project);
      const sample = await getSample(project_id, sample_id);
      setSample(sample);

      const task_name = project.tasks[selected].name;

      const dbAnnotations = await getAnnotations(
        project_id,
        sample_id,
        task_name
      );
      setAnnotations(dbAnnotations);

      const task = project.tasks[selected];
      if (task.type == "spectrogram") {
        params = {
          ...params,
          name: "spectrogram",
          nperseg: 256,
        } as SpectrogramViewParams;
      }

      setDataLoadingFailed(false);
      const body = JSON.stringify({ task_index: selected, view: params });
      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: body,
        }
      );

      if (!response.ok) {
        setDataLoadingFailed(true);
        return;
      }

      const data: Data = await response.json();
      setData(data);
      setDataIsLoading(false);

      if (task.type === "time_series") {
        const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
        if (!result.success) {
          throw new Error("Invalid data for Time Series view");
        }
        setResult(result.data);
      } else if (task.type === "spectrogram") {
        const result = CompositeDataSchema.safeParse(data);
        if (!result.success) {
          throw new Error("Invalid data for Spectrogram view");
        }
        const spectrogramData = SpectrogramDataSchema.safeParse(
          result.data.values["mirnov"]
        );
        if (!spectrogramData.success) {
          throw new Error("Invalid data for Spectrogram view");
        }
        setResult(spectrogramData.data);
      }
    },
    [project_id, sample_id, selected, hasIds]
  );

  useEffect(() => {
    const viewParams = { name: "identity" } as ViewParams;
    refreshData(viewParams);
  }, [project_id, sample_id, viewParams, hasIds, selected, refreshData]);

  if (!hasIds || !project || !sample) {
    return;
  }

  const tasks = project.tasks.map((task, index) => ({ ...task, id: index }));

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs
          project={project}
          sample={sample}
        ></SampleDataBreadCrumbs>
        <div className="flex">
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-100"
          >
            <ToolBar
              project={project}
              sample={sample}
              data={data}
              annotations={annotations}
              selectedTask={selected}
              setAnnotations={setAnnotations}
              viewParams={viewParams}
              setViewParams={setViewParams}
              plotProps={plotProps}
              setPlotProps={setPlotProps}
            />
          </Flex>
          <div className="flex-1 justify-center items-center p-4">
            <Tabs
              items={tasks}
              selectedKey={selected}
              onSelectionChange={(value) => {
                setSelected(Number(value));
              }}
            >
              <TabList>{(item) => <Item>{item.name}</Item>}</TabList>

              <TabPanels>
                {(item) => (
                  <Item>
                    {!data &&
                      dataLoadingFailed &&
                      project.data_loader.name == "uda" && (
                        <Text>
                          Failed to load data for shot {sample.shot_id}. Please
                          check UDA or VPN connection.
                        </Text>
                      )}

                    {!data &&
                      dataLoadingFailed &&
                      project.data_loader.name == "parquet" && (
                        <Text>
                          Failed to load local data{" "}
                          {
                            FileDataLoaderSchema.parse(project.data_loader)
                              .file_path
                          }
                          . Check file path.
                        </Text>
                      )}
                    {dataIsLoading && project.data_loader.name == "uda" && (
                      <Text>
                        Loading data for shot {sample.shot_id} from UDA.
                      </Text>
                    )}
                    {dataIsLoading && project.data_loader.name == "parquet" && (
                      <Text>
                        Loading local data{" "}
                        {
                          FileDataLoaderSchema.parse(project.data_loader)
                            .file_path
                        }
                        . Check file path.
                      </Text>
                    )}
                    {data &&
                      item.type === "time_series" &&
                      MultiVariateTimeSeriesDataSchema.safeParse(result)
                        .success && (
                        <TimeSeriesView
                          shot_id={sample.shot_id}
                          name={item.name}
                          data={result as MultiVariateTimeSeriesData}
                          annotations={annotations}
                          setAnnotations={setAnnotations}
                        />
                      )}
                    {data &&
                      item.type === "spectrogram" &&
                      SpectrogramDataSchema.safeParse(result).success && (
                        <SpectrogramView
                          shot_id={sample.shot_id}
                          name={item.name}
                          data={result as SpectrogramData}
                          annotations={annotations}
                          setAnnotations={setAnnotations}
                          plotProps={plotProps}
                        />
                      )}
                  </Item>
                )}
              </TabPanels>
            </Tabs>
          </div>
        </div>
      </Provider>
    </div>
  );
}
