import { useMemo } from "react";
import type { DateTree, MonthNode, Photo, YearNode } from "../types";

export function buildDateTree(photos: Photo[]): DateTree {
  const byYear = new Map<number, Map<number, number>>();
  let noDateCount = 0;

  for (const photo of photos) {
    const iso = photo.created_at ?? photo.modified_at;
    if (!iso) {
      noDateCount += 1;
      continue;
    }
    const d = new Date(iso);
    const time = d.getTime();
    if (!Number.isFinite(time)) {
      noDateCount += 1;
      continue;
    }
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const months = byYear.get(year) ?? new Map<number, number>();
    months.set(month, (months.get(month) ?? 0) + 1);
    byYear.set(year, months);
  }

  const years: YearNode[] = Array.from(byYear.entries())
    .map(([year, months]) => {
      const monthNodes: MonthNode[] = Array.from(months.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => b.month - a.month);
      const count = monthNodes.reduce((sum, m) => sum + m.count, 0);
      return { year, count, months: monthNodes };
    })
    .sort((a, b) => b.year - a.year);

  return { total: photos.length, years, noDateCount };
}

export function useDateTree(photos: Photo[]): DateTree {
  return useMemo(() => buildDateTree(photos), [photos]);
}
