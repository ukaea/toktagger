"use client";

import {
  Category,
  TimeRegionSchema,
  TimePointSchema,
  MultiVariateTimeSeriesData,
  Annotations,
  VSpan,
  Zone,
  ZoneSchema,
  VSpanSchema,
  DisplayAnnotation,
} from "@/types";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { VSpanProvider } from "@/app/components/providers/vpsan-provider";
import { DisruptionTable } from "./disruption-table";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { TimeSeries } from "@/app/components/plots/time-series";
import { Zones } from "@/app/components/tools/zones";
import { VSpans } from "@/app/components/tools/vspans";
import {
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";
import { AnnotationToolbar } from "@/app/components/tools/annotationToolbar";

const disruptionCategories: Category[] = [
  { name: "Disruption", color: "rgb(255, 0, 0)" },
];

const zoneCategories: Category[] = [
  { name: "RampUp", color: "rgb(233, 170, 98)" },
  { name: "FlatTop", color: "rgb(120, 167, 85)" },
  { name: "RampDown", color: "rgb(108, 189, 224)" },
];

const zoneCategoryColors = zoneCategories.reduce<Record<string, string>>(
  (acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  },
  {}
);

const disruptionCategoryColors = disruptionCategories.reduce<
  Record<string, string>
>((acc, curr) => {
  acc[curr.name] = curr.color;
  return acc;
}, {});

const colorMapping = { ...disruptionCategoryColors, ...zoneCategoryColors };

type DisruptionViewInfo = {
  data: MultiVariateTimeSeriesData;
  annotations: Annotations;
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations
  ) => void;
};

export const DisruptionView = ({
  data,
  annotations,
  setAnnotations,
}: DisruptionViewInfo) => {
  const convertAnnotationToDisplayAnnotation =
    createAnnotationToDisplayAnnotationFunc(colorMapping);

  const displayAnnotations: DisplayAnnotation[] = annotations.map(
    convertAnnotationToDisplayAnnotation
  );

  const zones: Zone[] = displayAnnotations
    .filter((x: DisplayAnnotation) => ZoneSchema.safeParse(x).success)
    .map((x: DisplayAnnotation) => ZoneSchema.parse(x));

  const vspans: VSpan[] = displayAnnotations
    .filter((x: DisplayAnnotation) => VSpanSchema.safeParse(x).success)
    .map((x: DisplayAnnotation) => VSpanSchema.parse(x));

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  const updateVSpans = (newVSpans: Array<VSpan>) => {
    updateAnnotations(setAnnotations, newVSpans, TimePointSchema);
  };

  const plotData: Partial<Plotly.PlotData>[] = [
    {
      x: data.values["ip"].time,
      y: data.values["ip"].values,
      line: {
        color: "black",
      },
      name: "ip",
    },
    {
      x: data.values["ANE_DENSITY"].time,
      y: data.values["ANE_DENSITY"].values,
      line: {
        color: "black",
      },
      name: "density",
      xaxis: "x2",
      yaxis: "y2",
    },
  ];

  const plotLayout: Partial<Plotly.Layout> = {
    uirevision: "true",
    grid: { rows: 2, columns: 1, pattern: "independent" },
    xaxis: {
      title: {
        text: "Time [s]",
      },
    },
    yaxis: {
      title: {
        text: "Plasma current, ip [A]",
      },
    },
    xaxis2: {
      matches: "x",
      title: {
        text: "Time [s]",
      },
    },
    yaxis2: {
      title: {
        text: "Plasma current, ip [A]",
      },
    },
    showlegend: true,
    dragmode: "pan",
  };

  return (
      <ContextMenuProvider menuId="disruption-menu">
        <VSpanProvider
          categories={disruptionCategories}
          initialData={vspans}
          onModifyVSpan={updateVSpans}
        >
          <ZoneProvider
            categories={zoneCategories}
            initialData={zones}
            onModifyZone={updateZones}
          >
            <div className="flex gap-4">
              <div className="flex-1 flex-col items-center space-y-3">
                <TimeSeries
                  plotId="Disruption"
                  plotConfig={{ data: plotData, layout: plotLayout }}
                >
                  <Zones onZoneUpdate={updateZones} />
                  <VSpans onZoneUpdate={updateVSpans} />
                </TimeSeries>
                <DisruptionTable />
              </div>
              <AnnotationToolbar />
            </div>
          </ZoneProvider>
        </VSpanProvider>
      </ContextMenuProvider>
  );
};
