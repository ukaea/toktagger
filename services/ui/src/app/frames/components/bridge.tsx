"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import {
  useAnnotator,
  type ImageAnnotation,
  ImageAnnotationPopup
} from "@annotorious/react";
import {
  normalizeWithMode,
  extractClassLabel,
  canonicalizeTrackId,
  writeClassAndTrack,
  loadClassRegistry,
  saveClassRegistry,
  extractClassLabelFromAnnotation
} from "./lib";
import type { ClassRegistry } from "./lib";

export type BridgeHandle = {
  /** Read overlay -> stamp to currentKey -> return list (no storage write). */
  persistWorkingNow: (currentKey: string) => Promise<ImageAnnotation[]>;
  /** Silently clear overlay (no events). */
  clearOverlaySilently: () => Promise<void>;
  /** Silently hydrate overlay with the given list (retarget/stamp to currentKey). */
  hydrateOverlay: (
    list: ImageAnnotation[],
    currentKey: string
  ) => Promise<boolean>;
  /** Is annotator ready yet? */
  isAnnotatorReady: () => boolean;
  /** Have there been user edits in this session that haven't been background-saved yet? */
  hasUnsaved: () => boolean;
  /** Mark current overlay as saved (called after a successful PUT). */
  markSaved: () => void;
};

// --- Rectangle-only guard (filters out polygons or unknown shapes) ---
function isRectangleAnno(a: any): boolean {
  const sel = a?.target?.selector;
  if (!sel) return false;
  if (sel.type === "RECTANGLE") return true;
  if (typeof sel.value === "string") return /xywh=(pixel|percent):/i.test(sel.value);
  return false;
}

export const AnnoBridge = Object.assign(
  forwardRef<
    BridgeHandle,
    {
      getSelectedProfile: () => string | null;
      getSelectedClassName: () => string | null;
      includeTrackIds: boolean;
      classRegistry: ClassRegistry;
      onAutoQuickAdd?: (
        hint: { class_name: string }
      ) => Promise<{ class_id: number; class_name: string; track_id: string } | null>;
      popup?: React.ComponentType<any>;
    }
  >(function Bridge(props, ref) {
    const {
      getSelectedProfile,
      getSelectedClassName,
      includeTrackIds,
      classRegistry,
      onAutoQuickAdd
    } = props;

    const anno = useAnnotator();

    // Prevent event-driven writes during programmatic overlay changes
    const suppressPersistRef = useRef(false);
    // Last normalized list by id -> power normalization for edits
    const lastByIdRef = useRef<Record<string, ImageAnnotation>>({});
    // Store latest currentKey for stamping
    const currentKeyRef = useRef<string>("");

    // Track if the user has made edits this session that haven't been PUT yet
    const dirtyRef = useRef(false);

    // Buffered overlay apply
    const pendingRef = useRef<ImageAnnotation[] | null>(null);
    const flushingRef = useRef(false);
    const lastAppliedRef = useRef<string>(""); // JSON signature of last applied

    const sig = (anns: ImageAnnotation[]) =>
      JSON.stringify(
        anns.map((a) => ({ id: (a as any).id, t: a.type, tSrc: a.target?.source }))
      );

    // Double-RAF to ensure Annotorious has settled before re-enabling events
    const doubleRAF = useCallback(async () => {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      );
    }, []);

    // Run a function with suppression enabled
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
      [doubleRAF]
    );

    // Once-per-frame overlay flush with signature guard
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
          await runSilently(() => (anno as any).setAnnotations?.(batch, true));
          lastAppliedRef.current = s;
        }
      }

      flushingRef.current = false;
    }, [anno, runSilently]);

    // Shared writer: normalize + remember + return (RECTANGLE ONLY)
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
          classRegistry
        );
        const byId: Record<string, ImageAnnotation> = {};
        for (const a of ensured) byId[a.id as string] = a;
        lastByIdRef.current = byId;
        return ensured;
      },
      [getSelectedProfile, getSelectedClassName, includeTrackIds, classRegistry]
    );

    // Auto-quick-add: ensure class exists in registry whenever a new annotation is created
    const handleCreate = useCallback(
      async (w3c: ImageAnnotation) => {
        // Whatever you already do here:
        // - ensureInstancesOnCreate(w3c, ...)
        // - mark dirty
        // - etc.

        dirtyRef.current = true;

        // --- Auto-quick-add: ensure class exists in registry ---
        try {
          // Prefer the currently selected class from the toolbar
          const selectedClass =
            getSelectedClassName?.() ?? extractClassLabelFromAnnotation(w3c);

          if (!selectedClass) {
            return;
          }

          // Load current registry from localStorage
          let registry: ClassRegistry = loadClassRegistry();

          if (!registry[selectedClass]) {
            const profileId = getSelectedProfile?.() ?? null;

            registry = {
              ...registry,
              [selectedClass]: {
                id: selectedClass,
                name: selectedClass,
                profileId
              }
            };

            saveClassRegistry(registry);
          }
        } catch (err) {
          console.warn("Auto quick-add class failed:", err);
        }
      },
      [getSelectedClassName, getSelectedProfile]
    );

    useImperativeHandle(
      ref,
      () =>
        ([ 
          "isAnnotatorReady",
          "persistWorkingNow",
          "clearOverlaySilently",
          "hydrateOverlay",
          "hasUnsaved",
          "markSaved"
        ] as const).reduce(
          (api, _key) => api,
          {
            isAnnotatorReady: () => !!anno,

            persistWorkingNow: async (currentKey: string) => {
              if (!anno) return [];
              currentKeyRef.current = currentKey;
              await doubleRAF();

              let raw: any[] = [];
              try {
                const got: any = (anno as any).getAnnotations?.();
                raw = Array.isArray(got) ? got : Array.isArray(got?.list) ? got.list : [];
              } catch {
                raw = [];
              }

              const stamped = raw.map((a: any) => ({
                ...(typeof a === "object" && a ? JSON.parse(JSON.stringify(a)) : a),
                target: { ...((a && a.target) || {}), source: currentKey }
              })) as ImageAnnotation[];

              return normalizeWrite(stamped);
            },

            clearOverlaySilently: async () => {
              if (!anno) return;
              await runSilently(() => {
                (anno as any).setAnnotations?.([], true);
                lastByIdRef.current = {};
                dirtyRef.current = true;
              });
            },

            hydrateOverlay: async (list: ImageAnnotation[], currentKey: string) => {
              if (!anno) return false;
              currentKeyRef.current = currentKey;

              // Rectangle-only on hydrate as well
              const src: any[] = Array.isArray(list)
                ? list.filter(isRectangleAnno)
                : [];
              const stamped = src.map((a: any) => ({
                ...(typeof a === "object" && a ? JSON.parse(JSON.stringify(a)) : a),
                target: { ...((a && a.target) || {}), source: currentKey }
              })) as ImageAnnotation[];

              // Seed lastById for consistent normalization on subsequent edits
              const seed: Record<string, ImageAnnotation> = {};
              for (const a of stamped) seed[a.id as string] = a;
              lastByIdRef.current = seed;

              await runSilently(() => {
                (anno as any).setAnnotations?.(stamped, true);
              });
              // Hydration reflects previously saved state -> keep dirty=false
              return true;
            },

            hasUnsaved: () => dirtyRef.current,

            markSaved: () => {
              dirtyRef.current = false;
            }
          } as any
        ),
      [anno, doubleRAF, runSilently, normalizeWrite]
    );

    // Subscribe to create/update/delete -> normalize + auto-quick-add logic (RECTANGLE ONLY)
    useEffect(() => {
      if (!anno) return;

      const onAnyChange = async () => {
        if (suppressPersistRef.current) return;

        // Any create/update/delete from the user marks this sample dirty
        dirtyRef.current = true;

        const key = currentKeyRef.current;
        const got: any = (anno as any).getAnnotations?.() ?? [];
        const rawFull: any[] = Array.isArray(got) ? got : got?.list || [];
        // Drop non-rectangles at the source
        const raw = rawFull
          .filter(isRectangleAnno)
          .map((a: any) => ({
            ...(typeof a === "object" && a ? JSON.parse(JSON.stringify(a)) : a),
            target: { ...((a && a.target) || {}), source: key }
          })) as ImageAnnotation[];

        // Normalize first so fresh shapes inherit current label/instance
        let normalized = normalizeWithMode(
          raw,
          lastByIdRef.current,
          getSelectedProfile,
          getSelectedClassName,
          includeTrackIds,
          classRegistry
        );

        // Auto quick-add logic; will be no-op in Phase 1 because we don't pass onAutoQuickAdd
        if (includeTrackIds && normalized.length > 0 && onAutoQuickAdd) {
          const firstByInstance = new Map<string, string>();
          let duplicateAnno: ImageAnnotation | null = null;

          for (const a of normalized) {
            const lbl = extractClassLabel(a) || {};
            const cname = (lbl.class_name || "").toLowerCase();
            const tid = lbl.track_id ? canonicalizeTrackId(lbl.track_id) : "";
            if (!cname || !tid) continue;
            const instKey = `${cname}:${tid}`;
            const aid = String(a.id);
            if (firstByInstance.has(instKey)) {
              duplicateAnno = a as ImageAnnotation;
              break;
            } else {
              firstByInstance.set(instKey, aid);
            }
          }

          if (duplicateAnno) {
            const dupLbl = extractClassLabel(duplicateAnno) || {};
            const cname = (dupLbl.class_name || "").toLowerCase();
            const newProf = await onAutoQuickAdd({ class_name: cname });
            if (newProf) {
              normalized = normalized.map((a) =>
                a.id === duplicateAnno!.id
                  ? (writeClassAndTrack(
                      a,
                      { id: newProf.class_id, name: newProf.class_name },
                      newProf.track_id
                    ) as ImageAnnotation)
                  : a
              );
            }
          }
        }

        // keep lastById in sync (even if overlay doesn't need re-apply)
        const byId: Record<string, ImageAnnotation> = {};
        for (const a of normalized) byId[a.id as string] = a;
        lastByIdRef.current = byId;

        // Optional: skip buffering if nothing actually changed
        const nextSig = sig(normalized);
        if (nextSig === lastAppliedRef.current) {
          return;
        }

        // Buffer; one apply per animation frame
        pendingRef.current = normalized;
        void flushOverlay();
      };

      const onCreate = async (w3c: ImageAnnotation) => {
        await handleCreate(w3c);
        await onAnyChange();
      };

      anno.on?.("createAnnotation", onCreate);
      anno.on?.("updateAnnotation", onAnyChange);
      anno.on?.("deleteAnnotation", onAnyChange);
      return () => {
        anno.off?.("createAnnotation", onCreate);
        anno.off?.("updateAnnotation", onAnyChange);
        anno.off?.("deleteAnnotation", onAnyChange);
      };
    }, [
      anno,
      includeTrackIds,
      classRegistry,
      getSelectedProfile,
      getSelectedClassName,
      onAutoQuickAdd,
      flushOverlay,
      handleCreate
    ]);

    return null;
  }),
  { Popup: ImageAnnotationPopup }
);
