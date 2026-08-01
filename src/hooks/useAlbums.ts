import { useCallback, useEffect } from "react";
import {
  addPhotosToAlbum as apiAddPhotos,
  createAlbum as apiCreateAlbum,
  deleteAlbum as apiDeleteAlbum,
  listAlbumPhotos as apiListAlbumPhotos,
  listAlbums as apiListAlbums,
  removePhotosFromAlbum as apiRemovePhotos,
  renameAlbum as apiRenameAlbum,
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
  const removeAlbumPhotoIds = useLibraryStore((s) => s.removeAlbumPhotoIds);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);

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

  const removePhotos = useCallback(
    async (albumId: string, photoIds: string[]) => {
      const prev = albumPhotoIds.get(albumId);
      if (prev) {
        const next = new Set(prev);
        for (const id of photoIds) next.delete(id);
        setAlbumPhotoIds(albumId, next);
      }
      try {
        return await apiRemovePhotos(albumId, photoIds);
      } catch (e) {
        if (prev) setAlbumPhotoIds(albumId, new Set(prev));
        throw e;
      }
    },
    [albumPhotoIds, setAlbumPhotoIds],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const prev = albums;
      setAlbums(albums.map((a) => (a.id === id ? { ...a, name } : a)));
      try {
        await apiRenameAlbum(id, name);
      } catch (e) {
        setAlbums(prev);
        throw e;
      }
    },
    [albums, setAlbums],
  );

  const remove = useCallback(
    async (id: string) => {
      const prev = albums;
      const prevSource = activeSource;
      setAlbums(albums.filter((a) => a.id !== id));
      if (activeSource.kind === "album" && activeSource.id === id) {
        setActiveSource({ kind: "library" });
      }
      try {
        await apiDeleteAlbum(id);
        removeAlbumPhotoIds(id);
      } catch (e) {
        setAlbums(prev);
        setActiveSource(prevSource);
        throw e;
      }
    },
    [albums, setAlbums, activeSource, setActiveSource, removeAlbumPhotoIds],
  );

  return { albums, refresh, reorder, addPhotos, create, removePhotos, rename, remove };
}
