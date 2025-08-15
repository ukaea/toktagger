import {
  DisplayAnnotation,
  Annotation,
  Annotations,
  TimeRegionSchema,
  ZoneSchema,
  VSpanSchema,
  TimePointSchema,
  VSpan,
  Zone,
  TimePoint,
  TimeRegion,
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
      time_min: zone.x0,
      time_max: zone.x1,
      created_by: zone.created_by,
      type: "time_region",
      label: zone.category.name,
    };
    return timeRegion;
  } else if (VSpanSchema.safeParse(annotation).success) {
    const vspan = VSpanSchema.parse(annotation);
    const timePoint: TimePoint = {
      time: vspan.x,
      created_by: vspan.created_by,
      type: "time_point",
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
        created_by: timeRegion.created_by,
        selected: false,
        x0: timeRegion.time_min,
        x1: timeRegion.time_max,
        category: { name: timeRegion.label, color: colors[timeRegion.label] || 'lightblue' },
      };
      return zone;
    } else if (TimePointSchema.safeParse(item).success) {
      const timePoint = TimePointSchema.parse(item);
      const vspan: VSpan = {
        x: timePoint.time,
        created_by: timePoint.created_by,
        selected: false,
        category: { name: timePoint.label, color: colors[timePoint.label] || 'red' },
      };
      return vspan;
    } else {
      throw new Error("Unsupported annotation type");
    }
  };
  return convertAnnotationToDisplayAnnotation;
};

export function updateAnnotations<T>(
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations
  ) => void,
  newDisplayAnnotations: DisplayAnnotation[],
  schema: ZodSchema<T>
): void {
  setAnnotations((prevAnnotations: Annotations) => {
    const otherAnnotations: Annotations = prevAnnotations.filter(
      (item: Annotation) => !schema.safeParse(item).success
    );
    let newAnnotations: Annotations = newDisplayAnnotations.map(
      convertDisplayAnnotationToAnnotation
    );
    newAnnotations = newAnnotations.concat(otherAnnotations);
    return newAnnotations;
  });
}

export function saveJSONToFile(data: object, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2); // pretty print with 2 spaces
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // Clean up
}
