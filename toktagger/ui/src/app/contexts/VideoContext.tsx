"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import type { ActiveDrawingTool } from "@/app/video/components/types";

export type VideoTableScope = "all" | "frame";

type VideoUiStateContextType = {
  videoPropagate: boolean;
  setVideoPropagate: (value: boolean) => void;
  videoLastClassName: string | null;
  setVideoLastClassName: (value: string | null) => void;
  videoEditMode: boolean;
  setVideoEditMode: (value: boolean) => void;
  videoDrawingTool: ActiveDrawingTool;
  setVideoDrawingTool: (value: ActiveDrawingTool) => void;
  videoTableScope: VideoTableScope;
  setVideoTableScope: (value: VideoTableScope) => void;
};

const VideoUiStateContext = createContext<VideoUiStateContextType | undefined>(
  undefined,
);

const videoUiStateSnapshot = {
  videoPropagate: true,
  videoLastClassName: null as string | null,
  videoEditMode: false,
  videoDrawingTool: null as ActiveDrawingTool,
  videoTableScope: "all" as VideoTableScope,
};

export function VideoUiStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [videoPropagate, setVideoPropagateState] = useState(
    () => videoUiStateSnapshot.videoPropagate,
  );
  const [videoLastClassName, setVideoLastClassNameState] = useState<
    string | null
  >(() => videoUiStateSnapshot.videoLastClassName);
  const [videoEditMode, setVideoEditModeState] = useState(
    () => videoUiStateSnapshot.videoEditMode,
  );
  const [videoDrawingTool, setVideoDrawingToolState] =
    useState<ActiveDrawingTool>(() => videoUiStateSnapshot.videoDrawingTool);
  const [videoTableScope, setVideoTableScopeState] = useState(
    () => videoUiStateSnapshot.videoTableScope,
  );

  const setVideoPropagate = useCallback((value: boolean) => {
    videoUiStateSnapshot.videoPropagate = value;
    setVideoPropagateState(value);
  }, []);

  const setVideoLastClassName = useCallback((value: string | null) => {
    videoUiStateSnapshot.videoLastClassName = value;
    setVideoLastClassNameState(value);
  }, []);

  const setVideoEditMode = useCallback((value: boolean) => {
    videoUiStateSnapshot.videoEditMode = value;
    setVideoEditModeState(value);
  }, []);

  const setVideoDrawingTool = useCallback((value: ActiveDrawingTool) => {
    videoUiStateSnapshot.videoDrawingTool = value;
    setVideoDrawingToolState(value);
  }, []);

  const setVideoTableScope = useCallback((value: VideoTableScope) => {
    videoUiStateSnapshot.videoTableScope = value;
    setVideoTableScopeState(value);
  }, []);

  return (
    <VideoUiStateContext.Provider
      value={{
        videoPropagate,
        setVideoPropagate,
        videoLastClassName,
        setVideoLastClassName,
        videoEditMode,
        setVideoEditMode,
        videoDrawingTool,
        setVideoDrawingTool,
        videoTableScope,
        setVideoTableScope,
      }}
    >
      {children}
    </VideoUiStateContext.Provider>
  );
}

export function useVideoUiState() {
  const ctx = useContext(VideoUiStateContext);
  if (!ctx) {
    throw new Error("useVideoUiState must be used inside VideoUiStateProvider");
  }
  return ctx;
}
