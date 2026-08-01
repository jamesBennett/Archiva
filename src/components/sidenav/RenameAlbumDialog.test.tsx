import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RenameAlbumDialog } from "./RenameAlbumDialog";
import type { Album } from "../../types";

const album: Album = {
  id: "a1",
  name: "Family Vacation",
  description: null,
  cover_photo_id: null,
  is_smart: 0,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("RenameAlbumDialog", () => {
  it("prefills the input with the current name", () => {
    render(<RenameAlbumDialog album={album} onClose={() => {}} onRename={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Family Vacation");
  });

  it("submits the trimmed new name and closes", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={onRename} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "  Trip 2026  {Enter}");
    expect(onRename).toHaveBeenCalledWith("a1", "Trip 2026");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without renaming when the name is unchanged", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onClose = vi.fn();
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={onRename} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Save when the name is empty", async () => {
    const user = userEvent.setup();
    render(<RenameAlbumDialog album={album} onClose={() => {}} onRename={vi.fn()} />);
    await user.clear(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when onRename rejects", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockRejectedValue(new Error("db locked"));
    const onClose = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={onRename} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Trip 2026{Enter}");
    expect(onClose).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
