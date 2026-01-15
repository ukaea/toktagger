"use client";

import React, { useMemo, useState } from "react";
import type { ImageAnnotation } from "@annotorious/react";
import { useAnnotator } from "@annotorious/react";
import { LABEL_MAP, extractClassLabel, rectToDims } from "./lib";
import { Item, Text, Picker } from "@adobe/react-spectrum";

/**
 * UI helpers for the UFO video annotation flow.
 *
 * This file is intentionally “dumb UI”:
 * - No localStorage reads/writes
 * - No cross-frame scanning
 * - No backend calls
 *
 * Instead, these components:
 * - render selection controls (class + instance profiles)
 * - surface destructive actions (bulk delete / delete all) via callbacks
 * - show annotation metadata in the popup (label/track/size) + delete button
 * - provide lightweight toast + confirm modal primitives
 */

/** Minimal category shape needed by ClassPanel (keeps this component decoupled from LABEL_MAP). */
type ClassCategoryItem = {
  name: string;
};

/** ------------------------------------------------------------------
 *  ClassPanel — dropdown for detection/tracking class selection
 *
 *  Purpose:
 *  - The toolbar needs a “currently armed class” selection.
 *  - In tracking-mode we still keep a class armed (even when an instance isn't selected).
 *  - Frame drawing is enabled once the user picks a class.
 *
 *  Notes:
 *  - This component does not create instances; it only selects a class label.
 *  - The actual stamping of class/track onto annotations happens in bridge/lib.
 *  ------------------------------------------------------------------ */
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
    <div className="rounded-xl border border-gray-700 bg-black shadow-sm p-3 w-48 mx-auto">
      {/* Simple header label for the dropdown */}
      <Text UNSAFE_className="text-sm font-medium mb-2 block text-white">
        Class
      </Text>

      {/* Spectrum Picker: drives the “armed class label” used by the annotator */}
      <Picker
        aria-label="Class"
        items={items}
        selectedKey={selectedClassName}
        onSelectionChange={(key) =>
          // We accept the Picker key as the class name string.
          setSelectedClassName((key as string) || null)
        }
        placeholder="— Select class —"
        width="100%"
      >
        {(item) => <Item key={item.name}>{item.name}</Item>}
      </Picker>

      {/* UX hint: drawing is gated by class selection */}
      <Text UNSAFE_className="text-xs mt-2 block text-white/80">
        Drawing is enabled after you pick a class.
      </Text>
    </div>
  );
}

/** Profile type used by InstancePanel.
 *  NOTE: This is a UI-level type describing per-instance tracking profiles.
 *
 *  key:
 *  - stable identifier used for list selection + counts lookup
 *  - typically `${class_name.toLowerCase()}:${track_id}` or similar upstream
 */
type Profile = {
  key: string;
  class_id: number;
  class_name: string;
  track_id: string;
};

/** ------------------------------------------------------------------
 *  InstancePanel — tracking-mode instance manager
 *
 *  Purpose:
 *  - Show the list of “instances” for the current sample.
 *    An instance is: (class_name + track_id)
 *
 *  Interactions:
 *  - Left-click: select active instance (new boxes inherit this instance)
 *  - Right-click: request bulk delete of that instance across ALL frames
 *  - “Delete All Instances”: request a full wipe across ALL frames in sample
 *  - “Add Profile” (optional): create a new instance profile (class + track)
 *
 *  Notes:
 *  - This panel only emits intent via callbacks.
 *  - The actual multi-frame deletion + overlay refresh happens in frames.tsx.
 *  ------------------------------------------------------------------ */
export function InstancePanel({
  profiles,
  selectedKey,
  onSelect,
  onCreateProfile,
  onRequestBulkDelete,
  onRequestDeleteAllInstances,
  profileCounts,
  showCreator = true,
}: {
  profiles: Profile[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onCreateProfile: (className: string, trackId: string) => void;
  onRequestBulkDelete: (profile: Profile) => void;
  onRequestDeleteAllInstances: () => void;
  /** Cross-frame annotation counts for each profile.key */
  profileCounts?: Record<string, number>;
  showCreator?: boolean;
}) {
  // Controls the “Add Profile” mini editor visibility.
  const [open, setOpen] = useState(false);

  // Default class selection in the editor uses first category.
  const [className, setClassName] = useState<string>(
    LABEL_MAP.categories[0].name,
  );

  /**
   * UI-only track id generator.
   * Real canonicalization / uniqueness logic is handled elsewhere (lib.ts),
   * but this gives a readable placeholder for manual profile creation.
   */
  const makeAutoTrackId = () =>
    `auto-${Math.random().toString(36).slice(2, 7)}`;

  // Track id shown in the editor (read-only).
  const [trackId, setTrackId] = useState<string>(() => makeAutoTrackId());

  return (
    <div className="w-full lg:w-48 shrink-0 lg:pl-2 mx-auto">
      {/* Header label for the panel */}
      <div className="text-gray-200 text-sm font-medium mb-2">
        {showCreator ? "Class + Track" : "Instances"}
      </div>

      {/* Toggle for the "Add Profile" editor */}
      {showCreator && (
        <div className="mb-3">
          <button
            onClick={() => {
              // When opening the editor, regenerate a fresh auto track id.
              setOpen((prev) => {
                const next = !prev;
                if (next) setTrackId(makeAutoTrackId());
                return next;
              });
            }}
            className="w-full rounded-lg border shadow-sm px-2.5 py-1.5 text-left bg-black text-white border-gray-600 hover:bg-gray-800 flex items-center justify-between"
            title="Create a new class/track profile"
          >
            <span className="font-medium text-sm">Add Profile</span>
            <span className="text-lg leading-none">+</span>
          </button>
        </div>
      )}

      {/* Delete all instances button (multi-frame wipe) */}
      <button
        onClick={onRequestDeleteAllInstances}
        disabled={profiles.length === 0}
        className={`mb-2 w-full rounded-lg px-2.5 py-1.5 text-left border shadow-sm ${
          profiles.length
            ? "bg-black text-red-400 border-red-400 hover:text-red-300 hover:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-400/40"
            : "bg-black/40 text-white/40 border-gray-700 cursor-not-allowed"
        }`}
        title="Delete ALL instances & their annotations across ALL frames"
      >
        <span className="text-sm">Delete All Instances</span>
      </button>

      {/* Add Profile editor (class label + auto-generated track ID)
          This is optional: in the main flow, instances can also be auto-created by drawing. */}
      {showCreator && open && (
        <div className="mt-2 rounded-lg border shadow-sm bg-black text-white border-gray-700 p-2 space-y-2">
          <div>
            <label className="text-xs text-gray-300">Class Label</label>
            <select
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm focus:outline-none bg-gray-900 text-white border-gray-700"
            >
              {LABEL_MAP.categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-300">Track ID</label>
            <input
              type="text"
              value={trackId}
              readOnly
              className="mt-1 w-full border rounded px-2 py-1 text-sm bg-gray-900 text-white border-gray-700 cursor-not-allowed select-all"
              title="Auto-generated; not editable"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                // Minimal validation before dispatching creation to parent.
                const name = (className || "").trim();
                const trk = (trackId || "").trim();
                if (!name || !trk) return;
                onCreateProfile(name, trk);
                setOpen(false);
              }}
              className="flex-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1.5 text-xs"
            >
              Create
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-700 text-white bg-black hover:bg-gray-800 px-2.5 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Profiles list
          - left click selects instance for subsequent draws
          - right click requests bulk delete (frames.tsx handles confirm + deletion) */}
      <div className="rounded-lg border bg-black/60 border-gray-700 shadow-sm max-h-[45vh] overflow-y-auto mt-2">
        {profiles.length === 0 && (
          <div className="p-3 text-sm text-gray-200">
            {showCreator
              ? "No profiles yet. Click “Add Profile”."
              : "No instances yet. Pick a class above, then draw to create one."}
          </div>
        )}

        {profiles.map((p) => {
          // Cross-frame total count for this instance, if provided by parent.
          const count = profileCounts?.[p.key] ?? 0;

          return (
            <button
              key={p.key}
              onClick={() => onSelect(p.key)}
              onContextMenu={(e) => {
                // Right-click is used to request deletion across all frames.
                e.preventDefault();
                onRequestBulkDelete(p);
              }}
              className={`w-full text-left px-2 py-1.5 border-b last:border-b-0 transition leading-snug ${
                selectedKey === p.key
                  ? "bg-gray-900 border-gray-600 ring-1 ring-orange-400/60"
                  : "bg-black hover:bg-gray-900 border-gray-800"
              } text-white`}
              title={`Select: ${p.class_name} (${p.track_id}). Right-click to bulk delete this instance.`}
            >
              <div className="flex items-center justify-between">
                <div>
                  {/* Track id is the instance identifier shown prominently */}
                  <div className="text-xs font-semibold text-white">
                    #{p.track_id}
                  </div>
                  {/* Secondary line shows class label + numeric id used for exports/backends */}
                  <div className="text-[11px] text-gray-300 mt-0">
                    Class: {p.class_name} (id {p.class_id})
                  </div>
                </div>

                {/* Badge shows total annotations for this instance across all frames */}
                <span
                  className="ml-2 shrink-0 inline-block text-[10px] px-1.5 py-0.5 rounded-full border border-gray-700 bg-gray-900 text-gray-200"
                  title="Total annotations for this instance across all frames"
                >
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------
 *  ConfirmModal — generic confirm dialog used by destructive flows
 *
 *  Used for:
 *  - bulk delete instance annotations
 *  - delete-all instances/annotations
 *  - delete empty instance profile prompt
 *
 *  This is intentionally basic (no portals, no focus trapping) to keep
 *  the UFO tool self-contained and predictable.
 *  ------------------------------------------------------------------ */
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
  // Render nothing when closed (parent controls open state).
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>

        <div className="px-4 py-3 space-y-2">
          <p className="text-sm text-gray-800">{message}</p>
          {/* Optional “details” block (counts, affected frames, etc.) */}
          {details && <div className="text-xs text-gray-600">{details}</div>}
        </div>

        <div className="px-4 py-3 border-t flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border text-sm"
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

/** ------------------------------------------------------------------
 *  ClassInfoPopup — annotation popup showing class/track/size + delete
 *
 *  Annotorious calls this with the active annotation under the cursor.
 *  We:
 *  - resolve label metadata (prefer the hydrated list over the live annotation)
 *  - show track id (when tracking mode enabled)
 *  - show rectangle size in pixels (useful for QC)
 *  - provide a delete button (calls annotorious removeAnnotation)
 *  ------------------------------------------------------------------ */
export function ClassInfoPopup(props: {
  annotation: ImageAnnotation;
  list: ImageAnnotation[];
  onDeleted?: (label: { class_name?: string; track_id?: string }) => void;
  includeTrackIds: boolean;
}) {
  const { annotation, list, onDeleted, includeTrackIds } = props;

  // Annotorious API hook, used for removing annotations from the overlay.
  const anno = useAnnotator();

  // Extract label info directly from the passed annotation (may be stale after edits).
  const ownLabel = extractClassLabel(annotation);

  /**
   * Prefer label info from `list` (the “source of truth” maintained by FrameView),
   * because it usually reflects the normalized + persisted state.
   */
  const fromList = useMemo(() => {
    const found = (list || []).find((a) => a.id === annotation.id);
    return found ? extractClassLabel(found) : null;
  }, [list, annotation.id]);

  /**
   * Pick an “effective label”:
   * - if list-derived label has meaningful bits, use it
   * - else fall back to the live annotation label
   * - else a safe placeholder so UI never crashes
   */
  const effectiveLabel = (fromList &&
    (fromList.class_id || fromList.class_name || fromList.track_id
      ? fromList
      : null)) ||
    (ownLabel &&
      (ownLabel.class_id || ownLabel.class_name || ownLabel.track_id
        ? ownLabel
        : null)) || {
      class_id: undefined,
      class_name: "undefined" as const,
    };

  // Track id display (prefer list track_id if present).
  const track_id =
    (fromList &&
    typeof fromList.track_id === "string" &&
    fromList.track_id.length > 0
      ? fromList.track_id
      : ownLabel?.track_id) || "—";

  // Rectangle dimensions in pixels (null if non-rect or parse fails).
  const dims = rectToDims(annotation);

  /**
   * Delete action:
   * - removes the annotation from the annotorious overlay
   * - notifies parent so it can:
   *   - save current frame
   *   - update empty-instance logic
   *   - show toast, etc.
   */
  const handleDelete = async () => {
    await anno?.removeAnnotation?.(annotation.id);
    onDeleted?.(effectiveLabel || {});
  };

  return (
    <div className="rounded-lg shadow-md bg-white/95 backdrop-blur px-3 py-2 text-sm leading-tight border border-gray-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          {/* In tracking mode, show track + class summary line */}
          {includeTrackIds ? (
            <div className="text-xs text-gray-500 mb-0.5">
              track: <span className="font-medium">{track_id}</span> (class “
              {effectiveLabel.class_name ?? "undefined"}”)
            </div>
          ) : null}

          {/* Primary label line */}
          <div className="font-medium !text-black">
            <span className="!text-black">label:</span>{" "}
            <span className="font-semibold !text-black">
              {effectiveLabel.class_name ?? "undefined"}
            </span>
          </div>

          {/* Helpful QC: box size */}
          {dims && (
            <div className="text-xs text-gray-600">
              size: {dims.w}×{dims.h}px
            </div>
          )}
        </div>

        {/* Destructive action is local; higher-level side effects are handled in parent */}
        <button
          onClick={handleDelete}
          className="shrink-0 px-2 py-1 text-xs rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-700"
          title="Delete this annotation"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------
 *  Toast — centered bottom-of-screen toast for short status messages
 *
 *  Used for:
 *  - “new instance created”
 *  - “annotation deleted”
 *  - “all instances cleared”
 *
 *  Keep it intentionally minimal (no queueing) since frames.tsx already
 *  serializes actions and reuses a single toast slot.
 *  ------------------------------------------------------------------ */
export function Toast({
  open,
  message,
  kind = "info",
}: {
  open: boolean;
  message: string;
  kind?: "info" | "error";
}) {
  // Render nothing when closed.
  if (!open) return null;

  // Base positioning + shared styling.
  const base =
    "fixed z-[1100] left-1/2 -translate-x-1/2 bottom-4 px-3 py-2 rounded-md shadow-lg border text-sm";

  // Palette is intentionally simple: info vs error.
  const palette =
    kind === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-gray-50 border-gray-200 text-gray-800";

  return <div className={`${base} ${palette}`}>{message}</div>;
}
