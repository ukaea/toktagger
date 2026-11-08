"use client";
import { useState } from "react";
import { Item, TabList, Tabs } from "@adobe/react-spectrum";
import { LayoutTab, Panel } from "@/types";
import { useWorkspace } from "@/app/contexts/WorkspaceContext";
import { gridTemplate } from "./grid";
import { PanelCell } from "./panel-frame";

// Fills the window under the breadcrumbs; the annotations table sits below the fold.
const GRID_HEIGHT = "max(calc(100vh - 48px), 640px)";
const TABBED_GRID_HEIGHT = "max(calc(100vh - 112px), 600px)";

function PanelGrid({ panels, height }: { panels: Panel[]; height: string }) {
  return (
    <div
      style={{
        display: "grid",
        minWidth: 0,
        height,
        gap: "var(--spectrum-global-dimension-size-100)",
        padding: "var(--spectrum-global-dimension-size-100)",
        ...gridTemplate(panels),
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
  const [openedTabs, setOpenedTabs] = useState<string[]>([activeTab]);
  if (!openedTabs.includes(activeTab)) {
    setOpenedTabs([...openedTabs, activeTab]);
  }

  if (tabs.length === 1) {
    return (
      <div data-testid="workspace">
        <PanelGrid panels={tabs[0].panels} height={GRID_HEIGHT} />
      </div>
    );
  }

  return (
    <>
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
      </Tabs>
      {/* Opened tabs stay mounted and keep their size, so switching back does not rebuild the plots. */}
      <div data-testid="workspace" style={{ display: "grid" }}>
        {tabs
          .filter((tab) => openedTabs.includes(tab.title))
          .map((tab) => (
            <div
              key={tab.title}
              role="tabpanel"
              aria-label={tab.title}
              inert={tab.title !== activeTab}
              style={{
                gridArea: "1 / 1",
                minWidth: 0,
                visibility: tab.title === activeTab ? "visible" : "hidden",
              }}
            >
              <PanelGrid panels={tab.panels} height={TABBED_GRID_HEIGHT} />
            </div>
          ))}
      </div>
    </>
  );
}
