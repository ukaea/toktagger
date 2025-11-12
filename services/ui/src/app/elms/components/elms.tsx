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
import { useRef } from "react";

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
  {}
);

type ELMViewInfo = {
  data: MultiVariateTimeSeriesData;
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[]
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

  let plotData: Plotly.Data[] = Object.entries(data.values).map(
    ([key, value]: [string, TimeSeriesData]) => {
      return {
        name: key,
        x: value.time,
        y: value.values,
        mode: "lines",
      };
    }
  );

  const numRows = plotData.length;
  const domainHeight = 1 / numRows;

  const yAxesNames = Array.from(
    { length: numRows },
    (_, i) => `y${i === 0 ? "" : i + 1}`
  ).reverse();

  // Dynamically generate y-axis titles based on plotData names
  plotData = plotData.map((trace, index) => ({
    ...trace,
    yaxis: yAxesNames[index],
  }));

  // Dynamically generate y-axis domains based on numRows
  const yAxisDomains = Array.from({ length: numRows }, (_, i) => {
    const start = i * domainHeight;
    const end = (i + 1) * domainHeight;
    return [start, end];
  });

  // Build yaxis layout object dynamically
  const yAxesLayout = yAxisDomains.reduce(
    (acc, domain, idx) => {
      const axisNum = idx === 0 ? "" : idx + 1; // yaxis, yaxis2, yaxis3, ...
      acc[`yaxis${axisNum}`] = { domain, autorange: true, fixedrange: true };
      return acc;
    },
    {} as Record<string, unknown>
  );

  const maxTime = plotData.reduce(
    (max, trace) => Math.max(max, Math.max(...trace.x)),
    -Infinity
  );
  const minTime = plotData.reduce(
    (min, trace) => Math.min(min, Math.min(...trace.x)),
    Infinity
  );

  const plotLayout: Partial<Plotly.Layout> = {
    uirevision: "true",
    grid: { rows: 1, columns: 1, pattern: "independent" },
    dragmode: "pan",
    width: window.innerWidth * 0.84,
    height: window.innerHeight * 0.9,
    xaxis: {
      minallowed: minTime,
      maxallowed: maxTime,
      range: [minTime, maxTime],
      fixedrange: false,
      autorange: false,
      rangeslider: { visible: true, thickness: 0.1 },
      title: {
        text: "Time [s]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    ...yAxesLayout,
  };

  const dataRef = useRef(plotData);
  const layoutRef = useRef(plotLayout);

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
              plotConfig={{ data: dataRef.current, layout: layoutRef.current }}
            >
              <Zones onZoneUpdate={updateZones} />
            </TimeSeries>
          </ZoneProvider>
        </ContextMenuProvider>
      </div>
    </div>
  );
};
