"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flex, Heading, View } from "@adobe/react-spectrum";
import { Panel } from "@/types";
import { PanelScope, usePanelData } from "@/app/contexts/PanelDataContext";
import { useSample } from "@/app/contexts/SampleContext";
import { useWorkspace } from "@/app/contexts/WorkspaceContext";
import { PanelHeightContext } from "@/app/contexts/PanelHeightContext";
import { ToolAccordion } from "@/app/components/tools/toolAccordion";
import ErrorView from "@/app/views/error";
import LoadingView from "@/app/views/loading";
import { PANEL_REGISTRY } from "./registry";

function Passthrough({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function PanelContent({ panel }: { panel: Panel }) {
  const { error, isLoading, data } = usePanelData();
  const { View: PanelView, keepDataWhileLoading } = PANEL_REGISTRY[panel.kind];

  if (error) return <ErrorView message={error} />;
  if (isLoading && !(keepDataWhileLoading && data)) return <LoadingView />;
  return <PanelView />;
}

function PanelTools({ panel }: { panel: Panel }) {
  const { project, sample, plotProps, setPlotProps } = useSample();
  const { data } = usePanelData();
  const { activePanelId, toolSlot } = useWorkspace();

  if (
    activePanelId !== panel.id ||
    !toolSlot ||
    !project?._id ||
    !sample?._id
  ) {
    return null;
  }

  const tools = PANEL_REGISTRY[panel.kind].tools({
    projectId: project._id,
    sampleId: sample._id,
    data,
    plotProps,
    setPlotProps,
  });
  return createPortal(<ToolAccordion tools={tools} />, toolSlot);
}

/** Renders one panel and, while it is active, its tools in the toolbar. */
export function PanelFrame({ panel }: { panel: Panel }) {
  const Providers = PANEL_REGISTRY[panel.kind].Providers ?? Passthrough;
  return (
    <PanelScope panelId={panel.id}>
      <Providers>
        <PanelContent panel={panel} />
        <PanelTools panel={panel} />
      </Providers>
    </PanelScope>
  );
}

/** A grid cell that sizes its panel to the cell and makes it active on interaction. */
export function PanelCell({ panel }: { panel: Panel }) {
  const { activePanelId, setActivePanelId } = useWorkspace();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const isActive = activePanelId === panel.id;
  const title = panel.title ?? panel.id;

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(Math.floor(entry.contentRect.height)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-label={title}
      data-testid={`panel-${panel.id}`}
      data-active={isActive}
      onFocusCapture={() => setActivePanelId(panel.id)}
      onPointerDownCapture={() => setActivePanelId(panel.id)}
      style={{
        gridColumn: `${panel.grid.col} / span ${panel.grid.col_span}`,
        gridRow: `${panel.grid.row} / span ${panel.grid.row_span}`,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <View
        borderWidth={isActive ? "thick" : "thin"}
        borderColor={isActive ? "blue-500" : "gray-300"}
        borderRadius="medium"
        height="100%"
        overflow="hidden"
      >
        <Flex direction="column" height="100%">
          <View paddingX="size-150" paddingY="size-50">
            <Heading level={4} margin={0}>
              {title}
            </Heading>
          </View>
          <div
            ref={bodyRef}
            style={{ flex: 1, minHeight: 0, overflow: "auto" }}
          >
            {height !== null && (
              <PanelHeightContext.Provider value={height}>
                <PanelFrame panel={panel} />
              </PanelHeightContext.Provider>
            )}
          </div>
        </Flex>
      </View>
    </section>
  );
}
