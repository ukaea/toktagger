"use client"

import { TimeSeriesAnnotation, TimeSeriesAnnotationType, ToolingCallbacks } from "@/types"
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react"
import {v4 as uuidv4} from "uuid"

type TimeSeriesActions = {
    createAnnotation: (type: TimeSeriesAnnotationType) => TimeSeriesAnnotation;
    addAnnotation: (annotation: TimeSeriesAnnotation) => void;
    updateAnnotation: (annotation: TimeSeriesAnnotation) => void;
    getAnnotation: (id: string) => TimeSeriesAnnotation | null;
    setAnnotationTool: (tool: TimeSeriesAnnotationType | null) => void;
    registerTooling: (type: TimeSeriesAnnotationType, callbacks: ToolingCallbacks) => void;
    triggerUpdate: () => void;
}

type TimeSeriesState = {
    annotations: TimeSeriesAnnotation[];
    activeAnnotationTool: TimeSeriesAnnotationType | null;
    toolingCallbacks: Map<TimeSeriesAnnotationType, ToolingCallbacks>;
    forceUpdate: number;
    isDrawing: boolean;
}

const TimeSeriesActionsContext = createContext<TimeSeriesActions | null>(null);
const TimeSeriesStateContext = createContext<TimeSeriesState | null>(null);

export const useTimeSeriesActions = () => {
    const context = useContext(TimeSeriesActionsContext);
    if (!context) {
        throw new Error(
            "useTimeSeriesActions must be used within a TimeSeriesProvider",
        )
    }
    return context;
}

export const useTimeSeriesState = () => {
    const context = useContext(TimeSeriesStateContext);
    if (!context) {
        throw new Error(
            "useTimeSeriesState must be used within a TimeSeriesProvider",
        )
    }
    return context;
}

export const TimeSeriesProvider = ({children} : {children: React.ReactNode}) => {
    const [annotations, setAnnotations] = useState<TimeSeriesAnnotation[]>([]);
    const [toolingCallbacks, setToolingCallbacks] = useState<Map<TimeSeriesAnnotationType, ToolingCallbacks>>(new Map())
    const [activeTool, setActiveTool] = useState<TimeSeriesAnnotationType | null>(TimeSeriesAnnotationType.VSPAN);
    const [updateCounter, setUpdateCounter] = useState(0);
    const [isDrawing, setIsDrawing] = useState(false);

    const createAnnotation = useCallback((type: TimeSeriesAnnotationType) : TimeSeriesAnnotation => {
        const id = uuidv4();
        return {
            id,
            type,
            points: []
        }
    }, [])

    const addAnnotation = useCallback((annotation: TimeSeriesAnnotation) => {
        setAnnotations(prev => [...prev, annotation])
    }, [])

    const getAnnotation = useCallback((id: string) => {
        annotations.forEach((annotation) => {
            if (annotation.id === id) return annotation
        })
        console.warn(`Annotation with id: ${id} could not be found`)
        return null;
    }, [annotations])

    const registerTooling = useCallback((type: TimeSeriesAnnotationType, callbacks: ToolingCallbacks) => {
        setToolingCallbacks((prev) => {
            if (prev.has(type)) return prev;
            const newMap = new Map(prev);
            newMap.set(type, callbacks);
            return newMap;
        })
    }, [])

    const setAnnotationTool = useCallback((type: TimeSeriesAnnotationType | null) => {
        if (!type || toolingCallbacks.has(type)) {
            setActiveTool(type);
            return;
        }
        console.warn(`Could not set ${type} as active tool since no callback has been registered`)
    }, [toolingCallbacks])

    const updateAnnotation = useCallback((annotation: TimeSeriesAnnotation) => {
        setAnnotations((prev) => prev.map(item => 
            item.id === annotation.id ? annotation : item
        ))
    }, [])

    const triggerUpdate = useCallback(() => {
        setUpdateCounter((prev) => (prev + 1) % 100)
    }, [])

    const actionsValue: TimeSeriesActions = useMemo(() => ({
        createAnnotation,
        addAnnotation,
        setAnnotationTool,
        registerTooling,
        updateAnnotation,
        getAnnotation,
        triggerUpdate
    }), [createAnnotation, addAnnotation, setAnnotationTool, registerTooling, updateAnnotation, getAnnotation, triggerUpdate])

    const stateValue: TimeSeriesState = useMemo(() => ({
        annotations,
        activeAnnotationTool: activeTool,
        toolingCallbacks,
        forceUpdate: updateCounter,
        isDrawing
    }), [annotations, activeTool, toolingCallbacks, updateCounter, isDrawing])

    useEffect(() => {
        const enterDrawMode = (event: KeyboardEvent) => {
            if (event.key === "Control") {
                setIsDrawing(true);
            }
        };

        const exitDrawMode = (event: KeyboardEvent) => {
            if (event.key === "Control") {
                setIsDrawing(false);
            }
        };

        document.addEventListener("keydown", enterDrawMode);
        document.addEventListener("keyup", exitDrawMode);

        return () => {
            document.removeEventListener("keydown", enterDrawMode);
            document.removeEventListener("keyup", exitDrawMode);
        };
    }, [])

    return (
        <TimeSeriesActionsContext.Provider
            value={actionsValue}
        >
            <TimeSeriesStateContext
                value={stateValue}
            >
                {children}
            </TimeSeriesStateContext>
        </TimeSeriesActionsContext.Provider>
    )
}