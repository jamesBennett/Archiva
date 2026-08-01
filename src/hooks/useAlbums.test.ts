import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../lib/tauri", () => ({
  listAlbums: vi.fn(),
  createAlbum: vi.fn(),
  renameAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  reorderAlbums: vi.fn(),
  listAlbumPhotos: vi.fn(),
  addPhotosToAlbum: vi.fn(),
  removePhotosFromAlbum: vi.fn(),
}));

import { deleteAlbum, listAlbums, renameAlbum, listAlbumPhotos } from "../lib/tauri";
import { useAlbums } from "./useAlbums";
import { useLibraryStore } from "../store/useLibraryStore";
import type { Album } from "../types";

const album = (id: string, name: string, sort: number): Album => ({
  id,
  name,
  description: null,
  cover_photo_id: null,
  is_smart: 0,
  sort_order: sort,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const fixtures = [album("a1", "Family Vacation", 0), album("a2", "Our Wedding", 1)];

describe("useAlbums rename/remove", () => {
  beforeEach(() => {
    vi.mocked(listAlbums).mockResolvedValue(fixtures);
    vi.mocked(renameAlbum).mockReset();
    vi.mocked(deleteAlbum).mockReset();
    vi.mocked(listAlbumPhotos).mockResolvedValue([]);
    useLibraryStore.setState({
      albums: fixtures,
      selectedIds: new Set(),
      activeSource: { kind: "library" },
      activePhotoId: null,
      viewMode: "grid",
      expandedYears: new Set<number>(),
      foldersHeightPct: 50,
      albumPhotoIds: new Map(),
      history: [{ source: { kind: "library" }, scrollTop: 0 }],
      historyIndex: 0,
      liveScrollTop: 0,
      pendingScrollTop: null,
      scrollToActivePending: false,
    });
  });

  it("rename optimistically updates the album name", async () => {
    vi.mocked(renameAlbum).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await act(() => result.current.rename("a1", "Trip 2026"));
    expect(useLibraryStore.getState().albums.find((a) => a.id === "a1")?.name).toBe(
      "Trip 2026",
    );
    expect(renameAlbum).toHaveBeenCalledWith("a1", "Trip 2026");
  });

  it("rename rolls back and rethrows on API failure", async () => {
    vi.mocked(renameAlbum).mockRejectedValue(new Error("db locked"));
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await expect(act(() => result.current.rename("a1", "Trip 2026"))).rejects.toThrow(
      "db locked",
    );
    expect(useLibraryStore.getState().albums.find((a) => a.id === "a1")?.name).toBe(
      "Family Vacation",
    );
  });

  it("remove optimistically drops the album", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().albums.map((a) => a.id)).toEqual(["a1"]);
    expect(deleteAlbum).toHaveBeenCalledWith("a2");
  });

  it("remove resets activeSource to library when deleting the active album", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    useLibraryStore.getState().setActiveSource({ kind: "album", id: "a2" });
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().activeSource).toEqual({ kind: "library" });
  });

  it("remove leaves activeSource alone when deleting an inactive album", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    useLibraryStore.getState().setActiveSource({ kind: "album", id: "a1" });
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().activeSource).toEqual({ kind: "album", id: "a1" });
  });

  it("remove rolls back the album list and rethrows on API failure", async () => {
    vi.mocked(deleteAlbum).mockRejectedValue(new Error("db locked"));
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await expect(act(() => result.current.remove("a2"))).rejects.toThrow("db locked");
    expect(useLibraryStore.getState().albums.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("remove prunes the album's cached photo ids on success", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    useLibraryStore.getState().setAlbumPhotoIds("a2", new Set(["p1", "p2"]));
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().albumPhotoIds.has("a2")).toBe(false);
  });

  it("remove keeps the cached photo ids when the API call fails", async () => {
    vi.mocked(deleteAlbum).mockRejectedValue(new Error("db locked"));
    useLibraryStore.getState().setAlbumPhotoIds("a2", new Set(["p1", "p2"]));
    const { result } = renderHook(() => useAlbums());
    await act(async () => {});
    await expect(act(() => result.current.remove("a2"))).rejects.toThrow("db locked");
    expect(useLibraryStore.getState().albumPhotoIds.get("a2")).toEqual(new Set(["p1", "p2"]));
  });
});
