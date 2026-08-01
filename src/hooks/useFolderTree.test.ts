import { describe, expect, it } from "vitest";
import { buildFolderTree, filterPhotosByQuery } from "./useFolderTree";
import type { Photo } from "../types";

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

describe("buildFolderTree", () => {
  it("groups photos by directory with recursive counts", () => {
    const tree = buildFolderTree([
      p("a", "/Pics/2020/a.jpg"),
      p("b", "/Pics/2020/b.jpg"),
      p("c", "/Pics/2021/c.jpg"),
      p("d", "/Pics/d.jpg"),
    ]);
    expect(tree.total).toBe(4);
    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0]!;
    expect(root.path).toBe("/Pics");
    expect(root.count).toBe(4);
    expect(root.children.map((c) => c.name)).toEqual(["2020", "2021"]);
    expect(root.children[0]!.count).toBe(2);
    expect(root.children[1]!.count).toBe(1);
  });

  it("collapses single-child chains with no direct photos", () => {
    const tree = buildFolderTree([
      p("a", "/Users/jb/Pictures/Trips/rome.jpg"),
      p("b", "/Users/jb/Pictures/Trips/paris.jpg"),
    ]);
    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0]!;
    expect(root.name).toBe("Users/jb/Pictures/Trips");
    expect(root.path).toBe("/Users/jb/Pictures/Trips");
    expect(root.children).toHaveLength(0);
    expect(root.count).toBe(2);
  });

  it("does not collapse through a dir that has direct photos", () => {
    const tree = buildFolderTree([
      p("a", "/Pics/x.jpg"),
      p("b", "/Pics/Sub/y.jpg"),
    ]);
    const root = tree.roots[0]!;
    expect(root.path).toBe("/Pics");
    expect(root.children.map((c) => c.name)).toEqual(["Sub"]);
  });

  it("supports multiple roots sorted by name", () => {
    const tree = buildFolderTree([
      p("a", "/Volumes/Ext/a.jpg"),
      p("b", "/Users/jb/b.jpg"),
    ]);
    expect(tree.roots.map((r) => r.name)).toEqual(["Users/jb", "Volumes/Ext"]);
  });

  it("sorts siblings case-insensitively", () => {
    const tree = buildFolderTree([
      p("a", "/Pics/zoo/a.jpg"),
      p("b", "/Pics/Alps/b.jpg"),
      p("c", "/Pics/misc/c.jpg"),
    ]);
    expect(tree.roots[0]!.children.map((c) => c.name)).toEqual([
      "Alps",
      "misc",
      "zoo",
    ]);
  });

  it("returns empty tree for no photos", () => {
    const tree = buildFolderTree([]);
    expect(tree.total).toBe(0);
    expect(tree.roots).toHaveLength(0);
  });
});

describe("filterPhotosByQuery", () => {
  const photos = [
    p("a", "/Pics/Trips/rome.jpg"),
    p("b", "/Pics/Trips/paris.jpg"),
    p("c", "/Pics/Family/rome-visit.jpg"),
    p("d", "/Backup/x.jpg"),
  ];

  it("empty or whitespace query returns all photos", () => {
    expect(filterPhotosByQuery(photos, "")).toHaveLength(4);
    expect(filterPhotosByQuery(photos, "   ")).toHaveLength(4);
  });

  it("matches file names case-insensitively", () => {
    expect(filterPhotosByQuery(photos, "ROME").map((x) => x.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("matches folder path segments", () => {
    expect(filterPhotosByQuery(photos, "trips").map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not match against the file name's folder for folder-only terms", () => {
    expect(filterPhotosByQuery(photos, "backup").map((x) => x.id)).toEqual([
      "d",
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterPhotosByQuery(photos, "zzz")).toHaveLength(0);
  });
});
