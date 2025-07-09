"use client"

import { ToolingCallbacks } from "@/types";
import React, { createContext, useCallback, useContext, useRef, useState } from "react"
import { Menu, ShowContextMenuParams, useContextMenu } from "react-contexify";

type MakeOptional<Type, Key extends keyof Type> = Omit<Type, Key> & Partial<Pick<Type, Key>>;

interface ContextMenuContextType {
    setToolingCallbacks: (callbacks: ToolingCallbacks) => void;
    registerMenuItem: (id: string, element: React.ReactNode) => void;
    show: (params: MakeOptional<ShowContextMenuParams<unknown>, "id">) => void
    toolingCallbacks: ToolingCallbacks | null;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useContextMenuProvider = () => {
    const context = useContext(ContextMenuContext);
    if (!context) {
        throw new Error("useRegisterContextMenuItem must be used within a ContextMenuProvider")
    }
    return context
}

/**
 * Context provider that gives child components access to context menu data
 * 
 * @param menuId Allows for a unique id to be assigned to the context menu 
 */
export const ContextMenuProvider = ({menuId, children} : {
    menuId: string, 
    children: React.ReactNode
}) => {
    const [menuElements, setMenuElements] = useState<Map<string, React.ReactNode>>(new Map());
    const {show} = useContextMenu({ id:  menuId})
    const [toolingCallbacksState, setToolingCallbacksState] = useState<ToolingCallbacks | null>(null);

    // Allows tools to register their own menu item in the general context menu
    const registerMenuItem = useCallback((id: string, element: React.ReactNode) => {
        setMenuElements((prev) => {
            if (prev.has(id)) return prev;
            const newMap = new Map(prev)
            newMap.set(id, element)
            return newMap;
        })
    }, [])

    const setToolingCallbacks = (callbacks: ToolingCallbacks) => {
        console.log("Set")
        setToolingCallbacksState(callbacks)
    }

    return (
        <ContextMenuContext.Provider value={{setToolingCallbacks, registerMenuItem, show, toolingCallbacks: toolingCallbacksState}}>
            {children}
            <Menu id={menuId}>
                {[...menuElements.values()]}
            </Menu>
        </ContextMenuContext.Provider>
    )
}