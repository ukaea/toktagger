"use client"

import { Annotation, TimeSeriesAnnotation, TimeSeriesAnnotationType, TimeSeriesCategory, TimeSeriesToolDefinition, ToolingCallbacks } from "@/types"
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react"
import {v4 as uuidv4} from "uuid"
import { useSample } from "./SampleContext"
import { convertRawAnnotationsToTimeSeries, convertTimeSeriesToRawAnnotations, randomColor } from "../utils"

type TimeSeriesActions = {
    createAnnotation: (type: TimeSeriesAnnotationType, label: string) => TimeSeriesAnnotation;
    addAnnotation: (annotation: TimeSeriesAnnotation) => void;
    updateAnnotation: (annotation: TimeSeriesAnnotation) => void;
    getAnnotation: (id: string) => TimeSeriesAnnotation | null;
    setAnnotationTool: (tool: TimeSeriesToolDefinition | null) => void;
    registerTooling: (type: TimeSeriesAnnotationType, callbacks: ToolingCallbacks) => void;
    syncAnnotations: () => void;
    triggerUpdate: () => void;
}

type TimeSeriesState = {
    annotations: TimeSeriesAnnotation[];
    activeAnnotationTool: TimeSeriesToolDefinition | null;
    toolingCallbacks: Map<TimeSeriesAnnotationType, ToolingCallbacks>;
    forceUpdate: number;
    isDrawing: boolean;
    categories: Map<string, TimeSeriesCategory>;
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
    const {annotations: rawAnnotations, setAnnotations: setRawAnnotations, project} = useSample();

    const [annotations, setAnnotations] = useState<TimeSeriesAnnotation[]>([]);
    const [toolingCallbacks, setToolingCallbacks] = useState<Map<TimeSeriesAnnotationType, ToolingCallbacks>>(new Map())
    const [activeTool, setActiveTool] = useState<TimeSeriesToolDefinition | null>({type: TimeSeriesAnnotationType.TIME_REGION, label: "TEST_LABEL"});
    const [updateCounter, setUpdateCounter] = useState(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [categories, setCategories] = useState<Map<string, TimeSeriesCategory>>(new Map());

    console.log(categories)

    const parseRawAnnotations = useCallback((annotations: Annotation[]): TimeSeriesAnnotation[] => {
        const parsedAnnotations: TimeSeriesAnnotation[] = [];
        annotations.forEach((annotation) => {
            const parsedAnnotation = convertRawAnnotationsToTimeSeries(annotation);
            if (parsedAnnotation) parsedAnnotations.push(parsedAnnotation);
        })
        return parsedAnnotations;
    }, []);

    const parseTimeSeriesAnnotations = useCallback((annotations: TimeSeriesAnnotation[]): Annotation[] => {
        const parsedAnnotations: Annotation[] = [];
        annotations.forEach((annotation) => {
            const parsedAnnotation = convertTimeSeriesToRawAnnotations(annotation);
            if (parsedAnnotation) parsedAnnotations.push(parsedAnnotation);
        })
        return parsedAnnotations;
    }, []);

    useEffect(() => {
        if (!project) return;
        const timeSeriesCategories: Map<string, TimeSeriesCategory> = new Map();
        if (project.time_point_labels) {
            project.time_point_labels.forEach((label, index) => {
                timeSeriesCategories.set(label, 
                {
                    label,
                    color: randomColor(index),
                    type: TimeSeriesAnnotationType.TIME_POINT
                })
            })
        }
        if (project.time_region_labels) {
            project.time_region_labels.forEach((label, index) => {
                timeSeriesCategories.set(label, 
                {
                    label,
                    color: randomColor(index),
                    type: TimeSeriesAnnotationType.TIME_REGION
                })
            })
        }
        setCategories(timeSeriesCategories)
    }, [project])
    
    useEffect(() => {
        setAnnotations(parseRawAnnotations(rawAnnotations));
    }, [parseRawAnnotations, rawAnnotations]);

    const createAnnotation = useCallback((type: TimeSeriesAnnotationType, label: string) : TimeSeriesAnnotation => {
        const id = uuidv4();
        return {
            id,
            created_by: "manual",
            label,
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

    const setAnnotationTool = useCallback((tool: TimeSeriesToolDefinition | null) => {
        if (!tool || toolingCallbacks.has(tool.type)) {
            setActiveTool(tool);
            return;
        }
        console.warn(`Could not set ${tool.type} as active tool since no callback has been registered`)
    }, [toolingCallbacks])

    const updateAnnotation = useCallback((annotation: TimeSeriesAnnotation) => {
        setAnnotations((prev) => prev.map(item => 
            item.id === annotation.id ? annotation : item
        ));
    }, [])

    const syncAnnotations = useCallback(() => {
        const rawAnnotations = parseTimeSeriesAnnotations(annotations);
        setRawAnnotations((_prev) => rawAnnotations);
    }, [annotations, parseTimeSeriesAnnotations, setRawAnnotations])

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
        syncAnnotations,
        triggerUpdate
    }), [createAnnotation, addAnnotation, setAnnotationTool, registerTooling, updateAnnotation, getAnnotation, syncAnnotations, triggerUpdate])

    const stateValue: TimeSeriesState = useMemo(() => ({
        annotations,
        activeAnnotationTool: activeTool,
        toolingCallbacks,
        forceUpdate: updateCounter,
        isDrawing,
        categories,
    }), [annotations, activeTool, toolingCallbacks, updateCounter, isDrawing, categories])

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