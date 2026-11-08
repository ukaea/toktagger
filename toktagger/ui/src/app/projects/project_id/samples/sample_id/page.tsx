"use client";

import { useMemo } from "react";
import {
  Provider,
  defaultTheme,
  Breadcrumbs,
  Item,
  ToastContainer,
  Flex,
} from "@adobe/react-spectrum";
import { Project, Sample, TaskType } from "@/types";
import ToolBar from "@/app/components/tools/toolbar";
import { useHref, useNavigate, useParams } from "react-router-dom";
import ErrorView from "@/app/views/error";
import LoadingView from "@/app/views/loading";
import { SampleProvider, useSample } from "@/app/contexts/SampleContext";
import {
  PanelDataProvider,
  panelsForProject,
} from "@/app/contexts/PanelDataContext";
import { WorkspaceProvider } from "@/app/contexts/WorkspaceContext";
import { PanelFrame } from "@/app/panels/panel-frame";
import { WorkspaceView } from "@/app/panels/workspace-view";
import { SampleHistoryProvider } from "@/app/contexts/SampleHistoryContext";

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

function SamplePageContent(props: { sampleId: string }) {
  const { project, sample, isLoading, error } = useSample();
  const panels = useMemo(
    () => (project && sample ? panelsForProject(project, sample) : []),
    [project, sample],
  );
  const panelIds = useMemo(() => panels.map((panel) => panel.id), [panels]);

  // Early returns AFTER all hooks
  if (error) return <ErrorView message={error} />;

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

  //  Prevent a stale render during route param transitions
  if (sample._id !== props.sampleId) {
    return <LoadingView />;
  }

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample} />
        <PanelDataProvider
          key={sample._id}
          project={project}
          sample={sample}
          panels={panels}
        >
          <WorkspaceProvider
            panelIds={panelIds}
            linkTime={project.layout?.link_time ?? true}
          >
            <Flex>
              <ToolBar />
              {project.task === TaskType.MultiPanel ? (
                <WorkspaceView panels={panels} />
              ) : (
                panels.map((panel) => (
                  <PanelFrame key={panel.id} panel={panel} />
                ))
              )}
            </Flex>
          </WorkspaceProvider>
        </PanelDataProvider>
      </Provider>
    </div>
  );
}

export default function SamplePage() {
  const { project_id, sample_id } = useParams();

  if (!project_id || !sample_id) return null;

  return (
    <SampleProvider projectId={project_id} sampleId={sample_id}>
      <SampleHistoryProvider projectId={project_id}>
        <SamplePageContent sampleId={sample_id} />
      </SampleHistoryProvider>
    </SampleProvider>
  );
}
