import { create } from "zustand";
import type { ActiveSource, Album, Photo } from "../types";

const SPLIT_STORAGE_KEY = "archiva.sideNavSplit";

function loadSplit(): number {
  try {
    const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    if (!raw) return 50;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 50;
    return Math.min(80, Math.max(20, n));
  } catch {
    return 50;
  }
}

function saveSplit(n: number) {
  try {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(n));
  } catch {
    // ignore
  }
}

interface LibraryState {
  photos: Photo[];
  albums: Album[];
  selectedIds: Set<string>;
  activeSource: ActiveSource;
  activePhotoId: string | null;
  expandedYears: Set<number>;
  foldersHeightPct: number;
  albumPhotoIds: Map<string, Set<string>>;

  setPhotos: (photos: Photo[]) => void;
  setAlbums: (albums: Album[]) => void;
  selectPhoto: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setActiveSource: (s: ActiveSource) => void;
  toggleYear: (year: number) => void;
  setFoldersHeightPct: (n: number) => void;
  setAlbumPhotoIds: (albumId: string, ids: Set<string>) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  photos: [],
  albums: [],
  selectedIds: new Set<string>(),
  activeSource: { kind: "library" },
  activePhotoId: null,
  expandedYears: new Set<number>(),
  foldersHeightPct: loadSplit(),
  albumPhotoIds: new Map<string, Set<string>>(),

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
  setActiveSource: (s) => set({ activeSource: s }),
  toggleYear: (year) =>
    set((state) => {
      const next = new Set(state.expandedYears);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return { expandedYears: next };
    }),
  setFoldersHeightPct: (n) => {
    const clamped = Math.min(80, Math.max(20, n));
    saveSplit(clamped);
    set({ foldersHeightPct: clamped });
  },
  setAlbumPhotoIds: (albumId, ids) =>
    set((state) => {
      const next = new Map(state.albumPhotoIds);
      next.set(albumId, ids);
      return { albumPhotoIds: next };
    }),
}));
