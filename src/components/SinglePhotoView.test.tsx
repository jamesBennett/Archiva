import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Photo } from "../types";
import { SinglePhotoView } from "./SinglePhotoView";
import { useLibraryStore } from "../store/useLibraryStore";

vi.mock("../hooks/usePreview", () => ({
  usePreview: vi.fn(() => ({ url: null, loading: true, error: null })),
}));

vi.mock("../lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauri")>("../lib/tauri");
  return { ...actual, thumbUrl: (p: string | null) => (p ? `asset://${p}` : null) };
});

function makePhoto(id: string): Photo {
  return {
    id,
    path: `/tmp/${id}.jpg`,
    filename: `${id}.jpg`,
    ext: "jpg",
    size_bytes: 1,
    width: 1,
    height: 1,
    created_at: null,
    modified_at: null,
    imported_at: "2026-04-22T00:00:00Z",
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
    thumb_path: `/tmp/thumbs/${id}.jpg`,
    thumb_ready: 1,
  };
}

describe("SinglePhotoView", () => {
  const photos = ["a", "b", "c"].map(makePhoto);

  beforeEach(() => {
    useLibraryStore.setState({
      photos,
      albums: [],
      selectedIds: new Set(),
      activeSource: { kind: "library" },
      activePhotoId: "b",
      expandedYears: new Set<number>(),
      foldersHeightPct: 50,
      albumPhotoIds: new Map(),
      history: [{ source: { kind: "library" }, scrollTop: 0 }],
      historyIndex: 0,
      liveScrollTop: 0,
      pendingScrollTop: null,
      viewMode: "single",
      scrollToActivePending: false,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an image for the active photo", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("b.jpg");
  });

  it("ArrowRight advances to the next photo", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useLibraryStore.getState().activePhotoId).toBe("c");
  });

  it("ArrowLeft goes back one photo", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useLibraryStore.getState().activePhotoId).toBe("a");
  });

  it("ArrowLeft at the start is a no-op and left button is disabled", () => {
    useLibraryStore.setState({ activePhotoId: "a" });
    render(<SinglePhotoView photos={photos} activePhotoId="a" />);
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useLibraryStore.getState().activePhotoId).toBe("a");
  });

  it("ArrowRight at the end is a no-op and right button is disabled", () => {
    useLibraryStore.setState({ activePhotoId: "c" });
    render(<SinglePhotoView photos={photos} activePhotoId="c" />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useLibraryStore.getState().activePhotoId).toBe("c");
  });

  it("Escape exits to grid", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useLibraryStore.getState().viewMode).toBe("grid");
  });

  it("double-click on image exits to grid", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.doubleClick(screen.getByTestId("single-photo-surface"));
    expect(useLibraryStore.getState().viewMode).toBe("grid");
  });

  it("unmount removes keydown listener (no stray dispatch)", () => {
    const { unmount } = render(
      <SinglePhotoView photos={photos} activePhotoId="b" />,
    );
    unmount();
    useLibraryStore.setState({ activePhotoId: "b" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useLibraryStore.getState().activePhotoId).toBe("b");
  });

  it("clicking the next button advances", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(useLibraryStore.getState().activePhotoId).toBe("c");
  });
});
