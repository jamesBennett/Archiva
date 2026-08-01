import { useMemo } from "react";
import type { FolderNode, FolderTree, Photo } from "../types";

interface TrieNode {
  name: string;
  path: string;
  directCount: number;
  children: Map<string, TrieNode>;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

export function buildFolderTree(photos: Photo[]): FolderTree {
  const rootChildren = new Map<string, TrieNode>();

  for (const photo of photos) {
    const dir = dirname(photo.path);
    const segments = dir.split("/").filter(Boolean);
    let children = rootChildren;
    let node: TrieNode | null = null;
    let path = "";
    for (const segment of segments) {
      path += `/${segment}`;
      let next = children.get(segment);
      if (!next) {
        next = { name: segment, path, directCount: 0, children: new Map() };
        children.set(segment, next);
      }
      node = next;
      children = next.children;
    }
    if (node) node.directCount += 1;
  }

  return { total: photos.length, roots: finalize(rootChildren) };
}

// Collapses chains of photo-less single-child dirs into one node so deep
// common prefixes ("/Users/x/Pictures") don't cost a click per segment.
function finalize(children: Map<string, TrieNode>): FolderNode[] {
  return Array.from(children.values())
    .map((node) => {
      let name = node.name;
      while (node.directCount === 0 && node.children.size === 1) {
        node = node.children.values().next().value!;
        name += `/${node.name}`;
      }
      const childNodes = finalize(node.children);
      const count =
        node.directCount + childNodes.reduce((sum, c) => sum + c.count, 0);
      return { name, path: node.path, count, children: childNodes };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// Matches when the folder path or the file name contains the query
// (case-insensitive). Empty/whitespace query matches everything.
export function filterPhotosByQuery(photos: Photo[], query: string): Photo[] {
  const q = query.trim().toLowerCase();
  if (!q) return photos;
  return photos.filter((p) => {
    if (p.filename.toLowerCase().includes(q)) return true;
    return dirname(p.path).toLowerCase().includes(q);
  });
}

export function useFolderTree(photos: Photo[], query = ""): FolderTree {
  return useMemo(
    () => buildFolderTree(filterPhotosByQuery(photos, query)),
    [photos, query],
  );
}
