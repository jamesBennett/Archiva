import { useState } from "react";
import clsx from "clsx";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ask } from "@tauri-apps/plugin-dialog";
import type { Album } from "../../types";
import { useAlbums } from "../../hooks/useAlbums";
import { useLibraryStore } from "../../store/useLibraryStore";
import { RenameAlbumDialog } from "./RenameAlbumDialog";

interface Props {
  albums: Album[];
}

export function AlbumList({ albums }: Props) {
  const { rename, remove } = useAlbums();
  const [renameTarget, setRenameTarget] = useState<Album | null>(null);
  const ids = albums.map((a) => a.id);

  async function handleDelete(album: Album) {
    const ok = await ask(`Delete album "${album.name}"? Photos are not deleted.`, {
      title: "Delete Album",
      kind: "warning",
      okLabel: "Delete",
    });
    if (!ok) return;
    try {
      await remove(album.id);
    } catch (e) {
      console.error("delete album failed", e);
    }
  }

  return (
    <>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col">
          {albums.map((album) => (
            <AlbumRow
              key={album.id}
              album={album}
              onRename={setRenameTarget}
              onDelete={(a) => void handleDelete(a)}
            />
          ))}
        </ul>
      </SortableContext>
      {renameTarget && (
        <RenameAlbumDialog
          key={renameTarget.id}
          album={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={rename}
        />
      )}
    </>
  );
}

function AlbumRow({
  album,
  onRename,
  onDelete,
}: {
  album: Album;
  onRename: (album: Album) => void;
  onDelete: (album: Album) => void;
}) {
  const activeSource = useLibraryStore((s) => s.activeSource);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);

  const sortable = useSortable({ id: album.id, data: { kind: "album", albumId: album.id } });
  const isActive = activeSource.kind === "album" && activeSource.id === album.id;
  const isPhotoDragOver =
    sortable.isOver && sortable.active?.data.current?.kind === "photo";

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const { role: _role, ...liAttributes } = sortable.attributes;

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={clsx(
        "rounded",
        isPhotoDragOver && !isActive && "bg-panel-hover ring-1 ring-accent",
        sortable.isDragging && "opacity-60",
      )}
      {...liAttributes}
      {...sortable.listeners}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            onClick={() => setActiveSource({ kind: "album", id: album.id })}
            onPointerDown={(e) => e.stopPropagation()}
            className={clsx(
              "block w-full truncate rounded py-1 px-3 text-left text-sm",
              isActive ? "bg-accent text-white" : "hover:bg-panel-hover",
            )}
          >
            {album.name}
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-[150px] rounded-md border border-border bg-panel p-1 text-sm text-white shadow-lg"
          >
            <ContextMenu.Item
              onSelect={() => onRename(album)}
              className="cursor-default rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-hover"
            >
              Rename…
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={() => onDelete(album)}
              className="cursor-default rounded px-2 py-1 text-red-400 outline-none data-[highlighted]:bg-panel-hover"
            >
              Delete…
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}
