# Album Context Menu — Rename / Delete

**Date:** 2026-07-31
**Status:** Approved

## Goal

Right-click an album in the sidebar to rename or delete it. Rename via an in-app dialog; delete via a native macOS confirmation. Album deletion is DB-only — photo files are never touched.

## Context

- Backend commands `rename_album` and `delete_album` already exist (`src-tauri/src/commands/albums.rs`) and are registered.
- TS wrappers `renameAlbum(id, name)` and `deleteAlbum(id)` already exist in `src/lib/tauri.ts`.
- Missing pieces are frontend-only: hook methods, context menu UI, rename dialog, delete confirmation.

## Design

### Context menu

`AlbumRow` in `src/components/sidenav/AlbumList.tsx` wraps each row in a Radix `ContextMenu` (`@radix-ui/react-context-menu`, already a dependency) with two items:

- **Rename…** — opens the rename dialog
- **Delete…** — triggers the native confirm flow

### Rename dialog

New component `RenameAlbumDialog` (Radix Dialog, co-located under `src/components/sidenav/`):

- Text field pre-filled with the current album name, text selected on open.
- Enter or Save button commits; Esc or Cancel dismisses.
- Empty or unchanged name is a no-op (dialog just closes).
- Dialog open-state lives in `AlbumList` as "which album id is being renamed" (`string | null`), not per-row, so only one dialog instance exists.

### Delete confirmation

Native macOS alert via `ask()` from `@tauri-apps/plugin-dialog`:

- Message: `Delete album "<name>"?` with detail that photos are not deleted.
- Destructive-styled confirm button ("Delete").
- On confirm, call the hook's `remove`.

### Hook changes (`src/hooks/useAlbums.ts`)

Two new methods, following the existing optimistic pattern used by `reorder`:

- `rename(id, name)` — optimistically update the album name in the store, call `renameAlbum`, roll back and rethrow on error.
- `remove(id)` — optimistically drop the album from the store, call `deleteAlbum`, roll back and rethrow on error. If the deleted album is the current `activeSource`, reset `activeSource` to the library view.

### Error handling

Rollback + rethrow at the hook level, matching existing conventions. No new error UI.

## Testing

Vitest:

- `AlbumList.test.tsx` — context menu opens on right-click; Rename opens dialog and submit calls `rename` with new name; Delete calls mocked `ask()`, and confirms call `remove` (declined confirm calls nothing).
- Hook tests — optimistic rename/remove, rollback on API failure, `activeSource` reset when active album is deleted.
- Mock `@tauri-apps/plugin-dialog`.

## Out of scope

- Inline rename in the sidebar row.
- Undo for delete.
- Backend changes.
