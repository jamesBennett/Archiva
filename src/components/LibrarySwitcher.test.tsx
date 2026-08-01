import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LibrarySwitcher } from "./LibrarySwitcher";

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

describe("LibrarySwitcher", () => {
  it("shows the current library name and lists other recents in the menu", async () => {
    const user = userEvent.setup();
    render(<LibrarySwitcher />);
    const trigger = screen.getByRole("button", { name: /Main/ });
    await user.click(trigger);
    // Current library is not repeated in the switch list.
    expect(screen.getByText("Travel")).toBeInTheDocument();
    expect(screen.getByText("Switch Library…")).toBeInTheDocument();
    expect(screen.getByText("Reveal in Finder")).toBeInTheDocument();
  });
});
