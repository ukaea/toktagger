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
import { Annotorious } from "@annotorious/react";
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

  if (error) return <ErrorView message={error} />;

  if (!project) return isLoading ? <LoadingView /> : null;

  // Video: keep the video UI mounted while fetching the next frame.
  if (project.task === TaskType.Video) return <VideoViewWrapperFromContext />;

  if (isLoading) return <LoadingView />;

  if (project.task === TaskType.TimeSeries) return <TimeSeriesView />;
  if (project.task === TaskType.Spectrogram) return <SpectrogramView />;

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

  if (!project) {
    return isLoading ? (
      <LoadingView />
    ) : (
      <ErrorView message="Project not found." />
    );
  }

  if (!sample) {
    return isLoading ? (
      <LoadingView />
    ) : (
      <ErrorView message="Sample not found." />
    );
  }

  // Hard-block on loading for all tasks.
  if (isLoading && !data) return <LoadingView />;

  if (!data) return null;

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />
        <ModelTrainModal project={project} />
        <ModelPredictModal project={project} />
        <Flex>
          {isVideo ? (
            <Annotorious>
              <VideoSessionProvider
                key={`${props.projectId}:${props.sampleId}`}
                projectId={props.projectId}
                sampleId={props.sampleId}
                data={data}
                dataParams={dataParams}
                dbAnnotations={annotations ?? []}
              >
                <ToolBar />
                <div className="flex-1 flex justify-center">
                  <VideoViewInner
                    data={data}
                    projectId={props.projectId}
                    sampleId={props.sampleId}
                    dataParams={dataParams}
                    setDataParams={setDataParams}
                  />
                </div>
              </VideoSessionProvider>
            </Annotorious>
          ) : (
            <>
              <ToolBar />
              <SampleView />
            </>
          )}
        </Flex>
      </Provider>
    </div>
  );
}

export default function SamplePage() {
  const { project_id, sample_id } = useParams();

  if (!project_id || !sample_id) return null;

  return (
    <SampleProvider projectId={project_id} sampleId={sample_id}>
      <SamplePageContent projectId={project_id} sampleId={sample_id} />
    </SampleProvider>
  );
}
