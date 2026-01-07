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
import { useEffect, useMemo, useState } from "react";

const zoneCategories: Category[] = [
  { name: "ELM", color: "#FF5733" },
  { name: "L-mode", color: "#33FF57" },
  { name: "H-mode", color: "#3357FF" },
  { name: "Thermal Quench", color: "#FF33A8" },
  { name: "Current Quench", color: "#A833FF" },
  { name: "Sawtooth", color: "#33FFF6" },
  { name: "IRE", color: "#FFC733" },
  { name: "Locked Mode", color: "#8DFF33" },
  { name: "VDE", color: "#FF3380" },
  { name: "Unknown", color: "#B0B0B0" },
];

const zoneCategoryColors = zoneCategories.reduce<Record<string, string>>(
  (acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  },
  {}
);

type TimeSeriesViewInfo = {
  data: MultiVariateTimeSeriesData;
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[]
  ) => void;
};

export const TimeSeriesView = ({
  data,
  annotations,
  setAnnotations,
}: TimeSeriesViewInfo) => {
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

  const [plotData, setPlotData] = useState<Plotly.Data[]>([]);

  useEffect(() => {
    const numRows = Object.keys(data.values).length;

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

    const yAxesNames = Array.from(
      { length: numRows },
      (_, i) => `y${i === 0 ? "" : i + 1}`
    ).reverse();

    // Dynamically generate y-axis titles based on plotData names
    plotData = plotData.map((trace, index) => ({
      ...trace,
      yaxis: yAxesNames[index],
    }));
    setPlotData(plotData);
  }, [data]);

  const plotLayout: Partial<Plotly.Layout> = useMemo(() => {
    const maxTime = plotData.reduce(
      (max, trace) => Math.max(max, Math.max(...(trace.x as number[]))),
      -Infinity
    );

    const minTime = plotData.reduce(
      (min, trace) => Math.min(min, Math.min(...(trace.x as number[]))),
      Infinity
    );

    const numRows = plotData.length;
    const domainHeight = 1 / numRows;
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

    return {
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
  }, [plotData]);

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
