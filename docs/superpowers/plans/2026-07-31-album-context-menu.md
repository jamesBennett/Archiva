# Album Context Menu (Rename / Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click an album in the sidebar to rename it (in-app Radix dialog) or delete it (native macOS confirm). Frontend-only — backend commands and TS wrappers already exist.

**Architecture:** `useAlbums` gains optimistic `rename`/`remove` methods (same rollback pattern as `reorder`). `AlbumList` owns a single `RenameAlbumDialog` instance plus the delete-confirm flow; each `AlbumRow` wraps its button in a Radix `ContextMenu` with Rename…/Delete… items.

**Tech Stack:** React 18 + TypeScript strict, Zustand, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@tauri-apps/plugin-dialog` (`ask`), Vitest + Testing Library.

## Global Constraints

- Never call `invoke` from components — Tauri calls go through `src/lib/tauri.ts` wrappers used by hooks (`src/hooks/`).
- Strict TypeScript, no `any`. Function components only.
- Radix UI primitives for all interactive elements.
- Album delete is DB-only; photo files are never touched (backend already guarantees this — no new backend code).
- Run tests with `npm test -- run` (vitest). Baseline: 54 passing.

## Reference: existing code you will consume

Already in `src/lib/tauri.ts` (do not modify):

```ts
export function renameAlbum(id: string, name: string): Promise<void>;
export function deleteAlbum(id: string): Promise<void>;
export function listAlbums(): Promise<Album[]>;
export function listAlbumPhotos(albumId: string): Promise<string[]>;
```

Store (`src/store/useLibraryStore.ts`): `albums: Album[]`, `setAlbums(albums)`, `activeSource: ActiveSource` (`{ kind: "library" } | { kind: "album"; id: string } | ...`), `setActiveSource(s)`.

`Album` type (`src/types`): `{ id: string; name: string; description: string | null; cover_photo_id: string | null; is_smart: number; sort_order: number; created_at: string; updated_at: string }`.

---

### Task 1: `useAlbums.rename` / `useAlbums.remove`

**Files:**
- Modify: `src/hooks/useAlbums.ts`
- Test (create): `src/hooks/useAlbums.test.ts`

**Interfaces:**
- Consumes: `renameAlbum`, `deleteAlbum` from `../lib/tauri`; store `setAlbums`, `setActiveSource`.
- Produces: `useAlbums()` return gains `rename(id: string, name: string): Promise<void>` and `remove(id: string): Promise<void>`. Task 3 relies on these exact names.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useAlbums.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../lib/tauri", () => ({
  listAlbums: vi.fn(),
  createAlbum: vi.fn(),
  renameAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  reorderAlbums: vi.fn(),
  listAlbumPhotos: vi.fn(),
  addPhotosToAlbum: vi.fn(),
  removePhotosFromAlbum: vi.fn(),
}));

import { deleteAlbum, listAlbums, renameAlbum } from "../lib/tauri";
import { useAlbums } from "./useAlbums";
import { useLibraryStore } from "../store/useLibraryStore";
import type { Album } from "../types";

const album = (id: string, name: string, sort: number): Album => ({
  id,
  name,
  description: null,
  cover_photo_id: null,
  is_smart: 0,
  sort_order: sort,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const fixtures = [album("a1", "Family Vacation", 0), album("a2", "Our Wedding", 1)];

describe("useAlbums rename/remove", () => {
  beforeEach(() => {
    vi.mocked(listAlbums).mockResolvedValue(fixtures);
    vi.mocked(renameAlbum).mockReset();
    vi.mocked(deleteAlbum).mockReset();
    useLibraryStore.setState({
      albums: fixtures,
      activeSource: { kind: "library" },
      albumPhotoIds: new Map(),
    });
  });

  it("rename optimistically updates the album name", async () => {
    vi.mocked(renameAlbum).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAlbums());
    await act(() => result.current.rename("a1", "Trip 2026"));
    expect(useLibraryStore.getState().albums.find((a) => a.id === "a1")?.name).toBe(
      "Trip 2026",
    );
    expect(renameAlbum).toHaveBeenCalledWith("a1", "Trip 2026");
  });

  it("rename rolls back and rethrows on API failure", async () => {
    vi.mocked(renameAlbum).mockRejectedValue(new Error("db locked"));
    const { result } = renderHook(() => useAlbums());
    await expect(act(() => result.current.rename("a1", "Trip 2026"))).rejects.toThrow(
      "db locked",
    );
    expect(useLibraryStore.getState().albums.find((a) => a.id === "a1")?.name).toBe(
      "Family Vacation",
    );
  });

  it("remove optimistically drops the album", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAlbums());
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().albums.map((a) => a.id)).toEqual(["a1"]);
    expect(deleteAlbum).toHaveBeenCalledWith("a2");
  });

  it("remove resets activeSource to library when deleting the active album", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    useLibraryStore.setState({ activeSource: { kind: "album", id: "a2" } });
    const { result } = renderHook(() => useAlbums());
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().activeSource).toEqual({ kind: "library" });
  });

  it("remove leaves activeSource alone when deleting an inactive album", async () => {
    vi.mocked(deleteAlbum).mockResolvedValue(undefined);
    useLibraryStore.setState({ activeSource: { kind: "album", id: "a1" } });
    const { result } = renderHook(() => useAlbums());
    await act(() => result.current.remove("a2"));
    expect(useLibraryStore.getState().activeSource).toEqual({ kind: "album", id: "a1" });
  });

  it("remove rolls back the album list and rethrows on API failure", async () => {
    vi.mocked(deleteAlbum).mockRejectedValue(new Error("db locked"));
    const { result } = renderHook(() => useAlbums());
    await expect(act(() => result.current.remove("a2"))).rejects.toThrow("db locked");
    expect(useLibraryStore.getState().albums.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});
```

Note: the hook's mount effect calls `listAlbums()` and overwrites `albums` — that's why `listAlbums` is mocked to resolve `fixtures`. The hydration effect calls `listAlbumPhotos()` whenever `activeSource` is an uncached album, which happens in the tests that set an active album. So also add `listAlbumPhotos` to the imports and this line to `beforeEach`: `vi.mocked(listAlbumPhotos).mockResolvedValue([]);`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- run src/hooks/useAlbums.test.ts`
Expected: FAIL — `result.current.rename is not a function` (and same for `remove`).

- [ ] **Step 3: Implement `rename` and `remove` in the hook**

In `src/hooks/useAlbums.ts`:

Add to the import from `../lib/tauri`:

```ts
import {
  addPhotosToAlbum as apiAddPhotos,
  createAlbum as apiCreateAlbum,
  deleteAlbum as apiDeleteAlbum,
  listAlbumPhotos as apiListAlbumPhotos,
  listAlbums as apiListAlbums,
  removePhotosFromAlbum as apiRemovePhotos,
  renameAlbum as apiRenameAlbum,
  reorderAlbums as apiReorderAlbums,
} from "../lib/tauri";
```

Add a store selector near the existing ones:

```ts
const setActiveSource = useLibraryStore((s) => s.setActiveSource);
```

Add the two callbacks (after `create`, following the `reorder` optimistic pattern):

```ts
const rename = useCallback(
  async (id: string, name: string) => {
    const prev = albums;
    setAlbums(albums.map((a) => (a.id === id ? { ...a, name } : a)));
    try {
      await apiRenameAlbum(id, name);
    } catch (e) {
      setAlbums(prev);
      throw e;
    }
  },
  [albums, setAlbums],
);

const remove = useCallback(
  async (id: string) => {
    const prev = albums;
    const prevSource = activeSource;
    setAlbums(albums.filter((a) => a.id !== id));
    if (activeSource.kind === "album" && activeSource.id === id) {
      setActiveSource({ kind: "library" });
    }
    try {
      await apiDeleteAlbum(id);
    } catch (e) {
      setAlbums(prev);
      setActiveSource(prevSource);
      throw e;
    }
  },
  [albums, setAlbums, activeSource, setActiveSource],
);
```

Extend the return:

```ts
return { albums, refresh, reorder, addPhotos, create, removePhotos, rename, remove };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- run src/hooks/useAlbums.test.ts`
Expected: 6 PASS. Then full suite: `npm test -- run` — 60 passing, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAlbums.ts src/hooks/useAlbums.test.ts
git commit -m "feat(albums): optimistic rename/remove in useAlbums"
```

---

### Task 2: `RenameAlbumDialog` component

**Files:**
- Create: `src/components/sidenav/RenameAlbumDialog.tsx`
- Test (create): `src/components/sidenav/RenameAlbumDialog.test.tsx`

**Interfaces:**
- Consumes: `Album` type only. No Tauri, no hooks — pure controlled component.
- Produces (Task 3 relies on this exact contract):

```ts
interface Props {
  album: Album;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
}
export function RenameAlbumDialog({ album, onClose, onRename }: Props): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

Create `src/components/sidenav/RenameAlbumDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RenameAlbumDialog } from "./RenameAlbumDialog";
import type { Album } from "../../types";

const album: Album = {
  id: "a1",
  name: "Family Vacation",
  description: null,
  cover_photo_id: null,
  is_smart: 0,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("RenameAlbumDialog", () => {
  it("prefills the input with the current name", () => {
    render(<RenameAlbumDialog album={album} onClose={() => {}} onRename={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Family Vacation");
  });

  it("submits the trimmed new name and closes", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={onRename} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "  Trip 2026  {Enter}");
    expect(onRename).toHaveBeenCalledWith("a1", "Trip 2026");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without renaming when the name is unchanged", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onClose = vi.fn();
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={onRename} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Save when the name is empty", async () => {
    const user = userEvent.setup();
    render(<RenameAlbumDialog album={album} onClose={() => {}} onRename={vi.fn()} />);
    await user.clear(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when onRename rejects", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockRejectedValue(new Error("db locked"));
    const onClose = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RenameAlbumDialog album={album} onClose={onClose} onRename={onRename} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Trip 2026{Enter}");
    expect(onClose).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- run src/components/sidenav/RenameAlbumDialog.test.tsx`
Expected: FAIL — cannot resolve `./RenameAlbumDialog`.

- [ ] **Step 3: Implement the component**

Create `src/components/sidenav/RenameAlbumDialog.tsx` (styling mirrors `NewAlbumButton`):

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- run src/components/sidenav/RenameAlbumDialog.test.tsx`
Expected: 6 PASS. Then `npm test -- run` — all passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidenav/RenameAlbumDialog.tsx src/components/sidenav/RenameAlbumDialog.test.tsx
git commit -m "feat(albums): RenameAlbumDialog component"
```

---

### Task 3: Context menu in `AlbumList` + delete confirm wiring

**Files:**
- Modify: `src/components/sidenav/AlbumList.tsx`
- Modify: `src/components/sidenav/AlbumList.test.tsx`

**Interfaces:**
- Consumes: `useAlbums().rename` / `useAlbums().remove` (Task 1), `RenameAlbumDialog` (Task 2), `ask` from `@tauri-apps/plugin-dialog`.
- Produces: no new exports — `AlbumList` keeps its `{ albums: Album[] }` props.

- [ ] **Step 1: Write the failing tests**

In `src/components/sidenav/AlbumList.test.tsx`, add mocks at the top (before other imports; `AlbumList` will now use `useAlbums`, which touches `../lib/tauri`):

```tsx
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";

vi.mock("../../lib/tauri", () => ({
  listAlbums: vi.fn(),
  createAlbum: vi.fn(),
  renameAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  reorderAlbums: vi.fn(),
  listAlbumPhotos: vi.fn(),
  addPhotosToAlbum: vi.fn(),
  removePhotosFromAlbum: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

import { ask } from "@tauri-apps/plugin-dialog";
import { deleteAlbum, listAlbums, renameAlbum } from "../../lib/tauri";
import { AlbumList } from "./AlbumList";
import { useLibraryStore } from "../../store/useLibraryStore";
import type { Album } from "../../types";
```

Update the existing `beforeEach` to reset the new mocks:

```tsx
beforeEach(() => {
  vi.mocked(listAlbums).mockResolvedValue(albums);
  vi.mocked(renameAlbum).mockReset();
  vi.mocked(deleteAlbum).mockReset();
  vi.mocked(ask).mockReset();
  useLibraryStore.setState({
    activeSource: { kind: "library" },
    albums,
    albumPhotoIds: new Map(),
  });
});
```

Add a helper and the new tests inside the existing `describe`:

```tsx
async function openContextMenu(name: RegExp) {
  fireEvent.contextMenu(screen.getByRole("button", { name }));
  return screen.findByRole("menu");
}

it("right-click shows Rename and Delete menu items", async () => {
  renderList();
  await openContextMenu(/Family Vacation/);
  expect(screen.getByRole("menuitem", { name: /Rename/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
});

it("Rename opens dialog prefilled and submits the new name", async () => {
  const user = userEvent.setup();
  vi.mocked(renameAlbum).mockResolvedValue(undefined);
  renderList();
  await openContextMenu(/Family Vacation/);
  await user.click(screen.getByRole("menuitem", { name: /Rename/ }));
  const input = await screen.findByRole("textbox");
  expect(input).toHaveValue("Family Vacation");
  await user.clear(input);
  await user.type(input, "Trip 2026{Enter}");
  await waitFor(() => expect(renameAlbum).toHaveBeenCalledWith("a1", "Trip 2026"));
  expect(useLibraryStore.getState().albums.find((a) => a.id === "a1")?.name).toBe(
    "Trip 2026",
  );
});

it("Delete asks for native confirmation and removes on confirm", async () => {
  const user = userEvent.setup();
  vi.mocked(ask).mockResolvedValue(true);
  vi.mocked(deleteAlbum).mockResolvedValue(undefined);
  renderList();
  await openContextMenu(/Our Wedding/);
  await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
  await waitFor(() => expect(deleteAlbum).toHaveBeenCalledWith("a2"));
  expect(vi.mocked(ask).mock.calls[0][0]).toContain('"Our Wedding"');
  expect(useLibraryStore.getState().albums.map((a) => a.id)).toEqual(["a1"]);
});

it("Delete does nothing when confirmation is declined", async () => {
  const user = userEvent.setup();
  vi.mocked(ask).mockResolvedValue(false);
  renderList();
  await openContextMenu(/Our Wedding/);
  await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
  await waitFor(() => expect(ask).toHaveBeenCalled());
  expect(deleteAlbum).not.toHaveBeenCalled();
  expect(useLibraryStore.getState().albums).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- run src/components/sidenav/AlbumList.test.tsx`
Expected: original 3 tests still PASS; 4 new tests FAIL (no `menu` role appears).

- [ ] **Step 3: Implement context menu + wiring**

Rewrite `src/components/sidenav/AlbumList.tsx`:

```tsx
import { useState } from "react";
import clsx from "clsx";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ask } from "@tauri-apps/plugin-dialog";
import type { Album } from "../../types";
import { useAlbums } from "../../hooks/useAlbums";
import { useLibraryStore } from "../../store/useLibraryStore";
import { RenameAlbumDialog } from "./RenameAlbumDialog";

interface Props {
  albums: Album[];
}

export function AlbumList({ albums }: Props) {
  const { rename, remove } = useAlbums();
  const [renameTarget, setRenameTarget] = useState<Album | null>(null);
  const ids = albums.map((a) => a.id);

  async function handleDelete(album: Album) {
    const ok = await ask(`Delete album "${album.name}"? Photos are not deleted.`, {
      title: "Delete Album",
      kind: "warning",
      okLabel: "Delete",
    });
    if (!ok) return;
    try {
      await remove(album.id);
    } catch (e) {
      console.error("delete album failed", e);
    }
  }

  return (
    <>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col">
          {albums.map((album) => (
            <AlbumRow
              key={album.id}
              album={album}
              onRename={setRenameTarget}
              onDelete={(a) => void handleDelete(a)}
            />
          ))}
        </ul>
      </SortableContext>
      {renameTarget && (
        <RenameAlbumDialog
          key={renameTarget.id}
          album={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={rename}
        />
      )}
    </>
  );
}

function AlbumRow({
  album,
  onRename,
  onDelete,
}: {
  album: Album;
  onRename: (album: Album) => void;
  onDelete: (album: Album) => void;
}) {
  const activeSource = useLibraryStore((s) => s.activeSource);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);

  const sortable = useSortable({ id: album.id, data: { kind: "album", albumId: album.id } });
  const isActive = activeSource.kind === "album" && activeSource.id === album.id;
  const isPhotoDragOver =
    sortable.isOver && sortable.active?.data.current?.kind === "photo";

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const { role: _role, ...liAttributes } = sortable.attributes;

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={clsx(
        "rounded",
        isPhotoDragOver && !isActive && "bg-panel-hover ring-1 ring-accent",
        sortable.isDragging && "opacity-60",
      )}
      {...liAttributes}
      {...sortable.listeners}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            onClick={() => setActiveSource({ kind: "album", id: album.id })}
            onPointerDown={(e) => e.stopPropagation()}
            className={clsx(
              "block w-full truncate rounded py-1 px-3 text-left text-sm",
              isActive ? "bg-accent text-white" : "hover:bg-panel-hover",
            )}
          >
            {album.name}
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[150px] rounded-md border border-border bg-panel p-1 text-sm text-white shadow-lg">
            <ContextMenu.Item
              onSelect={() => onRename(album)}
              className="cursor-default rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-hover"
            >
              Rename…
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={() => onDelete(album)}
              className="cursor-default rounded px-2 py-1 text-red-400 outline-none data-[highlighted]:bg-panel-hover"
            >
              Delete…
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}
```

Notes for the implementer:
- `useAlbums()` in `AlbumList` is a second hook instance (AlbumsSection already has one); instances share the Zustand store, and this matches the existing `NewAlbumButton` pattern.
- `key={renameTarget.id}` resets the dialog's internal `name` state per album.
- Do not remove `onPointerDown` stopPropagation on the button — it keeps clicks from starting a sortable drag.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- run src/components/sidenav/AlbumList.test.tsx`
Expected: 7 PASS. Then full suite + typecheck:

Run: `npm test -- run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidenav/AlbumList.tsx src/components/sidenav/AlbumList.test.tsx
git commit -m "feat(albums): right-click context menu with rename and delete"
```

---

## Final Verification

- [ ] `npm test -- run` — full suite green: 70 tests (54 baseline + 6 hook + 6 dialog + 4 new AlbumList)
- [ ] `npx tsc --noEmit` — clean
- [ ] Manual smoke (optional): `npm run tauri dev`, right-click album → rename via dialog, delete via native confirm; verify photos untouched.
