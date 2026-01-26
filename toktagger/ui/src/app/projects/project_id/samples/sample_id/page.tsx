"use client";
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
import React from "react";

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

  if (!project) {
    return null;
  }

  if (isLoading) {
    return <LoadingView />;
  }

  if (error) {
    return <ErrorView message={error} />;
  }

  if (project.task == TaskType.TimeSeries) {
    return <TimeSeriesView />;
  } else if (project.task == TaskType.Spectrogram) {
    return <SpectrogramView />;
  }
};

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

  const projectIdResolved = project._id ?? (project_id as string);
  const sampleIdResolved = sample._id ?? (sample_id as string);

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs
          project={project}
          sample={sample}
        ></SampleDataBreadCrumbs>
        <ModelTrainModal project={project}></ModelTrainModal>
        <ModelPredictModal project={project}></ModelPredictModal>
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
