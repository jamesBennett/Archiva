import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { Photo, ScanResult } from "../types";

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
