"use client";
import {
  MultiVariateTimeSeriesData,
  Zone,
  Category,
  DisplayAnnotation,
  ZoneSchema,
  TimeRegionSchema,
  Annotations,
} from "@/types";
import { Plotly } from "react-plotly.js";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider";
import { TimeSeries } from "@/app/components/plots/time-series";
import { Zones } from "@/app/components/tools/zones";
import "react-contexify/ReactContexify.css";

import {
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";

const zoneCategories: Category[] = [
  { name: "ELM", color: "rgb(233, 170, 98)" },
  { name: "H-Mode", color: "rgb(100, 170, 98)" },
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
  annotations: Annotations;
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations
  ) => void;
};

export const ELMView = ({ data, annotations, setAnnotations }: ELMViewInfo) => {
  const convertAnnotationToDisplayAnnotation =
    createAnnotationToDisplayAnnotationFunc(zoneCategoryColors);
  const displayAnnotations: DisplayAnnotation[] = annotations.map(
    convertAnnotationToDisplayAnnotation
  );
  const zones: Zone[] = displayAnnotations
    .filter((x: DisplayAnnotation) => ZoneSchema.safeParse(x).success)
    .map((x: DisplayAnnotation) => ZoneSchema.parse(x));

  const updateZones = (newZones: Array<Zone>) => {
    updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
  };

  const dataTrace: Partial<Plotly.PlotData> = {
    name: "Dalpha",
    x: data.values.dalpha.time,
    y: data.values.dalpha.values,
    mode: "lines",
  };

  const ipTrace: Partial<Plotly.PlotData> = {
    name: "Ip",
    x: data.values.ip.time,
    y: data.values.ip.values,
    xaxis: "x2",
    yaxis: "y2",
    mode: "lines",
  };

  const powerNBITrace: Partial<Plotly.PlotData> = {
    name: "NBI Power",
    x: data.values.power_nbi.time,
    y: data.values.power_nbi.values,
    xaxis: "x3",
    yaxis: "y3",
    mode: "lines",
  };

  const densityGradientTrace: Partial<Plotly.PlotData> = {
    name: "Density Gradient",
    x: data.values.density_gradient.time,
    y: data.values.density_gradient.values,
    xaxis: "x4",
    yaxis: "y4",
    mode: "lines",
  };

  const t_e_coreTrace: Partial<Plotly.PlotData> = {
    name: "Te Core",
    x: data.values.t_e_core.time,
    y: data.values.t_e_core.values,
    xaxis: "x5",
    yaxis: "y5",
    mode: "lines",
  };

  const plotData: Partial<Plotly.PlotData>[] = [
    dataTrace,
    ipTrace,
    densityGradientTrace,
    powerNBITrace,
    t_e_coreTrace,
  ];

  const plotLayout: Partial<Plotly.Layout> = {
    uirevision: "true",
    grid: { rows: 5, columns: 1, pattern: "independent" },
    dragmode: false, // Disable default drag behavior
    width: 1100,
    height: 800,
    xaxis: {
      title: {
        text: "Time [s]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    yaxis: {
      title: {
        text: "Dalpha [V]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    xaxis2: {
      matches: "x",
      title: {
        text: "Time [s]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    yaxis2: {
      title: {
        text: "Ip [kA]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    xaxis3: {
      matches: "x",
      title: {
        text: "Time [s]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    yaxis3: {
      title: {
        text: "NBI Power [W]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    xaxis4: {
      matches: "x",
      title: {
        text: "Time [s]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    yaxis4: {
      title: {
        text: "Density Gradient []",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    xaxis5: {
      matches: "x",
      title: {
        text: "Time [s]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
    yaxis5: {
      title: {
        text: "T_e Core [eV]",
        font: {
          family: "Courier New, monospace",
          size: 12,
          color: "#7f7f7f",
        },
      },
    },
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
