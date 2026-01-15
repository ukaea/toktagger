"use client";

import React, {
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
 * Why this exists:
 * - Annotorious is event-driven and stores overlay state internally.
 * - Our app wants a predictable flow: normalize labels, stamp frame keys,
 *   track "dirty" edits, and expose imperative operations to the parent view.
 *
 * Responsibilities:
 * - Enforce rectangle-only annotations (filters out polygons/unknown shapes).
 * - Normalize on every change (ensure class/track stamping stays stable).
 * - Keep a "last known by id" cache so editing doesn't drop class/track bodies.
 * - Provide an imperative API:
 *   - persistWorkingNow (read + normalize)
 *   - hydrateOverlay (programmatic set)
 *   - clearOverlaySilently (programmatic clear)
 * - Optionally auto-create / auto-select new instance profiles (quick-add flows).
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

type BridgeProps = {
  /**
   * Selection getters come from the FrameView which reads window.* (toolbar state).
   * This keeps the bridge decoupled from how selection is stored.
   */
  getSelectedProfile: () => SelectedProfile;
  getSelectedClassName: () => string | null;

  /**
   * includeTrackIds toggles "tracking mode":
   * - true: write { class_id, class_name, track_id } into annotation bodies
   * - false: only write { class_id, class_name } (detection mode)
   */
  includeTrackIds: boolean;

  /**
   * classRegistry provides optional class_id lookup (name->id).
   * It's passed into normalizeWithMode for stamping new annotations.
   */
  classRegistry: ClassRegistry;

  /**
   * Optional hook used by FrameView to create/select a new instance profile.
   * This bridge uses it in two places:
   * - if user draws the first box with only a class selected (no instance yet)
   * - if user duplicates an existing (class,track) in the same frame (collision)
   */
  onAutoQuickAdd?: (hint: { class_name: string }) => Promise<{
    class_id: number;
    class_name: string;
    track_id: string;
  } | null>;

  popup?: React.ComponentType<Record<string, unknown>>;
  ref?: React.Ref<BridgeHandle>; // React 19: ref is a normal prop
};

type SelectedProfile = {
  class_id?: number;
  class_name?: string;
  track_id?: string;
} | null;

/**
 * AnnotatorApi
 * Runtime shape we rely on from useAnnotator().
 * Annotorious types aren't always complete, so we treat it as "duck typed".
 */
type AnnotatorApi = {
  getAnnotations?: () => unknown;
  setAnnotations?: (anns: ImageAnnotation[], replace?: boolean) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
};

function isFunction(v: unknown): v is (...args: unknown[]) => unknown {
  return typeof v === "function";
}

/**
 * Guard for the minimal Annotorious API surface we need.
 * Some environments return a function-like object; we accept both object/function.
 */
function isAnnotatorApi(a: unknown): a is AnnotatorApi {
  if (!a || (typeof a !== "object" && typeof a !== "function")) return false;

  const rec = a as Record<string, unknown>;

  // If present, these must be functions. If absent, that's fine (optional API surface).
  if (
    "getAnnotations" in rec &&
    rec.getAnnotations != null &&
    !isFunction(rec.getAnnotations)
  ) {
    return false;
  }
  if (
    "setAnnotations" in rec &&
    rec.setAnnotations != null &&
    !isFunction(rec.setAnnotations)
  ) {
    return false;
  }
  if ("on" in rec && rec.on != null && !isFunction(rec.on)) {
    return false;
  }
  if ("off" in rec && rec.off != null && !isFunction(rec.off)) {
    return false;
  }

  return true;
}

/**
 * Runtime ImageAnnotation guard for objects read from Annotorious / localStorage.
 * We only verify the fields that downstream code assumes exist.
 */
function isImageAnnotation(v: unknown): v is ImageAnnotation {
  if (!v || typeof v !== "object") return false;

  // safe to index after the object check
  const rec = v as Record<string, unknown>;

  if (typeof rec.id !== "string") return false;

  // ImageAnnotation requires a target; and our downstream code expects selector shape
  const target = rec.target;
  if (!target || typeof target !== "object") return false;

  const selector = (target as Record<string, unknown>).selector;
  if (!selector || typeof selector !== "object") return false;

  return true;
}

/**
 * Annotorious can return either a raw array, or an object with { list }.
 * Normalize to a strict ImageAnnotation[].
 */
function toAnnoList(got: unknown): ImageAnnotation[] {
  if (Array.isArray(got)) return got.filter(isImageAnnotation);
  if (got && typeof got === "object" && "list" in got) {
    const list = (got as { list?: unknown }).list;
    if (Array.isArray(list)) return list.filter(isImageAnnotation);
  }
  return [];
}

/** JSON-based deep clone is sufficient for annotation payloads. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// --- Rectangle-only guard (filters out polygons or unknown shapes) ---
/**
 * We only support rectangles in the UFO tool right now.
 * Annotorious may still produce other selector types depending on config/plugins;
 * this filter ensures everything downstream is rectangle-like.
 */
function isRectangleAnno(a: ImageAnnotation): boolean {
  const sel = a.target?.selector;
  if (!sel || typeof sel !== "object") return false;

  const s = sel as { type?: unknown; value?: unknown };
  if (s.type === "RECTANGLE") return true;

  return typeof s.value === "string" && /xywh=(pixel|percent):/i.test(s.value);
}

export const AnnoBridge = Object.assign(
  function Bridge(props: BridgeProps) {
    const {
      ref: bridgeRef,
      getSelectedProfile,
      getSelectedClassName,
      includeTrackIds,
      classRegistry,
      onAutoQuickAdd,
    } = props;

    /**
     * Annotorious annotator instance (imperative API).
     * Note: may be null during first render before Annotorious mounts.
     */
    const anno = useAnnotator();

    /**
     * When we programmatically set/hydrate/clear annotations, Annotorious fires
     * create/update/delete events. We suppress those so we don't recurse.
     */
    const suppressPersistRef = useRef(false);

    /**
     * Cache of the last normalized annotations by id.
     * normalizeWithMode uses this to restore class/track bodies after edits
     * (e.g. resize can sometimes drop/customize bodies).
     */
    const lastByIdRef = useRef<Record<string, ImageAnnotation>>({});

    /**
     * Current "frame key" (W3C target.source) to stamp onto every annotation.
     * Parent FrameView updates this via persistWorkingNow/hydrateOverlay calls.
     */
    const currentKeyRef = useRef<string>("");

    /**
     * Dirty flag:
     * - true when user changed overlay and those changes haven't been persisted
     *   by FrameView's background auto-save loop yet.
     * - FrameView reads this via BridgeHandle.hasUnsaved().
     */
    const dirtyRef = useRef(false);

    /**
     * Buffered overlay apply:
     * To avoid repeated setAnnotations calls during bursts of events, we buffer
     * the latest normalized list and apply it once per animation frame.
     */
    const pendingRef = useRef<ImageAnnotation[] | null>(null);
    const flushingRef = useRef(false);
    const lastAppliedRef = useRef<string>(""); // JSON signature of last applied overlay

    /**
     * sig() is a lightweight "overlay signature" used to avoid redundant re-applies.
     * We only include:
     * - annotation id
     * - selector payload (geometry)
     * This keeps comparisons stable and cheap, and ignores body ordering noise.
     */
    const sig = (anns: readonly ImageAnnotation[]) =>
      JSON.stringify(
        anns.map((a) => ({
          id: a.id,
          // selector is present in the ImageAnnotation type
          sel: (a.target?.selector as unknown) ?? null,
        })),
      );

    /**
     * doubleRAF:
     * Annotorious can take a frame or two to settle after setAnnotations.
     * Double requestAnimationFrame is a simple way to ensure DOM + internal state
     * are consistent before we re-enable event handling.
     */
    const doubleRAF = useCallback(async () => {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
    }, []);

    /**
     * runSilently:
     * Execute a programmatic overlay operation while suppressing event-driven
     * normalization/persist logic. Used by hydrateOverlay/clearOverlay/flushOverlay.
     */
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

    /**
     * flushOverlay:
     * Apply pendingRef.current via anno.setAnnotations once per animation frame,
     * and only if the signature differs from what we already applied.
     */
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
          await runSilently(() => anno.setAnnotations(batch, true));
          lastAppliedRef.current = s;
        }
      }

      flushingRef.current = false;
    }, [anno, runSilently]);

    /**
     * normalizeWrite:
     * Single place to enforce our invariants for a list:
     * - rectangle-only filtering
     * - mode-aware normalization (tracking vs detection)
     * - update lastByIdRef cache for future edit restorations
     */
    const normalizeWrite = useCallback(
      (raw: ImageAnnotation[]) => {
        // Rectangle-only: drop anything not a rectangle
        const rects = raw.filter(isRectangleAnno);

        // normalizeWithMode stamps class/track onto new shapes,
        // and restores missing metadata on edited shapes via lastByIdRef.
        const ensured = normalizeWithMode(
          rects,
          lastByIdRef.current,
          getSelectedProfile,
          getSelectedClassName,
          includeTrackIds,
          classRegistry,
        );

        // Refresh our "last known" cache after normalization.
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

    /**
     * handleCreate:
     * Runs on createAnnotation events to ensure the class registry contains the
     * selected class name, so class_id lookups remain consistent across reloads.
     *
     * This is a "best-effort" localStorage update; failures only warn.
     */
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

          // If this class isn't registered yet, add it with a deterministic id.
          if (!registry[keyLower]) {
            const selectedProfile = getSelectedProfile?.() ?? null;
            // Prefer track_id when available (it’s the instance identifier), otherwise fall back to class_id.
            const profileId: string | null =
              selectedProfile?.track_id ??
              (selectedProfile?.class_id != null
                ? String(selectedProfile.class_id)
                : null);

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

    /**
     * Expose an imperative handle to FrameView (parent):
     * - persistWorkingNow: read annotator overlay, stamp currentKey, normalize
     * - clearOverlaySilently: clear without re-triggering change handlers
     * - hydrateOverlay: set overlay from a provided list (retarget to currentKey)
     * - hasUnsaved/markSaved: dirty tracking for background auto-save & toolbar UX
     */
    useImperativeHandle(
      bridgeRef,
      (): BridgeHandle => ({
        isAnnotatorReady: () => !!anno,

        /**
         * Read-only "persist" (no storage writes):
         * Used by FrameView to grab the current overlay and write it to localStorage.
         * Ensures all annotations have target.source=currentKey and are normalized.
         */
        persistWorkingNow: async (currentKey: string) => {
          if (!anno) return [];

          currentKeyRef.current = currentKey;
          await doubleRAF();

          const raw = toAnnoList(anno.getAnnotations());
          const stamped: ImageAnnotation[] = raw.map((a) => ({
            ...deepClone(a),
            target: { ...(a.target ?? {}), source: currentKey },
          }));

          return normalizeWrite(stamped);
        },

        /**
         * Clear overlay without firing our change handlers.
         * Note: we set dirty=true so the parent can persist the "cleared" state.
         */
        clearOverlaySilently: async () => {
          if (!anno) return;

          await runSilently(() => {
            anno.setAnnotations([], true);
            lastByIdRef.current = {};
            dirtyRef.current = true;
          });
        },

        /**
         * Hydrate overlay with a provided list (e.g. from localStorage or backend seeding).
         * We:
         * - filter rectangles
         * - stamp target.source to currentKey
         * - seed lastByIdRef so subsequent edits can restore metadata
         * - setAnnotations silently to avoid event recursion
         */
        hydrateOverlay: async (list: ImageAnnotation[], currentKey: string) => {
          if (!isAnnotatorApi(anno)) return false;
          const api = anno;

          currentKeyRef.current = currentKey;

          const src = list.filter(isRectangleAnno);
          const stamped: ImageAnnotation[] = src.map((a) => ({
            ...deepClone(a),
            target: { ...a.target, source: currentKey },
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

    /**
     * Subscribe to Annotorious events:
     * - createAnnotation
     * - updateAnnotation
     * - deleteAnnotation
     *
     * For every change we:
     * - stamp annotations to currentKeyRef.current
     * - normalize them (class/track stability)
     * - optionally run duplicate-instance detection and auto-quick-add
     * - buffer the normalized list and apply it (once per frame)
     */
    useEffect(() => {
      if (!anno || !isAnnotatorApi(anno)) return;
      const api = anno;

      /**
       * onAnyChange:
       * Runs after any create/update/delete, unless we are in a "silent" operation.
       * The main job is to normalize the overlay and re-apply it if normalization changed it.
       */
      const onAnyChange = async () => {
        if (suppressPersistRef.current) return;

        dirtyRef.current = true;

        const rawFull = toAnnoList(api.getAnnotations?.());
        const key = currentKeyRef.current;

        // Retarget every annotation to the active frame key.
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

        /**
         * Duplicate-instance guard (tracking mode only):
         * If the user draws a second annotation with the same (class_name, track_id)
         * in the same frame, we auto-create a new instance profile and re-stamp
         * the duplicate annotation with the new track_id.
         *
         * Rationale: one instance per frame is a common constraint for this workflow.
         */
        if (includeTrackIds && normalized.length > 0 && onAutoQuickAdd) {
          const firstAnnotationIdByInstanceKey = new Map<string, string>();
          let duplicateAnnotation: ImageAnnotation | null = null;

          for (const annotation of normalized) {
            const label = extractClassLabel(annotation) ?? {};
            const className = (label.class_name ?? "").toLowerCase();
            const trackId = label.track_id
              ? canonicalizeTrackId(label.track_id)
              : "";
            if (!className || !trackId) continue;

            const instanceKey = `${className}:${trackId}`;
            const annotationId = String(annotation.id);

            if (firstAnnotationIdByInstanceKey.has(instanceKey)) {
              duplicateAnnotation = annotation;
              break;
            }

            firstAnnotationIdByInstanceKey.set(instanceKey, annotationId);
          }

          if (duplicateAnnotation) {
            const duplicateLabel = extractClassLabel(duplicateAnnotation) ?? {};
            const className = (duplicateLabel.class_name ?? "").toLowerCase();
            const newProf = await onAutoQuickAdd({ class_name: className });

            if (newProf) {
              normalized = normalized.map((annotation) =>
                annotation.id === duplicateAnnotation.id
                  ? writeClassAndTrack(
                      annotation,
                      { id: newProf.class_id, name: newProf.class_name },
                      newProf.track_id,
                    )
                  : annotation,
              );
            }
          }
        }

        // Keep lastById in sync (even if overlay does not need re-apply)
        const byId: Record<string, ImageAnnotation> = {};
        for (const annotation of normalized) byId[annotation.id] = annotation;
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

      /**
       * onCreate:
       * Special handling for createAnnotation:
       * - If tracking mode and there is no selected instance yet, auto-create one
       *   based on the selected class name (first box bootstraps the instance).
       * - Ensure class registry is updated for the class involved.
       * - Then run the generic normalization path.
       */
      const onCreate = (annoMaybe: unknown) => {
        if (!isImageAnnotation(annoMaybe)) return;
        const w3c = annoMaybe;

        void (async () => {
          // create/select a new instance profile ONLY when the first box is drawn.
          if (includeTrackIds && onAutoQuickAdd) {
            const selectedProfile = getSelectedProfile?.();
            const selectedClass = getSelectedClassName?.();

            if (!selectedProfile && selectedClass) {
              // This will create & select a new instance profile (and notify toolbar).
              await onAutoQuickAdd({ class_name: selectedClass });
            }
          }

          await handleCreate(w3c);
          await onAnyChange();
        })();
      };

      api.on?.("createAnnotation", onCreate);
      api.on?.("updateAnnotation", onAnyChange);
      api.on?.("deleteAnnotation", onAnyChange);

      return () => {
        api.off?.("createAnnotation", onCreate);
        api.off?.("updateAnnotation", onAnyChange);
        api.off?.("deleteAnnotation", onAnyChange);
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

    // This bridge renders no UI; it only wires annotator events + exposes imperative APIs.
    return null;
  },
  // Preserve the popup export pattern used elsewhere (AnnoBridge.Popup)
  { Popup: ImageAnnotationPopup },
);
