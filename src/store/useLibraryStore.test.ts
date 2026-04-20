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
    });
  });

  it("setPhotos replaces the photo list", () => {
    useLibraryStore.getState().setPhotos([makePhoto("a"), makePhoto("b")]);
    expect(useLibraryStore.getState().photos.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("selectPhoto replaces selection with single id", () => {
    useLibraryStore.getState().selectPhoto("a");
    const s = useLibraryStore.getState();
    expect(Array.from(s.selectedIds)).toEqual(["a"]);
    expect(s.activePhotoId).toBe("a");
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
});
