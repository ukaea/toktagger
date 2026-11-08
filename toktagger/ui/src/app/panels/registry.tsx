"use client";
import React from "react";
import {
  Data,
  MultiVariateTimeSeriesDataSchema,
  PanelKind,
  PlotProps,
} from "@/types";
import { ToolEntry } from "@/app/components/tools/toolAccordion";
import { ColorMapPicker } from "@/app/components/tools/colorMap";
import { PeakDetectionTool } from "@/app/components/annotators/peaks";
import { OutlierDetectionTool } from "@/app/components/annotators/outliers";
import { ChangePointDetectionTool } from "@/app/components/annotators/changepoints";
import { JumpDetectionTool } from "@/app/components/annotators/jump";
import Profile2DThresholdTool from "@/app/components/annotators/thresholding";
import { Profile2DViewParamsWidget } from "@/app/profile2d/components/profile2dViewParamsWidget";
import { VideoToolbox } from "@/app/video/components/video-toolbox";
import { TimeSeriesView } from "@/app/time_series/components/time-series";
import { Profile2dView } from "@/app/profile2d/components/profile2d";
import { RadialProfileView } from "@/app/radial_profile/components/radial-profile";
import { VideoProviders, VideoView } from "@/app/video/components/video-view";

export type PanelToolContext = {
  projectId: string;
  sampleId: string;
  data: Data | null;
  plotProps: PlotProps;
  setPlotProps: (props: PlotProps) => void;
};

type PanelDefinition = {
  View: React.ComponentType;
  Providers?: React.ComponentType<{ children: React.ReactNode }>;
  tools: (context: PanelToolContext) => ToolEntry[];
  // Video keeps showing the last frame while the next one loads.
  keepDataWhileLoading?: boolean;
};

function timeSeriesTools({
  projectId,
  sampleId,
  data,
}: PanelToolContext): ToolEntry[] {
  const result = MultiVariateTimeSeriesDataSchema.safeParse(data);
  if (!result.success) return [];
  const ids = { project_id: projectId, sample_id: sampleId };
  return [
    {
      name: "Peak Detection",
      component: <PeakDetectionTool {...ids} data={result.data} />,
    },
    {
      name: "Outlier Detection",
      component: <OutlierDetectionTool {...ids} />,
    },
    {
      name: "Change Point Detection",
      component: <ChangePointDetectionTool {...ids} data={result.data} />,
    },
    {
      name: "Jump Detection",
      component: <JumpDetectionTool {...ids} data={result.data} />,
    },
  ];
}

const colorMapTool = ({ plotProps, setPlotProps }: PanelToolContext) => ({
  name: "Color Map",
  component: (
    <ColorMapPicker plotProps={plotProps} setPlotProps={setPlotProps} />
  ),
});

export const PANEL_REGISTRY: Record<PanelKind, PanelDefinition> = {
  time_series: { View: TimeSeriesView, tools: timeSeriesTools },
  profile_2d: {
    View: Profile2dView,
    // Not gated on data so the signal picker still lets the user recover.
    tools: (context) => [
      { name: "View Parameters", component: <Profile2DViewParamsWidget /> },
      colorMapTool(context),
      {
        name: "Threshold",
        component: (
          <Profile2DThresholdTool
            project_id={context.projectId}
            sample_id={context.sampleId}
          />
        ),
      },
    ],
  },
  radial_profile: {
    View: RadialProfileView,
    tools: (context) => [colorMapTool(context)],
  },
  video: {
    View: VideoView,
    Providers: VideoProviders,
    keepDataWhileLoading: true,
    tools: ({ data }) =>
      data
        ? [
            {
              name: "Video Tools",
              component: <VideoToolbox />,
              defaultExpanded: true,
            },
          ]
        : [],
  },
};
