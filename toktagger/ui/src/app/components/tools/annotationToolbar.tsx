"use client";

import { Button, Item, Picker, ToggleButton } from "@adobe/react-spectrum";
import {
  useTimeSeriesState,
  useTimeSeriesActions,
} from "@/app/contexts/TimeSeriesContext";
import { useEffect, useState } from "react";
import { TimeSeriesAnnotationType } from "@/types";

export const AnnotationToolbar = () => {
  const { editMode, toolingCallbacks, categories, activeAnnotationTool } =
    useTimeSeriesState();
  const { setEditMode, setAnnotationTool } = useTimeSeriesActions();
  
  const [categoryAllocations, setCategoryAllocations] = useState<Map<TimeSeriesAnnotationType, string>>(new Map());

  const modeVariant: "accent" | "primary" = editMode ? "accent" : "primary";
  const modeText = editMode ? "Edit Mode" : "View Mode";

  useEffect(() => {
    const categoryMap: Map<TimeSeriesAnnotationType, string> = new Map();
    categories.forEach((category) => {
      categoryMap.getOrInsert(category.type, category.label);
    })
    setCategoryAllocations(categoryMap);
  }, [categories])

  return (
    <div className="flex flex-col w-400 items-center space-y-3 ">
      <h1 className="text-4xl font-bold text-center text-gray-900">
        Annotation Toolbar
      </h1>
      <Button
        width="size-1600"
        variant={modeVariant}
        onPress={() => {
          setEditMode(!editMode);
        }}
      >
        {modeText}
      </Button>
      <div className="flex flex-col items-center space-y-2">
        {[...toolingCallbacks.keys()].map((info) => (
          <div key={info} className="mb-6 text-center w-2/3">
            <div className="flex flex-col items-center space-y-1">
              <ToggleButton
                width="size-1600"
                isDisabled={!editMode}
                isSelected={
                  info === activeAnnotationTool?.type
                }
                onPress={() => {
                  setAnnotationTool({ type: info, label: categoryAllocations.get(info)! });
                }}
              >
                {info}
              </ToggleButton>
              <Picker
                label="Select label"
                width="size-2400"
                isDisabled={!editMode}
                items={categories.values().filter((category) => category.type === info)}
                selectedKey={categoryAllocations.get(info)}
                onSelectionChange={(key) => {
                  setCategoryAllocations(prev => {
                    const newMap = new Map(prev);
                    newMap.set(info, key as string);
                    return newMap;
                  })
                  setAnnotationTool({ type: info, label: key as string });
                }}
              >
                {(item) => (<Item key={item.label}>{item.label}</Item>)}
              </Picker>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
