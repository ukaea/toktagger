"use client"

import { Category, ToolingTypes, VSpan } from "@/types"
import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import { Item, ItemParams, Menu, Submenu } from "react-contexify"
import { useContextMenuProvider } from "./context-menu-provider";

interface VSpanContextInfo {
    vspans: VSpan[];
    handleVSpanUpdate: () => void;
    handleVSpanDragFinish: () => void;
    addVSpan: (x: number, category: Category) => void;
    activateTooling: () => void
    triggerUpdate: number;
}

const VSpanContext = createContext<VSpanContextInfo | null>(null)

export const useVSpanContext = () => {
    const context = useContext(VSpanContext)
    if (!context) {
        throw new Error("useVSpanContext must be used within a VSpanProvider")
    }
    return context
}

export const VSPAN_MENU_ID = "vspan-provider"

/**
 * Context provider that gives child components shared read/write to vspan data
 * 
 * @param categories Array of categories that the vspans provided by this context can be
 * @param initialData Array of vspans that should be added when initialised
 */
export const VSpanProvider = ({categories, initialData, children, onModifyVSpan} : {
    categories: Category[],
    initialData?: VSpan[],
    children: React.ReactNode,
    onModifyVSpan: (newVSpans: VSpan[]) => void
}) => {
    const spans = useRef<VSpan[]>([])
    const [triggerUpdate, setTriggerUpdate] = useState(0) // Value should be changed to trigger refresh

    const {setToolingCallbacks, registerMenuItem} = useContextMenuProvider()

    // It is necessary for the context to trigger child refreshes
    const triggerVSpanUpdate = () => {
        setTriggerUpdate((current) => (current+1)%10)
    }

    // Provides a method for child components to trigger context refresh
    const handleVSpanUpdate = () => {
        triggerVSpanUpdate()
    }

    // Provides a method for child components to update on drag finish
    const handleVSpanDragFinish = () => {
        onModifyVSpan(spans.current);
    }

    const handleDelete = (input: unknown) => {
        spans.current = spans.current.filter(span => span !== input)
        triggerVSpanUpdate()
        onModifyVSpan(spans.current);
    }

    const handleTypeSetting = ({props}: ItemParams, targetCategory: Category) => {
        spans.current = spans.current.map((span) => {
            if (span === props.vspan) {
                span.category = targetCategory
            }
            return span
        })
        triggerVSpanUpdate()
    }

    const addVSpan = (x: number, category: Category) => {
        spans.current.push({
            category,
            x
        })
        triggerVSpanUpdate()
    }

    const activateTooling = () => {
        setToolingCallbacks({
            id: ToolingTypes.VSPAN,
            start: (x, _y) => {addVSpan(x, categories[0])},
            move: (x, _y) => {
                spans.current[spans.current.length-1].x = x;
                triggerVSpanUpdate()
            },
            end: (x, _y) => {
                spans.current[spans.current.length-1].x = x;
                handleVSpanDragFinish()
                triggerVSpanUpdate()
            },
        })
    }

    // On initialisation the tool registers a menu item with the general context menu
    useEffect(() => {
        const add = (x: number, category: Category) => {
            spans.current.push({
                category,
                x
            })
            triggerVSpanUpdate()
            onModifyVSpan(spans.current);
        }

        const addVSpanItems = categories.map((category, index) => {
            return (
                <Item key={`add${index}`} id={`add${index}`} onClick={({props}) => {
                    add(props.x, category)
                }}>
                    {category.name}
                </Item>
            )
        })

        /* Decide what to register in the main context-menu:
            - When there is exactly one V-Span category (e.g. “Disruption”) show a single top-level Item “Add Disruption”.
            - When there are multiple categories keep the existing “Add VSpan” submenu containing one Item per type.
            - This prevents an unnecessary extra click in the single-category case.
        */
        const menuElement =
            categories.length === 1
                ? ( // single-category Case 
                    <Item
                        key="add-vspan-single"
                        id="add-vspan-single"
                        onClick={({props}) => {
                            add(props.x, categories[0]) 
                        }}
                    >
                        {`Add ${categories[0].name}`}
                    </Item>
                ) : ( // multiple-category branch
                    <Submenu key="vspan-submenu" label="Add VSpan">
                        {addVSpanItems}
                    </Submenu>
                )
        registerMenuItem("vspan", menuElement)
    }, [categories, onModifyVSpan, registerMenuItem])

    // Initialisation of data - this should only run once
    useEffect(() => {
        if (!initialData) return;
    
        spans.current = [...initialData]; 
        triggerVSpanUpdate();
    
        /* cleanup runs when the first (discarded) mount unmounts */
        return () => {
          spans.current = [];
        };
      }, [initialData]);

    // Provides an array of the categories for the context menu
    const updateTypeItems = categories.map((category, index) => {
        return (
            <Item key={`update${index}`} id={`update${index}`} onClick={(props) => {handleTypeSetting(props, category)}}>
                {category.name}
            </Item>
        )
    })

    // The context provider is responsible for rendering the context menu relating to VSpans
    return (
        <VSpanContext.Provider value={{vspans: spans.current, handleVSpanUpdate, handleVSpanDragFinish, addVSpan, activateTooling, triggerUpdate}}>
            {children}
            <Menu id={`${VSPAN_MENU_ID}`}>
                <Item id="delete" onClick={({props}: ItemParams) => {
                    handleDelete(props.vspan)
                }}>
                    Delete
                </Item>
                {updateTypeItems.length > 1 && (
                    <Submenu label="Set type">
                        {updateTypeItems}
                    </Submenu>
                )}
                
            </Menu>
        </VSpanContext.Provider>
    )
}