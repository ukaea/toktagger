"use client";

import { TimeSeries } from "@/app/components/plots/time-series";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { VSpanProvider } from "@/app/components/providers/vpsan-provider";
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { VSpans } from "@/app/components/tools/vspans";
import { Zones } from "@/app/components/tools/zones";
import { Category, VSpan, Zone } from "@/types";
import { useRef } from "react";

type DisruptionInfo = {
  data: Array<{
    time: number;
    value: number;
  }>;
};

export const TimeSeriesDemo = ({ data }: DisruptionInfo) => {
  const zoneCategories: Category[] = [
    { name: "RampUp", color: "rgb(233, 170, 98)" },
    { name: "FlatTop", color: "rgb(120, 167, 85)" },
    { name: "RampDown", color: "rgb(108, 189, 224)" },
  ];

  const initialZones: Zone[] = [
    { x0: 0.05, x1: 0.1, category: zoneCategories[0] },
    { x0: 0.15, x1: 0.2, category: zoneCategories[1] },
  ];

  const disruptionCategories: Category[] = [
    { name: "Disruption", color: "rgb(255, 0, 0)" },
  ];

  const initialDisruption: VSpan[] = [
    { x: 0.3, category: disruptionCategories[0] },
  ];

  const time = useRef(data.map(({ time }) => time));
  const value = useRef(data.map(({ value }) => value));

  const plotData: Partial<Plotly.PlotData>[] = [
    {
      x: time.current,
      y: value.current,
      line: {
        color: "black",
      },
      name: "ip",
    },
    {
      x: time.current,
      y: value.current,
      line: {
        color: "red",
      },
      name: "ip",
      xaxis: "x",
      yaxis: "y2",
    },
  ];

  const plotLayout: Partial<Plotly.Layout> = {
    height: 600,
    grid: {
      rows: 2,
      columns: 1,
      subplots: ["xy", "xy2"],
    },
    xaxis: {
      title: {
        text: "Time [s]",
      },
    },
    yaxis: {
      title: {
        text: "Plasma current, ip [A]",
      },
      domain: [0.5, 1],
    },
    yaxis2: {
      title: {
        text: "Plasma current, ip [A]",
      },
      domain: [0, 0.3],
    },
    showlegend: true,
    dragmode: "pan",
  };

  return (
    <div className="flex flex-col items-center space-y-3">
      <header className="p-6">
        <h1 className="text-4xl font-bold text-center text-gray-900">
          Standard Time Series Demo
        </h1>
      </header>
      <ContextMenuProvider menuId="time-series-menu">
        <VSpanProvider
          categories={disruptionCategories}
          initialData={initialDisruption}
        >
          <ZoneProvider categories={zoneCategories} initialData={initialZones}>
            <TimeSeries
              plotId="time-series"
              plotConfig={{
                data: plotData,
                layout: plotLayout,
              }}
            >
              <Zones />
              <VSpans />
            </TimeSeries>
          </ZoneProvider>
        </VSpanProvider>
      </ContextMenuProvider>
    </div>
  );
};
