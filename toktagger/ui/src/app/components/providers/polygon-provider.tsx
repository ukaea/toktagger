import { useSample } from "@/app/contexts/SampleContext";
import { createAnnotationToDisplayAnnotationFunc } from "@/app/utils";
import { Annotation, Category, Polygon, PolygonSchema } from "@/types";
import { createContext, useContext, useEffect, useRef } from "react";

interface PolygonContextType {
  polygons: Polygon[];
}

const PolygonContext = createContext<PolygonContextType | undefined>(undefined);

export const PolygonProvider = ({
  categories,
  initialData,
  children,
}: {
  categories: Category[];
  initialData?: Polygon[];
  children: React.ReactNode;
}) => {
  const { annotations } = useSample();
  const polygons = useRef<Polygon[]>(initialData ?? []);

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

    const newPolygons: Polygon[] = annotations
      .filter((x: Annotation) => x.type === "polygon")
      .map((x: Annotation) => convertAnnotationToDisplayAnnotation(x))
      .map((x) => PolygonSchema.parse(x));

    polygons.current = newPolygons;
  }, [annotations, categoryColors]);

  return (
    <PolygonContext.Provider
      value={{
        polygons: polygons.current,
      }}
    >
      {children}
    </PolygonContext.Provider>
  );
};

export function usePolygonContext() {
  const context = useContext(PolygonContext);
  if (context === undefined) {
    throw new Error("usePolygonContext must be used within a PolygonProvider");
  }
  return context;
}
