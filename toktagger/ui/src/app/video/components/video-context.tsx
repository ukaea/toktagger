"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import type { DrawingTool } from "@/app/video/components/types";

type VideoUiStateContextType = {
  videoPropagate: boolean;
  setVideoPropagate: (value: boolean) => void;
  videoLastClassName: string | null;
  setVideoLastClassName: (value: string | null) => void;
  videoPanMode: boolean;
  setVideoPanMode: (value: boolean) => void;
  videoDrawingTool: DrawingTool;
  setVideoDrawingTool: (value: DrawingTool) => void;
};

const VideoUiStateContext = createContext<VideoUiStateContextType | undefined>(
  undefined,
);

const videoUiStateSnapshot = {
  videoPropagate: true,
  videoLastClassName: null as string | null,
  videoPanMode: true,
  videoDrawingTool: "rectangle" as DrawingTool,
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
  const [videoPanMode, setVideoPanModeState] = useState(
    () => videoUiStateSnapshot.videoPanMode,
  );
  const [videoDrawingTool, setVideoDrawingToolState] = useState<DrawingTool>(
    () => videoUiStateSnapshot.videoDrawingTool,
  );

  const setVideoPropagate = useCallback((value: boolean) => {
    videoUiStateSnapshot.videoPropagate = value;
    setVideoPropagateState(value);
  }, []);

  const setVideoLastClassName = useCallback((value: string | null) => {
    videoUiStateSnapshot.videoLastClassName = value;
    setVideoLastClassNameState(value);
  }, []);

  const setVideoPanMode = useCallback((value: boolean) => {
    videoUiStateSnapshot.videoPanMode = value;
    setVideoPanModeState(value);
  }, []);

  const setVideoDrawingTool = useCallback((value: DrawingTool) => {
    videoUiStateSnapshot.videoDrawingTool = value;
    setVideoDrawingToolState(value);
  }, []);

  return (
    <VideoUiStateContext.Provider
      value={{
        videoPropagate,
        setVideoPropagate,
        videoLastClassName,
        setVideoLastClassName,
        videoPanMode,
        setVideoPanMode,
        videoDrawingTool,
        setVideoDrawingTool,
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
