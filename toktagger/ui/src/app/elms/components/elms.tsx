"use client";
import {
  MultiVariateTimeSeriesData,
  Zone,
  Category,
  DisplayAnnotation,
  ZoneSchema,
  TimeRegionSchema,
  Annotation,
  TimeSeriesData,
} from "@/types";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { TimeSeries } from "@/app/components/plots/time-series";
import { Zones } from "@/app/components/tools/zones";
import "react-contexify/ReactContexify.css";

import {
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";

const zoneCategories: Category[] = [
  { name: "Peak", color: "rgb(233, 170, 98)" },
  { name: "Outlier", color: "rgb(233, 170, 250)" },
  { name: "Jump", color: "rgb(1, 250, 1)" },
  { name: "Change Point", color: "rgb(133, 170, 250)" },
];

const zoneCategoryColors = zoneCategories.reduce<Record<string, string>>(
  (acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  },
  {},
);

type ELMViewInfo = {
  data: MultiVariateTimeSeriesData;
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;
};

export const ELMView = ({ data, annotations, setAnnotations }: ELMViewInfo) => {
  const convertAnnotationToDisplayAnnotation =
    createAnnotationToDisplayAnnotationFunc(zoneCategoryColors);

  const displayAnnotations: DisplayAnnotation[] = annotations
    .filter((x: Annotation) => x.type !== "class_label")
    .map(convertAnnotationToDisplayAnnotation);

  const zones: Zone[] = displayAnnotations
    .filter((x: DisplayAnnotation) => ZoneSchema.safeParse(x).success)
    .map((x: DisplayAnnotation) => ZoneSchema.parse(x));

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  const plotData: Partial<Plotly.PlotData>[] = Object.entries(data.values).map(
    ([signalName, item], index) => ({
      x: (item as TimeSeriesData).time,
      y: (item as TimeSeriesData).values,
      name: signalName,
      xaxis: `x${index + 1}`,
      yaxis: `y${index + 1}`,
      mode: "lines"
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
    dragmode: false,
    margin: {t: 80, b: 80, l: 80, r: 80},
    width: 1100,
    height: (Object.entries(data.values).length * 150) + 160,
    ...axes,
  };

  return (
    <div className="flex space-y-3">
      <div className="flex-1 text-center items-center">
        <ContextMenuProvider menuId="elm-menu">
          <ZoneProvider
            categories={zoneCategories}
            initialData={zones}
            onModifyZone={updateZones}
          >
            <TimeSeries
              plotId="ELMs"
              plotConfig={{ data: plotData, layout: plotLayout }}
            >
              <Zones onZoneUpdate={updateZones} />
            </TimeSeries>
          </ZoneProvider>
        </ContextMenuProvider>
      </div>
    </div>
  );
};
