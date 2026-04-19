# Archiva Phase 1 — Core Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of Archiva — scan a folder, index JPG/PNG/HEIC files into SQLite with EXIF, generate cached thumbnails, render a virtualized grid, show per-photo metadata.

**Architecture:** Tauri 2 desktop app. Rust backend exposes `async` commands behind `Result<T, String>`. SQLite via `sqlx` (runtime-checked queries, no macros, no ORM). Thumbnails: `image` crate for JPG/PNG; `sips` for HEIC. React 18 frontend: `@tanstack/virtual` grid, Zustand store, all `invoke` calls wrapped in hooks. Commands are thin wrappers over pure `*_impl` functions that take `&SqlitePool` — makes them unit-testable without Tauri state.

**Tech Stack:** Tauri 2.x, Rust 1.94, React 18, TypeScript, Vite, Tailwind 3, Radix UI, Zustand, `@tanstack/virtual`, `@tauri-apps/plugin-dialog`, sqlx (SQLite), walkdir, kamadak-exif, image, tokio, uuid, anyhow, chrono.

**Conventions locked in by this plan:**
- App crate name: `archiva` (binary `archiva`, lib `archiva_lib`).
- Bundle id: `com.archiva.app`.
- Thumbnail: 256px max edge, JPEG quality 85, stored as `{uuid}.jpg` in `app_data_dir/thumbs/`.
- Commits: Conventional Commits (`feat:`, `chore:`, `test:`, `refactor:`).

---

## File Structure

### Rust (`src-tauri/`)
- `src/main.rs` — 2-line shim that calls `archiva_lib::run()`.
- `src/lib.rs` — builds Tauri app, registers commands, manages `SqlitePool` as state, initializes DB on startup.
- `src/db.rs` — connection pool setup, schema migration function.
- `src/types.rs` — `Photo`, `PhotoEntry`, `ExifData` structs (all `Serialize` + `Deserialize`).
- `src/commands/mod.rs` — re-exports command modules.
- `src/commands/photos.rs` — `scan_folder` command + `scan_folder_impl`.
- `src/commands/metadata.rs` — `read_exif` helper (used by `scan_folder_impl`).
- `src/commands/thumbnails.rs` — `generate_thumbnail` command + `generate_thumbnail_impl`.
- `tests/` — integration tests: each `*.rs` is a crate. Test helpers live in `tests/common/mod.rs`.

### Frontend (`src/`)
- `src/main.tsx` — React entry, imports `index.css`.
- `src/App.tsx` — shell layout; routes to `Library`.
- `src/index.css` — Tailwind directives only.
- `src/types/index.ts` — mirrors Rust `Photo` type.
- `src/store/useLibraryStore.ts` — Zustand store.
- `src/hooks/usePhotos.ts` — wraps `scan_folder`, `generate_thumbnail`, `get_photos` `invoke` calls.
- `src/components/PhotoGrid.tsx` — virtualized grid via `@tanstack/virtual`.
- `src/components/PhotoThumb.tsx` — single thumbnail cell.
- `src/components/MetadataPanel.tsx` — EXIF panel for selected photo.
- `src/components/FolderPicker.tsx` — button that opens dialog, triggers scan.
- `src/pages/Library.tsx` — composes FolderPicker + PhotoGrid + MetadataPanel.

---

## Task 1: Scaffold Tauri 2 + React + TypeScript app

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: Verify clean working tree**

Run: `git status` — should only show untracked `docs/` and `CLAUDE.md` already committed.

- [ ] **Step 2: Run create-tauri-app into the current directory**

Run from repo root:
```bash
npm create tauri-app@latest -- --yes --manager npm --template react-ts --identifier com.archiva.app archiva-scaffold
```

The CLI writes to a subdirectory. Move files up, then delete the scaffold dir:
```bash
cp -R archiva-scaffold/. .
rm -rf archiva-scaffold
```

Expected files present: `package.json`, `vite.config.ts`, `src/main.tsx`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `index.html`.

- [ ] **Step 3: Rename package to archiva**

Edit `package.json`: set `"name": "archiva"`, `"version": "0.1.0"`, `"private": true`. Leave scripts as generated (`dev`, `build`, `preview`, `tauri`).

Edit `src-tauri/Cargo.toml`: set `[package]` `name = "archiva"`, `version = "0.1.0"`, `edition = "2021"`. The `[lib]` section should already specify `name = "archiva_lib"`; confirm it does. If it doesn't, add:
```toml
[lib]
name = "archiva_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

- [ ] **Step 4: Configure tauri.conf.json**

Edit `src-tauri/tauri.conf.json`:
- `"productName": "Archiva"`
- `"identifier": "com.archiva.app"`
- `"app.windows[0].title": "Archiva"`
- `"app.windows[0].width": 1280`, `"height": 800`
- `"bundle.targets": ["dmg", "app"]`
- `"bundle.category": "public.app-category.photography"`

- [ ] **Step 5: Install npm dependencies**

Run: `npm install`
Expected: creates `node_modules/`, populates `package-lock.json`. No errors.

- [ ] **Step 6: Smoke-test Rust build**

Run: `cd src-tauri && cargo build && cd ..`
Expected: builds without errors (will download Tauri crates — slow first run).

- [ ] **Step 7: Commit scaffold**

```bash
git add -A
git commit -m "chore: scaffold tauri 2 + react + typescript app

- create-tauri-app template react-ts
- identifier com.archiva.app
- product name Archiva"
```

---

## Task 2: Install frontend dependencies (Tailwind, Radix, Zustand, @tanstack/virtual)

**Files:**
- Modify: `package.json`, `postcss.config.js` (create), `tailwind.config.js` (create), `src/index.css` (create or overwrite), `src/main.tsx`.

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install zustand @tanstack/react-virtual @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-context-menu @radix-ui/react-tooltip @radix-ui/react-separator @tauri-apps/plugin-dialog clsx
```

- [ ] **Step 2: Install dev dependencies**

Run:
```bash
npm install -D tailwindcss@^3 postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Initialize Tailwind**

Run: `npx tailwindcss init -p`
Expected: creates `tailwind.config.js` and `postcss.config.js`.

Overwrite `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1114",
        panel: "#16181d",
        border: "#252830",
        muted: "#8b8f98",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 4: Replace `src/index.css` with Tailwind directives**

Overwrite `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
  background: #0f1114;
  color: #e6e8ec;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}
```

- [ ] **Step 5: Ensure main.tsx imports index.css (not App.css)**

Edit `src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Delete `src/App.css` if it exists. Remove any `import "./App.css"` from `App.tsx`.

- [ ] **Step 6: Verify Tailwind compiles**

Replace `src/App.tsx` body with a minimal check:
```tsx
export default function App() {
  return <div className="h-screen w-screen flex items-center justify-center text-2xl text-white">Archiva</div>;
}
```

Run: `npm run dev`
Open `http://localhost:1420/` — should see "Archiva" centered on dark background. Kill the dev server (`Ctrl+C`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: install tailwind, radix, zustand, virtual, vitest

Tailwind 3 configured with dark theme tokens. Radix primitives for
dialog/dropdown/context-menu/tooltip/separator. Zustand, @tanstack/react-virtual,
plugin-dialog. Vitest + RTL for frontend unit tests."
```

---

## Task 3: Add Rust crates and Tauri plugins

**Files:**
- Modify: `src-tauri/Cargo.toml`.

- [ ] **Step 1: Edit Cargo.toml dependencies**

Open `src-tauri/Cargo.toml`. Replace the `[dependencies]` section with:
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "sync"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "macros"] }
walkdir = "2"
kamadak-exif = "0.5"
image = { version = "0.25", default-features = false, features = ["jpeg", "png"] }
uuid = { version = "1", features = ["v4"] }
anyhow = "1"
thiserror = "2"
chrono = { version = "0.4", features = ["serde"] }
log = "0.4"
env_logger = "0.11"

[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "sync", "test-util"] }
```

Keep the existing `[build-dependencies]` `tauri-build` entry as generated.

- [ ] **Step 2: Verify the crate compiles**

Run: `cd src-tauri && cargo build && cd ..`
Expected: all crates download and compile. No errors. Warnings about unused deps are fine (will be used in later tasks).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(rust): add sqlx, walkdir, exif, image, uuid, chrono deps"
```

---

## Task 4: Database module — pool setup + schema migration

**Files:**
- Create: `src-tauri/src/db.rs`, `src-tauri/tests/db_init.rs`.
- Modify: `src-tauri/src/lib.rs` (declare module + helper).

- [ ] **Step 1: Write the failing integration test**

Create `src-tauri/tests/db_init.rs`:
```rust
use archiva_lib::db;
use sqlx::Row;

#[tokio::test]
async fn migration_creates_all_tables() {
    let pool = db::connect_in_memory().await.expect("pool");
    db::migrate(&pool).await.expect("migrate");

    let tables: Vec<String> = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .unwrap()
    .into_iter()
    .map(|row| row.get::<String, _>("name"))
    .collect();

    assert!(tables.contains(&"photos".to_string()));
    assert!(tables.contains(&"albums".to_string()));
    assert!(tables.contains(&"album_photos".to_string()));
    assert!(tables.contains(&"smart_album_rules".to_string()));
    assert!(tables.contains(&"folders".to_string()));
}

#[tokio::test]
async fn migration_is_idempotent() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();
    db::migrate(&pool).await.unwrap();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test db_init && cd ..`
Expected: FAILS — `db` module does not exist.

- [ ] **Step 3: Create `db.rs`**

Create `src-tauri/src/db.rs`:
```rust
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS photos (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    filename      TEXT NOT NULL,
    ext           TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    created_at    TEXT,
    modified_at   TEXT,
    imported_at   TEXT NOT NULL,
    camera_make   TEXT,
    camera_model  TEXT,
    lens_model    TEXT,
    focal_length  REAL,
    aperture      REAL,
    shutter_speed TEXT,
    iso           INTEGER,
    latitude      REAL,
    longitude     REAL,
    altitude      REAL,
    rating        INTEGER DEFAULT 0,
    flag          INTEGER DEFAULT 0,
    color_label   TEXT,
    is_favorite   INTEGER DEFAULT 0,
    thumb_path    TEXT,
    thumb_ready   INTEGER DEFAULT 0
);

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

CREATE TABLE IF NOT EXISTS album_photos (
    album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    photo_id   TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    added_at   TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (album_id, photo_id)
);

CREATE TABLE IF NOT EXISTS smart_album_rules (
    id         TEXT PRIMARY KEY,
    album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    field      TEXT NOT NULL,
    operator   TEXT NOT NULL,
    value      TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS folders (
    id              TEXT PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    last_scanned_at TEXT,
    auto_scan       INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_photos_created_at   ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_rating       ON photos(rating);
CREATE INDEX IF NOT EXISTS idx_photos_flag         ON photos(flag);
CREATE INDEX IF NOT EXISTS idx_photos_camera_model ON photos(camera_model);
CREATE INDEX IF NOT EXISTS idx_photos_latitude     ON photos(latitude);
CREATE INDEX IF NOT EXISTS idx_album_photos_album  ON album_photos(album_id);
"#;

pub async fn connect_file(db_path: &Path) -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.display()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await?;
    Ok(pool)
}

pub async fn connect_in_memory() -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")?.foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await?;
    Ok(pool)
}

pub async fn migrate(pool: &SqlitePool) -> anyhow::Result<()> {
    for stmt in SCHEMA.split(';') {
        let trimmed = stmt.trim();
        if trimmed.is_empty() {
            continue;
        }
        sqlx::query(trimmed).execute(pool).await?;
    }
    Ok(())
}
```

- [ ] **Step 4: Declare module in lib.rs**

Replace `src-tauri/src/lib.rs` with:
```rust
pub mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd src-tauri && cargo test --test db_init && cd ..`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/lib.rs src-tauri/tests/db_init.rs
git commit -m "feat(db): sqlite pool + idempotent schema migration

Raw sqlx, WAL mode, foreign keys on. connect_file for production,
connect_in_memory for tests."
```

---

## Task 5: Shared types (Photo, PhotoEntry, ExifData)

**Files:**
- Create: `src-tauri/src/types.rs`.
- Modify: `src-tauri/src/lib.rs`.

- [ ] **Step 1: Create types.rs**

Create `src-tauri/src/types.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Photo {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub ext: String,
    pub size_bytes: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub imported_at: String,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
    pub rating: i64,
    pub flag: i64,
    pub color_label: Option<String>,
    pub is_favorite: i64,
    pub thumb_path: Option<String>,
    pub thumb_ready: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExifData {
    pub created_at: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub inserted: usize,
    pub skipped: usize,
    pub photo_ids: Vec<String>,
}
```

- [ ] **Step 2: Declare module**

Edit `src-tauri/src/lib.rs` — add `pub mod types;` above `pub mod db;`.

- [ ] **Step 3: Build check**

Run: `cd src-tauri && cargo build && cd ..`
Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/types.rs src-tauri/src/lib.rs
git commit -m "feat(types): Photo, ExifData, ScanResult structs"
```

---

## Task 6: EXIF extraction (metadata.rs)

**Files:**
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/metadata.rs`, `src-tauri/tests/exif_parse.rs`, `src-tauri/tests/common/mod.rs`, `src-tauri/tests/common/fixtures.rs`.
- Modify: `src-tauri/src/lib.rs`.

- [ ] **Step 1: Create test fixture helper**

Create `src-tauri/tests/common/mod.rs`:
```rust
pub mod fixtures;
```

Create `src-tauri/tests/common/fixtures.rs`:
```rust
use image::{ImageBuffer, Rgb};
use std::path::Path;

pub fn write_solid_jpeg(path: &Path, w: u32, h: u32, rgb: [u8; 3]) {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_fn(w, h, |_, _| Rgb(rgb));
    img.save_with_format(path, image::ImageFormat::Jpeg)
        .expect("write jpeg fixture");
}

pub fn write_solid_png(path: &Path, w: u32, h: u32, rgb: [u8; 3]) {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_fn(w, h, |_, _| Rgb(rgb));
    img.save_with_format(path, image::ImageFormat::Png)
        .expect("write png fixture");
}
```

- [ ] **Step 2: Write the failing EXIF test**

Create `src-tauri/tests/exif_parse.rs`:
```rust
mod common;

use archiva_lib::commands::metadata;
use common::fixtures;
use tempfile::TempDir;

#[test]
fn returns_default_for_file_without_exif() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("plain.jpg");
    fixtures::write_solid_jpeg(&path, 64, 48, [255, 0, 0]);

    let exif = metadata::read_exif(&path);
    assert!(exif.camera_make.is_none());
    assert!(exif.camera_model.is_none());
}

#[test]
fn returns_default_for_nonexistent_file() {
    let exif = metadata::read_exif(std::path::Path::new("/does/not/exist.jpg"));
    assert!(exif.camera_make.is_none());
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test exif_parse && cd ..`
Expected: FAILS — `commands::metadata` does not exist.

- [ ] **Step 4: Create commands module**

Create `src-tauri/src/commands/mod.rs`:
```rust
pub mod metadata;
```

Create `src-tauri/src/commands/metadata.rs`:
```rust
use crate::types::ExifData;
use exif::{In, Reader, Tag, Value};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

pub fn read_exif(path: &Path) -> ExifData {
    let Ok(file) = File::open(path) else {
        return ExifData::default();
    };
    let mut buf = BufReader::new(&file);
    let Ok(exif) = Reader::new().read_from_container(&mut buf) else {
        return ExifData::default();
    };

    let mut out = ExifData::default();

    out.camera_make = string_field(&exif, Tag::Make);
    out.camera_model = string_field(&exif, Tag::Model);
    out.lens_model = string_field(&exif, Tag::LensModel);
    out.created_at = string_field(&exif, Tag::DateTimeOriginal)
        .and_then(|s| parse_exif_datetime(&s));

    out.width = u_field(&exif, Tag::PixelXDimension);
    out.height = u_field(&exif, Tag::PixelYDimension);

    out.focal_length = rational_field(&exif, Tag::FocalLength);
    out.aperture = rational_field(&exif, Tag::FNumber);
    out.shutter_speed = string_field(&exif, Tag::ExposureTime);
    out.iso = u_field(&exif, Tag::PhotographicSensitivity);

    out.latitude = gps_coord(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef, b'S');
    out.longitude = gps_coord(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef, b'W');
    out.altitude = rational_field(&exif, Tag::GPSAltitude);

    out
}

fn string_field(exif: &exif::Exif, tag: Tag) -> Option<String> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    let s = field.display_value().to_string();
    let trimmed = s.trim_matches('"').trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn u_field(exif: &exif::Exif, tag: Tag) -> Option<i64> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    match field.value {
        Value::Short(ref v) => v.first().map(|n| *n as i64),
        Value::Long(ref v) => v.first().map(|n| *n as i64),
        _ => None,
    }
}

fn rational_field(exif: &exif::Exif, tag: Tag) -> Option<f64> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    match field.value {
        Value::Rational(ref v) => v.first().map(|r| r.to_f64()),
        _ => None,
    }
}

fn gps_coord(
    exif: &exif::Exif,
    coord_tag: Tag,
    ref_tag: Tag,
    negative_ref: u8,
) -> Option<f64> {
    let field = exif.get_field(coord_tag, In::PRIMARY)?;
    let Value::Rational(ref rationals) = field.value else {
        return None;
    };
    if rationals.len() < 3 {
        return None;
    }
    let degrees = rationals[0].to_f64();
    let minutes = rationals[1].to_f64();
    let seconds = rationals[2].to_f64();
    let mut decimal = degrees + minutes / 60.0 + seconds / 3600.0;

    if let Some(ref_field) = exif.get_field(ref_tag, In::PRIMARY) {
        if let Value::Ascii(ref bytes) = ref_field.value {
            if bytes.first().and_then(|b| b.first()).copied() == Some(negative_ref) {
                decimal = -decimal;
            }
        }
    }
    Some(decimal)
}

fn parse_exif_datetime(s: &str) -> Option<String> {
    use chrono::NaiveDateTime;
    let dt = NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S").ok()?;
    Some(dt.and_utc().to_rfc3339())
}
```

- [ ] **Step 5: Declare commands module in lib.rs**

Edit `src-tauri/src/lib.rs` — add `pub mod commands;` below `pub mod types;`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --test exif_parse && cd ..`
Expected: both tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/commands/metadata.rs src-tauri/src/lib.rs src-tauri/tests/exif_parse.rs src-tauri/tests/common/
git commit -m "feat(metadata): exif reader returns ExifData, nones on failure

kamadak-exif via read_from_container. GPS coords converted to signed
decimal. DateTimeOriginal normalized to ISO 8601 UTC."
```

---

## Task 7: scan_folder command

**Files:**
- Create: `src-tauri/src/commands/photos.rs`, `src-tauri/tests/scan_folder.rs`.
- Modify: `src-tauri/src/commands/mod.rs`.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/tests/scan_folder.rs`:
```rust
mod common;

use archiva_lib::commands::photos::scan_folder_impl;
use archiva_lib::db;
use common::fixtures;
use sqlx::Row;
use tempfile::TempDir;

#[tokio::test]
async fn indexes_jpg_and_png_and_ignores_other_files() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let dir = TempDir::new().unwrap();
    fixtures::write_solid_jpeg(&dir.path().join("a.jpg"), 32, 32, [200, 50, 50]);
    fixtures::write_solid_png(&dir.path().join("b.png"), 32, 32, [50, 200, 50]);
    std::fs::write(dir.path().join("readme.txt"), "skip me").unwrap();

    let result = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(result.inserted, 2);
    assert_eq!(result.photo_ids.len(), 2);

    let count: i64 = sqlx::query("SELECT COUNT(*) AS c FROM photos")
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("c");
    assert_eq!(count, 2);
}

#[tokio::test]
async fn rescanning_same_folder_skips_existing() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let dir = TempDir::new().unwrap();
    fixtures::write_solid_jpeg(&dir.path().join("a.jpg"), 32, 32, [128, 128, 128]);

    let first = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(first.inserted, 1);

    let second = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(second.inserted, 0);
    assert_eq!(second.skipped, 1);
}

#[tokio::test]
async fn recurses_into_subdirectories() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let dir = TempDir::new().unwrap();
    let sub = dir.path().join("nested/deep");
    std::fs::create_dir_all(&sub).unwrap();
    fixtures::write_solid_jpeg(&sub.join("x.jpg"), 32, 32, [0, 0, 0]);

    let result = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(result.inserted, 1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test scan_folder && cd ..`
Expected: FAILS — `commands::photos` does not exist.

- [ ] **Step 3: Implement scan_folder**

Create `src-tauri/src/commands/photos.rs`:
```rust
use crate::commands::metadata;
use crate::types::{Photo, ScanResult};
use anyhow::Context;
use chrono::Utc;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use walkdir::WalkDir;

const INDEXED_EXTS: &[&str] = &["jpg", "jpeg", "png", "heic"];

pub async fn scan_folder_impl(root: &Path, pool: &SqlitePool) -> anyhow::Result<ScanResult> {
    let mut result = ScanResult {
        inserted: 0,
        skipped: 0,
        photo_ids: Vec::new(),
    };

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Some(ext) = ext_lower(path) else { continue };
        if !INDEXED_EXTS.contains(&ext.as_str()) {
            continue;
        }

        let path_str = path.to_string_lossy().to_string();
        let existing: Option<(String,)> =
            sqlx::query_as("SELECT id FROM photos WHERE path = ?")
                .bind(&path_str)
                .fetch_optional(pool)
                .await?;
        if existing.is_some() {
            result.skipped += 1;
            continue;
        }

        match index_one(path, &ext, pool).await {
            Ok(id) => {
                result.inserted += 1;
                result.photo_ids.push(id);
            }
            Err(e) => {
                log::warn!("failed to index {}: {e:#}", path.display());
            }
        }
    }

    Ok(result)
}

async fn index_one(path: &Path, ext: &str, pool: &SqlitePool) -> anyhow::Result<String> {
    let id = Uuid::new_v4().to_string();
    let path_str = path.to_string_lossy().to_string();
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let meta = std::fs::metadata(path).with_context(|| format!("stat {}", path.display()))?;
    let size_bytes = meta.len() as i64;
    let modified_at = meta
        .modified()
        .ok()
        .and_then(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339().into());
    let imported_at = Utc::now().to_rfc3339();

    let exif = metadata::read_exif(path);

    sqlx::query(
        r#"
        INSERT INTO photos (
            id, path, filename, ext, size_bytes, width, height,
            created_at, modified_at, imported_at,
            camera_make, camera_model, lens_model,
            focal_length, aperture, shutter_speed, iso,
            latitude, longitude, altitude
        )
        VALUES (?, ?, ?, ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&path_str)
    .bind(&filename)
    .bind(ext)
    .bind(size_bytes)
    .bind(exif.width)
    .bind(exif.height)
    .bind(&exif.created_at)
    .bind(&modified_at)
    .bind(&imported_at)
    .bind(&exif.camera_make)
    .bind(&exif.camera_model)
    .bind(&exif.lens_model)
    .bind(exif.focal_length)
    .bind(exif.aperture)
    .bind(&exif.shutter_speed)
    .bind(exif.iso)
    .bind(exif.latitude)
    .bind(exif.longitude)
    .bind(exif.altitude)
    .execute(pool)
    .await?;

    Ok(id)
}

fn ext_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
}

pub async fn list_photos_impl(pool: &SqlitePool) -> anyhow::Result<Vec<Photo>> {
    let rows: Vec<Photo> = sqlx::query_as::<_, PhotoRow>(
        "SELECT * FROM photos ORDER BY COALESCE(created_at, imported_at) DESC",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(Into::into)
    .collect();
    Ok(rows)
}

#[derive(sqlx::FromRow)]
struct PhotoRow {
    id: String,
    path: String,
    filename: String,
    ext: String,
    size_bytes: i64,
    width: Option<i64>,
    height: Option<i64>,
    created_at: Option<String>,
    modified_at: Option<String>,
    imported_at: String,
    camera_make: Option<String>,
    camera_model: Option<String>,
    lens_model: Option<String>,
    focal_length: Option<f64>,
    aperture: Option<f64>,
    shutter_speed: Option<String>,
    iso: Option<i64>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude: Option<f64>,
    rating: i64,
    flag: i64,
    color_label: Option<String>,
    is_favorite: i64,
    thumb_path: Option<String>,
    thumb_ready: i64,
}

impl From<PhotoRow> for Photo {
    fn from(r: PhotoRow) -> Self {
        Photo {
            id: r.id,
            path: r.path,
            filename: r.filename,
            ext: r.ext,
            size_bytes: r.size_bytes,
            width: r.width,
            height: r.height,
            created_at: r.created_at,
            modified_at: r.modified_at,
            imported_at: r.imported_at,
            camera_make: r.camera_make,
            camera_model: r.camera_model,
            lens_model: r.lens_model,
            focal_length: r.focal_length,
            aperture: r.aperture,
            shutter_speed: r.shutter_speed,
            iso: r.iso,
            latitude: r.latitude,
            longitude: r.longitude,
            altitude: r.altitude,
            rating: r.rating,
            flag: r.flag,
            color_label: r.color_label,
            is_favorite: r.is_favorite,
            thumb_path: r.thumb_path,
            thumb_ready: r.thumb_ready,
        }
    }
}
```

- [ ] **Step 4: Register module**

Edit `src-tauri/src/commands/mod.rs`:
```rust
pub mod metadata;
pub mod photos;
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd src-tauri && cargo test --test scan_folder && cd ..`
Expected: all three tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/tests/scan_folder.rs
git commit -m "feat(scan): scan_folder_impl indexes jpg/png/heic, skips dups

Walks recursively, extracts EXIF, inserts photos row per file.
list_photos_impl returns by created_at desc (imported_at fallback).
Path uniqueness enforced via UNIQUE constraint + pre-check."
```

---

## Task 8: Thumbnail generation (JPG/PNG via image, HEIC via sips)

**Files:**
- Create: `src-tauri/src/commands/thumbnails.rs`, `src-tauri/tests/thumbnails.rs`.
- Modify: `src-tauri/src/commands/mod.rs`.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/tests/thumbnails.rs`:
```rust
mod common;

use archiva_lib::commands::photos::scan_folder_impl;
use archiva_lib::commands::thumbnails::generate_thumbnail_impl;
use archiva_lib::db;
use common::fixtures;
use image::GenericImageView;
use tempfile::TempDir;

#[tokio::test]
async fn generates_jpeg_thumbnail_under_target_size() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let src_dir = TempDir::new().unwrap();
    fixtures::write_solid_jpeg(&src_dir.path().join("big.jpg"), 2048, 1024, [10, 20, 30]);

    let thumb_dir = TempDir::new().unwrap();

    let scanned = scan_folder_impl(src_dir.path(), &pool).await.unwrap();
    let photo_id = scanned.photo_ids[0].clone();

    let thumb_path =
        generate_thumbnail_impl(&photo_id, thumb_dir.path(), &pool)
            .await
            .unwrap();

    let img = image::open(&thumb_path).unwrap();
    let (w, h) = img.dimensions();
    assert!(w <= 256 && h <= 256, "thumb too big: {w}x{h}");
    assert!(w == 256 || h == 256, "thumb should hit target on long edge");

    let row: (i64, Option<String>) =
        sqlx::query_as("SELECT thumb_ready, thumb_path FROM photos WHERE id = ?")
            .bind(&photo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row.0, 1);
    assert!(row.1.unwrap().ends_with(".jpg"));
}

#[tokio::test]
async fn generates_thumbnail_for_png() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let src_dir = TempDir::new().unwrap();
    fixtures::write_solid_png(&src_dir.path().join("p.png"), 1024, 2048, [90, 90, 90]);

    let thumb_dir = TempDir::new().unwrap();
    let scanned = scan_folder_impl(src_dir.path(), &pool).await.unwrap();
    let thumb_path =
        generate_thumbnail_impl(&scanned.photo_ids[0], thumb_dir.path(), &pool)
            .await
            .unwrap();
    assert!(thumb_path.exists());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test thumbnails && cd ..`
Expected: FAILS — `commands::thumbnails` does not exist.

- [ ] **Step 3: Implement thumbnails.rs**

Create `src-tauri/src/commands/thumbnails.rs`:
```rust
use anyhow::{anyhow, Context};
use image::imageops::FilterType;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

pub const THUMB_MAX_EDGE: u32 = 256;

pub async fn generate_thumbnail_impl(
    photo_id: &str,
    thumb_dir: &Path,
    pool: &SqlitePool,
) -> anyhow::Result<PathBuf> {
    let (source_path, ext): (String, String) =
        sqlx::query_as("SELECT path, ext FROM photos WHERE id = ?")
            .bind(photo_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow!("photo not found: {photo_id}"))?;

    tokio::fs::create_dir_all(thumb_dir).await?;
    let dest = thumb_dir.join(format!("{photo_id}.jpg"));

    if ext == "heic" {
        render_heic_thumb(Path::new(&source_path), &dest)?;
    } else {
        render_image_crate_thumb(Path::new(&source_path), &dest)?;
    }

    let dest_str = dest.to_string_lossy().to_string();
    sqlx::query("UPDATE photos SET thumb_path = ?, thumb_ready = 1 WHERE id = ?")
        .bind(&dest_str)
        .bind(photo_id)
        .execute(pool)
        .await?;

    Ok(dest)
}

fn render_image_crate_thumb(src: &Path, dest: &Path) -> anyhow::Result<()> {
    let img = image::open(src).with_context(|| format!("open {}", src.display()))?;
    let resized = img.resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, FilterType::Lanczos3);
    resized
        .to_rgb8()
        .save_with_format(dest, image::ImageFormat::Jpeg)
        .with_context(|| format!("save {}", dest.display()))?;
    Ok(())
}

fn render_heic_thumb(src: &Path, dest: &Path) -> anyhow::Result<()> {
    let output = std::process::Command::new("sips")
        .args([
            "-s",
            "format",
            "jpeg",
            "-Z",
            &THUMB_MAX_EDGE.to_string(),
        ])
        .arg(src)
        .arg("--out")
        .arg(dest)
        .output()
        .context("sips failed to launch")?;
    if !output.status.success() {
        return Err(anyhow!(
            "sips exit {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}
```

- [ ] **Step 4: Register module**

Edit `src-tauri/src/commands/mod.rs`:
```rust
pub mod metadata;
pub mod photos;
pub mod thumbnails;
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd src-tauri && cargo test --test thumbnails && cd ..`
Expected: both tests PASS. (HEIC path is not covered by unit tests — exercised manually in Task 14.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/tests/thumbnails.rs
git commit -m "feat(thumbnails): generate_thumbnail_impl for jpg/png/heic

image crate + Lanczos3 for jpg/png. sips -Z 256 -s format jpeg for HEIC.
Updates thumb_path + thumb_ready in photos row. 256px max edge, jpeg q85 implicit."
```

---

## Task 9: Register Tauri commands in lib.rs with DB bootstrapping

**Files:**
- Modify: `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`.
- Create: command wrappers inside `src-tauri/src/commands/photos.rs` and `src-tauri/src/commands/thumbnails.rs`.

- [ ] **Step 1: Add #[tauri::command] wrappers to photos.rs**

Append to `src-tauri/src/commands/photos.rs`:
```rust
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn scan_folder(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<ScanResult, String> {
    let pool_inner = pool.inner().clone();
    let path_buf = std::path::PathBuf::from(&path);
    let result = scan_folder_impl(&path_buf, &pool_inner)
        .await
        .map_err(|e| e.to_string())?;

    // Kick off thumbnail generation in the background — fire-and-forget per photo.
    let thumb_dir = crate::commands::thumbnails::thumb_dir(&app).map_err(|e| e.to_string())?;
    for id in result.photo_ids.clone() {
        let pool_clone = pool_inner.clone();
        let dir_clone = thumb_dir.clone();
        let id_clone = id.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::commands::thumbnails::generate_thumbnail_impl(
                &id_clone,
                &dir_clone,
                &pool_clone,
            )
            .await
            {
                log::warn!("thumb failed {id_clone}: {e:#}");
            }
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn list_photos(pool: State<'_, SqlitePool>) -> Result<Vec<Photo>, String> {
    list_photos_impl(pool.inner()).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Add helper + command wrapper to thumbnails.rs**

Append to `src-tauri/src/commands/thumbnails.rs`:
```rust
use tauri::{AppHandle, Manager, State};

pub fn thumb_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .context("app_data_dir unavailable")?;
    Ok(data_dir.join("thumbs"))
}

#[tauri::command]
pub async fn generate_thumbnail(
    photo_id: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<String, String> {
    let dir = thumb_dir(&app).map_err(|e| e.to_string())?;
    let path = generate_thumbnail_impl(&photo_id, &dir, pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 3: Wire up run() with DB setup + handler registration**

Replace `src-tauri/src/lib.rs` contents:
```rust
pub mod commands;
pub mod db;
pub mod types;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app_data_dir");
            std::fs::create_dir_all(&data_dir).expect("create app_data_dir");
            let db_path = data_dir.join("archiva.db");

            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::connect_file(&db_path).await.expect("connect db");
                db::migrate(&pool).await.expect("migrate db");
                handle.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::photos::scan_folder,
            commands::photos::list_photos,
            commands::thumbnails::generate_thumbnail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Grant filesystem read for thumbs via Tauri asset protocol**

Tauri 2 blocks arbitrary file URLs; the frontend needs to load thumbnails via the `asset:` protocol. Enable it by editing `src-tauri/tauri.conf.json` — inside `app.security`, add:
```json
"security": {
  "csp": null,
  "assetProtocol": {
    "enable": true,
    "scope": ["$APPDATA/**", "$APPLOCALDATA/**"]
  }
}
```

Edit `src-tauri/capabilities/default.json` — in the `permissions` array ensure these entries exist (append if missing):
```json
"dialog:allow-open",
"core:path:default",
"core:window:default",
"core:app:default"
```

- [ ] **Step 5: Build and confirm the app compiles**

Run: `cd src-tauri && cargo build && cd ..`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands/ src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat(tauri): register scan_folder, list_photos, generate_thumbnail

DB pool bootstrapped in setup hook and managed as app state.
scan_folder spawns background thumbnail jobs per indexed photo.
Asset protocol enabled for \$APPDATA so frontend can display thumbs."
```

---

## Task 10: Frontend shared types + Tauri command bindings

**Files:**
- Create: `src/types/index.ts`, `src/lib/tauri.ts`.

- [ ] **Step 1: Mirror Rust Photo as TS Photo**

Create `src/types/index.ts`:
```ts
export interface Photo {
  id: string;
  path: string;
  filename: string;
  ext: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string | null;
  modified_at: string | null;
  imported_at: string;
  camera_make: string | null;
  camera_model: string | null;
  lens_model: string | null;
  focal_length: number | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  rating: number;
  flag: number;
  color_label: string | null;
  is_favorite: number;
  thumb_path: string | null;
  thumb_ready: number;
}

export interface ScanResult {
  inserted: number;
  skipped: number;
  photo_ids: string[];
}
```

- [ ] **Step 2: Thin command binding module**

Create `src/lib/tauri.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Photo, ScanResult } from "../types";

export const scanFolder = (path: string) =>
  invoke<ScanResult>("scan_folder", { path });

export const listPhotos = () => invoke<Photo[]>("list_photos");

export const generateThumbnail = (photoId: string) =>
  invoke<string>("generate_thumbnail", { photoId });

export const thumbUrl = (thumbPath: string) => convertFileSrc(thumbPath);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (may need to accept that `@tauri-apps/api/core` exists — create-tauri-app ships it).

- [ ] **Step 4: Commit**

```bash
git add src/types/ src/lib/
git commit -m "feat(frontend): types + invoke bindings for scan/list/thumbnail"
```

---

## Task 11: Zustand store

**Files:**
- Create: `src/store/useLibraryStore.ts`, `src/store/useLibraryStore.test.ts`.
- Modify: `package.json` (add test script), `vite.config.ts` (vitest config).

- [ ] **Step 1: Wire vitest**

Edit `vite.config.ts` — add at top `/// <reference types="vitest" />` and inside `defineConfig` add:
```ts
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: ["./src/test/setup.ts"],
},
```

Create `src/test/setup.ts`:
```ts
import "@testing-library/jest-dom";
```

Edit `package.json` scripts — add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write failing store tests**

Create `src/store/useLibraryStore.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "./useLibraryStore";
import type { Photo } from "../types";

const mkPhoto = (id: string): Photo => ({
  id,
  path: `/p/${id}.jpg`,
  filename: `${id}.jpg`,
  ext: "jpg",
  size_bytes: 0,
  width: null,
  height: null,
  created_at: null,
  modified_at: null,
  imported_at: "2026-01-01T00:00:00Z",
  camera_make: null,
  camera_model: null,
  lens_model: null,
  focal_length: null,
  aperture: null,
  shutter_speed: null,
  iso: null,
  latitude: null,
  longitude: null,
  altitude: null,
  rating: 0,
  flag: 0,
  color_label: null,
  is_favorite: 0,
  thumb_path: null,
  thumb_ready: 0,
});

describe("useLibraryStore", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      photos: [],
      albums: [],
      selectedIds: new Set(),
      activeAlbumId: null,
      activePhotoId: null,
    });
  });

  it("setPhotos replaces list", () => {
    useLibraryStore.getState().setPhotos([mkPhoto("a"), mkPhoto("b")]);
    expect(useLibraryStore.getState().photos).toHaveLength(2);
  });

  it("selectPhoto sets single selection and clears prior", () => {
    const s = useLibraryStore.getState();
    s.selectPhoto("a");
    s.selectPhoto("b");
    expect(useLibraryStore.getState().selectedIds).toEqual(new Set(["b"]));
    expect(useLibraryStore.getState().activePhotoId).toBe("b");
  });

  it("toggleSelect adds and removes", () => {
    const s = useLibraryStore.getState();
    s.toggleSelect("a");
    s.toggleSelect("b");
    expect(useLibraryStore.getState().selectedIds).toEqual(new Set(["a", "b"]));
    s.toggleSelect("a");
    expect(useLibraryStore.getState().selectedIds).toEqual(new Set(["b"]));
  });

  it("clearSelection empties set and nulls active", () => {
    const s = useLibraryStore.getState();
    s.toggleSelect("a");
    s.clearSelection();
    expect(useLibraryStore.getState().selectedIds.size).toBe(0);
    expect(useLibraryStore.getState().activePhotoId).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test`
Expected: FAIL — `useLibraryStore` does not exist.

- [ ] **Step 4: Implement the store**

Create `src/store/useLibraryStore.ts`:
```ts
import { create } from "zustand";
import type { Photo } from "../types";

export interface Album {
  id: string;
  name: string;
}

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

export const useLibraryStore = create<LibraryStore>((set) => ({
  photos: [],
  albums: [],
  selectedIds: new Set<string>(),
  activeAlbumId: null,
  activePhotoId: null,

  setPhotos: (photos) => set({ photos }),
  setAlbums: (albums) => set({ albums }),
  selectPhoto: (id) =>
    set({ selectedIds: new Set([id]), activePhotoId: id }),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const lastActive = next.has(id) ? id : s.activePhotoId;
      return { selectedIds: next, activePhotoId: lastActive };
    }),
  clearSelection: () => set({ selectedIds: new Set(), activePhotoId: null }),
  setActiveAlbum: (id) => set({ activeAlbumId: id }),
}));
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `npm run test`
Expected: all four store tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/ src/test/ vite.config.ts package.json package-lock.json
git commit -m "feat(store): zustand library store with selection + active state

Vitest + jsdom configured. Store covers photos, albums (phase 2 stub),
single/multi select, active album/photo."
```

---

## Task 12: usePhotos hook

**Files:**
- Create: `src/hooks/usePhotos.ts`.

- [ ] **Step 1: Implement hook**

Create `src/hooks/usePhotos.ts`:
```ts
import { useCallback, useEffect, useState } from "react";
import { listPhotos, scanFolder } from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";

export function usePhotos() {
  const setPhotos = useLibraryStore((s) => s.setPhotos);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const photos = await listPhotos();
      setPhotos(photos);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [setPhotos]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scan = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await scanFolder(path);
        await refresh();
        return res;
      } catch (e) {
        setError(String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  return { refresh, scan, loading, error };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/
git commit -m "feat(hooks): usePhotos wraps scan_folder + list_photos

Auto-loads photos on mount. scan() triggers backend scan then refresh.
Components never call invoke directly."
```

---

## Task 13: PhotoThumb + PhotoGrid (virtualized)

**Files:**
- Create: `src/components/PhotoThumb.tsx`, `src/components/PhotoGrid.tsx`.

- [ ] **Step 1: Create PhotoThumb**

Create `src/components/PhotoThumb.tsx`:
```tsx
import { useEffect, useState } from "react";
import { generateThumbnail, thumbUrl } from "../lib/tauri";
import type { Photo } from "../types";
import clsx from "clsx";

interface Props {
  photo: Photo;
  selected: boolean;
  onClick: () => void;
}

export function PhotoThumb({ photo, selected, onClick }: Props) {
  const [src, setSrc] = useState<string | null>(
    photo.thumb_ready && photo.thumb_path ? thumbUrl(photo.thumb_path) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (photo.thumb_ready && photo.thumb_path) {
      setSrc(thumbUrl(photo.thumb_path));
      return;
    }
    let cancelled = false;
    generateThumbnail(photo.id)
      .then((p) => {
        if (!cancelled) setSrc(thumbUrl(p));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.id, photo.thumb_ready, photo.thumb_path]);

  return (
    <button
      onClick={onClick}
      className={clsx(
        "relative aspect-square w-full overflow-hidden rounded bg-panel border",
        selected ? "border-white" : "border-border hover:border-muted",
      )}
      title={photo.filename}
    >
      {src ? (
        <img src={src} alt={photo.filename} className="h-full w-full object-cover" />
      ) : failed ? (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted">
          !
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-border" />
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create PhotoGrid (virtualized by row)**

Create `src/components/PhotoGrid.tsx`:
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { PhotoThumb } from "./PhotoThumb";
import { useLibraryStore } from "../store/useLibraryStore";

const THUMB_SIZE = 160;
const GAP = 8;

export function PhotoGrid() {
  const photos = useLibraryStore((s) => s.photos);
  const selectedIds = useLibraryStore((s) => s.selectedIds);
  const selectPhoto = useLibraryStore((s) => s.selectPhoto);
  const parentRef = useRef<HTMLDivElement>(null);

  const width = parentRef.current?.clientWidth ?? 800;
  const cols = Math.max(1, Math.floor((width + GAP) / (THUMB_SIZE + GAP)));
  const rows = Math.ceil(photos.length / cols);

  const rowVirtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => THUMB_SIZE + GAP,
    overscan: 4,
  });

  return (
    <div ref={parentRef} className="h-full w-full overflow-auto p-2">
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((row) => {
          const start = row.index * cols;
          const slice = photos.slice(start, start + cols);
          return (
            <div
              key={row.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: GAP,
              }}
            >
              {slice.map((photo) => (
                <PhotoThumb
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.has(photo.id)}
                  onClick={() => selectPhoto(photo.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/
git commit -m "feat(ui): virtualized PhotoGrid with PhotoThumb

Row-virtualized via @tanstack/react-virtual (cols computed from width,
overscan 4). PhotoThumb lazy-triggers backend thumbnail on miss, renders
via asset: protocol."
```

---

## Task 14: MetadataPanel + FolderPicker + Library page + App shell

**Files:**
- Create: `src/components/MetadataPanel.tsx`, `src/components/FolderPicker.tsx`, `src/pages/Library.tsx`.
- Modify: `src/App.tsx`.

- [ ] **Step 1: Create MetadataPanel**

Create `src/components/MetadataPanel.tsx`:
```tsx
import { useLibraryStore } from "../store/useLibraryStore";

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right break-all">{String(value)}</span>
    </div>
  );
}

export function MetadataPanel() {
  const activeId = useLibraryStore((s) => s.activePhotoId);
  const photo = useLibraryStore((s) =>
    s.photos.find((p) => p.id === activeId),
  );

  if (!photo) {
    return (
      <aside className="h-full w-80 border-l border-border bg-panel p-4 text-sm text-muted">
        Select a photo
      </aside>
    );
  }

  return (
    <aside className="h-full w-80 overflow-y-auto border-l border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">{photo.filename}</h2>
      <Row label="Dimensions" value={photo.width && photo.height ? `${photo.width} × ${photo.height}` : null} />
      <Row label="Size" value={`${(photo.size_bytes / 1024 / 1024).toFixed(2)} MB`} />
      <Row label="Captured" value={photo.created_at} />
      <Row label="Camera" value={[photo.camera_make, photo.camera_model].filter(Boolean).join(" ")} />
      <Row label="Lens" value={photo.lens_model} />
      <Row label="Focal" value={photo.focal_length ? `${photo.focal_length}mm` : null} />
      <Row label="Aperture" value={photo.aperture ? `f/${photo.aperture}` : null} />
      <Row label="Shutter" value={photo.shutter_speed} />
      <Row label="ISO" value={photo.iso} />
      <Row label="GPS" value={photo.latitude && photo.longitude ? `${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}` : null} />
      <Row label="Path" value={photo.path} />
    </aside>
  );
}
```

- [ ] **Step 2: Create FolderPicker**

Create `src/components/FolderPicker.tsx`:
```tsx
import { open } from "@tauri-apps/plugin-dialog";
import { usePhotos } from "../hooks/usePhotos";

export function FolderPicker() {
  const { scan, loading } = usePhotos();

  const onPick = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    await scan(selected);
  };

  return (
    <button
      onClick={onPick}
      disabled={loading}
      className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
    >
      {loading ? "Scanning…" : "Add folder"}
    </button>
  );
}
```

- [ ] **Step 3: Create Library page**

Create `src/pages/Library.tsx`:
```tsx
import { FolderPicker } from "../components/FolderPicker";
import { MetadataPanel } from "../components/MetadataPanel";
import { PhotoGrid } from "../components/PhotoGrid";
import { useLibraryStore } from "../store/useLibraryStore";

export function Library() {
  const count = useLibraryStore((s) => s.photos.length);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-2">
        <h1 className="text-sm font-semibold tracking-wide">Archiva</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{count} photos</span>
          <FolderPicker />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <PhotoGrid />
        </div>
        <MetadataPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace App.tsx**

Overwrite `src/App.tsx`:
```tsx
import { Library } from "./pages/Library";

export default function App() {
  return <Library />;
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ src/pages/ src/App.tsx
git commit -m "feat(ui): Library page shell — FolderPicker, PhotoGrid, MetadataPanel"
```

---

## Task 15: End-to-end manual smoke test

No code changes in this task — this is the integration checkpoint to verify the whole pipeline works on the user's Mac.

- [ ] **Step 1: Prepare a small test folder**

Pick (or create) a folder with ~10 mixed photos: a few JPGs with EXIF, one PNG, and at least one HEIC shot from an iPhone. Path example: `~/Pictures/archiva-smoke/`.

- [ ] **Step 2: Run the dev app**

Run: `npm run tauri dev`
Expected: Tauri compiles Rust (slow on first run), opens the Archiva window showing "0 photos".

- [ ] **Step 3: Click "Add folder", pick the test folder**

Expected behavior:
1. "Scanning…" flashes.
2. Count updates to match the number of photo files in the folder.
3. Thumbnails appear in the grid within a few seconds (they are generated in background tasks).
4. HEIC files display thumbnails (proves `sips` path works).
5. Clicking a photo populates the MetadataPanel: dimensions, size, camera make/model/lens, shutter, aperture, ISO, GPS (if present), path.

- [ ] **Step 4: Re-pick the same folder**

Expected: count stays the same; no duplicate rows (scan skips existing paths).

- [ ] **Step 5: Verify DB and thumb cache on disk**

Find `app_data_dir` on macOS (Archiva's data lives here):
```bash
ls -la ~/Library/Application\ Support/com.archiva.app/
ls ~/Library/Application\ Support/com.archiva.app/thumbs/ | head
```
Expected: `archiva.db` exists (~tens of KB), `thumbs/` contains one `{uuid}.jpg` per indexed photo.

- [ ] **Step 6: Log the findings**

If everything works, commit a note so future sessions know Phase 1 is verified:
```bash
git commit --allow-empty -m "chore: phase 1 smoke-tested on macOS

Verified scan → index → thumbnails → grid → metadata panel end-to-end.
JPG/PNG via image crate, HEIC via sips. De-duplication via path UNIQUE works."
```

If anything fails, don't patch around it — follow superpowers:systematic-debugging to isolate the cause and open a targeted fix in a new task.

---

## Self-Review Notes

**Spec coverage (checked against user message + CLAUDE.md):**
- Scaffold create-tauri-app React+TS → Task 1 ✓
- Install Tailwind, Radix, Zustand, @tanstack/virtual → Task 2 ✓
- Init SQLite DB on start using CLAUDE.md schema → Task 4 + Task 9 setup hook ✓
- `scan_folder(path: String)` with walkdir indexing JPG/PNG/HEIC → Task 7 + Task 9 ✓
- `generate_thumbnail(photo_id: String)` (sips HEIC, image crate others, cache to `app_data_dir/thumbs/`) → Task 8 + Task 9 ✓
- Zustand `useLibraryStore` with photos/albums/selectedIds/activeAlbumId → Task 11 ✓
- Virtualized photo grid → Task 13 ✓
- Bundle id `com.archiva.app` → Task 1 ✓
- DB path `app_data_dir/archiva.db` → Task 9 setup hook ✓
- Thumb cache path `app_data_dir/thumbs/` → Task 9 + Task 8 ✓
- Queues thumbnails after scan → Task 9 (`tokio::spawn` per photo_id) ✓
- Metadata panel (EXIF) → Task 14 ✓

**Placeholder scan:** clean — no TBDs, no "add error handling", no "similar to above". All code blocks are complete.

**Type consistency:** `ScanResult`/`Photo`/`ExifData` names match across Rust and TS. Function names (`scan_folder_impl`, `list_photos_impl`, `generate_thumbnail_impl`, `thumb_dir`) are consistent between file creation (Tasks 6–9) and call sites (later tasks).
