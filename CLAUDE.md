# Archiva — Project Context for Claude Code

## Overview

**Archiva** is a macOS-only photo management app focused on curation, organization, and long-term archival. It is **not** a photo editor. Core use cases: importing and indexing photo libraries, creating albums, reading metadata, curating with ratings/flags/labels, and detecting duplicates.

- **Bundle ID:** `com.archiva.app`
- **Platform:** macOS only (no cross-platform requirements)
- **Philosophy:** Non-destructive. Original files are never moved, renamed, or modified unless the user explicitly requests it. All organization is DB-driven.

---

## Developer Background

- 15 years frontend experience (React, TypeScript)
- Backend experience in .NET Core and Elixir
- Learning Rust — understands types, async, service architecture; skip basics
- Do not over-explain. Write production-quality code, not tutorial code.

---

## Tech Stack

### Frontend
| Tech | Version | Notes |
|---|---|---|
| React | 18 | |
| TypeScript | latest | strict mode on |
| Vite | latest | dev server + build |
| Tailwind CSS | 3.x | utility-first styling |
| Radix UI | latest | unstyled accessible primitives |
| Zustand | latest | global app state |
| `@tanstack/virtual` | latest | virtualized photo grid — required from day one |

### Backend (Rust / Tauri)
| Crate | Purpose |
|---|---|
| `tauri` 2.x | App framework |
| `sqlx` + SQLite | Local database, raw SQL, no ORM |
| `walkdir` | Recursive directory scanning |
| `kamadak-exif` | EXIF metadata parsing |
| `image` | Thumbnail generation for JPG/PNG |
| `serde` / `serde_json` | Serialization for Tauri commands |
| `tokio` | Async runtime |
| `uuid` | UUID generation for PKs |

### HEIC Support
Shell out to macOS `sips` CLI for HEIC → JPEG thumbnail conversion. **Originals are never converted or touched.**

```rust
std::process::Command::new("sips")
    .args(["-s", "format", "jpeg", src_path, "--out", dest_path])
    .output()?;
```

---

## File & Directory Paths

| Resource | Path |
|---|---|
| SQLite database | `app_data_dir()/archiva.db` |
| Thumbnail cache | `app_data_dir()/thumbs/` |
| Thumbnail filename | `{photo_uuid}.jpg` |

---

## Folder Structure

```
archiva/
├── CLAUDE.md                     ← this file
├── src/                          ← React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── PhotoGrid.tsx         ← virtualized grid
│   │   ├── AlbumSidebar.tsx
│   │   ├── PhotoDetail.tsx
│   │   └── MetadataPanel.tsx
│   ├── hooks/
│   │   ├── usePhotos.ts          ← wraps Tauri commands
│   │   └── useAlbums.ts
│   ├── pages/
│   │   ├── Library.tsx
│   │   └── AlbumView.tsx
│   ├── store/
│   │   └── useLibraryStore.ts    ← Zustand store
│   └── types/
│       └── index.ts              ← shared TS types
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── db.rs                 ← DB init, migrations
│       └── commands/
│           ├── photos.rs         ← scan, index, query
│           ├── albums.rs         ← CRUD for albums
│           ├── metadata.rs       ← EXIF parsing
│           └── thumbnails.rs     ← generate & cache
```

---

## SQLite Schema

```sql
-- photos: one row per file on disk
CREATE TABLE IF NOT EXISTS photos (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    filename      TEXT NOT NULL,
    ext           TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    created_at    TEXT,                   -- EXIF DateTimeOriginal (ISO 8601)
    modified_at   TEXT,                   -- filesystem modified date
    imported_at   TEXT NOT NULL,          -- when Archiva indexed it

    -- EXIF
    camera_make   TEXT,
    camera_model  TEXT,
    lens_model    TEXT,
    focal_length  REAL,
    aperture      REAL,
    shutter_speed TEXT,
    iso           INTEGER,

    -- GPS
    latitude      REAL,
    longitude     REAL,
    altitude      REAL,

    -- Curation
    rating        INTEGER DEFAULT 0,      -- 0–5 stars
    flag          INTEGER DEFAULT 0,      -- 0=none, 1=flagged, 2=rejected
    color_label   TEXT,                   -- red, orange, yellow, green, blue, purple
    is_favorite   INTEGER DEFAULT 0,      -- boolean

    -- Thumbnails
    thumb_path    TEXT,
    thumb_ready   INTEGER DEFAULT 0       -- boolean
);

-- albums: named collections (non-destructive, DB only)
CREATE TABLE IF NOT EXISTS albums (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
    is_smart       INTEGER DEFAULT 0,
    sort_order     INTEGER DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

-- album_photos: many-to-many join
CREATE TABLE IF NOT EXISTS album_photos (
    album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    photo_id   TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    added_at   TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (album_id, photo_id)
);

-- smart_album_rules: filter rules for smart albums
CREATE TABLE IF NOT EXISTS smart_album_rules (
    id         TEXT PRIMARY KEY,
    album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    field      TEXT NOT NULL,             -- "rating", "camera_model", "created_at", "flag", etc.
    operator   TEXT NOT NULL,             -- "eq", "gt", "lt", "contains", "between"
    value      TEXT NOT NULL,             -- stored as string, cast at query time
    sort_order INTEGER DEFAULT 0
);

-- folders: root folders being watched/scanned
CREATE TABLE IF NOT EXISTS folders (
    id              TEXT PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    last_scanned_at TEXT,
    auto_scan       INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_photos_created_at   ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_rating        ON photos(rating);
CREATE INDEX IF NOT EXISTS idx_photos_flag          ON photos(flag);
CREATE INDEX IF NOT EXISTS idx_photos_camera_model  ON photos(camera_model);
CREATE INDEX IF NOT EXISTS idx_photos_latitude      ON photos(latitude);
CREATE INDEX IF NOT EXISTS idx_album_photos_album   ON album_photos(album_id);
```

---

## Zustand Store Shape

```ts
// store/useLibraryStore.ts
interface LibraryStore {
  photos: Photo[];
  albums: Album[];
  selectedIds: Set<string>;
  activeAlbumId: string | null;
  activePhotoId: string | null;

  setPhotos: (photos: Photo[]) => void;
  setAlbums: (albums: Album[]) => void;
  selectPhoto: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setActiveAlbum: (id: string | null) => void;
}
```

---

## Tauri Command Conventions

- All commands are `async` and return `Result<T, String>`
- Errors are stringified and surfaced to the frontend via the Result Err variant
- Commands live in `src-tauri/src/commands/` — one file per domain
- Registered in `main.rs` via `tauri::generate_handler![]`
- Frontend wrappers live in `src/hooks/` — never call `invoke` directly from components

```rust
// Example command signature pattern
#[tauri::command]
pub async fn scan_folder(
    path: String,
    app_handle: tauri::AppHandle,
    db: tauri::State<'_, DbPool>,
) -> Result<Vec<PhotoEntry>, String> {
    // ...
}
```

---

## Coding Conventions

### Rust
- Use `anyhow` for internal errors, convert to `String` at the command boundary
- Async all the way down for I/O — no blocking calls on the main thread
- Structs that cross the Tauri boundary must derive `serde::Serialize` + `serde::Deserialize`
- UUIDs generated with the `uuid` crate (`Uuid::new_v4().to_string()`)
- Dates stored as ISO 8601 strings (`chrono::Utc::now().to_rfc3339()`)

### TypeScript / React
- Strict TypeScript — no `any`
- Components are function components only
- Co-locate component-specific types in the component file; shared types in `src/types/index.ts`
- Tauri `invoke` calls only happen inside hooks in `src/hooks/` — never in components directly
- Use Radix UI primitives for all interactive elements (dialogs, dropdowns, context menus)

### General
- No ORMs — raw SQL via `sqlx`
- No original files are ever written to, moved, or deleted without an explicit user-confirmed action
- Thumbnail generation is always async and non-blocking

---

## Feature Phases

### Phase 1 — Core Library (current)
- Scan a folder, index photos into SQLite
- Generate + cache thumbnails (`sips` for HEIC, `image` crate for others)
- Virtualized photo grid
- EXIF metadata panel

### Phase 2 — Albums
- left side nav / file navigation
- Create / rename / delete albums
- Drag photos into albums
- Smart albums (filter by rating, camera model, date range, GPS region)

### Phase 3 — Curation
- Star ratings (0–5), flags (flagged/rejected), color labels
- Bulk select + actions
- Duplicate detection (perceptual hash)
- Filter and sort by any metadata field

### Phase 4 — Polish
- macOS Quick Look integration
- Drag-out to Finder
- Export album as folder or zip
- Auto-scan folders for new photos

---

## Things to Never Do

- Never move, rename, or modify original photo files (unless user explicitly triggers it)
- Never use an ORM — raw SQL only
- Never call `invoke` directly from a React component — always go through a hook
- Never block the Rust main thread with synchronous I/O
- Never store thumbnails next to original files — always use `app_data_dir()/thumbs/`
- Never generate thumbnails synchronously on scan — queue them as a background task
