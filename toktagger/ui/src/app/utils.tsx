import z, { ZodSchema } from "zod/v4";
import {
  Annotation,
  TimeRegionSchema,
  TimePointSchema,
  TimePoint,
  TimeRegion,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
  PolygonAnnotationSchema,
  Polygon,
  Sample,
  TimeSeriesFileDataSchema,
  ShotDataSchema,
  ViewParams,
  Profile2DViewParams,
  BoundingBoxAnnotationSchema,
  BoundingBox,
  BoundingBoxSchema,
  PolygonSchema,
  PolygonAnnotation,
  BoundingBoxAnnotation,
} from "@/types";
import { v4 as uuidv4 } from "uuid";

const colorPalette = [
  "#FF5733",
  "#33FF57",
  "#3357FF",
  "#FF33A8",
  "#A833FF",
  "#33FFF6",
  "#FFC733",
  "#8DFF33",
  "#FF3380",
  "#33A8FF",
  "#FF8D33",
  "#3380FF",
  "#33FFAA",
  "#FFAA33",
  "#AA33FF",
  "#FF3333",
];

export function randomColor(index: number): string {
  const color = colorPalette[index % colorPalette.length];
  return color;
}

export const linspace = (start: number, end: number, num: number) => {
  const step = (end - start) / (num - 1);
  const arr = [];
  for (let i = 0; i < num; i++) {
    arr.push(start + step * i);
  }
  return arr;
};

export const convertDisplayAnnotationToAnnotation = (
  annotation: DisplayAnnotation,
  viewParams: ViewParams,
): Annotation => {
  const signalName = (viewParams as Profile2DViewParams)?.signal_name || null;

  if (ZoneSchema.safeParse(annotation).success) {
    const zone = ZoneSchema.parse(annotation);
    const timeRegion: TimeRegion = {
      signal_name: signalName,
      created_by: zone.created_by,
      type: "time_region",
      project_id: null,
      sample_id: null,
      validated: false,
      uncertainty: 1,
      time_min: zone.x0,
      time_max: zone.x1,
      label: zone.category.name,
    };
    return timeRegion;
  } else if (VSpanSchema.safeParse(annotation).success) {
    const vspan = VSpanSchema.parse(annotation);
    const timePoint: TimePoint = {
      signal_name: signalName,
      validated: false,
      uncertainty: 1,
      created_by: vspan.created_by,
      type: "time_point",
      time: vspan.x,
      label: vspan.category.name,
    };
    return timePoint;
  } else if (PolygonSchema.safeParse(annotation).success) {
    const polygon = PolygonSchema.parse(annotation);
    const polygonAnnotation: PolygonAnnotation = {
      signal_name: signalName,
      validated: false,
      uncertainty: 1,
      created_by: polygon.created_by,
      type: "polygon",
      segmentation: [
        polygon.x.reduce<number[]>((acc, x, index) => {
          acc.push(x);
          acc.push(polygon.y[index]);
          return acc;
        }, []),
      ],
      label: polygon.category.name,
    };
    return polygonAnnotation;
  } else if (BoundingBoxSchema.safeParse(annotation).success) {
    const bbox = BoundingBoxSchema.parse(annotation);
    const bboxAnnotation: BoundingBoxAnnotation = {
      signal_name: signalName,
      validated: false,
      uncertainty: 1,
      created_by: bbox.created_by,
      type: "bounding_box",
      x0: bbox.x0,
      y0: bbox.y0,
      x1: bbox.x1,
      y1: bbox.y1,
      label: bbox.category.name,
    };
    return bboxAnnotation;
  } else {
    throw new Error("Unsupported annotation type");
  }
};

export const createAnnotationToDisplayAnnotationFunc = (
  colors: Record<string, string>,
) => {
  const convertAnnotationToDisplayAnnotation = (item: Annotation) => {
    if (TimeRegionSchema.safeParse(item).success) {
      const timeRegion = TimeRegionSchema.parse(item);
      const zone: Zone = {
        selected: false,
        created_by: timeRegion.created_by,
        x0: timeRegion.time_min,
        x1: timeRegion.time_max,
        category: {
          name: timeRegion.label,
          color: colors[timeRegion.label] || "rgb(150, 150, 150)",
        },
      };
      return zone;
    } else if (TimePointSchema.safeParse(item).success) {
      const timePoint = TimePointSchema.parse(item);
      const vspan: VSpan = {
        selected: false,
        created_by: timePoint.created_by,
        x: timePoint.time,
        category: {
          name: timePoint.label,
          color: colors[timePoint.label] || "rgb(150, 150, 150)",
        },
      };
      return vspan;
    } else if (PolygonAnnotationSchema.safeParse(item).success) {
      const polygonData = PolygonAnnotationSchema.parse(item);
      const polygon: Polygon = {
        x: polygonData.segmentation[0].filter((_, index) => index % 2 === 0),
        y: polygonData.segmentation[0].filter((_, index) => index % 2 === 1),
        created_by: polygonData.created_by,
        category: {
          name: polygonData.label,
          color: colors[polygonData.label] || "rgb(150, 150, 150)",
        },
        selected: false,
      };
      return polygon;
    } else if (BoundingBoxAnnotationSchema.safeParse(item).success) {
      const bboxData = BoundingBoxAnnotationSchema.parse(item);
      const bbox: BoundingBox = {
        x_min: bboxData.x_min,
        y_min: bboxData.y_min,
        width: bboxData.width,
        height: bboxData.height,
        created_by: bboxData.created_by,
        category: {
          name: bboxData.label,
          color: colors[bboxData.label] || "rgb(150, 150, 150)",
        },
        selected: false,
      };

      return bbox;
    } else {
      console.error(
        "annotation",
        TimeRegionSchema.safeParse(item).error?.message,
      );
      throw new Error("Unsupported annotation type");
    }
  };
  return convertAnnotationToDisplayAnnotation;
};

export function updateAnnotations<T>(
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[],
  ) => void,
  newDisplayAnnotations: DisplayAnnotation[],
  schema: ZodSchema<T>,
  viewParams: ViewParams,
): void {
  setAnnotations((prevAnnotations: Annotation[]) => {
    const otherAnnotations: Annotation[] = prevAnnotations.filter(
      (item: Annotation) => !schema.safeParse(item).success,
    );
    let newAnnotations: Annotation[] = newDisplayAnnotations.map(
      (displayAnnotation) =>
        convertDisplayAnnotationToAnnotation(displayAnnotation, viewParams),
    );

    newAnnotations = newAnnotations.concat(otherAnnotations);
    return newAnnotations;
  });
}

// Utility function to find the maximum value in an array
// Handles very large arrays efficiently
export function arrayMax(arr: (number | null)[]): number {
  let traceMax = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== null && arr[i] > traceMax) traceMax = arr[i];
  }
  return traceMax;
}

// Utility function to find the minimum value in an array
// Handles very large arrays efficiently
export function arrayMin(arr: (number | null)[]): number {
  let traceMin = Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== null && arr[i] < traceMin) traceMin = arr[i];
  }
  return traceMin;
}

export function convertRawAnnotationsToTimeSeries(
  annotation: Annotation,
): TimeSeriesAnnotation | null {
  if (TimeRegionSchema.safeParse(annotation).success) {
    const timeRegion = TimeRegionSchema.parse(annotation);
    return {
      id: uuidv4(),
      created_by: timeRegion.created_by,
      label: timeRegion.label,
      type: TimeSeriesAnnotationType.TIME_REGION,
      points: [
        { x: timeRegion.time_min, y: 0 },
        { x: timeRegion.time_max, y: 0 },
      ],
      selected: false,
    };
  }

  if (TimePointSchema.safeParse(annotation).success) {
    const timePoint = TimePointSchema.parse(annotation);
    return {
      id: uuidv4(),
      created_by: timePoint.created_by,
      label: timePoint.label,
      type: TimeSeriesAnnotationType.TIME_POINT,
      points: [{ x: timePoint.time, y: 0 }],
      selected: false,
    };
  }

  console.warn(
    `The following annotation could not be parsed into a time series annotation:\n ${annotation}`,
  );
  return null;
}

export function convertTimeSeriesToRawAnnotations(
  annotation: TimeSeriesAnnotation,
): Annotation | null {
  if (annotation.type === TimeSeriesAnnotationType.TIME_POINT) {
    const timePoint: TimePoint = {
      project_id: null,
      sample_id: null,
      validated: false,
      uncertainty: 1,
      created_by: annotation.created_by,
      type: "time_point",
      time: annotation.points[0].x,
      label: annotation.label,
    };
    return timePoint;
  }

  if (annotation.type === TimeSeriesAnnotationType.TIME_REGION) {
    const timePoint: TimeRegion = {
      project_id: null,
      sample_id: null,
      validated: false,
      uncertainty: 1,
      created_by: annotation.created_by,
      type: "time_region",
      time_min: annotation.points[0].x,
      time_max: annotation.points[1].x,
      label: annotation.label,
    };
    return timePoint;
  }

  console.warn(
    `The following annotation could not be parsed into a raw annotation:\n ${annotation}`,
  );
  return null;
}

export function sumOverFirstAxis(arr: (number | null)[][]): number[] {
  if (arr.length === 0) return [];

  const numCols = arr[0].length;
  const sums = new Array(numCols).fill(0);

  for (const row of arr) {
    for (let j = 0; j < numCols; j++) {
      if (row[j] !== null) {
        sums[j] += row[j];
      }
    }
  }

  return sums;
}

export const applyGlobalStyle = (layout: Partial<Plotly.Layout>) => {
  // Handle dark mode styling
  // We should probably move all the styling to this central component
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (isDarkMode) {
    layout.xaxis!.title!.font = { color: "rgb(255, 255, 255)" };
    layout.xaxis!.linecolor = "rgb(255, 255, 255)";
    layout.xaxis!.zerolinecolor = "rgb(255, 255, 255)";
    layout.xaxis!.tickcolor = "rgb(255, 255, 255)";
    layout.xaxis!.tickfont = { color: "rgb(255, 255, 255)" };

    layout.yaxis!.title!.font = { color: "rgb(255, 255, 255)" };
    layout.yaxis!.linecolor = "rgb(255, 255, 255)";
    layout.yaxis!.zerolinecolor = "rgb(255, 255, 255)";
    layout.yaxis!.tickcolor = "rgb(255, 255, 255)";
    layout.yaxis!.tickfont = { color: "rgb(255, 255, 255)" };

    layout.yaxis2!.title!.font = { color: "rgb(255, 255, 255)" };
    layout.yaxis2!.linecolor = "rgb(255, 255, 255)";
    layout.yaxis2!.zerolinecolor = "rgb(255, 255, 255)";
    layout.yaxis2!.tickcolor = "rgb(255, 255, 255)";
    layout.yaxis2!.tickfont = { color: "rgb(255, 255, 255)" };

    if (layout.coloraxis && layout.coloraxis.colorbar) {
      layout.coloraxis!.colorbar!.tickcolor = "rgb(255, 255, 255)";
      layout.coloraxis!.colorbar!.tickfont = { color: "rgb(255, 255, 255)" };
      layout.coloraxis!.colorbar!.outlinecolor = "rgb(255, 255, 255)";
    }

    layout.paper_bgcolor = "rgba(0, 0, 0, 0)"; // Transparent background of area around the plot
    layout.plot_bgcolor = "rgba(0, 0, 0, 0)"; // Transparent background of the plot area
  }
  return layout;
};

export function getSignalNames(sample: Sample | null): string[] {
  const sampleDataType = z.union([TimeSeriesFileDataSchema, ShotDataSchema]);

  if (!sample || !sampleDataType.safeParse(sample.data).success) {
    return [];
  }

  const signal_names = sampleDataType.parse(sample.data).signal_names;
  return signal_names;
}

export function shallowEqual(a: object, b: object) {
  if (a === b) return true;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}
