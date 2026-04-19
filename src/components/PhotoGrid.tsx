import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Photo } from "../types";
import { useLibraryStore } from "../store/useLibraryStore";
import { PhotoThumb } from "./PhotoThumb";

interface Props {
  photos: Photo[];
}

const THUMB_MIN = 160;
const GAP = 8;

export function PhotoGrid({ photos }: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const selectedIds = useLibraryStore((s) => s.selectedIds);
  const selectPhoto = useLibraryStore((s) => s.selectPhoto);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const columns = Math.max(1, Math.floor((width + GAP) / (THUMB_MIN + GAP)));
  const cellSize = columns > 0 ? (width - GAP * (columns - 1)) / columns : THUMB_MIN;
  const rowHeight = cellSize + GAP;
  const rowCount = Math.ceil(photos.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  const rows = useMemo(() => rowVirtualizer.getVirtualItems(), [rowVirtualizer, rowCount, rowHeight]);

  return (
    <div ref={parentRef} className="h-full w-full overflow-auto p-2">
      <div
        style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
      >
        {rows.map((virtualRow) => {
          const start = virtualRow.index * columns;
          const end = Math.min(start + columns, photos.length);
          const rowPhotos = photos.slice(start, end);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                height: rowHeight,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GAP,
              }}
            >
              {rowPhotos.map((photo) => (
                <PhotoThumb
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.has(photo.id)}
                  onClick={() => selectPhoto(photo.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
