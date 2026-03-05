"use client";
import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useSample } from "@/app/contexts/SampleContext";

interface SampleHistoryContextType {
  visitedSampleIds: string[];
  popVisitedSampleId: () => string | null;
  SaveOnNavigate: boolean;
  setSaveOnNavigate: (saveOnNavigate: boolean) => void;
}

const SampleHistoryContext = createContext<
  SampleHistoryContextType | undefined
>(undefined);

export function SampleHistoryProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const { sample } = useSample(); // ← uses SampleContext
  const sampleId = sample?._id ?? null;

  const [SaveOnNavigate, setSaveOnNavigate] = useState(true);

  const [visitedSampleIds, setVisitedSampleIds] = useState<string[]>(() => {
    const cached: string | null = sessionStorage.getItem(projectId);
    if (!cached) {
      return [];
    }
    return JSON.parse(cached);
  });

  const popVisitedSampleId = (): string | null => {
    if (visitedSampleIds.length < 2) {
      return null;
    }
    const popped: string = visitedSampleIds.at(-2)!; // since the current sample will be at -1
    const updated: string[] = visitedSampleIds.slice(0, -1);
    sessionStorage.setItem(projectId, JSON.stringify(updated));
    setVisitedSampleIds(updated);
    return popped;
  };

  // Push new sample ID when it changes
  useEffect(() => {
    if (!sampleId) return;
    setVisitedSampleIds((prev) => {
      if (prev.at(-1) === sampleId) return prev; // avoid duplicates
      const updated: string[] = [...prev, sampleId];
      sessionStorage.setItem(projectId, JSON.stringify(updated));
      return updated;
    });
  }, [projectId, sampleId]);

  const value: SampleHistoryContextType = {
    visitedSampleIds,
    popVisitedSampleId,
    SaveOnNavigate,
    setSaveOnNavigate,
  };

  return (
    <SampleHistoryContext.Provider value={value}>
      {children}
    </SampleHistoryContext.Provider>
  );
}

export function useSampleHistory() {
  const ctx = useContext(SampleHistoryContext);
  if (!ctx) {
    throw new Error(
      "useSampleHistory must be used inside a SampleHistoryProvider",
    );
  }
  return ctx;
}
