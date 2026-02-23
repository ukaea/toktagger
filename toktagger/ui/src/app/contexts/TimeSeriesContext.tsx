"use client"

import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react"
import {v4 as uuidv4} from "uuid"

export enum TimeSeriesAnnotationType {
    VSPAN,
    VZone,
}

type TimeSeriesAnnotationPoint = {
    x: number,
    y: number
}

type TimeSeriesAnnotation = {
    id: string,
    type: TimeSeriesAnnotationType,
    points: TimeSeriesAnnotationPoint[]
}

type TimeSeriesActions = {
    createAnnotation: (type: TimeSeriesAnnotationType) => TimeSeriesAnnotation;
    addAnnotation: (annotation: TimeSeriesAnnotation) => void;
    setAnnotationTool: (tool: TimeSeriesAnnotationType | null) => void;
}

type TimeSeriesState = {
    annotations: TimeSeriesAnnotation[];
    activeAnnotationTool: TimeSeriesAnnotationType | null;
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
    const [activeTool, setActiveTool] = useState<TimeSeriesAnnotationType | null>(null);

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

    const actionsValue: TimeSeriesActions = useMemo(() => ({
        createAnnotation,
        addAnnotation,
        setAnnotationTool: setActiveTool
    }), [createAnnotation, addAnnotation, setActiveTool])

    const stateValue: TimeSeriesState = useMemo(() => ({
        annotations,
        activeAnnotationTool: activeTool
    }), [annotations, activeTool])

    console.log(annotations);

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