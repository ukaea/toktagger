import { useSample } from "@/app/contexts/SampleContext";
import { createAnnotationToDisplayAnnotationFunc } from "@/app/utils";
import { Annotation, Category, BoundingBox, BoundingBoxSchema } from "@/types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface BoundingBoxContextType {
  boundingBoxes: BoundingBox[];
  categories: Category[];
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
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>(
    initialData ?? [],
  );

  const categoryColors = useMemo(
    () =>
      categories.reduce<Record<string, string>>((acc, curr) => {
        acc[curr.name] = curr.color;
        return acc;
      }, {}),
    [categories],
  );

  useEffect(() => {
    if (!annotations) return;

    const convertAnnotationToDisplayAnnotation =
      createAnnotationToDisplayAnnotationFunc(categoryColors);

    const newBoundingBoxes = annotations
      .filter((x: Annotation) => x.type === "bounding_box")
      .map((x: Annotation) => convertAnnotationToDisplayAnnotation(x))
      .map((x) => BoundingBoxSchema.parse(x));

    setBoundingBoxes(newBoundingBoxes);
  }, [annotations, categoryColors]);

  return (
    <BoundingBoxContext.Provider
      value={{
        boundingBoxes: boundingBoxes,
        categories: categories,
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
