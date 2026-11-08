"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavAdapter } from "@/types";

export type TimeWindow = [number, number];

type WorkspaceContextType = {
  panelIds: string[];
  activePanelId: string | null;
  setActivePanelId: (panelId: string) => void;
  // The toolbar element that the active panel renders its tools into.
  toolSlot: HTMLElement | null;
  setToolSlot: (element: HTMLElement | null) => void;
  linkTime: boolean;
  // Shared time axis range of all time-based panels; null means the full range.
  timeWindow: TimeWindow | null;
  setTimeWindow: (window: TimeWindow | null) => void;
  // Time under the cursor or of the current video frame.
  cursorTime: number | null;
  setCursorTime: (time: number | null) => void;
  registerNavAdapter: (panelId: string, adapter: NavAdapter) => () => void;
  getNavAdapters: () => Map<string, NavAdapter>;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined,
);

export function WorkspaceProvider({
  panelIds,
  linkTime = true,
  children,
}: {
  panelIds: string[];
  linkTime?: boolean;
  children: React.ReactNode;
}) {
  const [activePanelId, setActivePanelId] = useState<string | null>(
    panelIds[0] ?? null,
  );
  const [toolSlot, setToolSlot] = useState<HTMLElement | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  // Adapters are only read when the user saves or navigates, so a ref avoids re-renders.
  const navAdaptersRef = useRef(new Map<string, NavAdapter>());

  const registerNavAdapter = useCallback(
    (panelId: string, adapter: NavAdapter) => {
      navAdaptersRef.current.set(panelId, adapter);
      return () => {
        if (navAdaptersRef.current.get(panelId) === adapter) {
          navAdaptersRef.current.delete(panelId);
        }
      };
    },
    [],
  );
  const getNavAdapters = useCallback(() => navAdaptersRef.current, []);

  const value = useMemo(
    () => ({
      panelIds,
      activePanelId,
      setActivePanelId,
      toolSlot,
      setToolSlot,
      linkTime,
      timeWindow,
      setTimeWindow,
      cursorTime,
      setCursorTime,
      registerNavAdapter,
      getNavAdapters,
    }),
    [
      panelIds,
      activePanelId,
      toolSlot,
      linkTime,
      timeWindow,
      cursorTime,
      registerNavAdapter,
      getNavAdapters,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
