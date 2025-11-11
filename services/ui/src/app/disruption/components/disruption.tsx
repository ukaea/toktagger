"use client";

import {
  Category,
  TimeRegionSchema,
  TimePointSchema,
  MultiVariateTimeSeriesData,
  VSpan,
  Zone,
  ZoneSchema,
  VSpanSchema,
  DisplayAnnotation,
  Annotation,
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
  {},
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
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;
};

export const DisruptionView = ({
  data,
  annotations,
  setAnnotations,
}: DisruptionViewInfo) => {
  const convertAnnotationToDisplayAnnotation =
    createAnnotationToDisplayAnnotationFunc(colorMapping);

  const displayAnnotations: DisplayAnnotation[] = annotations
    .filter((x: Annotation) => x.type !== "class_label")
    .map(convertAnnotationToDisplayAnnotation);

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

  const plotData: Partial<Plotly.PlotData>[] = Object.keys(data.values).map(
    (signal) => ({
      x: data.values[signal].time,
      y: data.values[signal].values,
      line: {
        color: "black",
      },
      name: "ip",
    }),
  );

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
    showlegend: true,
    dragmode: "pan",
  };

  return (
    <div className="flex flex-col items-center space-y-3">
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
            <TimeSeries
              plotId="Disruption"
              plotConfig={{ data: plotData, layout: plotLayout }}
            >
              <Zones onZoneUpdate={updateZones} />
              <VSpans onZoneUpdate={updateVSpans} />
            </TimeSeries>
            <DisruptionTable />
          </ZoneProvider>
        </VSpanProvider>
      </ContextMenuProvider>
    </div>
  );
};
