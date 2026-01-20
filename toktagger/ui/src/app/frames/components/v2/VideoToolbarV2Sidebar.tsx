"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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

import { LABEL_MAP, loadLastClassName, saveLastClassName } from "@/app/frames/components/lib";
import {
  ClassPanel as VideoClassPanel,
  InstancePanel as VideoInstancePanel,
} from "@/app/frames/components/ui";

import { useVideoSession } from "@/app/frames/components/v2/video-session";
import { canonicalizeTrackId } from "./video-utils";

async function saveVideoAnnotations(project_id: string, sample_id: string, payload: Annotation[]) {
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
  return Array.isArray(sampleArray) && sampleArray.length > 0 ? sampleArray[0] : null;
}

function instanceKey(args: { class_name: string; track_id: string }) {
  const cls = (args.class_name || "").toLowerCase();
  const tid = canonicalizeTrackId(args.track_id || "");
  return `${cls}:${tid}`;
}

/**
 * Try to parse a numeric suffix/pure number from trackId for sorting.
 * Examples:
 *  - "1" -> 1
 *  - "ufo-2" -> 2
 *  - "track_10" -> 10
 *  - "abc" -> null
 */
function parseTrackIdNumber(trackId: string): number | null {
  const s = (trackId || "").trim();
  if (!s) return null;

  // pure integer
  if (/^\d+$/.test(s)) return Number(s);

  // last numeric run
  const m = s.match(/(\d+)(?!.*\d)/);
  if (!m) return null;

  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function compareProfiles(
  a: { class_name: string; track_id: string },
  b: { class_name: string; track_id: string },
) {
  const ac = (a.class_name || "").toLowerCase();
  const bc = (b.class_name || "").toLowerCase();
  if (ac < bc) return -1;
  if (ac > bc) return 1;

  const an = parseTrackIdNumber(a.track_id);
  const bn = parseTrackIdNumber(b.track_id);

  // both numeric => numeric sort
  if (an != null && bn != null) return an - bn;

  // numeric first (optional; feels nicer)
  if (an != null && bn == null) return -1;
  if (an == null && bn != null) return 1;

  // fallback stable lexicographic
  const at = canonicalizeTrackId(a.track_id);
  const bt = canonicalizeTrackId(b.track_id);
  if (at < bt) return -1;
  if (at > bt) return 1;
  return 0;
}

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
 * v2 Sidebar for UFO:
 * - Reads/writes session via useVideoSession()
 * - No window.* globals
 * - No localStorage W3C scans
 * - Save/Next/Jump-to-shot all use session.collectAllVideoBBoxes()
 */
export function VideoToolbarV2Sidebar(props: { project: Project; sample: Sample }) {
  const navigate = useNavigate();
  const session = useVideoSession();

  const project_id = session.projectId;
  const sample_id = session.sampleId;

  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  // Default class selection from last saved preference (optional, but matches old UX)
  useEffect(() => {
    const last = loadLastClassName();
    if (last && !session.selection.className) {
      session.setSelection({ className: last, trackId: null, source: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UX helper: do we have enough selection to draw?
  const canDraw = Boolean(session.selection.className && session.selection.trackId);

  // Optional: "smart" helper for later auto-create flows (currently used only by hint button)
  const ensureInstanceSelected = useCallback(() => {
    const cls = session.selection.className;
    if (!cls) return null;

    if (session.selection.trackId) return session.selection.trackId;

    const { trackId } = session.createNewInstanceForClass(cls);
    session.setSelection({ className: cls, trackId, source: "auto" });
    saveLastClassName(cls);
    return trackId;
  }, [session]);

  const profiles = useMemo(() => {
    // Build + sort (class then numeric track_id)
    const arr = session.instances.map((inst) => ({
      key: instanceKey({ class_name: inst.className, track_id: inst.trackId }),
      class_id: inst.classId,
      class_name: inst.className,
      track_id: canonicalizeTrackId(inst.trackId),
    }));

    arr.sort((a, b) => compareProfiles(a, b));
    return arr;
  }, [session.instances]);

  const profileCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const inst of session.instances) {
      const k = instanceKey({ class_name: inst.className, track_id: inst.trackId });
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
      if (!res.ok) throw new Error(`Failed to save annotations: ${res.statusText}`);

      session.markSaved();
      ToastQueue.positive(`Saved ${payload.length} annotations!`, { timeout: 5000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save annotations.";
      ToastQueue.negative(msg, { timeout: 5000 });
    }
  };

  const maybeSave = async () => {
    if (!session.dirty) return;
    await saveNow();
  };

  const handleNextSample = async () => {
    if (!project_id || !sample_id) {
      ToastQueue.negative("Cannot load next sample: missing project or sample id.", { timeout: 5000 });
      return;
    }

    try {
      await maybeSave();
      const next = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${next._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error(err);
      ToastQueue.negative("Failed to load next sample.", { timeout: 5000 });
    }
  };

  const onSelectClassName = (name: string) => {
    if (!name) return;

    session.setSelection({ className: name, trackId: null, source: "explicit" });
    saveLastClassName(name);
  };

  const onSelectInstance = (key: string) => {
    const hit = profiles.find((p) => p.key === key);
    if (!hit) return;

    session.setSelection({
      className: hit.class_name,
      trackId: hit.track_id,
      source: "explicit",
    });

    saveLastClassName(hit.class_name);
  };

  const onNewInstance = () => {
    const cls = session.selection.className ?? "UFO";
    const { trackId } = session.createNewInstanceForClass(cls);
    session.setSelection({ className: cls, trackId, source: "auto" });
    saveLastClassName(cls);
  };

  const onRequestBulkDelete = async (profile: { class_name?: string; track_id?: string }) => {
    const cls = (profile.class_name || "").trim();
    const tid = canonicalizeTrackId(profile.track_id || "");
    if (!cls || !tid) return;

    // deleteSelectedInstanceAcrossFrames uses session.selection, so set selection first
    session.setSelection({ className: cls, trackId: tid, source: "explicit" });
    session.deleteSelectedInstanceAcrossFrames();
  };

  // Safer: confirm before nuking session.
  const onRequestDeleteAllInstances = () => {
    setConfirmClearAllOpen(true);
  };

  const confirmClearAll = () => {
    setConfirmClearAllOpen(false);
    session.clearAllFrames();
    ToastQueue.positive("Cleared all frames in this session.", { timeout: 3000 });
  };

  const cancelClearAll = () => setConfirmClearAllOpen(false);

  return (
    <Provider theme={defaultTheme} height="100vh">
      <div className="h-screen text-center w-72 shrink-0 overflow-y-auto">
        <div className="pl-4 pr-4 pt-4">
          <ButtonGroup>
            <Button variant="primary" onPress={saveNow} isDisabled={!session.dirty}>
              Save
            </Button>
            <Button variant="primary" onPress={handleNextSample}>
              Next
            </Button>
          </ButtonGroup>

          <div className="mt-2 text-xs opacity-70">
            {session.dirty ? "● unsaved" : "saved"} — frame {session.frame}
          </div>

          {/* Inline guidance: reduce “why can’t I draw?” confusion */}
          {!canDraw && (
            <div className="mt-2 text-[12px] opacity-80 leading-snug">
              <div className="opacity-90">
                To draw: select a <b>class</b> and an <b>instance</b>.
              </div>
              {session.selection.className && !session.selection.trackId && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="opacity-80">No instance selected.</span>
                  <Button
                    variant="secondary"
                    style="outline"
                    UNSAFE_className="!px-2 !py-1 text-[11px]"
                    onPress={onNewInstance}
                  >
                    New instance
                  </Button>
                  {/* Optional: even smoother action */}
                  <Button
                    variant="secondary"
                    style="outline"
                    UNSAFE_className="!px-2 !py-1 text-[11px]"
                    onPress={() => ensureInstanceSelected()}
                  >
                    Auto-pick
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pl-4 pr-4 pb-4 pt-2">
          <VideoShotSearchV2
            project_id={project_id}
            sample_id={sample_id}
            onBeforeNavigate={maybeSave}
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
              <Flex gap="size-100" alignItems="center" justifyContent="center" wrap>
                <Button
                  variant="primary"
                  style="outline"
                  UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                  onPress={() => session.clearCurrentFrame()}
                >
                  Clear Current Frame
                </Button>

                <Button
                  variant="primary"
                  style="outline"
                  UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                  onPress={onNewInstance}
                  isDisabled={!session.selection.className}
                >
                  New Instance
                </Button>
              </Flex>
            </div>

            <hr className="m-4 h-px opacity-30 border-gray-200" />
          </div>

          <VideoClassPanel
            items={LABEL_MAP.categories}
            selectedClassName={session.selection.className}
            setSelectedClassName={onSelectClassName}
          />

          <VideoInstancePanel
            profiles={profiles}
            selectedKey={selectedKey}
            onSelect={onSelectInstance}
            onCreateProfile={() => {
              // We intentionally don't use the embedded creator in v2 right now
              // (instances are derived from session.byFrame). Use "New Instance" instead.
            }}
            onRequestBulkDelete={onRequestBulkDelete}
            onRequestDeleteAllInstances={onRequestDeleteAllInstances}
            profileCounts={profileCounts}
            showCreator={false}
          />
        </div>

        {/* Confirm dialog: Clear All */}
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
              This will remove all annotations across all frames in the current session.
              You can’t undo this.
            </AlertDialog>
          )}
        </DialogContainer>
      </div>
    </Provider>
  );
}
