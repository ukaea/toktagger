"use client";

import {
  RadialProfileData,
  RadialProfileDataSchema,
  TimeSeriesAnnotationType,
} from "@/types";
import {
  applyGlobalStyle,
  arrayMax,
  arrayMin,
  assignStackedYAxes,
  buildStackedYAxesLayout,
  stackedAxisNumber,
} from "@/app/utils";
import { BaseTimeSeriesPlot } from "@/app/components/plots/base-plot";
import { TimeSeriesProvider } from "@/app/contexts/TimeSeriesContext";
import {
  RadialProfileProvider,
  useRadialProfile,
} from "@/app/contexts/RadialProfileContext";
import { TimeRegion } from "@/app/components/tools/timeRegion";
import { TimePoint } from "@/app/components/tools/timePoint";
import { RadialRange } from "@/app/components/tools/radialRange";
import { AnnotationToolbar } from "@/app/components/tools/annotationToolbar";
import { AnnotationsTable } from "@/app/components/ui/annotationsTable";
import "react-contexify/ReactContexify.css";
import { useSample } from "@/app/contexts/SampleContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, View } from "@adobe/react-spectrum";

const RADIAL_TOOLS = [TimeSeriesAnnotationType.BOUNDING_BOX];
const TIME_TOOLS = [
  TimeSeriesAnnotationType.TIME_REGION,
  TimeSeriesAnnotationType.TIME_POINT,
];
// The bottom of the time plot holds a strip marking each profile time slice.
const SLICE_STRIP_DOMAIN: [number, number] = [0, 0.08];
const SIGNALS_DOMAIN: [number, number] = [0.12, 1];

const AXIS_TITLE_FONT = {
  family: "Courier New, monospace",
  size: 12,
  color: "#7f7f7f",
};

const PLOT_CONFIG: Partial<Plotly.Config> = {
  modeBarButtons: [
    ["zoom2d", "select2d", "pan2d", "autoScale2d", "resetScale2d", "toImage"],
  ],
  displaylogo: false,
  displayModeBar: true,
  scrollZoom: true,
  responsive: true,
};

const RADIAL_PLOT_CONFIG: Partial<Plotly.Config> = {
  ...PLOT_CONFIG,
  modeBarButtons: [
    ["zoom2d", "pan2d", "autoScale2d", "resetScale2d", "toImage"],
  ],
};

const finite = (values: (number | null)[]) =>
  values.filter((v): v is number => v !== null && Number.isFinite(v));

const paddedRange = (values: number[], fraction = 0.05): [number, number] => {
  if (values.length === 0) return [0, 1];
  const min = arrayMin(values);
  const max = arrayMax(values);
  const pad = (max - min || 1) * fraction;
  return [min - pad, max + pad];
};

// Caps the range at a high quantile so a few spurious samples don't flatten the profiles.
const robustMax = (values: number[], quantile = 0.995) => {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))
  ];
};

function useIsDarkMode() {
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
  return isDarkMode;
}

const RadialProfilePlots = ({ data }: { data: RadialProfileData }) => {
  const { visibleSlices, sliceColor, setTimeWindow } = useRadialProfile();
  const isDarkMode = useIsDarkMode();

  const profileNames = useMemo(() => Object.keys(data.profiles), [data]);
  // The first profile is on the top row, as in assignStackedYAxes.
  const axisNumber = useCallback(
    (profileIndex: number) =>
      stackedAxisNumber(profileNames.length - profileIndex - 1, 0),
    [profileNames],
  );

  // Fixed ranges so the axes don't jump as the time window changes.
  const radialRanges = useMemo(
    () => ({
      x: paddedRange(finite(data.radius.flat()), 0.02),
      y: Object.values(data.profiles).map((values) =>
        paddedRange([0, robustMax(finite(values.flat()))]),
      ),
    }),
    [data],
  );

  const radialData = useMemo<Partial<Plotly.PlotData>[]>(
    () =>
      Object.entries(data.profiles).flatMap(([name, values], profileIndex) =>
        visibleSlices.map((index) => {
          const time = data.time[index];
          const color = sliceColor(time);
          return {
            name: `${name} t = ${time.toFixed(4)} s`,
            x: data.radius[index],
            y: values[index],
            yaxis: `y${axisNumber(profileIndex)}`,
            mode: "lines+markers",
            line: { color, width: 1 },
            marker: { color, size: 4 },
            hovertemplate: `${name}<br>t: ${time.toFixed(4)} s<br>radius: %{x:.4g}<br>value: %{y:.4g}<extra></extra>`,
          } as Partial<Plotly.PlotData>;
        }),
      ),
    [data, visibleSlices, sliceColor, axisNumber],
  );

  const radialLayout = useMemo<Partial<Plotly.Layout>>(() => {
    const yAxes = buildStackedYAxesLayout(profileNames);
    profileNames.forEach((_, profileIndex) => {
      const key = `yaxis${axisNumber(profileIndex)}`;
      yAxes[key] = {
        ...(yAxes[key] as object),
        range: radialRanges.y[profileIndex],
        autorange: false,
        fixedrange: false,
        showgrid: false,
        linewidth: 1,
      };
    });
    return applyGlobalStyle(
      {
        autosize: true,
        height: window.innerHeight * Math.max(0.5, 0.3 * profileNames.length),
        margin: { t: 30, b: 50 },
        showlegend: false,
        dragmode: "pan",
        uirevision: "true",
        hovermode: "closest",
        xaxis: {
          title: { text: "Radius", font: AXIS_TITLE_FONT },
          range: radialRanges.x,
          showgrid: false,
          linewidth: 1,
        },
        ...yAxes,
      },
      isDarkMode,
    );
  }, [profileNames, axisNumber, radialRanges, isDarkMode]);

  const timeData = useMemo<Partial<Plotly.PlotData>[]>(() => {
    const signals = Object.entries(data.time_series).map(
      ([name, series]) =>
        ({
          name,
          x: series.time,
          y: series.values,
          mode: "lines",
        }) as Partial<Plotly.PlotData>,
    );
    const sliceStrip = {
      name: "Profile slices",
      x: data.time,
      y: data.time.map(() => 0),
      mode: "markers",
      marker: {
        symbol: "line-ns-open",
        size: 18,
        line: { width: 2 },
        color: data.time.map(sliceColor),
      },
      hovertemplate: "slice t: %{x:.4f} s<extra></extra>",
      yaxis: "y",
    } as Partial<Plotly.PlotData>;
    return [sliceStrip, ...assignStackedYAxes(signals, 1)];
  }, [data, sliceColor]);

  const timeLayout = useMemo<Partial<Plotly.Layout>>(() => {
    const names = Object.keys(data.time_series);
    const allTimes = [
      ...data.time,
      ...Object.values(data.time_series).flatMap((s) => s.time),
    ];
    const timeRange: [number, number] =
      allTimes.length > 0 ? [arrayMin(allTimes), arrayMax(allTimes)] : [0, 1];
    // Open on the profile's slices; the 1D signals often extend well beyond them.
    const initialRange =
      data.time.length > 0 ? paddedRange(data.time, 0.02) : timeRange;
    return applyGlobalStyle(
      {
        autosize: true,
        height: window.innerHeight * 0.4,
        margin: { t: 10 },
        showlegend: false,
        dragmode: "pan",
        uirevision: "true",
        xaxis: {
          minallowed: timeRange[0],
          maxallowed: timeRange[1],
          range: initialRange,
          autorange: false,
          rangeslider: { visible: true, thickness: 0.08 },
          title: { text: "Time [s]", font: AXIS_TITLE_FONT },
        },
        yaxis: {
          domain: SLICE_STRIP_DOMAIN,
          fixedrange: true,
          showticklabels: false,
          showgrid: false,
          zeroline: false,
          range: [-1, 1],
        },
        ...buildStackedYAxesLayout(names, SIGNALS_DOMAIN, 1),
      },
      isDarkMode,
    );
  }, [data, isDarkMode]);

  return (
    <>
      <BaseTimeSeriesPlot
        plotId="RadialProfileRadial"
        ariaLabel="radial-profile"
        plotConfig={{
          data: radialData,
          layout: radialLayout,
          config: RADIAL_PLOT_CONFIG,
        }}
        rescaleOnZoom={false}
        tools={RADIAL_TOOLS}
        selection="none"
        muteHoverWhileDrawing
      >
        <RadialRange projection="radius" />
      </BaseTimeSeriesPlot>
      <BaseTimeSeriesPlot
        plotId="RadialProfileTime"
        ariaLabel="radial-profile-time"
        plotConfig={{ data: timeData, layout: timeLayout, config: PLOT_CONFIG }}
        rescaleOnZoom={false}
        tools={TIME_TOOLS}
        selection="x"
        onXRangeChange={setTimeWindow}
      >
        <TimeRegion />
        <TimePoint />
        <RadialRange projection="time" />
      </BaseTimeSeriesPlot>
    </>
  );
};

export const RadialProfileView = () => {
  const { data, plotProps } = useSample();
  // Memoised so an annotation drag doesn't rebuild both plots mid-draw.
  const parsed = useMemo(() => RadialProfileDataSchema.safeParse(data), [data]);

  if (!parsed.success) {
    return null;
  }
  const viewData = parsed.data;

  return (
    <View width="100%">
      <Flex justifyContent="center" alignItems="center">
        <RadialProfileProvider data={viewData} colorMap={plotProps.colorMap}>
          <TimeSeriesProvider>
            <Flex direction="row" flex justifyContent="space-between">
              <Flex direction="column" flex gap="size-100">
                <RadialProfilePlots data={viewData} />
                <AnnotationsTable />
              </Flex>
              <AnnotationToolbar />
            </Flex>
          </TimeSeriesProvider>
        </RadialProfileProvider>
      </Flex>
    </View>
  );
};
