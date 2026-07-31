# Switchable Library Bundles — Design

**Date:** 2026-07-30
**Status:** Approved for planning

## Goal

Replace the single fixed database at `app_data_dir()/archiva.db` with self-contained,
user-visible library bundles. The user can create multiple libraries, open any of them,
and switch between them at runtime without restarting the app.

Non-goals: multi-window (one library per window), relinking moved original photos,
App Store sandboxing, multi-instance locking.

## 1. Bundle format

A library is a directory with the `.archivalib` extension that macOS treats as a single
opaque item (a package):

```
MyPhotos.archivalib/
├── Info.plist                       ← declares CFBundlePackageType
├── meta.json                        ← uuid, name, schema_version, created_at, app_version
├── catalog.db  (+ -wal, -shm)       ← existing schema, unchanged
└── thumbs/
    └── {photo_uuid}.jpg
```

- **Package registration:** `Info.plist` inside the bundle plus a
  `UTExportedTypeDeclarations` entry in `tauri.conf.json` (`bundle.macOS`) declaring a
  UTI conforming to `com.apple.package` with extension `archivalib`. Without the UTI
  (e.g. in `tauri dev`), Finder shows a plain folder — functional, cosmetic only.
- **meta.json** is read *before* opening the database: cheap validity check and display
  name for the picker without spinning up SQLite.
  - `schema_version` gate: newer than the app supports → refuse to open with a clear
    "created by a newer version of Archiva" error. Older → run migrations (none exist
    yet; the field enables them later).
- **WAL on network volumes:** SQLite WAL is unsafe on SMB/NFS. On open, if the bundle
  is not on a local volume, refuse with a clear error. External USB/Thunderbolt drives
  are fine.
- **Originals are absolute paths.** The bundle is portable; the photos it references are
  not. Moving a library to another machine yields broken photo paths. Out of scope —
  the existing `folders` table is where a future "relink folder root" feature slots in.

## 2. Backend (Rust)

### New modules

- `src-tauri/src/library.rs` — bundle create/open/validate, `meta.json` read/write,
  path helpers (`catalog_db_path`, `thumb_dir`).
- `src-tauri/src/prefs.rs` — `app_data_dir()/prefs.json`: recents list
  (`{uuid, path, name, last_opened}`), load/save/push. Missing paths are kept but
  flagged, not auto-pruned (external drive may be unmounted).
- `src-tauri/src/commands/library.rs` — Tauri commands below.

### State

Replace `manage(SqlitePool)` with:

```rust
pub struct AppState {
    current: RwLock<Option<OpenLibrary>>,
}

pub struct OpenLibrary {
    uuid: String,
    root: PathBuf,        // bundle root
    pool: SqlitePool,
    thumb_dir: PathBuf,   // root.join("thumbs")
}

impl AppState {
    async fn pool(&self) -> Result<SqlitePool, String>;      // Err("No library open")
    async fn thumb_dir(&self) -> Result<PathBuf, String>;
}
```

All existing commands (`photos.rs`, `thumbnails.rs`) change from
`State<'_, SqlitePool>` to `State<'_, AppState>` and go through `state.pool().await?`.
`thumbnails::thumb_dir(&AppHandle)` is deleted — the thumb dir comes from the open
library, so thumbnails live inside the bundle.

### Connection options

`db::connect_file` switches from `SqliteConnectOptions::from_str("sqlite://…")` to
`SqliteConnectOptions::new().filename(path)`. The URL form breaks on paths containing
spaces or URL-special characters (`#`, `?`); the builder form takes a real path.

### Commands

| Command | Behavior |
|---|---|
| `list_recent_libraries` | Recents from prefs with an `exists` flag per entry. |
| `create_library(parent_dir, name)` | mkdir bundle, write `Info.plist` + `meta.json`, create + migrate `catalog.db`, open it, push to recents. |
| `open_library(path)` | Validate `meta.json` + `schema_version`, swap state (see below), push to recents, emit `library-changed`. |
| `current_library` | `Option<LibraryInfo>` for the header/titlebar. |
| `close_library` | Checkpoint WAL (`PRAGMA wal_checkpoint(TRUNCATE)`), close pool, clear state, emit `library-changed`. Returns UI to picker. |
| `reveal_library` | Reveal bundle in Finder (nice-to-have). |

### Switch semantics (non-blocking)

On `open_library`: acquire write lock, `take()` the old `OpenLibrary`, install the new
one, release the lock, then close the old pool in `tauri::async_runtime::spawn`. The
switch never blocks on in-flight jobs; jobs holding the old pool get errors, which is
acceptable. The `library-changed` event carries the new library uuid; the frontend
drops any late results tagged with a different uuid (generation check).

Rationale: sqlx pool clones share one pool — `close().await` waits for checked-out
connections, so closing inline could hang a switch under load.

### Thumbnail paths

Stored `thumb_path` is no longer trusted (absolute paths break when a bundle moves).
Thumbnail location is always derived at runtime as `{thumb_dir}/{photo_id}.jpg`;
`thumb_ready` remains the readiness flag. The `thumb_path` column stays in the schema
but is no longer read.

### Startup

1. If legacy `archiva.db` exists **and** recents are empty → run legacy migration
   (section 4), then open the migrated library.
2. Else if recents non-empty → try most recent; on failure (missing/corrupt/version)
   fall through to picker state (no library open).
3. Else → picker state.

Holding ⌥ at launch or File ▸ Open Library forces the picker.

### WAL checkpointing

Checkpoint (`TRUNCATE`) on `close_library` and on app quit, so a bundle copied while
the app is closed is a single clean file. Copies made mid-session may tear — accepted.

## 3. Frontend (React)

- `src/hooks/useLibrary.ts` — wraps the library commands; subscribes to
  `library-changed`, resets the store, refetches.
- `src/store/useLibraryStore.ts` — add `currentLibrary: LibraryInfo | null` and
  `reset()` clearing photos/albums/selection/active ids.
- `src/components/LibraryPicker.tsx` — full-screen when no library open: recents list
  (name, path, last opened; greyed-out if missing), **New Library…** (dialog: name +
  parent directory), **Open Other…**.
- `src/components/LibrarySwitcher.tsx` — Radix DropdownMenu in the Library page
  header: current library name, recents, New…, Open Other…, Reveal in Finder.
- `src/App.tsx` — gate: loading state while startup resolves, then
  `currentLibrary ? <Library/> : <LibraryPicker/>`.
- **Open Other… uses directory-picker mode** with post-pick validation (meta.json
  present), not a file filter. The UTI is only registered in the bundled app, so in
  `tauri dev` the bundle is a plain directory; directory mode works in both.
- Shared types: `LibraryInfo { uuid, name, path, lastOpened }` in `src/types/index.ts`.

## 4. Legacy migration

Runs once at startup when `app_data_dir()/archiva.db` exists and recents are empty:

1. Open the legacy db, `PRAGMA wal_checkpoint(TRUNCATE)`, close. (A crashed prior run
   may have left a `-wal` file; copying the bare db without checkpointing would lose
   committed data.)
2. Create `~/Pictures/Archiva.archivalib` (uniquify name if taken).
3. Copy `archiva.db` → bundle `catalog.db` (copy, not move — original stays recoverable
   if migration dies midway).
4. Move `app_data_dir()/thumbs/` contents into the bundle's `thumbs/`.
5. `UPDATE photos SET thumb_path = NULL, thumb_ready = 0` — legacy thumb paths are
   stale absolutes; thumbnails regenerate into the bundle. (Moot for reads given §2's
   derived paths, but keeps the column honest.)
6. Rename legacy file to `archiva.db.migrated`; push new bundle to recents; open it.

## 5. Testing

Rust (tempdir-based unit tests):
- `create_library` produces the exact bundle layout; `meta.json` round-trips.
- `open_library` on a non-bundle dir → error; on future `schema_version` → error.
- Prefs round-trip; missing paths flagged, not pruned.
- Legacy migration: fixture db + wal → resulting bundle opens, photo rows intact,
  `thumb_ready = 0`, legacy file renamed.
- Existing in-memory pool tests unchanged (schema/migrate untouched).

Frontend:
- Store `reset()` clears photos/albums/selection.
- `LibraryPicker` renders recents and disables missing entries.
- `App` gates on `currentLibrary`.

## Accepted risks

- Copy-while-open can produce a torn bundle copy (mitigated by checkpoint on close/quit).
- Two app instances on one library: stale UI, not corruption. Lockfile later if needed.
- Broken original-photo paths after moving a bundle across machines (future relink).
