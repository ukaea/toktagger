"use client";

import {
  Annotation,
  Panel,
  TimeSeriesAnnotationType,
  VideoAnnotationBaseSchema,
  VideoBoundingBoxSchema,
  VideoFrameLabelSchema,
  VideoPointSchema,
  VideoPolygonSchema,
} from "@/types";
import { ComponentType, useMemo } from "react";
import {
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Flex,
} from "@adobe/react-spectrum";
import { useAnnotationTools } from "@/app/contexts/AnnotationToolContext";
import { useSample } from "@/app/contexts/SampleContext";
import { convertRawAnnotationsToTimeSeries, randomColor } from "@/app/utils";

interface MarkerProps {
  color: string;
}

const ANNOTATIONS_TABLE_HEIGHT = 200;

const MARKER_VIEWBOX = "0 0 24 24";

// Shape mirrors how each annotation type actually renders on the plot, so the
// marker doubles as a legend for the tool - stroked/filled with the category color
const TimePointMarker = ({ color }: MarkerProps) => (
  <svg width="10" height="20" viewBox={MARKER_VIEWBOX}>
    <line x1="12" y1="1" x2="12" y2="40" stroke={color} strokeWidth="4" />
  </svg>
);

const TimeRegionMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <rect x="6" y="6" width="12" height="20" rx="2" fill={color} />
  </svg>
);

const BoundingBoxMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="1"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
    />
  </svg>
);

const PolygonMarker = ({ color }: MarkerProps) => (
  <svg width="20" height="20" viewBox={MARKER_VIEWBOX}>
    <polygon
      points="12,2 22,9.5 18,21 6,21 2,9.5"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  </svg>
);

// One marker per annotation type - set when the annotation's category/type is resolved below
const MARKER_ICONS: Record<
  TimeSeriesAnnotationType,
  ComponentType<MarkerProps>
> = {
  [TimeSeriesAnnotationType.TIME_POINT]: TimePointMarker,
  [TimeSeriesAnnotationType.TIME_REGION]: TimeRegionMarker,
  [TimeSeriesAnnotationType.BOUNDING_BOX]: BoundingBoxMarker,
  [TimeSeriesAnnotationType.POLYGON]: PolygonMarker,
};

interface TableEntry {
  id: string;
  label: string;
  color: string;
  type: string;
  data: string;
  panels: string;
  marker: ComponentType<MarkerProps>;
}

const TIME_PANEL_KINDS: Panel["kind"][] = [
  "time_series",
  "profile_2d",
  "radial_profile",
];

const panelTitle = (panel: Panel) => panel.title ?? panel.id;

// Mirrors TimeSeriesProvider: only a spectrogram panel binds its annotations to its signal.
function timePanelsShowing(
  panels: Panel[],
  signalName: string | null | undefined,
): Panel[] {
  return panels.filter(
    (panel) =>
      TIME_PANEL_KINDS.includes(panel.kind) &&
      (panel.kind !== "profile_2d" ||
        !signalName ||
        panel.signal === signalName),
  );
}

function describePanels(shown: Panel[], candidates: Panel[]): string {
  if (shown.length > 1 && shown.length === candidates.length) return "All";
  return shown.map(panelTitle).join(", ");
}

function timeEntry(
  annotation: Annotation,
  panels: Panel[],
  categories: ReturnType<typeof useAnnotationTools>["categories"],
): TableEntry | null {
  const parsed = convertRawAnnotationsToTimeSeries(annotation);
  if (!parsed) return null;
  const category = categories.get(`${parsed.type}_${parsed.label}`);
  const points = parsed.points;

  let data: string;
  switch (parsed.type) {
    case TimeSeriesAnnotationType.TIME_POINT:
      data = points[0].x.toFixed(4);
      break;
    case TimeSeriesAnnotationType.TIME_REGION:
      data = `${points[0].x.toFixed(4)} - ${points[1].x.toFixed(4)}`;
      break;
    case TimeSeriesAnnotationType.BOUNDING_BOX:
      data = points
        .map((point) => `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`)
        .join(" ");
      break;
    case TimeSeriesAnnotationType.POLYGON:
      data = `(${points[0].x.toFixed(2)}, ${points[0].y.toFixed(2)}) [${points.length}]`;
      break;
  }

  const timePanels = panels.filter((panel) =>
    TIME_PANEL_KINDS.includes(panel.kind),
  );
  return {
    id: parsed.id,
    label: parsed.label,
    color: category?.color ?? "black",
    type: parsed.type,
    data,
    panels: describePanels(
      timePanelsShowing(panels, parsed.signal_name),
      timePanels,
    ),
    marker: MARKER_ICONS[parsed.type],
  };
}

function videoEntry(
  annotation: Annotation,
  index: number,
  panels: Panel[],
  videoLabels: string[],
): TableEntry | null {
  let data: string;
  let marker: ComponentType<MarkerProps>;
  const box = VideoBoundingBoxSchema.safeParse(annotation);
  const polygon = VideoPolygonSchema.safeParse(annotation);
  const point = VideoPointSchema.safeParse(annotation);
  const frameLabel = VideoFrameLabelSchema.safeParse(annotation);
  if (box.success) {
    data = `(${box.data.x_min}, ${box.data.y_min}) ${box.data.width}×${box.data.height}`;
    marker = BoundingBoxMarker;
  } else if (polygon.success) {
    const coordinates = polygon.data.segmentation[0];
    data = `(${coordinates[0]}, ${coordinates[1]}) [${coordinates.length / 2}]`;
    marker = PolygonMarker;
  } else if (point.success) {
    data = `(${point.data.x}, ${point.data.y})`;
    marker = TimePointMarker;
  } else if (frameLabel.success) {
    data = "whole frame";
    marker = TimeRegionMarker;
  } else {
    return null;
  }

  const base = VideoAnnotationBaseSchema.safeParse(annotation);
  if (!base.success) return null;
  const { frame, track_id } = base.data;
  const labelIndex = videoLabels.indexOf(annotation.label);
  return {
    id: `${annotation.type}-${frame}-${track_id}-${index}`,
    label: annotation.label,
    color: labelIndex >= 0 ? randomColor(labelIndex) : "black",
    type: annotation.type,
    data: `frame ${frame}: ${data}`,
    panels: panels
      .filter((panel) => panel.kind === "video")
      .map(panelTitle)
      .join(", "),
    marker,
  };
}

/** Lists the annotations of every panel on the sample page. */
export const AnnotationsTable = ({ panels }: { panels: Panel[] }) => {
  const { annotations, project } = useSample();
  const { categories } = useAnnotationTools();
  const showPanels = panels.length > 1;
  const videoLabels = useMemo(
    () => project?.video_bounding_box_labels ?? [],
    [project],
  );

  const entries = useMemo<TableEntry[]>(
    () =>
      annotations.flatMap(
        (annotation, index) =>
          timeEntry(annotation, panels, categories) ??
          videoEntry(annotation, index, panels, videoLabels) ??
          [],
      ),
    [annotations, categories, panels, videoLabels],
  );

  const columns: { key: string; name: string; width: `${number}%` }[] = [
    { key: "marker", name: "", width: "2%" },
    { key: "category", name: "Category", width: showPanels ? "20%" : "28%" },
    { key: "type", name: "Type", width: showPanels ? "15%" : "20%" },
    ...(showPanels
      ? [{ key: "panels", name: "Panel", width: "23%" as const }]
      : []),
    { key: "data", name: "Data", width: showPanels ? "40%" : "50%" },
  ];

  const renderCell = (item: TableEntry, columnKey: string) => {
    switch (columnKey) {
      case "marker":
        return (
          <Flex justifyContent="center">
            <item.marker color={item.color} />
          </Flex>
        );
      case "category":
        return <span>{item.label}</span>;
      case "type":
        return item.type;
      case "panels":
        return item.panels;
      default:
        return item.data;
    }
  };

  return (
    <div className="relative w-[70%] overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto p-4">
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <TableView
        aria-label="Annotations table"
        width="100%"
        height={ANNOTATIONS_TABLE_HEIGHT}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <Column key={column.key} width={column.width}>
              {column.name || <></>}
            </Column>
          )}
        </TableHeader>
        <TableBody items={entries}>
          {(item: TableEntry) => (
            <Row key={item.id}>
              {(columnKey) => (
                <Cell>{renderCell(item, String(columnKey))}</Cell>
              )}
            </Row>
          )}
        </TableBody>
      </TableView>
    </div>
  );
};
