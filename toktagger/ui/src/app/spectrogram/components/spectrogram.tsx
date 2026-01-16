"use client";

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
  Polygon,
  PolygonSchema,
  SpectrogramMask,
} from "@/types";
import { applyGlobalStyle } from "@/app/utils";
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
import { useSample } from "@/app/contexts/SampleContext";
import { useEffect, useState } from "react";
import { Flex } from "@adobe/react-spectrum";

const vspanCategories: Category[] = [
  { name: "Mode Locked", color: "rgb(255, 0, 0)" },
];

const zoneCategories: Category[] = [
  { name: "NTM", color: "rgb(0, 255, 255)" },
  { name: "LLM", color: "rgb(200, 100, 100)" },
  { name: "Sawteeth", color: "rgb(100, 200, 100)" },
];

const zoneCategoryColors = zoneCategories.reduce<Record<string, string>>(
  (acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  },
  {}
);

const lockedModeCategoryColors = vspanCategories.reduce<Record<string, string>>(
  (acc, curr) => {
    acc[curr.name] = curr.color;
    return acc;
  },
  {}
);

const colorMapping = { ...lockedModeCategoryColors, ...zoneCategoryColors };

export const SpectrogramView = () => {
  const { data, annotations, setAnnotations, plotProps } = useSample();

  const [zones, setZones] = useState<Zone[]>([]);
  const [vspans, setVSpans] = useState<VSpan[]>([]);
  const [mask, setMask] = useState<SpectrogramMask | null>(null);
  const [shapes, setShapes] = useState<Partial<Plotly.Shape>[]>([]);

  const viewData: SpectrogramData | null = data as SpectrogramData | null;

  useEffect(() => {
    if (!annotations || !viewData) return;

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

    const polygons: Polygon[] = displayAnnotations
      .filter((x: DisplayAnnotation) => PolygonSchema.safeParse(x).success)
      .map((x: DisplayAnnotation) => PolygonSchema.parse(x));

    const paths = polygons.map((polygon) => {
      let path = `M ${polygon.x[0]},${polygon.y[0]}`;
      for (let i = 1; i < polygon.x.length; i++) {
        path += ` L ${polygon.x[i]},${polygon.y[i]}`;
      }
      path += " Z"; // close path
      return path;
    });

    const shapes = paths.map((path) => ({
      type: "path",
      path: path,
      xref: "x",
      yref: "y2",
      line: { color: "rgba(255, 0, 0, 0.9)", width: 5 },
      fillcolor: "rgba(255, 0, 0, 0.1)",
      editable: true,
      layer: "above",
    }));

    // Extract mask from annotations
    const maskAnnotations = annotations.filter(
      (x: Annotation) => SpectrogramMaskSchema.safeParse(x).success
    );
    const newMask =
      maskAnnotations.length > 0
        ? SpectrogramMaskSchema.parse(maskAnnotations[0])
        : null;

    setZones(zones);
    setVSpans(vspans);
    setMask(newMask);
    setShapes(shapes);
  }, [annotations, viewData]);

  const updateVSpans = (newVSpans: Array<VSpan>) => {
    updateAnnotations(setAnnotations, newVSpans, TimePointSchema);
  };

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  if (!viewData) {
    return null;
  }

  const numDigits = plotProps.numSignificantDigits || 4;
  const smallPrecisionFactor = Math.pow(10, -1 * numDigits);

  const amplitude_og = viewData.amplitude;
  let amplitude: Array<Array<number>> = [];

  if (plotProps.thresholdActive) {
    amplitude = viewData.amplitude.map((row: Array<number>, rowIndex: number) =>
      row.map((value: number, colIndex: number) => {
        let maskValue = mask?.values[rowIndex]?.[colIndex];
        if (maskValue === undefined || maskValue === null) {
          maskValue = 1; // Default to 1 if mask value is undefined
        }
        return value * maskValue;
      })
    );
  } else {
    amplitude = viewData.amplitude;
  }

  const ampMin = Math.max(smallPrecisionFactor, Math.min(...amplitude.flat()));
  const ampMax = Math.max(...amplitude.flat());

  const logAmplitude_og = amplitude_og.map((row: Array<number>) =>
    row.map((x) => Math.log10(Math.max(x, smallPrecisionFactor)))
  );
  const logAmpMin = Math.min(...logAmplitude_og.flat());
  const logAmpMax = Math.max(...logAmplitude_og.flat());

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

  const fftData: Partial<Plotly.PlotData> = {
    type: "heatmap",
    x: data.time,
    y: data.frequency,
    z: logAmplitude_og,
    customdata: data.amplitude,
    hovertemplate:
      "time: %{x:.2f}s<br>freq: %{y:.2f}Hz<br>amp: %{customdata:.2e}<extra></extra>",
    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
    coloraxis: "coloraxis",
    opacity: plotProps.thresholdActive ? 0.4 : 1,
    yaxis: "y2",
  };

  function sumOverFirstAxis(arr: number[][]): number[] {
    if (arr.length === 0) return [];

    const numCols = arr[0].length;
    const sums = new Array(numCols).fill(0);

    for (let row of arr) {
      for (let j = 0; j < numCols; j++) {
        sums[j] += row[j];
      }
    }

    return sums;
  }
  const timeIntegratedData = sumOverFirstAxis(amplitude_og);

  const timeIntegratedPlot: Partial<Plotly.PlotData> = {
    mode: "lines",
    x: data.time,
    y: timeIntegratedData,
  };

  const plotData: Partial<Plotly.PlotData>[] = [timeIntegratedPlot, fftData];

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
    shapes: shapes,
    newshape: {
      fillcolor: "rgba(255, 0, 0, 0.3)", // fill color
      line: {
        color: "red", // line color
        width: 5,
      },
    },
    width: window.innerWidth * 0.84,
    height: window.innerHeight * 0.9,
    xaxis: {
      title: {
        text: "",
      },
      domain: [0, 1],
      linewidth: 1,
      zerolinewidth: 1,
      showgrid: false,
    },

    yaxis2: {
      title: {
        text: "Frequency [kHz]",
      },
      linewidth: 1,
      zerolinewidth: 1,
      showgrid: false,
      domain: [0.2, 1],
      fixedrange: true,
      anchor: "x",
    },

    yaxis: {
      title: {
        text: "Integrated<br>Amplitude",
      },
      domain: [0, 0.2],
      linewidth: 1,
      zerolinewidth: 1,
      showgrid: false,
      anchor: "x",
    },

    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
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
    modeBarButtons: [
      [
        "drawrect",
        "drawclosedpath",
        "eraseshape",
        "zoom2d",
        "select2d",
        "pan2d",
        "autoScale2d",
        "resetScale2d",
        "toImage",
      ],
    ],
    dragmode: false,
    displaylogo: false,
    displayModeBar: true,
    scrollZoom: false,
    responsive: true,
  };

  plotLayout = applyGlobalStyle(plotLayout);

  if (!viewData) {
    return null;
  }

  return (
    <Flex justifyContent="center" alignItems="center">
      <ContextMenuProvider menuId="spectrogram-menu">
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
            <TimeSeries
              plotId="SpectrogramView"
              plotConfig={{
                data: plotData,
                config: plotConfig,
                layout: plotLayout,
              }}
              rescaleOnZoom={false}
            >
              <Zones onUpdate={updateZones} />
              <VSpans onUpdate={updateVSpans} />
            </TimeSeries>
          </VSpanProvider>
        </ZoneProvider>
      </ContextMenuProvider>
    </Flex>
  );
};
