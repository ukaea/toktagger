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
      time_min: zone.x0,
      time_max: zone.x1,
      label: zone.category.name,
    };
    return timeRegion;
  } else if (VSpanSchema.safeParse(annotation).success) {
    const vspan = VSpanSchema.parse(annotation);
    const timePoint: TimePoint = {
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
        created_by: timeRegion.created_by,
        x0: timeRegion.time_min,
        x1: timeRegion.time_max,
        category: { name: timeRegion.label, color: colors[timeRegion.label] },
      };
      return zone;
    } else if (TimePointSchema.safeParse(item).success) {
      const timePoint = TimePointSchema.parse(item);
      const vspan: VSpan = {
        created_by: timePoint.created_by,
        x: timePoint.time,
        category: { name: timePoint.label, color: colors[timePoint.label] },
      };
      return vspan;
    } else if (SpectrogramMaskSchema.safeParse(item).success) {
      const schema = SpectrogramMaskSchema.parse(item);
      const spectrogramMask: SpectrogramMask = {
        values: schema.values,
      };
      return spectrogramMask;
    } else {
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
