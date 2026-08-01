import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "./useLibraryStore";
import type { Photo } from "../types";

function makePhoto(id: string): Photo {
  return {
    id,
    path: `/tmp/${id}.jpg`,
    filename: `${id}.jpg`,
    ext: "jpg",
    size_bytes: 1,
    width: null,
    height: null,
    created_at: null,
    modified_at: null,
    imported_at: "2026-04-18T00:00:00Z",
    camera_make: null,
    camera_model: null,
    lens_model: null,
    focal_length: null,
    aperture: null,
    shutter_speed: null,
    iso: null,
    latitude: null,
    longitude: null,
    altitude: null,
    rating: 0,
    flag: 0,
    color_label: null,
    is_favorite: 0,
    thumb_path: null,
    thumb_ready: 0,
  };
}

describe("useLibraryStore", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      photos: [],
      albums: [],
      selectedIds: new Set(),
      activeSource: { kind: "library" },
      activePhotoId: null,
      expandedYears: new Set<number>(),
      foldersHeightPct: 50,
      albumPhotoIds: new Map(),
      history: [{ source: { kind: "library" }, scrollTop: 0 }],
      historyIndex: 0,
      liveScrollTop: 0,
      pendingScrollTop: null,
      viewMode: "grid",
      scrollToActivePending: false,
      currentLibrary: null,
      libraryLoading: true,
    });
  });

  it("setPhotos replaces the photo list", () => {
    useLibraryStore.getState().setPhotos([makePhoto("a"), makePhoto("b")]);
    expect(useLibraryStore.getState().photos.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("selectPhoto sets activePhotoId without touching selectedIds", () => {
    useLibraryStore.setState({ selectedIds: new Set(["x"]) });
    useLibraryStore.getState().selectPhoto("a");
    const s = useLibraryStore.getState();
    expect(s.activePhotoId).toBe("a");
    expect(Array.from(s.selectedIds)).toEqual(["x"]);
  });

  it("toggleSelect adds then removes", () => {
    const { toggleSelect } = useLibraryStore.getState();
    toggleSelect("a");
    expect(useLibraryStore.getState().selectedIds.has("a")).toBe(true);
    toggleSelect("a");
    expect(useLibraryStore.getState().selectedIds.has("a")).toBe(false);
  });

  it("clearSelection empties selection and activePhotoId", () => {
    useLibraryStore.getState().selectPhoto("a");
    useLibraryStore.getState().clearSelection();
    const s = useLibraryStore.getState();
    expect(s.selectedIds.size).toBe(0);
    expect(s.activePhotoId).toBeNull();
  });

  it("setActiveSource updates the active source", () => {
    useLibraryStore.getState().setActiveSource({ kind: "date", year: 2019 });
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "date",
      year: 2019,
    });
    useLibraryStore.getState().setActiveSource({ kind: "library" });
    expect(useLibraryStore.getState().activeSource).toEqual({ kind: "library" });
  });

  it("toggleYear adds then removes year from expanded set", () => {
    useLibraryStore.getState().toggleYear(2019);
    expect(useLibraryStore.getState().expandedYears.has(2019)).toBe(true);
    useLibraryStore.getState().toggleYear(2019);
    expect(useLibraryStore.getState().expandedYears.has(2019)).toBe(false);
  });

  it("setFoldersHeightPct clamps to 20-80", () => {
    useLibraryStore.getState().setFoldersHeightPct(5);
    expect(useLibraryStore.getState().foldersHeightPct).toBe(20);
    useLibraryStore.getState().setFoldersHeightPct(95);
    expect(useLibraryStore.getState().foldersHeightPct).toBe(80);
    useLibraryStore.getState().setFoldersHeightPct(60);
    expect(useLibraryStore.getState().foldersHeightPct).toBe(60);
  });

  it("setAlbumPhotoIds stores the id set for an album", () => {
    useLibraryStore.getState().setAlbumPhotoIds("alb-1", new Set(["p1", "p2"]));
    const ids = useLibraryStore.getState().albumPhotoIds.get("alb-1");
    expect(ids && Array.from(ids)).toEqual(["p1", "p2"]);
  });

  it("setActiveSource pushes a new history entry", () => {
    const s = useLibraryStore.getState();
    s.setActiveSource({ kind: "date", year: 2019 });
    s.setActiveSource({ kind: "album", id: "a1" });
    const state = useLibraryStore.getState();
    expect(state.history.length).toBe(3);
    expect(state.historyIndex).toBe(2);
    expect(state.activeSource).toEqual({ kind: "album", id: "a1" });
  });

  it("setActiveSource with same source is a no-op", () => {
    useLibraryStore.getState().setActiveSource({ kind: "library" });
    expect(useLibraryStore.getState().history.length).toBe(1);
  });

  it("historyBack restores source and pending scrollTop", () => {
    const s = useLibraryStore.getState();
    s.setLiveScrollTop(200);
    s.setActiveSource({ kind: "date", year: 2019 });
    useLibraryStore.getState().setLiveScrollTop(400);
    useLibraryStore.getState().historyBack();
    const state = useLibraryStore.getState();
    expect(state.activeSource).toEqual({ kind: "library" });
    expect(state.pendingScrollTop).toBe(200);
    expect(state.historyIndex).toBe(0);
  });

  it("historyForward restores the next entry", () => {
    const s = useLibraryStore.getState();
    s.setActiveSource({ kind: "date", year: 2019 });
    useLibraryStore.getState().historyBack();
    useLibraryStore.getState().historyForward();
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "date",
      year: 2019,
    });
  });

  it("setActiveSource after back truncates the future", () => {
    const s = useLibraryStore.getState();
    s.setActiveSource({ kind: "date", year: 2019 });
    s.setActiveSource({ kind: "album", id: "a1" });
    useLibraryStore.getState().historyBack();
    useLibraryStore.getState().setActiveSource({ kind: "no-date" });
    const state = useLibraryStore.getState();
    expect(state.history.length).toBe(3);
    expect(state.historyIndex).toBe(2);
    expect(state.activeSource).toEqual({ kind: "no-date" });
  });

  it("defaults viewMode to grid", () => {
    expect(useLibraryStore.getState().viewMode).toBe("grid");
  });

  it("enterSingle sets viewMode=single and activePhotoId", () => {
    useLibraryStore.getState().enterSingle("abc");
    expect(useLibraryStore.getState().viewMode).toBe("single");
    expect(useLibraryStore.getState().activePhotoId).toBe("abc");
  });

  it("exitSingle sets viewMode=grid and keeps activePhotoId", () => {
    useLibraryStore.getState().enterSingle("abc");
    useLibraryStore.getState().exitSingle();
    expect(useLibraryStore.getState().viewMode).toBe("grid");
    expect(useLibraryStore.getState().activePhotoId).toBe("abc");
  });

  it("exitSingle requests scroll-to-active without touching selectedIds", () => {
    useLibraryStore.setState({ selectedIds: new Set(["x"]) });
    useLibraryStore.getState().enterSingle("abc");
    useLibraryStore.getState().exitSingle();
    const s = useLibraryStore.getState();
    expect(Array.from(s.selectedIds)).toEqual(["x"]);
    expect(s.scrollToActivePending).toBe(true);
  });

  it("consumeScrollToActive clears the flag", () => {
    useLibraryStore.getState().enterSingle("abc");
    useLibraryStore.getState().exitSingle();
    useLibraryStore.getState().consumeScrollToActive();
    expect(useLibraryStore.getState().scrollToActivePending).toBe(false);
  });

  it("enterSingle with a different id updates activePhotoId", () => {
    useLibraryStore.getState().enterSingle("a");
    useLibraryStore.getState().enterSingle("b");
    expect(useLibraryStore.getState().activePhotoId).toBe("b");
  });

  it("reset clears per-library data but keeps currentLibrary and UI prefs", () => {
    useLibraryStore.setState({
      photos: [makePhoto("a")],
      selectedIds: new Set(["a"]),
      activePhotoId: "a",
      activeSource: { kind: "album", id: "alb1" },
      viewMode: "single",
      albumPhotoIds: new Map([["alb1", new Set(["a"])]]),
      history: [
        { source: { kind: "library" }, scrollTop: 0 },
        { source: { kind: "album", id: "alb1" }, scrollTop: 120 },
      ],
      historyIndex: 1,
      liveScrollTop: 120,
      pendingScrollTop: 40,
      expandedYears: new Set([2024]),
      foldersHeightPct: 33,
      currentLibrary: { uuid: "u", name: "Lib", path: "/x.archivalib" },
    });
    useLibraryStore.getState().reset();
    const s = useLibraryStore.getState();
    expect(s.photos).toEqual([]);
    expect(s.albums).toEqual([]);
    expect(s.selectedIds.size).toBe(0);
    expect(s.activePhotoId).toBeNull();
    expect(s.activeSource).toEqual({ kind: "library" });
    expect(s.viewMode).toBe("grid");
    expect(s.albumPhotoIds.size).toBe(0);
    expect(s.history).toEqual([{ source: { kind: "library" }, scrollTop: 0 }]);
    expect(s.historyIndex).toBe(0);
    expect(s.liveScrollTop).toBe(0);
    expect(s.pendingScrollTop).toBeNull();
    // UI prefs and the library itself survive
    expect(s.expandedYears.has(2024)).toBe(true);
    expect(s.foldersHeightPct).toBe(33);
    expect(s.currentLibrary?.uuid).toBe("u");
  });

  it("setCurrentLibrary updates the library", () => {
    useLibraryStore
      .getState()
      .setCurrentLibrary({ uuid: "u2", name: "Other", path: "/y.archivalib" });
    expect(useLibraryStore.getState().currentLibrary?.name).toBe("Other");
  });
});
