import React, { useState, useEffect, useCallback } from "react";
import { ListView, Item } from "@adobe/react-spectrum";
import { Annotation } from "@/types";
import { Selection } from "@react-types/shared";
import { useSample } from "@/app/contexts/SampleContext";

export type ShotLabelsType = {
  labels: string[];
};

export function ShotLabels({ labels = [] }: ShotLabelsType) {
  const { annotations, setAnnotations } = useSample();
  const items = labels.map((label, index) => ({ id: index, name: label }));
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const defaultAnnotations = annotations.filter(
      (annotation: Annotation) => annotation.type === "class_label"
    );
    const defaultSelectedKeys = defaultAnnotations
      .map((annotation: Annotation) => {
        const index = labels.indexOf(annotation.label);
        return index !== -1 ? index.toString() : null;
      })
      .filter((key) => key !== null) as string[];

    setSelectedKeys(new Set(defaultSelectedKeys));
  }, [annotations, setSelectedKeys, labels]);

  const onSelectionChange = useCallback(
    (keys: Selection) => {
      let newKeys = new Set<string>();
      if (keys === "all") {
        items.forEach((item) => newKeys.add(item.id.toString()));
      } else {
        newKeys = new Set(Array.from(keys).map((key) => key.toString()));
      }

      setAnnotations((prevAnnotations: Annotation[]) => {
        let newAnnotations = prevAnnotations || [];
        newAnnotations = newAnnotations.filter(
          (annotation) => annotation.type !== "class_label"
        );
        newKeys.forEach((key: string) => {
          const item = items.find((item) => item.id.toString() === key) || null;

          if (item === null) {
            console.warn(`Label with key ${key} not found in items.`);
            return;
          }

          newAnnotations.push({
            type: "class_label",
            label: item.name,
            created_by: "manual",
          });
        });
        return newAnnotations;
      });
    },
    [items, setAnnotations]
  );

  useEffect(() => {
    const handleKeyDown = (e: { key: string }) => {
      const key = e.key.toLowerCase();
      const matchedItem = items.find((item) => item.id.toString() === key);
      if (matchedItem) {
        if (selectedKeys.has(matchedItem.id.toString())) {
          selectedKeys.delete(matchedItem.id.toString());
        } else {
          selectedKeys.add(matchedItem.id.toString());
        }
        onSelectionChange(selectedKeys);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [items, selectedKeys, onSelectionChange]);

  if (items.length === 0) {
    return (
      <div>
        No labels available. Please define labels in the project settings.
      </div>
    );
  }

  return (
    <>
      <ListView
        items={items}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        selectionMode="multiple"
        aria-label="Labels"
        maxWidth="size-6000"
      >
        {(item) => (
          <Item key={item.id} textValue={item.name}>
            {`${item.id} | ${item.name}`}
          </Item>
        )}
      </ListView>
    </>
  );
}
