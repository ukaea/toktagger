"use client";

import {
  TIME_SERIES_ANNOTATION_MENU,
  useTimeSeriesActions,
  useTimeSeriesState,
} from "@/app/contexts/TimeSeriesContext";
import { useRadialProfile } from "@/app/contexts/RadialProfileContext";
import {
  ExtendedPlotlyHTMLElement,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
  ToolingCallbacks,
  ToolingProps,
} from "@/types";
import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { useContextMenu } from "react-contexify";

type RadialRangeProps = ToolingProps & {
  // Which side of the (time, radius) box this plot's x-axis shows.
  projection: "radius" | "time";
};

// Box points follow the BoundingBox convention: points[0] = (t_min, r_max), points[1] = (t_max, r_min).
const getEdge = (
  annotation: TimeSeriesAnnotation,
  index: 0 | 1,
  projection: RadialRangeProps["projection"],
) =>
  projection === "radius"
    ? annotation.points[index].y
    : annotation.points[index].x;

const setEdge = (
  annotation: TimeSeriesAnnotation,
  index: 0 | 1,
  projection: RadialRangeProps["projection"],
  value: number,
) => {
  if (projection === "radius") annotation.points[index].y = value;
  else annotation.points[index].x = value;
};

const normalise = (annotation: TimeSeriesAnnotation) => {
  const [a, b] = annotation.points;
  annotation.points = [
    { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
  ];
};

/**
 * Draws a radius range over a time range, stored as a bounding box (x = time, y = radius).
 * The radius projection draws and edits the radial extent; the time projection edits the time extent.
 */
export const RadialRange = ({
  plotId,
  plotReady,
  projection,
}: RadialRangeProps) => {
  const {
    registerTooling,
    createAnnotation,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    setOngoingAction,
    selectAnnotations,
  } = useTimeSeriesActions();
  const { annotations, forceUpdate, isDrawing, categories, editMode } =
    useTimeSeriesState();
  const { effectiveTimeWindow } = useRadialProfile();
  // Tooling registers once, so the draw callbacks read the latest window through a ref.
  const timeWindowRef = useRef(effectiveTimeWindow);
  timeWindowRef.current = effectiveTimeWindow;

  const currentAnnotation = useRef<TimeSeriesAnnotation | null>(null);
  const dragOffset = useRef(0);

  const { show } = useContextMenu({ id: TIME_SERIES_ANNOTATION_MENU });

  useEffect(() => {
    if (projection !== "radius") return;
    const toolingCallbacks: ToolingCallbacks = {
      start: (x, _y, label) => {
        const annotation = createAnnotation(
          TimeSeriesAnnotationType.BOUNDING_BOX,
          label,
        );
        currentAnnotation.current = annotation;
        const [timeMin, timeMax] = timeWindowRef.current;
        annotation.points.push({ x: timeMin, y: x });
        annotation.points.push({ x: timeMax, y: x });
        addAnnotation(annotation);
      },
      move(x) {
        if (!currentAnnotation.current?.points[1]) return;
        currentAnnotation.current.points[1].y = x;
        updateAnnotation(currentAnnotation.current);
      },
      end() {
        if (!currentAnnotation.current) return;
        normalise(currentAnnotation.current);
        updateAnnotation(currentAnnotation.current);
      },
      cancel() {
        if (currentAnnotation.current) {
          removeAnnotation(currentAnnotation.current.id);
        }
        currentAnnotation.current = null;
      },
    };
    registerTooling(TimeSeriesAnnotationType.BOUNDING_BOX, toolingCallbacks);
  }, [
    addAnnotation,
    createAnnotation,
    projection,
    registerTooling,
    removeAnnotation,
    updateAnnotation,
  ]);

  useEffect(() => {
    if (!plotId || !plotReady) return;

    const plot = document.getElementById(plotId) as ExtendedPlotlyHTMLElement;
    if (!plot) {
      console.error("Could not locate plot to generate radial ranges");
      return;
    }

    const xAxis = plot._fullLayout.xaxis;
    const [xMin, xMax] = xAxis.range;
    const minWidth = Math.abs(xMax - xMin) * 0.005;

    const ranges = annotations.filter(
      (annotation) =>
        annotation.type === TimeSeriesAnnotationType.BOUNDING_BOX &&
        annotation.points.length === 2 &&
        // On the radial plot, only show ranges overlapping the slices on display.
        (projection === "time" ||
          (Math.max(annotation.points[0].x, annotation.points[1].x) >=
            effectiveTimeWindow[0] &&
            Math.min(annotation.points[0].x, annotation.points[1].x) <=
              effectiveTimeWindow[1])),
    );

    const subplotNames = [...plot.querySelectorAll(".subplot")].map((el) =>
      [...el.classList].find((cls) => cls !== "subplot"),
    );

    subplotNames.forEach((subplotId) => {
      if (subplotId === undefined) return;
      const overplot = document.getElementsByClassName(
        `${plotId}-overplot-${subplotId}`,
      )[0];
      const yAxisID = subplotId.match(/y(.*)$/)?.[1] ?? "";
      const yAxis = plot._fullLayout[`yaxis${yAxisID}`];
      if (!overplot || !yAxis) return;

      const height = yAxis._length;
      const graphGroup = d3.select(overplot);
      graphGroup.selectAll(".radial-range").remove();

      const handleContextMenu = (
        event: MouseEvent,
        annotation: TimeSeriesAnnotation,
      ) => {
        event.preventDefault();
        if (event.button === 2 && !event.ctrlKey) {
          show({ event, props: { annotation } });
        }
      };

      const translateHandler = d3
        .drag<SVGRectElement, TimeSeriesAnnotation>()
        .on("start", (event, d) => {
          selectAnnotations([d.id]);
          const left = Math.min(
            getEdge(d, 0, projection),
            getEdge(d, 1, projection),
          );
          dragOffset.current = xAxis.d2p(left) - event.x;
        })
        .on("drag", (event, d) => {
          const left = Math.min(
            getEdge(d, 0, projection),
            getEdge(d, 1, projection),
          );
          const shift = xAxis.p2d(event.x + dragOffset.current) - left;
          setEdge(d, 0, projection, getEdge(d, 0, projection) + shift);
          setEdge(d, 1, projection, getEdge(d, 1, projection) + shift);
          updateAnnotation(d);
          setOngoingAction(true);
        })
        .on("end", () => setOngoingAction(false));

      const getBoundaryHandler = (index: 0 | 1) =>
        d3
          .drag<SVGRectElement, TimeSeriesAnnotation>()
          .on("start", (_event, d) => selectAnnotations([d.id]))
          .on("drag", (event, d) => {
            setEdge(d, index, projection, xAxis.p2d(event.x));
            updateAnnotation(d);
            setOngoingAction(true);
          })
          .on("end", (_event, d) => {
            const other = getEdge(d, index === 0 ? 1 : 0, projection);
            const edge = getEdge(d, index, projection);
            if (Math.abs(edge - other) < minWidth) {
              setEdge(
                d,
                index,
                projection,
                other + (edge >= other ? minWidth : -minWidth),
              );
            }
            normalise(d);
            updateAnnotation(d);
            setOngoingAction(false);
          });

      const pointerEvents = isDrawing || !editMode ? "none" : "all";
      const HANDLE_PX = 8;

      for (const range of ranges) {
        const px0 = xAxis.d2p(getEdge(range, 0, projection));
        const px1 = xAxis.d2p(getEdge(range, 1, projection));
        const left = Math.min(px0, px1);
        const width = Math.abs(px1 - px0);
        const color =
          categories.get(`${range.type}_${range.label}`)?.color || "black";

        graphGroup
          .append("rect")
          .attr("aria-label", `radial-range-${projection}`)
          .attr("class", "annotation radial-range disable-on-modifier")
          .attr("x", left)
          .attr("y", 0)
          .attr("width", width)
          .attr("height", height)
          .attr("fill", color)
          .attr("opacity", range.selected ? 0.5 : 0.25)
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
          // Dashed on the time plot so ranges read differently from time regions.
          .attr("stroke-dasharray", projection === "time" ? "6 4" : null)
          .attr("style", `pointer-events: ${pointerEvents}`)
          .style("cursor", "move")
          .datum(range)
          .call(translateHandler)
          .on("contextmenu", handleContextMenu);

        ([0, 1] as const).forEach((index) => {
          const px = index === 0 ? px0 : px1;
          graphGroup
            .append("rect")
            .attr("aria-label", `radial-range-${projection}-handle-${index}`)
            .attr("class", "annotation radial-range disable-on-modifier")
            .attr("x", px - HANDLE_PX / 2)
            .attr("y", 0)
            .attr("width", HANDLE_PX)
            .attr("height", height)
            .attr("fill", "transparent")
            .attr("style", `pointer-events: ${pointerEvents}`)
            .style("cursor", "ew-resize")
            .datum(range)
            .call(getBoundaryHandler(index))
            .on("contextmenu", handleContextMenu);
        });
      }
    });
  }, [
    annotations,
    categories,
    editMode,
    effectiveTimeWindow,
    forceUpdate,
    isDrawing,
    plotId,
    plotReady,
    projection,
    selectAnnotations,
    setOngoingAction,
    show,
    updateAnnotation,
  ]); // forceUpdate keeps the bands positioned after pan/zoom

  return <div />;
};
