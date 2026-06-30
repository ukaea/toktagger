"use client";

import {
  TIME_SERIES_ANNOTATION_MENU,
  useTimeSeriesActions,
  useTimeSeriesState,
} from "@/app/contexts/TimeSeriesContext";
import {
  ExtendedPlotlyHTMLElement,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationPoint,
  TimeSeriesAnnotationType,
  ToolingCallbacks,
  ToolingProps,
} from "@/types";
import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";
import { useContextMenu } from "react-contexify";

export const Polygon = ({ plotId, plotReady }: ToolingProps) => {
  const {
    registerTooling,
    createAnnotation,
    addAnnotation,
    updateAnnotation,
    setOngoingAction,
    selectAnnotations,
  } = useTimeSeriesActions();
  const { annotations, forceUpdate, isDrawing, categories, editMode } =
    useTimeSeriesState();

  const currentAnnotation = useRef<TimeSeriesAnnotation | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isAddingPoints = useRef(false);

  // Hook to trigger the context provider to render context menu
  const { show } = useContextMenu({
    id: TIME_SERIES_ANNOTATION_MENU,
  });

  useEffect(() => {
    const toolingCallbacks: ToolingCallbacks = {
      start: (x, y, label) => {
        console.log("drawing: ", isAddingPoints)
        if (isAddingPoints.current) {
            if (!currentAnnotation.current) {
                console.error("Could not find current annotation to add point to")
                return
            }

            if (currentAnnotation.current.type !== TimeSeriesAnnotationType.POLYGON) {
                console.error("Could not add point to non-polygon annotation")
                return
            }

            currentAnnotation.current.points.push({ x, y })
            console.log("Update: ", currentAnnotation.current)
            updateAnnotation(currentAnnotation.current);
            return
        }
        
        isAddingPoints.current = true;
        const annotation = createAnnotation(
          TimeSeriesAnnotationType.POLYGON,
          label,
        );
        currentAnnotation.current = annotation;
        annotation.points.push({ x, y });
        annotation.points.push({ x, y });
        annotation.points.push({ x, y });
        console.log(annotation)
        addAnnotation(annotation);
      },
      move(x, y) {
      },
      end(_x, _y) {
      },
    };
    registerTooling(TimeSeriesAnnotationType.POLYGON, toolingCallbacks);
  }, [addAnnotation, createAnnotation, registerTooling, setOngoingAction, updateAnnotation]);

  // Main rendering effect
  useEffect(() => {
    // This shall not run until the target plot is initialised
    if (!plotId || !plotReady) {
      return;
    }

    // Grab the handle set up in the main plot for D3 rendering
    const plot = document.getElementById(plotId) as ExtendedPlotlyHTMLElement;

    // Rendering should not be attempted if the required handles are not found
    if (!plot) {
      console.error("Could not locate plot to generate bounding box");
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
        console.warn("Could not find overplot for bounding box rendering");
        return;
      }

      // Find the y axis ID relating to this subplot
      const yAxisID = subplotId.match(/y(.*)$/)?.[1];
      if (!yAxisID && yAxisID !== "") {
        console.error("Could not find valid subplot y-axis ID");
        return;
      }
      // Use the axis information to calculate the upper and lower limits of the zone
      const yAxis = plot._fullLayout[`yaxis${yAxisID}`];
      const xAxis = plot._fullLayout.xaxis;

      const graphGroup = d3.select(overplot);
      graphGroup.selectAll(".bounding-box").remove(); // All VSpans are removed each render cycle

      function handleContextMenu(
        event: MouseEvent,
        annotation: TimeSeriesAnnotation,
      ) {
        event.preventDefault(); // Prevent default context menu
        const isRightClickEvent = event.button === 2 && !event.ctrlKey;
        if (isRightClickEvent) {
          show({
            event,
            props: {
              annotation,
            },
          });
        }
      }

      // Create a line and a transparent drag handle for each VSpan
      for (const polygon of annotations) {
        if (polygon.type !== TimeSeriesAnnotationType.POLYGON)
          continue;
        const opacity = polygon.selected ? 0.8 : 0.5;
        const pointerEvent = isDrawing || !editMode ? "none" : "all";

        const categoryId = `${polygon.type}_${polygon.label}`;
        const color = categories.get(categoryId)?.color || "black";

        // Polygon
        graphGroup
            .append("polygon")
            .attr("points", polygon.points.map(p => (`${p.x}, ${p.y}`)).join(" "))
            .attr("fill", "steelblue")
            .attr("stroke", "black")
            .attr("stroke-width", 2);       
      }
    });
  }, [
    annotations,
    isDrawing,
    plotId,
    plotReady,
    forceUpdate,
    updateAnnotation,
    categories,
    show,
    editMode,
    setOngoingAction,
    selectAnnotations,
  ]); // forceUpdate is required here to keep tooling correctly positioned

  return <div />;
};
