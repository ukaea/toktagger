import React, { useState, useEffect } from 'react';
import { ListView, Item } from '@adobe/react-spectrum';
import { Annotation, Annotations } from '@/types';

export type ShotLabelsType = {
    labels: string[];
    annotations: Annotation[];
    setAnnotations: (annotations: Annotation[]) => void;
};

export function ShotLabels({labels = [], annotations, setAnnotations}: ShotLabelsType) {
    const defaultAnnotations = annotations.filter(annotation => annotation.type === 'class_label');
    const defaultSelectedKeys = new Set(defaultAnnotations.map(annotation => {
        const index = labels.indexOf(annotation.label);
        return index !== -1 ? index.toString() : null;
    }).filter(key => key !== null));

    const defaultLabels = labels.map((label, index) => ({id: index, name: label}));
    const [items, setItems] = useState<string[]>(defaultLabels);
    const [newLabel, setNewLabel] = useState<string>();
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(defaultSelectedKeys));


    const onRemove = () => {
      setItems(prevItems => prevItems.filter(item => !selectedKeys.has(item.id.toString())));
      setSelectedKeys(new Set());
    }

    const addLabel = () => {
      if (newLabel !== '' && !items.find(item => item.name === newLabel)) {
        setItems(prevItems => [...prevItems, {id: prevItems.length, name: newLabel}]);
      }
    }

    useEffect(() => {
        setAnnotations((prevAnnotations: Annotations) => {
            let newAnnotations = prevAnnotations || [];
            newAnnotations = newAnnotations.filter(annotation => annotation.type !== 'class_label');
            selectedKeys.forEach((key: number) => {
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
    }, [selectedKeys]);

    // Listen for global key presses
    useEffect(() => {
      const handleKeyDown = (e) => {
        const key = e.key.toLowerCase();
        const matchedItem = items.find(item => item.id.toString() === key);
        if (matchedItem) {
          setSelectedKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(matchedItem.id.toString())) {
              newSet.delete(matchedItem.id.toString());
            } else {
              newSet.add(matchedItem.id.toString());
            }
            return newSet;
          });
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
        {/* <Flex direction="row" alignItems="end" justifyContent="center" gap="size-100" marginBottom="size-100">
          <TextField label="Add Label" width="size-2000" defaultInputValue={newLabel} onChange={setNewLabel} />
          <Button variant="primary" marginTop="size-100" onPress={addLabel}>+</Button>
          <Button variant="primary" marginTop="size-100" onPress={onRemove}>-</Button>
        </Flex> */}
        <ListView
          items={items}
          onSelectionChange={setSelectedKeys}
          selectedKeys={selectedKeys}
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

