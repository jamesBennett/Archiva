import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAlbums } from "../../hooks/useAlbums";
import { useLibraryStore } from "../../store/useLibraryStore";

export function NewAlbumButton() {
  const { create } = useAlbums();
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const album = await create(trimmed);
      setActiveSource({ kind: "album", id: album.id });
      setOpen(false);
      setName("");
    } catch (e) {
      console.error("create album failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="New album"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-panel-hover hover:text-white"
        >
          <span className="text-base leading-none">+</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-white">
          <Dialog.Title className="text-sm font-semibold">New album</Dialog.Title>
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
              placeholder="Album name"
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
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
