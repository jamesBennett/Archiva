export interface Photo {
  id: string;
  path: string;
  filename: string;
  ext: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string | null;
  modified_at: string | null;
  imported_at: string;
  camera_make: string | null;
  camera_model: string | null;
  lens_model: string | null;
  focal_length: number | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  rating: number;
  flag: number;
  color_label: string | null;
  is_favorite: number;
  thumb_path: string | null;
  thumb_ready: number;
}

export interface ScanResult {
  inserted: number;
  skipped: number;
  photo_ids: string[];
}

export interface Album {
  id: string;
  name: string;
  description: string | null;
  cover_photo_id: string | null;
  is_smart: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ActiveSource =
  | { kind: "library" }
  | { kind: "date"; year: number; month?: number }
  | { kind: "album"; id: string }
  | { kind: "no-date" };

export interface MonthNode {
  month: number; // 1-12
  count: number;
}

export interface YearNode {
  year: number;
  count: number;
  months: MonthNode[]; // desc
}

export interface DateTree {
  total: number;
  years: YearNode[]; // desc
  noDateCount: number;
}
