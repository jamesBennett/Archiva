import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

interface Props {
  onScan: (path: string) => Promise<void>;
  disabled?: boolean;
}

export function FolderPicker({ onScan, disabled }: Props) {
  const [busy, setBusy] = useState(false);

  async function pick() {
    const chosen = await open({ directory: true, multiple: false });
    if (typeof chosen !== "string") return;
    setBusy(true);
    try {
      await onScan(chosen);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={pick}
      disabled={disabled || busy}
      className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white hover:border-muted disabled:opacity-50"
    >
      {busy ? "Scanning…" : "Add folder"}
    </button>
  );
}
