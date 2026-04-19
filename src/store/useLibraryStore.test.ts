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
      activeAlbumId: null,
      activePhotoId: null,
    });
  });

  it("setPhotos replaces the photo list", () => {
    useLibraryStore.getState().setPhotos([makePhoto("a"), makePhoto("b")]);
    expect(useLibraryStore.getState().photos.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("selectPhoto replaces selection with single id and sets activePhotoId", () => {
    useLibraryStore.getState().selectPhoto("a");
    const s = useLibraryStore.getState();
    expect(Array.from(s.selectedIds)).toEqual(["a"]);
    expect(s.activePhotoId).toBe("a");
  });

  it("toggleSelect adds then removes an id", () => {
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

  it("setActiveAlbum updates active album id", () => {
    useLibraryStore.getState().setActiveAlbum("alb-1");
    expect(useLibraryStore.getState().activeAlbumId).toBe("alb-1");
    useLibraryStore.getState().setActiveAlbum(null);
    expect(useLibraryStore.getState().activeAlbumId).toBeNull();
  });
});
