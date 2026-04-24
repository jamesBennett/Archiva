import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Photo } from "../types";
import { thumbUrl } from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";
import { usePreview } from "../hooks/usePreview";

interface Props {
  photos: Photo[];
  activePhotoId: string;
}

export function SinglePhotoView({ photos, activePhotoId }: Props) {
  const selectPhoto = useLibraryStore((s) => s.selectPhoto);
  const exitSingle = useLibraryStore((s) => s.exitSingle);

  const index = useMemo(
    () => photos.findIndex((p) => p.id === activePhotoId),
    [photos, activePhotoId],
  );
  const photo = index >= 0 ? photos[index] : null;

  const canPrev = index > 0;
  const canNext = index >= 0 && index < photos.length - 1;

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const maxPx = Math.ceil(Math.max(size.w, size.h) * dpr);

  const { url: previewUrl, error } = usePreview(photo?.id ?? null, maxPx);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        exitSingle();
      } else if (e.key === "ArrowRight") {
        if (index >= 0 && index < photos.length - 1) {
          selectPhoto(photos[index + 1].id);
        }
      } else if (e.key === "ArrowLeft") {
        if (index > 0) {
          selectPhoto(photos[index - 1].id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos, index, selectPhoto, exitSingle]);

  if (!photo) return null;

  const fallback = photo.thumb_ready ? thumbUrl(photo.thumb_path) : null;
  const src = previewUrl ?? fallback ?? undefined;

  return (
    <div
      ref={surfaceRef}
      data-testid="single-photo-surface"
      onDoubleClick={exitSingle}
      className="relative flex h-full w-full items-center justify-center bg-bg"
    >
      {src ? (
        <img
          src={src}
          alt={photo.filename}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
      ) : (
        <div className="text-sm text-muted">Loading…</div>
      )}

      {error && (
        <div className="absolute bottom-3 right-3 rounded bg-red-900/70 px-2 py-1 text-xs text-red-100">
          Preview failed
        </div>
      )}

      <button
        type="button"
        aria-label="Previous photo"
        disabled={!canPrev}
        onClick={(e) => {
          e.stopPropagation();
          if (canPrev) selectPhoto(photos[index - 1].id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx(
          "absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-black/50 text-white",
          "transition-opacity hover:bg-black/70",
          "disabled:opacity-30 disabled:hover:bg-black/50",
        )}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10 3 5 8 10 13" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Next photo"
        disabled={!canNext}
        onClick={(e) => {
          e.stopPropagation();
          if (canNext) selectPhoto(photos[index + 1].id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx(
          "absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-black/50 text-white",
          "transition-opacity hover:bg-black/70",
          "disabled:opacity-30 disabled:hover:bg-black/50",
        )}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 3 11 8 6 13" />
        </svg>
      </button>
    </div>
  );
}
