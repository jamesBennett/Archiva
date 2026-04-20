import { useCallback, useEffect } from "react";
import {
  addPhotosToAlbum as apiAddPhotos,
  createAlbum as apiCreateAlbum,
  listAlbumPhotos as apiListAlbumPhotos,
  listAlbums as apiListAlbums,
  reorderAlbums as apiReorderAlbums,
} from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";
import type { Album } from "../types";

export function useAlbums() {
  const albums = useLibraryStore((s) => s.albums);
  const setAlbums = useLibraryStore((s) => s.setAlbums);
  const activeSource = useLibraryStore((s) => s.activeSource);
  const albumPhotoIds = useLibraryStore((s) => s.albumPhotoIds);
  const setAlbumPhotoIds = useLibraryStore((s) => s.setAlbumPhotoIds);

  const refresh = useCallback(async () => {
    const rows = await apiListAlbums();
    setAlbums(rows);
  }, [setAlbums]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Hydrate album photo ids when an album is activated (cache first).
  useEffect(() => {
    if (activeSource.kind !== "album") return;
    if (albumPhotoIds.has(activeSource.id)) return;
    const id = activeSource.id;
    void apiListAlbumPhotos(id).then((ids) => {
      setAlbumPhotoIds(id, new Set(ids));
    });
  }, [activeSource, albumPhotoIds, setAlbumPhotoIds]);

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const prev = albums;
      // Optimistic reorder
      const byId = new Map(prev.map((a) => [a.id, a]));
      const next: Album[] = orderedIds
        .map((id) => byId.get(id))
        .filter((a): a is Album => !!a)
        .map((a, i) => ({ ...a, sort_order: i }));
      setAlbums(next);
      try {
        await apiReorderAlbums(orderedIds);
      } catch (e) {
        setAlbums(prev);
        throw e;
      }
    },
    [albums, setAlbums],
  );

  const addPhotos = useCallback(
    async (albumId: string, photoIds: string[]) => {
      const count = await apiAddPhotos(albumId, photoIds);
      // Invalidate cache so the next activation re-fetches.
      if (albumPhotoIds.has(albumId)) {
        const ids = await apiListAlbumPhotos(albumId);
        setAlbumPhotoIds(albumId, new Set(ids));
      }
      return count;
    },
    [albumPhotoIds, setAlbumPhotoIds],
  );

  const create = useCallback(
    async (name: string) => {
      const album = await apiCreateAlbum(name);
      setAlbums([...albums, album]);
      return album;
    },
    [albums, setAlbums],
  );

  return { albums, refresh, reorder, addPhotos, create };
}
