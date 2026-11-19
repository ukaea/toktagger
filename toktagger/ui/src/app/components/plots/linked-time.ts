"use client";
import { PlotlyHTMLElement, PlotRelayoutEvent, relayout } from "plotly.js";
import { useCallback, useEffect, useRef } from "react";
import { TimeWindow, useWorkspace } from "@/app/contexts/WorkspaceContext";

/** The new x range of a relayout event: a range, null for autorange, or undefined if x did not change. */
export function xRangeFromRelayout(
  eventData: PlotRelayoutEvent,
): TimeWindow | null | undefined {
  if ("xaxis.range[0]" in eventData && "xaxis.range[1]" in eventData) {
    return [
      eventData["xaxis.range[0]"] as number,
      eventData["xaxis.range[1]"] as number,
    ];
  }
  if (eventData["xaxis.range"]?.length === 2) {
    return [
      eventData["xaxis.range"][0] as number,
      eventData["xaxis.range"][1] as number,
    ];
  }
  if (eventData["xaxis.autorange"]) return null;
  return undefined;
}

const sameWindow = (first: TimeWindow | null, second: TimeWindow | null) =>
  first === second ||
  (first !== null &&
    second !== null &&
    first[0] === second[0] &&
    first[1] === second[1]);

/**
 * Keeps the time axis of a plot in step with the workspace time window.
 * Returns the function that publishes a range the user picked on this plot.
 */
export function useLinkedTimeAxis(
  plotId: string,
  plotReady: boolean,
  enabled: boolean,
) {
  const { linkTime, panelIds, timeWindow, setTimeWindow } = useWorkspace();
  const isLinked = enabled && linkTime && panelIds.length > 1;
  const shownWindowRef = useRef<TimeWindow | null | undefined>(undefined);
  const applyingRef = useRef(false);

  useEffect(() => {
    // A re-render can replace the axis range, so apply the window again once the plot is ready.
    if (!plotReady) shownWindowRef.current = undefined;
    if (!isLinked || !plotReady) return;
    if (
      shownWindowRef.current !== undefined &&
      sameWindow(shownWindowRef.current, timeWindow)
    ) {
      return;
    }
    const plot = document.getElementById(plotId) as PlotlyHTMLElement | null;
    if (!plot) return;
    const isFirstDraw = shownWindowRef.current === undefined;
    shownWindowRef.current = timeWindow;
    // With no shared window yet, the plot keeps the initial range of its layout.
    if (timeWindow === null && isFirstDraw) return;
    applyingRef.current = true;
    relayout(
      plot,
      timeWindow ? { "xaxis.range": timeWindow } : { "xaxis.autorange": true },
    ).finally(() => {
      applyingRef.current = false;
    });
  }, [isLinked, plotReady, plotId, timeWindow]);

  return useCallback(
    (range: TimeWindow | null) => {
      if (!isLinked || applyingRef.current) return;
      if (sameWindow(shownWindowRef.current ?? null, range)) return;
      shownWindowRef.current = range;
      setTimeWindow(range);
    },
    [isLinked, setTimeWindow],
  );
}
