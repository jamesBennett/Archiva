import clsx from "clsx";
import type { Photo } from "../types";
import { thumbUrl } from "../lib/tauri";

interface Props {
  photo: Photo;
  selected: boolean;
  onClick: () => void;
}

export function PhotoThumb({ photo, selected, onClick }: Props) {
  const url = photo.thumb_ready ? thumbUrl(photo.thumb_path) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group relative aspect-square overflow-hidden rounded-md bg-panel border transition-colors",
        selected ? "border-white" : "border-border hover:border-muted",
      )}
      title={photo.filename}
    >
      {url ? (
        <img
          src={url}
          alt={photo.filename}
          loading="lazy"
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
