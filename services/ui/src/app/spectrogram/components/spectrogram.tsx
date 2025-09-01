"use client";

import { SpectrogramViewTable } from "./spectrogram-table";
import {
  SpectrogramData,
  Category,
  Annotations,
  Zone,
  TimeRegionSchema,
  TimePointSchema,
  DisplayAnnotation,
  ZoneSchema,
  VSpanSchema,
  VSpan,
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
  linspace,
} from "@/app/utils";

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
  {}
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
  annotations: Annotations;
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations
  ) => void;
};

export const SpectrogramView = ({
  data,
  annotations,
  setAnnotations,
}: SpectrogramViewInfo) => {
  const convertAnnotationToDisplayAnnotation =
    createAnnotationToDisplayAnnotationFunc(colorMapping);

  const displayAnnotations: DisplayAnnotation[] = annotations.map(
    convertAnnotationToDisplayAnnotation
  );

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

  const amplitude = data.amplitude;
  const ampMin = Math.max(1e-4, Math.min(...amplitude.flat()));
  const ampMax = Math.max(...amplitude.flat());

  const logAmplitude = amplitude.map((row: Array<number>) =>
    row.map((x) => Math.log10(Math.max(x, 1e-4)))
  );
  const logAmpMin = Math.min(...logAmplitude.flat());
  const logAmpMax = Math.max(...logAmplitude.flat());

  const tickvals = linspace(ampMin, ampMax, 6).map((x) => Math.log10(x));
  let ticktext = tickvals.map((x: number) => Math.pow(10, x));
  ticktext = ticktext.map((x: number) => Math.round(x * 10000) / 10000);

  const plotData: Partial<Plotly.PlotData>[] = [
    {
      name: "Saddle Coil FFT",
      type: "heatmap",
      x: data.time,
      y: data.frequency,
      z: logAmplitude,
      customdata: data.amplitude,
      hovertemplate:
        "time: %{x:.2f}s<br>freq: %{y:.2f}Hz<br>amp: %{customdata:.2e}<extra></extra>",
      // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
      coloraxis: "coloraxis",
    },
  ];

  const interpFunc = d3.interpolateCividis;

  const plotLayout: Partial<Plotly.Layout> = {
    height: 600,
    xaxis: {
      title: {
        text: "Time [s]",
      },
    },
    yaxis: {
      title: {
        text: "Frequency [Hz]",
      },
    },
    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
    coloraxis: {
      cmin: logAmpMin,
      cmax: logAmpMax,
      colorscale: [
        [0, interpFunc(0)],
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
