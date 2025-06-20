"use client"

import { Category, VSpan, Zone, TimeRegion, TimePoint } from "@/types"
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
    const disruptionCategories: Category[] = [
            { name: "Disruption", color: 'rgb(255, 0, 0)' },
        ]

    const convertTimePointToVSpan = (item) => {
        const category = disruptionCategories.find(x => x.name === item.label);
        return {x: item.time, category: category};
    };
    const spans = annotations.filter(x => TimePoint.safeParse(x).success).map(convertTimePointToVSpan);

    const zoneCategories: Category[] = [
            { name: "RampUp", color: 'rgb(233, 170, 98)' },
            { name: "FlatTop", color: 'rgb(120, 167, 85)' },
            { name: "RampDown", color: 'rgb(108, 189, 224)' }
        ]

    const convertTimeRegionToZone = (item) => {
        const category = zoneCategories.find(x => x.name === item.label);
        return {x0: item.time_min, x1: item.time_max, category: category};
    };
    const zones = annotations.filter(x => TimeRegion.safeParse(x).success).map(convertTimeRegionToZone);

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

    const updateZones = (newZones) => {
        let zones = newZones.map(item => ({
                time_min: item.x0,
                time_max: item.x1,
                label: item.category.name
        }));


        const otherAnnotations = annotations.filter(x => !TimeRegion.safeParse(x).success);
        zones = zones.concat(otherAnnotations);
        setAnnotations(zones);
    };

    const updateVSpans = (newVSpans) =>  {
        let spans = newVSpans.map(item => ({
                time: item.x,
                label: item.category.name
        }));


        const otherAnnotations = annotations.filter(x => !TimePoint.safeParse(x).success);
        spans = spans.concat(otherAnnotations);
        setAnnotations(spans);
    };
    
    return (
        <div className="flex flex-col items-center space-y-3">
            <ContextMenuProvider menuId="disruption-menu">
                <VSpanProvider categories={disruptionCategories} initialData={spans} onModifyVSpan={updateVSpans}>
                    <ZoneProvider categories={zoneCategories} initialData={zones} onModifyZone={updateZones}>
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