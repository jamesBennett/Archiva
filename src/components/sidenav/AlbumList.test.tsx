import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";

vi.mock("../../lib/tauri", () => ({
  listAlbums: vi.fn(),
  createAlbum: vi.fn(),
  renameAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  reorderAlbums: vi.fn(),
  listAlbumPhotos: vi.fn(),
  addPhotosToAlbum: vi.fn(),
  removePhotosFromAlbum: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

import { ask } from "@tauri-apps/plugin-dialog";
import { deleteAlbum, listAlbums, listAlbumPhotos, renameAlbum } from "../../lib/tauri";
import { AlbumList } from "./AlbumList";
import { useLibraryStore } from "../../store/useLibraryStore";
import type { Album } from "../../types";

const albums: Album[] = [
  {
    id: "a1",
    name: "Family Vacation",
    description: null,
    cover_photo_id: null,
    is_smart: 0,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "a2",
    name: "Our Wedding",
    description: null,
    cover_photo_id: null,
    is_smart: 0,
    sort_order: 1,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

function renderList() {
  return render(
    <DndContext>
      <AlbumList albums={albums} />
    </DndContext>,
  );
}

async function openContextMenu(name: RegExp) {
  fireEvent.contextMenu(screen.getByRole("button", { name }));
  return screen.findByRole("menu");
}

describe("AlbumList", () => {
  beforeEach(() => {
    vi.mocked(listAlbums).mockResolvedValue(albums);
    vi.mocked(listAlbumPhotos).mockResolvedValue([]);
    vi.mocked(renameAlbum).mockReset();
    vi.mocked(deleteAlbum).mockReset();
    vi.mocked(ask).mockReset();
    useLibraryStore.setState({
      activeSource: { kind: "library" },
      albums,
      albumPhotoIds: new Map(),
    });
  });

  it("renders each album name in order", () => {
    renderList();
    const rows = screen.getAllByRole("button", { name: /Family Vacation|Our Wedding/ });
    expect(rows.map((r) => r.textContent)).toEqual(["Family Vacation", "Our Wedding"]);
  });

  it("clicking an album sets activeSource to that album", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /Our Wedding/ }));
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "album",
      id: "a2",
    });
  });

  it("applies active styling to the currently selected album", () => {
    useLibraryStore.setState({ activeSource: { kind: "album", id: "a1" } });
    renderList();
    const btn = screen.getByRole("button", { name: /Family Vacation/ });
    expect(btn.className).toMatch(/bg-accent/);
  });

  it("right-click shows Rename and Delete menu items", async () => {
    renderList();
    await openContextMenu(/Family Vacation/);
    expect(screen.getByRole("menuitem", { name: /Rename/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
  });

  it("Rename opens dialog prefilled and submits the new name", async () => {
    const user = userEvent.setup();
    vi.mocked(renameAlbum).mockResolvedValue(undefined);
    renderList();
    await openContextMenu(/Family Vacation/);
    await user.click(screen.getByRole("menuitem", { name: /Rename/ }));
    const input = await screen.findByRole("textbox");
    expect(input).toHaveValue("Family Vacation");
    await user.clear(input);
    await user.type(input, "Trip 2026{Enter}");
    await waitFor(() => expect(renameAlbum).toHaveBeenCalledWith("a1", "Trip 2026"));
    expect(useLibraryStore.getState().albums.find((a) => a.id === "a1")?.name).toBe(
      "Trip 2026",
    );
  });

  it("Delete asks for native confirmation and removes on confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    renderList();
    await openContextMenu(/Our Wedding/);
    await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() => expect(deleteAlbum).toHaveBeenCalledWith("a2"));
    expect(vi.mocked(ask).mock.calls[0][0]).toContain('"Our Wedding"');
    expect(useLibraryStore.getState().albums.map((a) => a.id)).toEqual(["a1"]);
  });

  it("Delete does nothing when confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.mocked(ask).mockResolvedValue(false);
    renderList();
    await openContextMenu(/Our Wedding/);
    await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(deleteAlbum).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().albums).toHaveLength(2);
  });
});
