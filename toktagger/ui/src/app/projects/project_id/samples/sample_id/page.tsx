"use client";
import React from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
  Flex,
} from "@adobe/react-spectrum";
import { Category, Project, Sample, TaskType } from "@/types";
import { TimeSeriesView } from "@/app/time_series/components/time-series";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import ToolBar from "@/app/components/tools/toolbar";
import { ModelTrainModal } from "@/app/components/tools/modelTrain";
import { ModelPredictModal } from "@/app/components/tools/modelPredict";
import { useHref, useNavigate, useParams } from "react-router-dom";
import ErrorView from "@/app/views/error";
import LoadingView from "@/app/views/loading";
import { SampleProvider, useSample } from "@/app/contexts/SampleContext";
import { BoundingBoxProvider } from "@/app/components/providers/bounding-box-provider";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { VSpanProvider } from "@/app/components/providers/vpsan-provider";
import { PolygonProvider } from "@/app/components/providers/polygon-provider";
import { VideoView } from "@/app/frames/components/frames";

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

const SampleView = () => {
  const { project, isLoading, error } = useSample();

  if (error) return <ErrorView message={error} />;

  if (!project) return isLoading ? <LoadingView /> : null;

  // Video: keep the video UI mounted while fetching the next frame.
  if (project.task === TaskType.Video) return <VideoViewWrapperFromContext />;

  if (project.task == TaskType.TimeSeries) {
    const zoneCategories: Category[] = [
      { name: "ELM", color: "#FF5733" },
      { name: "L-mode", color: "#33FF57" },
      { name: "H-mode", color: "#3357FF" },
      { name: "Thermal Quench", color: "#FF33A8" },
      { name: "Current Quench", color: "#A833FF" },
      { name: "Sawtooth", color: "#33FFF6" },
      { name: "IRE", color: "#FFC733" },
      { name: "Locked Mode", color: "#8DFF33" },
      { name: "VDE", color: "#FF3380" },
      { name: "Flat Top", color: "#33A8FF" },
      { name: "Ramp Up", color: "#FF8D33" },
      { name: "Ramp Down", color: "#3380FF" },
      { name: "Unknown", color: "#B0B0B0" },
    ];

    const vspanCategories: Category[] = [
      { name: "Disruption", color: "#33FFAA" },
      { name: "Thermal Quench", color: "#FFAA33" },
      { name: "Current Quench", color: "#AA33FF" },
      { name: "Control Loss", color: "#FF3333" },
    ];

    return (
      <ContextMenuProvider menuId="time-series-menu">
        <ZoneProvider categories={zoneCategories}>
          <VSpanProvider categories={vspanCategories}>
            <PolygonProvider categories={[]}>
              <BoundingBoxProvider categories={[]}>
                <TimeSeriesView />
              </BoundingBoxProvider>
            </PolygonProvider>
          </VSpanProvider>
        </ZoneProvider>
      </ContextMenuProvider>
    );
  } else if (project.task == TaskType.Spectrogram) {
    const vspanCategories: Category[] = [
      { name: "Mode Locked", color: "rgb(255, 0, 0)" },
    ];

    const zoneCategories: Category[] = [
      { name: "NTM", color: "rgb(0, 255, 255)" },
      { name: "LLM", color: "rgb(200, 100, 100)" },
      { name: "Sawteeth", color: "rgb(100, 200, 100)" },
    ];

    const boundingBoxCategories: Category[] = [
      { name: "Unknown", color: "rgb(150, 150, 150)" },
      { name: "NTM", color: "rgb(0, 255, 255)" },
      { name: "LLM", color: "rgb(200, 100, 100)" },
      { name: "Sawteeth", color: "rgb(100, 200, 100)" },
    ];

    const polygonCategories: Category[] = boundingBoxCategories;

    return (
      <ContextMenuProvider menuId="spectrogram-menu">
        <ZoneProvider categories={zoneCategories}>
          <VSpanProvider categories={vspanCategories}>
            <BoundingBoxProvider categories={boundingBoxCategories}>
              <PolygonProvider categories={polygonCategories}>
                <SpectrogramView />
              </PolygonProvider>
            </BoundingBoxProvider>
          </VSpanProvider>
        </ZoneProvider>
      </ContextMenuProvider>
    );
  }
};

function VideoViewWrapperFromContext() {
  const {
    project,
    sample,
    data,
    annotations,
    setAnnotations,
    dataParams,
    setDataParams,
  } = useSample();

  if (!project || !sample) return null;

  // On initial load, block until we have frame data.
  // During frame-to-frame fetches, SampleContext keeps previous data set, so VideoView stays mounted.
  if (!data) return <LoadingView />;

  return (
    <VideoView
      data={data}
      annotations={annotations ?? []}
      setAnnotations={setAnnotations}
      dataParams={dataParams}
      setDataParams={setDataParams}
      projectId={project._id}
      sampleId={sample._id}
    />
  );
}

function SamplePageContent() {
  const { project, sample, isLoading } = useSample();

  if (!project && !isLoading) {
    return <ErrorView message="Project not found." />;
  }

  if (!sample && !isLoading) {
    return <ErrorView message="Sample not found." />;
  }

  if (!project || !sample) {
    return null;
  }

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />
        <ModelTrainModal project={project} />
        <ModelPredictModal project={project} />
        <Flex>
          <ToolBar />
          <SampleView />
        </Flex>
      </Provider>
    </div>
  );
}

export default function SamplePage() {
  const { project_id, sample_id } = useParams();

  if (!project_id || !sample_id) {
    return null;
  }

  return (
    <SampleProvider projectId={project_id} sampleId={sample_id}>
      <SamplePageContent />
    </SampleProvider>
  );
}
