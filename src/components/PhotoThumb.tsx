import clsx from "clsx";
import { useDraggable } from "@dnd-kit/core";
import type { Photo } from "../types";
import { thumbUrl } from "../lib/tauri";

interface Props {
  photo: Photo;
  selected: boolean;
  onClick: () => void;
  selectedIds: Set<string>;
}

export function PhotoThumb({ photo, selected, onClick, selectedIds }: Props) {
  const url = photo.thumb_ready ? thumbUrl(photo.thumb_path) : null;

  const draggable = useDraggable({
    id: `photo:${photo.id}`,
    data: {
      kind: "photo",
      photoId: photo.id,
      selectedIds:
        selected && selectedIds.size > 1 ? Array.from(selectedIds) : [photo.id],
    },
  });

  return (
    <button
      ref={draggable.setNodeRef}
      type="button"
      onClick={onClick}
      className={clsx(
        "group relative aspect-square overflow-hidden rounded-md bg-panel border transition-colors",
        selected ? "border-white" : "border-border hover:border-muted",
        draggable.isDragging && "opacity-50",
      )}
      title={photo.filename}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      {url ? (
        <img
          src={url}
          alt={photo.filename}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted">
          …
        </div>
      )}
    </button>
  );
}
