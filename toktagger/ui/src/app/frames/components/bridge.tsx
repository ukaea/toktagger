"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  useAnnotator,
  type ImageAnnotation,
  ImageAnnotationPopup,
} from "@annotorious/react";
import {
  normalizeWithMode,
  extractClassLabel,
  canonicalizeTrackId,
  writeClassAndTrack,
  loadClassRegistry,
  saveClassRegistry,
  extractClassLabelFromAnnotation,
  FIXED_CLASS_REG,
} from "./lib";
import type { ClassRegistry } from "./lib";

/**
 * Imperative bridge between Annotorious and the rest of the UFO frame view.
 *
 * Responsibilities:
 * - Keep annotations rectangle-only and normalized (class/track stamping).
 * - Track dirty state for background auto-save.
 * - Expose a small API for reading, hydrating, and clearing the overlay.
 * - Optionally auto-create instance profiles when duplicate (class,track) is drawn.
 */
export type BridgeHandle = {
  /** Read current overlay, stamp to currentKey, normalize, and return the list (no storage writes). */
  persistWorkingNow: (currentKey: string) => Promise<ImageAnnotation[]>;
  /** Silently clear overlay (no events fired to callers). */
  clearOverlaySilently: () => Promise<void>;
  /** Silently hydrate overlay with a given list, retargeting all annotations to currentKey. */
  hydrateOverlay: (
    list: ImageAnnotation[],
    currentKey: string,
  ) => Promise<boolean>;
  /** Has the annotator been mounted and is ready to accept calls? */
  isAnnotatorReady: () => boolean;
  /** Have there been user edits in this session that haven't been background-saved yet? */
  hasUnsaved: () => boolean;
  /** Mark current overlay as saved (called after a successful PUT to the backend). */
  markSaved: () => void;
};

type SelectedProfile = {
  class_id?: number;
  class_name?: string;
  track_id?: string;
} | null;

type AnnotatorApi = {
  getAnnotations?: () => unknown;
  setAnnotations?: (anns: ImageAnnotation[], replace?: boolean) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
};

function asAnnotatorApi(a: unknown): AnnotatorApi | null {
  if (!a || (typeof a !== "object" && typeof a !== "function")) return null;
  return a as AnnotatorApi;
}

function isImageAnnotation(v: unknown): v is ImageAnnotation {
  return (
    !!v &&
    typeof v === "object" &&
    "id" in v &&
    typeof (v as { id: unknown }).id === "string"
  );
}

function toAnnoList(got: unknown): ImageAnnotation[] {
  if (Array.isArray(got)) return got.filter(isImageAnnotation);
  if (got && typeof got === "object" && "list" in got) {
    const list = (got as { list?: unknown }).list;
    if (Array.isArray(list)) return list.filter(isImageAnnotation);
  }
  return [];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// --- Rectangle-only guard (filters out polygons or unknown shapes) ---
function isRectangleAnno(a: unknown): boolean {
  const sel = (a as { target?: { selector?: unknown } } | null)?.target
    ?.selector;
  if (!sel || typeof sel !== "object") return false;

  const s = sel as { type?: unknown; value?: unknown };
  if (s.type === "RECTANGLE") return true;
  if (typeof s.value === "string")
    return /xywh=(pixel|percent):/i.test(s.value);
  return false;
}

export const AnnoBridge = Object.assign(
  forwardRef<
    BridgeHandle,
    {
      getSelectedProfile: () => SelectedProfile;
      getSelectedClassName: () => string | null;
      includeTrackIds: boolean;
      classRegistry: ClassRegistry;
      onAutoQuickAdd?: (hint: { class_name: string }) => Promise<{
        class_id: number;
        class_name: string;
        track_id: string;
      } | null>;
      popup?: React.ComponentType<Record<string, unknown>>;
    }
  >(function Bridge(props, ref) {
    const {
      getSelectedProfile,
      getSelectedClassName,
      includeTrackIds,
      classRegistry,
      onAutoQuickAdd,
    } = props;

    const anno = useAnnotator();

    // Prevent event-driven writes while we are applying programmatic overlay changes.
    const suppressPersistRef = useRef(false);
    // Last normalized list, indexed by id, used to keep class/track info stable across edits.
    const lastByIdRef = useRef<Record<string, ImageAnnotation>>({});
    // Store latest currentKey (frame key) so reads/writes can stamp annotations correctly.
    const currentKeyRef = useRef<string>("");

    // Tracks whether the user has made edits that haven't been persisted yet.
    const dirtyRef = useRef(false);

    // Buffered overlay apply (one setAnnotations per animation frame).
    const pendingRef = useRef<ImageAnnotation[] | null>(null);
    const flushingRef = useRef(false);
    const lastAppliedRef = useRef<string>(""); // JSON signature of last applied overlay

    const sig = (anns: ImageAnnotation[]) =>
      JSON.stringify(
        anns.map((a) => ({ id: a.id, t: a.type, tSrc: a.target?.source })),
      );

    // Double-RAF to ensure Annotorious has settled before re-enabling event handling
    const doubleRAF = useCallback(async () => {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
    }, []);

    // Run a function while temporarily suppressing change-driven normalization/persist logic
    const runSilently = useCallback(
      async (fn: () => void | Promise<void>) => {
        suppressPersistRef.current = true;
        try {
          await fn();
        } finally {
          await doubleRAF();
          suppressPersistRef.current = false;
        }
      },
      [doubleRAF],
    );

    // Once-per-frame overlay flush with signature guard to avoid redundant setAnnotations calls
    const flushOverlay = useCallback(async () => {
      if (flushingRef.current) return;
      flushingRef.current = true;

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const batch = pendingRef.current;
      pendingRef.current = null;

      if (batch && anno) {
        const s = sig(batch);
        if (s !== lastAppliedRef.current) {
          const api = asAnnotatorApi(anno);
          await runSilently(() => api?.setAnnotations?.(batch, true));
          lastAppliedRef.current = s;
        }
      }

      flushingRef.current = false;
    }, [anno, runSilently]);

    // Shared writer: normalize, keep lastByIdRef in sync, and return the normalized list (rectangles only)
    const normalizeWrite = useCallback(
      (raw: ImageAnnotation[]) => {
        // Rectangle-only: drop anything not a rectangle
        const rects = (raw || []).filter(isRectangleAnno);
        const ensured = normalizeWithMode(
          rects,
          lastByIdRef.current,
          getSelectedProfile,
          getSelectedClassName,
          includeTrackIds,
          classRegistry,
        );
        const byId: Record<string, ImageAnnotation> = {};
        for (const a of ensured) byId[a.id] = a;
        lastByIdRef.current = byId;
        return ensured;
      },
      [
        getSelectedProfile,
        getSelectedClassName,
        includeTrackIds,
        classRegistry,
      ],
    );

    // Auto-quick-add: ensure a class entry exists in the registry whenever a new annotation is created
    const handleCreate = useCallback(
      async (w3c: ImageAnnotation) => {
        // Mark overlay as dirty so background auto-save can pick up the latest state
        dirtyRef.current = true;

        try {
          // Prefer the currently selected class from the toolbar, fallback to annotation body
          const selectedClass =
            getSelectedClassName?.() ?? extractClassLabelFromAnnotation(w3c);

          if (!selectedClass) {
            return;
          }

          // Load current registry from localStorage
          let registry: ClassRegistry = loadClassRegistry();

          const keyLower = selectedClass.toLowerCase();
          if (!registry[keyLower]) {
            const profileId = getSelectedProfile?.() ?? null;

            const fixedId = FIXED_CLASS_REG[keyLower] ?? 1;
            registry = {
              ...registry,
              [keyLower]: {
                id: String(fixedId),
                name: selectedClass,
                profileId,
              },
            };
            saveClassRegistry(registry);
          }
        } catch (err) {
          console.warn("Auto quick-add class failed:", err);
        }
      },
      [getSelectedClassName, getSelectedProfile],
    );

    useImperativeHandle(
      ref,
      (): BridgeHandle => ({
        isAnnotatorReady: () => !!anno,

        persistWorkingNow: async (currentKey: string) => {
          const api = asAnnotatorApi(anno);
          if (!api) return [];

          currentKeyRef.current = currentKey;
          await doubleRAF();

          const raw = toAnnoList(api.getAnnotations?.());
          const stamped: ImageAnnotation[] = raw.map((a) => ({
            ...deepClone(a),
            target: { ...(a.target ?? {}), source: currentKey },
          }));

          return normalizeWrite(stamped);
        },

        clearOverlaySilently: async () => {
          const api = asAnnotatorApi(anno);
          if (!api) return;

          await runSilently(() => {
            api.setAnnotations?.([], true);
            lastByIdRef.current = {};
            dirtyRef.current = true;
          });
        },

        hydrateOverlay: async (list: ImageAnnotation[], currentKey: string) => {
          const api = asAnnotatorApi(anno);
          if (!api) return false;

          currentKeyRef.current = currentKey;

          const src = Array.isArray(list) ? list.filter(isRectangleAnno) : [];
          const stamped: ImageAnnotation[] = src.map((a) => ({
            ...deepClone(a),
            target: { ...(a.target ?? {}), source: currentKey },
          }));

          const seed: Record<string, ImageAnnotation> = {};
          for (const a of stamped) seed[a.id] = a;
          lastByIdRef.current = seed;

          await runSilently(() => {
            api.setAnnotations?.(stamped, true);
          });

          return true;
        },

        hasUnsaved: () => dirtyRef.current,

        markSaved: () => {
          dirtyRef.current = false;
        },
      }),
      [anno, doubleRAF, normalizeWrite, runSilently],
    );

    // Subscribe to create/update/delete events -> normalize + optional auto-quick-add (rectangles only)
    useEffect(() => {
      if (!anno) return;

      const onAnyChange = async () => {
        if (suppressPersistRef.current) return;

        // Any create/update/delete from the user marks this sample dirty
        dirtyRef.current = true;

        const api = asAnnotatorApi(anno);
        const rawFull = toAnnoList(api?.getAnnotations?.());
        const key = currentKeyRef.current;

        const raw: ImageAnnotation[] = rawFull
          .filter(isRectangleAnno)
          .map((a) => ({
            ...deepClone(a),
            target: { ...(a.target ?? {}), source: key },
          }));

        // Normalize first so fresh shapes inherit current label/instance
        let normalized = normalizeWithMode(
          raw,
          lastByIdRef.current,
          getSelectedProfile,
          getSelectedClassName,
          includeTrackIds,
          classRegistry,
        );

        // Auto quick-add logic; no-op when onAutoQuickAdd is not provided
        if (includeTrackIds && normalized.length > 0 && onAutoQuickAdd) {
          const firstByInstance = new Map<string, string>();
          let duplicateAnno: ImageAnnotation | null = null;

          for (const a of normalized) {
            const lbl = extractClassLabel(a) ?? {};
            const cname = (lbl.class_name ?? "").toLowerCase();
            const tid = lbl.track_id ? canonicalizeTrackId(lbl.track_id) : "";
            if (!cname || !tid) continue;

            const instKey = `${cname}:${tid}`;
            const aid = String(a.id);
            if (firstByInstance.has(instKey)) {
              duplicateAnno = a;
              break;
            } else {
              firstByInstance.set(instKey, aid);
            }
          }

          if (duplicateAnno) {
            const dupLbl = extractClassLabel(duplicateAnno) ?? {};
            const cname = (dupLbl.class_name ?? "").toLowerCase();
            const newProf = await onAutoQuickAdd({ class_name: cname });
            if (newProf) {
              normalized = normalized.map((a) =>
                a.id === duplicateAnno.id
                  ? writeClassAndTrack(
                      a,
                      { id: newProf.class_id, name: newProf.class_name },
                      newProf.track_id,
                    )
                  : a,
              );
            }
          }
        }

        // Keep lastById in sync (even if overlay does not need re-apply)
        const byId: Record<string, ImageAnnotation> = {};
        for (const a of normalized) byId[a.id] = a;
        lastByIdRef.current = byId;

        // Optional: skip buffering if nothing actually changed
        const nextSig = sig(normalized);
        if (nextSig === lastAppliedRef.current) {
          return;
        }

        // Buffer and apply once per animation frame
        pendingRef.current = normalized;
        void flushOverlay();
      };

      const onCreate = async (w3c: ImageAnnotation) => {
        await handleCreate(w3c);
        await onAnyChange();
      };

      const api = asAnnotatorApi(anno);
      api?.on?.("createAnnotation", onCreate);
      api?.on?.("updateAnnotation", onAnyChange);
      api?.on?.("deleteAnnotation", onAnyChange);

      return () => {
        api?.off?.("createAnnotation", onCreate);
        api?.off?.("updateAnnotation", onAnyChange);
        api?.off?.("deleteAnnotation", onAnyChange);
      };
    }, [
      anno,
      includeTrackIds,
      classRegistry,
      getSelectedProfile,
      getSelectedClassName,
      onAutoQuickAdd,
      flushOverlay,
      handleCreate,
    ]);

    return null;
  }),
  { Popup: ImageAnnotationPopup },
);
