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
    useRef,
    useState
} from "react"
import {useTimeSeriesActions, useTimeSeriesState} from "@/app/contexts/TimeSeriesContext"
import { ExtendedPlotlyHTMLElement, TimeSeriesAnnotationPoint } from "@/types"
import React from "react"

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

type InjectedProps = {
  plotId: string;
  plotReady: boolean;
};

type TimeSeriesPlotProps = {
    plotId?: string;
    plotConfig: PlotConfiguration;
    children:
        | React.ReactElement<InjectedProps>
        | React.ReactElement<InjectedProps>[];
}

export const BaseTimeSeriesPlot = ({
    plotId: externalId,
    plotConfig: {
        data,
        layout,
        config = DEFAULT_PLOTLY_CONFIG
    },
    children
}: TimeSeriesPlotProps) => {
    const [plotReady, setPlotReady] = useState(false);

    const {createAnnotation, addAnnotation, triggerUpdate} = useTimeSeriesActions();
    const {activeAnnotationTool, toolingCallbacks} = useTimeSeriesState();

    const isDraggingRef = useRef(false);

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

        const relayoutHandler = () => {
            triggerUpdate();
        };

        const initGraph = async () => {
            react(plot, data, layout, config).then(generateOverplots);

            plot.removeAllListeners("plotly_relayout"); // remove any existing listeners
            plot.on("plotly_relayout", relayoutHandler);
        }
        initGraph();

        return () => {
            // cleanup on unmount / Fast-Refresh
            overplots.forEach((overplot) => {
                plot?.querySelector(`.${overplot}`)?.remove(); // remove custom overlay group
            });
            setPlotReady(false); // reset ready state
        };
    }, [config, data, layout, plotId, triggerUpdate])

    useEffect(() => {
        if (!plotReady) {
            // Plot may not have loaded yet - this will rerun after loading
            return;
        }
        const plot = document.getElementById(plotId) as PlotlyHTMLElement;
        if (!plot) {
            console.error("Could not locate plot to assign click handler");
            return;
        }

        function getClickData(event: MouseEvent, _plot: PlotlyHTMLElement): TimeSeriesAnnotationPoint {
            const plot = _plot as ExtendedPlotlyHTMLElement;
            let xaxis = plot._fullLayout.xaxis; // x-axis descriptor
            let yaxis = plot._fullLayout.yaxis; // y-axis descriptor

            const bb = (event.target as HTMLElement).getBoundingClientRect();
            const relX = event.clientX - bb.left; // click X in pixels, relative to plot
            const relY = event.clientY - bb.top; // click Y in pixels, relative to plot

            const subplotId = (event.target as HTMLElement).dataset.subplot; // e.g. "x2y2"
            if (subplotId) {
                const m = subplotId.match(/^x(\d*)y(\d*)$/); // ['', '2', '2']
                // m[1]/m[2] hold numeric suffixes empty string -> primary axis
                if (m) {
                const suffixX = m[1] ?? ""; // '' -> xaxis
                const suffixY = m[2] ?? ""; // '' -> yaxis
                // Swap to subplot-specific axes if they exist
                xaxis = plot._fullLayout[`xaxis${suffixX}`] ?? plot._fullLayout.xaxis;
                yaxis = plot._fullLayout[`yaxis${suffixY}`] ?? plot._fullLayout.yaxis;
                }
            }
            // final catch-all fallback – runs whether or not we found a subplotId
            xaxis = xaxis ?? plot._fullLayout.xaxis;
            yaxis = yaxis ?? plot._fullLayout.yaxis;

            // Coordinates in data space
            const x = xaxis.p2d(relX); // data-space X at click
            const y = yaxis.p2d(relY); // data-space Y at click

            return {x, y};
        }

        console.log("Assigning click handlers to plots")
        const draggableElements = plot.querySelectorAll<HTMLDivElement>(".nsewdrag");
        if (draggableElements.length === 0) {
            console.error("Could not locate drag element to assign click handler");
            return;
        }

        const startAnnotationCreation = (event: MouseEvent) => {
            if (activeAnnotationTool && event.ctrlKey) {
                console.log(`Triggering start call for ${activeAnnotationTool} tool`)
                isDraggingRef.current = true;
                const clickLocation = getClickData(event, plot);
                toolingCallbacks.get(activeAnnotationTool)?.start(clickLocation.x, clickLocation.y);
            }
        }

        const updateAnnotation = (event: MouseEvent) => {
            if (activeAnnotationTool && isDraggingRef.current) {
                const clickLocation = getClickData(event, plot);
                toolingCallbacks.get(activeAnnotationTool)?.move(clickLocation.x, clickLocation.y);
            }
        }

        const finishAnnotationCreation = (_event: MouseEvent) => {
            console.log("Finish")
            isDraggingRef.current = false;
            if (toolingCallbacks) {
                //const [x, y] = getClickData(event, plot);
                //toolingCallbacks.end(x, y);
            }
        };

        // This is a backup listener in case the user lifts the control key first - this isn't ideal as a final update won't be sent
        const cancelToolCreation = (event: KeyboardEvent) => {
            if (event.key === "Control" && isDraggingRef.current) {
                isDraggingRef.current = false;
            }
        };

        draggableElements.forEach((element) => {
            element.addEventListener("mousedown", startAnnotationCreation);
            element.addEventListener("mousemove", updateAnnotation);
            element.addEventListener("mouseup", finishAnnotationCreation);
        })

        document.addEventListener("keyup", cancelToolCreation);

        return (() => {
            console.log("Cleaning up click handler from plots")
            draggableElements.forEach((element) => {
                element.removeEventListener("mousedown", startAnnotationCreation);
                element.removeEventListener("mousemove", updateAnnotation);
                element.removeEventListener("mouseup", finishAnnotationCreation);
            })
            document.removeEventListener("keyup", cancelToolCreation);
        })
    }, [activeAnnotationTool, addAnnotation, createAnnotation, plotId, plotReady, toolingCallbacks])

    return (
        <div className="w-full px-6 py-3 space-y-3 flex-col">
            {/* Div where plot is inserted */}
            <div id={plotId} className="">
                <>
                    {React.Children.map(children, (child) => {
                        return React.isValidElement(child)
                        ? React.cloneElement(child, {
                            plotId,
                            plotReady,
                            })
                        : child;
                    })}
                </>
            </div>
        </div>
    )
}