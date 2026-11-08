"use client";
import {
  ActionButton,
  Button,
  Checkbox,
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
  Flex,
  Item,
  NumberField,
  Picker,
  Text,
  TextArea,
  TextField,
  View,
} from "@adobe/react-spectrum";
import Add from "@spectrum-icons/workflow/Add";
import Delete from "@spectrum-icons/workflow/Delete";
import { useState } from "react";
import { z } from "zod/v4";
import {
  DataSource,
  DataSourceSchema,
  GridPlacement,
  Layout,
  LayoutSchema,
  Panel,
  PanelKind,
} from "@/types";

const PANEL_KINDS: { key: PanelKind; name: string }[] = [
  { key: "time_series", name: "Time series" },
  { key: "profile_2d", name: "Profile 2D / spectrogram" },
  { key: "radial_profile", name: "Radial profile" },
  { key: "video", name: "Video" },
];

const LayoutConfigSchema = z.object({
  sources: z.array(DataSourceSchema).min(1),
  layout: LayoutSchema,
});
export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;

/** Checks a layout configuration and returns an error message, or null when it is valid. */
export function validateLayoutConfig(config: LayoutConfig): string | null {
  const result = LayoutConfigSchema.safeParse(config);
  if (!result.success) return z.prettifyError(result.error);
  const sourceNames = config.sources.map((source) => source.name);
  if (new Set(sourceNames).size !== sourceNames.length) {
    return "Data source names must be unique";
  }
  const panelIds = config.layout.panels.map((panel) => panel.id);
  if (new Set(panelIds).size !== panelIds.length) {
    return "Panel ids must be unique";
  }
  const unknownSource = config.layout.panels.find(
    (panel) => !sourceNames.includes(panel.source),
  );
  if (unknownSource) {
    return `Panel '${unknownSource.id}' uses an unknown data source '${unknownSource.source}'`;
  }
  return null;
}

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

function JsonImport({
  config,
  onImport,
}: {
  config: LayoutConfig;
  onImport: (config: LayoutConfig) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch (parseError) {
      setError(`Invalid JSON: ${parseError}`);
      return;
    }
    const result = LayoutConfigSchema.safeParse(parsedJson);
    if (!result.success) {
      setError(z.prettifyError(result.error));
      return;
    }
    const problem = validateLayoutConfig(result.data);
    if (problem) {
      setError(problem);
      return;
    }
    onImport(result.data);
  };

  return (
    <Flex direction="column" gap="size-100">
      <TextArea
        label="Sources and layout (JSON)"
        value={text}
        onChange={setText}
        width="100%"
        height="size-3600"
      />
      {error && <Text UNSAFE_style={{ color: "red" }}>{error}</Text>}
      <Button variant="secondary" onPress={apply} alignSelf="start">
        Apply JSON
      </Button>
    </Flex>
  );
}

/** Edits the data sources and the panel layout of a multi-panel project. */
export function LayoutEditor({
  sources,
  layout,
  dataLoaders,
  onChange,
}: {
  sources: DataSource[];
  layout: Layout;
  dataLoaders: string[];
  onChange: (config: LayoutConfig) => void;
}) {
  // Remounts the rows after a JSON import so their uncontrolled text fields pick up the new values.
  const [revision, setRevision] = useState(0);
  const sourceNames = sources.map((source) => source.name);
  const setPanels = (panels: Panel[]) =>
    onChange({ sources, layout: { ...layout, panels } });
  const setSources = (nextSources: DataSource[]) =>
    onChange({ sources: nextSources, layout });

  const addPanel = () => {
    const nextRow =
      Math.max(0, ...layout.panels.map((panel) => panel.grid.row)) + 1;
    setPanels([
      ...layout.panels,
      {
        id: `panel_${layout.panels.length + 1}`,
        title: null,
        kind: "time_series",
        source: sourceNames[0],
        signals: [],
        grid: { col: 1, row: nextRow, col_span: 1, row_span: 1 },
      },
    ]);
  };

  return (
    <Flex direction="column" gap="size-200" key={revision}>
      <Text>Data sources</Text>
      {sources.map((source, sourceIndex) => (
        <SourceRow
          key={sourceIndex}
          source={source}
          dataLoaders={dataLoaders}
          onChange={(updated) =>
            setSources(
              sources.map((existing, existingIndex) =>
                existingIndex === sourceIndex ? updated : existing,
              ),
            )
          }
          onRemove={() =>
            setSources(
              sources.filter(
                (_source, existingIndex) => existingIndex !== sourceIndex,
              ),
            )
          }
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

      <Text>Panels</Text>
      {layout.panels.map((panel, panelIndex) => (
        <PanelRow
          key={panelIndex}
          panel={panel}
          sourceNames={sourceNames}
          onChange={(updated) =>
            setPanels(
              layout.panels.map((existing, existingIndex) =>
                existingIndex === panelIndex ? updated : existing,
              ),
            )
          }
          onRemove={() =>
            setPanels(
              layout.panels.filter(
                (_panel, existingIndex) => existingIndex !== panelIndex,
              ),
            )
          }
        />
      ))}
      <ActionButton alignSelf="start" onPress={addPanel}>
        <Add />
        <Text>Add panel</Text>
      </ActionButton>
      <Checkbox
        isSelected={layout.link_time}
        onChange={(link_time) =>
          onChange({ sources, layout: { ...layout, link_time } })
        }
      >
        Link the time axes of all panels
      </Checkbox>

      <Disclosure>
        <DisclosureTitle>
          <span style={{ fontSize: "0.9rem" }}>Edit as JSON</span>
        </DisclosureTitle>
        <DisclosurePanel>
          <JsonImport
            key={JSON.stringify({ sources, layout })}
            config={{ sources, layout }}
            onImport={(config) => {
              onChange(config);
              setRevision((previous) => previous + 1);
            }}
          />
        </DisclosurePanel>
      </Disclosure>
    </Flex>
  );
}
