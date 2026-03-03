"use client";

export function AnnotationPopup({
  className,
  trackId,
  geometry,
  details,
  onDeleteBox,
  onClose,
}: {
  className: string | null;
  trackId: string | null;
  geometry?: { x: number; y: number; w: number; h: number } | null;
  details?: string | null;
  onDeleteBox: () => void;
  onClose: () => void;
}) {
  const detailText =
    details ??
    (geometry
      ? `x=${Math.round(geometry.x)}, y=${Math.round(geometry.y)}, w=${Math.round(
          geometry.w,
        )}, h=${Math.round(geometry.h)}`
      : null);

  return (
    <div className="min-w-[220px] rounded-xl border border-gray-900 bg-black/95 px-4 py-3 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-400">Selected</div>
          <div className="truncate text-2 font-semibold text-white sm:text-lg">
            {(className ?? "Unlabelled").trim() || "Unlabelled"} /{" "}
            {(trackId ?? "No track").trim() || "No track"}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-lg leading-none text-white/80 transition hover:text-white"
          aria-label="Close popup"
        >
          ×
        </button>
      </div>

      {detailText ? (
        <div className="mt-1 text-xs text-gray-400">{detailText}</div>
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          onClick={onDeleteBox}
          className="rounded-lg bg-red-900/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800"
        >
          Delete box
        </button>
      </div>
    </div>
  );
}
