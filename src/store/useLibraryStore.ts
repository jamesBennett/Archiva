import { create } from "zustand";
import type { Album, Photo } from "../types";

interface LibraryState {
  photos: Photo[];
  albums: Album[];
  selectedIds: Set<string>;
  activeAlbumId: string | null;
  activePhotoId: string | null;

  setPhotos: (photos: Photo[]) => void;
  setAlbums: (albums: Album[]) => void;
  selectPhoto: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setActiveAlbum: (id: string | null) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  photos: [],
  albums: [],
  selectedIds: new Set<string>(),
  activeAlbumId: null,
  activePhotoId: null,

  setPhotos: (photos) => set({ photos }),
  setAlbums: (albums) => set({ albums }),
  selectPhoto: (id) =>
    set({ selectedIds: new Set([id]), activePhotoId: id }),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clearSelection: () => set({ selectedIds: new Set(), activePhotoId: null }),
  setActiveAlbum: (id) => set({ activeAlbumId: id }),
}));
