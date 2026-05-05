"use client";

import {
  Button,
  Content,
  ContextualHelp,
  Divider,
  Flex,
  Heading,
  Item,
  Picker,
  Text,
  ToggleButton,
  Tooltip,
  TooltipTrigger,
  View,
} from "@adobe/react-spectrum";
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

  const [categoryAllocations, setCategoryAllocations] = useState<
    Map<TimeSeriesAnnotationType, string>
  >(new Map());

  const [firstTimeEdit, setFirstTimeEdit] = useState(true);
  const [contextHelpManualOpen, setContextHelpManualOpen] = useState<
    boolean | undefined
  >(undefined);

  const modeVariant: "accent" | "primary" = editMode ? "accent" : "primary";
  const modeText = editMode ? "Edit Mode" : "View Mode";

  useEffect(() => {
    const categoryMap: Map<TimeSeriesAnnotationType, string> = new Map();
    categories.forEach((category) => {
      categoryMap.getOrInsert(category.type, category.label);
    });
    setCategoryAllocations(categoryMap);
  }, [categories]);

  return (
    <View width="size-3000" flexShrink={0} marginTop="size-200">
      <Flex direction="column" alignItems="center" gap="size-150">
        <h1 className="text-2xl font-bold">Annotation Toolbar</h1>
        <TooltipTrigger placement="left">
          <Button
            width="size-1600"
            variant={modeVariant}
            onPress={() => {
              setAnnotationTool(null);
              setEditMode(!editMode);
              if (firstTimeEdit) {
                setContextHelpManualOpen(true);
              }
            }}
          >
            {modeText}
          </Button>
          <Tooltip>
            Click to enter{" "}
            {editMode
              ? "view mode - annotations disabled"
              : "edit mode - annotations enabled"}
          </Tooltip>
        </TooltipTrigger>
        <Divider size="S" marginX="size-200" />
        <h1 className="text-xl font-bold">Tools</h1>
        <Flex direction="column" alignItems="center" gap="size-100">
          {[...toolingCallbacks.keys()].map((info) => {
            const toolActive = info === activeAnnotationTool?.type;
            return (
              <Flex
                key={info}
                direction="column"
                alignItems="center"
                gap="size-100"
              >
                <TooltipTrigger placement="left">
                  <ToggleButton
                    width="size-1600"
                    isDisabled={!editMode}
                    isSelected={toolActive}
                    onPress={() => {
                      if (toolActive) {
                        setAnnotationTool(null);
                        return;
                      }
                      setAnnotationTool({
                        type: info,
                        label: categoryAllocations.get(info)!,
                      });
                    }}
                  >
                    {info}
                  </ToggleButton>
                  <Tooltip>{`Click to ${toolActive ? "deactivate" : "activate"} ${info} tooling`}</Tooltip>
                </TooltipTrigger>
                {toolActive && (
                  <Picker
                    label="Select label"
                    width="size-2400"
                    isDisabled={!editMode}
                    items={categories
                      .values()
                      .filter((category) => category.type === info)}
                    selectedKey={categoryAllocations.get(info)}
                    onSelectionChange={(key) => {
                      setCategoryAllocations((prev) => {
                        const newMap = new Map(prev);
                        newMap.set(info, key as string);
                        return newMap;
                      });
                      setAnnotationTool({ type: info, label: key as string });
                    }}
                  >
                    {(item) => <Item key={item.label}>{item.label}</Item>}
                  </Picker>
                )}
              </Flex>
            );
          })}
        </Flex>
      </Flex>
      <Flex direction="row" justifyContent="end" marginEnd="size-100">
        <ContextualHelp
          isOpen={firstTimeEdit ? contextHelpManualOpen : undefined}
          onOpenChange={() => {
            setFirstTimeEdit(false);
          }}
        >
          <Heading>Annotation Toolbar</Heading>
          <Content>
            <Text>
              Use the top button to switch between <b>edit mode</b> and{" "}
              <b>view mode</b>.
              <br />
              <br />
              Activate the desired tool using the list of buttons - use the
              dropdown menu that appears to select the relevant label.
              <br />
              <br />
              When a tool is active, new annotations can be added using{" "}
              <b>ctrl+drag</b>.
            </Text>
          </Content>
        </ContextualHelp>
      </Flex>
    </View>
  );
};
