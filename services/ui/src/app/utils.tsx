import { ZodSchema } from "zod/v4";
import { DisplayAnnotation, Annotation, Annotations, TimeRegionSchema, ZoneSchema, VSpanSchema, TimePointSchema, VSpan, Zone, TimePoint, TimeRegion} from "@/types"

export const convertDisplayAnnotationToAnnotation = (annotation: DisplayAnnotation): Annotation => {
    if (ZoneSchema.safeParse(annotation).success) {
        const zone = ZoneSchema.parse(annotation);
        const timeRegion: TimeRegion = {
            time_min: zone.x0,
            time_max: zone.x1,
            label: zone.category.name
        };
        return timeRegion;
    } else if (VSpanSchema.safeParse(annotation).success) {
        const vspan = VSpanSchema.parse(annotation);
        const timePoint: TimePoint = {
            time: vspan.x,
            label: vspan.category.name
        }
        return timePoint;
    } else {
        throw new Error("Unsupported annotation type");
    }
};


export const createAnnotationToDisplayAnnotationFunc = (colors: Record<string, string>) => {
    const convertAnnotationToDisplayAnnotation = (item: Annotation) => {
        if (TimeRegionSchema.safeParse(item).success) {
            const timeRegion = TimeRegionSchema.parse(item);
            const zone: Zone = {
                x0: timeRegion.time_min,
                x1: timeRegion.time_max,
                category: { name: timeRegion.label, color: colors[timeRegion.label]},
            };
            return zone;
        } else if (TimePointSchema.safeParse(item).success) {
            const timePoint = TimePointSchema.parse(item);
            const vspan: VSpan = {
                x: timePoint.time,
                category: { name: timePoint.label, color: colors[timePoint.label] },
            };
            return vspan;
        } else {
            throw new Error("Unsupported annotation type");
        }
    };
    return convertAnnotationToDisplayAnnotation;
}
export function updateAnnotations<T> (setAnnotations: (annotations: Annotations) => void, newDisplayAnnotations: DisplayAnnotation[], schema: ZodSchema<T>): void {
    setAnnotations((prevAnnotations: Annotations) => {
        const otherAnnotations: Annotations = prevAnnotations.filter((item: Annotation) => !schema.safeParse(item).success);
        let newAnnotations: Annotations = newDisplayAnnotations.map(convertDisplayAnnotationToAnnotation);
        newAnnotations = newAnnotations.concat(otherAnnotations);
        return newAnnotations;
    });
}