"use client"

import { LockedModeTable } from "./locked-mode-table"
import { SpectrogramData, Category, VSpan, Zone } from "@/types"
import { VSpanProvider } from "@/app/components/providers/vpsan-provider"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import { VSpans } from "@/app/components/tools/vspans"

import { useState } from "react"

import * as d3 from "d3"

const linspace = (start: number, end: number, num: number) => {
    const step = (end - start) / (num - 1)
    const arr = []
    for (let i = 0; i < num; i++) {
        arr.push(start + step * i)
    }
    return arr
}

type LockedModeInfo = {
    data: SpectrogramData
}

export const LockedMode = ({ data }: LockedModeInfo) => {

    const lockedModeCategories: Category[] = [
        { name: "Locked Mode", color: "rgb(255, 0, 0)" },
    ]
    const initialLockedMode: VSpan[] = [
        { x: 0.1, category: lockedModeCategories[0] },
    ]

    const zoneCategories: Category[] = [
        { name: "ZoneA", color: 'rgb(255, 0, 0)' },
    ]
    const initialZones: Zone[] = [
        { x0: 0.4, x1: 0.5, category: zoneCategories[0] },
    ]

    const [range, setRange] = useState<number[]>([1E-4, 1E-3]);

    const ampl = data.map(({ amplitude }) => amplitude);
    const logvals = linspace(range[0], range[1], 10)
    const logvalsMapped = logvals.map((x) => (9 / (Math.max(...logvals) - Math.min(...logvals))) * (x - Math.min(...logvals)) + 1.0)
    const tickvals = logvalsMapped.map((x) => Math.log10(x))
    let zdata: number[] = []
    ampl.forEach((val) => {
        const index = logvals.findIndex(i => i >= val)
        const ratio = (val - logvals[index - 1]) / (logvals[index] - logvals[index - 1])
        const valScaled = (tickvals[index] - tickvals[index - 1]) * ratio + tickvals[index - 1]
        if (index === -1) {
            zdata.push(1.0)
        } else {
            zdata.push(valScaled)
        }
    })

    const plotData: Plotly.Data[] = [{
        name: "Saddle Coil FFT",
        type: 'heatmap',
        x: data.map(({ time }) => time),
        y: data.map(({ frequency }) => frequency),
        z: zdata,
        customdata: ampl,
        hovertemplate: "t: %{x:.2f}s<br>f: %{y:.2f}Hz<br>s: %{customdata:.2e}<extra></extra>",
        coloraxis: 'coloraxis'
    }];

    const plotLayout: Partial<Plotly.Layout> = {
        xaxis: {
            title: {
                text: 'Time [s]'
            },
        },
        yaxis: {
            title: {
                text: 'Frequency [Hz]'
            },
        },
        coloraxis: {
            cmin: 0,
            cmax: 1,
            colorscale: [
                [0, d3.interpolateCividis(0)],
                [0.1, d3.interpolateCividis(0.1)],
                [0.2, d3.interpolateCividis(0.2)],
                [0.3, d3.interpolateCividis(0.3)],
                [0.4, d3.interpolateCividis(0.4)],
                [0.5, d3.interpolateCividis(0.5)],
                [0.6, d3.interpolateCividis(0.6)],
                [0.7, d3.interpolateCividis(0.7)],
                [0.8, d3.interpolateCividis(0.8)],
                [0.9, d3.interpolateCividis(0.9)],
                [1, d3.interpolateCividis(1)]
            ],
            colorbar: {
                tickmode: 'array',
                ticktext: logvals.map((x) => x.toExponential(1)),
                tickvals: tickvals,
            }
        },
        showlegend: true,
        dragmode: 'zoom',
    };


    const plotConfig: Partial<Plotly.Config> = {
        displaylogo: false,
        displayModeBar: true,
        scrollZoom: false,
        modeBarButtonsToRemove: ['toImage', 'zoom2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d'],
    }

    return (
        <div className="flex flex-col items-center space-y-3">
            <header className="p-6">
                <h1 className="text-4xl font-bold text-center text-gray-900">
                    Locked Mode demo
                </h1>
            </header>
            <ContextMenuProvider menuId="locked-mode-menu">
                <VSpanProvider categories={lockedModeCategories} initialData={initialLockedMode}>
                    <ZoneProvider categories={zoneCategories} initialData={initialZones}>
                        <TimeSeries plotId="LockedMode" plotConfig={{ data: plotData!, layout: plotLayout!, config: plotConfig }} >
                            <Zones />
                            <VSpans />
                        </TimeSeries>
                        <LockedModeTable />
                    </ZoneProvider>
                </VSpanProvider>
            </ContextMenuProvider>
        </div >
    )
}