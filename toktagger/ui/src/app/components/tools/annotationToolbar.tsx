"use client";

import { Button, ToggleButton } from "@adobe/react-spectrum";
import { useTimeSeriesState, useTimeSeriesActions } from "@/app/contexts/TimeSeriesContext";

export const AnnotationToolbar = () => {
  const {editMode, toolingCallbacks, categories, activeAnnotationTool} = useTimeSeriesState();
  const {setEditMode, setAnnotationTool} = useTimeSeriesActions();

  const modeVariant: "accent" | "primary" = editMode ? "accent" : "primary";
  const modeText = editMode ? "Edit Mode" : "View Mode";

  return (
    <div className="flex flex-col w-400 items-center space-y-3 ">
      <h1 className="text-4xl font-bold text-center text-gray-900">
        Annotation Toolbar
      </h1>
      <Button width="size-1600" variant={modeVariant} onPress={() => {setEditMode(!editMode)}}>
        {modeText}
      </Button>
      {[...toolingCallbacks.keys()].map((info) => (
        <div key={info} className="mb-6 text-center w-2/3">
            <h3 className="mb-2">{info}</h3>
            <hr className="mb-2" />
            <div className="flex flex-col items-center space-y-1">
                {categories.values().map((category) => {
                    if (category.type !== info) return null

                    return(
                        <div key={category.label}>
                            <ToggleButton
                            width="size-1600"
                            isDisabled={!editMode}
                            isSelected={
                                info === activeAnnotationTool?.type &&
                                category.label === activeAnnotationTool.label
                            }
                            onPress={() => {
                                setAnnotationTool({type: info, label: category.label});
                            }}
                            >
                            {category.label}
                            </ToggleButton>
                        </div>
                    )
                })}
            </div>
        </div>
      ))}
    </div>
  );
};