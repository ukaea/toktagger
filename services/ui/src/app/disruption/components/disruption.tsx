"use client"

import { Category, TimeRegionSchema, TimePointSchema, MultiVariateTimeSeriesData, Annotations, BaseAnnotation, VSpan, Zone, TimePoint, TimeRegion} from "@/types"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { VSpanProvider } from "@/app/components/providers/vpsan-provider"
import { DisruptionTable } from "./disruption-table"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import { VSpans } from "@/app/components/tools/vspans"

type DisruptionViewInfo = {
  data: MultiVariateTimeSeriesData,
  annotations: Annotations,
  setAnnotations: (annotations: Annotations) => void
};

export const DisruptionView = ({data, annotations, setAnnotations} : DisruptionViewInfo) => {
    const disruptionCategories: Category[] = [
            { label: "Disruption", color: 'rgb(255, 0, 0)' },
        ]

    const convertTimePointToVSpan = (item: TimePoint) => {
        const category = disruptionCategories.find((x: Category) => x.label === item.label);
        return {x: item.time, category: category};
    };
    const spans = annotations.filter((x: BaseAnnotation) => TimePointSchema.safeParse(x).success).map(convertTimePointToVSpan);

    const zoneCategories: Category[] = [
            { label: "RampUp", color: 'rgb(233, 170, 98)' },
            { label: "FlatTop", color: 'rgb(120, 167, 85)' },
            { label: "RampDown", color: 'rgb(108, 189, 224)' }
        ]

    const convertTimeRegionToZone = (item: TimeRegion) => {
        const category = zoneCategories.find((x: Category) => x.label === item.label);
        return {x0: item.time_min, x1: item.time_max, category: category};
    };
    const zones = annotations.filter((x: BaseAnnotation) => TimeRegionSchema.safeParse(x).success).map(convertTimeRegionToZone);

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

    const updateZones = (newZones: Array<Zone>) => {
        let zones = newZones.map(item => (
            TimeRegionSchema.parse({
                time_min: item.x0,
                time_max: item.x1,
                label: item.category.label
            })
        ));


        const otherAnnotations: BaseAnnotation = annotations.filter((x: BaseAnnotation) => !TimeRegionSchema.safeParse(x).success);
        zones = zones.concat(otherAnnotations);
        setAnnotations(zones);
    };

    const updateVSpans = (newVSpans: Array<VSpan>) =>  {
        let spans = newVSpans.map(item => (
            TimePointSchema.parse({
                time: item.x,
                label: item.category.label
            })
        ));


        const otherAnnotations: Annotations = annotations.filter((x: BaseAnnotation) => !TimePointSchema.safeParse(x).success);
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