import { GridPlacement, Panel } from "@/types";

/** The number of grid columns and rows that the panels of one tab need. */
export function gridSize(panels: Panel[]): { columns: number; rows: number } {
  return {
    columns: Math.max(
      ...panels.map((panel) => panel.grid.col + panel.grid.col_span - 1),
    ),
    rows: Math.max(
      ...panels.map((panel) => panel.grid.row + panel.grid.row_span - 1),
    ),
  };
}

/** The CSS grid template of a tab with the given panels. */
export function gridTemplate(panels: Panel[]) {
  const { columns, rows } = gridSize(panels);
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}

/** The CSS grid position of one panel. */
export function gridArea(grid: GridPlacement) {
  return {
    gridColumn: `${grid.col} / span ${grid.col_span}`,
    gridRow: `${grid.row} / span ${grid.row_span}`,
  };
}
