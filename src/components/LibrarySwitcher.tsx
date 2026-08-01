import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useLibrary } from "../hooks/useLibrary";

export function LibrarySwitcher() {
  const { current, recents, openAt, close, reveal } = useLibrary();

  if (!current) return null;
  const others = recents.filter((r) => r.uuid !== current.uuid && r.exists);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white hover:border-muted"
          title={current.path}
        >
          {current.name} ▾
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="min-w-56 rounded-md border border-border bg-panel p-1 text-sm text-white shadow-lg"
        >
          {others.map((r) => (
            <DropdownMenu.Item
              key={r.uuid}
              onSelect={() => void openAt(r.path)}
              className="cursor-default rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
            >
              {r.name}
            </DropdownMenu.Item>
          ))}
          {others.length > 0 && (
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
          )}
          <DropdownMenu.Item
            onSelect={() => void close()}
            className="cursor-default rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
          >
            Switch Library…
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void reveal()}
            className="cursor-default rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
          >
            Reveal in Finder
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
