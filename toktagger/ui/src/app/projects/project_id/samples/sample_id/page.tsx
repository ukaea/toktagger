"use client";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
} from "@adobe/react-spectrum";
import {
  CompositeDataSchema,
  MultiVariateTimeSeriesDataSchema,
  Project,
  Sample,
  SpectrogramDataSchema,
  MultiVariateTimeSeriesData,
  SpectrogramData,
} from "@/types";
import { TimeSeriesView } from "@/app/time_series/components/time-series";
import { SpectrogramView } from "@/app/spectrogram/components/spectrogram";
import ToolBar from "@/app/components/tools/toolbar";
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
  const { project, data, annotations, setAnnotations, plotProps } = useSample();
  if (!data || !project) {
    return;
  }

  let viewData: MultiVariateTimeSeriesData | SpectrogramData | undefined =
    undefined;

  if (project.task == "time-series") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid data for time series view");
    }
    viewData = result.data;
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
    viewData = mhdData.data;
  }

  if (viewData === undefined) {
    return;
  }

  if (project.task == "time-series") {
    return (
      <TimeSeriesView
        data={viewData as MultiVariateTimeSeriesData}
        annotations={annotations}
        setAnnotations={setAnnotations}
      />
    );
  } else if (project.task == "spectrogram") {
    return (
      <SpectrogramView
        data={viewData as SpectrogramData}
        annotations={annotations}
        setAnnotations={setAnnotations}
        plotProps={plotProps}
      />
    );
  }
};

function SamplePageContent() {
  const { project, sample, isLoading, error } = useSample();

  if (!project || !sample) {
    return null;
  }

  let view: React.ReactNode = <SampleView />;

  if (isLoading) {
    view = <LoadingView />;
  }

  if (error) {
    view = <ErrorView message={error} />;
  }

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />
        <div className="flex">
          <ToolBar />
          <div className="flex-1 justify-center">{view}</div>
        </div>
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
