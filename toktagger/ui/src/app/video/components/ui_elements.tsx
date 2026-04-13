"use client";

import React, { useState } from "react";
import {
  Button,
  ComboBox,
  Item,
  Tooltip,
  TooltipTrigger,
  View,
} from "@adobe/react-spectrum";
import StepBackward from "@spectrum-icons/workflow/StepBackward";
import FullScreenExit from "@spectrum-icons/workflow/FullScreenExit";

/**
 * Minimal class category shape consumed by the class picker.
 * Kept intentionally small so this file stays UI-only and decoupled from session/types.
 */
export type ClassCategoryItem = {
  name: string;
};

/**
 * Class selector used to "arm" drawing with a label.
 * When no class is selected, the annotator should disable drawing.
 */
export function ClassPanel({
  items,
  selectedClassName,
  setSelectedClassName,
}: {
  items: Iterable<ClassCategoryItem>;
  selectedClassName: string | null;
  setSelectedClassName: (v: string | null) => void;
}) {
  return (
    <View marginX="auto" width="12rem">
      <ComboBox
        label={
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Class Label
          </span>
        }
        items={items}
        selectedKey={selectedClassName}
        onSelectionChange={(key) =>
          setSelectedClassName((key as string) || null)
        }
        width="100%"
      >
        {(item) => <Item key={item.name}>{item.name}</Item>}
      </ComboBox>
    </View>
  );
}

function DragZoomIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v16M4 12h16" />
      <path d="M12 4l-2 2M12 4l2 2M12 20l-2-2M12 20l2-2" />
      <path d="M4 12l2-2M4 12l2 2M20 12l-2-2M20 12l-2 2" />
    </svg>
  );
}

function RectangleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="6.5" width="15" height="11" rx="1.5" />
    </svg>
  );
}

function PolygonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 5.5L18 8.5L15.5 18.5L5.5 17L4.5 9.5Z" />
      <circle cx="7" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="18.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="17" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CanvasToolButton(props: {
  label: string;
  isActive: boolean;
  isSecondary?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const tone = props.isSecondary
    ? "border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:bg-gray-800"
    : props.isActive
      ? "border-orange-400 bg-orange-500 text-white shadow-[0_0_0_2px_rgba(251,146,60,0.35)]"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800";

  return (
    <TooltipTrigger delay={350} placement="left">
      <button
        type="button"
        onClick={props.onPress}
        aria-label={props.label}
        aria-pressed={props.isSecondary ? undefined : props.isActive}
        className={`h-10 w-10 rounded-lg border transition-colors duration-150 flex items-center justify-center ${tone}`}
      >
        {props.children}
      </button>
      <Tooltip>{props.label}</Tooltip>
    </TooltipTrigger>
  );
}

export function CanvasModeToolbar(props: {
  panMode: boolean;
  drawingTool: "rectangle" | "polygon";
  onTogglePanMode: () => void;
  onSelectRectangle: () => void;
  onSelectPolygon: () => void;
  onResetView: () => void;
}) {
  return (
    <View
      position="absolute"
      top="size-100"
      right={0}
      zIndex={20}
      UNSAFE_style={{ transform: "translateX(calc(100% + 12px))" }}
    >
      <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-300/80 bg-white/90 p-2 shadow-md backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80">
        <CanvasToolButton
          label="Drag / Zoom"
          isActive={props.panMode}
          onPress={props.onTogglePanMode}
        >
          <DragZoomIcon />
        </CanvasToolButton>
        <CanvasToolButton
          label="Rectangle"
          isActive={!props.panMode && props.drawingTool === "rectangle"}
          onPress={props.onSelectRectangle}
        >
          <RectangleIcon />
        </CanvasToolButton>
        <CanvasToolButton
          label="Polygon"
          isActive={!props.panMode && props.drawingTool === "polygon"}
          onPress={props.onSelectPolygon}
        >
          <PolygonIcon />
        </CanvasToolButton>
        <div className="my-0.5 h-px w-full bg-gray-300 dark:bg-gray-700" />
        <CanvasToolButton
          label="Reset view"
          isActive={false}
          isSecondary
          onPress={props.onResetView}
        >
          <FullScreenExit aria-hidden="true" size="S" />
        </CanvasToolButton>
      </div>
    </View>
  );
}

/** Minimal shape used to render/select a tracked instance in the sidebar list. */
export type Profile = {
  key: string;
  class_id: number;
  class_name: string;
  track_id: string;
  first_frame?: number | null;
};

/**
 * Instance list + optional "profile creator" UI.
 * - Selecting an instance calls `onSelect`.
 * - Jump control calls `onJumpToFirstFrame`.
 * - Right-clicking an instance calls `onRequestBulkDelete`.
 * - The creator UI is gated by `showCreator` and `classItems`.
 */
export function InstancePanel({
  profiles,
  selectedKey,
  onSelect,
  onJumpToFirstFrame,
  onCreateProfile,
  onRequestBulkDelete,
  onRequestDeleteAllInstances,
  profileCounts,
  showCreator = true,
  // Only used when showCreator=true
  classItems,
}: {
  profiles: Profile[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onJumpToFirstFrame?: (profile: Profile) => void;
  onCreateProfile: (className: string, trackId: string) => void;
  onRequestBulkDelete: (profile: Profile) => void;
  onRequestDeleteAllInstances: () => void;
  profileCounts?: Record<string, number>;
  showCreator?: boolean;
  classItems?: { name: string }[];
}) {
  const [open, setOpen] = useState(false);

  // Creator UI state (only meaningful when showCreator=true)
  const defaultClass = classItems?.[0]?.name ?? "";
  const [className, setClassName] = useState<string>(defaultClass);

  const makeAutoTrackId = () =>
    `auto-${Math.random().toString(36).slice(2, 7)}`;
  const [trackId, setTrackId] = useState<string>(() => makeAutoTrackId());

  const creatorEnabled = Boolean(classItems && classItems.length > 0);

  return (
    <div className="w-48 shrink-0 mx-auto">
      {showCreator && (
        <div className="mb-3">
          <Button
            onPress={() => {
              setOpen((prev) => {
                const next = !prev;
                if (next) setTrackId(makeAutoTrackId());
                return next;
              });
            }}
            isDisabled={!creatorEnabled}
            width="100%"
            variant="secondary"
          >
            Add Profile
          </Button>

          {!creatorEnabled && (
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Creator disabled (no class items provided).
            </div>
          )}
        </div>
      )}

      <button
        onClick={onRequestDeleteAllInstances}
        disabled={profiles.length === 0}
        className={`mb-2 w-full rounded-lg px-2.5 py-1.5 text-left border shadow-sm ${
          profiles.length
            ? "border-red-300 bg-white text-red-700 hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400/30 dark:border-red-500/70 dark:bg-gray-950 dark:text-red-300 dark:hover:border-red-400 dark:hover:bg-red-950/40"
            : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"
        }`}
        title="Delete all instances and their annotations across all frames"
      >
        <span className="text-sm">Delete All Instances</span>
      </button>

      {showCreator && open && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-white p-2 text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Class Label
            </label>
            <select
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {(classItems ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Track ID
            </label>
            <input
              type="text"
              value={trackId}
              readOnly
              className="mt-1 w-full cursor-not-allowed select-all rounded border border-gray-300 bg-gray-100 px-2 py-1 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              title="Auto-generated; not editable"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                const name = (className || "").trim();
                const trk = (trackId || "").trim();
                if (!name || !trk) return;
                onCreateProfile(name, trk);
                setOpen(false);
              }}
              className="flex-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1.5 text-xs"
              disabled={!creatorEnabled}
            >
              Create
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 max-h-[45vh] overflow-y-auto rounded-lg border border-gray-200 bg-white/90 shadow-sm dark:border-gray-700 dark:bg-gray-950/70">
        {profiles.length === 0 && (
          <div className="p-3 text-sm text-gray-600 dark:text-gray-300">
            {showCreator
              ? "No profiles yet. Click “Add Profile”."
              : "No instances yet. Pick a class above, then draw to create one."}
          </div>
        )}

        {profiles.map((p) => {
          const count = profileCounts?.[p.key] ?? 0;
          const canJumpToFirstFrame = Boolean(
            onJumpToFirstFrame && p.first_frame != null,
          );

          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onSelect(p.key)}
              onContextMenu={(e) => {
                e.preventDefault();
                onRequestBulkDelete(p);
              }}
              className={`w-full text-left px-2 py-1.5 border-b last:border-b-0 transition leading-snug ${
                selectedKey === p.key
                  ? "border-orange-200 bg-orange-50 ring-1 ring-orange-400/40 dark:border-gray-600 dark:bg-gray-900 dark:ring-orange-400/60"
                  : "border-gray-200 bg-transparent hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
              } text-gray-900 dark:text-gray-100`}
              title={`Select: ${p.class_name} (${p.track_id}). Use the rewind button to jump to first frame. Right-click to bulk delete.`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                    #{p.track_id}
                  </div>
                  <div className="mt-0 text-[11px] text-gray-600 dark:text-gray-300">
                    Class: {p.class_name}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="inline-block rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    title="Total annotations for this instance across all frames"
                  >
                    {count}
                  </span>

                  <div className="w-14 flex flex-col items-stretch gap-1 shrink-0">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRequestBulkDelete(p);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onRequestBulkDelete(p);
                        }
                      }}
                      className="w-full cursor-pointer select-none rounded-md border border-red-300 px-2 py-1 text-center text-[10px] text-red-700 hover:bg-red-50 dark:border-red-400/60 dark:text-red-200 dark:hover:bg-red-500/15"
                      title="Delete this instance across all frames"
                      aria-label={`Delete ${p.class_name} ${p.track_id}`}
                    >
                      Delete
                    </span>

                    <span
                      role="button"
                      tabIndex={canJumpToFirstFrame ? 0 : -1}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canJumpToFirstFrame) return;
                        onJumpToFirstFrame?.(p);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canJumpToFirstFrame) return;
                          onJumpToFirstFrame?.(p);
                        }
                      }}
                      className={`w-full rounded-md px-1.5 py-0.5 text-[10px] border inline-flex items-center justify-center select-none ${
                        canJumpToFirstFrame
                          ? "cursor-pointer border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-400/60 dark:text-gray-100 dark:hover:bg-gray-500/15"
                          : "cursor-not-allowed border-gray-200 text-gray-300 dark:border-gray-800 dark:text-white/30"
                      }`}
                      title={
                        canJumpToFirstFrame
                          ? "Jump to the first frame where this instance appears"
                          : "No known first frame for this instance"
                      }
                      aria-label={
                        canJumpToFirstFrame
                          ? `Jump to first frame for ${p.class_name} ${p.track_id}`
                          : `No first frame available for ${p.class_name} ${p.track_id}`
                      }
                    >
                      <StepBackward aria-hidden="true" size="XS" />
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Simple confirmation modal used by destructive actions (bulk deletes, etc.).
 * Kept dependency-free to avoid quirks across UI libraries.
 */
export function ConfirmModal({
  open,
  title,
  message,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  details?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>

        <div className="px-4 py-3 space-y-2">
          <p className="text-sm text-gray-700 dark:text-gray-200">{message}</p>
          {details && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {details}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
