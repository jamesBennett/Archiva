import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsMenu } from "./SettingsMenu";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

vi.mock("../hooks/useLibrary", () => ({
  useLibrary: () => ({
    current: { uuid: "u1", name: "Main", path: "/x/Main.archivalib" },
    loading: false,
    recents: [
      {
        uuid: "u1",
        name: "Main",
        path: "/x/Main.archivalib",
        last_opened: "2026-07-29T00:00:00Z",
        exists: true,
      },
      {
        uuid: "u2",
        name: "Travel",
        path: "/x/Travel.archivalib",
        last_opened: "2026-07-20T00:00:00Z",
        exists: true,
      },
    ],
    error: null,
    refreshRecents: vi.fn(),
    openAt: vi.fn(),
    createAt: vi.fn(),
    close: vi.fn(),
    reveal: vi.fn(),
  }),
}));

describe("SettingsMenu", () => {
  it("lists switch library, rescan, and add folder", async () => {
    const user = userEvent.setup();
    render(<SettingsMenu onRescan={vi.fn()} onAddFolder={vi.fn()} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Switch Library ›", "Rescan Images", "Add Folder…"]);
  });

  it("calls onRescan when Rescan Images is selected", async () => {
    const user = userEvent.setup();
    const onRescan = vi.fn();
    render(<SettingsMenu onRescan={onRescan} onAddFolder={vi.fn()} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Rescan Images" }));
    expect(onRescan).toHaveBeenCalledOnce();
  });

  it("lists other recent libraries in the Switch Library submenu", async () => {
    const user = userEvent.setup();
    render(<SettingsMenu onRescan={vi.fn()} onAddFolder={vi.fn()} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: /Switch Library/ }));
    expect(await screen.findByText("Travel")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.getByText("Other Library…")).toBeInTheDocument();
  });
});
