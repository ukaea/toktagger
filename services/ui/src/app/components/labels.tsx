import React, { useState, useEffect } from 'react';
import { ListView, Item } from '@adobe/react-spectrum';
import { Annotation, Annotations } from '@/types';

export type ShotLabelsType = {
    labels: string[];
    annotations: Annotations;
    setAnnotations: (annotations: Annotation[]) => void;
};

export function ShotLabels({labels = [], annotations, setAnnotations}: ShotLabelsType) {

    const defaultLabels = labels.map((label, index) => ({id: index, name: label}));
    const [items, setItems] = useState<string[]>(defaultLabels);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        const defaultAnnotations = annotations.filter((annotation: Annotation) => annotation.type === 'class_label');
        const defaultSelectedKeys = defaultAnnotations.map((annotation: Annotation) => {
            const index = labels.indexOf(annotation.label);
            return index !== -1 ? index.toString() : null;
        }).filter((key: number | null) => key !== null);
        setSelectedKeys(new Set(defaultSelectedKeys));

    }, [annotations]);

    const onSelectionChange = (keys: Set<string>) => {
        setAnnotations((prevAnnotations: Annotations) => {
            let newAnnotations = prevAnnotations || [];
            newAnnotations = newAnnotations.filter(annotation => annotation.type !== 'class_label');
            keys.forEach((key: number) => {
                let item = items.find(item => item.id.toString() === key) || null;

                if (item === null) {
                    console.warn(`Label with key ${key} not found in items.`);
                    return;
                }
                
                newAnnotations.push({
                    type: 'class_label',
                    label: item.name,
                });
            });
            return newAnnotations;
        });
    }

    // Listen for global key presses
    useEffect(() => {
      const handleKeyDown = (e) => {
        const key = e.key.toLowerCase();
        const matchedItem = items.find(item => item.id.toString() === key);
        if (matchedItem) {
            if (selectedKeys.has(matchedItem.id.toString())) {
                selectedKeys.delete(matchedItem.id.toString());
            }
            else {
                selectedKeys.add(matchedItem.id.toString());
            }
            onSelectionChange(selectedKeys);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [items]);

    if (items.length === 0) {
      return <div>No labels available. Please define labels in the project settings.</div>;
    }

    return (
        <>
        <ListView
          items={items}
          selectedKeys={selectedKeys}
          onSelectionChange={onSelectionChange}
          selectionMode="multiple"
          aria-label="Static ListView items example"
          maxWidth="size-6000"
        >
          {item => (
            <Item key={item.id} textValue={item.name}>
              {`${item.id} | ${item.name}`}
            </Item>
          )}
        </ListView>
        </>
    );
}

