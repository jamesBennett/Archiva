import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type {
  Photo,
  ScanResult,
  RescanResult,
  Album,
  LibraryInfo,
  RecentLibraryInfo,
} from "../types";

export function scanFolder(path: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_folder", { path });
}

export function rescanFolders(): Promise<RescanResult> {
  return invoke<RescanResult>("rescan_folders");
}

export function listPhotos(): Promise<Photo[]> {
  return invoke<Photo[]>("list_photos");
}

export function generateThumbnail(photoId: string): Promise<void> {
  return invoke<void>("generate_thumbnail", { photoId });
}

export function generatePreview(photoId: string, maxPx: number): Promise<string> {
  return invoke<string>("generate_preview", { photoId, maxPx });
}

export function thumbUrl(thumbPath: string | null): string | null {
  if (!thumbPath) return null;
  return convertFileSrc(thumbPath);
}

export function listAlbums(): Promise<Album[]> {
  return invoke<Album[]>("list_albums");
}

export function createAlbum(name: string): Promise<Album> {
  return invoke<Album>("create_album", { name });
}

export function renameAlbum(id: string, name: string): Promise<void> {
  return invoke<void>("rename_album", { id, name });
}

export function deleteAlbum(id: string): Promise<void> {
  return invoke<void>("delete_album", { id });
}

export function reorderAlbums(orderedIds: string[]): Promise<void> {
  return invoke<void>("reorder_albums", { orderedIds });
}

export function listAlbumPhotos(albumId: string): Promise<string[]> {
  return invoke<string[]>("list_album_photos", { albumId });
}

export function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<number> {
  return invoke<number>("add_photos_to_album", { albumId, photoIds });
}

export function removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<number> {
  return invoke<number>("remove_photos_from_album", { albumId, photoIds });
}

export function listRecentLibraries(): Promise<RecentLibraryInfo[]> {
  return invoke<RecentLibraryInfo[]>("list_recent_libraries");
}

export function createLibrary(
  parentDir: string,
  name: string,
): Promise<LibraryInfo> {
  return invoke<LibraryInfo>("create_library", { parentDir, name });
}

export function openLibrary(path: string): Promise<LibraryInfo> {
  return invoke<LibraryInfo>("open_library", { path });
}

export function currentLibrary(): Promise<LibraryInfo | null> {
  return invoke<LibraryInfo | null>("current_library");
}

export function closeLibrary(): Promise<void> {
  return invoke<void>("close_library");
}

export function revealLibrary(): Promise<void> {
  return invoke<void>("reveal_library");
}
