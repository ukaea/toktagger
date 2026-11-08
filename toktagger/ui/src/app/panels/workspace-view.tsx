"use client";
import { Panel } from "@/types";
import { PanelCell } from "./panel-frame";

/** Lays out the panels of a multi-panel project on a grid that fills the window. */
export function WorkspaceView({ panels }: { panels: Panel[] }) {
  const columns = Math.max(
    ...panels.map((panel) => panel.grid.col + panel.grid.col_span - 1),
  );
  const rows = Math.max(
    ...panels.map((panel) => panel.grid.row + panel.grid.row_span - 1),
  );

  return (
    <div
      data-testid="workspace"
      style={{
        display: "grid",
        flex: 1,
        minWidth: 0,
        height: "95vh",
        gap: "var(--spectrum-global-dimension-size-100)",
        padding: "var(--spectrum-global-dimension-size-100)",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {panels.map((panel) => (
        <PanelCell key={panel.id} panel={panel} />
      ))}
    </div>
  );
}
