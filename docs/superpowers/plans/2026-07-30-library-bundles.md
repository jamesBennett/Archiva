# Switchable Library Bundles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Model requirement:** Dispatch every implementation subagent on **Opus 5** (`model: "opus"` in the Agent tool call). This is a user requirement, not a suggestion.

**Goal:** Replace the single fixed database with self-contained `.archivalib` bundle libraries the user can create, open, and hot-swap at runtime.

**Architecture:** A library is a macOS package directory containing `meta.json`, `catalog.db`, and `thumbs/`. The Tauri-managed state becomes `AppState { current: RwLock<Option<OpenLibrary>> }`; every command acquires the pool through it. Switching installs a new `OpenLibrary` and closes the old pool in a detached task. Frontend gates on `currentLibrary` and remounts the Library page keyed by library uuid.

**Tech Stack:** Rust (Tauri 2, sqlx/SQLite, tokio, serde, libc), React 19 + TypeScript strict, Zustand, Radix UI, vitest.

**Spec:** `docs/superpowers/specs/2026-07-30-library-bundles-design.md`

## Global Constraints

- Never move, rename, or modify original photo files.
- Raw SQL via sqlx — no ORM.
- All Tauri commands `async`, return `Result<T, String>`; `anyhow` internally, stringify at boundary.
- Frontend never calls `invoke` outside `src/lib/tauri.ts` / hooks in `src/hooks/`.
- Strict TypeScript, no `any`.
- Bundle extension: `archivalib`. Schema version constant: `1`.
- Legacy db (`app_data_dir()/archiva.db`) is copied, never moved, during migration; source renamed to `archiva.db.migrated` only after success.
- Rust verification per task: `cargo test` + `cargo clippy -- -D warnings` + `cargo fmt --check` (run in `src-tauri/`).
- Frontend verification per task: `npm test` + `npx tsc --noEmit`.
- Deviations from spec (approved): ⌥-at-launch and native File menu deferred — the LibrarySwitcher's "Switch Library…" covers forcing the picker.

---

### Task 1: Path-safe SQLite connection options

**Files:**
- Modify: `src-tauri/src/db.rs` (fn `connect_file`)
- Test: inline `#[cfg(test)]` module in `src-tauri/src/db.rs`

**Interfaces:**
- Produces: `db::connect_file(db_path: &Path) -> anyhow::Result<SqlitePool>` (signature unchanged, now safe for paths with spaces/`#`/`?`).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/db.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_file_handles_paths_with_spaces_and_hash() {
        let dir = tempfile::tempdir().unwrap();
        let weird = dir.path().join("My Photos #1");
        std::fs::create_dir_all(&weird).unwrap();
        let db_path = weird.join("catalog.db");

        let pool = connect_file(&db_path).await.unwrap();
        migrate(&pool).await.unwrap();

        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM photos")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0);
        pool.close().await;
        assert!(db_path.exists());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test connect_file_handles_paths`
Expected: FAIL — the `sqlite://` URL form mis-parses the `#` (error opening db or file created at wrong path).

- [ ] **Step 3: Switch to the builder form**

Replace the body of `connect_file`:

```rust
pub async fn connect_file(db_path: &Path) -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect_with(opts)
        .await?;
    Ok(pool)
}
```

Remove the now-unused `use std::str::FromStr;` import (keep it if `connect_in_memory` still needs it — it does, so leave the import alone).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "fix: use SqliteConnectOptions builder to survive special chars in db paths"
```

---

### Task 2: Library bundle module (`library.rs`)

**Files:**
- Create: `src-tauri/src/library.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod library;`)
- Modify: `src-tauri/Cargo.toml` (add `libc = "0.2"` to `[dependencies]`)
- Test: inline `#[cfg(test)]` module in `src-tauri/src/library.rs`

**Interfaces:**
- Produces:
  - `pub const SCHEMA_VERSION: u32 = 1;`
  - `pub const BUNDLE_EXT: &str = "archivalib";`
  - `pub struct LibraryMeta { pub uuid: String, pub name: String, pub schema_version: u32, pub created_at: String, pub app_version: String }` (derives `Debug, Clone, Serialize, Deserialize`)
  - `pub fn catalog_db_path(root: &Path) -> PathBuf` → `root.join("catalog.db")`
  - `pub fn thumb_dir(root: &Path) -> PathBuf` → `root.join("thumbs")`
  - `pub fn read_meta(root: &Path) -> anyhow::Result<LibraryMeta>`
  - `pub fn write_meta(root: &Path, meta: &LibraryMeta) -> anyhow::Result<()>`
  - `pub fn create_bundle(parent: &Path, name: &str) -> anyhow::Result<PathBuf>` — returns bundle root; errors if target exists
  - `pub fn validate_bundle(root: &Path) -> anyhow::Result<LibraryMeta>` — meta readable, `schema_version <= SCHEMA_VERSION`, local volume
  - `pub fn is_local_volume(path: &Path) -> anyhow::Result<bool>` — macOS `statfs` `MNT_LOCAL` check
- Consumes: nothing from other tasks.

- [ ] **Step 1: Add libc dependency**

In `src-tauri/Cargo.toml` under `[dependencies]` add:

```toml
libc = "0.2"
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/library.rs` with only the test module (types/fns referenced don't exist yet):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_bundle_produces_expected_layout() {
        let dir = tempfile::tempdir().unwrap();
        let root = create_bundle(dir.path(), "Test Library").unwrap();

        assert_eq!(root, dir.path().join("Test Library.archivalib"));
        assert!(root.join("Info.plist").is_file());
        assert!(root.join("meta.json").is_file());
        assert!(thumb_dir(&root).is_dir());

        let meta = read_meta(&root).unwrap();
        assert_eq!(meta.name, "Test Library");
        assert_eq!(meta.schema_version, SCHEMA_VERSION);
        assert!(!meta.uuid.is_empty());
    }

    #[test]
    fn create_bundle_refuses_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        create_bundle(dir.path(), "Dup").unwrap();
        assert!(create_bundle(dir.path(), "Dup").is_err());
    }

    #[test]
    fn validate_bundle_rejects_plain_directory() {
        let dir = tempfile::tempdir().unwrap();
        let err = validate_bundle(dir.path()).unwrap_err();
        assert!(err.to_string().contains("not an Archiva library"));
    }

    #[test]
    fn validate_bundle_rejects_future_schema_version() {
        let dir = tempfile::tempdir().unwrap();
        let root = create_bundle(dir.path(), "Future").unwrap();
        let mut meta = read_meta(&root).unwrap();
        meta.schema_version = SCHEMA_VERSION + 1;
        write_meta(&root, &meta).unwrap();

        let err = validate_bundle(&root).unwrap_err();
        assert!(err.to_string().contains("newer version"));
    }

    #[test]
    fn meta_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let root = create_bundle(dir.path(), "RT").unwrap();
        let meta = read_meta(&root).unwrap();
        write_meta(&root, &meta).unwrap();
        let again = read_meta(&root).unwrap();
        assert_eq!(again.uuid, meta.uuid);
        assert_eq!(again.created_at, meta.created_at);
    }

    #[test]
    fn tempdir_is_local_volume() {
        let dir = tempfile::tempdir().unwrap();
        assert!(is_local_volume(dir.path()).unwrap());
    }
}
```

Add `pub mod library;` to `src-tauri/src/lib.rs` (alongside `pub mod db;`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd src-tauri && cargo test library::`
Expected: COMPILE ERROR — `create_bundle` etc. not found.

- [ ] **Step 4: Implement the module**

Prepend to `src-tauri/src/library.rs` (above the test module):

```rust
use anyhow::{anyhow, bail, Context};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const SCHEMA_VERSION: u32 = 1;
pub const BUNDLE_EXT: &str = "archivalib";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryMeta {
    pub uuid: String,
    pub name: String,
    pub schema_version: u32,
    pub created_at: String,
    pub app_version: String,
}

pub fn catalog_db_path(root: &Path) -> PathBuf {
    root.join("catalog.db")
}

pub fn thumb_dir(root: &Path) -> PathBuf {
    root.join("thumbs")
}

fn meta_path(root: &Path) -> PathBuf {
    root.join("meta.json")
}

pub fn read_meta(root: &Path) -> anyhow::Result<LibraryMeta> {
    let raw = std::fs::read_to_string(meta_path(root))
        .with_context(|| format!("not an Archiva library: {}", root.display()))?;
    serde_json::from_str(&raw).context("invalid meta.json")
}

pub fn write_meta(root: &Path, meta: &LibraryMeta) -> anyhow::Result<()> {
    let raw = serde_json::to_string_pretty(meta)?;
    std::fs::write(meta_path(root), raw).context("write meta.json")?;
    Ok(())
}

const INFO_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundlePackageType</key>
    <string>LIBR</string>
    <key>CFBundleIdentifier</key>
    <string>com.archiva.library</string>
</dict>
</plist>
"#;

pub fn create_bundle(parent: &Path, name: &str) -> anyhow::Result<PathBuf> {
    let root = parent.join(format!("{name}.{BUNDLE_EXT}"));
    if root.exists() {
        bail!("a library already exists at {}", root.display());
    }
    std::fs::create_dir_all(thumb_dir(&root)).context("create bundle dirs")?;
    std::fs::write(root.join("Info.plist"), INFO_PLIST).context("write Info.plist")?;
    let meta = LibraryMeta {
        uuid: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        schema_version: SCHEMA_VERSION,
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    write_meta(&root, &meta)?;
    Ok(root)
}

pub fn validate_bundle(root: &Path) -> anyhow::Result<LibraryMeta> {
    let meta = read_meta(root)?;
    if meta.schema_version > SCHEMA_VERSION {
        bail!(
            "this library was created by a newer version of Archiva (schema v{} > v{})",
            meta.schema_version,
            SCHEMA_VERSION
        );
    }
    if !is_local_volume(root)? {
        bail!("libraries on network volumes are not supported");
    }
    Ok(meta)
}

/// macOS statfs MNT_LOCAL check — SQLite WAL is unsafe on SMB/NFS.
pub fn is_local_volume(path: &Path) -> anyhow::Result<bool> {
    use std::os::unix::ffi::OsStrExt;
    let c_path = std::ffi::CString::new(path.as_os_str().as_bytes())?;
    let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::statfs(c_path.as_ptr(), &mut stat) };
    if rc != 0 {
        return Err(anyhow!("statfs failed for {}", path.display()));
    }
    Ok(stat.f_flags & (libc::MNT_LOCAL as u32) != 0)
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/library.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: library bundle module — create/validate .archivalib packages"
```

---

### Task 3: Prefs module (`prefs.rs`)

**Files:**
- Create: `src-tauri/src/prefs.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod prefs;`)
- Test: inline `#[cfg(test)]` module in `src-tauri/src/prefs.rs`

**Interfaces:**
- Produces:
  - `pub struct Prefs { pub recents: Vec<RecentLibrary> }` (derives `Debug, Clone, Serialize, Deserialize, Default`)
  - `pub struct RecentLibrary { pub uuid: String, pub path: String, pub name: String, pub last_opened: String }` (derives `Debug, Clone, Serialize, Deserialize`)
  - `pub fn load(app_data_dir: &Path) -> Prefs` — missing/corrupt file → `Prefs::default()`
  - `pub fn save(app_data_dir: &Path, prefs: &Prefs) -> anyhow::Result<()>`
  - `pub fn push_recent(prefs: &mut Prefs, entry: RecentLibrary)` — dedupe by uuid, newest first, cap 10; never prunes missing paths
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/prefs.rs` with the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn entry(uuid: &str, path: &str) -> RecentLibrary {
        RecentLibrary {
            uuid: uuid.into(),
            path: path.into(),
            name: "Lib".into(),
            last_opened: "2026-07-30T00:00:00Z".into(),
        }
    }

    #[test]
    fn load_missing_file_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        let prefs = load(dir.path());
        assert!(prefs.recents.is_empty());
    }

    #[test]
    fn load_corrupt_file_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("prefs.json"), "{not json").unwrap();
        assert!(load(dir.path()).recents.is_empty());
    }

    #[test]
    fn save_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let mut prefs = Prefs::default();
        push_recent(&mut prefs, entry("a", "/tmp/a.archivalib"));
        save(dir.path(), &prefs).unwrap();
        let loaded = load(dir.path());
        assert_eq!(loaded.recents.len(), 1);
        assert_eq!(loaded.recents[0].uuid, "a");
    }

    #[test]
    fn push_recent_dedupes_by_uuid_and_moves_to_front() {
        let mut prefs = Prefs::default();
        push_recent(&mut prefs, entry("a", "/old/a.archivalib"));
        push_recent(&mut prefs, entry("b", "/b.archivalib"));
        push_recent(&mut prefs, entry("a", "/new/a.archivalib"));
        assert_eq!(prefs.recents.len(), 2);
        assert_eq!(prefs.recents[0].uuid, "a");
        assert_eq!(prefs.recents[0].path, "/new/a.archivalib");
        assert_eq!(prefs.recents[1].uuid, "b");
    }

    #[test]
    fn push_recent_caps_at_ten() {
        let mut prefs = Prefs::default();
        for i in 0..12 {
            push_recent(&mut prefs, entry(&format!("u{i}"), &format!("/p{i}")));
        }
        assert_eq!(prefs.recents.len(), 10);
        assert_eq!(prefs.recents[0].uuid, "u11");
    }
}
```

Add `pub mod prefs;` to `src-tauri/src/lib.rs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test prefs::`
Expected: COMPILE ERROR.

- [ ] **Step 3: Implement**

Prepend to `src-tauri/src/prefs.rs`:

```rust
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::Path;

const PREFS_FILE: &str = "prefs.json";
const MAX_RECENTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Prefs {
    pub recents: Vec<RecentLibrary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentLibrary {
    pub uuid: String,
    pub path: String,
    pub name: String,
    pub last_opened: String,
}

pub fn load(app_data_dir: &Path) -> Prefs {
    let path = app_data_dir.join(PREFS_FILE);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(app_data_dir: &Path, prefs: &Prefs) -> anyhow::Result<()> {
    std::fs::create_dir_all(app_data_dir).context("create app_data_dir")?;
    let raw = serde_json::to_string_pretty(prefs)?;
    std::fs::write(app_data_dir.join(PREFS_FILE), raw).context("write prefs.json")?;
    Ok(())
}

pub fn push_recent(prefs: &mut Prefs, entry: RecentLibrary) {
    prefs.recents.retain(|r| r.uuid != entry.uuid);
    prefs.recents.insert(0, entry);
    prefs.recents.truncate(MAX_RECENTS);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/prefs.rs src-tauri/src/lib.rs
git commit -m "feat: prefs module with recent-libraries list"
```

---

### Task 4: AppState and rewiring existing commands

**Files:**
- Create: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod state;`, manage `AppState`, drop pool management)
- Modify: `src-tauri/src/commands/photos.rs` (command wrappers only)
- Modify: `src-tauri/src/commands/thumbnails.rs` (command wrapper; delete `thumb_dir(&AppHandle)`; derive dest path)
- Test: inline `#[cfg(test)]` in `src-tauri/src/state.rs`

**Interfaces:**
- Produces:
  - `pub struct AppState { pub current: tokio::sync::RwLock<Option<OpenLibrary>> }`
  - `pub struct OpenLibrary { pub uuid: String, pub root: PathBuf, pub pool: SqlitePool, pub thumb_dir: PathBuf }`
  - `impl AppState { pub fn new() -> Self; pub async fn pool(&self) -> Result<SqlitePool, String>; pub async fn thumb_dir(&self) -> Result<PathBuf, String>; pub async fn install(&self, lib: OpenLibrary) -> Option<OpenLibrary>; pub async fn take(&self) -> Option<OpenLibrary> }`
  - `impl Default for AppState` (clippy requires it alongside `new()`)
- Consumes: `db::connect_file`, `db::migrate` (Task 1); `library::thumb_dir` (Task 2).

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/state.rs`:

```rust
use sqlx::SqlitePool;
use std::path::PathBuf;
use tokio::sync::RwLock;

pub struct OpenLibrary {
    pub uuid: String,
    pub root: PathBuf,
    pub pool: SqlitePool,
    pub thumb_dir: PathBuf,
}

pub struct AppState {
    pub current: RwLock<Option<OpenLibrary>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pool_errors_when_no_library_open() {
        let state = AppState::new();
        assert_eq!(state.pool().await.unwrap_err(), "No library open");
        assert_eq!(state.thumb_dir().await.unwrap_err(), "No library open");
    }

    #[tokio::test]
    async fn install_returns_previous_library() {
        let state = AppState::new();
        let pool = crate::db::connect_in_memory().await.unwrap();
        let lib = OpenLibrary {
            uuid: "u1".into(),
            root: PathBuf::from("/tmp/a.archivalib"),
            pool: pool.clone(),
            thumb_dir: PathBuf::from("/tmp/a.archivalib/thumbs"),
        };
        assert!(state.install(lib).await.is_none());
        assert_eq!(
            state.thumb_dir().await.unwrap(),
            PathBuf::from("/tmp/a.archivalib/thumbs")
        );

        let pool2 = crate::db::connect_in_memory().await.unwrap();
        let lib2 = OpenLibrary {
            uuid: "u2".into(),
            root: PathBuf::from("/tmp/b.archivalib"),
            pool: pool2,
            thumb_dir: PathBuf::from("/tmp/b.archivalib/thumbs"),
        };
        let old = state.install(lib2).await.unwrap();
        assert_eq!(old.uuid, "u1");

        let taken = state.take().await.unwrap();
        assert_eq!(taken.uuid, "u2");
        assert!(state.pool().await.is_err());
    }
}
```

Add `pub mod state;` to `src-tauri/src/lib.rs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test state::`
Expected: COMPILE ERROR — no `impl AppState`.

- [ ] **Step 3: Implement AppState methods**

Insert between the structs and the test module in `state.rs`:

```rust
const NO_LIBRARY: &str = "No library open";

impl AppState {
    pub fn new() -> Self {
        Self {
            current: RwLock::new(None),
        }
    }

    pub async fn pool(&self) -> Result<SqlitePool, String> {
        let guard = self.current.read().await;
        guard
            .as_ref()
            .map(|l| l.pool.clone())
            .ok_or_else(|| NO_LIBRARY.to_string())
    }

    pub async fn thumb_dir(&self) -> Result<PathBuf, String> {
        let guard = self.current.read().await;
        guard
            .as_ref()
            .map(|l| l.thumb_dir.clone())
            .ok_or_else(|| NO_LIBRARY.to_string())
    }

    /// Install a new library, returning the previous one (caller closes its pool).
    pub async fn install(&self, lib: OpenLibrary) -> Option<OpenLibrary> {
        self.current.write().await.replace(lib)
    }

    pub async fn take(&self) -> Option<OpenLibrary> {
        self.current.write().await.take()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 4: Run state tests to verify pass**

Run: `cd src-tauri && cargo test state::`
Expected: PASS.

- [ ] **Step 5: Rewire command wrappers**

In `src-tauri/src/commands/photos.rs`, replace the two command wrappers (the `impl` fns stay untouched):

```rust
#[tauri::command]
pub async fn scan_folder(
    path: String,
    state: State<'_, crate::state::AppState>,
    app: AppHandle,
) -> Result<ScanResult, String> {
    let pool_inner = state.pool().await?;
    let thumb_dir = state.thumb_dir().await?;
    let path_buf = std::path::PathBuf::from(&path);
    let result = scan_folder_impl(&path_buf, &pool_inner)
        .await
        .map_err(|e| e.to_string())?;

    // Keep semaphore below max_connections (8) so reads stay unblocked during thumb generation.
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
    for id in result.photo_ids.clone() {
        let pool_clone = pool_inner.clone();
        let dir_clone = thumb_dir.clone();
        let sem_clone = sem.clone();
        let app_clone = app.clone();
        tokio::spawn(async move {
            let _permit = sem_clone.acquire_owned().await;
            match crate::commands::thumbnails::generate_thumbnail_impl(&id, &dir_clone, &pool_clone)
                .await
            {
                Ok(_) => {
                    let _ = app_clone.emit("thumb-ready", &id);
                }
                Err(e) => {
                    log::warn!("thumb failed {id}: {e:#}");
                }
            }
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn list_photos(state: State<'_, crate::state::AppState>) -> Result<Vec<Photo>, String> {
    let pool = state.pool().await?;
    let thumb_dir = state.thumb_dir().await?;
    list_photos_impl(&pool, &thumb_dir)
        .await
        .map_err(|e| e.to_string())
}
```

Change `list_photos_impl` to derive thumbnail paths at runtime (stored `thumb_path` is no longer trusted — absolute paths break when a bundle moves):

```rust
pub async fn list_photos_impl(
    pool: &SqlitePool,
    thumb_dir: &Path,
) -> anyhow::Result<Vec<Photo>> {
    let rows: Vec<PhotoRow> = sqlx::query_as::<_, PhotoRow>(
        "SELECT * FROM photos ORDER BY COALESCE(created_at, imported_at) DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let mut p: Photo = r.into();
            p.thumb_path = if p.thumb_ready == 1 {
                Some(
                    thumb_dir
                        .join(format!("{}.jpg", p.id))
                        .to_string_lossy()
                        .to_string(),
                )
            } else {
                None
            };
            p
        })
        .collect())
}
```

Update any existing callers/tests of `list_photos_impl` to pass a thumb dir (e.g. `Path::new("/tmp/thumbs")` in tests).

In `src-tauri/src/commands/thumbnails.rs`:
- Delete `pub fn thumb_dir(&AppHandle)` and the `Manager` import if now unused.
- Replace the command wrapper:

```rust
#[tauri::command]
pub async fn generate_thumbnail(
    photo_id: String,
    state: State<'_, crate::state::AppState>,
) -> Result<String, String> {
    let pool = state.pool().await?;
    let dir = state.thumb_dir().await?;
    let path = generate_thumbnail_impl(&photo_id, &dir, &pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

(Remove the `AppHandle` import there if unused.)

- [ ] **Step 6: Update lib.rs setup**

Replace the `setup` closure body in `src-tauri/src/lib.rs` — manage empty state; startup opening comes in Task 6:

```rust
.setup(|app| {
    let data_dir = app.path().app_data_dir().expect("app_data_dir");
    std::fs::create_dir_all(&data_dir).expect("create app_data_dir");
    app.manage(state::AppState::new());
    Ok(())
})
```

Keep the `invoke_handler` list as is for now.

- [ ] **Step 7: Run full verification**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS. (App compiles but opens no library yet — expected until Task 6.)

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src
git commit -m "refactor: route all commands through AppState with swappable library pool"
```

---

### Task 5: Library commands (`commands/library.rs`)

**Files:**
- Create: `src-tauri/src/commands/library.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add `pub mod library;`)
- Modify: `src-tauri/src/lib.rs` (register commands)
- Test: inline `#[cfg(test)]` in `src-tauri/src/commands/library.rs`

**Interfaces:**
- Consumes: `library::{create_bundle, validate_bundle, catalog_db_path, thumb_dir, read_meta, LibraryMeta}` (Task 2), `prefs::{load, save, push_recent, Prefs, RecentLibrary}` (Task 3), `state::{AppState, OpenLibrary}` (Task 4), `db::{connect_file, migrate}` (Task 1).
- Produces (types cross the Tauri boundary, camelCase not required — frontend types in Task 8 mirror snake_case):
  - `pub struct LibraryInfo { pub uuid: String, pub name: String, pub path: String }` (derives `Debug, Clone, Serialize, Deserialize`)
  - `pub struct RecentLibraryInfo { pub uuid: String, pub name: String, pub path: String, pub last_opened: String, pub exists: bool }` (same derives)
  - Commands: `list_recent_libraries`, `create_library(parent_dir, name)`, `open_library(path)`, `current_library`, `close_library`, `reveal_library`
  - `pub async fn open_library_at(app: &AppHandle, state: &AppState, root: &Path) -> anyhow::Result<LibraryInfo>` — reused by startup (Task 6)
  - Event: `library-changed` with payload `Option<LibraryInfo>` (None after close)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/commands/library.rs` starting with tests for the testable core (open/swap logic, minus AppHandle-dependent pieces):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[tokio::test]
    async fn open_library_core_swaps_and_returns_old() {
        let dir = tempfile::tempdir().unwrap();
        let root_a = crate::library::create_bundle(dir.path(), "A").unwrap();
        let root_b = crate::library::create_bundle(dir.path(), "B").unwrap();
        let state = AppState::new();

        let (info_a, old) = open_library_core(&state, &root_a).await.unwrap();
        assert_eq!(info_a.name, "A");
        assert!(old.is_none());
        // catalog.db created + migrated
        assert!(crate::library::catalog_db_path(&root_a).exists());

        let (info_b, old) = open_library_core(&state, &root_b).await.unwrap();
        assert_eq!(info_b.name, "B");
        let old = old.unwrap();
        assert_eq!(old.root, root_a);
        old.pool.close().await;

        assert_eq!(
            state.thumb_dir().await.unwrap(),
            crate::library::thumb_dir(&root_b)
        );
    }

    #[tokio::test]
    async fn open_library_core_rejects_plain_dir() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new();
        assert!(open_library_core(&state, dir.path()).await.is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test commands::library::`
Expected: COMPILE ERROR.

- [ ] **Step 3: Implement**

Prepend the implementation:

```rust
use crate::library;
use crate::prefs;
use crate::state::{AppState, OpenLibrary};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryInfo {
    pub uuid: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentLibraryInfo {
    pub uuid: String,
    pub name: String,
    pub path: String,
    pub last_opened: String,
    pub exists: bool,
}

/// Validate, connect, migrate, and install a library. Returns the info and the
/// previously open library (caller is responsible for closing its pool).
pub async fn open_library_core(
    state: &AppState,
    root: &Path,
) -> anyhow::Result<(LibraryInfo, Option<OpenLibrary>)> {
    let meta = library::validate_bundle(root)?;
    let pool = crate::db::connect_file(&library::catalog_db_path(root)).await?;
    crate::db::migrate(&pool).await?;
    let thumb_dir = library::thumb_dir(root);
    tokio::fs::create_dir_all(&thumb_dir).await?;

    let info = LibraryInfo {
        uuid: meta.uuid.clone(),
        name: meta.name.clone(),
        path: root.to_string_lossy().to_string(),
    };
    let old = state
        .install(OpenLibrary {
            uuid: meta.uuid,
            root: root.to_path_buf(),
            pool,
            thumb_dir,
        })
        .await;
    Ok((info, old))
}

/// Full open flow: core + asset scope + prefs + event. Reused by startup.
pub async fn open_library_at(
    app: &AppHandle,
    state: &AppState,
    root: &Path,
) -> anyhow::Result<LibraryInfo> {
    let (info, old) = open_library_core(state, root).await?;

    // Old pool closes in the background — close().await waits for checked-out
    // connections, and a switch must never block on in-flight thumbnail jobs.
    if let Some(old) = old {
        tauri::async_runtime::spawn(async move {
            old.pool.close().await;
        });
    }

    // Thumbs live inside the bundle (e.g. under ~/Pictures) — outside the
    // static asset-protocol scope, so allow the directory at runtime.
    let _ = app
        .asset_protocol_scope()
        .allow_directory(library::thumb_dir(root), true);

    let data_dir = app.path().app_data_dir().context("app_data_dir")?;
    let mut p = prefs::load(&data_dir);
    prefs::push_recent(
        &mut p,
        prefs::RecentLibrary {
            uuid: info.uuid.clone(),
            path: info.path.clone(),
            name: info.name.clone(),
            last_opened: chrono::Utc::now().to_rfc3339(),
        },
    );
    prefs::save(&data_dir, &p)?;

    let _ = app.emit("library-changed", Some(info.clone()));
    Ok(info)
}

async fn checkpoint_and_close(lib: OpenLibrary) {
    // Single clean file for Finder copies made while the app is closed.
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&lib.pool)
        .await;
    lib.pool.close().await;
}

#[tauri::command]
pub async fn list_recent_libraries(app: AppHandle) -> Result<Vec<RecentLibraryInfo>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let p = prefs::load(&data_dir);
    Ok(p.recents
        .into_iter()
        .map(|r| RecentLibraryInfo {
            exists: Path::new(&r.path).join("meta.json").is_file(),
            uuid: r.uuid,
            name: r.name,
            path: r.path,
            last_opened: r.last_opened,
        })
        .collect())
}

#[tauri::command]
pub async fn create_library(
    parent_dir: String,
    name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LibraryInfo, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Library name cannot be empty".into());
    }
    let root = library::create_bundle(Path::new(&parent_dir), trimmed).map_err(|e| e.to_string())?;
    open_library_at(&app, state.inner(), &root)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_library(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LibraryInfo, String> {
    open_library_at(&app, state.inner(), Path::new(&path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn current_library(state: State<'_, AppState>) -> Result<Option<LibraryInfo>, String> {
    let guard = state.current.read().await;
    Ok(guard.as_ref().map(|l| LibraryInfo {
        uuid: l.uuid.clone(),
        name: library::read_meta(&l.root)
            .map(|m| m.name)
            .unwrap_or_else(|_| "Library".to_string()),
        path: l.root.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub async fn close_library(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(old) = state.take().await {
        checkpoint_and_close(old).await;
    }
    let _ = app.emit("library-changed", None::<LibraryInfo>);
    Ok(())
}

#[tauri::command]
pub async fn reveal_library(state: State<'_, AppState>) -> Result<(), String> {
    let guard = state.current.read().await;
    let root: PathBuf = guard
        .as_ref()
        .map(|l| l.root.clone())
        .ok_or("No library open")?;
    drop(guard);
    std::process::Command::new("open")
        .arg("-R")
        .arg(&root)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

Add `pub mod library;` to `src-tauri/src/commands/mod.rs`.

Register in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::photos::scan_folder,
    commands::photos::list_photos,
    commands::thumbnails::generate_thumbnail,
    commands::library::list_recent_libraries,
    commands::library::create_library,
    commands::library::open_library,
    commands::library::current_library,
    commands::library::close_library,
    commands::library::reveal_library,
])
```

- [ ] **Step 4: Run full verification**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat: library commands — create, open, switch, close, recents, reveal"
```

---

### Task 6: Legacy migration + startup flow

**Files:**
- Create: `src-tauri/src/legacy.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod legacy;`, startup logic in `setup`)
- Test: inline `#[cfg(test)]` in `src-tauri/src/legacy.rs`

**Interfaces:**
- Consumes: `library::{create_bundle, catalog_db_path, thumb_dir}` (Task 2), `db::connect_file` (Task 1), `prefs::load` (Task 3), `commands::library::open_library_at` (Task 5).
- Produces: `pub async fn migrate_legacy(app_data_dir: &Path, pictures_dir: &Path) -> anyhow::Result<Option<PathBuf>>` — `Ok(Some(bundle_root))` if migrated, `Ok(None)` if no legacy db.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/legacy.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    async fn make_legacy_db(app_data: &Path) {
        let db_path = app_data.join("archiva.db");
        let pool = crate::db::connect_file(&db_path).await.unwrap();
        crate::db::migrate(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at, thumb_path, thumb_ready)
             VALUES ('p1', '/photos/a.jpg', 'a.jpg', 'jpg', 10, '2026-01-01T00:00:00Z', '/old/thumbs/p1.jpg', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        // Leave WAL un-checkpointed on purpose: pool dropped without close.
        drop(pool);
    }

    #[tokio::test]
    async fn migrates_legacy_db_into_new_bundle() {
        let app_data = tempfile::tempdir().unwrap();
        let pictures = tempfile::tempdir().unwrap();
        make_legacy_db(app_data.path()).await;
        std::fs::create_dir_all(app_data.path().join("thumbs")).unwrap();
        std::fs::write(app_data.path().join("thumbs/p1.jpg"), b"jpegbytes").unwrap();

        let root = migrate_legacy(app_data.path(), pictures.path())
            .await
            .unwrap()
            .expect("should migrate");

        // Bundle opens and the photo row survived (WAL was checkpointed pre-copy).
        let pool = crate::db::connect_file(&crate::library::catalog_db_path(&root))
            .await
            .unwrap();
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM photos")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 1);
        // Stale thumb paths cleared for regeneration.
        let (ready,): (i64,) = sqlx::query_as("SELECT thumb_ready FROM photos WHERE id = 'p1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(ready, 0);
        pool.close().await;

        // Thumbs moved into the bundle; legacy db renamed, original gone.
        assert!(crate::library::thumb_dir(&root).join("p1.jpg").is_file());
        assert!(app_data.path().join("archiva.db.migrated").is_file());
        assert!(!app_data.path().join("archiva.db").exists());
    }

    #[tokio::test]
    async fn no_legacy_db_is_a_noop() {
        let app_data = tempfile::tempdir().unwrap();
        let pictures = tempfile::tempdir().unwrap();
        let out = migrate_legacy(app_data.path(), pictures.path())
            .await
            .unwrap();
        assert!(out.is_none());
    }

    #[tokio::test]
    async fn uniquifies_bundle_name_when_taken() {
        let app_data = tempfile::tempdir().unwrap();
        let pictures = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(pictures.path().join("Archiva.archivalib")).unwrap();
        make_legacy_db(app_data.path()).await;

        let root = migrate_legacy(app_data.path(), pictures.path())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(root, pictures.path().join("Archiva 2.archivalib"));
    }
}
```

Add `pub mod legacy;` to `src-tauri/src/lib.rs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test legacy::`
Expected: COMPILE ERROR.

- [ ] **Step 3: Implement**

Prepend to `src-tauri/src/legacy.rs`:

```rust
use anyhow::Context;
use std::path::{Path, PathBuf};

/// One-time migration of the pre-bundle `archiva.db` into a fresh bundle.
/// Returns Ok(None) when there is nothing to migrate.
pub async fn migrate_legacy(
    app_data_dir: &Path,
    pictures_dir: &Path,
) -> anyhow::Result<Option<PathBuf>> {
    let legacy_db = app_data_dir.join("archiva.db");
    if !legacy_db.exists() {
        return Ok(None);
    }

    // A crashed prior run may have left a -wal; checkpoint before copying so
    // the bare-file copy contains all committed data.
    {
        let pool = crate::db::connect_file(&legacy_db).await?;
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&pool)
            .await?;
        pool.close().await;
    }

    // Uniquify: Archiva, Archiva 2, Archiva 3, …
    let mut name = "Archiva".to_string();
    let mut i = 2;
    while pictures_dir
        .join(format!("{name}.{}", crate::library::BUNDLE_EXT))
        .exists()
    {
        name = format!("Archiva {i}");
        i += 1;
    }
    let root = crate::library::create_bundle(pictures_dir, &name)?;

    // Copy, never move — the original stays recoverable if this dies midway.
    std::fs::copy(&legacy_db, crate::library::catalog_db_path(&root))
        .context("copy legacy db into bundle")?;

    // Stale absolute thumb paths → clear so thumbnails regenerate in-bundle.
    {
        let pool = crate::db::connect_file(&crate::library::catalog_db_path(&root)).await?;
        sqlx::query("UPDATE photos SET thumb_path = NULL, thumb_ready = 0")
            .execute(&pool)
            .await?;
        pool.close().await;
    }

    // Move thumbnail files into the bundle (renames within a volume; falls
    // back to copy+delete across volumes).
    let legacy_thumbs = app_data_dir.join("thumbs");
    if legacy_thumbs.is_dir() {
        let dest_dir = crate::library::thumb_dir(&root);
        for entry in std::fs::read_dir(&legacy_thumbs)? {
            let entry = entry?;
            let dest = dest_dir.join(entry.file_name());
            if std::fs::rename(entry.path(), &dest).is_err() {
                std::fs::copy(entry.path(), &dest)?;
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    // Success — retire the legacy file (and its WAL leftovers).
    std::fs::rename(&legacy_db, app_data_dir.join("archiva.db.migrated"))
        .context("rename legacy db")?;
    let _ = std::fs::remove_file(app_data_dir.join("archiva.db-wal"));
    let _ = std::fs::remove_file(app_data_dir.join("archiva.db-shm"));

    Ok(Some(root))
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd src-tauri && cargo test legacy::`
Expected: PASS.

- [ ] **Step 5: Wire startup flow into lib.rs**

Replace the `setup` closure in `src-tauri/src/lib.rs`:

```rust
.setup(|app| {
    let data_dir = app.path().app_data_dir().expect("app_data_dir");
    std::fs::create_dir_all(&data_dir).expect("create app_data_dir");
    app.manage(state::AppState::new());

    // Startup opening runs async — the frontend shows a loading state until
    // `library-changed` fires or `current_library` resolves.
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let state = handle.state::<state::AppState>();
        let p = prefs::load(&data_dir);

        // 1. Legacy migration (only when no recents exist yet).
        if p.recents.is_empty() {
            let pictures = handle
                .path()
                .picture_dir()
                .unwrap_or_else(|_| data_dir.clone());
            match legacy::migrate_legacy(&data_dir, &pictures).await {
                Ok(Some(root)) => {
                    if let Err(e) =
                        commands::library::open_library_at(&handle, &state, &root).await
                    {
                        log::error!("failed to open migrated library: {e:#}");
                    }
                    return;
                }
                Ok(None) => {}
                Err(e) => log::error!("legacy migration failed: {e:#}"),
            }
        }

        // 2. Reopen most recent; failure falls through to picker state.
        if let Some(recent) = p.recents.first() {
            let root = std::path::PathBuf::from(&recent.path);
            if let Err(e) = commands::library::open_library_at(&handle, &state, &root).await {
                log::warn!("could not reopen {}: {e:#}", recent.path);
            }
        }
        // 3. Nothing opened → frontend shows the picker.
    });
    Ok(())
})
```

Also add WAL checkpoint on quit — after the `.run(...)` builder chain won't work; instead use `.on_window_event` before `.run`:

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::Destroyed = event {
        let state = window.state::<state::AppState>();
        let taken = tauri::async_runtime::block_on(state.take());
        if let Some(lib) = taken {
            tauri::async_runtime::block_on(async move {
                let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
                    .execute(&lib.pool)
                    .await;
                lib.pool.close().await;
            });
        }
    }
})
```

Add needed imports at top of `lib.rs` if missing (`tauri::Manager` is already imported).

- [ ] **Step 6: Run full verification**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src
git commit -m "feat: legacy db migration and startup library resolution"
```

---

### Task 7: macOS package UTI + capabilities

**Files:**
- Create: `src-tauri/Info.plist`
- Modify: `src-tauri/capabilities/default.json` (add `core:event:default` if not covered by `core:default`; verify, don't blindly add)

**Interfaces:**
- Consumes: nothing.
- Produces: Finder treats `.archivalib` as a package in the bundled app. No code interface.

- [ ] **Step 1: Create `src-tauri/Info.plist`**

Tauri 2 merges a `src-tauri/Info.plist` into the app bundle's Info.plist at build time:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>UTExportedTypeDeclarations</key>
    <array>
        <dict>
            <key>UTTypeIdentifier</key>
            <string>com.archiva.library</string>
            <key>UTTypeDescription</key>
            <string>Archiva Library</string>
            <key>UTTypeConformsTo</key>
            <array>
                <string>com.apple.package</string>
            </array>
            <key>UTTypeTagSpecification</key>
            <dict>
                <key>public.filename-extension</key>
                <array>
                    <string>archivalib</string>
                </array>
            </dict>
        </dict>
    </array>
    <key>CFBundleDocumentTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeName</key>
            <string>Archiva Library</string>
            <key>LSItemContentTypes</key>
            <array>
                <string>com.archiva.library</string>
            </array>
            <key>CFBundleTypeRole</key>
            <string>Viewer</string>
            <key>LSTypeIsPackage</key>
            <true/>
        </dict>
    </array>
</dict>
</plist>
```

- [ ] **Step 2: Verify the build still passes**

Run: `cd src-tauri && cargo build`
Expected: compiles. (Full `tauri build` verification of Finder behavior is a manual step — note it in the commit body, don't block on it.)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Info.plist
git commit -m "feat: declare .archivalib package UTI for Finder"
```

---

### Task 8: Frontend types, invoke wrappers, store

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/store/useLibraryStore.ts`
- Test: `src/store/useLibraryStore.test.ts` (extend)

**Interfaces:**
- Consumes: command names/payloads from Task 5 (snake_case JSON fields as emitted by serde).
- Produces (used by Tasks 9–10):
  - Types: `LibraryInfo { uuid: string; name: string; path: string }`, `RecentLibraryInfo extends LibraryInfo { last_opened: string; exists: boolean }`
  - `lib/tauri.ts`: `listRecentLibraries(): Promise<RecentLibraryInfo[]>`, `createLibrary(parentDir: string, name: string): Promise<LibraryInfo>`, `openLibrary(path: string): Promise<LibraryInfo>`, `currentLibrary(): Promise<LibraryInfo | null>`, `closeLibrary(): Promise<void>`, `revealLibrary(): Promise<void>`
  - Store: `currentLibrary: LibraryInfo | null`, `libraryLoading: boolean`, `setCurrentLibrary(lib: LibraryInfo | null): void`, `setLibraryLoading(b: boolean): void`, `reset(): void`

- [ ] **Step 1: Write the failing store test**

Append to `src/store/useLibraryStore.test.ts` (inside the existing `describe`, reusing `makePhoto`):

```ts
it("reset clears photos, albums, and selection but keeps currentLibrary", () => {
  useLibraryStore.setState({
    photos: [makePhoto("a")],
    selectedIds: new Set(["a"]),
    activePhotoId: "a",
    activeAlbumId: "alb",
    currentLibrary: { uuid: "u", name: "Lib", path: "/x.archivalib" },
  });
  useLibraryStore.getState().reset();
  const s = useLibraryStore.getState();
  expect(s.photos).toEqual([]);
  expect(s.albums).toEqual([]);
  expect(s.selectedIds.size).toBe(0);
  expect(s.activePhotoId).toBeNull();
  expect(s.activeAlbumId).toBeNull();
  expect(s.currentLibrary?.uuid).toBe("u");
});

it("setCurrentLibrary updates the library", () => {
  useLibraryStore
    .getState()
    .setCurrentLibrary({ uuid: "u2", name: "Other", path: "/y.archivalib" });
  expect(useLibraryStore.getState().currentLibrary?.name).toBe("Other");
});
```

Also add `currentLibrary: null` to the `beforeEach` `setState` block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `reset` / `currentLibrary` don't exist (TS error counts as failing).

- [ ] **Step 3: Implement types + store + wrappers**

Append to `src/types/index.ts`:

```ts
export interface LibraryInfo {
  uuid: string;
  name: string;
  path: string;
}

export interface RecentLibraryInfo extends LibraryInfo {
  last_opened: string;
  exists: boolean;
}
```

In `src/store/useLibraryStore.ts`, extend the interface and creator:

```ts
import { create } from "zustand";
import type { Album, LibraryInfo, Photo } from "../types";

interface LibraryState {
  photos: Photo[];
  albums: Album[];
  selectedIds: Set<string>;
  activeAlbumId: string | null;
  activePhotoId: string | null;
  currentLibrary: LibraryInfo | null;
  libraryLoading: boolean;

  setPhotos: (photos: Photo[]) => void;
  setAlbums: (albums: Album[]) => void;
  selectPhoto: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setActiveAlbum: (id: string | null) => void;
  setCurrentLibrary: (lib: LibraryInfo | null) => void;
  setLibraryLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  photos: [],
  albums: [],
  selectedIds: new Set<string>(),
  activeAlbumId: null,
  activePhotoId: null,
  currentLibrary: null,
  libraryLoading: true,

  setPhotos: (photos) => set({ photos }),
  setAlbums: (albums) => set({ albums }),
  selectPhoto: (id) => set({ selectedIds: new Set([id]), activePhotoId: id }),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clearSelection: () => set({ selectedIds: new Set(), activePhotoId: null }),
  setActiveAlbum: (id) => set({ activeAlbumId: id }),
  setCurrentLibrary: (lib) => set({ currentLibrary: lib }),
  setLibraryLoading: (loading) => set({ libraryLoading: loading }),
  reset: () =>
    set({
      photos: [],
      albums: [],
      selectedIds: new Set(),
      activeAlbumId: null,
      activePhotoId: null,
    }),
}));
```

Append to `src/lib/tauri.ts`:

```ts
import type { LibraryInfo, RecentLibraryInfo } from "../types";

export function listRecentLibraries(): Promise<RecentLibraryInfo[]> {
  return invoke<RecentLibraryInfo[]>("list_recent_libraries");
}

export function createLibrary(
  parentDir: string,
  name: string,
): Promise<LibraryInfo> {
  return invoke<LibraryInfo>("create_library", { parentDir, name });
}

export function openLibrary(path: string): Promise<LibraryInfo> {
  return invoke<LibraryInfo>("open_library", { path });
}

export function currentLibrary(): Promise<LibraryInfo | null> {
  return invoke<LibraryInfo | null>("current_library");
}

export function closeLibrary(): Promise<void> {
  return invoke<void>("close_library");
}

export function revealLibrary(): Promise<void> {
  return invoke<void>("reveal_library");
}
```

(Merge the type import into the existing `import type` line — one import statement.)

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/tauri.ts src/store/useLibraryStore.ts src/store/useLibraryStore.test.ts
git commit -m "feat: frontend library types, invoke wrappers, store reset"
```

---

### Task 9: useLibrary hook + App gate + LibraryPicker

**Files:**
- Create: `src/hooks/useLibrary.ts`
- Create: `src/components/LibraryPicker.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/LibraryPicker.test.tsx`

**Interfaces:**
- Consumes: everything Task 8 produced; `@tauri-apps/api/event` `listen`; `@tauri-apps/plugin-dialog` `open`.
- Produces:
  - `useLibrary(): { current: LibraryInfo | null; loading: boolean; recents: RecentLibraryInfo[]; error: string | null; refreshRecents(): Promise<void>; openAt(path: string): Promise<void>; createAt(parentDir: string, name: string): Promise<void>; close(): Promise<void>; reveal(): Promise<void> }`
  - `<LibraryPicker />` — full-screen picker, no props (uses the hook)
  - `App` renders loading → picker → `<Library key={current.uuid} />`

- [ ] **Step 1: Write the failing picker test**

Create `src/components/LibraryPicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryPicker } from "./LibraryPicker";
import type { RecentLibraryInfo } from "../types";

const recents: RecentLibraryInfo[] = [
  {
    uuid: "u1",
    name: "Main",
    path: "/Users/x/Pictures/Main.archivalib",
    last_opened: "2026-07-29T00:00:00Z",
    exists: true,
  },
  {
    uuid: "u2",
    name: "Gone",
    path: "/Volumes/ext/Gone.archivalib",
    last_opened: "2026-07-01T00:00:00Z",
    exists: false,
  },
];

vi.mock("../hooks/useLibrary", () => ({
  useLibrary: () => ({
    current: null,
    loading: false,
    recents,
    error: null,
    refreshRecents: vi.fn(),
    openAt: vi.fn(),
    createAt: vi.fn(),
    close: vi.fn(),
    reveal: vi.fn(),
  }),
}));

describe("LibraryPicker", () => {
  it("renders recents; missing libraries are disabled", () => {
    render(<LibraryPicker />);
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Gone")).toBeInTheDocument();
    const gone = screen.getByText("Gone").closest("button");
    expect(gone).toBeDisabled();
  });

  it("offers New Library and Open Other actions", () => {
    render(<LibraryPicker />);
    expect(screen.getByText("New Library…")).toBeInTheDocument();
    expect(screen.getByText("Open Other…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useLibrary.ts`:

```ts
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import {
  closeLibrary,
  createLibrary,
  currentLibrary,
  listRecentLibraries,
  openLibrary,
  revealLibrary,
} from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";
import type { LibraryInfo, RecentLibraryInfo } from "../types";

export function useLibrary() {
  const current = useLibraryStore((s) => s.currentLibrary);
  const loading = useLibraryStore((s) => s.libraryLoading);
  const setCurrentLibrary = useLibraryStore((s) => s.setCurrentLibrary);
  const setLibraryLoading = useLibraryStore((s) => s.setLibraryLoading);
  const reset = useLibraryStore((s) => s.reset);
  const [recents, setRecents] = useState<RecentLibraryInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshRecents = useCallback(async () => {
    try {
      setRecents(await listRecentLibraries());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Initial resolve: startup opening happens on the Rust side; ask once, then
  // rely on library-changed events.
  useEffect(() => {
    let cleanedUp = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const lib = await currentLibrary();
        if (!cleanedUp) setCurrentLibrary(lib);
      } catch (e) {
        if (!cleanedUp) setError(String(e));
      } finally {
        if (!cleanedUp) setLibraryLoading(false);
      }
    })();

    listen<LibraryInfo | null>("library-changed", (event) => {
      reset();
      setCurrentLibrary(event.payload);
      setLibraryLoading(false);
      void refreshRecents();
    }).then((fn) => {
      if (cleanedUp) fn();
      else unlisten = fn;
    });

    return () => {
      cleanedUp = true;
      unlisten?.();
    };
  }, [refreshRecents, reset, setCurrentLibrary, setLibraryLoading]);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  const openAt = useCallback(async (path: string) => {
    setError(null);
    try {
      await openLibrary(path);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const createAt = useCallback(async (parentDir: string, name: string) => {
    setError(null);
    try {
      await createLibrary(parentDir, name);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const close = useCallback(async () => {
    try {
      await closeLibrary();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const reveal = useCallback(async () => {
    try {
      await revealLibrary();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return { current, loading, recents, error, refreshRecents, openAt, createAt, close, reveal };
}
```

- [ ] **Step 4: Implement the picker**

Create `src/components/LibraryPicker.tsx`:

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useLibrary } from "../hooks/useLibrary";

export function LibraryPicker() {
  const { recents, error, openAt, createAt } = useLibrary();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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
    try {
      await createAt(parent, name.trim());
      setNewOpen(false);
      setName("");
    } finally {
      setBusy(false);
    }
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
          <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
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
                  className="mb-4 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-muted"
                />
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
```

- [ ] **Step 5: Gate App.tsx**

Replace `src/App.tsx`:

```tsx
import { LibraryPicker } from "./components/LibraryPicker";
import { useLibrary } from "./hooks/useLibrary";
import { Library } from "./pages/Library";

export default function App() {
  const { current, loading } = useLibrary();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (!current) return <LibraryPicker />;
  // Keyed remount: switching libraries resets all page-level state and refetches.
  return <Library key={current.uuid} />;
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useLibrary.ts src/components/LibraryPicker.tsx src/components/LibraryPicker.test.tsx src/App.tsx
git commit -m "feat: library picker, useLibrary hook, app gate"
```

---

### Task 10: LibrarySwitcher in Library header

**Files:**
- Create: `src/components/LibrarySwitcher.tsx`
- Modify: `src/pages/Library.tsx` (header)
- Test: `src/components/LibrarySwitcher.test.tsx`

**Interfaces:**
- Consumes: `useLibrary` (Task 9).
- Produces: `<LibrarySwitcher />`, no props.

- [ ] **Step 1: Write the failing test**

Create `src/components/LibrarySwitcher.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LibrarySwitcher } from "./LibrarySwitcher";

vi.mock("../hooks/useLibrary", () => ({
  useLibrary: () => ({
    current: { uuid: "u1", name: "Main", path: "/x/Main.archivalib" },
    loading: false,
    recents: [
      {
        uuid: "u1",
        name: "Main",
        path: "/x/Main.archivalib",
        last_opened: "2026-07-29T00:00:00Z",
        exists: true,
      },
      {
        uuid: "u2",
        name: "Travel",
        path: "/x/Travel.archivalib",
        last_opened: "2026-07-20T00:00:00Z",
        exists: true,
      },
    ],
    error: null,
    refreshRecents: vi.fn(),
    openAt: vi.fn(),
    createAt: vi.fn(),
    close: vi.fn(),
    reveal: vi.fn(),
  }),
}));

describe("LibrarySwitcher", () => {
  it("shows the current library name and lists other recents in the menu", async () => {
    const user = userEvent.setup();
    render(<LibrarySwitcher />);
    const trigger = screen.getByRole("button", { name: /Main/ });
    await user.click(trigger);
    // Current library is not repeated in the switch list.
    expect(screen.getByText("Travel")).toBeInTheDocument();
    expect(screen.getByText("Switch Library…")).toBeInTheDocument();
    expect(screen.getByText("Reveal in Finder")).toBeInTheDocument();
  });
});
```

Note: if `@testing-library/user-event` is not installed, add it: `npm i -D @testing-library/user-event`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/components/LibrarySwitcher.tsx`:

```tsx
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
```

In `src/pages/Library.tsx`, add the switcher to the header's right-side button group (before Refresh):

```tsx
import { LibrarySwitcher } from "../components/LibrarySwitcher";
```

```tsx
<div className="flex items-center gap-2">
  <LibrarySwitcher />
  <button
    type="button"
    onClick={() => void refresh()}
    className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white hover:border-muted"
  >
    Refresh
  </button>
  <FolderPicker onScan={handleScan} disabled={loading} />
</div>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LibrarySwitcher.tsx src/components/LibrarySwitcher.test.tsx src/pages/Library.tsx package.json package-lock.json
git commit -m "feat: library switcher dropdown in header"
```

---

### Task 11: Final verification sweep

**Files:** none new.

- [ ] **Step 1: Full backend suite**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all PASS.

- [ ] **Step 2: Full frontend suite**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 3: Manual smoke test (report, don't skip)**

Run: `npm run tauri dev`
Checklist:
- First launch with a legacy `archiva.db` → auto-migrates to `~/Pictures/Archiva.archivalib`, photos listed, thumbs regenerate.
- No legacy, no recents → picker appears.
- New Library… → name + location → opens empty library.
- Add folder → photos appear with thumbnails (thumbs written inside the bundle).
- Switcher → other library → grid swaps, no restart.
- Switch Library… → picker; reopen → state intact.
- Quit + relaunch → last library reopens.

- [ ] **Step 4: Commit any fixes, then report results to the user**
