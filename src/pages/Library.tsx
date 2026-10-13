import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { AddToCollectionButton } from "../components/AddToCollectionButton";
import { MetadataPanel } from "../components/MetadataPanel";
import { PhotoGrid } from "../components/PhotoGrid";
import { SettingsMenu } from "../components/SettingsMenu";
import { SinglePhotoView } from "../components/SinglePhotoView";
import { SideNav } from "../components/sidenav/SideNav";
import { useAlbums } from "../hooks/useAlbums";
import { usePhotos } from "../hooks/usePhotos";
import { useVisiblePhotos } from "../hooks/useVisiblePhotos";
import { useLibraryStore } from "../store/useLibraryStore";
import { thumbUrl } from "../lib/tauri";

export function Library() {
  const { loading, error, scan, rescan } = usePhotos();
  const photos = useLibraryStore((s) => s.photos);
  const libraryName = useLibraryStore((s) => s.currentLibrary?.name);
  const activePhotoId = useLibraryStore((s) => s.activePhotoId);
  const activeSource = useLibraryStore((s) => s.activeSource);
  const historyBack = useLibraryStore((s) => s.historyBack);
  const historyForward = useLibraryStore((s) => s.historyForward);
  const canBack = useLibraryStore((s) => s.historyIndex > 0);
  const canForward = useLibraryStore(
    (s) => s.historyIndex < s.history.length - 1,
  );
  const viewMode = useLibraryStore((s) => s.viewMode);
  const exitSingle = useLibraryStore((s) => s.exitSingle);
  const { albums, reorder, addPhotos, removePhotos } = useAlbums();
  const onRemoveFromAlbum =
    activeSource.kind === "album"
      ? (photoId: string) => {
          void removePhotos(activeSource.id, [photoId]).catch((e) =>
            console.error("remove failed", e),
          );
        }
      : undefined;

  const visible = useVisiblePhotos();

  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  async function handleRescan() {
    try {
      const r = await rescan();
      const added = r.inserted === 0 ? "No new photos" : `Added ${r.inserted} photo${r.inserted === 1 ? "" : "s"}`;
      const missing = r.missing.length > 0 ? ` · ${r.missing.length} folder${r.missing.length === 1 ? "" : "s"} not found` : "";
      setNotice(added + missing);
    } catch {
      // surfaced via `error`
    }
  }

  async function handleAddFolder(path: string) {
    try {
      const r = await scan(path);
      setNotice(`Added ${r.inserted} photo${r.inserted === 1 ? "" : "s"}`);
    } catch {
      // surfaced via `error`
    }
  }

  useEffect(() => {
    if (viewMode !== "single") return;
    if (activePhotoId == null) return;
    if (!visible.some((p) => p.id === activePhotoId)) {
      exitSingle();
    }
  }, [viewMode, activePhotoId, visible, exitSingle]);
  const activePhoto = useMemo(
    () => photos.find((p) => p.id === activePhotoId) ?? null,
    [photos, activePhotoId],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [dragPreview, setDragPreview] = useState<
    { kind: "photo"; url: string | null; count: number } | { kind: "album"; name: string } | null
  >(null);

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current;
    if (data?.kind === "photo") {
      const photo = photos.find((p) => p.id === data.photoId);
      const count = Array.isArray(data.selectedIds) ? data.selectedIds.length : 1;
      setDragPreview({
        kind: "photo",
        url: photo?.thumb_ready ? thumbUrl(photo.thumb_path) : null,
        count,
      });
    } else if (data?.kind === "album") {
      const album = albums.find((a) => a.id === data.albumId);
      setDragPreview({ kind: "album", name: album?.name ?? "" });
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDragPreview(null);
    const { active, over } = e;
    if (!over) return;
    const activeKind = active.data.current?.kind;

    if (activeKind === "photo") {
      const albumId = over.id as string;
      if (!albums.some((a) => a.id === albumId)) return;
      const selectedIds = (active.data.current?.selectedIds as string[] | undefined) ?? [];
      if (selectedIds.length === 0) return;
      await addPhotos(albumId, selectedIds).catch((err) =>
        console.error("add photos failed", err),
      );
      return;
    }

    if (activeKind === "album") {
      if (active.id === over.id) return;
      const oldIndex = albums.findIndex((a) => a.id === active.id);
      const newIndex = albums.findIndex((a) => a.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextIds = arrayMove(albums, oldIndex, newIndex).map((a) => a.id);
      await reorder(nextIds).catch((err) => console.error("reorder failed", err));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={() => setDragPreview(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-screen w-screen flex-col bg-bg text-white">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Archiva</h1>
            {libraryName && <span className="text-sm text-muted">{libraryName}</span>}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Back"
                onClick={historyBack}
                disabled={!canBack}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-panel-hover hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="10 3 5 8 10 13" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Forward"
                onClick={historyForward}
                disabled={!canForward}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-panel-hover hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 3 11 8 6 13" />
                </svg>
              </button>
            </div>
            <span className="text-xs text-muted">{visible.length} photos</span>
            {loading && <span className="text-xs text-muted">Loading…</span>}
            {!loading && notice && <span className="text-xs text-muted">{notice}</span>}
          </div>
          <div className="flex items-center gap-2">
            <AddToCollectionButton />
            <SettingsMenu
              onRescan={() => void handleRescan()}
              onAddFolder={(p) => void handleAddFolder(p)}
              busy={loading}
            />
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
            ) : viewMode === "single" && activePhotoId ? (
              <SinglePhotoView photos={visible} activePhotoId={activePhotoId} />
            ) : (
              <PhotoGrid photos={visible} onRemoveFromAlbum={onRemoveFromAlbum} />
            )}
          </main>
          <aside className="w-72 shrink-0 border-l border-border bg-panel">
            <MetadataPanel photo={activePhoto} />
          </aside>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragPreview?.kind === "photo" ? (
          <div className="relative h-20 w-20 overflow-hidden rounded-md border-2 border-accent bg-panel shadow-lg">
            {dragPreview.url ? (
              <img src={dragPreview.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted">…</div>
            )}
            {dragPreview.count > 1 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-white">
                {dragPreview.count}
              </span>
            )}
          </div>
        ) : dragPreview?.kind === "album" ? (
          <div className="rounded border border-accent bg-panel px-3 py-1 text-sm text-white shadow-lg">
            {dragPreview.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
