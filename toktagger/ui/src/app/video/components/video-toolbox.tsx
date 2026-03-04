"use client";

import { useEffect, useMemo, useState } from "react";
import { DialogContainer, AlertDialog } from "@adobe/react-spectrum";

import { useVideoSession } from "@/app/video/components/video-session";
import { canonicalizeTrackId } from "@/app/video/components/video-utils";
import { useSample } from "@/app/contexts/SampleContext";
import {
  ClassPanel as VideoClassPanel,
  InstancePanel as VideoInstancePanel,
  ConfirmModal,
} from "@/app/video/components/ui_elements";

/**
 * Persist the last selected class so the annotator can immediately draw
 * when moving between samples (same project).
 */
const LAST_CLASS_KEY = "ufo::lastClassName";

function loadLastClassName(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(LAST_CLASS_KEY);
    const s = (v ?? "").trim();
    return s ? s : null;
  } catch {
    return null;
  }
}

function saveLastClassName(name: string) {
  try {
    const s = (name ?? "").trim();
    if (!s) return;
    globalThis.localStorage?.setItem(LAST_CLASS_KEY, s);
  } catch {
    // ignore
  }
}

/**
 * Sidebar instance rows are keyed by (class, track_id). We keep a stable string key
 * for selection, sorting, and count lookups.
 */
function instanceKey(args: { class_name: string; track_id: string }) {
  const cls = (args.class_name || "").toLowerCase();
  const tid = canonicalizeTrackId(args.track_id || "");
  return `${cls}:${tid}`;
}

function parseTrackIdNumber(trackId: string): number | null {
  const s = (trackId || "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/(\d+)(?!.*\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function compareProfiles(
  a: { class_name: string; track_id: string },
  b: { class_name: string; track_id: string },
) {
  // Sort by class then by track id (numeric if possible, otherwise lexicographic).
  const ac = (a.class_name || "").toLowerCase();
  const bc = (b.class_name || "").toLowerCase();
  if (ac < bc) return -1;
  if (ac > bc) return 1;

  const an = parseTrackIdNumber(a.track_id);
  const bn = parseTrackIdNumber(b.track_id);

  if (an != null && bn != null) return an - bn;
  if (an != null && bn == null) return -1;
  if (an == null && bn != null) return 1;

  const at = canonicalizeTrackId(a.track_id);
  const bt = canonicalizeTrackId(b.track_id);
  if (at < bt) return -1;
  if (at > bt) return 1;
  return 0;
}

export function VideoToolbox() {
  const session = useVideoSession();
  const { annotationLabels } = useSample();
  const labels = annotationLabels;

  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  const [pendingDeleteInstance, setPendingDeleteInstance] = useState<{
    className: string;
    trackId: string;
  } | null>(null);

  // Restore the last selected class to reduce clicks between samples.
  useEffect(() => {
    const last = loadLastClassName();
    if (last && !session.selection.className) {
      session.setSelection({ className: last, trackId: null, source: null });
    }
  }, []);

  const classItems = useMemo(() => {
    return labels.map((c) => ({ name: c.name }));
  }, [labels]);

  const classIdByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of labels) map.set(c.name, c.id);
    return map;
  }, [labels]);

  const profiles = useMemo(() => {
    const arr = session.instances.map((inst) => ({
      key: instanceKey({ class_name: inst.className, track_id: inst.trackId }),
      class_id: classIdByName.get(inst.className) ?? inst.classId ?? -1,
      class_name: inst.className,
      track_id: canonicalizeTrackId(inst.trackId),
    }));

    arr.sort((a, b) => compareProfiles(a, b));
    return arr;
  }, [session.instances, classIdByName]);

  const profileCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const inst of session.instances) {
      const k = instanceKey({
        class_name: inst.className,
        track_id: inst.trackId,
      });
      out[k] = inst.count;
    }
    return out;
  }, [session.instances]);

  const selectedKey = useMemo(() => {
    if (!session.selection.className || !session.selection.trackId) return null;
    return instanceKey({
      class_name: session.selection.className,
      track_id: session.selection.trackId,
    });
  }, [session.selection.className, session.selection.trackId]);

  const onSelectClassName = (name: string | null) => {
    const cls = (name ?? "").trim();
    if (!cls) return;

    session.setSelection({ className: cls, trackId: null, source: "explicit" });
    saveLastClassName(cls);
  };

  const onSelectInstance = (key: string) => {
    if (!key) {
      session.setSelection({
        className: session.selection.className ?? null,
        trackId: null,
        source: "explicit",
      });
      return;
    }

    const hit = profiles.find((p) => p.key === key);
    if (!hit) return;

    session.setSelection({
      className: hit.class_name,
      trackId: hit.track_id,
      source: "explicit",
    });

    saveLastClassName(hit.class_name);
  };

  const onRequestBulkDelete = (profile: {
    class_name?: string;
    track_id?: string;
  }) => {
    const cls = (profile.class_name || "").trim();
    const tid = canonicalizeTrackId(profile.track_id || "");
    if (!cls || !tid) return;

    setPendingDeleteInstance({ className: cls, trackId: tid });
  };

  const cancelDeleteInstance = () => setPendingDeleteInstance(null);

  const confirmDeleteInstance = () => {
    const pending = pendingDeleteInstance;
    if (!pending) return;

    session.deleteInstanceAcrossFrames(pending.className, pending.trackId);
    setPendingDeleteInstance(null);
  };

  const onRequestDeleteAllInstances = () => setConfirmClearAllOpen(true);

  const confirmClearAll = () => {
    setConfirmClearAllOpen(false);
    session.clearAllFrames();
  };

  const cancelClearAll = () => setConfirmClearAllOpen(false);

  return (
    <>
      <div className="w-full">
        {/* Frame Tools section — commented out until more shapes are added
        <div className="px-4 pb-4">
          <div className="text-gray-200 text-sm font-medium mb-2">
            Frame Tools
          </div>
          <div className="max-w-[16rem] mx-auto mb-2">
            <Flex gap="size-100" alignItems="center" wrap>
              <Button variant="secondary" style="fill" isDisabled>
                Rectangle
              </Button>
            </Flex>
          </div>
        </div>

        <div className="border-t border-gray-800 mx-4" />
        */}

        <div className="px-4 py-4">
          <div className="text-gray-200 text-sm font-medium mb-2">Class</div>
          <VideoClassPanel
            items={classItems}
            selectedClassName={session.selection.className}
            setSelectedClassName={onSelectClassName}
          />
        </div>

        <div className="border-t border-gray-800 mx-4" />

        <div className="px-4 py-4">
          <div className="text-gray-200 text-sm font-medium mb-2">
            Instances
          </div>
          <VideoInstancePanel
            profiles={profiles}
            selectedKey={selectedKey}
            onSelect={onSelectInstance}
            onCreateProfile={() => {
              // Instances are derived from annotations; creation happens via drawing.
            }}
            onRequestBulkDelete={onRequestBulkDelete}
            onRequestDeleteAllInstances={onRequestDeleteAllInstances}
            profileCounts={profileCounts}
            showCreator={false}
            classItems={classItems}
          />
        </div>
      </div>

      <DialogContainer onDismiss={cancelClearAll}>
        {confirmClearAllOpen && (
          <AlertDialog
            title="Clear all frames?"
            variant="destructive"
            primaryActionLabel="Clear all"
            cancelLabel="Cancel"
            onPrimaryAction={confirmClearAll}
            onCancel={cancelClearAll}
          >
            This will remove all annotations across all frames in the current
            session. You can’t undo this.
          </AlertDialog>
        )}
      </DialogContainer>

      <ConfirmModal
        open={Boolean(pendingDeleteInstance)}
        title="Delete instance?"
        message="This deletes all annotations for this instance across all frames. You can’t undo this."
        details={
          pendingDeleteInstance ? (
            <div>
              Target:{" "}
              <b>
                {pendingDeleteInstance.className} /{" "}
                {pendingDeleteInstance.trackId}
              </b>
            </div>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteInstance}
        onCancel={cancelDeleteInstance}
      />
    </>
  );
}
