"use client";
import { createContext, useContext } from "react";

// The height a view may fill; null outside a grid cell, where views size to the window.
export const PanelHeightContext = createContext<number | null>(null);

/** The height that a view should size its figures from. */
export function useViewportHeight(): number {
  const panelHeight = useContext(PanelHeightContext);
  return panelHeight ?? window.innerHeight;
}

/** The height of a view's main figure: the full grid cell, or a fraction of the window. */
export function useFigureHeight(windowFraction: number): number {
  const panelHeight = useContext(PanelHeightContext);
  // A few pixels short of the cell, so rounding never adds a scrollbar.
  return panelHeight === null
    ? window.innerHeight * windowFraction
    : panelHeight - 4;
}

/** The height of the enclosing grid cell, or null when the view fills the window. */
export function usePanelHeight(): number | null {
  return useContext(PanelHeightContext);
}
