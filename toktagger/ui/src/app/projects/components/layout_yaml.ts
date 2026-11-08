import YAML, { isMap, isScalar } from "yaml";
import { z } from "zod/v4";
import { DataSourceSchema, LayoutSchema } from "@/types";

export const LayoutConfigSchema = z.object({
  sources: z.array(DataSourceSchema).min(1),
  layout: LayoutSchema,
});
export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;

export type ParsedLayout =
  | { config: LayoutConfig; error: null }
  | { config: null; error: string };

const duplicates = (values: string[]) =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
    .map((value) => `'${value}'`)
    .join(", ");

/** Checks the rules that the schema cannot express, and returns an error message or null. */
export function validateLayoutConfig(config: LayoutConfig): string | null {
  const sourceNames = config.sources.map((source) => source.name);
  const panels = config.layout.tabs.flatMap((tab) => tab.panels);
  const checks: [string, string][] = [
    ["Data source names must be unique", duplicates(sourceNames)],
    [
      "Tab titles must be unique",
      duplicates(config.layout.tabs.map((tab) => tab.title)),
    ],
    [
      "Panel ids must be unique in all tabs",
      duplicates(panels.map((panel) => panel.id)),
    ],
  ];
  const failed = checks.find(([, found]) => found.length > 0);
  if (failed) return `${failed[0]}: ${failed[1]}`;
  const unknownSource = panels.find(
    (panel) => !sourceNames.includes(panel.source),
  );
  if (unknownSource) {
    return `Panel '${unknownSource.id}' uses an unknown data source '${unknownSource.source}'`;
  }
  return null;
}

/** Parses and checks the YAML text of a layout configuration. */
export function parseLayoutYaml(text: string): ParsedLayout {
  const document = YAML.parseDocument(text);
  if (document.errors.length > 0) {
    return { config: null, error: document.errors[0].message };
  }
  const result = LayoutConfigSchema.safeParse(document.toJS());
  if (!result.success) {
    return { config: null, error: z.prettifyError(result.error) };
  }
  const problem = validateLayoutConfig(result.data);
  return problem
    ? { config: null, error: problem }
    : { config: result.data, error: null };
}

/** Writes a layout configuration as YAML, and keeps the comment lines at the top of the previous text. */
export function layoutToYaml(config: LayoutConfig, previousText = ""): string {
  const document = new YAML.Document(config, { keepUndefined: false });
  YAML.visit(document, {
    Pair(_key, pair) {
      if (isScalar(pair.value) && pair.value.value === null) {
        return YAML.visit.REMOVE;
      }
      if (isScalar(pair.key) && pair.key.value === "grid" && isMap(pair.value))
        pair.value.flow = true;
    },
    Seq(_key, sequence) {
      if (sequence.items.every((item) => isScalar(item))) sequence.flow = true;
    },
  });
  const header = /^(?:[ \t]*(?:#.*)?\r?\n)*/.exec(previousText)?.[0].trim();
  const body = document.toString({ lineWidth: 0 });
  return header ? `${header}\n${body}` : body;
}

/** The starter text for a new multi-panel project. */
export function defaultLayoutYaml(dataLoader: string): string {
  return `# The data sources and the panel layout of this project.
# Each source is a named data loader. Each panel reads one source.
sources:
  - name: default
    data_loader: ${JSON.stringify(dataLoader)}
layout:
  # Zoom and pan all the time axes together.
  link_time: true
  # Each tab shows its panels on its own grid. Give each tab a unique title.
  tabs:
    - title: Main
      panels:
        # Kinds: time_series (signals), profile_2d (signal),
        # radial_profile (profile_signals, time_series_signals), video (signal).
        # Panel ids must be unique in all tabs.
        - id: panel_1
          kind: time_series
          source: default
          signals: [ip]
          # Column and row start at 1. The spans are the number of grid cells.
          grid: { col: 1, row: 1, col_span: 1, row_span: 1 }
`;
}
