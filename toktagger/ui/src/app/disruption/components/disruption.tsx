"use client";

import {
  Category,
  TimeRegionSchema,
  TimePointSchema,
  MultiVariateTimeSeriesData,
  Annotation,
  VSpan,
  Zone,
  ZoneSchema,
  VSpanSchema,
  DisplayAnnotation,
  TimeSeriesData,
} from "@/types";
import { VSpanProvider } from "@/app/components/providers/vpsan-provider";
import { DisruptionTable } from "./disruption-table";
import { TimeSeries } from "@/app/components/plots/time-series";
import { Zones } from "@/app/components/tools/zones";
import { VSpans } from "@/app/components/tools/vspans";
import {
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";

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

  console.log(vspans);

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  const updateVSpans = (newVSpans: Array<VSpan>) => {
    updateAnnotations(setAnnotations, newVSpans, TimePointSchema);
  };
  const plotData: Partial<Plotly.PlotData>[] = Object.entries(data.values).map(
    ([signalName, item], index) => ({
      x: (item as TimeSeriesData).time,
      y: (item as TimeSeriesData).values,
      name: signalName,
      xaxis: `x${index + 1}`,
      yaxis: `y${index + 1}`,
    }),
  );

  let axes = Object.entries(data.values).map((_, index) => {
    const axName = `xaxis${index + 1}`;
    return { [axName]: { matches: "x" } };
  });
  axes = Object.assign({}, ...axes);

  const plotLayout: Partial<Plotly.Layout> = {
    grid: {
      rows: Object.entries(data.values).length,
      columns: 1,
      pattern: "independent",
    },
    uirevision: "true",
    showlegend: true,
    dragmode: "pan",
    ...axes,
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
