// toktagger/ui/src/app/projects/project_id/samples/sample_id/page.tsx
"use client";
import React, { useLayoutEffect, useMemo, useState } from "react";
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

import { VideoViewInner } from "@/app/video/components/VideoView";
import { VideoSessionProvider } from "@/app/video/components/video-session";

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
  return null;
};

function SamplePageContent(props: { projectId: string; sampleId: string }) {
  const {
    project,
    sample,
    data,
    annotations,
    dataParams,
    setDataParams,
    isLoading,
    error,
  } = useSample();

  if (isLoading) return <LoadingView />;
  if (error) return <ErrorView message={error} />;
  if (!project) return <ErrorView message="Project not found." />;
  if (!sample) return <ErrorView message="Sample not found." />;
  if (!data) return null;

  const isVideo = project.task === TaskType.Video;

  // For video we assume backend returns { frame: number, values: base64, ... }
  const frameFromBackend = useMemo(() => {
    if (!isVideo) return 0;
    return (data as unknown as { frame?: number }).frame ?? 0;
  }, [isVideo, data]);

  // IMPORTANT: don't force-load frame 0; session frame should follow backend response.
  const [videoFrame, setVideoFrame] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isVideo) return;

    // Don’t advance session frame unless backend actually returned the requested frame.
    const dp = dataParams as unknown as { name?: string; frame?: number | null };

    if (dp.name === "image" && dp.frame != null) {
      if (frameFromBackend !== dp.frame) return;
    }

    setVideoFrame(frameFromBackend);
  }, [isVideo, frameFromBackend, dataParams]);

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />
        <ModelTrainModal project={project} />
        <ModelPredictModal project={project} />
        <Flex>
          {isVideo ? (
            <VideoSessionProvider
              key={`${props.projectId}:${props.sampleId}`}
              projectId={props.projectId}
              sampleId={props.sampleId}
              frame={videoFrame ?? frameFromBackend}
              setFrame={(n) => setVideoFrame(n)}
            >
              <ToolBar />
              <div className="flex-1 flex justify-center">
                <VideoViewInner
                  data={data}
                  annotations={annotations ?? []}
                  projectId={props.projectId}
                  sampleId={props.sampleId}
                  dataParams={dataParams}
                  setDataParams={setDataParams as any}
                />
              </div>
            </VideoSessionProvider>
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
