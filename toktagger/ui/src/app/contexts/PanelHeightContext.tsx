"use client";
import { createContext, useContext } from "react";

// The height a view may fill; null outside a grid cell, where views size to the window.
export const PanelHeightContext = createContext<number | null>(null);

/** The height that a view should size its figures from. */
export function useViewportHeight(): number {
  const panelHeight = useContext(PanelHeightContext);
  return panelHeight ?? window.innerHeight;
}
