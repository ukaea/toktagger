"use client"

import { useContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { Config, Layout, Data } from "plotly.js"
import React, { useEffect, useRef, useState } from "react"

type InjectedProps = {
    plotId: string;
    plotReady: boolean;
    forceUpdate: number;
}

interface PlotConfiguration {
    data: Data[],
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

    const plotId =  externalId || "disruption" // Facilitate an external or default ID

    const {show: showContextMenu} = useContextMenuProvider()
    const showContextMenuRef = useRef(showContextMenu)

    const overplots: string[] = [];

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

        const relayoutHandler = () => { // triggers re-render of overlay tools when axes change
            triggerToolUpdate()
        } 
        plot.on("plotly_relayout", relayoutHandler) // attach listener so it can be removed

        document.addEventListener("keydown", (e) => {
            if (e.key === "Shift") {
                const elements = plot.querySelectorAll(".disable-on-shift")
                elements.forEach((element) => {
                    element.setAttribute("style", "pointer-events: none")
                })
            }
        })

        document.addEventListener("keyup", (e) => {
            if (e.key === "Shift") {
                const elements = plot.querySelectorAll(".disable-on-shift")
                elements.forEach((element) => {
                    element.setAttribute("style", "pointer-events: all")
                })
            }
        })
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

            // detach key press listeners
            plotElement?.removeAllListeners?.("keydown");
            plotElement?.removeAllListeners?.("keyup");

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

        /* 
        Context-menu dispatcher

            Converts the mouse click (pixel-space) to data-space coordinates (x, y) using Plotly’s axis converters.

            Derives the current axis ranges (xRange, yRange) so tools can size new elements as a fraction of the view, independent of zoom level.
    
            information delivered to the menu is  { x, y, xScale, yScale, xRange, yRange, xLimits: [xMin, xMax], yLimits: [yMin, yMax] }

        */
        function handleContextMenu(event: MouseEvent, plot) {
            const xaxis = plot._fullLayout.xaxis  // x-axis descriptor
            const yaxis = plot._fullLayout.yaxis  // y-axis descriptor

            const bb = (event.target as HTMLElement).getBoundingClientRect()
            const relX = event.clientX - bb.left    // click X in pixels, relative to plot
            const relY = event.clientY - bb.top       // click Y in pixels, relative to plot

            // Coordinates in data space
            const x      = xaxis.p2d(relX)   // data-space X at click
            const y      = yaxis.p2d(relY)     // data-space Y at click

            // Pixels-per-unit (positive values)
            const xScale = Math.abs(xaxis.d2p(1) - xaxis.d2p(0))  // px per 1 unit on x
            const yScale = Math.abs(yaxis.d2p(1) - yaxis.d2p(0))   // px per 1 unit on y
            
            // compute full data range spans from axis.range 
            const [xMin, xMax] = xaxis.range as [number, number]  // data-space limits on x
            const [yMin, yMax] = yaxis.range as [number, number]  // data-space limits on y
            const xRange       = xMax - xMin    // total span on x axis
            const yRange       = yMax - yMin    // total span on y axis
 
            // legacy helpers - 100 pixel wide default zone helpers
            const unitWidth = 100 / xScale    // 100 px converted to units

            showContextMenuRef.current({
                event,
                props: {
                    // new generic props 
                    xScale, yScale, 
                    x, y,   // generic data-space click position
                    xRange, yRange,  // current axis spans
                    xLimits: [xMin, xMax], yLimits: [yMin, yMax]  // explicit axis limits
                }
            })

        }

        const dragElements = plot.querySelectorAll(".drag")

        if (dragElements.length === 0) {
            console.error("Could not locate drag element to assign context menu")
            return
        }

        const contextHandler = (event: MouseEvent) => { //  wrap handler so we can remove it
            handleContextMenu(event, plot)
        } 

        dragElements.forEach((dragElement) => {
            dragElement.addEventListener("contextmenu", contextHandler) // add context-menu listener
        })

        return () => { // remove listener on effect cleanup
            dragElements.forEach((dragElement) => {
                dragElement.removeEventListener("contextmenu", contextHandler)
            })
        }

    }, [plotId, plotReady])

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