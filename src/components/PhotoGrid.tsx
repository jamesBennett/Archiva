import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "../types";
import { useLibraryStore } from "../store/useLibraryStore";
import { PhotoThumb } from "./PhotoThumb";

interface Props {
  photos: Photo[];
  onRemoveFromAlbum?: (photoId: string) => void;
}

const THUMB_MIN = 160;
const GAP = 8;

export function PhotoGrid({ photos, onRemoveFromAlbum }: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const selectedIds = useLibraryStore((s) => s.selectedIds);
  const selectPhoto = useLibraryStore((s) => s.selectPhoto);
  const setLiveScrollTop = useLibraryStore((s) => s.setLiveScrollTop);
  const pendingScrollTop = useLibraryStore((s) => s.pendingScrollTop);
  const consumePendingScrollTop = useLibraryStore((s) => s.consumePendingScrollTop);
  const activePhotoId = useLibraryStore((s) => s.activePhotoId);
  const scrollToActivePending = useLibraryStore((s) => s.scrollToActivePending);
  const consumeScrollToActive = useLibraryStore((s) => s.consumeScrollToActive);

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

  useEffect(() => {
    if (pendingScrollTop == null) return;
    const el = parentRef.current;
    if (el) el.scrollTop = pendingScrollTop;
    consumePendingScrollTop();
  }, [pendingScrollTop, consumePendingScrollTop]);

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

  const rows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!scrollToActivePending || !activePhotoId || columns === 0) return;
    const idx = photos.findIndex((p) => p.id === activePhotoId);
    if (idx < 0) {
      consumeScrollToActive();
      return;
    }
    const row = Math.floor(idx / columns);
    rowVirtualizer.scrollToIndex(row, { align: "center" });
    consumeScrollToActive();
  }, [scrollToActivePending, activePhotoId, columns, photos, rowVirtualizer, consumeScrollToActive]);

  return (
    <div
      ref={parentRef}
      onScroll={(e) => setLiveScrollTop(e.currentTarget.scrollTop)}
      className="h-full w-full overflow-auto p-2"
    >
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
                  selectedIds={selectedIds}
                  onRemove={onRemoveFromAlbum ? () => onRemoveFromAlbum(photo.id) : undefined}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
