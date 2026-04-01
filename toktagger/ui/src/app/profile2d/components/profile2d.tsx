"use client";

import { Profile2DData, Profile2DViewParams } from "@/types";
import {
  applyGlobalStyle,
  arrayMax,
  arrayMin,
  sumOverFirstAxis,
} from "@/app/utils";
import { PlotlyWidget } from "@/app/components/plots/plotly";
import { Zones } from "@/app/components/tools/zones";
import { VSpans } from "@/app/components/tools/vspans";
import * as d3 from "d3";
import { AnnotationsTable } from "@/app/components/ui/annotationsTable";
import { useBoundingBoxContext } from "@/app/components/providers/bounding-box-provider";
import { usePolygonContext } from "@/app/components/providers/polygon-provider";
import { useSample } from "@/app/contexts/SampleContext";
import { useEffect, useState } from "react";
import { Flex } from "@adobe/react-spectrum";
import { Plotly } from "plotly.js-dist-min";

const createLinearScalePlot = (
  data,
  plotProps,
  interpFunc,
): Partial<Plotly.PlotData> => {
  const numDigits = plotProps.numSignificantDigits || 4;
  const smallPrecisionFactor = Math.pow(10, -1 * numDigits);
  const ampMin = Math.max(smallPrecisionFactor, arrayMin(data.values.flat()));
  const ampMax = Math.max(smallPrecisionFactor, arrayMax(data.values.flat()));
  const colorAxis = {
    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
    cmin: ampMin,
    cmax: ampMax,
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
      tickfont: {
        size: 10,
      },
    },
  };
  return { values: data.values, colorAxis };
};

const createLogScalePlot = (
  data,
  plotProps,
  interpFunc,
): Partial<Plotly.PlotData> => {
  const numDigits = plotProps.numSignificantDigits || 4;
  const smallPrecisionFactor = Math.pow(10, -1 * numDigits);
  const ampMin = Math.max(smallPrecisionFactor, arrayMin(data.values.flat()));
  const ampMax = Math.max(smallPrecisionFactor, arrayMax(data.values.flat()));

  const logAmplitude_og = data.values.map((row: Array<number>) =>
    row.map((x) =>
      x !== null ? Math.log10(Math.max(x, smallPrecisionFactor)) : null,
    ),
  );

  const logAmpMin = arrayMin(logAmplitude_og.flat());
  const logAmpMax = arrayMax(logAmplitude_og.flat());

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

  const colorAxis = {
    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
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
  };
  return { values: logAmplitude_og, colorAxis };
};

export const Profile2dView = () => {
  const { data, annotations, plotProps, viewParams: viewParams_ } = useSample();
  const { polygons } = usePolygonContext();
  const { boundingBoxes } = useBoundingBoxContext();
  const [shapes, setShapes] = useState<Partial<Plotly.Shape>[]>([]);
  const [logScale, setLogScale] = useState<boolean>(false);

  const viewData: Profile2DData | null = data as Profile2DData | null;
  const viewParams: Profile2DViewParams | null =
    viewParams_ as Profile2DViewParams | null;

  useEffect(() => {
    if (viewParams) {
      setLogScale(viewParams.log_scale);
    }
  }, [viewParams]);

  useEffect(() => {
    if (!annotations || !viewData) return;

    const paths = polygons.map((polygon) => {
      let path = `M ${polygon.x[0]},${polygon.y[0]}`;
      for (let i = 1; i < polygon.x.length; i++) {
        path += ` L ${polygon.x[i]},${polygon.y[i]}`;
      }
      path += " Z"; // close path
      return path;
    });

    const newShapes = paths.map((path) => ({
      type: "path",
      path: path,
      xref: "x",
      yref: "y2",
      line: { color: "rgba(150, 150, 150, 1.0)", width: 5 },
      fillcolor: "rgba(150, 150, 150, 0.5)",
      editable: true,
      layer: "above",
    }));

    polygons.forEach((polygon, index) => {
      newShapes[index].meta = { label: polygon.category.name };
      newShapes[index].fillcolor = polygon.category.color
        .replace("rgb(", "rgba(")
        .replace(")", ", 0.5)");
    });

    boundingBoxes.forEach((bbox) => {
      newShapes.push({
        type: "rect",
        meta: { label: bbox.category.name },
        xref: "x",
        yref: "y2",
        x0: bbox.x_min,
        y0: bbox.y_min,
        x1: bbox.x_min + bbox.width,
        y1: bbox.y_min + bbox.height,
        line: { color: "rgb(150, 150, 150)", width: 5 },
        fillcolor: bbox.category.color
          .replace("rgb(", "rgba(")
          .replace(")", ", 0.5)"),
        editable: true,
        layer: "above",
      });
    });

    setShapes(newShapes);
  }, [annotations, viewData, polygons, boundingBoxes]);

  if (!viewData || !plotProps || !viewParams) {
    return null;
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

  const createPlotFunc = logScale ? createLogScalePlot : createLinearScalePlot;

  const { values, colorAxis } = createPlotFunc(viewData, plotProps, interpFunc);

  const heatmapData: Partial<Plotly.PlotData> = {
    type: "heatmap",
    x: viewData.time,
    y: viewData.dim_1,
    z: values,
    // customdata: viewData.values,
    hovertemplate:
      "time: %{x:.2f}s<br>dim_1: %{y:.2f}Hz<br>values: %{customdata:.2e}<extra></extra>",
    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
    coloraxis: "coloraxis",
    opacity: plotProps.thresholdActive ? 0.4 : 1,
    yaxis: "y2",
  };

  const timeIntegratedData = sumOverFirstAxis(values);

  const timeIntegratedPlot: Partial<Plotly.PlotData> = {
    mode: "lines",
    x: viewData.time,
    y: timeIntegratedData,
  };

  const plotData: Partial<Plotly.PlotData>[] = [
    timeIntegratedPlot,
    heatmapData,
  ];

  let plotLayout: Partial<Plotly.Layout> = {
    shapes: shapes,
    newshape: {
      fillcolor: "rgba(150, 150, 150, 0.5)", // fill color
      line: {
        color: "rgba(150, 150, 150, 1)", // line color
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
        text: "",
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
        text: "Integrated<br>Values",
      },
      domain: [0, 0.2],
      linewidth: 1,
      zerolinewidth: 1,
      showgrid: false,
      anchor: "x",
    },

    // @ts-expect-error Plotly.React types do not define shared color axis, but Plotly supports it.
    coloraxis: colorAxis,
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
      <Flex direction="column" gap="size-200">
        <PlotlyWidget
          plotId="Profile2DView"
          plotConfig={{
            data: plotData,
            config: plotConfig,
            layout: plotLayout,
          }}
          rescaleOnZoom={false}
        >
          <Zones />
          <VSpans />
        </PlotlyWidget>
        <AnnotationsTable />
      </Flex>
    </Flex>
  );
};
