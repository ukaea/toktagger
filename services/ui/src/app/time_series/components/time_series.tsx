'use client'
import { Annotations, MultiVariateTimeSeriesData, TimeRegion, Zone, Category, Annotation, TimeSeriesData, DisplayAnnotation, ZoneSchema, TimeRegionSchema, VSpanSchema } from "@/types"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import 'react-contexify/ReactContexify.css';
import Plotly from "plotly.js-dist";
import { createAnnotationToDisplayAnnotationFunc, updateAnnotations } from "@/app/utils"

// Generate a random color with a fixed seed
function seededRandom(seed: number) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function randomColor(seed: number = 42) {
    // Generate RGB values based on seed
    const r = Math.floor(seededRandom(seed) * 256);
    const g = Math.floor(seededRandom(seed + 1) * 256);
    const b = Math.floor(seededRandom(seed + 2) * 256);
    return `rgb(${r}, ${g}, ${b})`;
}


type MultiVariateTimeSeriesViewInfo = {
    data: MultiVariateTimeSeriesData, 
    zoneNames: string[],
    annotations: Annotations, 
    setAnnotations: (
        updater: (annotations: Annotations) => Annotations | Annotations
    ) => void;
};
export const MultiVariateTimeSeriesView = ({data, zoneNames, annotations, setAnnotations}: MultiVariateTimeSeriesViewInfo) => {
    const zoneCategories = zoneNames.map((x, index) => ({
        name: x,
        color: randomColor(index + 1)
    }));

    const zoneCategoryColors = zoneCategories.reduce<Record<string, string>>(
    (acc, curr) => {
        acc[curr.name] = curr.color;
        return acc;
    },
    {}
    );

    const convertAnnotationToDisplayAnnotation =
        createAnnotationToDisplayAnnotationFunc(zoneCategoryColors);

    const displayAnnotations: DisplayAnnotation[] = annotations.filter((annotation) => {
        return TimeRegionSchema.safeParse(annotation).success || VSpanSchema.safeParse(annotation).success;
    }).map(
        convertAnnotationToDisplayAnnotation
    );

    const zones: Zone[] = displayAnnotations
        .filter((x: DisplayAnnotation) => ZoneSchema.safeParse(x).success)
        .map((x: DisplayAnnotation) => ZoneSchema.parse(x));

    const updateZones = (newZones: Array<Zone>) => {
        updateAnnotations(setAnnotations, newZones, TimeRegionSchema);
    };


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
        acc[`yaxis${axisNum}`] = { domain, autorange: true, fixedrange: true};
        return acc;
    }, {} as Record<string, any>);


    const maxTime = plotData.reduce((max, trace) => Math.max(max, Math.max(...trace.x)), -Infinity);
    const minTime = plotData.reduce((min, trace) => Math.min(min, Math.min(...trace.x)), Infinity);

    var plotLayout: Partial<Plotly.Layout> = {
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
            rangeslider: { visible: true, thickness: 0.1},
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

    return (
        <div className="flex space-y-3">
            <div className="flex-1 text-center items-center">
                <ContextMenuProvider menuId="elm-menu">
                    <ZoneProvider categories={zoneCategories} initialData={zones} onModifyZone={updateZones}>
                        <TimeSeries plotId="TimeSeriesPlot" plotConfig={{data: plotData, layout: plotLayout}}>
                            <Zones onZoneUpdate={updateZones}/>
                        </TimeSeries>
                    </ZoneProvider>
                </ContextMenuProvider>
            </div>
        </div>
    )
}