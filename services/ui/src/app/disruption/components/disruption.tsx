"use client"

import { Category, VSpan, Zone } from "@/types"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { VSpanProvider } from "@/app/components/providers/vpsan-provider"
import { DisruptionTable } from "./disruption-table"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import { VSpans } from "@/app/components/tools/vspans"
import React, { useEffect } from "react"

type DisruptionInfo = {
    data: {
        time: Array<number>,
        values: Record<string, { time: number[]; values: number[] }>
    },
    annotations: any[],
    setAnnotations: (annotations: any[]) => void
}

export const Disruption = ({ data, annotations, setAnnotations }: DisruptionInfo) => {
    const zoneCategories: Category[] = [
            { name: "RampUp", color: 'rgb(233, 170, 98)' },
            { name: "FlatTop", color: 'rgb(120, 167, 85)' },
            { name: "RampDown", color: 'rgb(108, 189, 224)' }
        ]

    const initialZones: Zone[] = [
        { x0: 0.05, x1: 0.1, category: zoneCategories[0] },
        { x0: 0.15, x1: 0.2, category: zoneCategories[1] },
    ]

    const disruptionCategories: Category[] = [
            { name: "disruption", color: 'rgb(255, 0, 0)' },
        ]

    console.log("Annotations:", annotations);

    const initialDisruption: VSpan[] = [
        { x: annotations.find(a => a.label === "disruption")?.time ?? 0.3, category: disruptionCategories[0] }
    ]

    const plotData: Plotly.Data[] = [
        {
            x: data.values['ip'].time,
            y: data.values['ip'].values,
            line: {
                color: "black"
            },
            name: "ip"
        },
        ];
        if (data.values['ANE_DENSITY']) {
        plotData.push({
            x: data.values['ANE_DENSITY'].time,
            y: data.values['ANE_DENSITY'].values,
            line: {
                color: "black"
            },
            name: "density",
            xaxis: "x2",
            yaxis: "y2",
        });
    }
    
    const plotLayout: Partial<Plotly.Layout> = {
        uirevision: 'true',
        grid: {rows: 2, columns: 1, pattern: 'independent'},
        xaxis: {
            title: {
                text: 'Time [s]'
            },
        },
        yaxis: {
            title: {
                text: 'Plasma current, ip [A]'
            },
        },
        xaxis2: {
            matches: 'x',
            title: {
                text: 'Time [s]'
            },
        },
        yaxis2: {
            title: {
                text: 'Plasma current, ip [A]'
            },
        },
        showlegend: true,
        dragmode: 'pan',
    };

    const updateAnnotations = (newSpans) => {
        const spans = newSpans.map(item => ({
                time: item.x,
                label: item.category.name,
                validated: true
        }));

        setAnnotations(spans);
    }

    useEffect(() => {
        updateAnnotations(initialDisruption);
    }, [initialDisruption]);

    return (
        <div className="flex flex-col items-center space-y-3">
            <ContextMenuProvider menuId="disruption-menu">
                <VSpanProvider categories={disruptionCategories} initialData={initialDisruption} onModifyVspan={updateAnnotations}>
                    <ZoneProvider categories={zoneCategories} initialData={initialZones}>
                        <TimeSeries plotId="Disruption" plotConfig={{data: plotData, layout: plotLayout}}>
                            <Zones />
                            <VSpans />
                        </TimeSeries>
                        <DisruptionTable />
                    </ZoneProvider>
                </VSpanProvider>
            </ContextMenuProvider>
        </div>
    )
}