"use client";

import { SpectrogramViewTable } from "./spectrogram-table";
import {
  SpectrogramData,
  Category,
  Zone,
  TimeRegionSchema,
  TimePointSchema,
  DisplayAnnotation,
  ZoneSchema,
  VSpanSchema,
  VSpan,
  Annotation,
  SpectrogramMaskSchema,
  SpectrogramMask,
  PlotProps,
} from "@/types";
import { VSpanProvider } from "@/app/components/providers/vpsan-provider";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { TimeSeries } from "@/app/components/plots/time-series";
import { Zones } from "@/app/components/tools/zones";
import { VSpans } from "@/app/components/tools/vspans";
import * as d3 from "d3";
import {
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";
import { useEffect } from "react";

const lockedModeCategories: Category[] = [
  { name: "Locked Mode", color: "rgb(255, 0, 0)" },
];

const zoneCategories: Category[] = [
  { name: "NTM", color: "rgb(0, 255, 255)" },
  { name: "LLM", color: "rgb(200, 100, 100)" },
];

const zoneCategoryColors = zoneCategories.reduce<Record<string, string>>(
  (acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  },
  {},
);

const lockedModeCategoryColors = lockedModeCategories.reduce<
  Record<string, string>
>((acc, curr) => {
  acc[curr.name] = curr.color;
  return acc;
}, {});

const colorMapping = { ...lockedModeCategoryColors, ...zoneCategoryColors };

type SpectrogramViewInfo = {
  data: SpectrogramData;
  annotations: Annotation[];
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void;
  plotProps: PlotProps;
};

export const SpectrogramView = ({
  data,
  annotations,
  setAnnotations,
  plotProps,
}: SpectrogramViewInfo) => {
  useEffect(() => {
    console.log("SpectrogramView plotProps updated:", plotProps);
    console.log("Threshold active:", plotProps.thresholdActive);
  }, [plotProps]);

  console.log(annotations);

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
  const mask: SpectrogramMask = displayAnnotations
    .filter(
      (x: DisplayAnnotation) => SpectrogramMaskSchema.safeParse(x).success,
    )
    .map((x: DisplayAnnotation) => SpectrogramMaskSchema.parse(x))[0];

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  const updateVSpans = (newVSpans: Array<VSpan>) => {
    updateAnnotations(setAnnotations, newVSpans, TimePointSchema);
  };

  const numDigits = plotProps.numSignificantDigits || 4;
  const smallPrecisionFactor = Math.pow(10, -1 * numDigits);

  const amplitude_og = data.amplitude;
  let amplitude: Array<Array<number>> = [];
  if (plotProps.thresholdActive) {
    console.log("Applying threshold mask to amplitude data");
    amplitude = data.amplitude.map((row: Array<number>, rowIndex: number) =>
      row.map((value: number, colIndex: number) => {
        let maskValue = mask?.values[rowIndex]?.[colIndex];
        if (maskValue === undefined || maskValue === null) {
          maskValue = 1; // Default to 1 if mask value is undefined
        }
        return value * maskValue;
      }),
    );
  } else {
    amplitude = data.amplitude;
  }
  const ampMin = Math.max(smallPrecisionFactor, Math.min(...amplitude.flat()));
  const ampMax = Math.max(...amplitude.flat());

  const logAmplitude_og = amplitude_og.map((row: Array<number>) =>
    row.map((x) => Math.log10(Math.max(x, smallPrecisionFactor))),
  );
  const logAmpMin = Math.min(...logAmplitude_og.flat());
  const logAmpMax = Math.max(...logAmplitude_og.flat());

  const logAmplitude = amplitude.map((row: Array<number>) =>
    row.map((x) => Math.log10(Math.max(x, smallPrecisionFactor))),
  );

  const generateLogTicks = (min: number, max: number) => {
    const minPower = Math.floor(Math.log10(min));
    const maxPower = Math.ceil(Math.log10(max));

    const tickvals: number[] = [];
    const ticktext: string[] = [];

    // Add major ticks (powers of 10) and minor ticks (2,3,4,5,6,7,8,9 × 10^n)
    for (let power = minPower; power <= maxPower; power++) {
      const baseValue = Math.pow(10, power);

      // Add major tick (power of 10)
      if (baseValue >= min && baseValue <= max) {
        tickvals.push(Math.log10(baseValue));
        ticktext.push(formatTickLabel(baseValue));
      }

      // Add minor ticks (2-9 × 10^power)
      for (let multiplier = 2; multiplier <= 9; multiplier++) {
        const subValue = baseValue * multiplier;
        if (
          subValue >= min &&
          subValue <= max &&
          subValue < Math.pow(10, maxPower + 1)
        ) {
          tickvals.push(Math.log10(subValue));
          ticktext.push(""); // Empty labels for minor ticks
        }
      }
    }

    // Add min and max if they're not already included
    if (!tickvals.some((val) => Math.abs(val - Math.log10(min)) < 1e-10)) {
      tickvals.unshift(Math.log10(min));
      ticktext.unshift(formatTickLabel(min));
    }
    if (!tickvals.some((val) => Math.abs(val - Math.log10(max)) < 1e-10)) {
      tickvals.push(Math.log10(max));
      ticktext.push(formatTickLabel(max));
    }

    return { tickvals, ticktext };
  };

  const formatTickLabel = (value: number) => {
    return value.toExponential(0);
  };

  const { tickvals, ticktext } = generateLogTicks(ampMin, ampMax);

  const plotData: Partial<Plotly.PlotData>[] = [
    {
      name: "Saddle Coil FFT",
      type: "heatmap",
      x: data.time,
      y: data.frequency,
      z: logAmplitude_og,
      customdata: data.amplitude,
      hovertemplate:
        "time: %{x:.2f}s<br>freq: %{y:.2f}Hz<br>amp: %{customdata:.2e}<extra></extra>",
      coloraxis: "coloraxis",
      opacity: plotProps.thresholdActive ? 0.4 : 1,
    },
  ];

  if (plotProps.thresholdActive) {
    plotData.push({
      name: "Threshold Mask",
      type: "heatmap",
      x: data.time,
      y: data.frequency,
      z: logAmplitude,
      hoverinfo: "skip",
      coloraxis: "coloraxis",
      showscale: false,
    });
  }

  const interpFunc = (value: number) => {
    if (plotProps.colorMap === "Viridis") {
      return d3.interpolateViridis(value);
    }
    if (plotProps.colorMap === "Plasma") {
      return d3.interpolatePlasma(value);
    }
    if (plotProps.colorMap === "Inferno") {
      return d3.interpolateInferno(value);
    }
    if (plotProps.colorMap === "Magma") {
      return d3.interpolateMagma(value);
    }
    if (plotProps.colorMap === "Cividis") {
      return d3.interpolateCividis(value);
    }
    return d3.interpolateCividis(value); // Default to Cividis if no match
  };

  let plotLayout: Partial<Plotly.Layout> = {
    height: 600,
    xaxis: {
      title: {
        text: "Time [s]",
      },
      linewidth: 1,
      zerolinewidth: 1,
      showgrid: false,
    },
    yaxis: {
      title: {
        text: "Frequency [Hz]",
      },
      linewidth: 1,
      zerolinewidth: 1,
      showgrid: false,
    },
    coloraxis: {
      cmin: logAmpMin,
      cmax: logAmpMax,
      colorscale: [
        [0, "rgba(0, 0, 0, 0)"], // Transparent color for lowest values
        [smallPrecisionFactor * 1.001, interpFunc(0)], // Smallest non-zero value just above the precision factor
        [0.1, interpFunc(0.1)],
        [0.2, interpFunc(0.2)],
        [0.3, interpFunc(0.3)],
        [0.4, interpFunc(0.4)],
        [0.5, interpFunc(0.5)],
        [0.6, interpFunc(0.6)],
        [0.7, interpFunc(0.7)],
        [0.8, interpFunc(0.8)],
        [0.9, interpFunc(0.9)],
        [1, interpFunc(1)],
      ],
      colorbar: {
        ticks: "outside",
        tickmode: "array",
        ticktext: ticktext,
        tickvals: tickvals,
        tickfont: {
          size: 10,
        },
      },
    },
    showlegend: true,
    dragmode: "zoom",
  };

  const plotConfig: Partial<Plotly.Config> = {
    displaylogo: false,
    displayModeBar: true,
    scrollZoom: false,
    modeBarButtonsToRemove: ["pan2d"],
  };

  const applyGlobalStyle = (layout: Partial<Layout>) => {
    // Handle dark mode styling
    // We should probably move all the styling to this central component
    const isDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    if (isDarkMode) {
      layout.xaxis!.title!.font = { color: "rgb(255, 255, 255)" };
      layout.xaxis!.linecolor = "rgb(255, 255, 255)";
      layout.xaxis!.zerolinecolor = "rgb(255, 255, 255)";
      layout.xaxis!.tickcolor = "rgb(255, 255, 255)";
      layout.xaxis!.tickfont = { color: "rgb(255, 255, 255)" };

      layout.yaxis!.title!.font = { color: "rgb(255, 255, 255)" };
      layout.yaxis!.linecolor = "rgb(255, 255, 255)";
      layout.yaxis!.zerolinecolor = "rgb(255, 255, 255)";
      layout.yaxis!.tickcolor = "rgb(255, 255, 255)";
      layout.yaxis!.tickfont = { color: "rgb(255, 255, 255)" };

      if (layout.coloraxis && layout.coloraxis.colorbar) {
        layout.coloraxis!.colorbar!.tickcolor = "rgb(255, 255, 255)";
        layout.coloraxis!.colorbar!.tickfont = { color: "rgb(255, 255, 255)" };
        layout.coloraxis!.colorbar!.outlinecolor = "rgb(255, 255, 255)";
      }

      layout.paper_bgcolor = "rgba(0, 0, 0, 0)"; // Transparent background of area around the plot
      layout.plot_bgcolor = "rgba(0, 0, 0, 0)"; // Transparent background of the plot area
    }
    return layout;
  };

  plotLayout = applyGlobalStyle(plotLayout);

  return (
    <div className="flex flex-col items-center space-y-3">
      <ContextMenuProvider menuId="locked-mode-menu">
        <VSpanProvider
          categories={lockedModeCategories}
          initialData={vspans}
          onModifyVSpan={updateVSpans}
        >
          <ZoneProvider
            categories={zoneCategories}
            initialData={zones}
            onModifyZone={updateZones}
          >
            <TimeSeries
              plotId="LockedMode"
              plotConfig={{
                data: plotData,
                config: plotConfig,
                layout: plotLayout,
              }}
            >
              <Zones onZoneUpdate={updateZones} />
              <VSpans onZoneUpdate={updateVSpans} />
            </TimeSeries>
            <SpectrogramViewTable />
          </ZoneProvider>
        </VSpanProvider>
      </ContextMenuProvider>
    </div>
  );
};
