import { ZodSchema } from "zod/v4";
import {
  DisplayAnnotation,
  Annotation,
  TimeRegionSchema,
  ZoneSchema,
  VSpanSchema,
  TimePointSchema,
  VSpan,
  Zone,
  TimePoint,
  TimeRegion,
  SpectrogramMaskSchema,
  SpectrogramMask,
  PolygonAnnotationSchema,
  Polygon,
  BoundingBoxSchema,
} from "@/types";

export const linspace = (start: number, end: number, num: number) => {
  const step = (end - start) / (num - 1);
  const arr = [];
  for (let i = 0; i < num; i++) {
    arr.push(start + step * i);
  }
  return arr;
};

export const convertDisplayAnnotationToAnnotation = (
  annotation: DisplayAnnotation
): Annotation => {
  if (ZoneSchema.safeParse(annotation).success) {
    const zone = ZoneSchema.parse(annotation);
    const timeRegion: TimeRegion = {
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
      project_id: null,
      sample_id: null,
      validated: false,
      uncertainty: 1,
      created_by: vspan.created_by,
      type: "time_point",
      time: vspan.x,
      label: vspan.category.name,
    };
    return timePoint;
  } else {
    throw new Error("Unsupported annotation type");
  }
};

export const createAnnotationToDisplayAnnotationFunc = (
  colors: Record<string, string>
) => {
  const convertAnnotationToDisplayAnnotation = (item: Annotation) => {
    if (TimeRegionSchema.safeParse(item).success) {
      const timeRegion = TimeRegionSchema.parse(item);
      const zone: Zone = {
        selected: false,
        created_by: timeRegion.created_by,
        x0: timeRegion.time_min,
        x1: timeRegion.time_max,
        category: { name: timeRegion.label, color: colors[timeRegion.label] },
      };
      return zone;
    } else if (TimePointSchema.safeParse(item).success) {
      const timePoint = TimePointSchema.parse(item);
      const vspan: VSpan = {
        selected: false,
        created_by: timePoint.created_by,
        x: timePoint.time,
        category: { name: timePoint.label, color: colors[timePoint.label] },
      };
      return vspan;
    } else if (SpectrogramMaskSchema.safeParse(item).success) {
      const mask = SpectrogramMaskSchema.parse(item);
      const spectrogramMask: SpectrogramMask = {
        values: mask.values,
      };
      return spectrogramMask;
    } else if (PolygonAnnotationSchema.safeParse(item).success) {
      const polygonData = PolygonAnnotationSchema.parse(item);
      const polygon: Polygon = {
        x: polygonData.segmentation[0].filter((_, index) => index % 2 === 0),
        y: polygonData.segmentation[0].filter((_, index) => index % 2 === 1),
      };
      return polygon;
    } else if (BoundingBoxSchema.safeParse(item).success) {
      const bbox = BoundingBoxSchema.parse(item);
      return bbox;
    } else {
      console.log(
        "annotation",
        TimeRegionSchema.safeParse(item).error?.message
      );
      throw new Error("Unsupported annotation type");
    }
  };
  return convertAnnotationToDisplayAnnotation;
};

export function updateAnnotations<T>(
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[] | Annotation[]
  ) => void,
  newDisplayAnnotations: DisplayAnnotation[],
  schema: ZodSchema<T>
): void {
  setAnnotations((prevAnnotations: Annotation[]) => {
    const otherAnnotations: Annotation[] = prevAnnotations.filter(
      (item: Annotation) => !schema.safeParse(item).success
    );
    let newAnnotations: Annotation[] = newDisplayAnnotations.map(
      convertDisplayAnnotationToAnnotation
    );
    newAnnotations = newAnnotations.concat(otherAnnotations);
    return newAnnotations;
  });
}

// Utility function to find the maximum value in an array
// Handles very large arrays efficiently
export function arrayMax(arr: number[]): number {
  let traceMax = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > traceMax) traceMax = arr[i];
  }
  return traceMax;
}

// Utility function to find the minimum value in an array
// Handles very large arrays efficiently
export function arrayMin(arr: number[]): number {
  let traceMin = Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < traceMin) traceMin = arr[i];
  }
  return traceMin;
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
