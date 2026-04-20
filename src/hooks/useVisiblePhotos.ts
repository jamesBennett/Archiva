import { useMemo } from "react";
import type { ActiveSource, Photo } from "../types";
import { useLibraryStore } from "../store/useLibraryStore";

export function filterPhotos(
  photos: Photo[],
  src: ActiveSource,
  albumPhotoIds: Map<string, Set<string>>,
): Photo[] {
  switch (src.kind) {
    case "library":
      return photos;
    case "no-date":
      return photos.filter((p) => !p.created_at && !p.modified_at);
    case "date":
      return photos.filter((p) => matchesDate(p, src.year, src.month));
    case "album": {
      const ids = albumPhotoIds.get(src.id);
      if (!ids) return [];
      return photos.filter((p) => ids.has(p.id));
    }
  }
}

function matchesDate(p: Photo, year: number, month?: number): boolean {
  const iso = p.created_at ?? p.modified_at;
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  if (d.getUTCFullYear() !== year) return false;
  if (month !== undefined && d.getUTCMonth() + 1 !== month) return false;
  return true;
}

export function useVisiblePhotos(): Photo[] {
  const photos = useLibraryStore((s) => s.photos);
  const activeSource = useLibraryStore((s) => s.activeSource);
  const albumPhotoIds = useLibraryStore((s) => s.albumPhotoIds);
  return useMemo(
    () => filterPhotos(photos, activeSource, albumPhotoIds),
    [photos, activeSource, albumPhotoIds],
  );
}
