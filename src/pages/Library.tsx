import { useMemo } from "react";
import { FolderPicker } from "../components/FolderPicker";
import { MetadataPanel } from "../components/MetadataPanel";
import { PhotoGrid } from "../components/PhotoGrid";
import { usePhotos } from "../hooks/usePhotos";
import { useLibraryStore } from "../store/useLibraryStore";

export function Library() {
  const { photos, loading, error, scan, refresh } = usePhotos();
  const activePhotoId = useLibraryStore((s) => s.activePhotoId);

  const activePhoto = useMemo(
    () => photos.find((p) => p.id === activePhotoId) ?? null,
    [photos, activePhotoId],
  );

  async function handleScan(path: string) {
    await scan(path);
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-white">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Archiva</h1>
          <span className="text-xs text-muted">{photos.length} photos</span>
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
          <FolderPicker onScan={handleScan} disabled={loading} />
        </div>
      </header>

      {error && (
        <div className="border-b border-border bg-panel px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {photos.length === 0 && !loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No photos yet — add a folder to start.
            </div>
          ) : (
            <PhotoGrid photos={photos} />
          )}
        </main>
        <aside className="w-72 shrink-0 border-l border-border bg-panel">
          <MetadataPanel photo={activePhoto} />
        </aside>
      </div>
    </div>
  );
}
