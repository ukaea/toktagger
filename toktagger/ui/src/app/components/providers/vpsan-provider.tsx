"use client";

import {
  Annotation,
  Category,
  ToolingTypes,
  VSpan,
  VSpanSchema,
} from "@/types";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Item, ItemParams, Menu, Submenu } from "react-contexify";
import { useContextMenuProvider } from "./annotation-provider";
import {
  convertDisplayAnnotationToAnnotation,
  createAnnotationToDisplayAnnotationFunc,
} from "@/app/utils";
import { useSample } from "@/app/contexts/SampleContext";

interface VSpanContextInfo {
  vspans: VSpan[];
  handleVSpanUpdate: () => void;
  handleVSpanDragFinish: () => void;
  handleVSpanDelete: (input: VSpan) => void;
  addVSpan: (x: number, category: Category) => void;
  activateTooling: () => void;
  triggerUpdate: number;
}

const VSpanContext = createContext<VSpanContextInfo | null>(null);

export const useVSpanContext = () => {
  const context = useContext(VSpanContext);
  if (!context) {
    throw new Error("useVSpanContext must be used within a VSpanProvider");
  }
  return context;
};

export const VSPAN_MENU_ID = "vspan-provider";

/**
 * Context provider that gives child components shared read/write to vspan data
 *
 * @param categories Array of categories that the vspans provided by this context can be
 * @param initialData Array of vspans that should be added when initialised
 */
export const VSpanProvider = ({
  categories,
  children,
  onModifyVSpan,
}: {
  categories: Category[];
  children: React.ReactNode;
  onModifyVSpan?: (newVSpans: VSpan[]) => void;
}) => {
  const spans = useRef<VSpan[]>([]);
  const [triggerUpdate, setTriggerUpdate] = useState(0); // Value should be changed to trigger refresh
  const { setToolingCallbacks, registerMenuItem } = useContextMenuProvider();

  const { annotations, viewParams, setAnnotations } = useSample();

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

    const newVSpans = annotations
      .filter((x: Annotation) => x.type === "time_point")
      .map((x: Annotation) => convertAnnotationToDisplayAnnotation(x))
      .map((x) => VSpanSchema.parse(x));

    spans.current = newVSpans;
  }, [annotations, categoryColors]);

  const updateAnnotations = useCallback(() => {
    if (!viewParams) return;

    const timeRegions = spans.current.map((span: VSpan) =>
      convertDisplayAnnotationToAnnotation(span, viewParams),
    );

    setAnnotations((currentAnnotations: Annotation[]) => {
      // Remove existing time_region annotations
      const filteredAnnotations = currentAnnotations.filter(
        (ann) => ann.type !== "time_point",
      );
      // Add updated timeRegions
      return [...filteredAnnotations, ...timeRegions];
    });
  }, [setAnnotations, viewParams]);

  // It is necessary for the context to trigger child refreshes
  const triggerVSpanUpdate = () => {
    setTriggerUpdate((current) => (current + 1) % 10);
  };

  // Provides a method for child components to trigger context refresh
  const handleVSpanUpdate = () => {
    triggerVSpanUpdate();
  };

  // Provides a method for child components to update on drag finish
  const handleVSpanDragFinish = () => {
    updateAnnotations();
    onModifyVSpan?.(spans.current);
  };

  const handleVSpanDelete = (input: VSpan) => {
    spans.current = spans.current.filter((span) => span !== input);
    spans.current = spans.current.filter((span) => !span.selected);
    triggerVSpanUpdate();
    updateAnnotations();
    onModifyVSpan?.(spans.current);
  };

  const handleTypeSetting = (
    { props }: ItemParams,
    targetCategory: Category,
  ) => {
    spans.current = spans.current.map((span) => {
      if (span === props.vspan) {
        span.category = targetCategory;
      }
      return span;
    });
    triggerVSpanUpdate();
    onModifyVSpan?.(spans.current);
  };

  const addVSpan = (x: number, category: Category) => {
    spans.current.push({
      created_by: "manual",
      selected: false,
      category,
      x,
    });
    triggerVSpanUpdate();
    updateAnnotations();
    onModifyVSpan?.(spans.current);
  };

  const activateTooling = () => {
    setToolingCallbacks({
      id: ToolingTypes.VSPAN,
      start: (x, _y) => {
        addVSpan(x, categories[0]);
      },
      move: (x, _y) => {
        spans.current[spans.current.length - 1].x = x;
        triggerVSpanUpdate();
      },
      end: (x, _y) => {
        spans.current[spans.current.length - 1].x = x;
        triggerVSpanUpdate();
        updateAnnotations();
        handleVSpanDragFinish();
      },
    });
  };

  // On initialisation the tool registers a menu item with the general context menu
  useEffect(() => {
    const add = (x: number, category: Category) => {
      spans.current.push({
        created_by: "manual",
        selected: false,
        category,
        x,
      });
      triggerVSpanUpdate();
      updateAnnotations();
      onModifyVSpan?.(spans.current);
    };

    const addVSpanItems = categories.map((category, index) => {
      return (
        <Item
          key={`add${index}`}
          id={`add${index}`}
          onClick={({ props }) => {
            add(props.x, category);
          }}
        >
          {category.name}
        </Item>
      );
    });

    /* Decide what to register in the main context-menu:
            - When there is exactly one V-Span category (e.g. “Disruption”) show a single top-level Item “Add Time Point”.
            - When there are multiple categories keep the existing “Add VSpan” submenu containing one Item per type.
            - This prevents an unnecessary extra click in the single-category case.
        */
    const menuElement =
      categories.length === 1 ? (
        // single-category Case
        <Item
          key="add-vspan-single"
          id="add-vspan-single"
          onClick={({ props }) => {
            add(props.x, categories[0]);
          }}
        >
          {`Add ${categories[0].name}`}
        </Item>
      ) : (
        // multiple-category branch
        <Submenu
          key="vspan-submenu"
          data-testid="vspan-submenu"
          label="Add Time Point"
        >
          {addVSpanItems}
        </Submenu>
      );
    registerMenuItem("vspan", menuElement);
  }, [categories, onModifyVSpan, registerMenuItem, updateAnnotations]);

  // Provides an array of the categories for the context menu
  const updateTypeItems = categories.map((category, index) => {
    return (
      <Item
        key={`update${index}`}
        id={`update${index}`}
        onClick={(props) => {
          handleTypeSetting(props, category);
        }}
      >
        {category.name}
      </Item>
    );
  });

  // The context provider is responsible for rendering the context menu relating to VSpans
  return (
    <VSpanContext.Provider
      value={{
        vspans: spans.current,
        handleVSpanUpdate,
        handleVSpanDragFinish,
        handleVSpanDelete,
        addVSpan,
        activateTooling,
        triggerUpdate,
      }}
    >
      {children}
      <Menu id={`${VSPAN_MENU_ID}`}>
        <Item
          id="delete"
          onClick={({ props }: ItemParams) => {
            handleVSpanDelete(props.vspan);
          }}
        >
          Delete
        </Item>
        {updateTypeItems.length > 1 && (
          <Submenu label="Set type">{updateTypeItems}</Submenu>
        )}
      </Menu>
    </VSpanContext.Provider>
  );
};
