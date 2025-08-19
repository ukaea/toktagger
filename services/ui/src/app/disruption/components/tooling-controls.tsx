"use client"

import { useAnnotationProvider } from "@/app/components/providers/annotation-provider"
import { useVSpanContext } from "@/app/components/providers/vpsan-provider"
import { useZoneContext } from "@/app/components/providers/zone-provider"
import { ToolingTypes } from "@/types"
import { ToggleButton } from "@adobe/react-spectrum"

export const ToolingControls = () => {
    const { activateTooling: activateZoning } = useZoneContext()
    const { activateTooling: activateDisruption } = useVSpanContext()
    const { toolingCallbacks, editMode } = useAnnotationProvider()

    return (
        <div className="relative w-fit overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto">
            <ToggleButton isDisabled={!editMode} isSelected={toolingCallbacks?.id === ToolingTypes.ZONE} onPressStart={() => { activateZoning() }}>
                Zoning
            </ToggleButton>
            <ToggleButton isDisabled={!editMode} isSelected={toolingCallbacks?.id === ToolingTypes.VSPAN} onPressStart={() => { activateDisruption() }}>
                Disruption
            </ToggleButton>
        </div>
    )
}