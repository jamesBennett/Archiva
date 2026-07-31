import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

vi.mock("../hooks/useLibrary", () => ({
  useLibrary: () => ({
    current: null,
    loading: false,
    recents,
    error: null,
    refreshRecents: vi.fn(),
    openAt: vi.fn(),
    createAt: vi.fn(),
    close: vi.fn(),
    reveal: vi.fn(),
  }),
}));

describe("LibraryPicker", () => {
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
});
