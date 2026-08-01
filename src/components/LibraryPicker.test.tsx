import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryPicker } from "./LibraryPicker";
import type { RecentLibraryInfo } from "../types";

const recents: RecentLibraryInfo[] = [
  {
    uuid: "u1",
    name: "Main",
    path: "/Users/x/Pictures/Main.archivalib",
    last_opened: "2026-07-29T00:00:00Z",
    exists: true,
  },
  {
    uuid: "u2",
    name: "Gone",
    path: "/Volumes/ext/Gone.archivalib",
    last_opened: "2026-07-01T00:00:00Z",
    exists: false,
  },
];

const hookState: {
  error: string | null;
  createAt: (parentDir: string, name: string) => Promise<boolean>;
} = {
  error: null,
  createAt: () => Promise.resolve(true),
};

vi.mock("../hooks/useLibrary", () => ({
  useLibrary: () => ({
    current: null,
    loading: false,
    recents,
    error: hookState.error,
    refreshRecents: vi.fn(),
    openAt: vi.fn(),
    createAt: hookState.createAt,
    close: vi.fn(),
    reveal: vi.fn(),
  }),
}));

const openDialog = vi.fn<() => Promise<string | null>>();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialog(...(args as [])),
}));

describe("LibraryPicker", () => {
  beforeEach(() => {
    hookState.error = null;
    hookState.createAt = () => Promise.resolve(true);
    openDialog.mockReset();
  });

  it("renders recents; missing libraries are disabled", () => {
    render(<LibraryPicker />);
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Gone")).toBeInTheDocument();
    const gone = screen.getByText("Gone").closest("button");
    expect(gone).toBeDisabled();
  });

  it("offers New Library and Open Other actions", () => {
    render(<LibraryPicker />);
    expect(screen.getByText("New Library…")).toBeInTheDocument();
    expect(screen.getByText("Open Other…")).toBeInTheDocument();
  });

  async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText("New Library…"));
    await user.type(screen.getByPlaceholderText("Library name"), "Main");
    openDialog.mockResolvedValue("/Users/x/Pictures");
    await user.click(screen.getByText("Choose Location…"));
  }

  it("keeps the dialog open and shows the error when creation fails", async () => {
    const user = userEvent.setup();
    hookState.createAt = () => {
      hookState.error = "Library already exists";
      return Promise.resolve(false);
    };
    render(<LibraryPicker />);
    await openCreateDialog(user);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Library already exists"),
    );
    expect(screen.getByPlaceholderText("Library name")).toHaveValue("Main");
  });

  it("closes the dialog on successful creation", async () => {
    const user = userEvent.setup();
    render(<LibraryPicker />);
    await openCreateDialog(user);

    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Library name")).not.toBeInTheDocument(),
    );
  });
});
