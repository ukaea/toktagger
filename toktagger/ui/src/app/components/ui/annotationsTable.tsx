"use client";

import {
  Annotation,
  displayCreatedBy,
  Panel,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
} from "@/types";
import { ComponentType } from "react";
import {
  ActionButton,
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Flex,
  Tooltip,
  TooltipTrigger,
} from "@adobe/react-spectrum";
import Delete from "@spectrum-icons/workflow/Delete";
import { useAnnotationTools } from "@/app/contexts/AnnotationToolContext";
import { useSample } from "@/app/contexts/SampleContext";
import { convertRawAnnotationsToTimeSeries } from "@/app/utils";
import {
  BoundingBoxMarker,
  MarkerProps,
  PolygonMarker,
  TimePointMarker,
  TimeRegionMarker,
} from "@/app/components/ui/annotationMarkers";

const ANNOTATIONS_TABLE_HEIGHT = 200;

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
  raw: Annotation;
  annotation: TimeSeriesAnnotation;
  color: string;
  panels: string;
  marker: ComponentType<MarkerProps>;
}

export const TIME_PANEL_KINDS: Panel["kind"][] = [
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

// Separate component because Spectrum caches rows by item, so editMode must be read here to stay fresh
const AnnotationRowActions = ({ raw }: { raw: Annotation }) => {
  const { editMode } = useAnnotationTools();
  const { setAnnotations } = useSample();

  return (
    <TooltipTrigger delay={350}>
      <ActionButton
        isQuiet
        isDisabled={!editMode}
        aria-label="Delete annotation"
        onPress={() =>
          setAnnotations((previous) =>
            previous.filter((annotation) => annotation !== raw),
          )
        }
      >
        <Delete />
      </ActionButton>
      <Tooltip>Delete annotation</Tooltip>
    </TooltipTrigger>
  );
};

/** Lists the time annotations of every panel on the sample page; video panels have their own table. */
export const AnnotationsTable = ({ panels }: { panels: Panel[] }) => {
  const { annotations } = useSample();
  const { categories } = useAnnotationTools();
  const showPanels = panels.length > 1;
  const timePanels = panels.filter((panel) =>
    TIME_PANEL_KINDS.includes(panel.kind),
  );

  const entries: TableEntry[] = annotations.flatMap((raw) => {
    const annotation = convertRawAnnotationsToTimeSeries(raw);
    if (!annotation) return [];
    return [
      {
        id: annotation.id,
        raw,
        annotation,
        // Fall back to black if no category is configured for this label.
        color:
          categories.get(`${annotation.type}_${annotation.label}`)?.color ??
          "black",
        panels: describePanels(
          timePanelsShowing(panels, annotation.signal_name),
          timePanels,
        ),
        marker: MARKER_ICONS[annotation.type],
      },
    ];
  });

  const columns: { key: string; name: string; width?: number }[] = [
    { key: "marker", name: "Marker", width: 56 },
    { key: "label", name: "Class Label" },
    { key: "type", name: "Type" },
    ...(showPanels ? [{ key: "panels", name: "Panel" }] : []),
    { key: "created_by", name: "Created By" },
    { key: "actions", name: "Actions", width: 56 },
  ];

  const renderCell = (item: TableEntry, columnKey: string) => {
    switch (columnKey) {
      case "marker":
        return (
          <Flex justifyContent="center">
            <span role="img" aria-label={item.annotation.type}>
              <item.marker color={item.color} />
            </span>
          </Flex>
        );
      case "label":
        return <span>{item.annotation.label}</span>;
      case "type":
        return item.annotation.type;
      case "panels":
        return item.panels;
      case "created_by":
        return displayCreatedBy(item.annotation);
      default:
        return <AnnotationRowActions raw={item.raw} />;
    }
  };

  return (
    <div className="relative ml-auto mr-auto w-[70%] shrink-0 overflow-x-auto px-4 pb-4 shadow-md sm:rounded-lg">
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
            <Column
              key={column.key}
              width={column.width}
              hideHeader={column.key === "marker" || column.key === "actions"}
              align={column.key === "actions" ? "end" : "start"}
            >
              {column.name}
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
