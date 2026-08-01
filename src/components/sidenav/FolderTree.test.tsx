import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderTree } from "./FolderTree";
import { useLibraryStore } from "../../store/useLibraryStore";
import type { FolderTree as FolderTreeData } from "../../types";

const tree: FolderTreeData = {
  total: 3,
  roots: [
    {
      name: "Users/jb/Pictures",
      path: "/Users/jb/Pictures",
      count: 3,
      children: [
        { name: "2020", path: "/Users/jb/Pictures/2020", count: 2, children: [] },
        { name: "Trips", path: "/Users/jb/Pictures/Trips", count: 1, children: [] },
      ],
    },
  ],
};

describe("FolderTree", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      activeSource: { kind: "library" },
      expandedFolders: new Set<string>(),
    });
  });

  it("renders Library row and root folders", () => {
    render(<FolderTree tree={tree} />);
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Users/jb/Pictures")).toBeInTheDocument();
    expect(screen.queryByText("2020")).not.toBeInTheDocument();
  });

  it("clicking a folder sets activeSource to that folder", async () => {
    const user = userEvent.setup();
    render(<FolderTree tree={tree} />);
    await user.click(screen.getByText("Users/jb/Pictures"));
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "folder",
      path: "/Users/jb/Pictures",
    });
  });

  it("clicking the expand chevron shows children without selecting", async () => {
    const user = userEvent.setup();
    render(<FolderTree tree={tree} />);
    await user.click(
      screen.getByRole("button", { name: /expand users\/jb\/pictures/i }),
    );
    expect(
      useLibraryStore.getState().expandedFolders.has("/Users/jb/Pictures"),
    ).toBe(true);
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(useLibraryStore.getState().activeSource).toEqual({ kind: "library" });
  });

  it("clicking a child folder selects it", async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({
      expandedFolders: new Set(["/Users/jb/Pictures"]),
    });
    render(<FolderTree tree={tree} />);
    await user.click(screen.getByText("Trips"));
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "folder",
      path: "/Users/jb/Pictures/Trips",
    });
  });

  it("leaf folders render no expand chevron", () => {
    useLibraryStore.setState({
      expandedFolders: new Set(["/Users/jb/Pictures"]),
    });
    render(<FolderTree tree={tree} />);
    expect(
      screen.queryByRole("button", { name: /expand 2020/i }),
    ).not.toBeInTheDocument();
  });

  it("forceExpand shows children even when nothing is in expandedFolders", () => {
    render(<FolderTree tree={tree} forceExpand />);
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("forceExpand with empty tree shows No matches", () => {
    render(<FolderTree tree={{ total: 0, roots: [] }} forceExpand />);
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("empty tree without forceExpand shows no empty-state row", () => {
    render(<FolderTree tree={{ total: 0, roots: [] }} />);
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
  });
});
