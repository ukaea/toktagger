"use client"
import {
    PlotlyHTMLElement,
    PlotData,
    Layout,
    Config,
    react
} from "plotly.js"
import {
    useEffect,
    useState
} from "react"
import {TimeSeriesAnnotationType, useTimeSeriesActions} from "@/app/contexts/TimeSeriesContext"

const DEFAULT_PLOTLY_CONFIG: Partial<Config> = {
    modeBarButtons: [
        [
            "toImage",
            "zoom2d",
            "select2d",
            "pan2d",
            "autoScale2d",
            "resetScale2d"
        ],
    ],
    displaylogo: false,
    displayModeBar: true,
    scrollZoom: true,
}

interface PlotConfiguration {
  data: Partial<PlotData>[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
}

type TimeSeriesPlotProps = {
    plotId?: string;
    plotConfig: PlotConfiguration;
}

export const BaseTimeSeriesPlot = ({
    plotId: externalId,
    plotConfig: {
        data,
        layout,
        config = DEFAULT_PLOTLY_CONFIG
    }
}: TimeSeriesPlotProps) => {
    const [plotReady, setPlotReady] = useState(false);

    const {createAnnotation, addAnnotation} = useTimeSeriesActions();

    const plotId = externalId || "time-series";
    
    useEffect(() => {
        console.log(`Initialising plot - ${plotId}`)
        const plot = document.getElementById(plotId) as PlotlyHTMLElement;
        if (!plot) {
            console.warn("Base plot element could not be located, skipping plot render")
            return
        }

        const overplots: string[] = [] // store IDs of overplots to allow D3 to draw on subplots

        const generateOverplots = (plot: PlotlyHTMLElement) => {
            // Get all subplot elements and extract the subplot name (xy for example) from the class list
            const subplots = plot.querySelectorAll(".subplot");
            const subplotNames = [...subplots].map((el) =>
                [...el.classList].find((cls) => cls !== "subplot"),
            );

            // For each subplot identified generate a D3 overplot with the subplot name appended so that tooling can reference it
            subplotNames.forEach((coordinateSystem) => {
                // Find subplot if it exists
                const subplot = plot
                    .querySelector(`.subplot.${coordinateSystem}`)
                    ?.querySelector(".overplot")
                    ?.querySelector(`.${coordinateSystem}`) as HTMLElement;
                if (!subplot) {
                    console.error("Cannot locate plotly subplot");
                    return;
                }

                // ensure only one custom overlay group is present
                if (!subplot.querySelector(`.${plotId}-overplot-${coordinateSystem}`)) {
                    const svg = document.createElementNS(
                        "http://www.w3.org/2000/svg",
                        "g",
                    );
                    svg.setAttribute("class", `${plotId}-overplot-${coordinateSystem}`);
                    svg.setAttribute("fill", "none");
                    subplot.appendChild(svg);
                    overplots.push(`${plotId}-overplot-${coordinateSystem}`); // Store overplots for removal
                }
            });

            // Use setTimeout to ensure DOM has fully updated before signaling ready
            setPlotReady(true);
        };

        const initGraph = async () => {
            react(plot, data, layout, config).then(generateOverplots);
        }
        initGraph()
    }, [config, data, layout, plotId])

    useEffect(() => {
        if (!plotReady) {
            // Plot may not have loaded yet - this will rerun after loading
            return;
        }
        const plot = document.getElementById(plotId);
        if (!plot) {
            console.error("Could not locate plot to assign click handler");
            return;
        }

        console.log("Assigning click handlers to plots")
        const draggableElements = plot.querySelectorAll<HTMLDivElement>(".drag");
        if (draggableElements.length === 0) {
            console.error("Could not locate drag element to assign click handler");
            return;
        }

        const startToolCreation = (_event: MouseEvent) => {
            const annotation = createAnnotation(TimeSeriesAnnotationType.VSPAN);
            addAnnotation(annotation);
        }

        draggableElements.forEach((element) => {
            element.addEventListener("mousedown", startToolCreation);
        })

        return (() => {
            console.log("Cleaning up click handler from plots")
            draggableElements.forEach((element) => {
                element.removeEventListener("mousedown", startToolCreation);
            })
        })
    }, [addAnnotation, createAnnotation, plotId, plotReady])

    return (
        <div className="w-full px-6 py-3 space-y-3 flex-col">
            {/* Div where plot is inserted */}
            <div id={plotId} className="" />
        </div>
    )
}