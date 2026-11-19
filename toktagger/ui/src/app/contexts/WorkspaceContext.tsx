"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { LayoutTab, NavAdapter } from "@/types";

export type TimeWindow = [number, number];

type WorkspaceContextType = {
  panelIds: string[];
  tabs: LayoutTab[];
  activeTab: string;
  // Also makes the first panel of the tab the active panel.
  setActiveTab: (title: string) => void;
  activePanelId: string | null;
  setActivePanelId: (panelId: string) => void;
  // The toolbar element that the active panel renders its tools into.
  toolSlot: HTMLElement | null;
  setToolSlot: (element: HTMLElement | null) => void;
  // The annotation toolbar element that the active video panel renders its drawing tools into.
  videoToolSlot: HTMLElement | null;
  setVideoToolSlot: (element: HTMLElement | null) => void;
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

const activeTabKey = (projectId: string) => `ws-active-tab-${projectId}`;

function readSavedTab(projectId: string, tabs: LayoutTab[]): LayoutTab | null {
  const saved = sessionStorage.getItem(activeTabKey(projectId));
  return tabs.find((tab) => tab.title === saved) ?? tabs[0] ?? null;
}

export function WorkspaceProvider({
  tabs,
  projectId,
  linkTime = true,
  children,
}: {
  tabs: LayoutTab[];
  projectId: string;
  linkTime?: boolean;
  children: React.ReactNode;
}) {
  const panelIds = useMemo(
    () => tabs.flatMap((tab) => tab.panels.map((panel) => panel.id)),
    [tabs],
  );
  const [activeTab, setActiveTabState] = useState<string>(
    () => readSavedTab(projectId, tabs)?.title ?? "",
  );
  const [activePanelId, setActivePanelId] = useState<string | null>(
    () => readSavedTab(projectId, tabs)?.panels[0]?.id ?? null,
  );
  const setActiveTab = useCallback(
    (title: string) => {
      const tab = tabs.find((candidate) => candidate.title === title);
      if (!tab) return;
      setActiveTabState(title);
      setActivePanelId(tab.panels[0]?.id ?? null);
      sessionStorage.setItem(activeTabKey(projectId), title);
    },
    [projectId, tabs],
  );
  const [toolSlot, setToolSlot] = useState<HTMLElement | null>(null);
  const [videoToolSlot, setVideoToolSlot] = useState<HTMLElement | null>(null);
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
      tabs,
      activeTab,
      setActiveTab,
      activePanelId,
      setActivePanelId,
      toolSlot,
      setToolSlot,
      videoToolSlot,
      setVideoToolSlot,
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
      tabs,
      activeTab,
      setActiveTab,
      activePanelId,
      toolSlot,
      videoToolSlot,
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
