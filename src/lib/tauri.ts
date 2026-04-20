import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { Photo, ScanResult, Album } from "../types";

export function scanFolder(path: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_folder", { path });
}

export function listPhotos(): Promise<Photo[]> {
  return invoke<Photo[]>("list_photos");
}

export function generateThumbnail(photoId: string): Promise<void> {
  return invoke<void>("generate_thumbnail", { photoId });
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
