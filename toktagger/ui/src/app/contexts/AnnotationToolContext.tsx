"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TimeSeriesAnnotationType,
  TimeSeriesCategory,
  TimeSeriesToolDefinition,
} from "@/types";
import { randomColor } from "../utils";
import { useSample } from "./SampleContext";
import { useWorkspace } from "./WorkspaceContext";
import { isEditableEventTarget } from "../video/components/video-utils";

type AnnotationToolContextType = {
  editMode: boolean;
  setEditMode: (turnOn: boolean) => void;
  activeAnnotationTool: TimeSeriesToolDefinition | null;
  setAnnotationTool: (tool: TimeSeriesToolDefinition | null) => void;
  categories: Map<string, TimeSeriesCategory>;
  isDrawing: boolean;
  // Tool types that the active panel can draw.
  activePanelTools: TimeSeriesAnnotationType[];
  registerToolTypes: (
    ownerId: string,
    types: TimeSeriesAnnotationType[],
  ) => () => void;
  registerCancel: (ownerId: string, cancel: () => void) => () => void;
};

const AnnotationToolContext = createContext<
  AnnotationToolContextType | undefined
>(undefined);

const TOOL_ORDER = Object.values(TimeSeriesAnnotationType);

const activeToolKey = (projectId: string) => `ts-active-tool-${projectId}`;
const editModeKey = (projectId: string) => `ts-edit-mode-${projectId}`;

// Discards anything that isn't a well-formed tool, so corrupt storage cannot throw during render.
function readSavedTool(projectId: string): TimeSeriesToolDefinition | null {
  if (!projectId) return null;
  const saved = sessionStorage.getItem(activeToolKey(projectId));
  if (!saved) return null;

  try {
    const parsed: unknown = JSON.parse(saved);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as TimeSeriesToolDefinition).label === "string" &&
      TOOL_ORDER.includes((parsed as TimeSeriesToolDefinition).type)
    ) {
      return parsed as TimeSeriesToolDefinition;
    }
  } catch {
    // Malformed JSON - fall through and discard.
  }

  sessionStorage.removeItem(activeToolKey(projectId));
  return null;
}

function buildCategories(
  labelsByType: [TimeSeriesAnnotationType, string[] | undefined][],
): Map<string, TimeSeriesCategory> {
  const categories = new Map<string, TimeSeriesCategory>();
  labelsByType.forEach(([type, labels]) => {
    labels?.forEach((label, index) => {
      categories.set(`${type}_${label}`, {
        label,
        color: randomColor(index),
        type,
      });
    });
  });
  return categories;
}

/** Holds the annotation mode, tool and labels that all panels on the sample page share. */
export function AnnotationToolProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { project } = useSample();
  const projectId = project?._id ?? "";

  const [editMode, setEditMode] = useState<boolean>(
    () => sessionStorage.getItem(editModeKey(projectId)) === "true",
  );
  const [activeTool, setActiveTool] = useState<TimeSeriesToolDefinition | null>(
    null,
  );
  // Tool types and labels are not known on mount, so a restored tool waits here until they are.
  const [pendingTool, setPendingTool] =
    useState<TimeSeriesToolDefinition | null>(() => readSavedTool(projectId));
  const [isDrawing, setIsDrawing] = useState(false);
  const [toolTypesByOwner, setToolTypesByOwner] = useState<
    Map<string, TimeSeriesAnnotationType[]>
  >(new Map());
  const cancelHandlersRef = useRef(new Map<string, () => void>());
  const { activePanelId } = useWorkspace();
  // The last tool used in each panel, restored when the user comes back to that panel.
  const lastToolByPanelRef = useRef(
    new Map<string, TimeSeriesToolDefinition | null>(),
  );

  const categories = useMemo(
    () =>
      buildCategories([
        [TimeSeriesAnnotationType.TIME_POINT, project?.time_point_labels],
        [TimeSeriesAnnotationType.TIME_REGION, project?.time_region_labels],
        [TimeSeriesAnnotationType.BOUNDING_BOX, project?.bounding_box_labels],
        [TimeSeriesAnnotationType.POLYGON, project?.polygon_labels],
      ]),
    [project],
  );

  const availableTools = useMemo(() => {
    const registered = new Set([...toolTypesByOwner.values()].flat());
    return TOOL_ORDER.filter((type) => registered.has(type));
  }, [toolTypesByOwner]);

  const activePanelTools = useMemo(() => {
    const registered = toolTypesByOwner.get(activePanelId ?? "") ?? [];
    return TOOL_ORDER.filter((type) => registered.includes(type));
  }, [toolTypesByOwner, activePanelId]);

  const registerToolTypes = useCallback(
    (ownerId: string, types: TimeSeriesAnnotationType[]) => {
      setToolTypesByOwner((prev) => new Map(prev).set(ownerId, types));
      return () =>
        setToolTypesByOwner((prev) => {
          const next = new Map(prev);
          next.delete(ownerId);
          return next;
        });
    },
    [],
  );

  const registerCancel = useCallback((ownerId: string, cancel: () => void) => {
    cancelHandlersRef.current.set(ownerId, cancel);
    return () => {
      if (cancelHandlersRef.current.get(ownerId) === cancel) {
        cancelHandlersRef.current.delete(ownerId);
      }
    };
  }, []);

  const cancelAll = useCallback(() => {
    cancelHandlersRef.current.forEach((cancel) => cancel());
  }, []);

  const setAnnotationTool = useCallback(
    (tool: TimeSeriesToolDefinition | null) => {
      if (tool && !availableTools.includes(tool.type)) {
        console.warn(
          `Could not set ${tool.type} as active tool since no panel can draw it`,
        );
        return;
      }
      cancelAll();
      setActiveTool(tool);
      if (activePanelId) lastToolByPanelRef.current.set(activePanelId, tool);
    },
    [activePanelId, availableTools, cancelAll],
  );

  // A tool that the newly active panel cannot draw gives way to the last tool used in that panel.
  const previousPanelRef = useRef(activePanelId);
  useEffect(() => {
    if (previousPanelRef.current === activePanelId) return;
    previousPanelRef.current = activePanelId;
    if (pendingTool) return;
    setActiveTool((current) => {
      if (current && activePanelTools.includes(current.type)) return current;
      const remembered =
        lastToolByPanelRef.current.get(activePanelId ?? "") ?? null;
      return remembered && activePanelTools.includes(remembered.type)
        ? remembered
        : null;
    });
  }, [activePanelId, activePanelTools, pendingTool]);

  useEffect(() => {
    if (!projectId) return;
    sessionStorage.setItem(editModeKey(projectId), String(editMode));
  }, [editMode, projectId]);

  // Skipped while a restore is pending, so the initial null does not wipe the saved tool.
  useEffect(() => {
    if (!projectId || pendingTool) return;
    if (activeTool) {
      sessionStorage.setItem(
        activeToolKey(projectId),
        JSON.stringify(activeTool),
      );
    } else {
      sessionStorage.removeItem(activeToolKey(projectId));
    }
  }, [activeTool, projectId, pendingTool]);

  useEffect(() => {
    if (!pendingTool) return;
    if (availableTools.length === 0 || categories.size === 0) return;

    const labelExists = [...categories.values()].some(
      (category) =>
        category.type === pendingTool.type &&
        category.label === pendingTool.label,
    );
    if (labelExists) {
      setAnnotationTool(pendingTool);
    } else {
      sessionStorage.removeItem(activeToolKey(projectId));
    }
    setPendingTool(null);
  }, [pendingTool, availableTools, categories, projectId, setAnnotationTool]);

  useEffect(() => {
    const keyDownHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelAll();
      if (isEditableEventTarget(event.target)) return;
      if (event.key === "Control") setIsDrawing(true);
      if (
        event.key.toLowerCase() === "e" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        setEditMode((prev) => !prev);
      }
    };
    const keyUpHandler = (event: KeyboardEvent) => {
      if (event.key === "Control") setIsDrawing(false);
    };

    document.addEventListener("keydown", keyDownHandler);
    document.addEventListener("keyup", keyUpHandler);
    return () => {
      document.removeEventListener("keydown", keyDownHandler);
      document.removeEventListener("keyup", keyUpHandler);
    };
  }, [cancelAll]);

  const value = useMemo(
    () => ({
      editMode,
      setEditMode,
      activeAnnotationTool: activeTool,
      setAnnotationTool,
      categories,
      isDrawing,
      activePanelTools,
      registerToolTypes,
      registerCancel,
    }),
    [
      editMode,
      activeTool,
      setAnnotationTool,
      categories,
      isDrawing,
      activePanelTools,
      registerToolTypes,
      registerCancel,
    ],
  );

  return (
    <AnnotationToolContext.Provider value={value}>
      {children}
    </AnnotationToolContext.Provider>
  );
}

export function useAnnotationTools() {
  const context = useContext(AnnotationToolContext);
  if (context === undefined) {
    throw new Error(
      "useAnnotationTools must be used within an AnnotationToolProvider",
    );
  }
  return context;
}
