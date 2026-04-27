"use client";

import React, { useEffect, useMemo } from "react";
import {
  OpenSeadragonAnnotator,
  OpenSeadragonAnnotationPopup,
  OpenSeadragonViewer,
  UserSelectAction,
  useAnnotator,
  type AnnotoriousOpenSeadragonAnnotator,
  type ImageAnnotation,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";

import { useVideoSession } from "@/app/video/components/video-session";
import {
  getLabelTrack,
  isPolygonAnno,
  isRectangleAnno,
  readPolygonGeometry,
  readRectGeometry,
} from "./anno-utils";
import { AnnotationPopup } from "./annotation-popup";
import { ResetViewButton } from "./ui_elements";

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
  const {
    frame,
    setImageNatural,
    selection,
    drawingTool,
    panMode,
    deleteAnnotation,
    closePopup,
  } = useVideoSession();
  const api = useAnnotator<AnnotoriousOpenSeadragonAnnotator>();

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

    const navEnabled = panMode;

    if (api.viewer) {
      api.viewer.gestureSettingsMouse.dragToPan = navEnabled;
      api.viewer.gestureSettingsMouse.scrollToZoom = navEnabled;
      api.viewer.gestureSettingsMouse.clickToZoom = false;
      api.viewer.gestureSettingsMouse.dblClickToZoom = false;

      api.viewer.gestureSettingsTouch.dragToPan = navEnabled;
      api.viewer.gestureSettingsTouch.pinchToZoom = navEnabled;

      api.viewer.gestureSettingsPen.dragToPan = navEnabled;

      api.viewer.gestureSettingsUnknown.dragToPan = navEnabled;
      api.viewer.gestureSettingsUnknown.scrollToZoom = navEnabled;
      api.viewer.gestureSettingsUnknown.clickToZoom = false;
      api.viewer.gestureSettingsUnknown.dblClickToZoom = false;
    }

    api.setUserSelectAction(
      panMode ? UserSelectAction.NONE : UserSelectAction.EDIT,
    );

    if (panMode) {
      api.setSelected?.();
    }
  }, [api, panMode]);

  const drawingEnabled = !!selection.className && !panMode;

  useEffect(() => {
    if (!api) return;

    api.setDrawingTool(drawingTool);
    api.setDrawingEnabled(drawingEnabled);

    if (!drawingEnabled) {
      api.cancelDrawing?.();
    }
  }, [api, drawingEnabled, drawingTool]);

  const viewerOptions = useMemo(
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
      gestureSettingsMouse: {
        scrollToZoom: false,
        dragToPan: false,
        clickToZoom: false,
        dblClickToZoom: false,
      },
      gestureSettingsTouch: {
        pinchToZoom: false,
        dragToPan: false,
      },
      gestureSettingsPen: {
        dragToPan: false,
      },
      gestureSettingsUnknown: {
        dragToPan: false,
        scrollToZoom: false,
        clickToZoom: false,
        dblClickToZoom: false,
      },
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
        <ResetViewButton onPress={resetView} />

        <OpenSeadragonAnnotator
          tool={drawingTool}
          drawingEnabled={drawingEnabled}
          drawingMode="drag"
          autoSave
          style={(
            _annotation,
            state?: { selected?: boolean; hovered?: boolean },
          ) => ({
            strokeWidth: state?.selected ? 3 : state?.hovered ? 3 : 2,
          })}
        >
          <OpenSeadragonViewer
            className="h-full w-full select-none"
            options={viewerOptions}
          />

          {/* Built-in Annotorious popup positioning for zoom/pan viewers */}
          <OpenSeadragonAnnotationPopup
            popup={(props) => {
              const annotation = props.annotation as ImageAnnotation;

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
                    closePopup();
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
