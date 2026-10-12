import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Photo } from "../types";
import { SinglePhotoView } from "./SinglePhotoView";
import { useLibraryStore } from "../store/useLibraryStore";
import { usePreview } from "../hooks/usePreview";

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
    vi.mocked(usePreview).mockReturnValue({ url: null, loading: true, error: null });
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
      photoOpenOrigin: null,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  describe("preview navigation", () => {
    const decodes = new Map<string, { resolve: () => void; reject: () => void }>();

    beforeEach(() => {
      decodes.clear();
      vi.stubGlobal("Image", class {
        src = "";
        naturalWidth = 1200;
        naturalHeight = 800;
        decode() {
          return new Promise<void>((resolve, reject) => {
            decodes.set(this.src, { resolve, reject: () => reject(new Error("decode failed")) });
          });
        }
      });
      vi.mocked(usePreview).mockImplementation((id) => ({
        url: `asset://previews/${id}.jpg`, loading: false, error: null,
      }));
    });

    async function decode(id: string) {
      await act(async () => { decodes.get(`asset://previews/${id}.jpg`)!.resolve(); });
    }

    it("holds the sharp image while navigating and replaces it without a fade", async () => {
      const { rerender } = render(<SinglePhotoView photos={photos} activePhotoId="b" />);
      await decode("b");
      rerender(<SinglePhotoView photos={photos} activePhotoId="c" />);

      expect(screen.getByRole("img")).toHaveAttribute("src", "asset://previews/b.jpg");
      expect(screen.getByRole("status")).toHaveTextContent("Loading");
      expect(screen.queryByAltText("c.jpg")).not.toBeInTheDocument();

      await decode("c");
      expect(screen.getByRole("img")).toHaveAttribute("src", "asset://previews/c.jpg");
      expect(screen.getByRole("img")).not.toHaveClass("photo-preview");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      rerender(<SinglePhotoView photos={photos} activePhotoId="b" />);
      expect(screen.getByRole("img")).toHaveAttribute("src", "asset://previews/c.jpg");
      await decode("b");
      expect(screen.getByRole("img")).toHaveAttribute("src", "asset://previews/b.jpg");
      expect(screen.getByRole("img")).not.toHaveClass("photo-preview");
    });

    it("ignores a late decode when navigation skips past that photo", async () => {
      const { rerender } = render(<SinglePhotoView photos={photos} activePhotoId="a" />);
      await decode("a");
      rerender(<SinglePhotoView photos={photos} activePhotoId="b" />);
      rerender(<SinglePhotoView photos={photos} activePhotoId="c" />);
      await decode("c");
      await decode("b");
      expect(screen.getByRole("img")).toHaveAttribute("src", "asset://previews/c.jpg");
    });

    it("shows the requested thumbnail if its preview cannot be decoded", async () => {
      const { rerender } = render(<SinglePhotoView photos={photos} activePhotoId="b" />);
      await decode("b");
      rerender(<SinglePhotoView photos={photos} activePhotoId="c" />);
      await act(async () => { decodes.get("asset://previews/c.jpg")!.reject(); });

      expect(screen.getByRole("img")).toHaveAttribute("src", "asset:///tmp/thumbs/c.jpg");
      expect(screen.getByRole("status")).toHaveTextContent("Preview failed");
    });
  });
});
