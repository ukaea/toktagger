"use client";
import { MultiVariateTimeSeriesData, TimeSeriesData } from "@/types";
import { BaseTimeSeriesPlot } from "@/app/components/plots/base-plot";
import { TimeSeriesProvider } from "@/app/contexts/TimeSeriesContext";
import { TimeRegion } from "@/app/components/tools/timeRegion";
import "react-contexify/ReactContexify.css";

import {
  applyGlobalStyle,
  arrayMax,
  arrayMin,
  assignStackedYAxes,
  buildStackedYAxesLayout,
} from "@/app/utils";
import { useEffect, useState } from "react";
import { TimePoint } from "@/app/components/tools/timePoint";
import { useSample } from "@/app/contexts/SampleContext";
import { View } from "@adobe/react-spectrum";
import { AnnotationsTable } from "@/app/components/ui/annotationsTable";
import { AnnotationToolbar } from "@/app/components/tools/annotationToolbar";
import { useElementHeight } from "@/app/hooks/useElementHeight";

// The traces are stacked, so each one needs its own share of the height. The
// plot never renders smaller than this - the column scrolls instead. The
// rangeslider takes 10% of the plot, hence the extra.
const MIN_TRACE_HEIGHT = 105;
const RANGESLIDER_FRACTION = 0.1;

// Floor for a single trace, also used before the container has been measured.
const MIN_PLOT_HEIGHT = 320;

export const TimeSeriesView = () => {
  const { data } = useSample();

  const [plotData, setPlotData] = useState<Partial<Plotly.PlotData>[]>([]);

  const viewData = data as MultiVariateTimeSeriesData | null;

  // Tracked as state so the plot restyles live when the OS theme changes.
  const [isDarkMode, setIsDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) =>
      setIsDarkMode(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!viewData) return;

    const plotData: Partial<Plotly.PlotData>[] = Object.entries(
      viewData.values,
    ).map(([key, value]: [string, TimeSeriesData | null]) => {
      return {
        name: key,
        x: value?.time ?? [],
        y: value?.values ?? [],
        mode: "lines",
      };
    });

    setPlotData(assignStackedYAxes(plotData));
  }, [data, viewData]);

  // The plot grows into spare height, but never shrinks below what the stacked
  // traces need to stay legible - the column scrolls instead.
  const { ref: plotAreaRef, height: plotAreaHeight } =
    useElementHeight<HTMLDivElement>();
  const minPlotHeight = Math.max(
    MIN_PLOT_HEIGHT,
    Math.round(
      (plotData.length * MIN_TRACE_HEIGHT) / (1 - RANGESLIDER_FRACTION),
    ),
  );
  const plotHeight = Math.max(plotAreaHeight, minPlotHeight);

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

  const yAxesLayout = buildStackedYAxesLayout(
    plotData.map((trace) => trace.name ?? ""),
  );

  const plotLayout: Partial<Plotly.Layout> = applyGlobalStyle(
    {
      uirevision: "true",
      //grid: { rows: 1, columns: 1, pattern: "independent" },
      dragmode: "pan",
      autosize: true,
      height: plotHeight,
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
    },
    isDarkMode,
  );

  if (!viewData) {
    return null;
  }

  return (
    <View width="100%" height="100%" minHeight={0}>
      <TimeSeriesProvider>
        <div className="flex h-full min-h-0 flex-row justify-between">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
            <div
              ref={plotAreaRef}
              style={{
                flex: `1 0 ${minPlotHeight}px`,
                minHeight: minPlotHeight,
              }}
            >
              <BaseTimeSeriesPlot
                plotId="TimesSeriesView"
                plotConfig={{ data: plotData, layout: plotLayout }}
              >
                <TimeRegion />
                <TimePoint />
              </BaseTimeSeriesPlot>
            </div>
            <AnnotationsTable />
          </div>
          <AnnotationToolbar />
        </div>
      </TimeSeriesProvider>
    </View>
  );
};
