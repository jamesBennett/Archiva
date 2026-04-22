import { describe, expect, it } from "vitest";
import { filterPhotos } from "./useVisiblePhotos";
import type { ActiveSource, Photo } from "../types";

function p(id: string, created: string | null, modified: string | null = null): Photo {
  return {
    id,
    path: `/p/${id}`,
    filename: `${id}.jpg`,
    ext: "jpg",
    size_bytes: 1,
    width: null,
    height: null,
    created_at: created,
    modified_at: modified,
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

const photos: Photo[] = [
  p("a", "2019-01-10T00:00:00Z"),
  p("b", "2019-03-10T00:00:00Z"),
  p("c", "2020-07-10T00:00:00Z"),
  p("d", null, null),
];

function run(src: ActiveSource, map = new Map<string, Set<string>>()) {
  return filterPhotos(photos, src, map).map((x) => x.id);
}

describe("filterPhotos", () => {
  it("library returns all photos", () => {
    expect(run({ kind: "library" })).toEqual(["a", "b", "c", "d"]);
  });

  it("date by year only returns all months in that year", () => {
    expect(run({ kind: "date", year: 2019 })).toEqual(["a", "b"]);
  });

  it("date by year and month narrows further", () => {
    expect(run({ kind: "date", year: 2019, month: 3 })).toEqual(["b"]);
  });

  it("no-date returns only photos missing both created_at and modified_at", () => {
    expect(run({ kind: "no-date" })).toEqual(["d"]);
  });

  it("album returns photos whose ids are in the album cache", () => {
    const map = new Map<string, Set<string>>([["alb-1", new Set(["a", "c"])]]);
    expect(run({ kind: "album", id: "alb-1" }, map)).toEqual(["a", "c"]);
  });

  it("album returns empty when cache is missing the album", () => {
    expect(run({ kind: "album", id: "alb-missing" })).toEqual([]);
  });
});
