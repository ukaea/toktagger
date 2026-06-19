import {
  Annotation,
  TimeRegionSchema,
  TimePointSchema,
  TimePoint,
  TimeRegion,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
} from "@/types";
import { v4 as uuidv4 } from "uuid";
import { Icon } from "@adobe/react-spectrum";

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

type IconProps = {
  "aria-label"?: string;
};

export function GitlabIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="80 80 220 220">
        <path
          fill="currentColor"
          d="M282.83,170.73l-.27-.69-26.14-68.22a6.81,6.81,0,0,0-2.69-3.24,7,7,0,0,0-8,.43,7,7,0,0,0-2.32,3.52l-17.65,54H154.29l-17.65-54A6.86,6.86,0,0,0,134.32,99a7,7,0,0,0-8-.43,6.87,6.87,0,0,0-2.69,3.24L97.44,170l-.26.69a48.54,48.54,0,0,0,16.1,56.1l.09.07.24.17,39.82,29.82,19.7,14.91,12,9.06a8.07,8.07,0,0,0,9.76,0l12-9.06,19.7-14.91,40.06-30,.1-.08A48.56,48.56,0,0,0,282.83,170.73Z"
        />
      </svg>
    </Icon>
  );
}
