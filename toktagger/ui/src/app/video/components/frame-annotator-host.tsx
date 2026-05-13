"use client";

import React, { useEffect, useMemo, useState } from "react";
import OpenSeadragon from "openseadragon";
import {
  OpenSeadragonAnnotator,
  OpenSeadragonAnnotationPopup,
  OpenSeadragonViewer,
  UserSelectAction,
  useAnnotator,
  type AnnotationState,
  type AnnotoriousOpenSeadragonAnnotator,
  type ImageAnnotation,
  type PopupProps,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import { useVideoSession } from "@/app/video/components/video-session";
import { useSample } from "@/app/contexts/SampleContext";
import { useSampleHistory } from "@/app/contexts/SampleHistoryContext";
import {
  getLabelTrack,
  isPolygonAnno,
  isRectangleAnno,
  readPolygonGeometry,
  readRectGeometry,
} from "./anno-utils";
import { AnnotationPopup } from "./annotation-popup";
import { annotationContainsPoint, setViewerCursor } from "./overlay-sync-utils";
import { CanvasModeToolbar } from "./ui_elements";

function setGestureNavigation(
  viewer: OpenSeadragon.Viewer,
  navEnabled: boolean,
) {
  const mouse = viewer.gestureSettingsByDeviceType("mouse");
  mouse.dragToPan = navEnabled;
  mouse.scrollToZoom = navEnabled;
  mouse.clickToZoom = false;
  mouse.dblClickToZoom = false;

  const touch = viewer.gestureSettingsByDeviceType("touch");
  touch.dragToPan = navEnabled;
  touch.pinchToZoom = navEnabled;
  touch.clickToZoom = false;
  touch.dblClickToZoom = false;

  const pen = viewer.gestureSettingsByDeviceType("pen");
  pen.dragToPan = navEnabled;
  pen.scrollToZoom = false;
  pen.clickToZoom = false;
  pen.dblClickToZoom = false;

  const unknown = viewer.gestureSettingsByDeviceType("unknown");
  unknown.dragToPan = navEnabled;
  unknown.scrollToZoom = navEnabled;
  unknown.clickToZoom = false;
  unknown.dblClickToZoom = false;
}

function findAnnotationOverlay(viewerElement: HTMLElement | null) {
  if (!viewerElement) return null;

  const scopes = [
    viewerElement,
    viewerElement.parentElement,
    viewerElement.parentElement?.parentElement,
  ].filter(Boolean) as HTMLElement[];

  for (const scope of scopes) {
    const hit = scope.querySelector<HTMLElement>(".a9s-annotationlayer");
    if (hit) return hit;
  }

  return null;
}

function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function isSecondaryMouseEvent(event: MouseEvent | PointerEvent) {
  return event.button !== 0 || (event.buttons & 2) === 2;
}

/**
 * Top-level host that provides the Annotorious context and renders the annotator.
 */
export function FrameAnnotatorHost(props: { imageBase64: string }) {
  return <Inner imageBase64={props.imageBase64} />;
}

/**
 * View-only annotator host:
 * - renders the Annotorious OpenSeadragon annotator + popup UI for the current frame
 * - reports the image’s natural size to the session (used for bounds clamping)
 *
 * Note: all Annotorious integration (create/update/delete/selectionChanged),
 * overlay normalization/clamping, and session persistence now live in
 * VideoSessionProvider. This component should not sync overlays or write back
 * to the session store directly.
 */
function Inner({ imageBase64 }: { imageBase64: string }) {
  const { annotationLabels } = useSample();
  const { setVideoLastClassName } = useSampleHistory();
  const {
    frame,
    setImageNatural,
    selection,
    setSelection,
    drawingTool,
    setDrawingTool,
    panMode,
    setPanMode,
    hideAnnotations,
    deleteAnnotation,
  } = useVideoSession();
  const api = useAnnotator<AnnotoriousOpenSeadragonAnnotator>();
  const [dismissedPopupAnnotationId, setDismissedPopupAnnotationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!api?.on || !api?.off) return;

    const onSelectionChanged = (arr: ImageAnnotation[]) => {
      if (arr.length === 0) {
        setDismissedPopupAnnotationId(null);
        return;
      }

      const selectedId =
        typeof arr[0]?.id === "string" ? String(arr[0].id) : null;
      if (!selectedId) {
        setDismissedPopupAnnotationId(null);
        return;
      }

      // Keep popup dismissed only for the same currently selected annotation.
      setDismissedPopupAnnotationId((prev) =>
        prev && prev !== selectedId ? null : prev,
      );
    };

    api.on("selectionChanged", onSelectionChanged);

    return () => {
      api.off("selectionChanged", onSelectionChanged);
    };
  }, [api]);

  useEffect(() => {
    setDismissedPopupAnnotationId(null);
  }, [frame]);

  useEffect(() => {
    setImageNatural(null);
  }, [frame, setImageNatural]);

  const dataUrl = useMemo(
    () => `data:image/png;base64,${imageBase64}`,
    [imageBase64],
  );

  useEffect(() => {
    if (!api?.viewer) return;

    const onOpen = () => {
      const item = api.viewer.world.getItemAt(0);
      if (!item) return;

      const size = item.getContentSize();
      const w = Math.round(Number(size?.x ?? 0));
      const h = Math.round(Number(size?.y ?? 0));
      if (w > 0 && h > 0) {
        setImageNatural({ w, h });
      }
    };

    api.viewer.addHandler("open", onOpen);
    onOpen();

    return () => {
      api.viewer.removeHandler("open", onOpen);
    };
  }, [api, dataUrl, setImageNatural]);

  useEffect(() => {
    if (!api) return;

    if (api.viewer) {
      api.viewer.setMouseNavEnabled(panMode);
      setGestureNavigation(api.viewer, panMode);

      const overlayInteractionDisabled = panMode || hideAnnotations;
      const overlay = findAnnotationOverlay(api.viewer.element as HTMLElement);
      if (overlay) {
        overlay.style.pointerEvents = overlayInteractionDisabled
          ? "none"
          : "auto";
        overlay.style.opacity = hideAnnotations ? "0" : "1";
      }
    }

    api.setUserSelectAction(
      panMode || hideAnnotations
        ? UserSelectAction.NONE
        : UserSelectAction.EDIT,
    );

    if (panMode || hideAnnotations) {
      api.setSelected?.();
    }

    return () => {
      const overlay = findAnnotationOverlay(
        api.viewer?.element as HTMLElement | null,
      );
      if (overlay) {
        overlay.style.pointerEvents = "auto";
        overlay.style.opacity = "1";
      }
    };
  }, [api, hideAnnotations, panMode]);

  useEffect(() => {
    if (!api?.viewer) return;

    const viewerElement = api.viewer.element as HTMLElement;
    const overlay = findAnnotationOverlay(viewerElement);
    const targets = [viewerElement, overlay].filter(
      (target, index, list): target is HTMLElement =>
        !!target && list.indexOf(target) === index,
    );

    const blockContextMenu = (event: MouseEvent) => {
      stopEvent(event);
      api.cancelDrawing?.();
    };

    const blockSecondaryMouse = (event: MouseEvent | PointerEvent) => {
      if (!isSecondaryMouseEvent(event)) return;

      stopEvent(event);
      api.cancelDrawing?.();
    };

    for (const target of targets) {
      target.addEventListener("contextmenu", blockContextMenu, true);
      target.addEventListener("pointerdown", blockSecondaryMouse, true);
      target.addEventListener("pointerup", blockSecondaryMouse, true);
      target.addEventListener("mousedown", blockSecondaryMouse, true);
      target.addEventListener("mouseup", blockSecondaryMouse, true);
      target.addEventListener("click", blockSecondaryMouse, true);
      target.addEventListener("auxclick", blockSecondaryMouse, true);
    }

    return () => {
      for (const target of targets) {
        target.removeEventListener("contextmenu", blockContextMenu, true);
        target.removeEventListener("pointerdown", blockSecondaryMouse, true);
        target.removeEventListener("pointerup", blockSecondaryMouse, true);
        target.removeEventListener("mousedown", blockSecondaryMouse, true);
        target.removeEventListener("mouseup", blockSecondaryMouse, true);
        target.removeEventListener("click", blockSecondaryMouse, true);
        target.removeEventListener("auxclick", blockSecondaryMouse, true);
      }
    };
  }, [api]);

  const drawingEnabled = !!selection.className && !panMode && !hideAnnotations;
  const classItems = useMemo(
    () => annotationLabels.map((label) => ({ name: label.name })),
    [annotationLabels],
  );

  const selectClassName = (name: string) => {
    const cls = (name ?? "").trim();
    if (!cls) return;

    setVideoLastClassName(cls);
    setSelection({ className: cls, trackId: null, source: "explicit" });
  };

  useEffect(() => {
    if (!api) return;

    api.setDrawingTool(drawingTool);
    api.setDrawingEnabled(drawingEnabled);

    if (!drawingEnabled) {
      api.cancelDrawing?.();
    }
  }, [api, drawingEnabled, drawingTool]);

  useEffect(() => {
    if (!api?.viewer || hideAnnotations || (!drawingEnabled && !panMode)) {
      return;
    }

    const viewer = api.viewer;
    const viewerElement = viewer.element as HTMLElement;

    const handleMouseMove = (event: MouseEvent) => {
      const viewerBounds = viewerElement.getBoundingClientRect();
      const viewerPoint = new OpenSeadragon.Point(
        event.clientX - viewerBounds.left,
        event.clientY - viewerBounds.top,
      );
      const imagePoint =
        viewer.viewport.viewerElementToImageCoordinates(viewerPoint);

      const isOverAnnotation = api
        .getAnnotations()
        .some((annotation: ImageAnnotation) =>
          annotationContainsPoint(annotation, imagePoint),
        );

      const cursor = panMode
        ? isOverAnnotation
          ? "default"
          : ""
        : isOverAnnotation
          ? "pointer"
          : "";

      setViewerCursor(viewerElement, cursor);
    };

    const clearCursor = () => {
      setViewerCursor(viewerElement, "");
    };

    viewerElement.addEventListener("mousemove", handleMouseMove);
    viewerElement.addEventListener("mouseleave", clearCursor);

    return () => {
      viewerElement.removeEventListener("mousemove", handleMouseMove);
      viewerElement.removeEventListener("mouseleave", clearCursor);
      clearCursor();
    };
  }, [api, drawingEnabled, hideAnnotations, panMode]);

  const viewerOptions = useMemo<OpenSeadragon.Options>(
    () => ({
      tileSources: {
        type: "image",
        url: dataUrl,
      },
      minZoomImageRatio: 0.8,
      maxZoomPixelRatio: 10,
      visibilityRatio: 0.5,
      constrainDuringPan: true,
      animationTime: 0.3,
      showNavigationControl: false,
      mouseNavEnabled: false,
    }),
    [dataUrl],
  );

  const formatDetails = (annotation: ImageAnnotation) => {
    const rect = isRectangleAnno(annotation)
      ? readRectGeometry(annotation)
      : null;
    if (rect) {
      return `x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.w)}, h=${Math.round(rect.h)}`;
    }

    const polygon = isPolygonAnno(annotation)
      ? readPolygonGeometry(annotation)
      : null;
    if (!polygon) return null;

    const { minX, minY, maxX, maxY } = polygon.bounds;

    const width = maxX - minX;
    const height = maxY - minY;

    return `pts=${polygon.points.length}, x=${Math.round(minX)}, y=${Math.round(minY)}, w=${Math.round(width)}, h=${Math.round(height)}`;
  };

  const resetView = () => {
    const viewer = api?.viewer;
    const viewport = viewer?.viewport;
    if (!viewport) return;

    viewport.goHome(true);
    viewport.applyConstraints();
  };

  return (
    <div className="w-full flex justify-center">
      <div className="relative w-full max-w-[1100px] h-[calc(100dvh-240px)] min-h-[360px]">
        <CanvasModeToolbar
          panMode={panMode}
          drawingTool={drawingTool}
          hideAnnotations={hideAnnotations}
          classItems={classItems}
          selectedClassName={selection.className}
          onTogglePanMode={() => setPanMode(!panMode)}
          onSelectRectangle={() => {
            setPanMode(false);
            setDrawingTool("rectangle");
          }}
          onSelectPolygon={() => {
            setPanMode(false);
            setDrawingTool("polygon");
          }}
          onSelectClassName={selectClassName}
          onResetView={resetView}
        />

        <OpenSeadragonAnnotator
          tool={drawingTool}
          drawingEnabled={drawingEnabled}
          drawingMode="drag"
          autoSave
          style={(_annotation: ImageAnnotation, state?: AnnotationState) => ({
            strokeWidth: state?.selected ? 3 : 2,
          })}
        >
          <OpenSeadragonViewer
            className="h-full w-full select-none"
            options={viewerOptions}
          />

          {/* Built-in Annotorious popup positioning for zoom/pan viewers */}
          <OpenSeadragonAnnotationPopup
            popup={(props: PopupProps) => {
              const annotation = props.annotation as ImageAnnotation;
              const annotationId =
                typeof annotation?.id === "string"
                  ? String(annotation.id)
                  : null;

              if (annotationId && annotationId === dismissedPopupAnnotationId) {
                return null;
              }

              const { className, trackId } = getLabelTrack(annotation);
              const geometry = isRectangleAnno(annotation)
                ? readRectGeometry(annotation)
                : null;
              const details = formatDetails(annotation);

              return (
                <AnnotationPopup
                  className={className}
                  trackId={trackId}
                  geometry={geometry}
                  details={details}
                  onDeleteBox={() => {
                    const id = annotation?.id;
                    if (!id) return;
                    deleteAnnotation(id);
                  }}
                  onClose={() => {
                    if (!annotationId) return;
                    setDismissedPopupAnnotationId(annotationId);
                  }}
                />
              );
            }}
          />
        </OpenSeadragonAnnotator>
      </div>
    </div>
  );
}
