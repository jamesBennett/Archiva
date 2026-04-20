import clsx from "clsx";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Album } from "../../types";
import { useLibraryStore } from "../../store/useLibraryStore";

interface Props {
  albums: Album[];
}

export function AlbumList({ albums }: Props) {
  const ids = albums.map((a) => a.id);
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <ul className="flex flex-col">
        {albums.map((album) => (
          <AlbumRow key={album.id} album={album} />
        ))}
      </ul>
    </SortableContext>
  );
}

function AlbumRow({ album }: { album: Album }) {
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
    </li>
  );
}
