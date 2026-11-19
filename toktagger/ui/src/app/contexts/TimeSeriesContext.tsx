"use client";

import {
  Annotation,
  SelectionRange,
  TimeSeriesAnnotation,
  TimeSeriesAnnotationType,
  TimeSeriesCategory,
  TimeSeriesToolDefinition,
  ToolingCallbacks,
} from "@/types";
import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { useSample } from "./SampleContext";
import { useAuth } from "./AuthContext";
import { useAnnotationTools } from "./AnnotationToolContext";
import { usePanelId } from "./PanelDataContext";
import { useWorkspace } from "./WorkspaceContext";
import {
  convertRawAnnotationsToTimeSeries,
  convertTimeSeriesToRawAnnotations,
  isTimeSeriesAnnotation,
} from "../utils";
import { Item, ItemParams, Menu, Submenu } from "react-contexify";

type TimeSeriesActions = {
  setAnnotations: (annotations: TimeSeriesAnnotation[]) => void;
  createAnnotation: (
    type: TimeSeriesAnnotationType,
    label: string,
  ) => TimeSeriesAnnotation;
  addAnnotation: (annotation: TimeSeriesAnnotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (annotation: TimeSeriesAnnotation) => void;
  getAnnotation: (id: string) => TimeSeriesAnnotation | null;
  setAnnotationTool: (tool: TimeSeriesToolDefinition | null) => void;
  registerTooling: (
    type: TimeSeriesAnnotationType,
    callbacks: ToolingCallbacks,
  ) => void;
  triggerUpdate: () => void;
  selectAnnotations: (ids: string[]) => void;
  findSelectedAnnotations: (range: SelectionRange | null) => void;
  setEditMode: (turnOn: boolean) => void;
  setOngoingAction: (state: boolean) => void;
  setFocusXRange: (range: [number, number] | null) => void;
};

type TimeSeriesState = {
  annotations: TimeSeriesAnnotation[];
  activeAnnotationTool: TimeSeriesToolDefinition | null;
  toolingCallbacks: Map<TimeSeriesAnnotationType, ToolingCallbacks>;
  forceUpdate: number;
  isDrawing: boolean;
  ongoingAction: boolean;
  categories: Map<string, TimeSeriesCategory>;
  editMode: boolean;
  canAnnotate: boolean;
  focusXRange: [number, number] | null;
};

const TimeSeriesActionsContext = createContext<TimeSeriesActions | null>(null);
const TimeSeriesStateContext = createContext<TimeSeriesState | null>(null);

export const useTimeSeriesActions = () => {
  const context = useContext(TimeSeriesActionsContext);
  if (!context) {
    throw new Error(
      "useTimeSeriesActions must be used within a TimeSeriesProvider",
    );
  }
  return context;
};

export const useTimeSeriesState = () => {
  const context = useContext(TimeSeriesStateContext);
  if (!context) {
    throw new Error(
      "useTimeSeriesState must be used within a TimeSeriesProvider",
    );
  }
  return context;
};

export const TIME_SERIES_ANNOTATION_MENU = "time-series-annotation-menu";

// Each provider owns its own menu, so panels with the same tools do not open each other's menu.
const AnnotationMenuIdContext = createContext(TIME_SERIES_ANNOTATION_MENU);

export const useAnnotationMenuId = () => useContext(AnnotationMenuIdContext);

// Annotations bound to another signal belong to other panels, so they are kept but not shown here.
const isShownForSignal =
  (signalName: string | null) =>
  (annotation: { signal_name?: string | null }) =>
    signalName === null ||
    !annotation.signal_name ||
    annotation.signal_name === signalName;

export const TimeSeriesProvider = ({
  signalName = null,
  children,
}: {
  // Binds annotations created here to a signal; null for single-signal views.
  signalName?: string | null;
  children: React.ReactNode;
}) => {
  const {
    annotations: rawAnnotations,
    setAnnotations: setRawAnnotations,
    canAnnotate,
  } = useSample();
  const { user } = useAuth();

  const [annotations, setAnnotations] = useState<TimeSeriesAnnotation[]>([]);
  const annotationMenuId = `${TIME_SERIES_ANNOTATION_MENU}-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [toolingCallbacks, setToolingCallbacks] = useState<
    Map<TimeSeriesAnnotationType, ToolingCallbacks>
  >(new Map());
  const [updateCounter, setUpdateCounter] = useState(0);
  const [syncCounter, setSyncCounter] = useState(0);
  const [syncRequest, setSyncRequest] = useState(0);
  const [ongoingAction, setOngoingAction] = useState(false);
  const {
    editMode,
    setEditMode,
    activeAnnotationTool: activeTool,
    setAnnotationTool,
    categories,
    isDrawing,
    registerToolTypes,
    registerCancel,
    registerEditModeChange,
  } = useAnnotationTools();
  const panelId = usePanelId();
  const { activePanelId } = useWorkspace();
  const ownerId = useId();
  const isActivePanel = !panelId || activePanelId === panelId;
  const [focusXRange, setFocusXRange] = useState<[number, number] | null>(null);

  // Leaving edit mode commits pending edits now, so a quick Save cannot miss the sync debounce.
  useEffect(
    () =>
      registerEditModeChange(ownerId, (next) => {
        if (!next) setSyncCounter((prev) => (prev + 1) % 100);
      }),
    [ownerId, registerEditModeChange],
  );

  // Selection is an Edit Mode concept, so leaving Edit Mode clears it
  useEffect(() => {
    if (editMode) return;
    setAnnotations((prev) =>
      prev.some((annotation) => annotation.selected)
        ? prev.map((annotation) => ({ ...annotation, selected: false }))
        : prev,
    );
  }, [editMode]);

  const lastSyncCount = useRef<number>(0);
  const pendingSyncRef = useRef(false);

  const parseRawAnnotations = (
    annotations: Annotation[],
  ): TimeSeriesAnnotation[] => {
    const parsedAnnotations: TimeSeriesAnnotation[] = [];
    annotations.forEach((annotation) => {
      const parsedAnnotation = convertRawAnnotationsToTimeSeries(annotation);
      if (parsedAnnotation) parsedAnnotations.push(parsedAnnotation);
    });
    return parsedAnnotations;
  };

  const parseTimeSeriesAnnotations = (
    annotations: TimeSeriesAnnotation[],
  ): Annotation[] => {
    const parsedAnnotations: Annotation[] = [];
    annotations.forEach((annotation) => {
      const parsedAnnotation = convertTimeSeriesToRawAnnotations(annotation);
      if (parsedAnnotation) parsedAnnotations.push(parsedAnnotation);
    });
    return parsedAnnotations;
  };

  // The sample's annotations are shared with other tools, so this view must replace
  // only its own and carry the rest through untouched. Without this, annotations it
  // cannot represent - shot labels, for example - are lost on every edit.
  const isShownHere = isShownForSignal(signalName);

  const mergeTimeSeriesAnnotations = (
    previous: Annotation[],
    updated: TimeSeriesAnnotation[],
  ): Annotation[] => {
    // TimeSeriesAnnotation carries none of project_id, sample_id, shot_id, timestamp,
    // validated or uncertainty, so the conversion back has to invent them. Right for a
    // shape drawn here, but for an annotation that already exists those invented values
    // would be written over the stored ones - downgrading somebody else's validated
    // work on any edit before a save, and making every untouched annotation look edited
    // to othersHaveUnsavedEdits (see core.tsx), which diffs on the full object.
    const stored = new Map(
      previous
        .filter((annotation) => annotation._id)
        .map((annotation) => [annotation._id, annotation]),
    );
    return [
      ...previous.filter(
        (annotation) =>
          !isTimeSeriesAnnotation(annotation) || !isShownHere(annotation),
      ),
      ...parseTimeSeriesAnnotations(updated).map((annotation) => {
        const existing = annotation._id
          ? stored.get(annotation._id)
          : undefined;
        if (!existing) return annotation;
        return {
          ...annotation,
          project_id: existing.project_id,
          sample_id: existing.sample_id,
          shot_id: existing.shot_id,
          timestamp: existing.timestamp,
          validated: existing.validated,
          uncertainty: existing.uncertainty,
        };
      }),
    ];
  };

  // Discards any in-progress annotation for the currently active tool and clears the
  // ongoing-action flag - used whenever a draw is abandoned rather than completed normally
  const cancelOngoingAction = () => {
    if (!ongoingAction) return;
    if (activeTool) {
      toolingCallbacks.get(activeTool.type)?.cancel?.();
    }
    setOngoingAction(false);
  };

  useEffect(
    () => registerToolTypes(panelId ?? ownerId, [...toolingCallbacks.keys()]),
    [ownerId, panelId, registerToolTypes, toolingCallbacks],
  );

  // This is a reference to allow the up-to-date function to be called from within an effect without triggering a refresh
  const cancelOngoingActionRef = useRef(cancelOngoingAction);
  useEffect(() => {
    cancelOngoingActionRef.current = cancelOngoingAction;
  }, [cancelOngoingAction]);

  useEffect(
    () => registerCancel(ownerId, () => cancelOngoingActionRef.current()),
    [ownerId, registerCancel],
  );

  useEffect(() => {
    cancelOngoingActionRef.current(); // If the annotations are changed, any ongoing annotations must be cancelled
    setAnnotations(
      parseRawAnnotations(rawAnnotations).filter(isShownForSignal(signalName)),
    );
  }, [parseRawAnnotations, rawAnnotations, signalName]);

  // Each request restarts the timer; a ref-held timeout would stop the compiler memoising the callers.
  const requestSync = () => {
    pendingSyncRef.current = true;
    setSyncRequest((prev) => prev + 1);
  };

  useEffect(() => {
    if (syncRequest === 0) return;
    const timeout = setTimeout(() => {
      setSyncCounter((prev) => (prev + 1) % 100);
    }, 100);
    return () => clearTimeout(timeout);
  }, [syncRequest]);

  const syncAnnotations = () => {
    if (ongoingAction) {
      requestSync();
      return;
    }
    pendingSyncRef.current = false;
    setRawAnnotations((prev) => mergeTimeSeriesAnnotations(prev, annotations));
  };

  useEffect(() => {
    if (lastSyncCount.current === syncCounter) return;
    lastSyncCount.current = syncCounter;
    syncAnnotations();
  }, [syncAnnotations, syncCounter]);

  // A panel on a hidden tab unmounts, so an edit that has not synced yet is committed first.
  const flushSyncRef = useRef(() => {});
  useEffect(() => {
    flushSyncRef.current = () =>
      setRawAnnotations((prev) =>
        mergeTimeSeriesAnnotations(prev, annotations),
      );
  }, [annotations, mergeTimeSeriesAnnotations, setRawAnnotations]);
  useEffect(
    () => () => {
      if (pendingSyncRef.current) flushSyncRef.current();
    },
    [],
  );

  const createAnnotation = (
    type: TimeSeriesAnnotationType,
    label: string,
  ): TimeSeriesAnnotation => {
    const id = uuidv4();
    return {
      id,
      db_id: null,
      created_by: user?._id ?? "manual",
      created_by_name: user?.username,
      label,
      signal_name: signalName,
      type,
      points: [],
      selected: false,
    };
  };

  const addAnnotation = (annotation: TimeSeriesAnnotation) => {
    requestSync();
    setAnnotations((prev) => [...prev, annotation]);
  };

  const removeAnnotation = (id: string) => {
    requestSync();
    setAnnotations((prev) => prev.filter((annotation) => annotation.id !== id));
  };

  const getAnnotation = (id: string) => {
    annotations.forEach((annotation) => {
      if (annotation.id === id) return annotation;
    });
    console.warn(`Annotation with id: ${id} could not be found`);
    return null;
  };

  const registerTooling = (
    type: TimeSeriesAnnotationType,
    callbacks: ToolingCallbacks,
  ) => {
    setToolingCallbacks((prev) => {
      if (prev.has(type)) return prev;
      const newMap = new Map(prev);
      newMap.set(type, callbacks);
      return newMap;
    });
  };

  const updateAnnotation = (annotation: TimeSeriesAnnotation) => {
    requestSync();
    setAnnotations((prev) =>
      prev.map((item) =>
        item.id === annotation.id
          ? { ...annotation, selected: item.selected }
          : item,
      ),
    );
  };

  const triggerUpdate = () => {
    setUpdateCounter((prev) => (prev + 1) % 100);
  };

  const selectAnnotations = (ids: string[]) => {
    if (!editMode) return;

    const updated_state: TimeSeriesAnnotation[] = annotations.map(
      (annotation) => {
        if (ids.includes(annotation.id)) {
          return { ...annotation, selected: true };
        }
        return { ...annotation, selected: false };
      },
    );

    setAnnotations(updated_state);
  };

  const findSelectedAnnotations = (range: SelectionRange | null) => {
    if (!editMode) return;

    if (!range) {
      const updated_state: TimeSeriesAnnotation[] = annotations.map(
        (annotation) => ({ ...annotation, selected: false }),
      );
      setAnnotations(updated_state);
      return;
    }

    const updated_state: TimeSeriesAnnotation[] = annotations.map(
      (annotation) => {
        if (annotation.type === TimeSeriesAnnotationType.TIME_REGION) {
          if (
            annotation.points[0].x > range.x.low &&
            annotation.points[1].x < range.x.high
          ) {
            return { ...annotation, selected: true };
          }
          return { ...annotation, selected: false };
        }
        if (annotation.type === TimeSeriesAnnotationType.TIME_POINT) {
          if (
            annotation.points[0].x > range.x.low &&
            annotation.points[0].x < range.x.high
          ) {
            return { ...annotation, selected: true };
          }
          return { ...annotation, selected: false };
        }
        if (annotation.type === TimeSeriesAnnotationType.BOUNDING_BOX) {
          if (
            annotation.points[0].x > range.x.low &&
            annotation.points[1].x < range.x.high &&
            annotation.points[1].y > range.y.low &&
            annotation.points[0].y < range.y.high
          ) {
            return { ...annotation, selected: true };
          }
          return { ...annotation, selected: false };
        }
        if (annotation.type === TimeSeriesAnnotationType.POLYGON) {
          const selected =
            annotation.points.length > 0 &&
            annotation.points.every(
              (point) =>
                point.x >= range.x.low &&
                point.x <= range.x.high &&
                point.y >= range.y.low &&
                point.y <= range.y.high,
            );

          return {
            ...annotation,
            selected,
          };
        }
        return { ...annotation, selected: false };
      },
    );

    setAnnotations(updated_state);
  };

  const batchUpdateLabels = (category: TimeSeriesCategory) => {
    const updatedState: TimeSeriesAnnotation[] = annotations.map(
      (annotation) => {
        // Label should only be changed if it is the annotation is the correct type and selected
        if (annotation.type === category.type && annotation.selected) {
          return { ...annotation, label: category.label };
        }
        return annotation;
      },
    );

    setRawAnnotations((prev) => mergeTimeSeriesAnnotations(prev, updatedState));
  };

  // Writes straight through to the sample's annotations, unlike removeAnnotation,
  // which only drops a half-drawn shape from this view's own working copy.
  const deleteAnnotations = (
    shouldDelete: (annotation: TimeSeriesAnnotation) => boolean,
  ) => {
    setRawAnnotations((prev) =>
      mergeTimeSeriesAnnotations(
        prev,
        annotations.filter((annotation) => !shouldDelete(annotation)),
      ),
    );
  };

  const batchDeleteAnnotations = () =>
    deleteAnnotations((annotation) => annotation.selected ?? false);

  const actionsValue: TimeSeriesActions = {
    setAnnotations,
    createAnnotation,
    addAnnotation,
    removeAnnotation,
    setAnnotationTool,
    registerTooling,
    updateAnnotation,
    getAnnotation,
    triggerUpdate,
    selectAnnotations,
    findSelectedAnnotations,
    setEditMode,
    setOngoingAction,
    setFocusXRange,
  };

  const stateValue: TimeSeriesState = {
    annotations,
    activeAnnotationTool: activeTool,
    toolingCallbacks,
    forceUpdate: updateCounter,
    isDrawing,
    ongoingAction,
    categories,
    editMode,
    canAnnotate,
    focusXRange,
  };

  useEffect(() => {
    if (!editMode || !isActivePanel) return;

    const deleteSelection = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        batchDeleteAnnotations();
      }
    };

    document.addEventListener("keydown", deleteSelection);

    return () => {
      document.removeEventListener("keydown", deleteSelection);
    };
  }, [
    annotations,
    batchDeleteAnnotations,
    editMode,
    isActivePanel,
    parseTimeSeriesAnnotations,
    setRawAnnotations,
  ]);

  const annotationLabels = Array.from(categories.values()).map(
    (category, index) => {
      return (
        <Item
          key={`update${index}`}
          id={`update${index}`}
          hidden={({ props }) => props.annotation.type !== category.type}
          onClick={({ props }) => {
            const annotation = props.annotation as TimeSeriesAnnotation;
            // If this annotation is selected, batch update all selected annotation
            if (annotation.selected) {
              batchUpdateLabels(category);
              return;
            }

            // If the annotation is not selected, only update this one
            const newAnnotation: TimeSeriesAnnotation = {
              ...props.annotation,
              label: category.label,
            };
            updateAnnotation(newAnnotation);
          }}
        >
          {category.label}
        </Item>
      );
    },
  );

  return (
    <TimeSeriesActionsContext.Provider value={actionsValue}>
      <TimeSeriesStateContext value={stateValue}>
        <AnnotationMenuIdContext.Provider value={annotationMenuId}>
          {children}
        </AnnotationMenuIdContext.Provider>
        <Menu id={annotationMenuId}>
          <Item
            id="delete"
            onClick={({ props }: ItemParams) => {
              const annotation = props.annotation as TimeSeriesAnnotation;
              // If this annotation is selected, batch delete all selected annotation
              if (annotation.selected) {
                batchDeleteAnnotations();
                return;
              }

              // If the annotation is not selected, only delete this one
              deleteAnnotations(
                (candidate) => candidate.id === props.annotation.id,
              );
            }}
          >
            Delete
          </Item>
          <Submenu label="Set type">{annotationLabels}</Submenu>
        </Menu>
      </TimeSeriesStateContext>
    </TimeSeriesActionsContext.Provider>
  );
};
