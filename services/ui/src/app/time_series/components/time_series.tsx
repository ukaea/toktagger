'use client'
import { Annotations, MultiVariateTimeSeriesData, TimeRegion, Zone, Category, Annotation, TimeSeriesData } from "@/types"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import 'react-contexify/ReactContexify.css';
import Plotly from "plotly.js-dist";

type MultiVariateTimeSeriesViewInfo = {
    data: MultiVariateTimeSeriesData, 
    annotations: Annotations, 
    setAnnotations: (annotations: Annotations) => void
};
export const MultiVariateTimeSeriesView = ({data, annotations, setAnnotations}: MultiVariateTimeSeriesViewInfo) => {

    let plotData: Plotly.Data[] = Object.entries(data.values).map(([key, value]: [string, TimeSeriesData]) => {
        return {
            name: key,
            x: value.time,
            y: value.values,
            mode: 'lines',
        }
    });

    const numRows = plotData.length;
    const domainHeight = 1 / numRows;

    const yAxesNames = Array.from({ length: numRows }, (_, i) => `y${i === 0 ? '' : i + 1}`).reverse();

    // Dynamically generate y-axis titles based on plotData names
    plotData = plotData.map((trace, index) => ({
        ...trace,
        yaxis: yAxesNames[index],
    }));


    // Dynamically generate y-axis domains based on numRows
    const yAxisDomains = Array.from({ length: numRows }, (_, i) => {
        const start = i * domainHeight;
        const end = (i + 1) * domainHeight;
        return [start, end];
    });


    // Build yaxis layout object dynamically
    const yAxesLayout = yAxisDomains.reduce((acc, domain, idx) => {
        const axisNum = idx === 0 ? '' : idx + 1; // yaxis, yaxis2, yaxis3, ...
        acc[`yaxis${axisNum}`] = { domain };
        return acc;
    }, {} as Record<string, any>);


    const maxTime = plotData.reduce((max, trace) => Math.max(max, Math.max(...trace.x)), -Infinity);
    const minTime = plotData.reduce((min, trace) => Math.min(min, Math.min(...trace.x)), Infinity);

    var plotLayout = {
        uirevision: 'true',
        grid: { rows: 1, columns: 1, pattern: 'independent' },
        dragmode: 'pan',
        width: window.innerWidth * 0.84,
        height: window.innerHeight * 0.9,
        xaxis: {
            minallowed: minTime,
            maxallowed: maxTime,
            range: [minTime, maxTime],
            fixedrange: false,
            autorange: false,
            rangeslider: { visible: true },
            title: {
                text: 'Time [s]',
                font: {
                    family: 'Courier New, monospace',
                    size: 12,
                    color: '#7f7f7f'
                }
            },
        },
        ...yAxesLayout,
    };

    
    const zoneCategories: Category[] = [
        { name: "Peak", color: 'rgb(233, 170, 98)' },
        { name: "Outlier", color: 'rgb(233, 170, 250)' },
        { name: "Jump", color: 'rgb(1, 250, 1)' },
        { name: "Change Point", color: 'rgb(133, 170, 250)' },
    ]

    const convertRegionToZone = (item: TimeRegion) => {
        const category = zoneCategories.find(x => x.name === item.label);
        return {x0: item.time_min, x1: item.time_max, category: category, created_by: item.created_by} as Zone;
    };
    annotations = annotations.filter(item => item.type === 'time_region') as TimeRegion[];
    const zones = annotations.map(convertRegionToZone);

    const updateAnnotations = (newZones: Array<Zone>) => {
        const zones = newZones.map(item => ({
                type: 'time_region',
                created_by: item.created_by,
                time_min: item.x0,
                time_max: item.x1,
                label: item.category.name
        }));

        setAnnotations(zones);
    }

    return (
        <div className="flex space-y-3">
            <div className="flex-1 text-center items-center">
                <ContextMenuProvider menuId="elm-menu">
                    <ZoneProvider categories={zoneCategories} initialData={zones} onModifyZone={updateAnnotations}>
                        <TimeSeries plotId="TimeSeriesPlot" plotConfig={{data: plotData, layout: plotLayout}}>
                            <Zones />
                        </TimeSeries>
                    </ZoneProvider>
                </ContextMenuProvider>
            </div>
        </div>
    )
}