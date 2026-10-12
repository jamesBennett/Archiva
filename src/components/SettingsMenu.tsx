import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibrary } from "../hooks/useLibrary";

interface Props {
  onRescan: () => void;
  onAddFolder: (path: string) => void;
  busy: boolean;
}

const itemClass =
  "cursor-default rounded px-2 py-1.5 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-bg";
const contentClass =
  "min-w-56 rounded-md border border-border bg-panel p-1 text-sm text-white shadow-lg";

export function SettingsMenu({ onRescan, onAddFolder, busy }: Props) {
  const { current, recents, openAt, close, reveal } = useLibrary();
  const others = recents.filter((r) => r.uuid !== current?.uuid && r.exists);

  async function pickFolder() {
    const chosen = await open({ directory: true, multiple: false });
    if (typeof chosen === "string") onAddFolder(chosen);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-hover hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={contentClass}>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={`${itemClass} flex items-center justify-between`}>
              Switch Library <span className="text-muted">›</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={contentClass}>
                {others.map((r) => (
                  <DropdownMenu.Item
                    key={r.uuid}
                    onSelect={() => void openAt(r.path)}
                    className={itemClass}
                  >
                    {r.name}
                  </DropdownMenu.Item>
                ))}
                {others.length > 0 && (
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                )}
                <DropdownMenu.Item onSelect={() => void close()} className={itemClass}>
                  Other Library…
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => void reveal()} className={itemClass}>
                  Reveal in Finder
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Item onSelect={onRescan} disabled={busy} className={itemClass}>
            Rescan Images
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => void pickFolder()} disabled={busy} className={itemClass}>
            Add Folder…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
