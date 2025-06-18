"use client"

import { LockedModeTable } from "./locked-mode-table"
import { SpectrogramData, Category, VSpan, Zone } from "@/types"
import { VSpanProvider } from "@/app/components/providers/vpsan-provider"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import { VSpans } from "@/app/components/tools/vspans"

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

export const LockedMode = ({ data }) => {

    const lockedModeCategories: Category[] = [
        { name: "Locked Mode", color: "rgb(255, 0, 0)" },
    ]
    const initialLockedMode: VSpan[] = []

    const zoneCategories: Category[] = [
        { name: "NTM", color: 'rgb(0, 0, 255)' },
        { name: "LLM", color: 'rgb(211, 0, 255)' },
    ]
    const initialZones: Zone[] = []

    const originalAmpMin = Math.min(...data.amplitude.flat());
    const originalAmpMax = Math.max(...data.amplitude.flat());

    const logAmplitude = data.amplitude.map(row => row.map(x => Math.log10(Math.max(x, 1e-4))));
    const logAmpMin = Math.min(...logAmplitude.flat());
    const logAmpMax = Math.max(...logAmplitude.flat());

    const tickvals = linspace(logAmpMin, logAmpMax, 10)
    let ticktext = tickvals.map(x => Math.pow(10, x));
    ticktext = ticktext.map(x => Math.round(x * 10000) / 10000);

    const plotData: Plotly.Data[] = [{
        name: "Saddle Coil FFT",
        type: 'heatmap',
        x: data.time,
        y: data.frequency,
        z: logAmplitude,
        customdata: data.amplitude,
        hovertemplate: "time: %{x:.2f}s<br>freq: %{y:.2f}Hz<br>amp: %{customdata:.2e}<extra></extra>",
        coloraxis: 'coloraxis'
    }];

    const interpFunc = d3.interpolateTurbo;

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
                [1, interpFunc(1)]
            ],
            colorbar: {
                tickmode: 'array',
                ticktext: ticktext,
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
        modeBarButtonsToRemove: ['pan'],
    }

    return (
        <div className="flex flex-col items-center space-y-3">
            <ContextMenuProvider menuId="locked-mode-menu">
                <VSpanProvider categories={lockedModeCategories} initialData={initialLockedMode}>
                    <ZoneProvider categories={zoneCategories} initialData={initialZones}>
                        <TimeSeries plotId="LockedMode" plotConfig={{ data: plotData, config: plotConfig, layout: plotLayout }} >
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