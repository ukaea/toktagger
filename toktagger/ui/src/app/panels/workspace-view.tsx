"use client";
import { Item, TabList, TabPanels, Tabs } from "@adobe/react-spectrum";
import { LayoutTab, Panel } from "@/types";
import { useWorkspace } from "@/app/contexts/WorkspaceContext";
import { PanelCell } from "./panel-frame";

// Fills the window under the breadcrumbs; the annotations table sits below the fold.
const GRID_HEIGHT = "max(calc(100vh - 48px), 640px)";
const TABBED_GRID_HEIGHT = "max(calc(100vh - 112px), 600px)";

function PanelGrid({ panels, height }: { panels: Panel[]; height: string }) {
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
        minWidth: 0,
        height,
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

/** Lays out the tabs of a multi-panel project; each tab shows its panels on a grid that fills the window. */
export function WorkspaceView({ tabs }: { tabs: LayoutTab[] }) {
  const { activeTab, setActiveTab } = useWorkspace();

  if (tabs.length === 1) {
    return <PanelGrid panels={tabs[0].panels} height={GRID_HEIGHT} />;
  }

  return (
    <Tabs
      aria-label="Workspace tabs"
      items={tabs}
      selectedKey={activeTab}
      onSelectionChange={(key) => setActiveTab(String(key))}
      minWidth={0}
    >
      <TabList marginX="size-100">
        {(tab: LayoutTab) => <Item key={tab.title}>{tab.title}</Item>}
      </TabList>
      <TabPanels>
        {(tab: LayoutTab) => (
          <Item key={tab.title}>
            <PanelGrid panels={tab.panels} height={TABBED_GRID_HEIGHT} />
          </Item>
        )}
      </TabPanels>
    </Tabs>
  );
}
