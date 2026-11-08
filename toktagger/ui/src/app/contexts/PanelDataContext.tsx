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
import { ToastQueue } from "@adobe/react-spectrum";
import {
  AnyViewParams,
  AnyViewParamsSchema,
  Data,
  DataParams,
  ImageDataSchema,
  MultiVariateTimeSeriesDataSchema,
  Panel,
  PanelKind,
  Profile2DDataSchema,
  Profile2DViewParams,
  Project,
  RadialProfileDataSchema,
  Sample,
  TaskType,
  ViewParams,
} from "@/types";
import { BACKEND_API_URL } from "@/app/core";
import { getSignalNames } from "@/app/utils";

type FrameBounds = { min: number | null; max: number | null };

type PanelState = {
  data: Data | null;
  dataParams: DataParams;
  viewParams: AnyViewParams;
  isLoading: boolean;
  error: string | null;
  videoFrameBounds: FrameBounds;
};

type PanelDataStore = {
  panels: Panel[];
  states: Record<string, PanelState>;
  updatePanel: (
    panelId: string,
    update: (prev: PanelState) => PanelState,
  ) => void;
};

type PanelDataContextType = PanelState & {
  panel: Panel;
  setDataParams: React.Dispatch<React.SetStateAction<DataParams>>;
  setViewParams: React.Dispatch<React.SetStateAction<AnyViewParams>>;
};

const PanelDataStoreContext = createContext<PanelDataStore | undefined>(
  undefined,
);
const PanelIdContext = createContext<string | undefined>(undefined);

const viewParamsKey = (projectId: string, panelId: string) =>
  `view-params-${projectId}:${panelId}`;

// Reads persisted view params, discarding anything that fails schema validation.
function readSavedViewParams(
  projectId: string,
  panelId: string,
): AnyViewParams {
  const fallback: ViewParams = { name: "identity" };
  const key = viewParamsKey(projectId, panelId);
  const saved = sessionStorage.getItem(key);
  if (!saved) return fallback;

  try {
    const result = AnyViewParamsSchema.safeParse(JSON.parse(saved));
    if (result.success) return result.data;
  } catch {
    // Malformed JSON - fall through and discard.
  }

  sessionStorage.removeItem(key);
  return fallback;
}

function initialPanelState(projectId: string, panelId: string): PanelState {
  return {
    data: null,
    dataParams: { name: "identity" },
    viewParams: readSavedViewParams(projectId, panelId),
    isLoading: true,
    error: null,
    videoFrameBounds: { min: null, max: null },
  };
}

const TASK_PANEL_KINDS: Record<
  Exclude<TaskType, TaskType.MultiPanel>,
  PanelKind
> = {
  [TaskType.TimeSeries]: "time_series",
  [TaskType.Profile2D]: "profile_2d",
  [TaskType.RadialProfile]: "radial_profile",
  [TaskType.Video]: "video",
};

export const LEGACY_PANEL_ID = "default";

/** The panels to show for a sample: the project layout, or one panel for a single-task project. */
export function panelsForProject(project: Project, sample: Sample): Panel[] {
  if (project.task === TaskType.MultiPanel) return project.layout?.panels ?? [];

  const signals = getSignalNames(sample);
  const base = {
    id: LEGACY_PANEL_ID,
    source: "default",
    grid: { col: 1, row: 1, col_span: 1, row_span: 1 },
  };
  const kind = TASK_PANEL_KINDS[project.task];
  if (kind === "time_series") return [{ ...base, kind, signals }];
  if (kind === "profile_2d")
    return [{ ...base, kind, signal: signals[0] ?? "" }];
  if (kind === "radial_profile")
    return [
      { ...base, kind, profile_signals: signals, time_series_signals: [] },
    ];
  return [{ ...base, kind, signal: signals[0] ?? null }];
}

function parsePanelData(data: unknown, kind: PanelKind): Data {
  const schema = {
    time_series: MultiVariateTimeSeriesDataSchema,
    profile_2d: Profile2DDataSchema,
    radial_profile: RadialProfileDataSchema,
    video: ImageDataSchema,
  }[kind];
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(`Invalid data for ${kind} view`);
  return result.data;
}

function extractDetail(payload: unknown): string {
  if (!payload) return "Unknown error";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const first = detail.find(
        (item) => typeof item === "string" && item.trim(),
      );
      if (typeof first === "string") return first;
    }
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return "Unknown error";
  }
}

// Treat 404 + common "missing frame" phrasing as a navigation boundary rather than fatal.
function isMissingFrameError(status: number, detail: string): boolean {
  if (status === 404) return true;
  const message = (detail || "").toLowerCase();
  return (
    message.includes("could not find image") ||
    message.includes("file not found") ||
    message.includes("no such file") ||
    message.includes("frame index")
  );
}

function PanelDataLoader({
  project,
  sample,
  panel,
}: {
  project: Project;
  sample: Sample;
  panel: Panel;
}) {
  const store = useContext(PanelDataStoreContext);
  if (!store)
    throw new Error("PanelDataLoader must be used in PanelDataProvider");
  const { states, updatePanel } = store;
  const projectId = project._id ?? "";
  const sampleId = sample._id;
  const { dataParams, viewParams } = states[panel.id];
  const panelKey = JSON.stringify(panel);

  // Video: remember the last successfully loaded frame so missing frames become navigation bounds.
  const lastGoodVideoFrameRef = useRef<number | null>(null);
  const bootstrappedVideoRef = useRef(false);
  // Only the latest data request may update the panel state.
  const dataRequestIdRef = useRef(0);

  // Persist view params so they survive a refresh or navigating between samples.
  useEffect(() => {
    sessionStorage.setItem(
      viewParamsKey(projectId, panel.id),
      JSON.stringify(viewParams),
    );
  }, [viewParams, projectId, panel.id]);

  useEffect(() => {
    const requestId = ++dataRequestIdRef.current;
    const controller = new AbortController();
    const isCurrentRequest = () =>
      dataRequestIdRef.current === requestId && !controller.signal.aborted;
    const update = (patch: Partial<PanelState>) =>
      updatePanel(panel.id, (prev) => ({ ...prev, ...patch }));
    const isMultiPanel = project.task === TaskType.MultiPanel;
    const isVideo = panel.kind === "video";

    const refreshData = async () => {
      update({ isLoading: true, error: null });

      try {
        let view: AnyViewParams = viewParams;
        // Default to the sample's first signal until one is explicitly selected.
        if (panel.kind === "profile_2d" && view.name !== "profile_2d") {
          view = {
            name: "profile_2d",
            signal_name: isMultiPanel
              ? panel.signal
              : getSignalNames(sample)[0],
          } as Profile2DViewParams;
        } else if (
          panel.kind === "radial_profile" &&
          view.name !== "radial_profile"
        ) {
          view = { name: "radial_profile" };
        }

        // Backend image loaders require params.name === "image"; frame null lets it pick the first frame.
        const effectiveDataParams: DataParams = isVideo
          ? {
              ...dataParams,
              name: "image",
              frame: bootstrappedVideoRef.current
                ? (dataParams.frame ?? null)
                : null,
            }
          : dataParams;

        const url = isMultiPanel
          ? `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}/panels/${panel.id}/data`
          : `${BACKEND_API_URL}/projects/${projectId}/samples/${sampleId}/data`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: effectiveDataParams, view }),
          signal: controller.signal,
        });
        if (!isCurrentRequest()) return;

        if (!response.ok) {
          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            // ignore; payload stays null
          }
          if (!isCurrentRequest()) return;

          const detail = extractDetail(payload);
          const requestedFrame = effectiveDataParams.frame;
          const lastGood = lastGoodVideoFrameRef.current;

          // Video: treat a missing frame as a boundary and stay on the last good frame.
          if (
            isVideo &&
            typeof requestedFrame === "number" &&
            typeof lastGood === "number" &&
            requestedFrame !== lastGood &&
            isMissingFrameError(response.status, detail)
          ) {
            ToastQueue.negative(`Frame ${requestedFrame} not found.`, {
              timeout: 2500,
            });
            updatePanel(panel.id, (prev) => {
              let bounds = prev.videoFrameBounds;
              // Only tighten bounds for adjacent navigation, not for large jump probes.
              if (Math.abs(requestedFrame - lastGood) === 1) {
                bounds =
                  requestedFrame < lastGood
                    ? { ...bounds, min: lastGood }
                    : { ...bounds, max: lastGood };
              }
              return {
                ...prev,
                videoFrameBounds: bounds,
                dataParams: {
                  ...prev.dataParams,
                  name: "image",
                  frame: lastGood,
                },
              };
            });
            return;
          }

          update({ error: detail, data: null });
          return;
        }

        const payload: unknown = await response.json();
        if (!isCurrentRequest()) return;
        const viewData = parsePanelData(payload, panel.kind);

        const frame = isVideo
          ? (viewData as { frame?: unknown }).frame
          : undefined;
        if (typeof frame !== "number" || !Number.isFinite(frame)) {
          update({ data: viewData });
          return;
        }

        const requestedFrame = effectiveDataParams.frame;
        // Never display a response for a different explicitly requested frame.
        if (typeof requestedFrame === "number" && frame !== requestedFrame)
          return;

        bootstrappedVideoRef.current = true;
        lastGoodVideoFrameRef.current = frame;
        updatePanel(panel.id, (prev) => ({
          ...prev,
          data: viewData,
          // Only the initial frame:null request needs the response to establish the frame.
          dataParams:
            requestedFrame === null || requestedFrame === undefined
              ? prev.dataParams.name === "image" &&
                prev.dataParams.frame === frame
                ? prev.dataParams
                : { name: "image", frame }
              : prev.dataParams,
          videoFrameBounds: {
            ...prev.videoFrameBounds,
            min:
              prev.videoFrameBounds.min === null
                ? frame
                : Math.min(prev.videoFrameBounds.min, frame),
          },
        }));
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError") ||
          !isCurrentRequest()
        ) {
          return;
        }
        update({
          error: err instanceof Error ? err.message : "An error occurred",
        });
      } finally {
        if (isCurrentRequest()) update({ isLoading: false });
      }
    };

    refreshData();

    return () => {
      controller.abort();
    };
    // panelKey stands in for panel so a new object with the same config does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sampleId, panelKey, dataParams, viewParams, updatePanel]);

  return null;
}

/** Loads and holds the data of every panel for one sample. Remount it for a new sample. */
export function PanelDataProvider({
  project,
  sample,
  panels,
  children,
}: {
  project: Project;
  sample: Sample;
  panels: Panel[];
  children: React.ReactNode;
}) {
  const projectId = project._id ?? "";
  const [states, setStates] = useState<Record<string, PanelState>>(() =>
    Object.fromEntries(
      panels.map((panel) => [panel.id, initialPanelState(projectId, panel.id)]),
    ),
  );

  const updatePanel = useCallback(
    (panelId: string, update: (prev: PanelState) => PanelState) =>
      setStates((prev) => ({
        ...prev,
        [panelId]: update(
          prev[panelId] ?? initialPanelState(projectId, panelId),
        ),
      })),
    [projectId],
  );

  const value = useMemo(
    () => ({ panels, states, updatePanel }),
    [panels, states, updatePanel],
  );

  return (
    <PanelDataStoreContext.Provider value={value}>
      {panels.map((panel) => (
        <PanelDataLoader
          key={panel.id}
          project={project}
          sample={sample}
          panel={panel}
        />
      ))}
      {children}
    </PanelDataStoreContext.Provider>
  );
}

/** Selects which panel the hooks below it read from. */
export function PanelScope({
  panelId,
  children,
}: {
  panelId: string;
  children: React.ReactNode;
}) {
  return (
    <PanelIdContext.Provider value={panelId}>
      {children}
    </PanelIdContext.Provider>
  );
}

export function usePanelData(): PanelDataContextType {
  const store = useContext(PanelDataStoreContext);
  const panelId = useContext(PanelIdContext);
  const updatePanel = store?.updatePanel;

  const setDataParams = useCallback<
    React.Dispatch<React.SetStateAction<DataParams>>
  >(
    (action) =>
      updatePanel?.(panelId ?? "", (prev) => ({
        ...prev,
        dataParams:
          typeof action === "function" ? action(prev.dataParams) : action,
      })),
    [panelId, updatePanel],
  );

  const setViewParams = useCallback<
    React.Dispatch<React.SetStateAction<AnyViewParams>>
  >(
    (action) =>
      updatePanel?.(panelId ?? "", (prev) => ({
        ...prev,
        viewParams:
          typeof action === "function" ? action(prev.viewParams) : action,
      })),
    [panelId, updatePanel],
  );

  if (!store || panelId === undefined) {
    throw new Error(
      "usePanelData must be used within a PanelDataProvider and PanelScope",
    );
  }
  const panel = store.panels.find((item) => item.id === panelId);
  const state = store.states[panelId];
  if (!panel || !state) {
    throw new Error(`Panel '${panelId}' is not in the layout`);
  }
  return { ...state, panel, setDataParams, setViewParams };
}

/** A DOM id for a plot that is unique per panel; single-task pages keep the plain base id. */
export function usePlotId(base: string): string {
  const panelId = useContext(PanelIdContext);
  if (!panelId || panelId === LEGACY_PANEL_ID) return base;
  return `${base}-${panelId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
