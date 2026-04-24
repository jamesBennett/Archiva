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

function sourcesEqual(a: ActiveSource, b: ActiveSource): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "date" && b.kind === "date")
    return a.year === b.year && a.month === b.month;
  if (a.kind === "album" && b.kind === "album") return a.id === b.id;
  return true;
}

interface HistoryEntry {
  source: ActiveSource;
  scrollTop: number;
}

interface LibraryState {
  photos: Photo[];
  albums: Album[];
  selectedIds: Set<string>;
  activeSource: ActiveSource;
  activePhotoId: string | null;
  viewMode: "grid" | "single";
  expandedYears: Set<number>;
  foldersHeightPct: number;
  albumPhotoIds: Map<string, Set<string>>;

  history: HistoryEntry[];
  historyIndex: number;
  liveScrollTop: number;
  pendingScrollTop: number | null;

  setPhotos: (photos: Photo[]) => void;
  setAlbums: (albums: Album[]) => void;
  selectPhoto: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setActiveSource: (s: ActiveSource) => void;
  toggleYear: (year: number) => void;
  setFoldersHeightPct: (n: number) => void;
  setAlbumPhotoIds: (albumId: string, ids: Set<string>) => void;

  enterSingle: (photoId: string) => void;
  exitSingle: () => void;

  setLiveScrollTop: (n: number) => void;
  consumePendingScrollTop: () => void;
  historyBack: () => void;
  historyForward: () => void;
}

const INITIAL_SOURCE: ActiveSource = { kind: "library" };

export const useLibraryStore = create<LibraryState>((set) => ({
  photos: [],
  albums: [],
  selectedIds: new Set<string>(),
  activeSource: INITIAL_SOURCE,
  activePhotoId: null,
  viewMode: "grid",
  expandedYears: new Set<number>(),
  foldersHeightPct: loadSplit(),
  albumPhotoIds: new Map<string, Set<string>>(),

  history: [{ source: INITIAL_SOURCE, scrollTop: 0 }],
  historyIndex: 0,
  liveScrollTop: 0,
  pendingScrollTop: null,

  setPhotos: (photos) => set({ photos }),
  setAlbums: (albums) => set({ albums }),
  selectPhoto: (id) => set({ activePhotoId: id }),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clearSelection: () => set({ selectedIds: new Set(), activePhotoId: null }),

  setActiveSource: (s) =>
    set((state) => {
      const current = state.history[state.historyIndex];
      if (current && sourcesEqual(current.source, s)) return {};
      const past = state.history.slice(0, state.historyIndex);
      const updatedCurrent = current
        ? { ...current, scrollTop: state.liveScrollTop }
        : null;
      const nextHistory: HistoryEntry[] = [
        ...past,
        ...(updatedCurrent ? [updatedCurrent] : []),
        { source: s, scrollTop: 0 },
      ];
      return {
        activeSource: s,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        pendingScrollTop: 0,
      };
    }),

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

  enterSingle: (photoId) => set({ viewMode: "single", activePhotoId: photoId }),
  exitSingle: () => set({ viewMode: "grid" }),

  setLiveScrollTop: (n) => set({ liveScrollTop: n }),
  consumePendingScrollTop: () => set({ pendingScrollTop: null }),

  historyBack: () =>
    set((state) => {
      if (state.historyIndex <= 0) return {};
      const history = [...state.history];
      history[state.historyIndex] = {
        ...history[state.historyIndex],
        scrollTop: state.liveScrollTop,
      };
      const nextIndex = state.historyIndex - 1;
      const entry = history[nextIndex];
      return {
        history,
        historyIndex: nextIndex,
        activeSource: entry.source,
        pendingScrollTop: entry.scrollTop,
      };
    }),

  historyForward: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return {};
      const history = [...state.history];
      history[state.historyIndex] = {
        ...history[state.historyIndex],
        scrollTop: state.liveScrollTop,
      };
      const nextIndex = state.historyIndex + 1;
      const entry = history[nextIndex];
      return {
        history,
        historyIndex: nextIndex,
        activeSource: entry.source,
        pendingScrollTop: entry.scrollTop,
      };
    }),
}));
