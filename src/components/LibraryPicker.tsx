import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useLibrary } from "../hooks/useLibrary";

export function LibraryPicker() {
  const { recents, error, openAt, createAt } = useLibrary();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  async function handleOpenOther() {
    // Directory mode: the UTI is only registered in the bundled app, so in
    // dev the bundle is a plain folder. Backend validates meta.json.
    const chosen = await open({ directory: true, multiple: false });
    if (typeof chosen !== "string") return;
    await openAt(chosen);
  }

  async function handleCreate() {
    const parent = await open({ directory: true, multiple: false });
    if (typeof parent !== "string") return;
    setBusy(true);
    setCreateFailed(false);
    try {
      // Only tear down the dialog on success — otherwise the error would render
      // behind the modal with no way back to the entered name.
      const ok = await createAt(parent, name.trim());
      setCreateFailed(!ok);
      if (ok) {
        setNewOpen(false);
        setName("");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleNewOpenChange(open: boolean) {
    setNewOpen(open);
    if (!open) setCreateFailed(false);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg text-white">
      <div className="w-[28rem] rounded-lg border border-border bg-panel p-6">
        <h1 className="mb-1 text-lg font-semibold">Archiva</h1>
        <p className="mb-4 text-sm text-muted">Choose a library</p>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto">
          {recents.map((r) => (
            <li key={r.uuid}>
              <button
                type="button"
                disabled={!r.exists}
                onClick={() => void openAt(r.path)}
                className="w-full rounded-md border border-border px-3 py-2 text-left hover:border-muted disabled:opacity-40"
                title={r.path}
              >
                <span className="block text-sm">{r.name}</span>
                <span className="block truncate text-xs text-muted">
                  {r.exists ? r.path : `${r.path} (missing)`}
                </span>
              </button>
            </li>
          ))}
          {recents.length === 0 && (
            <li className="py-4 text-center text-sm text-muted">
              No recent libraries
            </li>
          )}
        </ul>

        <div className="flex gap-2">
          <Dialog.Root open={newOpen} onOpenChange={handleNewOpenChange}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:border-muted"
              >
                New Library…
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/60" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-panel p-5">
                <Dialog.Title className="mb-3 text-sm font-semibold">
                  New Library
                </Dialog.Title>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Library name"
                  className="mb-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-muted"
                />
                {createFailed && (
                  <p role="alert" className="mb-3 text-xs text-red-400">
                    {error ?? "Could not create library"}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={name.trim().length === 0 || busy}
                    onClick={() => void handleCreate()}
                    className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {busy ? "Creating…" : "Choose Location…"}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <button
            type="button"
            onClick={() => void handleOpenOther()}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:border-muted"
          >
            Open Other…
          </button>
        </div>
      </div>
    </div>
  );
}
