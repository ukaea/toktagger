"use client";
import {
  ActionButton,
  Checkbox,
  FileTrigger,
  Flex,
  Item,
  NumberField,
  Picker,
  TabList,
  TabPanels,
  Tabs,
  Text,
  TextArea,
  TextField,
  View,
} from "@adobe/react-spectrum";
import Add from "@spectrum-icons/workflow/Add";
import Delete from "@spectrum-icons/workflow/Delete";
import Download from "@spectrum-icons/workflow/Download";
import FileAdd from "@spectrum-icons/workflow/FileAdd";
import { useState } from "react";
import {
  DataSource,
  GridPlacement,
  LayoutTab,
  Panel,
  PanelKind,
} from "@/types";
import {
  LayoutConfig,
  PANEL_KINDS,
  layoutToYaml,
  parseLayoutYaml,
} from "./layout_yaml";
import { LayoutPreview } from "./layout_preview";

const splitSignals = (text: string) =>
  text
    .split(",")
    .map((signal) => signal.trim())
    .filter((signal) => signal.length > 0);

const primarySignals = (panel: Panel): string[] => {
  switch (panel.kind) {
    case "time_series":
      return panel.signals;
    case "radial_profile":
      return panel.profile_signals;
    default:
      return panel.signal ? [panel.signal] : [];
  }
};

const withSignals = (panel: Panel, signals: string[]): Panel => {
  switch (panel.kind) {
    case "time_series":
      return { ...panel, signals };
    case "radial_profile":
      return { ...panel, profile_signals: signals };
    case "profile_2d":
      return { ...panel, signal: signals[0] ?? "" };
    case "video":
      return { ...panel, signal: signals[0] ?? null };
  }
};

const withKind = (panel: Panel, kind: PanelKind): Panel => {
  const base = {
    id: panel.id,
    title: panel.title,
    source: panel.source,
    grid: panel.grid,
  };
  const signals = primarySignals(panel);
  switch (kind) {
    case "time_series":
      return { ...base, kind, signals };
    case "radial_profile":
      return {
        ...base,
        kind,
        profile_signals: signals,
        time_series_signals: [],
      };
    case "profile_2d":
      return { ...base, kind, signal: signals[0] ?? "" };
    case "video":
      return { ...base, kind, signal: signals[0] ?? null };
  }
};

function SourceRow({
  source,
  dataLoaders,
  onChange,
  onRemove,
}: {
  source: DataSource;
  dataLoaders: string[];
  onChange: (source: DataSource) => void;
  onRemove: () => void;
}) {
  return (
    <Flex gap="size-100" alignItems="end">
      <TextField
        label="Source name"
        value={source.name}
        onChange={(name) => onChange({ ...source, name })}
      />
      <Picker
        label="Data loader"
        items={dataLoaders.map((loader) => ({ key: loader }))}
        selectedKey={source.data_loader}
        onSelectionChange={(key) =>
          onChange({ ...source, data_loader: String(key) })
        }
      >
        {(item) => <Item key={item.key}>{item.key}</Item>}
      </Picker>
      <ActionButton aria-label="Remove source" onPress={onRemove}>
        <Delete />
      </ActionButton>
    </Flex>
  );
}

function PanelRow({
  panel,
  sourceNames,
  onChange,
  onRemove,
}: {
  panel: Panel;
  sourceNames: string[];
  onChange: (panel: Panel) => void;
  onRemove: () => void;
}) {
  const setGrid = (key: keyof GridPlacement, value: number) =>
    onChange({
      ...panel,
      grid: { ...panel.grid, [key]: Number.isNaN(value) ? 1 : value },
    });
  const signalLabel =
    panel.kind === "time_series" || panel.kind === "radial_profile"
      ? "Signals (comma separated)"
      : "Signal";

  return (
    <View
      borderWidth="thin"
      borderColor="gray-300"
      borderRadius="medium"
      padding="size-100"
      aria-label={`Panel ${panel.id}`}
      data-testid="layout-panel"
    >
      <Flex direction="column" gap="size-100">
        <Flex gap="size-100" alignItems="end" wrap>
          <TextField
            label="Panel id"
            value={panel.id}
            onChange={(id) => onChange({ ...panel, id })}
          />
          <TextField
            label="Title"
            value={panel.title ?? ""}
            onChange={(title) => onChange({ ...panel, title: title || null })}
          />
          <Picker
            label="Kind"
            items={PANEL_KINDS}
            selectedKey={panel.kind}
            onSelectionChange={(key) =>
              onChange(withKind(panel, String(key) as PanelKind))
            }
          >
            {(item) => <Item key={item.key}>{item.name}</Item>}
          </Picker>
          <Picker
            label="Source"
            items={sourceNames.map((name) => ({ key: name }))}
            selectedKey={panel.source}
            onSelectionChange={(key) =>
              onChange({ ...panel, source: String(key) })
            }
          >
            {(item) => <Item key={item.key}>{item.key}</Item>}
          </Picker>
          <ActionButton aria-label="Remove panel" onPress={onRemove}>
            <Delete />
          </ActionButton>
        </Flex>
        <Flex gap="size-100" wrap>
          {/* Keyed by kind so the text resets when the signal shape changes. */}
          <TextField
            key={`signals-${panel.kind}`}
            label={signalLabel}
            defaultValue={primarySignals(panel).join(", ")}
            onChange={(text) =>
              onChange(withSignals(panel, splitSignals(text)))
            }
            width="size-3600"
          />
          {panel.kind === "radial_profile" && (
            <TextField
              label="Time series signals"
              defaultValue={panel.time_series_signals.join(", ")}
              onChange={(text) =>
                onChange({ ...panel, time_series_signals: splitSignals(text) })
              }
            />
          )}
        </Flex>
        <Flex gap="size-100" wrap>
          <NumberField
            label="Column"
            minValue={1}
            value={panel.grid.col}
            onChange={(value) => setGrid("col", value)}
            width="size-1200"
          />
          <NumberField
            label="Row"
            minValue={1}
            value={panel.grid.row}
            onChange={(value) => setGrid("row", value)}
            width="size-1200"
          />
          <NumberField
            label="Width"
            minValue={1}
            value={panel.grid.col_span}
            onChange={(value) => setGrid("col_span", value)}
            width="size-1200"
          />
          <NumberField
            label="Height"
            minValue={1}
            value={panel.grid.row_span}
            onChange={(value) => setGrid("row_span", value)}
            width="size-1200"
          />
        </Flex>
      </Flex>
    </View>
  );
}

const replaceAt = <Item,>(items: Item[], index: number, item: Item): Item[] =>
  items.map((existing, existingIndex) =>
    existingIndex === index ? item : existing,
  );
const removeAt = <Item,>(items: Item[], index: number): Item[] =>
  items.filter((_item, existingIndex) => existingIndex !== index);

function newPanel(panels: Panel[], allPanels: Panel[], source: string): Panel {
  const ids = new Set(allPanels.map((panel) => panel.id));
  let number = allPanels.length + 1;
  while (ids.has(`panel_${number}`)) number += 1;
  const nextRow = Math.max(0, ...panels.map((panel) => panel.grid.row)) + 1;
  return {
    id: `panel_${number}`,
    kind: "time_series",
    source,
    signals: [],
    grid: { col: 1, row: nextRow, col_span: 1, row_span: 1 },
  };
}

function TabGroup({
  tab,
  allPanels,
  sourceNames,
  onChange,
  onRemove,
}: {
  tab: LayoutTab;
  allPanels: Panel[];
  sourceNames: string[];
  onChange: (tab: LayoutTab) => void;
  onRemove: () => void;
}) {
  const setPanels = (panels: Panel[]) => onChange({ ...tab, panels });
  return (
    <View
      borderWidth="thin"
      borderColor="gray-400"
      borderRadius="medium"
      padding="size-150"
      data-testid="layout-tab"
    >
      <Flex direction="column" gap="size-100">
        <Flex gap="size-100" alignItems="end">
          <TextField
            label="Tab title"
            value={tab.title}
            onChange={(title) => onChange({ ...tab, title })}
          />
          <ActionButton
            aria-label={`Remove tab ${tab.title}`}
            onPress={onRemove}
          >
            <Delete />
          </ActionButton>
        </Flex>
        {tab.panels.map((panel, panelIndex) => (
          <PanelRow
            key={panelIndex}
            panel={panel}
            sourceNames={sourceNames}
            onChange={(updated) =>
              setPanels(replaceAt(tab.panels, panelIndex, updated))
            }
            onRemove={() => setPanels(removeAt(tab.panels, panelIndex))}
          />
        ))}
        <ActionButton
          alignSelf="start"
          onPress={() =>
            setPanels([
              ...tab.panels,
              newPanel(tab.panels, allPanels, sourceNames[0] ?? ""),
            ])
          }
        >
          <Add />
          <Text>Add panel</Text>
        </ActionButton>
      </Flex>
    </View>
  );
}

function LayoutForm({
  initial,
  dataLoaders,
  onChange,
}: {
  initial: LayoutConfig;
  dataLoaders: string[];
  onChange: (config: LayoutConfig) => void;
}) {
  // The form keeps its own copy, so a half-typed value does not reset it.
  const [config, setConfig] = useState(initial);
  const { sources, layout } = config;
  const sourceNames = sources.map((source) => source.name);
  const allPanels = layout.tabs.flatMap((tab) => tab.panels);
  const update = (next: LayoutConfig) => {
    setConfig(next);
    onChange(next);
  };
  const setSources = (nextSources: DataSource[]) =>
    update({ sources: nextSources, layout });
  const setTabs = (tabs: LayoutTab[]) =>
    update({ sources, layout: { ...layout, tabs } });

  const addTab = () => {
    const titles = new Set(layout.tabs.map((tab) => tab.title));
    let number = layout.tabs.length + 1;
    while (titles.has(`Tab ${number}`)) number += 1;
    setTabs([
      ...layout.tabs,
      {
        title: `Tab ${number}`,
        panels: [newPanel([], allPanels, sourceNames[0] ?? "")],
      },
    ]);
  };

  return (
    <Flex direction="column" gap="size-200">
      <Text>Data sources</Text>
      {sources.map((source, sourceIndex) => (
        <SourceRow
          key={sourceIndex}
          source={source}
          dataLoaders={dataLoaders}
          onChange={(updated) =>
            setSources(replaceAt(sources, sourceIndex, updated))
          }
          onRemove={() => setSources(removeAt(sources, sourceIndex))}
        />
      ))}
      <ActionButton
        alignSelf="start"
        onPress={() =>
          setSources([
            ...sources,
            {
              name: `source_${sources.length + 1}`,
              data_loader: dataLoaders[0] ?? "",
            },
          ])
        }
      >
        <Add />
        <Text>Add source</Text>
      </ActionButton>

      <Text>Tabs</Text>
      {layout.tabs.map((tab, tabIndex) => (
        <TabGroup
          key={tabIndex}
          tab={tab}
          allPanels={allPanels}
          sourceNames={sourceNames}
          onChange={(updated) =>
            setTabs(replaceAt(layout.tabs, tabIndex, updated))
          }
          onRemove={() => setTabs(removeAt(layout.tabs, tabIndex))}
        />
      ))}
      <ActionButton alignSelf="start" onPress={addTab}>
        <Add />
        <Text>Add tab</Text>
      </ActionButton>
      <Checkbox
        isSelected={layout.link_time}
        onChange={(link_time) =>
          update({ sources, layout: { ...layout, link_time } })
        }
      >
        Link the time axes of all panels
      </Checkbox>
    </Flex>
  );
}

function LayoutErrors({ error }: { error: string }) {
  return (
    <pre
      role="alert"
      aria-label="Layout errors"
      style={{
        color: "var(--spectrum-semantic-negative-color-text-small)",
        whiteSpace: "pre-wrap",
        margin: 0,
      }}
    >
      {error}
    </pre>
  );
}

function downloadYaml(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "layout.yaml";
  link.click();
  URL.revokeObjectURL(url);
}

function YamlEditor({
  text,
  error,
  onChange,
}: {
  text: string;
  error: string | null;
  onChange: (text: string) => void;
}) {
  return (
    <Flex direction="column" gap="size-100">
      <TextArea
        label="Layout YAML"
        value={text}
        onChange={onChange}
        width="100%"
        height="size-6000"
        validationState={error ? "invalid" : "valid"}
        UNSAFE_className="[&_textarea]:font-mono"
      />
      {error && <LayoutErrors error={error} />}
      <Flex gap="size-100">
        <FileTrigger
          acceptedFileTypes={[".yaml", ".yml", "application/yaml", "text/yaml"]}
          onSelect={(files) => {
            const file = files?.[0];
            if (file) file.text().then(onChange);
          }}
        >
          <ActionButton>
            <FileAdd />
            <Text>Load file</Text>
          </ActionButton>
        </FileTrigger>
        <ActionButton onPress={() => downloadYaml(text)}>
          <Download />
          <Text>Download</Text>
        </ActionButton>
      </Flex>
    </Flex>
  );
}

/** Edits the data sources and the tabs of panels of a multi-panel project, as YAML or with a form. */
export function LayoutEditor({
  yaml,
  dataLoaders,
  onChange,
}: {
  yaml: string;
  dataLoaders: string[];
  onChange: (yaml: string) => void;
}) {
  const parsed = parseLayoutYaml(yaml);
  const [selectedTab, setSelectedTab] = useState("yaml");
  // Taken when the Form tab opens, so an invalid value typed in the form does not unmount it.
  const [formSeed, setFormSeed] = useState<LayoutConfig | null>(null);
  const [lastValid, setLastValid] = useState({ yaml, config: parsed.config });
  if (parsed.config && lastValid.yaml !== yaml) {
    setLastValid({ yaml, config: parsed.config });
  }

  return (
    <Flex gap="size-300" wrap>
      <View flexGrow={1} flexBasis="size-4600" minWidth={0}>
        <Tabs
          aria-label="Layout editor"
          selectedKey={selectedTab}
          onSelectionChange={(key) => {
            setSelectedTab(String(key));
            if (key === "form") setFormSeed(parsed.config);
          }}
        >
          <TabList>
            <Item key="yaml">YAML</Item>
            <Item key="form">Form</Item>
          </TabList>
          <TabPanels>
            <Item key="yaml">
              <View paddingTop="size-100">
                <YamlEditor
                  text={yaml}
                  error={parsed.error}
                  onChange={onChange}
                />
              </View>
            </Item>
            <Item key="form">
              <View paddingTop="size-100">
                {formSeed ? (
                  <Flex direction="column" gap="size-100">
                    {parsed.error && <LayoutErrors error={parsed.error} />}
                    <LayoutForm
                      initial={formSeed}
                      dataLoaders={dataLoaders}
                      onChange={(config) =>
                        onChange(layoutToYaml(config, yaml))
                      }
                    />
                  </Flex>
                ) : (
                  <Text>
                    Correct the errors in the YAML tab to use the form.
                  </Text>
                )}
              </View>
            </Item>
          </TabPanels>
        </Tabs>
      </View>
      <View flexShrink={0} width="size-6000" maxWidth="100%">
        <LayoutPreview config={lastValid.config} />
      </View>
    </Flex>
  );
}
