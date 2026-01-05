import { useEffect, useRef } from "react";
import { useContextMenu } from "react-contexify";

import * as d3 from "d3";
import { useVSpanContext, VSPAN_MENU_ID } from "../providers/vpsan-provider";
import { ToolingProps, VSpan } from "@/types";
import { useContextMenuProvider } from "../providers/annotation-provider";

/**
 * Handles the rendering of VSpans onto a specific plot
 *
 * @param plotId Used to identify the plot that the tooling should be rendered on
 * @param plotReady Signal from main plot that tooling can be drawn
 */
export const VSpans = ({ plotId, plotReady, forceUpdate }: ToolingProps) => {
  const dragOffset = useRef(0);

  // Hook to trigger the context provider to render context menu
  const { show: showVSpanMenu } = useContextMenu({
    id: VSPAN_MENU_ID,
  });
  const { disableToolingInteraction } = useContextMenuProvider();

  // Hook to pull in data from context provider
  const { vspans, handleVSpanUpdate, handleVSpanDragFinish, triggerUpdate } =
    useVSpanContext();

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
        console.error("Could not locate D3 overplot to generate zones");
        handleVSpanUpdate();
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
      graphGroup.selectAll(".vspan").remove(); // All VSpans are removed each render cycle

      const drag = d3
        .drag<SVGRectElement, VSpan>()
        .on("start", function (event, d) {
          dragOffset.current = xaxis.d2p(d.x) - event.x;
        })
        .on("drag", function (event, d) {
          const newX = event.x + dragOffset.current;
          d3.select(this).attr("x", newX);

          const x = xaxis.p2d(newX); // The context provider stores the decimal value rather than pixel
          d.x = x;
          handleVSpanUpdate(); // Global refresh must be triggered to update all linked plots
        })
        .on("end", function (_event, _d) {
          handleVSpanDragFinish();
        });

      function handleContextMenu(event: MouseEvent, vspan: VSpan) {
        event.preventDefault(); // Prevent default context menu
        const isRightClickEvent = event.button === 2 && !event.ctrlKey;
        if (isRightClickEvent) {
          showVSpanMenu({
            event,
            props: {
              vspan,
            },
          });
        }
      }

      // Create a line and a transparent drag handle for each VSpan
      for (const vspan of vspans) {
        const x = xaxis.d2p(vspan.x);
        const pointerEvent = disableToolingInteraction ? "none" : "all";
        graphGroup
          .append("line")
          .attr("class", "vspan disable-on-modifier")
          .attr("x1", x)
          .attr("x2", x)
          .attr("y1", upperLimit)
          .attr("y2", upperLimit + height)
          .attr("stroke", vspan.category.color)
          .attr("stroke-width", 6)
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "move");

        graphGroup
          .append("rect")
          .attr('aria-label', 'vspan')
          .attr("class", "vspan disable-on-modifier")
          .attr("x", x - 10)
          .attr("y", upperLimit)
          .attr("width", 20)
          .attr("height", height)
          .attr("fill", "transparent")
          .attr("style", `pointer-events: ${pointerEvent}`)
          .style("cursor", "move")
          .datum(vspan)
          .call(drag)
          .on("contextmenu", handleContextMenu);
      }
    });
  }, [
    handleVSpanUpdate,
    handleVSpanDragFinish,
    plotId,
    plotReady,
    showVSpanMenu,
    vspans,
    triggerUpdate,
    forceUpdate,
    disableToolingInteraction,
  ]);

  return <div />;
};
