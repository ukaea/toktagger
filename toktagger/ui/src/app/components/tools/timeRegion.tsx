"use client"

import { useTimeSeriesActions, useTimeSeriesState } from "@/app/contexts/TimeSeriesContext"
import { TimeSeriesAnnotation, TimeSeriesAnnotationType, ToolingCallbacks, ToolingProps } from "@/types";
import * as d3 from "d3";
import { useEffect, useRef } from "react";

export const TimeRegion = ({
    plotId,
    plotReady,
}: ToolingProps) => {
    const {registerTooling, createAnnotation, addAnnotation, updateAnnotation} = useTimeSeriesActions();
    const {annotations, forceUpdate, isDrawing} = useTimeSeriesState()

    const currentAnnotation = useRef<TimeSeriesAnnotation | null>(null);

    useEffect(() => {
        const toolingCallbacks: ToolingCallbacks = {
            start: (x, y) => {
                const annotation = createAnnotation(TimeSeriesAnnotationType.TIME_REGION);
                currentAnnotation.current = annotation;
                annotation.points.push({x, y})
                annotation.points.push({x, y})
                addAnnotation(annotation)
            },
            move(x, y) {
                if (!currentAnnotation.current) {
                  console.warn("Could not update annotation as ID reference has been lost");
                  return;
                }
                if (!currentAnnotation.current.points[1]) {
                  console.warn("Could not update zone as data points are invalid");
                  return;
                }
                currentAnnotation.current.points[1] = {x, y};
                updateAnnotation(currentAnnotation.current);
            },
        }
        registerTooling(TimeSeriesAnnotationType.TIME_REGION, toolingCallbacks)
    }, [addAnnotation, createAnnotation, registerTooling, updateAnnotation]);

    // Main rendering effect
      useEffect(() => {
        // This shall not run until the target plot is initialised
        if (!plotId || !plotReady) {
          return;
        }
    
        // Grab the handle set up in the main plot for D3 rendering
        const plot = document.getElementById(plotId);
    
        // Rendering should not be attempted if the required handles are not found
        if (!plot) {
          console.error("Could not locate plot to generate vspans");
          return;
        }
    
        // Get a reference to all subplots and find the name of the axis
        const subplots = plot.querySelectorAll(".subplot");
        const subplotNames = [...subplots].map((el) =>
          [...el.classList].find((cls) => cls !== "subplot"),
        );
    
        // For each subplot carry out the tooling generation
        subplotNames.forEach((subplotId) => {
          if (subplotId === undefined) {
            console.error("Could not find valid subplot ID");
            return;
          }
    
          const overplot = document.getElementsByClassName(
            `${plotId}-overplot-${subplotId}`,
          )[0];
    
          if (!overplot) {
            // Silently skip if overplot not found yet - it will be available on next render
            console.warn("Could not find overplot for vspan rendering");
            return;
          }
    
          // Find the y axis ID relating to this subplot
          const yAxisID = subplotId.match(/y(.*)$/)?.[1];
          if (!yAxisID && yAxisID !== "") {
            console.error("Could not find valid subplot y-axis ID");
            return;
          }
          // Use the axis information to calculate the upper and lower limits of the zone
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const axis = (plot as any)._fullLayout[`yaxis${yAxisID}`];
          const range = axis._tmax - axis._tmin;
          const upperLimit = axis.d2p(axis._tmax + 2 * range);
          const lowerLimit = axis.d2p(axis._tmin - 2 * range);
          const height = lowerLimit - upperLimit;
    
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const xaxis = (plot as any)._fullLayout.xaxis;
    
          const graphGroup = d3.select(overplot);
          graphGroup.selectAll(".zone").remove(); // All VSpans are removed each render cycle
    
    
          // Create a line and a transparent drag handle for each VSpan
          for (const zone of annotations) {
            if (zone.type !== TimeSeriesAnnotationType.TIME_REGION) continue;
            const opacity = 0.5;

            // pixel positions for the two data boundaries
            const px0 = xaxis.d2p(zone.points[0].x);
            const px1 = xaxis.d2p(zone.points[1].x);
            const pointerEvent = isDrawing ? "none" : "all";

            // render span using left-most x and absolute width, span in pixels
            const spanLeft = Math.min(px0, px1);
            const spanRight = Math.max(px0, px1);
            const spanWidth = spanRight - spanLeft;

            // Span (center drag target)
            graphGroup
              .append("rect")
              .attr("class", "zone span cursor-grab disable-on-modifier")
              .attr("x", spanLeft)
              .attr("y", upperLimit)
              .attr("width", spanWidth)
              .attr("height", height)
              .attr("fill", "black")
              .attr("opacity", opacity)
              .attr("style", `pointer-events: ${pointerEvent}`)
              .attr("stroke", "black")
              .attr("stroke-width", 1)
              .attr("stroke", "gray")
              .style("cursor", "move")
              .attr("stroke-width", 1)
              .datum(zone)
            }
        });
      }, [annotations, isDrawing, plotId, plotReady, forceUpdate, updateAnnotation]); // forceUpdate is required here to keep tooling correctly positioned

    return (
        <div />
    )
}