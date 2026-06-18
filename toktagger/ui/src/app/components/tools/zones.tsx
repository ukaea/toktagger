import { useEffect, useRef } from "react";
import { useContextMenu } from "react-contexify";

import * as d3 from "d3";
import { useZoneContext, ZONE_MENU_ID } from "../providers/zone-provider";
import { useContextMenuProvider } from "../providers/annotation-provider";
import { ToolingProps } from "@/types";
import type { Zone } from "@/types";

/**
 * Handles the rendering of Zones onto a specific plot
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
  const dragStartXRef = useRef<number | null>(null);

  const { show: showZoneMenu } = useContextMenu({ id: ZONE_MENU_ID });
  const { disableToolingInteraction } = useContextMenuProvider();

  const { zones, handleZoneUpdate, handleZoneDragFinish, triggerUpdate } =
    useZoneContext();

  useEffect(() => {
    if (!plotId || !plotReady || forceUpdate === undefined) {
      return;
    }

    const plot = document.getElementById(plotId);
    if (!plot) {
      console.error("Could not locate plot to generate zones");
      return;
    }

    const subplots = plot.querySelectorAll(".subplot");
    const subplotNames = [...subplots].map((el) =>
      [...el.classList].find((cls) => cls !== "subplot"),
    );

    subplotNames.forEach((subplotId) => {
      if (subplotId === undefined) {
        console.error("Could not find valid subplot ID");
        return;
      }

      const overplot = document.getElementsByClassName(
        `${plotId}-overplot-${subplotId}`,
      )[0];

      if (!overplot) {
        console.warn("Could not find overplot for zone rendering");
        setTimeout(() => {
          handleZoneUpdate();
        }, 100);
        return;
      }

      const yAxisID = subplotId.match(/y(.*)$/)?.[1];
      if (!yAxisID && yAxisID !== "") {
        console.error("Could not find valid subplot y-axis ID");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axis = (plot as any)._fullLayout[`yaxis${yAxisID}`];
      const range = axis._tmax - axis._tmin;
      const upperLimit = axis.d2p(axis._tmax + 2 * range);
      const lowerLimit = axis.d2p(axis._tmin - 2 * range);
      const height = lowerLimit - upperLimit;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xaxis = (plot as any)._fullLayout.xaxis;

      const graphGroup = d3.select(overplot);
      graphGroup.selectAll(".zone").remove();

      // Drag handler for moving the whole zone body
      const dragBody = d3
        .drag<SVGRectElement, Zone>()
        .on("start", function (event) {
          dragStartXRef.current = xaxis.p2d(event.x);
        })
        .on("drag", function (event, d) {
          const currentX = xaxis.p2d(event.x);
          const dx = currentX - (dragStartXRef.current ?? currentX);
          dragStartXRef.current = currentX;
          d.x0 += dx;
          d.x1 += dx;
          handleZoneUpdate();
        })
        .on("end", function () {
          handleZoneDragFinish();
        });

      // Drag handler for resizing the left edge
      const dragLeft = d3
        .drag<SVGRectElement, Zone>()
        .on("drag", function (event, d) {
          d.x0 = xaxis.p2d(event.x);
          handleZoneUpdate();
        })
        .on("end", function () {
          handleZoneDragFinish();
        });

      // Drag handler for resizing the right edge
      const dragRight = d3
        .drag<SVGRectElement, Zone>()
        .on("drag", function (event, d) {
          d.x1 = xaxis.p2d(event.x);
          handleZoneUpdate();
        })
        .on("end", function () {
          handleZoneDragFinish();
        });

      function handleContextMenu(event: MouseEvent, zone: Zone) {
        event.preventDefault();
        const isRightClickEvent = event.button === 2 && !event.ctrlKey;
        if (isRightClickEvent) {
          showZoneMenu({ event, props: { zone } });
        }
      }

      for (const zone of zones) {
        let opacity = 0.25;

        if (
          selectedXRange &&
          zone.x0 < selectedXRange[1] &&
          zone.x1 > selectedXRange[0]
        ) {
          zone.selected = true;
          opacity = 0.45;
        } else {
          zone.selected = false;
        }

        const x0px = xaxis.d2p(zone.x0);
        const x1px = xaxis.d2p(zone.x1);
        const leftPx = Math.min(x0px, x1px);
        const width = Math.abs(x1px - x0px);
        const pointerEvent = disableToolingInteraction ? "none" : "all";
        const color = zone.category.color;

        // Main draggable body
        graphGroup
          .append("rect")
          .attr("class", "zone disable-on-modifier")
          .attr("x", leftPx)
          .attr("y", upperLimit)
          .attr("width", width)
          .attr("height", height)
          .attr("fill", color)
          .attr("opacity", opacity)
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "move")
          .datum(zone)
          .call(dragBody)
          .on("contextmenu", handleContextMenu);

        // Left resize handle
        graphGroup
          .append("rect")
          .attr("class", "zone disable-on-modifier")
          .attr("x", leftPx - 4)
          .attr("y", upperLimit)
          .attr("width", 8)
          .attr("height", height)
          .attr("fill", color)
          .attr("opacity", opacity + 0.2)
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "ew-resize")
          .datum(zone)
          .call(x0px <= x1px ? dragLeft : dragRight)
          .on("contextmenu", handleContextMenu);

        // Right resize handle
        graphGroup
          .append("rect")
          .attr("class", "zone disable-on-modifier")
          .attr("x", leftPx + width - 4)
          .attr("y", upperLimit)
          .attr("width", 8)
          .attr("height", height)
          .attr("fill", color)
          .attr("opacity", opacity + 0.2)
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "ew-resize")
          .datum(zone)
          .call(x0px <= x1px ? dragRight : dragLeft)
          .on("contextmenu", handleContextMenu);
      }
    });
  }, [
    handleZoneUpdate,
    handleZoneDragFinish,
    plotId,
    plotReady,
    showZoneMenu,
    zones,
    triggerUpdate,
    forceUpdate,
    disableToolingInteraction,
    selectedXRange,
  ]);

  return <div />;
};
