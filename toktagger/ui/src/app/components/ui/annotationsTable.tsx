"use client";

import {
  displayCreatedBy,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
  TimeSeriesCategory,
} from "@/types";
import { ComponentType, useMemo } from "react";
import {
  ActionButton,
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Flex,
  Selection,
  Tooltip,
  TooltipTrigger,
} from "@adobe/react-spectrum";
import Delete from "@spectrum-icons/workflow/Delete";
import {
  useTimeSeriesActions,
  useTimeSeriesState,
} from "@/app/contexts/TimeSeriesContext";
import {
  BoundingBoxMarker,
  MarkerProps,
  PolygonMarker,
  TimePointMarker,
  TimeRegionMarker,
} from "@/app/components/ui/annotationMarkers";

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
  annotation: TimeSeriesAnnotation;
  category: TimeSeriesCategory;
  marker: ComponentType<MarkerProps>;
}

// Separate component because Spectrum caches rows by item, so editMode must be read here to stay fresh
const AnnotationRowActions = ({
  annotation,
}: {
  annotation: TimeSeriesAnnotation;
}) => {
  const { editMode } = useTimeSeriesState();
  const { removeAnnotation } = useTimeSeriesActions();

  return (
    <TooltipTrigger delay={350}>
      <ActionButton
        isQuiet
        isDisabled={!editMode}
        aria-label="Delete annotation"
        onPress={() => removeAnnotation(annotation.id)}
      >
        <Delete />
      </ActionButton>
      <Tooltip>Delete annotation</Tooltip>
    </TooltipTrigger>
  );
};

export const AnnotationsTable = () => {
  const { annotations, categories } = useTimeSeriesState();
  const { selectAnnotations, setFocusXRange } = useTimeSeriesActions();

  const entries = useMemo<TableEntry[]>(
    () =>
      annotations.map((annotation) => ({
        id: annotation.id,
        annotation,
        // Fall back to a category built from the annotation itself if none is configured.
        category: categories.get(`${annotation.type}_${annotation.label}`) ?? {
          label: annotation.label,
          color: "black",
          type: annotation.type,
        },
        marker: MARKER_ICONS[annotation.type],
      })),
    [annotations, categories],
  );

  const selectedKeys = annotations
    .filter((annotation) => annotation.selected)
    .map((annotation) => annotation.id);

  // Mirrors the plot's selection, so rows and annotations highlight together
  const onSelectionChange = (keys: Selection) => {
    const selected =
      keys === "all"
        ? annotations
        : annotations.filter((annotation) => keys.has(annotation.id));
    selectAnnotations(selected.map((annotation) => annotation.id));

    const xs = selected.flatMap((annotation) =>
      annotation.points.map((point) => point.x),
    );
    if (xs.length > 0) setFocusXRange([Math.min(...xs), Math.max(...xs)]);
  };

  return (
    <div className="relative ml-auto mr-auto w-[70%] shrink-0 overflow-x-auto px-4 pb-4 shadow-md sm:rounded-lg">
      {/* <ToolingControls /> */}
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <TableView
        aria-label="Annotations table"
        width="100%"
        height="200px"
        selectionMode="multiple"
        selectionStyle="highlight"
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
      >
        <TableHeader>
          <Column key="marker" width={56} hideHeader>
            Marker
          </Column>
          <Column key="label">Class Label</Column>
          <Column key="type">Type</Column>
          <Column key="created_by">Created By</Column>
          <Column key="actions" width={56} hideHeader align="end">
            Actions
          </Column>
        </TableHeader>
        <TableBody items={entries}>
          {(item: TableEntry) => (
            <Row key={item.id}>
              <Cell>
                <Flex justifyContent="center">
                  <span role="img" aria-label={item.annotation.type}>
                    <item.marker color={item.category.color} />
                  </span>
                </Flex>
              </Cell>
              <Cell>
                <span>{item.category.label}</span>
              </Cell>
              <Cell>{item.annotation.type}</Cell>
              <Cell>{displayCreatedBy(item.annotation)}</Cell>
              <Cell>
                <AnnotationRowActions annotation={item.annotation} />
              </Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </div>
  );
};
