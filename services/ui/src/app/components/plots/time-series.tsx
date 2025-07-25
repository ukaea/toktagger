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
            scrollZoom: true
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

        function handleContextMenu(event, plot) {
            const xaxis = plot._fullLayout.xaxis;
            const bb = event.target.getBoundingClientRect();
            const x0 = xaxis.p2d(event.clientX - bb.left);
            const x1 = xaxis.p2d(event.clientX - bb.left + 100);

            showContextMenuRef.current({
                event,
                props: {
                    x0,
                    x1
                }
            })
        }

        const dragElement = plot.querySelector(".drag")

        if (!dragElement) {
            console.error("Could not locate drag element to assign context menu")
            return
        }

        const contextHandler = (event) => { //  wrap handler so we can remove it
            handleContextMenu(event, plot)
        } 

        dragElement.addEventListener("contextmenu", contextHandler) // add context-menu listener

        return () => { // remove listener on effect cleanup
            dragElement.removeEventListener("contextmenu", contextHandler) 
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