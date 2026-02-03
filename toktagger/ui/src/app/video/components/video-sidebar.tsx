"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Provider,
  defaultTheme,
  ButtonGroup,
  ToastQueue,
  Button,
  Flex,
  SearchField,
  DialogContainer,
  AlertDialog,
} from "@adobe/react-spectrum";
import { useNavigate } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";
import type { Annotation, Project, Sample } from "@/types";

import { useVideoSession } from "@/app/video/components/video-session";
import { canonicalizeTrackId } from "@/app/video/components/video-utils";
import { V2_LABELS } from "./types";
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
 * Backend helpers for saving annotations and navigating between samples.
 * These mirror existing endpoints used elsewhere in the app.
 */
async function saveVideoAnnotations(
  project_id: string,
  sample_id: string,
  payload: Annotation[],
) {
  const url = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  return await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function getNextSample(project_id: string) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/next`;
  const sampleResult = await fetch(NEXT_URL);
  return await sampleResult.json();
}

async function getShotSample(project_id: string, shot_id: string) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples?shot_id=${shot_id}`;
  const sampleResult = await fetch(NEXT_URL);
  const sampleArray = await sampleResult.json();
  return Array.isArray(sampleArray) && sampleArray.length > 0
    ? sampleArray[0]
    : null;
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

/**
 * Jump-to-shot control. Before navigating, it calls `onBeforeNavigate` so we can
 * save any unsaved session annotations.
 */
function VideoShotSearchV2(props: {
  project_id: string;
  sample_id: string;
  onBeforeNavigate: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [shotQuery, setShotQuery] = useState<string>("");

  const onSubmit = async (raw: string) => {
    const value = raw.trim();

    if (value === "") {
      setErrorMessage("");
      setShotQuery("");
      return;
    }

    if (!/^[0-9]+$/.test(value)) {
      setErrorMessage("Please enter a number.");
      return;
    }

    try {
      const nextSample = await getShotSample(props.project_id, value);
      if (!nextSample) {
        setErrorMessage("Shot not found!");
        return;
      }

      await props.onBeforeNavigate();

      const NEXT_SAMPLE_URL = `/ui/projects/${props.project_id}/samples/${nextSample._id}`;
      navigate(NEXT_SAMPLE_URL);

      setShotQuery("");
      setErrorMessage("");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to fetch shot.");
    }
  };

  return (
    <SearchField
      label="Jump to Shot"
      value={shotQuery}
      onChange={(v) => {
        setShotQuery(v);
        if (errorMessage) setErrorMessage("");
      }}
      onSubmit={onSubmit}
      validationState={errorMessage ? "invalid" : undefined}
      errorMessage={errorMessage}
    />
  );
}

/**
 * Left sidebar controls for the frame annotator:
 * - Save / Next sample navigation
 * - Jump-to-shot navigation
 * - Class selection (enables drawing)
 * - Instance selection (filters / targets an existing track)
 * - Destructive actions with confirmation
 */
export function VideoSidebar(_props: {
  project: Project;
  sample: Sample;
  onSaved?: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const session = useVideoSession();

  const project_id = session.projectId;
  const sample_id = session.sampleId;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasClass = Boolean(session.selection.className);

  const classItems = useMemo(() => {
    // ClassPanel only needs { name }.
    return V2_LABELS.map((c) => ({ name: c.name }));
  }, []);

  const classIdByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of V2_LABELS) map.set(c.name, c.id);
    return map;
  }, []);

  // Shape the derived session instances into the UI panel format.
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

  const saveNow = async () => {
    try {
      const payload = session.collectAllVideoBBoxes() as Annotation[];
      const res = await saveVideoAnnotations(project_id, sample_id, payload);
      if (!res.ok)
        throw new Error(`Failed to save annotations: ${res.statusText}`);

      session.markSaved();
      ToastQueue.positive(`Saved ${payload.length} annotations!`, {
        timeout: 5000,
      });

      // refresh SampleContext annotations after save
      await _props.onSaved?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save annotations.";
      ToastQueue.negative(msg, { timeout: 5000 });
    }
  };

  // Save only when needed (used before navigation).
  const saveIfDirty = async () => {
    if (!session.dirty) return;
    await saveNow();
  };

  const handleNextSample = async () => {
    if (!project_id || !sample_id) {
      ToastQueue.negative(
        "Cannot load next sample: missing project or sample id.",
        { timeout: 5000 },
      );
      return;
    }

    try {
      await saveIfDirty();
      const next = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${next._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error(err);
      ToastQueue.negative("Failed to load next sample.", { timeout: 5000 });
    }
  };

  const onSelectClassName = (name: string | null) => {
    const cls = (name ?? "").trim();
    if (!cls) return;

    session.setSelection({ className: cls, trackId: null, source: "explicit" });
    saveLastClassName(cls);
  };

  const onSelectInstance = (key: string) => {
    if (!key) {
      // Auto mode: keep the selected class, allocate a new instance per draw.
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

  // Right-click on an instance row triggers a confirm flow (no immediate deletion).
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

  const onRequestDeleteAllInstances = () => {
    setConfirmClearAllOpen(true);
  };

  const confirmClearAll = () => {
    setConfirmClearAllOpen(false);
    session.clearAllFrames();
  };

  const cancelClearAll = () => setConfirmClearAllOpen(false);

  return (
    <Provider theme={defaultTheme} height="100vh">
      <div className="h-screen text-center w-72 shrink-0 overflow-y-auto">
        <div className="pl-4 pr-4 pt-4">
          <ButtonGroup>
            <Button
              variant="primary"
              onPress={saveNow}
              isDisabled={!session.dirty}
            >
              Save
            </Button>
            <Button variant="primary" onPress={handleNextSample}>
              Next
            </Button>
          </ButtonGroup>

          <div className="mt-2 text-xs opacity-70">
            {session.dirty ? "● unsaved" : "saved"} — frame {session.frame}
          </div>

          {!hasClass && (
            <div className="mt-2 text-[12px] opacity-80 leading-snug">
              Select a <b>class</b> to start drawing.
            </div>
          )}
        </div>

        <div className="pl-4 pr-4 pb-4 pt-2">
          <VideoShotSearchV2
            project_id={project_id}
            sample_id={sample_id}
            onBeforeNavigate={saveIfDirty}
          />
        </div>

        <div className="pl-4 pr-4 pb-4">
          <div className="max-w-[16rem] mx-auto mb-4">
            <div className="mb-2">
              <Flex gap="size-100" alignItems="center" wrap>
                <Button
                  variant="secondary"
                  style="outline"
                  isDisabled
                  UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                >
                  Rectangle
                </Button>
              </Flex>
            </div>

            <hr className="m-4 h-px opacity-30 border-gray-200" />

            <div className="mb-1">
              <Flex
                gap="size-100"
                alignItems="center"
                justifyContent="center"
                wrap
              >
                <Button
                  variant="primary"
                  style="outline"
                  UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                  onPress={() => session.clearCurrentFrame()}
                >
                  Clear Current Frame
                </Button>
              </Flex>
            </div>

            <hr className="m-4 h-px opacity-30 border-gray-200" />
          </div>

          <VideoClassPanel
            items={classItems}
            selectedClassName={session.selection.className}
            setSelectedClassName={onSelectClassName}
          />

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

        {/* Confirm: clear the entire session overlay */}
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

        {/* Confirm: delete one instance across all frames */}
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
      </div>
    </Provider>
  );
}
