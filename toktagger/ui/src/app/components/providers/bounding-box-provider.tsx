import { useSample } from "@/app/contexts/SampleContext";
import { createAnnotationToDisplayAnnotationFunc } from "@/app/utils";
import { Annotation, Category, BoundingBox, BoundingBoxSchema } from "@/types";
import { createContext, useContext, useEffect, useRef } from "react";

interface BoundingBoxContextType {
  boundingBoxes: BoundingBox[];
}

const BoundingBoxContext = createContext<BoundingBoxContextType | undefined>(
  undefined,
);

export const BoundingBoxProvider = ({
  categories,
  initialData,
  children,
}: {
  categories: Category[];
  initialData?: BoundingBox[];
  children: React.ReactNode;
}) => {
  const { annotations } = useSample();
  const boundingBoxes = useRef<BoundingBox[]>(initialData ?? []);

  const categoryColors = categories.reduce<Record<string, string>>(
    (acc, curr) => {
      acc[curr.name] = curr.color;
      return acc;
    },
    {},
  );

  useEffect(() => {
    if (!annotations) return;

    const convertAnnotationToDisplayAnnotation =
      createAnnotationToDisplayAnnotationFunc(categoryColors);

    const newBoundingBoxes: BoundingBox[] = annotations
      .filter((x: Annotation) => x.type === "bounding_box")
      .map((x: Annotation) => convertAnnotationToDisplayAnnotation(x))
      .map((x) => BoundingBoxSchema.parse(x));

    boundingBoxes.current = newBoundingBoxes;
  }, [annotations, categoryColors]);

  return (
    <BoundingBoxContext.Provider
      value={{
        boundingBoxes: boundingBoxes.current,
      }}
    >
      {children}
    </BoundingBoxContext.Provider>
  );
};

export function useBoundingBoxContext() {
  const context = useContext(BoundingBoxContext);
  if (context === undefined) {
    throw new Error(
      "useBoundingBoxContext must be used within a PolygonProvider",
    );
  }
  return context;
}
