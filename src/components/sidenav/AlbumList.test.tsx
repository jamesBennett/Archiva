import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
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

describe("AlbumList", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      activeSource: { kind: "library" },
      albums,
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
});
