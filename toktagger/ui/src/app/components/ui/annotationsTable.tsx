"use client";

import { JSX, useMemo } from "react";
import {
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Flex,
} from "@adobe/react-spectrum";
import { useSample } from "@/app/contexts/SampleContext";
import {
  RectangleHorizontal,
  RectangleVertical,
  Pentagon,
  Square,
  Tag,
  HelpCircle,
} from "lucide-react";
import {
  Annotation,
  BoundingBoxAnnotationSchema,
  PolygonAnnotationSchema,
  TimePointSchema,
  TimeRegionSchema,
} from "@/types";

interface TableEntry {
  id: string;
  type: string;
  label: string;
  created_by: string;
  icon: JSX.Element;
  position: string;
}

const AnnotationTypeNames: Record<string, string> = {
  time_point: "Time Point",
  time_region: "Time Region",
  polygon: "Polygon",
  bounding_box: "Bounding Box",
  class_label: "Class Label",
};

const getIconForType = (type: string) => {
  const iconProps = { size: 20, strokeWidth: 2 };

  switch (type) {
    case "time_region":
      return <RectangleHorizontal {...iconProps} className="text-blue-500" />;
    case "time_point":
      return <RectangleVertical {...iconProps} className="text-green-500" />;
    case "polygon":
      return <Pentagon {...iconProps} className="text-red-500" />;
    case "bounding_box":
      return <Square {...iconProps} className="text-yellow-500" />;
    case "class_label":
      return <Tag {...iconProps} className="text-purple-500" />;
    default:
      return <HelpCircle {...iconProps} className="text-gray-500" />;
  }
};

const getPositionForAnnotation = (annotation: Annotation) => {
  switch (annotation.type) {
    case "time_region":
      const timeRegion = TimeRegionSchema.parse(annotation);
      return `Time Min: ${timeRegion.time_min.toFixed(2)}, Time Max: ${timeRegion.time_max.toFixed(2)}`;
    case "time_point":
      const timePoint = TimePointSchema.parse(annotation);
      return `Time: ${timePoint.time.toFixed(2)}`;

    case "bounding_box":
      const boundingBox = BoundingBoxAnnotationSchema.parse(annotation);
      return `x_min: ${boundingBox.x_min.toFixed(2)}, y_min: ${boundingBox.y_min.toFixed(2)}, width: ${boundingBox.width.toFixed(2)}, height: ${boundingBox.height.toFixed(2)}`;
    case "polygon":
      const polygon = PolygonAnnotationSchema.parse(annotation);
      const segmentation = polygon.segmentation[0];
      const xCoords = segmentation.filter((_, index) => index % 2 === 0);
      const yCoords = segmentation.filter((_, index) => index % 2 === 1);
      const centerX = xCoords.reduce((sum, x) => sum + x, 0) / xCoords.length;
      const centerY = yCoords.reduce((sum, y) => sum + y, 0) / yCoords.length;
      return `Center: (${centerX.toFixed(2)}, ${centerY.toFixed(2)})`;

    default:
      return "--";
  }
};

export const AnnotationsTable = () => {
  const { annotations } = useSample();

  const entries = useMemo<TableEntry[]>(() => {
    const entriesBuffer: TableEntry[] = [];

    for (const [index, annotation] of annotations.entries()) {
      entriesBuffer.push({
        id: `annotation-${index}`,
        type: AnnotationTypeNames[annotation.type],
        label: annotation.label,
        created_by: annotation.created_by,
        icon: getIconForType(annotation.type),
        position: getPositionForAnnotation(annotation),
      });
    }

    return entriesBuffer;
  }, [annotations]);

  return (
    <div className="relative w-[70%] shadow-md sm:rounded-lg ml-auto mr-auto p-4">
      {/* <ToolingControls /> */}
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <div className="overflow-x-auto">
        <TableView aria-label="Annotations table" width="100%" height="200px">
          <TableHeader>
            <Column key="type" minWidth={150}>
              Type
            </Column>
            <Column key="label" minWidth={120}>
              Label
            </Column>
            <Column key="created_by" minWidth={120}>
              Created By
            </Column>
            <Column key="position" minWidth={200}>
              Position
            </Column>
          </TableHeader>
          <TableBody items={entries}>
            {(item) => (
              <Row key={item.id}>
                <Cell>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {item.icon}
                    <span>{item.type}</span>
                  </div>
                </Cell>
                <Cell>{item.label}</Cell>
                <Cell>{item.created_by}</Cell>
                <Cell>{item.position}</Cell>
              </Row>
            )}
          </TableBody>
        </TableView>
      </div>
    </div>
  );
};
