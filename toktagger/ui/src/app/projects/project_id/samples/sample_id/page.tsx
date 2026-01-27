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
import { Project, Sample, TaskType } from "@/types";
import { TimeSeriesView } from "@/app/time_series/components/time-series";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import ToolBar from "@/app/components/tools/toolbar";
import { ModelTrainModal } from "@/app/components/tools/modelTrain";
import { ModelPredictModal } from "@/app/components/tools/modelPredict";
import { useHref, useNavigate, useParams } from "react-router-dom";
import ErrorView from "@/app/views/error";
import LoadingView from "@/app/views/loading";
import { SampleProvider, useSample } from "@/app/contexts/SampleContext";

// ✅ Video view for this branch (v1-style frames tooling)
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

  if (!project) return null;
  if (isLoading) return <LoadingView />;
  if (error) return <ErrorView message={error} />;

  if (project.task === TaskType.TimeSeries) return <TimeSeriesView />;
  if (project.task === TaskType.Spectrogram) return <SpectrogramView />;
  if (project.task === TaskType.Video) return <VideoViewWrapperFromContext />;

  return null;
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

  if (!project || !sample || !data) return null;

  // In video projects, SampleContext.parseData returns ImageData (frame + base64 PNG)
  return (
    <VideoView
      data={data as any}
      annotations={annotations ?? []}
      setAnnotations={setAnnotations}
      dataParams={dataParams}
      setDataParams={setDataParams as any}
      projectId={project._id as any}
      sampleId={sample._id as any}
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
