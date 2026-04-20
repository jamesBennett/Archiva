import { useMemo } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { FolderPicker } from "../components/FolderPicker";
import { MetadataPanel } from "../components/MetadataPanel";
import { PhotoGrid } from "../components/PhotoGrid";
import { SideNav } from "../components/sidenav/SideNav";
import { useAlbums } from "../hooks/useAlbums";
import { usePhotos } from "../hooks/usePhotos";
import { useVisiblePhotos } from "../hooks/useVisiblePhotos";
import { useLibraryStore } from "../store/useLibraryStore";

export function Library() {
  const { loading, error, scan, refresh } = usePhotos();
  const photos = useLibraryStore((s) => s.photos);
  const activePhotoId = useLibraryStore((s) => s.activePhotoId);
  const { albums, reorder, addPhotos } = useAlbums();

  const visible = useVisiblePhotos();
  const activePhoto = useMemo(
    () => photos.find((p) => p.id === activePhotoId) ?? null,
    [photos, activePhotoId],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeKind = active.data.current?.kind;
    const overData = over.data.current;

    if (activeKind === "album" && overData?.kind !== "album-drop") {
      if (active.id === over.id) return;
      const oldIndex = albums.findIndex((a) => a.id === active.id);
      const newIndex = albums.findIndex((a) => a.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextIds = arrayMove(albums, oldIndex, newIndex).map((a) => a.id);
      await reorder(nextIds).catch((err) => console.error("reorder failed", err));
      return;
    }

    if (activeKind === "photo" && overData?.kind === "album-drop") {
      const selectedIds = (active.data.current?.selectedIds as string[] | undefined) ?? [];
      if (selectedIds.length === 0) return;
      await addPhotos(overData.albumId as string, selectedIds).catch((err) =>
        console.error("add photos failed", err),
      );
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex h-screen w-screen flex-col bg-bg text-white">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Archiva</h1>
            <span className="text-xs text-muted">{visible.length} photos</span>
            {loading && <span className="text-xs text-muted">Loading…</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white hover:border-muted"
            >
              Refresh
            </button>
            <FolderPicker onScan={async (p) => { await scan(p); }} disabled={loading} />
          </div>
        </header>

        {error && (
          <div className="border-b border-border bg-panel px-4 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <SideNav />
          <main className="min-w-0 flex-1">
            {visible.length === 0 && !loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                No photos in this view.
              </div>
            ) : (
              <PhotoGrid photos={visible} />
            )}
          </main>
          <aside className="w-72 shrink-0 border-l border-border bg-panel">
            <MetadataPanel photo={activePhoto} />
          </aside>
        </div>
      </div>
    </DndContext>
  );
}
