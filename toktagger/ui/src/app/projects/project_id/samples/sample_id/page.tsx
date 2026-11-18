"use client";

import { TaskType } from "@/types";
import ToolBar from "@/app/components/tools/toolbar";
import { useParams } from "react-router-dom";
import ErrorView from "@/app/views/error";
import ForbiddenView from "@/app/views/forbidden";
import LoadingView from "@/app/views/loading";
import { SampleProvider, useSample } from "@/app/contexts/SampleContext";
import {
  PanelDataProvider,
  panelsOfTabs,
  tabsForProject,
} from "@/app/contexts/PanelDataContext";
import { WorkspaceProvider } from "@/app/contexts/WorkspaceContext";
import { PanelFrame } from "@/app/panels/panel-frame";
import { WorkspaceView } from "@/app/panels/workspace-view";
import { SampleHistoryProvider } from "@/app/contexts/SampleHistoryContext";
import { AnnotationToolProvider } from "@/app/contexts/AnnotationToolContext";
import { AnnotationToolbar } from "@/app/components/tools/annotationToolbar";
import {
  AnnotationsTable,
  TIME_PANEL_KINDS,
} from "@/app/components/ui/annotationsTable";
import { useBreadcrumbs } from "@/app/contexts/BreadcrumbContext";

function SamplePageContent(props: { sampleId: string }) {
  const { project, sample, isLoading, error, errorStatus } = useSample();
  const tabs = project && sample ? tabsForProject(project, sample) : [];
  const panels = panelsOfTabs(tabs);
  useBreadcrumbs(
    project && sample
      ? [
          { key: "projects", label: "Projects", href: "/ui/projects" },
          {
            key: "project",
            label: `Project: ${project.name}`,
            href: `/ui/projects/${project._id}`,
          },
          { key: "samples", label: `Shot: ${sample.shot_id}` },
        ]
      : error
        ? [
            { key: "projects", label: "Projects", href: "/ui/projects" },
            {
              key: "denied",
              label: errorStatus === 403 ? "Access Denied" : "Error",
            },
          ]
        : // Spectrum renders the last breadcrumb as the (unclickable) current
          // page, so a single "Projects" crumb here can't act as a link.
          [{ key: "projects", label: "Projects", href: "/ui/projects" }],
  );

  // Data errors are shown in place of the view by SampleView so the toolbar stays usable.
  if (error && errorStatus === 403) return <ForbiddenView message={error} />;

  if (!project) {
    return isLoading ? (
      <LoadingView />
    ) : (
      <ErrorView message={error ?? "Project not found."} />
    );
  }

  if (!sample) {
    return isLoading ? (
      <LoadingView />
    ) : (
      <ErrorView message={error ?? "Sample not found."} />
    );
  }

  //  Prevent a stale render during route param transitions
  if (sample._id !== props.sampleId) {
    return error ? <ErrorView message={error} /> : <LoadingView />;
  }

  // h-full/min-h-0 hand the height of the area below the top bar down to the
  // toolbar and the view, so each can scroll internally instead of the whole
  // page growing past the bottom of the window.
  return (
    <div className="flex h-full min-h-0">
      <PanelDataProvider
        key={sample._id}
        project={project}
        sample={sample}
        panels={panels}
      >
        <WorkspaceProvider
          tabs={tabs}
          projectId={project._id ?? ""}
          linkTime={project.layout?.link_time ?? true}
        >
          <AnnotationToolProvider>
            <ToolBar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto [&>*]:shrink-0">
              {project.task === TaskType.MultiPanel ? (
                <WorkspaceView tabs={tabs} />
              ) : (
                panels.map((panel) => (
                  <PanelFrame key={panel.id} panel={panel} />
                ))
              )}
              {panels.some((panel) =>
                TIME_PANEL_KINDS.includes(panel.kind),
              ) && <AnnotationsTable panels={panels} />}
            </div>
            <AnnotationToolbar />
          </AnnotationToolProvider>
        </WorkspaceProvider>
      </PanelDataProvider>
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
