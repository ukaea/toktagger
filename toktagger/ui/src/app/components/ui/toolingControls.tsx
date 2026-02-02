"use client";

import { useContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { useVSpanContext } from "@/app/components/providers/vpsan-provider";
import { useZoneContext } from "@/app/components/providers/zone-provider";
import { ToolingTypes } from "@/types";
import { ToggleButton } from "@adobe/react-spectrum";

export const ToolingControls = () => {
  const { activateTooling: activateZoning } = useZoneContext();
  const { activateTooling: activateDisruption } = useVSpanContext();
  const { toolingCallbacks } = useContextMenuProvider();

  return (
    <div className="relative w-fit overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto">
      <ToggleButton
        isSelected={toolingCallbacks?.id === ToolingTypes.ZONE}
        onPressStart={activateZoning}
      >
        Time Regions
      </ToggleButton>
      <ToggleButton
        isSelected={toolingCallbacks?.id === ToolingTypes.VSPAN}
        onPressStart={activateDisruption}
      >
        Time Points
      </ToggleButton>
    </div>
  );
};
