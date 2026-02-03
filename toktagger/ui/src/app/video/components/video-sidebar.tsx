"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Provider,
  Flex,
  DialogContainer,
  AlertDialog,
  View,
  Header,
  Accordion,
  Disclosure,
  DisclosureTitle,
  DisclosurePanel,
} from "@adobe/react-spectrum";
import type { Project, Sample } from "@/types";

import { useVideoSession } from "@/app/video/components/video-session";
import { canonicalizeTrackId } from "@/app/video/components/video-utils";
import { V2_LABELS } from "./types";
import {
  ClassPanel as VideoClassPanel,
  InstancePanel as VideoInstancePanel,
  ConfirmModal,
} from "@/app/video/components/ui_elements";

import { ExportTool } from "@/app/components/tools/export";
import { ImportButton } from "@/app/components/tools/import";
import { VideoNavigationBar } from "@/app/video/components/video-navigation-bar";

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
    <Provider height="100vh">
      <div className="h-screen text-center w-72 shrink-0 overflow-y-auto">
        <View overflow="auto" height="100vh">
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-100"
            width="100%"
          >
            <Flex
              direction="column"
              alignItems="center"
              justifyContent="center"
              gap="size-100"
            >
              <Header height="size-300" marginBottom="size-100">
                <span style={{ fontSize: "1.2rem" }}>Controls</span>
              </Header>

              <VideoNavigationBar
                project_id={project_id}
                sample_id={sample_id}
                onSaved={_props.onSaved}
              />

              <Accordion allowsMultipleExpanded={true} width="100%">
                <Disclosure>
                  <DisclosureTitle>
                    <span style={{ fontSize: "0.8rem" }}>
                      Export Annotations
                    </span>
                  </DisclosureTitle>
                  <DisclosurePanel>
                    <ExportTool project={_props.project} sample={_props.sample} />
                  </DisclosurePanel>
                </Disclosure>

                <Disclosure>
                  <DisclosureTitle>
                    <span style={{ fontSize: "0.8rem" }}>
                      Import Annotations
                    </span>
                  </DisclosureTitle>
                  <DisclosurePanel>
                    <ImportButton
                      project={_props.project}
                      sample={_props.sample}
                      refreshAnnotations={async () => {
                        await _props.onSaved?.();
                      }}
                    />
                  </DisclosurePanel>
                </Disclosure>
              </Accordion>
            </Flex>

            <Flex justifyContent="center" alignItems="center">
              <Header height="size-300" marginBottom="size-100">
                <span style={{ fontSize: "1.2rem" }}>Toolbox</span>
              </Header>
            </Flex>

            <Accordion allowsMultipleExpanded={true} width="100%">

              <Disclosure defaultExpanded>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Frame Tools</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <div className="pl-4 pr-4 pb-4">
                    <div className="max-w-[16rem] mx-auto mb-4">
                      <div className="mb-2">
                        <Flex gap="size-100" alignItems="center" wrap>
                          <button
                            className="spectrum-Button spectrum-Button--secondary spectrum-Button--outline spectrum-Button--sizeM"
                            disabled
                          >
                            <span className="spectrum-Button-label">
                              Rectangle
                            </span>
                          </button>
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
                          <button
                            className="spectrum-Button spectrum-Button--primary spectrum-Button--outline spectrum-Button--sizeM"
                            onClick={() => session.clearCurrentFrame()}
                          >
                            <span className="spectrum-Button-label">
                              Clear Current Frame
                            </span>
                          </button>
                        </Flex>
                      </div>

                      <hr className="m-4 h-px opacity-30 border-gray-200" />
                    </div>
                  </div>
                </DisclosurePanel>
              </Disclosure>

              <Disclosure defaultExpanded>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Class</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <div className="pl-4 pr-4 pb-4">
                    <VideoClassPanel
                      items={classItems}
                      selectedClassName={session.selection.className}
                      setSelectedClassName={onSelectClassName}
                    />
                  </div>
                </DisclosurePanel>
              </Disclosure>

              <Disclosure defaultExpanded>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Instances</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <div className="pl-4 pr-4 pb-4">
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
                </DisclosurePanel>
              </Disclosure>
            </Accordion>
          </Flex>

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
        </View>
      </div>
    </Provider>
  );
}
