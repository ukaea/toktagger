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
  VSpanSchema,
  VSpan,
  TimePointSchema,
} from "@/types";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { PlotlyWidget } from "@/app/components/plots/plotly";
import { Zones } from "@/app/components/tools/zones";
import "react-contexify/ReactContexify.css";

import {
  arrayMax,
  arrayMin,
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";
import { useEffect, useMemo, useState } from "react";
import { VSpanProvider } from "@/app/components/providers/vpsan-provider";
import { VSpans } from "@/app/components/tools/vspans";
import { useSample } from "@/app/contexts/SampleContext";
import { Flex, View } from "@adobe/react-spectrum";
import { AnnotationsTable } from "@/app/components/ui/annotationsTable";

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
  { name: "Flat Top", color: "#33A8FF" },
  { name: "Ramp Up", color: "#FF8D33" },
  { name: "Ramp Down", color: "#3380FF" },
  { name: "Unknown", color: "#B0B0B0" },
];

const vspanCategories: Category[] = [
  { name: "Disruption", color: "#33FFAA" },
  { name: "Thermal Quench", color: "#FFAA33" },
  { name: "Current Quench", color: "#AA33FF" },
  { name: "Control Loss", color: "#FF3333" },
];

const categoryColors = zoneCategories
  .concat(vspanCategories)
  .reduce<Record<string, string>>((acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  }, {});

export const TimeSeriesView = () => {
  const { data, annotations, setAnnotations } = useSample();

  const [plotData, setPlotData] = useState<Plotly.Data[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [vspans, setVSpans] = useState<VSpan[]>([]);

  const viewData = data as MultiVariateTimeSeriesData | null;

  useEffect(() => {
    if (!annotations || !viewData) return;

    const convertAnnotationToDisplayAnnotation =
      createAnnotationToDisplayAnnotationFunc(categoryColors);

    const displayAnnotations: DisplayAnnotation[] = annotations
      .filter((x: Annotation) => x.type !== "class_label")
      .map(convertAnnotationToDisplayAnnotation);

    const newZones: Zone[] = displayAnnotations
      .filter((x: DisplayAnnotation) => ZoneSchema.safeParse(x).success)
      .map((x: DisplayAnnotation) => ZoneSchema.parse(x));

    const newVSpans: VSpan[] = displayAnnotations
      .filter((x: DisplayAnnotation) => VSpanSchema.safeParse(x).success)
      .map((x: DisplayAnnotation) => VSpanSchema.parse(x));

    setZones(newZones);
    setVSpans(newVSpans);
  }, [annotations, viewData]);

  const updateVSpans = (newVSpans: Array<VSpan>) => {
    updateAnnotations(setAnnotations, newVSpans, TimePointSchema);
  };

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  useEffect(() => {
    if (!viewData) return;

    const numRows = Object.keys(viewData.values).length;

    let plotData: Plotly.Data[] = Object.entries(viewData.values).map(
      ([key, value]: [string, TimeSeriesData]) => {
        return {
          name: key,
          x: value.time,
          y: value.values,
          mode: "lines",
        };
      },
    );

    const yAxesNames = Array.from(
      { length: numRows },
      (_, i) => `y${i === 0 ? "" : i + 1}`,
    ).reverse();

    // Dynamically generate y-axis titles based on plotData names
    plotData = plotData.map((trace, index) => ({
      ...trace,
      yaxis: yAxesNames[index],
    }));
    setPlotData(plotData);
  }, [data, viewData]);

  const plotLayout: Partial<Plotly.Layout> = useMemo(() => {
    let maxTime = -Infinity;
    let minTime = Infinity;

    for (const trace of plotData) {
      const xData = trace.x as number[];
      if (xData && xData.length > 0) {
        const traceMax = arrayMax(xData);
        const traceMin = arrayMin(xData);
        if (traceMax > maxTime) maxTime = traceMax;
        if (traceMin < minTime) minTime = traceMin;
      }
    }

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
        acc[`yaxis${axisNum}`] = {
          domain,
          autorange: true,
          fixedrange: true,
          title: {
            text: plotData[numRows - idx - 1].name || "",
            font: {
              family: "Courier New, monospace",
              size: 12,
              color: "#7f7f7f",
            },
          },
        };
        return acc;
      },
      {} as Record<string, unknown>,
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

  if (!viewData) {
    return null;
  }

  return (
    <Flex justifyContent="center" alignItems="center">
      <ContextMenuProvider menuId="time-series-menu">
        <ZoneProvider
          categories={zoneCategories}
          initialData={zones}
          onModifyZone={updateZones}
        >
          <VSpanProvider
            categories={vspanCategories}
            initialData={vspans}
            onModifyVSpan={updateVSpans}
          >
            <Flex direction="column" gap="size-200">
              <PlotlyWidget
                plotId="TimesSeriesView"
                plotConfig={{
                  data: plotData,
                  layout: plotLayout,
                }}
              >
                <Zones onUpdate={updateZones} />
                <VSpans onUpdate={updateVSpans} />
              </PlotlyWidget>
              <AnnotationsTable />
            </Flex>
          </VSpanProvider>
        </ZoneProvider>
      </ContextMenuProvider>
    </Flex>
  );
};
