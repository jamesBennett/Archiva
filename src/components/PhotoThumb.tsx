import clsx from "clsx";
import { useDraggable } from "@dnd-kit/core";
import * as Checkbox from "@radix-ui/react-checkbox";
import type { Photo } from "../types";
import { thumbUrl } from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";

interface Props {
  photo: Photo;
  selected: boolean;
  onClick: () => void;
  selectedIds: Set<string>;
  onRemove?: () => void;
}

export function PhotoThumb({ photo, selected, onClick, selectedIds, onRemove }: Props) {
  const url = photo.thumb_ready ? thumbUrl(photo.thumb_path) : null;
  const toggleSelect = useLibraryStore((s) => s.toggleSelect);
  const hasSelection = selectedIds.size > 0;

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
    <div
      ref={draggable.setNodeRef}
      onClick={onClick}
      className={clsx(
        "group relative aspect-square overflow-hidden rounded-md bg-panel border transition-colors cursor-pointer",
        selected ? "border-accent" : "border-border hover:border-muted",
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

      <Checkbox.Root
        checked={selected}
        onCheckedChange={() => toggleSelect(photo.id)}
        aria-label={selected ? `Deselect ${photo.filename}` : `Select ${photo.filename}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity",
          selected
            ? "border-accent bg-accent"
            : "border-white/80 bg-black/40 hover:bg-black/60",
          hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Checkbox.Indicator>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3 w-3 text-white"
            aria-hidden
          >
            <path
              d="M3 8.5l3 3 7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Checkbox.Indicator>
      </Checkbox.Root>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${photo.filename} from album`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-black/50 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
