import { describe, expect, it } from "vitest";
import { buildDateTree } from "./useDateTree";
import type { Photo } from "../types";

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

describe("buildDateTree", () => {
  it("groups by UTC year and month, sorted descending", () => {
    const tree = buildDateTree([
      p("a", "2019-01-15T10:00:00Z"),
      p("b", "2019-01-20T10:00:00Z"),
      p("c", "2019-03-01T10:00:00Z"),
      p("d", "2020-06-10T10:00:00Z"),
    ]);
    expect(tree.total).toBe(4);
    expect(tree.noDateCount).toBe(0);
    expect(tree.years.map((y) => y.year)).toEqual([2020, 2019]);
    const y2019 = tree.years.find((y) => y.year === 2019)!;
    expect(y2019.count).toBe(3);
    expect(y2019.months.map((m) => m.month)).toEqual([3, 1]);
    expect(y2019.months.find((m) => m.month === 1)!.count).toBe(2);
  });

  it("falls back to modified_at when created_at is null", () => {
    const tree = buildDateTree([p("a", null, "2018-07-01T00:00:00Z")]);
    expect(tree.years).toHaveLength(1);
    expect(tree.years[0]!.year).toBe(2018);
    expect(tree.years[0]!.months[0]!.month).toBe(7);
  });

  it("counts photos with no date and no modified into noDateCount", () => {
    const tree = buildDateTree([p("a", null, null), p("b", null, null)]);
    expect(tree.noDateCount).toBe(2);
    expect(tree.years).toHaveLength(0);
    expect(tree.total).toBe(2);
  });

  it("treats invalid date strings as no-date", () => {
    const tree = buildDateTree([p("a", "not-a-date", null)]);
    expect(tree.noDateCount).toBe(1);
  });

  it("is UTC-invariant (2020-01-01T00:00Z stays in 2020)", () => {
    const tree = buildDateTree([p("a", "2020-01-01T00:00:00Z")]);
    expect(tree.years[0]!.year).toBe(2020);
    expect(tree.years[0]!.months[0]!.month).toBe(1);
  });
});
