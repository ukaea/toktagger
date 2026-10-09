"use client";

import {
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
  Tooltip,
  TooltipTrigger,
} from "@adobe/react-spectrum";
import Crosshairs from "@spectrum-icons/workflow/Crosshairs";
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
  const { removeAnnotation, selectAnnotations, setFocusXRange } =
    useTimeSeriesActions();

  const jumpToAnnotation = () => {
    const xs = annotation.points.map((point) => point.x);
    setFocusXRange([Math.min(...xs), Math.max(...xs)]);
    selectAnnotations([annotation.id]);
  };

  return (
    <>
      <TooltipTrigger delay={350}>
        <ActionButton
          isQuiet
          aria-label="Jump to annotation"
          onPress={jumpToAnnotation}
        >
          <Crosshairs />
        </ActionButton>
        <Tooltip>Jump to annotation</Tooltip>
      </TooltipTrigger>
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
    </>
  );
};

export const AnnotationsTable = () => {
  const { annotations, categories } = useTimeSeriesState();

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

  return (
    <div className="relative w-[70%] overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto p-4">
      {/* <ToolingControls /> */}
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <TableView aria-label="Annotations table" width="100%" height="200px">
        <TableHeader>
          <Column key="marker" width={56} hideHeader>
            Marker
          </Column>
          <Column key="label">Class Label</Column>
          <Column key="type">Type</Column>
          <Column key="created_by">Created By</Column>
          <Column key="actions" width={112} hideHeader align="end">
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
              <Cell>{item.annotation.created_by}</Cell>
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
