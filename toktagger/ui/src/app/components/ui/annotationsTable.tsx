"use client";

import { TimeSeriesAnnotationType, TimeSeriesCategory } from "@/types";
import { ComponentType, ReactNode, useMemo, useState } from "react";
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
  Text,
  View,
} from "@adobe/react-spectrum";
import type { Selection, SortDescriptor } from "@react-types/shared";
import Delete from "@spectrum-icons/workflow/Delete";
import Visibility from "@spectrum-icons/workflow/Visibility";
import VisibilityOff from "@spectrum-icons/workflow/VisibilityOff";
import {
  useTimeSeriesActions,
  useTimeSeriesState,
} from "@/app/contexts/TimeSeriesContext";

interface MarkerProps {
  color: string;
}

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
  category: TimeSeriesCategory;
  createdBy: string;
  data: string;
  // Numeric key for the Data column, so that it does not sort as a string
  sortValue: number;
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

export const AnnotationsTable = () => {
  const { annotations, categories, hiddenIds, visibleAnnotations } =
    useTimeSeriesState();
  const {
    setAnnotationsHidden,
    showAllAnnotations,
    removeAnnotation,
    removeAnnotations,
  } = useTimeSeriesActions();
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>();
  const [selection, setSelection] = useState<Selection>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entries = useMemo<TableEntry[]>(() => {
    const entriesBuffer: TableEntry[] = [];
    annotations.forEach((annotation) => {
      const categoryId = toCategoryId(annotation.type, annotation.label);
      // Fall back to a category built from the annotation itself if none is configured.
      const category = categories.get(categoryId) ?? {
        label: annotation.label,
        color: "black",
        type: annotation.type,
      };

      let data: string;
      switch (annotation.type) {
        case TimeSeriesAnnotationType.TIME_POINT:
          data = `${annotation.points[0].x.toFixed(4)}`;
          break;
        case TimeSeriesAnnotationType.TIME_REGION: {
          const timeRegionPoints: string[] = [];
          annotation.points.forEach((point) => {
            timeRegionPoints.push(`${point.x.toFixed(4)}`);
          });
          data = `${timeRegionPoints[0]} - ${timeRegionPoints[1]}`;
          break;
        }
        case TimeSeriesAnnotationType.BOUNDING_BOX: {
          const boundingBoxPoints: string[] = [];
          annotation.points.forEach((point) => {
            boundingBoxPoints.push(
              `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`,
            );
          });
          data = `${boundingBoxPoints[0]} ${boundingBoxPoints[1]}`;
          break;
        }
        case TimeSeriesAnnotationType.POLYGON:
          data = `(${annotation.points[0].x.toFixed(2)}, ${annotation.points[0].y.toFixed(2)}) [${annotation.points.length}]`;
          break;
        default:
          console.warn(
            `Could not parse data for ${annotation.type} when adding to table`,
          );
          data = "";
      }

      entriesBuffer.push({
        id: annotation.id,
        category,
        createdBy: annotation.created_by,
        data,
        sortValue: annotation.points[0]?.x ?? 0,
        marker: MARKER_ICONS[annotation.type],
        hidden: hiddenIds.has(annotation.id),
      });
    });

    return entriesBuffer;
  }, [annotations, categories, hiddenIds]);

  const sortedEntries = useMemo(() => {
    if (!sortDescriptor?.column) return entries;
    const sorted = [...entries].sort((a, b) => {
      switch (sortDescriptor.column) {
        case "category":
          return a.category.label.localeCompare(b.category.label);
        case "type":
          return a.category.type.localeCompare(b.category.type);
        case "createdBy":
          return a.createdBy.localeCompare(b.createdBy);
        case "data":
          return a.sortValue - b.sortValue;
        default:
          return 0;
      }
    });
    return sortDescriptor.direction === "descending"
      ? sorted.reverse()
      : sorted;
  }, [entries, sortDescriptor]);

  // Only values that some annotation in this sample has
  const selectOptions = useMemo(() => {
    const types = new Map<string, SelectOption>();
    const categoryOptions = new Map<string, SelectOption>();
    const creators = new Map<string, SelectOption>();
    entries.forEach(({ category, createdBy }) => {
      types.set(category.type, { key: category.type, label: category.type });
      const id = toCategoryId(category.type, category.label);
      categoryOptions.set(id, {
        key: id,
        label: `${category.label} (${category.type})`,
      });
      creators.set(createdBy, { key: createdBy, label: createdBy });
    });
    return {
      types: [...types.values()],
      categories: [...categoryOptions.values()],
      creators: [...creators.values()],
    };
  }, [entries]);

  // Ids of deleted annotations, or from another sample, are dropped from the selection
  const selectedEntries = useMemo(
    () =>
      selection === "all"
        ? entries
        : entries.filter((entry) => selection.has(entry.id)),
    [entries, selection],
  );
  const selectedIds = selectedEntries.map((entry) => entry.id);
  const selectedHiddenCount = selectedEntries.filter(
    (entry) => entry.hidden,
  ).length;
  const selectedVisibleCount = selectedEntries.length - selectedHiddenCount;

  const selectMatching = (key: string) => {
    const [field, value] = [
      key.slice(0, key.indexOf(":")),
      key.slice(key.indexOf(":") + 1),
    ];
    const matches = entries.filter((entry) => {
      switch (field) {
        case "type":
          return entry.category.type === value;
        case "category":
          return (
            toCategoryId(entry.category.type, entry.category.label) === value
          );
        case "createdBy":
          return entry.createdBy === value;
        default:
          return false;
      }
    });
    setSelection(
      new Set([...selectedIds, ...matches.map((entry) => entry.id)]),
    );
  };

  return (
    <div className="relative w-[70%] overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto p-4">
      {/* <ToolingControls /> */}
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <Flex alignItems="center" gap="size-100" marginBottom="size-100" wrap>
        <MenuTrigger>
          <ActionButton isDisabled={entries.length === 0}>Select</ActionButton>
          <Menu onAction={(key) => selectMatching(String(key))}>
            <Section title="Type">
              {selectOptions.types.map((option) => (
                <Item key={`type:${option.key}`}>{option.label}</Item>
              ))}
            </Section>
            <Section title="Category">
              {selectOptions.categories.map((option) => (
                <Item key={`category:${option.key}`}>{option.label}</Item>
              ))}
            </Section>
            <Section title="Created by">
              {selectOptions.creators.map((option) => (
                <Item key={`createdBy:${option.key}`}>{option.label}</Item>
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
          isDisabled={selectedEntries.length === 0}
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
          <Column key="actions" width="10%" hideHeader>
            Actions
          </Column>
          <Column key="marker" width="4%">
            <></>
          </Column>
          <Column key="category" width="20%" allowsSorting>
            Category
          </Column>
          <Column key="type" width="18%" allowsSorting>
            Type
          </Column>
          <Column key="createdBy" width="18%" allowsSorting>
            Created by
          </Column>
          <Column key="data" width="24%" allowsSorting>
            Data
          </Column>
        </TableHeader>
        <TableBody items={sortedEntries}>
          {(item: TableEntry) => {
            const { hidden } = item;
            return (
              <Row key={item.id}>
                <Cell>
                  <Flex>
                    <ActionButton
                      isQuiet
                      aria-label={
                        hidden ? "Show annotation" : "Hide annotation"
                      }
                      onPress={() => setAnnotationsHidden([item.id], !hidden)}
                    >
                      {hidden ? <VisibilityOff /> : <Visibility />}
                    </ActionButton>
                    <ActionButton
                      isQuiet
                      aria-label="Delete annotation"
                      onPress={() => removeAnnotation(item.id)}
                    >
                      <Delete />
                    </ActionButton>
                  </Flex>
                </Cell>
                <Cell>
                  <Dimmed dim={hidden}>
                    <Flex justifyContent="center">
                      <item.marker color={item.category.color} />
                    </Flex>
                  </Dimmed>
                </Cell>
                <Cell>
                  <Dimmed dim={hidden}>{item.category.label}</Dimmed>
                </Cell>
                <Cell>
                  <Dimmed dim={hidden}>{item.category.type}</Dimmed>
                </Cell>
                <Cell>
                  <Dimmed dim={hidden}>{item.createdBy}</Dimmed>
                </Cell>
                <Cell>
                  <Dimmed dim={hidden}>{item.data}</Dimmed>
                </Cell>
              </Row>
            );
          }}
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
