import clsx from "clsx";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
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

  const sortable = useSortable({ id: album.id, data: { kind: "album" } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${album.id}`,
    data: { kind: "album-drop", albumId: album.id },
  });

  const isActive = activeSource.kind === "album" && activeSource.id === album.id;

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  // Spread sortable attributes but omit `role` — the <li> must not be
  // role="button" because there's already a <button> child; having both
  // causes testing-library to find duplicate elements with that role.
  const { role: _role, ...liAttributes } = sortable.attributes;

  return (
    <li
      ref={(node) => {
        sortable.setNodeRef(node);
        setDropRef(node);
      }}
      style={style}
      className={clsx(
        "rounded",
        isOver && !isActive && "bg-panel-hover",
        sortable.isDragging && "opacity-60",
      )}
      {...liAttributes}
      {...sortable.listeners}
    >
      <button
        type="button"
        onClick={() => setActiveSource({ kind: "album", id: album.id })}
        // Stop pointer events from bubbling to the <li> dnd-kit listeners so
        // that a click is not intercepted as a drag attempt.
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
