"use client";

import {
  displayCreatedBy,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
  TimeSeriesCategory,
} from "@/types";
import { ComponentType, ReactNode, useState } from "react";
import {
  ActionButton,
  AlertDialog,
  DialogContainer,
  Divider,
  Item,
  Menu,
  MenuTrigger,
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Section,
  Flex,
  Selection,
  Text,
  Tooltip,
  TooltipTrigger,
  View,
} from "@adobe/react-spectrum";
import type { SortDescriptor } from "@react-types/shared";
import Delete from "@spectrum-icons/workflow/Delete";
import Visibility from "@spectrum-icons/workflow/Visibility";
import VisibilityOff from "@spectrum-icons/workflow/VisibilityOff";
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
  createdBy: string;
  marker: ComponentType<MarkerProps>;
  hidden: boolean;
}

interface SelectOption {
  key: string;
  label: string;
}

const Dimmed = ({ dim, children }: { dim: boolean; children: ReactNode }) => (
  <View UNSAFE_style={{ opacity: dim ? 0.4 : 1 }}>{children}</View>
);

const toCategoryId = (type: TimeSeriesAnnotationType, label: string) =>
  `${type}_${label}`;

// Separate component because Spectrum caches rows by item, so editMode must be read here to stay fresh
const AnnotationRowActions = ({
  annotation,
}: {
  annotation: TimeSeriesAnnotation;
}) => {
  const { editMode, hiddenIds } = useTimeSeriesState();
  const { removeAnnotation, setAnnotationsHidden } = useTimeSeriesActions();
  const hidden = hiddenIds.has(annotation.id);
  const visibilityLabel = hidden ? "Show annotation" : "Hide annotation";

  return (
    <Flex>
      <TooltipTrigger delay={350}>
        <ActionButton
          isQuiet
          aria-label={visibilityLabel}
          onPress={() => setAnnotationsHidden([annotation.id], !hidden)}
        >
          {hidden ? <VisibilityOff /> : <Visibility />}
        </ActionButton>
        <Tooltip>{visibilityLabel}</Tooltip>
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
    </Flex>
  );
};

export const AnnotationsTable = () => {
  const { annotations, categories, editMode, hiddenIds, visibleAnnotations } =
    useTimeSeriesState();
  const { setAnnotationsHidden, showAllAnnotations, removeAnnotations } =
    useTimeSeriesActions();
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>();
  const [selection, setSelection] = useState<Selection>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entries: TableEntry[] = annotations.map((annotation) => ({
    id: annotation.id,
    annotation,
    // Fall back to a category built from the annotation itself if none is configured.
    category: categories.get(
      toCategoryId(annotation.type, annotation.label),
    ) ?? {
      label: annotation.label,
      color: "black",
      type: annotation.type,
    },
    createdBy: displayCreatedBy(annotation),
    marker: MARKER_ICONS[annotation.type],
    hidden: hiddenIds.has(annotation.id),
  }));

  const compareEntries = (a: TableEntry, b: TableEntry) => {
    switch (sortDescriptor?.column) {
      case "label":
        return a.category.label.localeCompare(b.category.label);
      case "type":
        return a.annotation.type.localeCompare(b.annotation.type);
      case "created_by":
        return a.createdBy.localeCompare(b.createdBy);
      default:
        return 0;
    }
  };
  const ascendingEntries = sortDescriptor?.column
    ? [...entries].sort(compareEntries)
    : entries;
  const sortedEntries =
    sortDescriptor?.direction === "descending"
      ? [...ascendingEntries].reverse()
      : ascendingEntries;

  // Only values that some annotation in this sample has
  const typeOptions = new Map<string, SelectOption>();
  const categoryOptions = new Map<string, SelectOption>();
  const creatorOptions = new Map<string, SelectOption>();
  entries.forEach(({ annotation, category, createdBy }) => {
    typeOptions.set(annotation.type, {
      key: annotation.type,
      label: annotation.type,
    });
    const categoryId = toCategoryId(annotation.type, category.label);
    categoryOptions.set(categoryId, {
      key: categoryId,
      label: `${category.label} (${annotation.type})`,
    });
    creatorOptions.set(annotation.created_by, {
      key: annotation.created_by,
      label: createdBy,
    });
  });

  // Ids of deleted annotations, or from another sample, are dropped from the selection
  const selectedEntries =
    selection === "all"
      ? entries
      : entries.filter((entry) => selection.has(entry.id));
  const selectedIds = selectedEntries.map((entry) => entry.id);
  const selectedHiddenCount = selectedEntries.filter(
    (entry) => entry.hidden,
  ).length;
  const selectedVisibleCount = selectedEntries.length - selectedHiddenCount;

  const selectMatching = (key: string) => {
    const separator = key.indexOf(":");
    const field = key.slice(0, separator);
    const value = key.slice(separator + 1);
    const matches = entries.filter(({ annotation, category }) => {
      switch (field) {
        case "type":
          return annotation.type === value;
        case "category":
          return toCategoryId(annotation.type, category.label) === value;
        case "created_by":
          return annotation.created_by === value;
        default:
          return false;
      }
    });
    setSelection(
      new Set([...selectedIds, ...matches.map((entry) => entry.id)]),
    );
  };

  return (
    <div className="relative ml-auto mr-auto w-[70%] shrink-0 overflow-x-auto px-4 pb-4 shadow-md sm:rounded-lg">
      {/* <ToolingControls /> */}
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <Flex alignItems="center" gap="size-100" marginBottom="size-100" wrap>
        <MenuTrigger>
          <ActionButton isDisabled={entries.length === 0}>Select</ActionButton>
          <Menu onAction={(key) => selectMatching(String(key))}>
            <Section title="Type">
              {[...typeOptions.values()].map((option) => (
                <Item key={`type:${option.key}`}>{option.label}</Item>
              ))}
            </Section>
            <Section title="Class Label">
              {[...categoryOptions.values()].map((option) => (
                <Item key={`category:${option.key}`}>{option.label}</Item>
              ))}
            </Section>
            <Section title="Created By">
              {[...creatorOptions.values()].map((option) => (
                <Item key={`created_by:${option.key}`}>{option.label}</Item>
              ))}
            </Section>
          </Menu>
        </MenuTrigger>
        <ActionButton
          isDisabled={selectedEntries.length === 0}
          onPress={() => setSelection(new Set())}
        >
          Clear selection
        </ActionButton>
        <Divider orientation="vertical" size="S" />
        <ActionButton
          isDisabled={selectedVisibleCount === 0}
          onPress={() => setAnnotationsHidden(selectedIds, true)}
        >
          <VisibilityOff />
          <Text>Hide selected</Text>
        </ActionButton>
        <ActionButton
          isDisabled={selectedHiddenCount === 0}
          onPress={() => setAnnotationsHidden(selectedIds, false)}
        >
          <Visibility />
          <Text>Show selected</Text>
        </ActionButton>
        <ActionButton
          isDisabled={!editMode || selectedEntries.length === 0}
          onPress={() => setConfirmDelete(true)}
        >
          <Delete />
          <Text>Delete selected ({selectedEntries.length})</Text>
        </ActionButton>
        <ActionButton
          isDisabled={hiddenIds.size === 0}
          onPress={showAllAnnotations}
        >
          Show all
        </ActionButton>
        <Text marginStart="auto">
          Showing {visibleAnnotations.length} of {annotations.length}
        </Text>
      </Flex>
      <TableView
        aria-label="Annotations table"
        width="100%"
        height="200px"
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        selectionMode="multiple"
        selectedKeys={selectedIds}
        onSelectionChange={setSelection}
      >
        <TableHeader>
          <Column key="marker" width={56} hideHeader>
            Marker
          </Column>
          <Column key="label" allowsSorting>
            Class Label
          </Column>
          <Column key="type" allowsSorting>
            Type
          </Column>
          <Column key="created_by" allowsSorting>
            Created By
          </Column>
          <Column key="actions" width={96} hideHeader align="end">
            Actions
          </Column>
        </TableHeader>
        <TableBody items={sortedEntries}>
          {(item: TableEntry) => (
            <Row key={item.id}>
              <Cell>
                <Dimmed dim={item.hidden}>
                  <Flex justifyContent="center">
                    <span role="img" aria-label={item.annotation.type}>
                      <item.marker color={item.category.color} />
                    </span>
                  </Flex>
                </Dimmed>
              </Cell>
              <Cell>
                <Dimmed dim={item.hidden}>{item.category.label}</Dimmed>
              </Cell>
              <Cell>
                <Dimmed dim={item.hidden}>{item.annotation.type}</Dimmed>
              </Cell>
              <Cell>
                <Dimmed dim={item.hidden}>{item.createdBy}</Dimmed>
              </Cell>
              <Cell>
                <AnnotationRowActions annotation={item.annotation} />
              </Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
      <DialogContainer onDismiss={() => setConfirmDelete(false)}>
        {confirmDelete && (
          <AlertDialog
            title={`Delete ${selectedEntries.length} annotations?`}
            variant="destructive"
            primaryActionLabel="Delete"
            cancelLabel="Cancel"
            onPrimaryAction={() => {
              removeAnnotations(selectedIds);
              setSelection(new Set());
            }}
          >
            {`This deletes the ${selectedEntries.length} selected annotations.`}
            {selectedHiddenCount > 0
              ? ` ${selectedHiddenCount} of them are hidden.`
              : ""}
          </AlertDialog>
        )}
      </DialogContainer>
    </div>
  );
};
