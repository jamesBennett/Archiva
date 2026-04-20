import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAlbums } from "../hooks/useAlbums";
import { useLibraryStore } from "../store/useLibraryStore";

export function AddToCollectionButton() {
  const selectedIds = useLibraryStore((s) => s.selectedIds);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const { albums, addPhotos } = useAlbums();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const disabled = selectedIds.size === 0;

  const filtered = albums.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()),
  );

  async function choose(albumId: string) {
    const ids = Array.from(selectedIds);
    await addPhotos(albumId, ids).catch((e) => console.error("add failed", e));
    setOpen(false);
    setQuery("");
    clearSelection();
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white hover:border-muted disabled:opacity-50"
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
            placeholder="Filter albums…"
            className="mt-3 w-full rounded border border-border bg-bg px-2 py-1 text-sm"
          />
          <ul className="mt-3 max-h-64 overflow-auto">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => void choose(a.id)}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-panel-hover"
                >
                  {a.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-1 text-sm text-muted">No albums</li>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
