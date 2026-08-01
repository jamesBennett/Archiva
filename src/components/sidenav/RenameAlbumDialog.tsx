import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Album } from "../../types";

interface Props {
  album: Album;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
}

export function RenameAlbumDialog({ album, onClose, onRename }: Props) {
  const [name, setName] = useState(album.name);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (trimmed === album.name) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onRename(album.id, trimmed);
      onClose();
    } catch (e) {
      console.error("rename album failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-white">
          <Dialog.Title className="text-sm font-semibold">Rename album</Dialog.Title>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="mt-3 w-full rounded border border-border bg-bg px-2 py-1 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1 text-sm hover:border-muted"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim() || busy}
                className="rounded bg-accent px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
