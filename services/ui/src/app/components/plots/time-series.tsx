"use client"

import { useContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { Config, Layout, PlotData, relayout, PlotRelayoutEvent } from "plotly.js"
import React, { useEffect, useRef, useState } from "react"

type InjectedProps = {
    plotId: string;
    plotReady: boolean;
    forceUpdate: number;
}

interface PlotConfiguration {
    data: Partial<PlotData>[],
    layout: Partial<Layout>,
    config?: Partial<Config>
}

type DisruptionPlotProps = {
    plotId?: string;
    plotConfig: PlotConfiguration;
    children: React.ReactElement<InjectedProps> | React.ReactElement<InjectedProps>[]
}

/**
 * Component that handles the plotly and context menu rendering
 * 
 * @param data Disruption time series data
 * @param plotId Set plot id externally in case multiple plots are used
 */
export const TimeSeries = ({
    plotId: externalId,
    plotConfig: {
        data,
        layout,
        config = {
            displaylogo: false,
            displayModeBar: true,
            scrollZoom: false
        }
    }, 
    children
} : DisruptionPlotProps) => {
    const [updateTools, setUpdateTools] = useState(0)
    const [plotReady, setPlotReady] = useState(false)
    const isDraggingRef = useRef(false)
    const controlHeldRef = useRef(false);

    const plotId =  externalId || "disruption" // Facilitate an external or default ID

    const {show: showContextMenu, toolingCallbacks} = useContextMenuProvider()
    const showContextMenuRef = useRef(showContextMenu)

    const overplots: string[] = [];

    let allowRelayout = true;

    const triggerToolUpdate = () => {
        setUpdateTools((current) => (current + 1) % 100)
    }

    const renderZones = (plot: Plotly.PlotlyHTMLElement) =>  {
        // Get all subplot elements and extract the subplot name (xy for example) from the class list
        const subplots = plot.querySelectorAll(".subplot")
        const subplotNames = [...subplots].map(el => 
            [...el.classList].find(cls => cls !== "subplot")
        )

        // For each subplot identified generate a D3 overplot with the subplot name appended so that tooling can reference it
        subplotNames.forEach(coordinateSystem => {
            const subplot = plot.querySelector(`.subplot.${coordinateSystem}`)?.querySelector(".overplot")?.querySelector(`.${coordinateSystem}`) as HTMLElement
            if (!subplot) {
                console.error("Cannot locate disruption plotly subplot")
                return
            }

            if (!subplot.querySelector(`.${plotId}-overplot-${coordinateSystem}`)) { // ensure only one custom overlay group is present
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "g")
                svg.setAttribute("class", `${plotId}-overplot-${coordinateSystem}`)
                svg.setAttribute("fill", "none");
                subplot.appendChild(svg)
                overplots.push(`${plotId}-overplot-${coordinateSystem}`) // Store overplots for removal
            }
        });
        
        setPlotReady(true)

        // Sets the y axis range required for the current x range for each subplot
        const rescale = (x0?: number, x1?: number, manualZoom = false) => {
            if (!allowRelayout) return // Prevents relayout triggering itself
            allowRelayout = false

            // If no x range is passed, then the min/max is used
            if (!x0) {
                x0 = ((plot as any)._fullData[0]._extremes.x.min[0].val) as number;
            }
            if (!x1) {
                x1 = ((plot as any)._fullData[0]._extremes.x.max[0].val) as number;
            }
            
            // Ensure each data set is handled (ensures all subplots are zoomed correctly)
            data.forEach((dataSet, index) => {
                let yAxisID = ""

                if (dataSet.yaxis) {
                    // Find the y axis ID relating to this subplot
                    const locatedID = dataSet.yaxis.match(/y(.*)$/)?.[1];
                    if (locatedID) {
                        yAxisID = locatedID
                    }
                }

                const xArray = (dataSet as PlotData).x as number[];
                const yArray = (dataSet as PlotData).y as number[];

                // Find min and max y data values
                const yValues: number[] = [];
                for (let i = 0; i < xArray.length; i++) {
                    const xVal = xArray[i];
                    if (xVal >= x0 && xVal <= x1) {
                        yValues.push(yArray[i]);
                    }
                }

                if (yValues.length > 0) {
                    const yMin = Math.min(...yValues)
                    const yMax = Math.max(...yValues)

                    const previousRange = (plot as any)._fullLayout[`yaxis${yAxisID}`].range;
                    
                    // Only allow relayout if new yRange is smaller than previous one or if this isn't a manual zoom
                    // This allows users to zoom in on bits of the graph accurately without it auto-scaling
                    if (((yMax - yMin) < (previousRange[1] - previousRange[0]) || !manualZoom)) {
                        relayout(plot, {
                            [`yaxis${yAxisID}.range`]: [yMin, yMax]
                        })
                    }
                }
            })

            // Debounce the relayout calls 
            setTimeout(() => {
                allowRelayout = true
            }, 100)
        }

        const relayoutHandler = (eventData: PlotRelayoutEvent) => { // triggers re-render of overlay tools when axes change
            triggerToolUpdate()

            // This makes use of the first graph displayed but this should be fine
            const x0 = eventData["xaxis.range[0]"];
            const x1 = eventData["xaxis.range[1]"];

            rescale(x0, x1, true)
        } 
        plot.on("plotly_relayout", relayoutHandler) // attach listener so it can be removed
        plot.on("plotly_doubleclick", rescale)
    };


    // Main plotly rendering
    useEffect(() => {
        const root = document.getElementById(plotId)

        if (!root) {
            console.error("Cannot locate disruption element")
            return
        }

        let plotElement: Plotly.PlotlyHTMLElement | null = null // holds the created plot for later cleanup

        const initGraph = async () => {
            const { react } = await import('plotly.js') // Annoyingly there seems to be an issue with plotly so dynamic import is needed
            react(root, data, layout, config).then(renderZones);
        }
        initGraph()
        return () => { // cleanup on unmount / Fast-Refresh
            plotElement?.removeAllListeners?.("plotly_relayout"); // detach relayout listener

            overplots.forEach(overplot => {
                root?.querySelector(`.${overplot}`)?.remove(); // remove custom overlay group
            })
            setPlotReady(false); // reset ready state
        } 
    }, [plotId])

    useEffect(() => {
        const reload = async () => {
            const { react } = await import('plotly.js') // Annoyingly there seems to be an issue with plotly so dynamic import is needed
            const root = document.getElementById(plotId)
            react(root, data, layout, config);
        };
        reload();
    }, [plotId, data]);

    // Change drag mode based on tooling interactability
    useEffect(() => {
        if (!plotReady) {
            // Plot may not have loaded yet - this will rerun after loading
            return
        }

        const plot = document.getElementById(plotId)

        if (!plot) {
            console.error("Could not locate plot to set drag mode")
            return
        }

        const disableInteraction = (event: KeyboardEvent) => {
            if (event.key === "Control") {
                if (!controlHeldRef.current) {
                    controlHeldRef.current = true
                    relayout(plot, {dragmode: false})
                }
            }
        }

        const enableInteraction = (event: KeyboardEvent) => {
            if (event.key === "Control") {
                controlHeldRef.current = false
                relayout(plot, {dragmode: "pan"})
            }
        }

        document.addEventListener("keydown", disableInteraction)
        document.addEventListener("keyup", enableInteraction)

        return () => {
            document.removeEventListener("keydown", disableInteraction)
            document.removeEventListener("keyup", enableInteraction)
        }
    }, [plotId, plotReady])

    // Handles context menu creation
    useEffect(() => {
        if (!plotReady) {
            // Plot may not have loaded yet - this will rerun after loading
            return
        }

        const plot = document.getElementById(plotId)

        if (!plot) {
            console.error("Could not locate plot to assign context menu")
            return
        }

        function getClickData(event: MouseEvent, plot): [number, number] {
            const xaxis = plot._fullLayout.xaxis  // x-axis descriptor
            const yaxis = plot._fullLayout.yaxis  // y-axis descriptor

            const bb = (event.target as HTMLElement).getBoundingClientRect()
            const relX = event.clientX - bb.left    // click X in pixels, relative to plot
            const relY = event.clientY - bb.top       // click Y in pixels, relative to plot

            // Coordinates in data space
            const x      = xaxis.p2d(relX)   // data-space X at click
            const y      = yaxis.p2d(relY)     // data-space Y at click

            return [x, y]
        }

        /* 
        Context-menu dispatcher

            Converts the mouse click (pixel-space) to data-space coordinates (x, y) using Plotly’s axis converters.

            Derives the current axis ranges (xRange, yRange) so tools can size new elements as a fraction of the view, independent of zoom level.
    
            information delivered to the menu is  { x, y, xScale, yScale, xRange, yRange, xLimits: [xMin, xMax], yLimits: [yMin, yMax] }

            The dispatcher now auto-detects which subplot was clicked (via the element data-subplot attribute or nearest .subplot group) and 
            picks the matching xaxisN / yaxisN, so the props are correct for any subplot.
        */
        function handleContextMenu(event: MouseEvent, plot) {
            let xaxis: any // will be assigned to the subplot-specific or primary x-axis below
            let yaxis: any  // will be assigned to the subplot-specific or primary y-axis below

            const bb = (event.target as HTMLElement).getBoundingClientRect()
            const relX = event.clientX - bb.left    // click X in pixels, relative to plot
            const relY = event.clientY - bb.top       // click Y in pixels, relative to plot

            /* 
            determine local axes for the subplot clicked
            Prefer the data-subplot attribute available on drag layers;
            */
            let subplotId = (event.target as HTMLElement).dataset.subplot // e.g. "x2y2"         
            if (subplotId) {
                const m = subplotId.match(/^x(\d*)y(\d*)$/)               // ['', '2', '2']
                // m[1]/m[2] hold numeric suffixes empty string -> primary axis
                if (m) {
                    const suffixX = m[1] ?? ""                            // '' -> xaxis
                    const suffixY = m[2] ?? ""                            // '' -> yaxis
                    // Swap to subplot-specific axes if they exist
                    xaxis = plot._fullLayout[`xaxis${suffixX}`] ?? plot._fullLayout.xaxis
                    yaxis = plot._fullLayout[`yaxis${suffixY}`] ?? plot._fullLayout.yaxis
                }
            }
            // final catch-all fallback – runs whether or not we found a subplotId 
            xaxis = xaxis ?? plot._fullLayout.xaxis
            yaxis = yaxis ?? plot._fullLayout.yaxis

            // Coordinates in data space
            const x      = xaxis.p2d(relX)   // data-space X at click
            const y      = yaxis.p2d(relY)     // data-space Y at click
            
            // compute full data range spans from axis.range 
            const [xMin, xMax] = xaxis.range as [number, number]  // data-space limits on x
            const [yMin, yMax] = yaxis.range as [number, number]  // data-space limits on y
            const xRange       = xMax - xMin    // total span on x axis
            const yRange       = yMax - yMin    // total span on y axis
 
            showContextMenuRef.current({
                event,
                props: {
                    // new generic props 
                    x, y,   // generic data-space click position
                    xRange, yRange,  // current axis spans
                    xLimits: [xMin, xMax], yLimits: [yMin, yMax]  // explicit axis limits
                }
            })

        }

        const dragElements = plot.querySelectorAll<HTMLDivElement>(".drag")

        if (dragElements.length === 0) {
            console.error("Could not locate drag element to assign context menu")
            return
        }

        const contextHandler = (event: MouseEvent) => { //  wrap handler so we can remove it
            handleContextMenu(event, plot)
        }

        const startToolCreation = (event: MouseEvent) => {
            if (toolingCallbacks && event.ctrlKey) {
                isDraggingRef.current = true
                const [x, y] = getClickData(event, plot)
                toolingCallbacks.start(x, y)
            }
        }

        // This is a backup listener in case the user lifts the control key first - this isn't ideal as a final update won't be sent
        const cancelToolCreation = (event: KeyboardEvent) => {
            if (event.key === "Control" && toolingCallbacks && isDraggingRef.current) {
                isDraggingRef.current = false
            }
        }

        const finishToolCreation = (event: MouseEvent) => {
            if (toolingCallbacks && isDraggingRef.current) {
                isDraggingRef.current = false
                const [x, y] = getClickData(event, plot)
                toolingCallbacks.end(x, y)
            }
        }

        const updateTool = (event: MouseEvent) => {
            if (toolingCallbacks && isDraggingRef.current) {
                const [x, y] = getClickData(event, plot)
                toolingCallbacks.move(x, y)
            }
        }

        dragElements.forEach((dragElement) => {
            dragElement.addEventListener("contextmenu", contextHandler) // add context-menu listener
            dragElement.addEventListener("mousedown", startToolCreation)
            dragElement.addEventListener("mouseup", finishToolCreation)
            dragElement.addEventListener("mousemove", updateTool)
        })

        document.addEventListener("keyup", cancelToolCreation)

        return () => { // remove listener on effect cleanup
            dragElements.forEach((dragElement) => {
                dragElement.removeEventListener("contextmenu", contextHandler)
                dragElement.removeEventListener("mousedown", startToolCreation)
                dragElement.removeEventListener("mouseup", finishToolCreation)
                dragElement.removeEventListener("mousemove", updateTool)
            })
            document.removeEventListener("keyup", cancelToolCreation)
        }

    }, [plotId, plotReady, toolingCallbacks])

    return (
        <div className="w-full px-6 py-3 space-y-3 flex-col">
            {/* Div where plot is inserted */}
            <div id={plotId} className="" />
            <>
                {React.Children.map(children, child => {
                    return (
                        React.isValidElement(child)
                        ? React.cloneElement(child, { plotId, plotReady, forceUpdate: updateTools })
                        : child
                    )
                })}
            </>
        </div>
    )
}