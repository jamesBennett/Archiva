import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FoldersSection } from "./FoldersSection";
import { useLibraryStore } from "../../store/useLibraryStore";
import type { Photo } from "../../types";

function p(id: string, path: string): Photo {
  return {
    id,
    path,
    filename: path.slice(path.lastIndexOf("/") + 1),
    ext: "jpg",
    size_bytes: 1,
    width: null,
    height: null,
    created_at: null,
    modified_at: null,
    imported_at: "2026-04-19T00:00:00Z",
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
    thumb_path: null,
    thumb_ready: 0,
  };
}

describe("FoldersSection", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      photos: [
        p("a", "/Pics/Trips/rome.jpg"),
        p("b", "/Pics/Family/kids.jpg"),
      ],
      activeSource: { kind: "library" },
      foldersTab: "date",
      expandedFolders: new Set<string>(),
    });
  });

  it("shows By Year tab by default and switches to By Folder", async () => {
    const user = userEvent.setup();
    render(<FoldersSection />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "By Folder" }));
    expect(useLibraryStore.getState().foldersTab).toBe("folder");
    expect(screen.getByText("Pics")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("search filters the folder tree by file name and expands matches", async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({ foldersTab: "folder" });
    render(<FoldersSection />);
    await user.type(screen.getByRole("searchbox"), "rome");
    expect(screen.getByText("Pics/Trips")).toBeInTheDocument();
    expect(screen.queryByText("Family")).not.toBeInTheDocument();
  });

  it("search matching a folder name keeps that branch", async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({ foldersTab: "folder" });
    render(<FoldersSection />);
    await user.type(screen.getByRole("searchbox"), "family");
    expect(screen.getByText("Pics/Family")).toBeInTheDocument();
    expect(screen.queryByText(/Trips/)).not.toBeInTheDocument();
  });

  it("search with no hits shows No matches", async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({ foldersTab: "folder" });
    render(<FoldersSection />);
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("Escape clears the query", async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({ foldersTab: "folder" });
    render(<FoldersSection />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "rome");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(screen.getByText("Pics")).toBeInTheDocument();
    expect(screen.queryByText("Family")).not.toBeInTheDocument();
  });
});
