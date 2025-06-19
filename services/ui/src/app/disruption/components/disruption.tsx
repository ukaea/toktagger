"use client"

import { Category, VSpan, Zone } from "@/types"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { VSpanProvider } from "@/app/components/providers/vpsan-provider"
import { DisruptionTable } from "./disruption-table"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import { VSpans } from "@/app/components/tools/vspans"

type DisruptionInfo = {
    time: Array<number>,
    values: Record<string, Array<number>>
}

export const Disruption = ({ data, annotations, setAnnotations}: {data: DisruptionInfo}) => {
    const zoneCategories: Category[] = [
            { name: "RampUp", color: 'rgb(233, 170, 98)' },
            { name: "FlatTop", color: 'rgb(120, 167, 85)' },
            { name: "RampDown", color: 'rgb(108, 189, 224)' }
        ]

    const disruptionCategories: Category[] = [
            { name: "Disruption", color: 'rgb(255, 0, 0)' },
        ]

    const zones = annotations.map(item => ({x0: item.time_min, x1: item.time_max, category: zoneCategories[0]}));

    const plotData: Plotly.Data[] = [
        {
            x: data.values['ip'].time,
            y: data.values['ip'].values,
            line: {
                color: "black"
            },
            name: "ip"
        },
        {
            x: data.values['ANE_DENSITY'].time,
            y: data.values['ANE_DENSITY'].values,
            line: {
                color: "black"
            },
            name: "density",
            xaxis: "x2",
            yaxis: "y2",
        }
    ];
    
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

    const updateAnnotations = (newZones) => {

        const zones = newZones.map(item => ({
                time_min: item.x0,
                time_max: item.x1,
                label: item.category.name
        }));

        setAnnotations(zones);
    }

    return (
        <div className="flex flex-col items-center space-y-3">
            <ContextMenuProvider menuId="disruption-menu">
                <VSpanProvider categories={disruptionCategories} initialData={[]}>
                    <ZoneProvider categories={zoneCategories} initialData={zones} onModifyZone={updateAnnotations}>
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