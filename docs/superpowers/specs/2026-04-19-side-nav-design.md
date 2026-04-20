# Left Side Nav — Design

**Status:** Approved design, pending implementation plan
**Date:** 2026-04-19
**Phase:** 2 (Albums) — foundation

## Summary

Add a fixed-width left sidebar to `Library.tsx` containing two stacked sections:

1. **Folders** — a date-based tree derived from photo metadata: Library → Year → Month. Selecting a node filters the main photo grid to that date range.
2. **Albums** — a flat, drag-reorderable list of user-created albums. Photos can be added to albums by drag-and-drop from the grid, or by an "Add to Collection" button with a dialog.

The two sections are separated by a drag handle (⋮⋮ dots) that lets the user resize the vertical split between them. Sidebar width is fixed in this phase.

Selection across the sidebar is mutually exclusive: exactly one of `{library, date range, album, no-date bucket}` drives the grid at any time.

Album create/rename/delete UI (the `+` button and modals) is **deferred** to a follow-up — the Tauri commands and `useAlbums` hook are delivered in this phase so the structure is ready.

## Goals

- Land the sidebar structure and interaction model so Phase 2 albums work end-to-end.
- Derive the date tree with zero new Tauri commands — reuse `photos` already in state.
- Use keyboard-accessible drag-and-drop for albums and photo-to-album moves.
- Persist the user's section-split preference across sessions.

## Non-goals

- Album creation/rename/delete UI (deferred; commands land, UI follows).
- Nested album hierarchy / album groups.
- Collapsible or resizable overall sidebar width.
- Smart albums UI.
- Drag a photo *out of* an album (removal).

## Data model

No schema changes. Existing tables used:

- `photos.created_at`, `photos.modified_at` — source for date tree.
- `albums`, `album_photos` — as defined in `CLAUDE.md`.

**Date resolution per photo:** `created_at ?? modified_at`. If both are null, the photo is counted into a `noDateCount` bucket and reachable via a "No date" node at the bottom of the tree. Dates are parsed via `new Date(iso)`; `NaN` results fall into the no-date bucket. Year/month are extracted with `getUTCFullYear()` / `getUTCMonth()` so the tree does not shift by user timezone.

## Architecture

### Component tree

```
Library.tsx
└── <DndContext>                         ← wraps the whole flex row
    └── <div flex row>
        ├── SideNav.tsx                  ← fixed width 240px
        │   └── SideNavSplit.tsx         ← CSS grid with resizer row
        │       ├── FoldersSection.tsx
        │       │   └── DateTree.tsx
        │       ├── SectionResizer.tsx   ← ⋮⋮ dots handle
        │       └── AlbumsSection.tsx
        │           └── AlbumList.tsx    ← SortableContext
        ├── <main/> PhotoGrid
        └── <aside/> MetadataPanel
```

### New files

- `src/components/sidenav/SideNav.tsx`
- `src/components/sidenav/SideNavSplit.tsx`
- `src/components/sidenav/FoldersSection.tsx`
- `src/components/sidenav/DateTree.tsx`
- `src/components/sidenav/AlbumsSection.tsx`
- `src/components/sidenav/AlbumList.tsx`
- `src/components/sidenav/SectionResizer.tsx`
- `src/hooks/useDateTree.ts`
- `src/hooks/useAlbums.ts`
- `src/hooks/useVisiblePhotos.ts`
- `src-tauri/src/commands/albums.rs`

### Dependencies

Add to `dependencies`:

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

Rationale: accessible by default, virtualization-friendly, works on macOS WebKit (Tauri). One library covers both the sortable album list and the photo-to-album drop target.

## State

Extend `useLibraryStore`:

```ts
type ActiveSource =
  | { kind: 'library' }
  | { kind: 'date'; year: number; month?: number }   // month omitted = whole year
  | { kind: 'album'; id: string }
  | { kind: 'no-date' };

interface LibraryState {
  // existing fields...

  activeSource: ActiveSource;                        // default { kind: 'library' }
  setActiveSource: (s: ActiveSource) => void;

  expandedYears: Set<number>;                        // tree UI state
  toggleYear: (year: number) => void;

  foldersHeightPct: number;                          // 0–100, default 50, clamped 20–80
  setFoldersHeightPct: (n: number) => void;          // persists to localStorage

  // album photo ids for the currently-active album, keyed by album id
  albumPhotoIds: Map<string, Set<string>>;
  setAlbumPhotoIds: (albumId: string, ids: Set<string>) => void;
}
```

`activeAlbumId` is removed — subsumed by `activeSource`. Mutual exclusion is enforced by construction.

`foldersHeightPct` hydrates from `localStorage['archiva.sideNavSplit']` on store init; writes are debounced to pointerup.

## Data flow

### Date tree derivation

`useDateTree(photos)` — pure memoized selector:

```ts
type MonthNode = { month: number; count: number };              // 1–12
type YearNode  = { year: number; count: number; months: MonthNode[] };
type DateTree  = { total: number; years: YearNode[]; noDateCount: number };
```

Years and months are sorted descending. O(n) over `photos`; re-derives only when the `photos` reference changes.

### Grid filtering

`useVisiblePhotos()` returns the filtered set for `PhotoGrid`:

```ts
switch (activeSource.kind) {
  case 'library':  return photos;
  case 'date':     return photos.filter(p => matchesDate(p, activeSource));
  case 'no-date':  return photos.filter(p => !p.created_at && !p.modified_at);
  case 'album': {
    const ids = albumPhotoIds.get(activeSource.id);
    return ids ? photos.filter(p => ids.has(p.id)) : [];
  }
}
```

`matchesDate` resolves the photo date the same way as the tree (`created_at ?? modified_at`), then compares UTC year/month.

When `activeSource` becomes `{kind:'album',id}`, `useAlbums` calls `list_album_photos(id)` once and stores the result in `albumPhotoIds`. Subsequent selections of the same album are cache hits until invalidated by an `add_photos_to_album` or `delete_album` mutation.

### Event summary

| Trigger | Effect |
|---|---|
| Scan/refresh completes | `photos` replaced → `useDateTree` re-memoizes → tree re-renders |
| Click year/month | `setActiveSource` → `useVisiblePhotos` recomputes → grid filters |
| Click album row | `setActiveSource` → fetch album photo ids if missing → grid filters |
| Drop photo(s) on album row | `add_photos_to_album` → invalidate that album's cached ids → refresh if active |
| Drop album on album | `reorder_albums(ids)` with optimistic update; rollback on error |
| Drag section handle | `setFoldersHeightPct` → CSS grid updates → persist on pointerup |

## Tauri commands

New file `src-tauri/src/commands/albums.rs`:

```rust
list_albums()                                   -> Vec<Album>
create_album(name: String)                      -> Album
rename_album(id: String, name: String)          -> ()
delete_album(id: String)                        -> ()
reorder_albums(ordered_ids: Vec<String>)        -> ()        // rewrites sort_order
list_album_photos(album_id: String)             -> Vec<String>  // photo ids
add_photos_to_album(album_id: String, photo_ids: Vec<String>) -> usize
```

All commands follow existing conventions: `async`, `Result<T, String>`, raw sqlx, registered in `main.rs` via `generate_handler!`. `reorder_albums` runs in a single transaction rewriting `sort_order = index` for each id.

No new date/folder commands are needed — the tree is derived client-side.

## Drag-and-drop

Single `<DndContext>` wraps the row containing both the sidebar and the photo grid (both sides need to participate in the same drag).

### Drag sources

- `AlbumRow` — `useSortable({ id: album.id, data: { kind: 'album' } })`.
- `PhotoThumb` — `useDraggable({ id: photo.id, data: { kind: 'photo' } })`. If the dragged photo is in the current multi-selection, the drag payload includes `selectedIds: string[]`; otherwise it carries just the single id.

### Drop targets

- `AlbumRow` — `useDroppable({ id: album.id, data: { kind: 'album' } })`. Shows the `panel-hover` background while a photo payload is over it.
- `SortableContext` around `AlbumList` handles album-on-album reorder.

### `onDragEnd` dispatch (single handler on the context)

```
if active.kind === 'album' && over.kind === 'album':
    reorderAlbums(newOrder)
if active.kind === 'photo' && over.kind === 'album':
    addPhotosToAlbum(over.id, active.selectedIds ?? [active.id])
```

### Accessibility

`@dnd-kit` provides keyboard reorder (space to pick up, arrows to move, space/enter to drop) and screen-reader announcements without extra code. Keep defaults.

### Optimistic updates

- Album reorder: store updates immediately; command failure rolls back.
- Photo-to-album: no optimism needed (grid currently shows no album-membership indicator); refresh the active-album cache on success.

## Section resize

No library. `SideNavSplit` uses CSS grid:

```css
grid-template-rows: {foldersHeightPct}fr 8px {100 - foldersHeightPct}fr;
```

`SectionResizer` is a thin row styled with the ⋮⋮ dots pattern centered, `cursor: row-resize`. On `pointerdown`, it calls `setPointerCapture`; `pointermove` updates `foldersHeightPct` (clamped 20–80); `pointerup` releases capture and persists to `localStorage['archiva.sideNavSplit']`.

## "Add to Collection" button

Placement: above the photo grid (final placement chosen in the plan, not this spec).

- Enabled when `selectedIds.size > 0`.
- Opens a Radix `<Dialog>` listing current albums with a search filter.
- Click an album → `add_photos_to_album(id, [...selectedIds])` → toast confirmation → close dialog.

This is the non-drag path for multi-select moves.

## Styling

New Tailwind tokens added to `tailwind.config.js`:

```js
colors: {
  // existing: bg, panel, border, muted
  accent: "#E7661F",          // orange — selected date node
  'panel-hover': "#1e2128",   // grey — album row hover / photo-drop-target active
}
```

Selection in the date tree: full-width orange pill, white text, matching the mockup. Hover in the album list: `panel-hover` background, no text color change. Expand chevrons rotate 90° when the year is open. Row heights, padding, and indentation match the Figma mockup.

## Testing

### Frontend (vitest)

- `useDateTree.test.ts` — grouping, missing-date handling, UTC invariance, DESC sort, empty input.
- `useVisiblePhotos.test.ts` — each `activeSource.kind` filters correctly, including album cache miss/hit.
- `DateTree.test.tsx` — click sets `activeSource`; expand toggles `expandedYears`; "No date" node appears only when `noDateCount > 0`.
- `AlbumList.test.tsx` — renders in `sort_order`; album-reorder path calls `reorder_albums` with new order; photo-drop path calls `add_photos_to_album` with selected ids; optimistic rollback on error.
- `SectionResizer.test.tsx` — pointer drag updates pct, clamps to 20–80, persists on pointerup.

### Rust (sqlx, in-memory DB)

- `commands::albums::tests` — CRUD happy paths, `reorder_albums` rewrites `sort_order` correctly in a single transaction, `add_photos_to_album` is idempotent (re-adding same photo is a no-op via `INSERT OR IGNORE`), `list_album_photos` returns ids in `album_photos.sort_order`.

Follow the existing test patterns in `commands/photos.rs`.

## Open questions

None at design approval. Implementation plan will decide:

- Exact placement of the "Add to Collection" button (header toolbar vs. above grid).
- Icon choice for the expand chevron and album drag handle.
- Whether to show photo counts next to tree/album rows in phase 2 or defer.
