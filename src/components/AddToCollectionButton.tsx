import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAlbums } from "../hooks/useAlbums";
import { useLibraryStore } from "../store/useLibraryStore";

export function AddToCollectionButton() {
  const selectedIds = useLibraryStore((s) => s.selectedIds);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const { albums, addPhotos, create } = useAlbums();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  if (selectedIds.size === 0) return null;

  const trimmed = query.trim();
  const filtered = albums.filter((a) =>
    a.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const hasExactMatch = albums.some(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = trimmed.length > 0 && !hasExactMatch;

  async function addToAlbum(albumId: string) {
    const ids = Array.from(selectedIds);
    await addPhotos(albumId, ids).catch((e) => console.error("add failed", e));
    setOpen(false);
    setQuery("");
    clearSelection();
  }

  async function createAndAdd() {
    const ids = Array.from(selectedIds);
    try {
      const album = await create(trimmed);
      await addPhotos(album.id, ids);
    } catch (e) {
      console.error("create+add failed", e);
      return;
    }
    setOpen(false);
    setQuery("");
    clearSelection();
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white hover:border-muted"
        >
          Add to Collection ({selectedIds.size})
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-white">
          <Dialog.Title className="text-sm font-semibold">Add to album</Dialog.Title>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter or create album…"
            className="mt-3 w-full rounded border border-border bg-bg px-2 py-1 text-sm"
          />
          <ul className="mt-3 max-h-64 overflow-auto">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => void addToAlbum(a.id)}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-panel-hover"
                >
                  {a.name}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button
                  type="button"
                  onClick={() => void createAndAdd()}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-accent hover:bg-panel-hover"
                >
                  + Create "{trimmed}"
                </button>
              </li>
            )}
            {filtered.length === 0 && !showCreate && (
              <li className="px-2 py-1 text-sm text-muted">No albums</li>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
