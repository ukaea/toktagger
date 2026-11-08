"use client";
import { Flex, Item, TabList, Tabs, Text, View } from "@adobe/react-spectrum";
import { useState } from "react";
import { LayoutTab, Panel, PanelKind } from "@/types";
import { gridArea, gridTemplate } from "@/app/panels/grid";
import { LayoutConfig, PANEL_KINDS } from "./layout_yaml";

const KIND_COLORS: Record<PanelKind, string> = {
  time_series: "blue",
  profile_2d: "purple",
  radial_profile: "seafoam",
  video: "orange",
};

const kindName = (kind: PanelKind) =>
  PANEL_KINDS.find((item) => item.key === kind)?.name ?? kind;

/** The ids of the panels in a tab that share at least one grid cell with another panel. */
function overlappingPanels(panels: Panel[]): string[] {
  const owners = new Map<string, string>();
  const overlapping = new Set<string>();
  for (const panel of panels) {
    const { col, row, col_span, row_span } = panel.grid;
    for (let column = col; column < col + col_span; column++) {
      for (let line = row; line < row + row_span; line++) {
        const cell = `${column},${line}`;
        const owner = owners.get(cell);
        if (owner && owner !== panel.id) {
          overlapping.add(owner);
          overlapping.add(panel.id);
        } else {
          owners.set(cell, panel.id);
        }
      }
    }
  }
  return panels.map((panel) => panel.id).filter((id) => overlapping.has(id));
}

function PreviewBox({
  panel,
  dataLoader,
  overlapIndex,
}: {
  panel: Panel;
  dataLoader: string;
  overlapIndex: number;
}) {
  const color = KIND_COLORS[panel.kind];
  const overlaps = overlapIndex >= 0;
  // Every second overlapping label goes to the far corner, so stacked labels stay readable.
  const farCorner = overlapIndex % 2 === 1;
  return (
    <div
      role="group"
      aria-label={`Preview ${panel.id}`}
      data-overlap={overlaps}
      style={{
        ...gridArea(panel.grid),
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: farCorner ? "flex-end" : "flex-start",
        alignItems: farCorner ? "flex-end" : "flex-start",
        padding: "var(--spectrum-global-dimension-size-75)",
        borderRadius: "var(--spectrum-alias-border-radius-regular)",
        border: overlaps
          ? "2px dashed var(--spectrum-semantic-negative-color-border)"
          : `1px solid var(--spectrum-global-color-${color}-500)`,
        background: `color-mix(in srgb, var(--spectrum-global-color-${color}-400) 18%, transparent)`,
      }}
    >
      <Flex direction="column">
        <Text UNSAFE_style={{ fontWeight: "bold", fontSize: "0.8rem" }}>
          {panel.title || panel.id}
        </Text>
        <Text UNSAFE_style={{ fontSize: "0.7rem" }}>
          {kindName(panel.kind)}
        </Text>
        <Text UNSAFE_style={{ fontSize: "0.7rem" }}>
          Data loader: {dataLoader} (source {panel.source})
        </Text>
      </Flex>
    </div>
  );
}

function TabGrid({
  tab,
  dataLoaders,
}: {
  tab: LayoutTab;
  dataLoaders: Map<string, string>;
}) {
  const overlapping = overlappingPanels(tab.panels);
  return (
    <div
      role="tabpanel"
      aria-label={`Preview of tab ${tab.title}`}
      style={{
        display: "grid",
        height: "var(--spectrum-global-dimension-size-3600)",
        gap: "var(--spectrum-global-dimension-size-50)",
        padding: "var(--spectrum-global-dimension-size-50)",
        border: "1px solid var(--spectrum-global-color-gray-300)",
        borderRadius: "var(--spectrum-alias-border-radius-medium)",
        background: "var(--spectrum-global-color-gray-75)",
        ...gridTemplate(tab.panels),
      }}
    >
      {tab.panels.map((panel) => (
        <PreviewBox
          key={panel.id}
          panel={panel}
          dataLoader={dataLoaders.get(panel.source) ?? "unknown"}
          overlapIndex={overlapping.indexOf(panel.id)}
        />
      ))}
    </div>
  );
}

/** A schematic of the sample page: a tab bar like the page has, and the grid position of each panel. */
export function LayoutPreview({ config }: { config: LayoutConfig | null }) {
  const tabs = config?.layout.tabs ?? [];
  const [selectedTitle, setSelectedTitle] = useState("");
  const selected =
    tabs.find((tab) => tab.title === selectedTitle) ?? tabs[0] ?? null;
  const dataLoaders = new Map(
    (config?.sources ?? []).map((source) => [source.name, source.data_loader]),
  );
  const warnings = tabs.flatMap((tab) => {
    const overlapping = overlappingPanels(tab.panels);
    return overlapping.length > 0
      ? [`Panels ${overlapping.join(", ")} overlap on tab ${tab.title}.`]
      : [];
  });

  return (
    <View data-testid="layout-preview" aria-label="Layout preview">
      <Flex direction="column" gap="size-100">
        <Text UNSAFE_style={{ fontWeight: "bold" }}>UI Preview</Text>
        {!selected && <Text>Write a valid layout to see a preview.</Text>}
        {tabs.length > 1 && selected && (
          <Tabs
            aria-label="Preview tabs"
            density="compact"
            selectedKey={selected.title}
            onSelectionChange={(key) => setSelectedTitle(String(key))}
          >
            <TabList>
              {tabs.map((tab) => (
                <Item key={tab.title}>{tab.title}</Item>
              ))}
            </TabList>
          </Tabs>
        )}
        {selected && <TabGrid tab={selected} dataLoaders={dataLoaders} />}
        {warnings.map((warning) => (
          <Text
            key={warning}
            UNSAFE_style={{
              color: "var(--spectrum-semantic-negative-color-text-small)",
              fontSize: "0.8rem",
            }}
          >
            {warning}
          </Text>
        ))}
      </Flex>
    </View>
  );
}
