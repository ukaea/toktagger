"use client";

import { useContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { useSample } from "@/app/contexts/SampleContext";
import { arrayMax, arrayMin } from "@/app/utils";
import {
  Annotation,
  BoundingBox,
  BoundingBoxSchema,
  Polygon,
  PolygonAnnotation,
  PolygonAnnotationSchema,
  PolygonSchema,
} from "@/types";
import Plotly, {
  Config,
  Layout,
  PlotData,
  relayout,
  react,
  PlotRelayoutEvent,
} from "plotly.js-dist-min";
import React, { useEffect, useRef, useState } from "react";

type InjectedProps = {
  plotId: string;
  plotReady: boolean;
  forceUpdate: number;
  selectedXRange: [number, number] | null;
};

interface PlotConfiguration {
  data: Partial<PlotData>[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
}

type TimeSeriesPlotProps = {
  plotId?: string;
  plotConfig: PlotConfiguration;
  rescaleOnZoom?: boolean;
  children:
    | React.ReactElement<InjectedProps>
    | React.ReactElement<InjectedProps>[];
};

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
      modeBarButtons: [
        [
          "toImage",
          "zoom2d",
          "select2d",
          "pan2d",
          "autoScale2d",
          "resetScale2d",
        ],
      ],
      dragmode: "pan",
      displaylogo: false,
      displayModeBar: true,
      scrollZoom: true,
      responsive: true,
    },
  },
  rescaleOnZoom = true,
  children,
}: TimeSeriesPlotProps) => {
  const { setAnnotations } = useSample();
  const [selectedXRange, setSelectedXRange] = useState<[number, number] | null>(
    null
  );
  const [updateTools, setUpdateTools] = useState(0);
  const [plotReady, setPlotReady] = useState(false);
  const isDraggingRef = useRef(false);
  const plotId = externalId || "time-series"; // Facilitate an external or default ID

  const {
    show: showContextMenu,
    toolingCallbacks,
    disableToolingInteraction,
  } = useContextMenuProvider();
  const showContextMenuRef = useRef(showContextMenu);

  const allowRelayout = useRef(true);

  const triggerToolUpdate = () => {
    setUpdateTools((current) => (current + 1) % 100);
  };
  // Main plotly rendering
  useEffect(() => {
    const overplots: string[] = [];

    const renderZones = (plot: Plotly.PlotlyHTMLElement) => {
      // Get all subplot elements and extract the subplot name (xy for example) from the class list
      const subplots = plot.querySelectorAll(".subplot");
      const subplotNames = [...subplots].map((el) =>
        [...el.classList].find((cls) => cls !== "subplot")
      );

      // For each subplot identified generate a D3 overplot with the subplot name appended so that tooling can reference it
      subplotNames.forEach((coordinateSystem) => {
        const subplot = plot
          .querySelector(`.subplot.${coordinateSystem}`)
          ?.querySelector(".overplot")
          ?.querySelector(`.${coordinateSystem}`) as HTMLElement;
        if (!subplot) {
          console.error("Cannot locate plotly subplot");
          return;
        }

        if (!subplot.querySelector(`.${plotId}-overplot-${coordinateSystem}`)) {
          // ensure only one custom overlay group is present
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g"
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

    // Sets the y axis range required for the current x range for each subplot
    const rescale = (x0?: number, x1?: number) => {
      const plot = document.getElementById(plotId) as Plotly.PlotlyHTMLElement;
      if (!plot) {
        return;
      }

      if (!allowRelayout.current) return; // Prevents relayout triggering itself

      if (data.length === 0) {
        return;
      }
      allowRelayout.current = false;

      // If no x range is passed, then the min/max is used
      if (!x0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        x0 = (plot as any)._fullData[0]._extremes.x.min[0].val as number;
      }
      if (!x1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        x1 = (plot as any)._fullData[0]._extremes.x.max[0].val as number;
      }

      let configUpdate = {};

      // Ensure each data set is handled (ensures all subplots are zoomed correctly)
      data.forEach((dataSet) => {
        let yAxisID = "";

        if (dataSet.yaxis) {
          // Find the y axis ID relating to this subplot
          const locatedID = dataSet.yaxis.match(/y(.*)$/)?.[1];
          if (locatedID) {
            yAxisID = locatedID;
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
          const yMin = arrayMin(yValues);
          const yMax = arrayMax(yValues);
          const offset = 0.1 * (yMax - yMin); // 10 % offset

          configUpdate = {
            ...configUpdate,
            [`yaxis${yAxisID}.range`]: [yMin - offset, yMax + offset],
          };
        }
      });

      relayout(plot, configUpdate);

      // Debounce the relayout calls
      setTimeout(() => {
        allowRelayout.current = true;
      }, 100);
    };

    const relayoutHandler = (eventData: PlotRelayoutEvent) => {
      if ("shapes" in eventData) {
        // shapes have been modified - update annotations
        const shapes = eventData.shapes as Plotly.Shape[];
        const newAnnotations: Annotation[] = [];

        shapes.forEach((shape) => {
          if (shape.type === "rect") {
            const boundingBox: BoundingBox = BoundingBoxSchema.parse({
              x0: shape.x0 as number,
              y0: shape.y0 as number,
              x1: shape.x1 as number,
              y1: shape.y1 as number,
              label: "Unknown",
              created_by: "manual",
              type: "bounding_box",
            });

            newAnnotations.push(boundingBox);
          } else if (
            shape.type === "path" &&
            shape.path // ensure path exists
          ) {
            // extract points from path string
            const pathCommands = shape.path.match(/[ML][^MLZ]+/g); // match 'M x y' or 'L x y'
            if (pathCommands) {
              const xPoints: number[] = [];
              const yPoints: number[] = [];
              pathCommands.forEach((command) => {
                const coords = command
                  .slice(1)
                  .trim()
                  .split(",")
                  .map((coord) => parseFloat(coord));
                if (coords.length === 2) {
                  xPoints.push(coords[0]);
                  yPoints.push(coords[1]);
                }
              });

              if (xPoints.length > 0 && yPoints.length > 0) {
                const polygon: PolygonAnnotation =
                  PolygonAnnotationSchema.parse({
                    segmentation: [xPoints.flatMap((x, i) => [x, yPoints[i]])],
                    area: 0, // area can be computed server-side if needed
                    bbox: [
                      Math.min(...xPoints),
                      Math.min(...yPoints),
                      Math.max(...xPoints) - Math.min(...xPoints),
                      Math.max(...yPoints) - Math.min(...yPoints),
                    ],
                    label: "Unknown",
                    created_by: "manual",
                    type: "polygon",
                  });
                console.log("Extracted polygon:", polygon);
                newAnnotations.push(polygon);
              }
            }
          }
        });

        // Update annotations with new polygons
        setAnnotations((previousAnnotations: Annotation[]) => {
          const otherAnnotations = previousAnnotations.filter(
            (annotation: Annotation) =>
              annotation.type !== "polygon" &&
              annotation.type !== "bounding_box"
          );
          return otherAnnotations.concat(newAnnotations);
        });
      }

      if (rescaleOnZoom) {
        // This makes use of the first graph displayed but this should be fine
        if ("xaxis.range[0]" in eventData && "xaxis.range[1]" in eventData) {
          // for zoom and pan events
          rescale(eventData["xaxis.range[0]"], eventData["xaxis.range[1]"]);
        } else if ("xaxis.range" in eventData) {
          // for range slider events
          rescale(eventData["xaxis.range"][0], eventData["xaxis.range"][1]);
        } else {
          rescale(); // for initial load & autoscale
        }
      }
      triggerToolUpdate();
    };

    const plot = document.getElementById(plotId) as Plotly.PlotlyHTMLElement;

    if (!plot) {
      return;
    }

    const initGraph = async () => {
      react(plot, data, layout, config).then(renderZones);

      plot.removeAllListeners("plotly_relayout"); // remove any existing listeners
      plot.removeAllListeners("plotly_doubleclick");
      plot.removeAllListeners("plotly_selected");
      plot.removeAllListeners("plotly_deselect");
      plot.on("plotly_relayout", relayoutHandler); // attach listener so it can be removed
      plot.on("plotly_doubleclick", rescale);

      // attach listener for selection events
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plot.on("plotly_selected", function (eventData: any) {
        if (eventData && eventData.range) {
          setSelectedXRange(eventData.range.x);
        }

        if (eventData && eventData.lassoPoints) {
          const polygon: Polygon = PolygonSchema.parse({
            x: eventData.lassoPoints.x,
            y: eventData.lassoPoints.y,
          });
        }
      });
      plot.on("plotly_deselect", function () {
        setSelectedXRange(null);
        relayout(plot, { selections: [] }); // clear selection
      });
    };

    initGraph();

    if (!disableToolingInteraction) {
      plot.style.pointerEvents = "auto";
    } else {
      plot.style.pointerEvents = "none";
    }

    return () => {
      // cleanup on unmount / Fast-Refresh
      overplots.forEach((overplot) => {
        plot?.querySelector(`.${overplot}`)?.remove(); // remove custom overlay group
      });
      setPlotReady(false); // reset ready state
    };
  }, [
    plotId,
    config,
    data,
    layout,
    plotReady,
    allowRelayout,
    disableToolingInteraction,
    rescaleOnZoom,
  ]);

  useEffect(() => {
    const plot = document.getElementById(plotId) as Plotly.PlotlyHTMLElement;
    if (!plot) {
      return;
    }
    if (allowRelayout.current) {
      relayout(plot, { selections: [] }); // clear selection
      setSelectedXRange(null);
    }
  }, [config, plotId]);

  // Handles context menu creation
  useEffect(() => {
    if (!plotReady) {
      // Plot may not have loaded yet - this will rerun after loading
      return;
    }

    const plot = document.getElementById(plotId);

    if (!plot) {
      console.error("Could not locate plot to assign context menu");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getClickData(event: MouseEvent, plot: any): [number, number] {
      const xaxis = plot._fullLayout.xaxis; // x-axis descriptor
      const yaxis = plot._fullLayout.yaxis; // y-axis descriptor

      const bb = (event.target as HTMLElement).getBoundingClientRect();
      const relX = event.clientX - bb.left; // click X in pixels, relative to plot
      const relY = event.clientY - bb.top; // click Y in pixels, relative to plot

      // Coordinates in data space
      const x = xaxis.p2d(relX); // data-space X at click
      const y = yaxis.p2d(relY); // data-space Y at click

      return [x, y];
    }

    /* 
        Context-menu dispatcher

            Converts the mouse click (pixel-space) to data-space coordinates (x, y) using Plotly’s axis converters.

            Derives the current axis ranges (xRange, yRange) so tools can size new elements as a fraction of the view, independent of zoom level.
    
            information delivered to the menu is  { x, y, xScale, yScale, xRange, yRange, xLimits: [xMin, xMax], yLimits: [yMin, yMax] }

            The dispatcher now auto-detects which subplot was clicked (via the element data-subplot attribute or nearest .subplot group) and 
            picks the matching xaxisN / yaxisN, so the props are correct for any subplot.
        */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleContextMenu(event: MouseEvent, plot: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let xaxis: any; // will be assigned to the subplot-specific or primary x-axis below
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let yaxis: any; // will be assigned to the subplot-specific or primary y-axis below

      const bb = (event.target as HTMLElement).getBoundingClientRect();
      const relX = event.clientX - bb.left; // click X in pixels, relative to plot
      const relY = event.clientY - bb.top; // click Y in pixels, relative to plot

      /* 
            determine local axes for the subplot clicked
            Prefer the data-subplot attribute available on drag layers;
            */
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

      // compute full data range spans from axis.range
      const [xMin, xMax] = xaxis.range as [number, number]; // data-space limits on x
      const [yMin, yMax] = yaxis.range as [number, number]; // data-space limits on y
      const xRange = xMax - xMin; // total span on x axis
      const yRange = yMax - yMin; // total span on y axis

      showContextMenuRef.current({
        event,
        props: {
          // new generic props
          x,
          y, // generic data-space click position
          xRange,
          yRange, // current axis spans
          xLimits: [xMin, xMax],
          yLimits: [yMin, yMax], // explicit axis limits
        },
      });
    }

    const dragElements = plot.querySelectorAll<HTMLDivElement>(".drag");

    if (dragElements.length === 0) {
      console.error("Could not locate drag element to assign context menu");
      return;
    }

    const contextHandler = (event: MouseEvent) => {
      //  wrap handler so we can remove it
      event.preventDefault(); // Prevent default context menu
      const isRightClickEvent = event.button === 2 && !event.ctrlKey;
      if (isRightClickEvent) {
        handleContextMenu(event, plot);
      }
    };

    const startToolCreation = (event: MouseEvent) => {
      if (toolingCallbacks && event.ctrlKey) {
        isDraggingRef.current = true;
        const [x, y] = getClickData(event, plot);
        toolingCallbacks.start(x, y);
      }
    };

    // This is a backup listener in case the user lifts the control key first - this isn't ideal as a final update won't be sent
    const cancelToolCreation = (event: KeyboardEvent) => {
      if (event.key === "Alt" && toolingCallbacks && isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };

    const finishToolCreation = (event: MouseEvent) => {
      if (toolingCallbacks && isDraggingRef.current) {
        isDraggingRef.current = false;
        const [x, y] = getClickData(event, plot);
        toolingCallbacks.end(x, y);
      }
    };

    const updateTool = (event: MouseEvent) => {
      if (toolingCallbacks && isDraggingRef.current) {
        const [x, y] = getClickData(event, plot);
        toolingCallbacks.move(x, y);
      }
    };

    dragElements.forEach((dragElement) => {
      dragElement.addEventListener("contextmenu", contextHandler); // add context-menu listener
      dragElement.addEventListener("mousedown", startToolCreation);
      dragElement.addEventListener("mouseup", finishToolCreation);
      dragElement.addEventListener("mousemove", updateTool);
    });

    document.addEventListener("keyup", cancelToolCreation);

    return () => {
      // remove listener on effect cleanup
      dragElements.forEach((dragElement) => {
        dragElement.removeEventListener("contextmenu", contextHandler);
        dragElement.removeEventListener("mousedown", startToolCreation);
        dragElement.removeEventListener("mouseup", finishToolCreation);
        dragElement.removeEventListener("mousemove", updateTool);
      });
      document.removeEventListener("keyup", cancelToolCreation);
    };
  }, [plotId, plotReady, toolingCallbacks, updateTools]);

  return (
    <div className="px-6 py-3 space-y-3 flex-col">
      {/* Div where plot is inserted */}
      <div id={plotId} className="" />
      <>
        {React.Children.map(children, (child) => {
          return React.isValidElement(child)
            ? React.cloneElement(child, {
                plotId,
                plotReady,
                forceUpdate: updateTools,
                selectedXRange: selectedXRange,
              })
            : child;
        })}
      </>
    </div>
  );
};
