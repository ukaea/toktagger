import { useEffect, useRef } from "react";
import { useContextMenu } from "react-contexify";

import * as d3 from "d3";
import { useZoneContext, ZONE_MENU_ID } from "../providers/zone-provider";
import { ToolingProps, Zone } from "@/types";
import { useContextMenuProvider } from "../providers/annotation-provider";

/**
 * Handles the rendering of zones onto a specific plot
 *
 * @param plotId Used to identify the plot that the tooling should be rendered on
 * @param plotReady Signal from main plot that tooling can be drawn
 */
export const Zones = ({
  plotId,
  plotReady,
  forceUpdate,
  selectedXRange,
}: ToolingProps) => {
  const dragOffset = useRef(0);

  // Hook to trigger the context provider to render context menu
  const { show: showZoneMenu } = useContextMenu({
    id: ZONE_MENU_ID,
  });

  // Hook to pull in data from context provider
  const { zones, handleZoneUpdate, handleZoneDragFinish } = useZoneContext();
  const { disableToolingInteraction } = useContextMenuProvider();

  // Main rendering effect
  useEffect(() => {
    // This shall not run until the target plot is initialised
    if (!plotId || !plotReady || forceUpdate === undefined) {
      return;
    }

    // Grab the handle set up in the main plot for D3 rendering
    const plot = document.getElementById(plotId);

    // Rendering should not be attempted if the required handles are not found
    if (!plot) {
      console.error("Could not locate plot to generate zones");
      return;
    }

    // Get a reference to all subplots and find the name of the axis
    const subplots = plot.querySelectorAll(".subplot");
    const subplotNames = [...subplots].map((el) =>
      [...el.classList].find((cls) => cls !== "subplot")
    );

    // For each subplot carry out the tooling generation
    subplotNames.forEach((subplotId) => {
      if (subplotId === undefined) {
        console.error("Could not find valid subplot ID");
        return;
      }

      const overplot = document.getElementsByClassName(
        `${plotId}-overplot-${subplotId}`
      )[0];

      if (!overplot) {
        // Retry after a short delay if overplot not found yet
        console.warn("Overplot not ready for zones; will retry...");
        setTimeout(() => {
          handleZoneUpdate();
        }, 100);
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

      // Minimum width in data units: 0.1% of current x-range
      const [xMin, xMax] = xaxis.range as [number, number];
      const MIN_WIDTH_FRACTION = 0.001; // 0.1%
      const minWidth = (xMax - xMin) * MIN_WIDTH_FRACTION;

      const graphGroup = d3.select(overplot);
      graphGroup.selectAll(".zone").remove(); // All zones are removed each render cycle

      // Prevents a little bit of repetition by auto-configuring the resize handler
      const getBoundaryHandler = (isLeft: boolean) => {
        // Handles the dragging of the boundaries of the zone
        const resize = d3
          .drag<SVGRectElement, Zone>()
          .on("drag", function (event, d) {
            // Convert pointer X (pixels) → data units; allow wrap while dragging (no clamp here)
            const x = xaxis.p2d(event.x);
            if (isLeft) d.x0 = x;
            else d.x1 = x; // live-update only the boundary being dragged
            handleZoneUpdate();
          })
          .on("end", function (_event, d) {
            // On drag end: enforce minimum width and normalize orientation
            // minWidth is in data units (computed from current x-range above)
            let changed = false;
            const width = Math.abs(d.x1 - d.x0);
            if (width < minWidth) {
              // Clamp to min width by moving ONLY the boundary the user dragged.
              // Keep the opposite boundary fixed so the zone’s "anchor"/center doesn’t jump.
              changed = true;
              if (isLeft) {
                // If the left boundary has crossed to the right of x1, place it to the right; otherwise to the left.
                if (d.x0 > d.x1) {
                  d.x0 = d.x1 + minWidth; // wrapped past right → clamp on the right side of x1
                } else {
                  d.x0 = d.x1 - minWidth; // normal case → clamp on the left side of x1
                }
              } else {
                // Symmetric logic for right boundary relative to fixed left boundary (x0)
                if (d.x1 < d.x0) {
                  d.x1 = d.x0 - minWidth; // wrapped past left → clamp on the left side of x0
                } else {
                  d.x1 = d.x0 + minWidth; // normal case → clamp on the right side of x0
                }
              }
            }
            // Always normalize so downstream logic sees x0 <= x1
            if (d.x1 < d.x0) {
              const t = d.x0;
              d.x0 = d.x1;
              d.x1 = t;
              changed = true;
            }
            if (changed) {
              handleZoneUpdate();
            }
            handleZoneDragFinish();
          });
        return resize;
      };

      // Handles the dragging of the zones itself
      const drag = d3
        .drag<SVGRectElement, Zone>()
        .on("start", function (event, d) {
          const leftBoundary = Math.min(d.x0, d.x1);
          dragOffset.current = xaxis.d2p(leftBoundary) - event.x;
        })
        .on("drag", function (event, d) {
          const newX = event.x + dragOffset.current;
          d3.select(this).attr("x", newX);

          const x0 = xaxis.p2d(newX);
          const x1 = xaxis.p2d(
            newX + Math.abs(xaxis.d2p(d.x1) - xaxis.d2p(d.x0))
          );
          const x0Left = d.x0 < d.x1;
          d.x0 = x0Left ? x0 : x1;
          d.x1 = x0Left ? x1 : x0;
          handleZoneUpdate();
        })
        .on("end", function (_event, _d) {
          handleZoneDragFinish();
        });

      function handleContextMenu(event: MouseEvent, zone: Zone) {
        event.preventDefault(); // Prevent default context menu
        const isRightClickEvent = event.button === 2 && !event.ctrlKey;
        if (isRightClickEvent) {
          showZoneMenu({
            event,
            props: {
              zone,
            },
          });
        }
      }

      // Create the zone and transparent handles on each boundary
      for (const zone of zones) {
        // pixel positions for the two data boundaries
        const px0 = xaxis.d2p(zone.x0);
        const px1 = xaxis.d2p(zone.x1);
        const pointerEvent = disableToolingInteraction ? "none" : "all";

        // render span using left-most x and absolute width, span in pixels
        const spanLeft = Math.min(px0, px1);
        const spanRight = Math.max(px0, px1);
        const spanWidth = spanRight - spanLeft;

        // handle layout: fixed outside strip + variable inside strip
        const OUTER_HANDLE_PX = 10; // fixed, always clickable outside the zone
        const INNER_HANDLE_MAX_PX = 10; // cap inside portion so handles don't dominate
        const MIN_CENTER_DRAG_PX = 6; // keep a gap so the middle stays draggable

        // inside portion per side; shrink when zone is tiny to keep a center gap
        const inner = Math.max(
          0,
          Math.min(INNER_HANDLE_MAX_PX, (spanWidth - MIN_CENTER_DRAG_PX) / 2)
        );
        const totalHandleWidth = OUTER_HANDLE_PX + inner;

        const x0IsLeft = px0 <= px1;

        let opacity = 0.5;
        // change opacity if the zone is selected
        if (
          selectedXRange &&
          zone.x0 > selectedXRange[0] &&
          zone.x1 < selectedXRange[1]
        ) {
          zone.selected = true;
          opacity = 0.8;
        } else {
          zone.selected = false;
        }

        // Span (center drag target)
        graphGroup
          .append("rect")
          .attr("class", "zone span cursor-grab disable-on-modifier")
          .attr("x", spanLeft)
          .attr("y", upperLimit)
          .attr("width", spanWidth)
          .attr("height", height)
          .attr("fill", zone.category.color)
          .attr("opacity", opacity)
          .attr("style", `pointer-events: ${pointerEvent}`)
          .attr("stroke", "black")
          .attr("stroke-width", 1)
          .attr("stroke", "gray")
          .style("cursor", "move")
          .attr("stroke-width", 1)
          .datum(zone)
          .call(drag)
          .on("contextmenu", handleContextMenu);

        // x0 handle (moves x0): outside is away from the zone, inside points toward the other end
        const x0HandleX = x0IsLeft ? px0 - OUTER_HANDLE_PX : px0 - inner;
        graphGroup
          .append("rect")
          .attr("class", "zone leftHandle disable-on-modifier")
          .attr("x", x0HandleX)
          .attr("y", upperLimit)
          .attr("width", totalHandleWidth)
          .attr("height", height)
          .attr("fill", "transparent")
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "w-resize")
          .datum(zone)
          .on("contextmenu", handleContextMenu)
          .call(getBoundaryHandler(true));

        // x1 handle (moves x1)
        const x1HandleX = x0IsLeft ? px1 - inner : px1 - OUTER_HANDLE_PX;
        graphGroup
          .append("rect")
          .attr("class", "zone rightHandle disable-on-modifier")
          .attr("x", x1HandleX)
          .attr("y", upperLimit)
          .attr("width", totalHandleWidth)
          .attr("height", height)
          .attr("fill", "transparent")
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "e-resize")
          .datum(zone)
          .on("contextmenu", handleContextMenu)
          .call(getBoundaryHandler(false));
      }
    });
  }, [
    handleZoneUpdate,
    plotId,
    plotReady,
    showZoneMenu,
    zones,
    forceUpdate,
    handleZoneDragFinish,
    disableToolingInteraction,
    selectedXRange,
  ]);

  return <div />;
};
