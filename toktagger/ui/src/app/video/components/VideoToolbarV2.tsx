"use client";

import React, { useMemo, useState } from "react";
import { useVideoSession } from "@/app/video/components/video-session";
import { V2_LABELS, makeTrackKey } from "./types";

/**
 * Compact toolbar for:
 * - selecting the active class + instance (track id)
 * - saving all annotations to the backend
 * - destructive actions (delete instance / clear frame / clear all)
 * - jumping to a specific frame
 *
 * The toolbar is a thin UI wrapper over `useVideoSession()` state and helpers.
 */
export function VideoToolbarV2(props: {
  onSave?: (payload: unknown) => Promise<void> | void;
  onJump?: (n: number) => void;
}) {
  const session = useVideoSession();
  const [jumpValue, setJumpValue] = useState("");

  const labelOptions = useMemo(() => V2_LABELS.map((c) => c.name), []);

  // UI-friendly identifier for the currently selected (class, track) pair.
  const selectedKey =
    session.selection.className && session.selection.trackId
      ? makeTrackKey(session.selection.className, session.selection.trackId)
      : null;

  // When a class is selected, list all existing instances for that class.
  const instancesForClass = useMemo(() => {
    if (!session.selection.className) return [];
    return session.instances.filter((i) => i.className === session.selection.className);
  }, [session.instances, session.selection.className]);

  const doSave = async () => {
    // Emit backend-ready video bounding boxes for all frames.
    const payload = session.collectAllVideoBBoxes();
    await props.onSave?.(payload);
    session.markSaved();
  };

  const onSelectClass = (className: string) => {
    // Selecting a class arms drawing; instance stays in "auto" until chosen.
    session.setSelection({
      className: className || null,
      trackId: null,
      source: "explicit",
    });
  };

  const onSelectInstance = (trackId: string) => {
    const cls = session.selection.className;
    // Empty string is "auto": allocate a new instance per draw.
    session.setSelection({
      className: cls ?? null,
      trackId: trackId || null,
      source: "explicit",
    });
  };

  const onJumpSubmit = () => {
    const raw = jumpValue.trim();
    if (!raw) return;

    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return;

    props.onJump?.(n);
  };

  return (
    <div className="w-full flex flex-col gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Video{" "}
          <span className="ml-2 text-xs opacity-70">
            {session.dirty ? "● unsaved" : "saved"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15"
            onClick={doSave}
            disabled={!session.dirty}
            title="Save annotations to backend"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs opacity-70">Class</div>
          <select
            className="px-2 py-1 rounded-md bg-black/20 border border-white/10"
            value={session.selection.className ?? ""}
            onChange={(e) => onSelectClass(e.target.value)}
          >
            <option value="">Select class…</option>
            {labelOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs opacity-70">Instance (track_id)</div>
          <select
            className="px-2 py-1 rounded-md bg-black/20 border border-white/10"
            value={session.selection.trackId ?? ""}
            disabled={!session.selection.className}
            onChange={(e) => onSelectInstance(e.target.value)}
          >
            <option value="">Auto (new instance per draw)</option>
            {instancesForClass.map((i) => (
              <option key={i.key} value={i.trackId}>
                {i.trackId} ({i.count})
              </option>
            ))}
          </select>
        </div>

        <button
          className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-40"
          onClick={() => session.deleteSelectedInstanceAcrossFrames()}
          disabled={!session.selection.className || !session.selection.trackId}
          title="Delete this instance across all frames"
        >
          Delete instance
        </button>

        <button
          className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15"
          onClick={() => session.clearCurrentFrame()}
          title="Clear current frame"
        >
          Clear frame
        </button>

        <button
          className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15"
          onClick={() => session.clearAllFrames()}
          title="Clear all frames"
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm">
          Frame: <span className="font-semibold">{session.frame}</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="w-28 px-2 py-1 rounded-md bg-black/20 border border-white/10"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            placeholder="Jump to…"
          />
          <button
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15"
            onClick={onJumpSubmit}
            title="Jump to the entered frame number"
          >
            Jump
          </button>
        </div>

        <div className="text-xs opacity-70">Selected: {selectedKey ?? "—"}</div>
      </div>
    </div>
  );
}
