# Single Image View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user double-click a thumbnail to open a single-photo view inside the main area (sidenav + metadata panel stay visible), navigate the currently-visible set with arrow keys and on-screen arrow buttons, and exit with `Esc` or a second double-click.

**Architecture:** Add a new `viewMode: "grid" | "single"` switch to the Zustand store and a new `SinglePhotoView` component that replaces `PhotoGrid` in `<main>` when active. Add a new Tauri command `generate_preview(photo_id, max_px)` that produces bucketed (1024/2048/4096) JPEG previews cached in `app_data_dir()/previews/` via `sips` (matches the existing thumbnail pipeline — macOS-only).

**Tech Stack:** React 18, TypeScript strict, Zustand, Tailwind, Tauri 2.x, sqlx + SQLite, `sips` (macOS), vitest, cargo test.

**Reference spec:** `docs/superpowers/specs/2026-04-22-single-image-view-design.md`

> **Spec deviation note:** The spec says "image crate for non-HEIC, sips for HEIC." The existing `commands/thumbnails.rs` pipeline uses `sips` for all formats (macOS-only app), and this plan follows that pattern for simplicity and consistency. Functional outcome matches the spec.

---

## File Structure

### Files created

- `src-tauri/src/commands/previews.rs` — `generate_preview` command + helpers + tests.
- `src/hooks/usePreview.ts` — async preview loader with viewport bucket math and stale-response guard.
- `src/hooks/usePreview.test.ts` — hook tests via mocked `invoke`.
- `src/components/SinglePhotoView.tsx` — the in-main-area photo viewer.
- `src/components/SinglePhotoView.test.tsx` — component tests.

### Files modified

- `src/store/useLibraryStore.ts` — add `viewMode`, `enterSingle`, `exitSingle`.
- `src/store/useLibraryStore.test.ts` — add new test cases + extend `beforeEach` reset.
- `src/lib/tauri.ts` — add `generatePreview` wrapper.
- `src/pages/Library.tsx` — branch main area on `viewMode`; effect auto-exits when `activePhotoId` leaves `visible`.
- `src/components/PhotoThumb.tsx` — `onDoubleClick` calls `enterSingle`.
- `src-tauri/src/commands/mod.rs` — `pub mod previews;`.
- `src-tauri/src/lib.rs` — register `commands::previews::generate_preview`.

---

## Task 1: Bucket math + preview path helpers (pure functions, TDD)

Introduce the pure helpers first so tests don't need a DB or filesystem.

**Files:**
- Create: `src-tauri/src/commands/previews.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Register the new module**

Modify `src-tauri/src/commands/mod.rs`:

```rust
pub mod albums;
pub mod metadata;
pub mod photos;
pub mod previews;
pub mod thumbnails;
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/commands/previews.rs` with tests only (no implementation yet):

```rust
use std::path::{Path, PathBuf};

pub const PREVIEW_BUCKETS: [u32; 3] = [1024, 2048, 4096];

pub fn bucket_for(max_px: u32) -> u32 {
    unimplemented!()
}

pub fn preview_filename(photo_id: &str, bucket: u32) -> String {
    unimplemented!()
}

pub fn preview_path(preview_dir: &Path, photo_id: &str, bucket: u32) -> PathBuf {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_for_rounds_up_to_next_bucket() {
        assert_eq!(bucket_for(0), 1024);
        assert_eq!(bucket_for(500), 1024);
        assert_eq!(bucket_for(1024), 1024);
        assert_eq!(bucket_for(1025), 2048);
        assert_eq!(bucket_for(2048), 2048);
        assert_eq!(bucket_for(2049), 4096);
        assert_eq!(bucket_for(4096), 4096);
    }

    #[test]
    fn bucket_for_clamps_oversize_to_4096() {
        assert_eq!(bucket_for(4097), 4096);
        assert_eq!(bucket_for(10_000), 4096);
    }

    #[test]
    fn preview_filename_includes_id_and_bucket() {
        assert_eq!(preview_filename("abc-123", 2048), "abc-123_2048.jpg");
    }

    #[test]
    fn preview_path_joins_dir_and_filename() {
        let dir = Path::new("/tmp/previews");
        let p = preview_path(dir, "abc-123", 1024);
        assert_eq!(p, PathBuf::from("/tmp/previews/abc-123_1024.jpg"));
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd src-tauri && cargo test -p archiva_lib previews::tests
```

Expected: tests FAIL with `not yet implemented` panic on the `unimplemented!()` calls.

- [ ] **Step 4: Implement the helpers**

Replace the three function bodies in `src-tauri/src/commands/previews.rs`:

```rust
pub fn bucket_for(max_px: u32) -> u32 {
    for &b in &PREVIEW_BUCKETS {
        if max_px <= b {
            return b;
        }
    }
    *PREVIEW_BUCKETS.last().expect("non-empty")
}

pub fn preview_filename(photo_id: &str, bucket: u32) -> String {
    format!("{photo_id}_{bucket}.jpg")
}

pub fn preview_path(preview_dir: &Path, photo_id: &str, bucket: u32) -> PathBuf {
    preview_dir.join(preview_filename(photo_id, bucket))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
cd src-tauri && cargo test -p archiva_lib previews::tests
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/previews.rs src-tauri/src/commands/mod.rs
git commit -m "feat(preview): bucket math + path helpers"
```

---

## Task 2: generate_preview_impl (DB + filesystem, TDD)

Add the async implementation that looks up a photo, generates a preview if needed, and returns the cached path. Uses `sips` to match existing thumbnail pipeline.

**Files:**
- Modify: `src-tauri/src/commands/previews.rs`

- [ ] **Step 1: Extend the file with additional imports**

Add to the top of `src-tauri/src/commands/previews.rs`:

```rust
use anyhow::{anyhow, Context};
use sqlx::SqlitePool;
```

- [ ] **Step 2: Write the failing test for happy-path cached-miss generation**

Append to the `#[cfg(test)] mod tests` block in `previews.rs`:

```rust
    use crate::db;
    use chrono::Utc;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_tiny_jpg(path: &Path) {
        // 1x1 red JPEG, the smallest valid file sips will accept.
        let bytes: &[u8] = &[
            0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
            0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
            0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
            0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,
            0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,
            0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
            0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,
            0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
            0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
            0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,0x01,0x02,0x03,0x00,
            0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,
            0x81,0x91,0xA1,0x08,0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
            0x82,0x09,0x0A,0x16,0x17,0x18,0x19,0x1A,0x25,0x26,0x27,0x28,0x29,0x2A,0x34,0x35,
            0x36,0x37,0x38,0x39,0x3A,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x53,0x54,0x55,
            0x56,0x57,0x58,0x59,0x5A,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6A,0x73,0x74,0x75,
            0x76,0x77,0x78,0x79,0x7A,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8A,0x92,0x93,0x94,
            0x95,0x96,0x97,0x98,0x99,0x9A,0xA2,0xA3,0xA4,0xA5,0xA6,0xA7,0xA8,0xA9,0xAA,0xB2,
            0xB3,0xB4,0xB5,0xB6,0xB7,0xB8,0xB9,0xBA,0xC2,0xC3,0xC4,0xC5,0xC6,0xC7,0xC8,0xC9,
            0xCA,0xD2,0xD3,0xD4,0xD5,0xD6,0xD7,0xD8,0xD9,0xDA,0xE1,0xE2,0xE3,0xE4,0xE5,0xE6,
            0xE7,0xE8,0xE9,0xEA,0xF1,0xF2,0xF3,0xF4,0xF5,0xF6,0xF7,0xF8,0xF9,0xFA,0xFF,0xDA,
            0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,0xD0,0xFF,0xD9
        ];
        let mut f = std::fs::File::create(path).unwrap();
        f.write_all(bytes).unwrap();
    }

    async fn setup_pool_with_photo(photo_id: &str, source: &Path) -> SqlitePool {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(photo_id)
        .bind(source.to_string_lossy().to_string())
        .bind(source.file_name().unwrap().to_string_lossy().to_string())
        .bind("jpg")
        .bind(1_i64)
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn generate_preview_creates_cached_file() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("pic.jpg");
        write_tiny_jpg(&src);
        let preview_dir = tmp.path().join("previews");
        let pool = setup_pool_with_photo("p1", &src).await;

        let path = generate_preview_impl("p1", 900, &preview_dir, &pool)
            .await
            .unwrap();
        assert!(path.exists(), "preview file should exist at {:?}", path);
        assert_eq!(path, preview_dir.join("p1_1024.jpg"));
    }

    #[tokio::test]
    async fn generate_preview_returns_cached_path_without_regen() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("pic.jpg");
        write_tiny_jpg(&src);
        let preview_dir = tmp.path().join("previews");
        let pool = setup_pool_with_photo("p1", &src).await;

        let first = generate_preview_impl("p1", 900, &preview_dir, &pool)
            .await
            .unwrap();
        let mtime1 = std::fs::metadata(&first).unwrap().modified().unwrap();

        // Sleep 1s so mtime would change if rewritten (HFS/APFS has second-level mtime precision).
        std::thread::sleep(std::time::Duration::from_millis(1100));

        let second = generate_preview_impl("p1", 900, &preview_dir, &pool)
            .await
            .unwrap();
        let mtime2 = std::fs::metadata(&second).unwrap().modified().unwrap();

        assert_eq!(first, second);
        assert_eq!(mtime1, mtime2, "cached path must not be regenerated");
    }

    #[tokio::test]
    async fn generate_preview_errors_when_source_missing() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("nope.jpg");
        let preview_dir = tmp.path().join("previews");
        let pool = setup_pool_with_photo("p1", &missing).await;

        let err = generate_preview_impl("p1", 900, &preview_dir, &pool)
            .await
            .unwrap_err();
        let msg = format!("{err:#}");
        assert!(
            msg.contains("source unreadable") || msg.contains("sips"),
            "unexpected error message: {msg}"
        );
    }

    #[tokio::test]
    async fn generate_preview_errors_when_photo_not_found() {
        let tmp = TempDir::new().unwrap();
        let preview_dir = tmp.path().join("previews");
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();

        let err = generate_preview_impl("ghost", 900, &preview_dir, &pool)
            .await
            .unwrap_err();
        assert!(
            format!("{err:#}").contains("photo not found"),
            "unexpected error: {err:#}"
        );
    }
```

Ensure `tempfile` is a dev-dependency. If not, add:

```bash
cd src-tauri && cargo add --dev tempfile
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd src-tauri && cargo test -p archiva_lib previews::tests
```

Expected: compile error (function `generate_preview_impl` does not exist).

- [ ] **Step 4: Implement `generate_preview_impl` plus `render_sips_preview`**

Append to `previews.rs` (above the `#[cfg(test)]` block):

```rust
pub async fn generate_preview_impl(
    photo_id: &str,
    max_px: u32,
    preview_dir: &Path,
    pool: &SqlitePool,
) -> anyhow::Result<PathBuf> {
    let (source_path,): (String,) = sqlx::query_as("SELECT path FROM photos WHERE id = ?")
        .bind(photo_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| anyhow!("photo not found: {photo_id}"))?;

    let bucket = bucket_for(max_px);
    let dest = preview_path(preview_dir, photo_id, bucket);

    if tokio::fs::try_exists(&dest).await.unwrap_or(false) {
        return Ok(dest);
    }

    let src = PathBuf::from(&source_path);
    if !tokio::fs::try_exists(&src).await.unwrap_or(false) {
        return Err(anyhow!("source unreadable: {}", src.display()));
    }

    tokio::fs::create_dir_all(preview_dir).await?;

    let src_clone = src.clone();
    let dest_clone = dest.clone();
    tokio::task::spawn_blocking(move || render_sips_preview(&src_clone, &dest_clone, bucket))
        .await
        .context("spawn_blocking panicked")??;

    Ok(dest)
}

fn render_sips_preview(src: &Path, dest: &Path, bucket: u32) -> anyhow::Result<()> {
    let output = std::process::Command::new("sips")
        .args(["-Z", &bucket.to_string(), "-s", "format", "jpeg"])
        .arg(src)
        .args(["--out", &dest.to_string_lossy()])
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

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
cd src-tauri && cargo test -p archiva_lib previews::tests
```

Expected: all tests PASS. Note that these tests require `sips` (macOS). If the CI environment is non-macOS, the sips-dependent tests will need to be gated with `#[cfg(target_os = "macos")]` — add that attribute to the three tests that invoke sips (`generate_preview_creates_cached_file`, `generate_preview_returns_cached_path_without_regen`, and `generate_preview_errors_when_source_missing`) if a CI failure occurs; leave `generate_preview_errors_when_photo_not_found` unconditional since it never touches sips.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/previews.rs src-tauri/Cargo.toml
git commit -m "feat(preview): generate_preview_impl with sips + cache"
```

---

## Task 3: Expose `generate_preview` Tauri command + register handler

**Files:**
- Modify: `src-tauri/src/commands/previews.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the Tauri wrapper function and `preview_dir` helper**

Append to `src-tauri/src/commands/previews.rs`:

```rust
use tauri::{AppHandle, Manager, State};

pub fn preview_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .context("app_data_dir unavailable")?;
    Ok(data_dir.join("previews"))
}

#[tauri::command]
pub async fn generate_preview(
    photo_id: String,
    max_px: u32,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<String, String> {
    let dir = preview_dir(&app).map_err(|e| e.to_string())?;
    let path = generate_preview_impl(&photo_id, max_px, &dir, pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Register the handler**

Modify `src-tauri/src/lib.rs` — add one entry to `tauri::generate_handler![...]`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::photos::scan_folder,
    commands::photos::list_photos,
    commands::thumbnails::generate_thumbnail,
    commands::previews::generate_preview,
    commands::albums::list_albums,
    commands::albums::create_album,
    commands::albums::rename_album,
    commands::albums::delete_album,
    commands::albums::reorder_albums,
    commands::albums::list_album_photos,
    commands::albums::add_photos_to_album,
    commands::albums::remove_photos_from_album,
])
```

- [ ] **Step 3: Compile-check**

Run:

```bash
cd src-tauri && cargo check -p archiva_lib
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/previews.rs src-tauri/src/lib.rs
git commit -m "feat(preview): register generate_preview Tauri command"
```

---

## Task 4: Frontend `generatePreview` wrapper

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add the wrapper**

Append to `src/lib/tauri.ts`:

```ts
export function generatePreview(photoId: string, maxPx: number): Promise<string> {
  return invoke<string>("generate_preview", { photoId, maxPx });
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(preview): frontend generatePreview wrapper"
```

---

## Task 5: Add `viewMode` + `enterSingle` + `exitSingle` to the store (TDD)

**Files:**
- Modify: `src/store/useLibraryStore.ts`
- Modify: `src/store/useLibraryStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/useLibraryStore.test.ts`, inside the `describe("useLibraryStore", ...)` block:

```ts
  it("defaults viewMode to grid", () => {
    expect(useLibraryStore.getState().viewMode).toBe("grid");
  });

  it("enterSingle sets viewMode=single and activePhotoId", () => {
    useLibraryStore.getState().enterSingle("abc");
    expect(useLibraryStore.getState().viewMode).toBe("single");
    expect(useLibraryStore.getState().activePhotoId).toBe("abc");
  });

  it("exitSingle sets viewMode=grid and keeps activePhotoId", () => {
    useLibraryStore.getState().enterSingle("abc");
    useLibraryStore.getState().exitSingle();
    expect(useLibraryStore.getState().viewMode).toBe("grid");
    expect(useLibraryStore.getState().activePhotoId).toBe("abc");
  });

  it("enterSingle with a different id updates activePhotoId", () => {
    useLibraryStore.getState().enterSingle("a");
    useLibraryStore.getState().enterSingle("b");
    expect(useLibraryStore.getState().activePhotoId).toBe("b");
  });
```

Also extend the `beforeEach` reset at the top of the `describe` block so it resets the new field:

```ts
  beforeEach(() => {
    useLibraryStore.setState({
      photos: [],
      albums: [],
      selectedIds: new Set(),
      activeSource: { kind: "library" },
      activePhotoId: null,
      expandedYears: new Set<number>(),
      foldersHeightPct: 50,
      albumPhotoIds: new Map(),
      history: [{ source: { kind: "library" }, scrollTop: 0 }],
      historyIndex: 0,
      liveScrollTop: 0,
      pendingScrollTop: null,
      viewMode: "grid",
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/store/useLibraryStore.test.ts
```

Expected: TypeScript errors and failing assertions because `viewMode`, `enterSingle`, `exitSingle` do not exist yet.

- [ ] **Step 3: Add state + actions to the store**

Modify `src/store/useLibraryStore.ts`. In the `LibraryState` interface add:

```ts
  viewMode: "grid" | "single";

  enterSingle: (photoId: string) => void;
  exitSingle: () => void;
```

In the `create<LibraryState>((set) => ({ ... }))` initializer add the default and actions. Put the default near the other view-related fields (e.g. after `activePhotoId`):

```ts
  viewMode: "grid",
```

And add the two actions before the `setLiveScrollTop` action:

```ts
  enterSingle: (photoId) => set({ viewMode: "single", activePhotoId: photoId }),
  exitSingle: () => set({ viewMode: "grid" }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/store/useLibraryStore.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/useLibraryStore.ts src/store/useLibraryStore.test.ts
git commit -m "feat(store): add viewMode + enterSingle/exitSingle"
```

---

## Task 6: `usePreview` hook (TDD)

A hook that invokes `generate_preview`, discards stale responses, and debounces rapid `maxPx` changes.

**Files:**
- Create: `src/hooks/usePreview.ts`
- Create: `src/hooks/usePreview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/usePreview.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePreview } from "./usePreview";

vi.mock("../lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauri")>("../lib/tauri");
  return {
    ...actual,
    generatePreview: vi.fn(),
    thumbUrl: (p: string | null) => (p ? `asset://${p}` : null),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));

import { generatePreview } from "../lib/tauri";

describe("usePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(generatePreview).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns url once invoke resolves", async () => {
    vi.mocked(generatePreview).mockResolvedValue("/tmp/previews/p1_1024.jpg");

    const { result } = renderHook(() => usePreview("p1", 900));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.url).toBe("asset:///tmp/previews/p1_1024.jpg");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error on rejection", async () => {
    vi.mocked(generatePreview).mockRejectedValue(new Error("sips exit 1"));

    const { result } = renderHook(() => usePreview("p1", 900));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.error).toContain("sips");
    });
    expect(result.current.url).toBeNull();
  });

  it("drops stale response when photoId changes mid-flight", async () => {
    let resolveFirst: (v: string) => void = () => {};
    vi.mocked(generatePreview)
      .mockImplementationOnce(
        () =>
          new Promise<string>((res) => {
            resolveFirst = res;
          }),
      )
      .mockResolvedValueOnce("/tmp/previews/p2_1024.jpg");

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePreview(id, 900),
      { initialProps: { id: "p1" } },
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Navigate to p2 before p1's promise resolves.
    rerender({ id: "p2" });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Now p1 resolves — must be ignored.
    resolveFirst("/tmp/previews/p1_1024.jpg");
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.url).toBe("asset:///tmp/previews/p2_1024.jpg");
    });
  });

  it("debounces rapid maxPx changes (only trailing call invokes)", async () => {
    vi.mocked(generatePreview).mockResolvedValue("/tmp/previews/p1_2048.jpg");

    const { rerender } = renderHook(
      ({ maxPx }: { maxPx: number }) => usePreview("p1", maxPx),
      { initialProps: { maxPx: 900 } },
    );

    rerender({ maxPx: 1100 });
    rerender({ maxPx: 1300 });
    rerender({ maxPx: 1600 });

    // Before debounce window elapses, no call yet.
    expect(generatePreview).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // One call with the final maxPx (rounded to bucket 2048).
    expect(generatePreview).toHaveBeenCalledTimes(1);
    expect(generatePreview).toHaveBeenLastCalledWith("p1", 1600);
  });

  it("returns null url when photoId is null", () => {
    const { result } = renderHook(() => usePreview(null, 900));
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(generatePreview).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/hooks/usePreview.test.ts
```

Expected: import error (file does not exist).

- [ ] **Step 3: Implement `usePreview`**

Create `src/hooks/usePreview.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { generatePreview } from "../lib/tauri";

const DEBOUNCE_MS = 100;

export interface UsePreviewResult {
  url: string | null;
  loading: boolean;
  error: string | null;
}

export function usePreview(
  photoId: string | null,
  maxPx: number,
): UsePreviewResult {
  const [state, setState] = useState<UsePreviewResult>({
    url: null,
    loading: false,
    error: null,
  });
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!photoId || maxPx <= 0) {
      setState({ url: null, loading: false, error: null });
      return;
    }

    const seq = ++requestSeqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    const timer = setTimeout(() => {
      generatePreview(photoId, maxPx)
        .then((path) => {
          if (seq !== requestSeqRef.current) return;
          setState({ url: convertFileSrc(path), loading: false, error: null });
        })
        .catch((e: unknown) => {
          if (seq !== requestSeqRef.current) return;
          setState({ url: null, loading: false, error: String(e) });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [photoId, maxPx]);

  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/hooks/usePreview.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePreview.ts src/hooks/usePreview.test.ts
git commit -m "feat(preview): usePreview hook with stale-drop + debounce"
```

---

## Task 7: `SinglePhotoView` component (TDD)

Renders the active photo with side arrow buttons, handles key events, calls `exitSingle` on `Esc` and double-click.

**Files:**
- Create: `src/components/SinglePhotoView.tsx`
- Create: `src/components/SinglePhotoView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/SinglePhotoView.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Photo } from "../types";
import { SinglePhotoView } from "./SinglePhotoView";
import { useLibraryStore } from "../store/useLibraryStore";

vi.mock("../hooks/usePreview", () => ({
  usePreview: vi.fn(() => ({ url: null, loading: true, error: null })),
}));

vi.mock("../lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauri")>("../lib/tauri");
  return { ...actual, thumbUrl: (p: string | null) => (p ? `asset://${p}` : null) };
});

function makePhoto(id: string): Photo {
  return {
    id,
    path: `/tmp/${id}.jpg`,
    filename: `${id}.jpg`,
    ext: "jpg",
    size_bytes: 1,
    width: 1,
    height: 1,
    created_at: null,
    modified_at: null,
    imported_at: "2026-04-22T00:00:00Z",
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
    thumb_path: `/tmp/thumbs/${id}.jpg`,
    thumb_ready: 1,
  };
}

describe("SinglePhotoView", () => {
  const photos = ["a", "b", "c"].map(makePhoto);

  beforeEach(() => {
    useLibraryStore.setState({
      photos,
      albums: [],
      selectedIds: new Set(),
      activeSource: { kind: "library" },
      activePhotoId: "b",
      expandedYears: new Set<number>(),
      foldersHeightPct: 50,
      albumPhotoIds: new Map(),
      history: [{ source: { kind: "library" }, scrollTop: 0 }],
      historyIndex: 0,
      liveScrollTop: 0,
      pendingScrollTop: null,
      viewMode: "single",
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an image for the active photo", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("b.jpg");
  });

  it("ArrowRight advances to the next photo", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useLibraryStore.getState().activePhotoId).toBe("c");
  });

  it("ArrowLeft goes back one photo", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useLibraryStore.getState().activePhotoId).toBe("a");
  });

  it("ArrowLeft at the start is a no-op and left button is disabled", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="a" />);
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useLibraryStore.getState().activePhotoId).toBe("a");
  });

  it("ArrowRight at the end is a no-op and right button is disabled", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="c" />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useLibraryStore.getState().activePhotoId).toBe("c");
  });

  it("Escape exits to grid", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useLibraryStore.getState().viewMode).toBe("grid");
  });

  it("double-click on image exits to grid", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.doubleClick(screen.getByTestId("single-photo-surface"));
    expect(useLibraryStore.getState().viewMode).toBe("grid");
  });

  it("unmount removes keydown listener (no stray dispatch)", () => {
    const { unmount } = render(
      <SinglePhotoView photos={photos} activePhotoId="b" />,
    );
    unmount();
    // After unmount, ArrowRight must not mutate activePhotoId.
    useLibraryStore.setState({ activePhotoId: "b" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useLibraryStore.getState().activePhotoId).toBe("b");
  });

  it("clicking the next button advances", () => {
    render(<SinglePhotoView photos={photos} activePhotoId="b" />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(useLibraryStore.getState().activePhotoId).toBe("c");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/components/SinglePhotoView.test.tsx
```

Expected: import error (file does not exist).

- [ ] **Step 3: Implement `SinglePhotoView`**

Create `src/components/SinglePhotoView.tsx`:

```tsx
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Photo } from "../types";
import { thumbUrl } from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";
import { usePreview } from "../hooks/usePreview";

interface Props {
  photos: Photo[];
  activePhotoId: string;
}

export function SinglePhotoView({ photos, activePhotoId }: Props) {
  const selectPhoto = useLibraryStore((s) => s.selectPhoto);
  const exitSingle = useLibraryStore((s) => s.exitSingle);

  const index = useMemo(
    () => photos.findIndex((p) => p.id === activePhotoId),
    [photos, activePhotoId],
  );
  const photo = index >= 0 ? photos[index] : null;

  const canPrev = index > 0;
  const canNext = index >= 0 && index < photos.length - 1;

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const maxPx = Math.ceil(Math.max(size.w, size.h) * dpr);

  const { url: previewUrl, error } = usePreview(photo?.id ?? null, maxPx);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        exitSingle();
      } else if (e.key === "ArrowRight") {
        if (index >= 0 && index < photos.length - 1) {
          selectPhoto(photos[index + 1].id);
        }
      } else if (e.key === "ArrowLeft") {
        if (index > 0) {
          selectPhoto(photos[index - 1].id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos, index, selectPhoto, exitSingle]);

  if (!photo) return null;

  const fallback = photo.thumb_ready ? thumbUrl(photo.thumb_path) : null;
  const src = previewUrl ?? fallback ?? undefined;

  return (
    <div
      ref={surfaceRef}
      data-testid="single-photo-surface"
      onDoubleClick={exitSingle}
      className="relative flex h-full w-full items-center justify-center bg-bg"
    >
      {src ? (
        <img
          src={src}
          alt={photo.filename}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
      ) : (
        <div className="text-sm text-muted">Loading…</div>
      )}

      {error && (
        <div className="absolute bottom-3 right-3 rounded bg-red-900/70 px-2 py-1 text-xs text-red-100">
          Preview failed
        </div>
      )}

      <button
        type="button"
        aria-label="Previous photo"
        disabled={!canPrev}
        onClick={(e) => {
          e.stopPropagation();
          if (canPrev) selectPhoto(photos[index - 1].id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx(
          "absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-black/50 text-white",
          "transition-opacity hover:bg-black/70",
          "disabled:opacity-30 disabled:hover:bg-black/50",
        )}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10 3 5 8 10 13" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Next photo"
        disabled={!canNext}
        onClick={(e) => {
          e.stopPropagation();
          if (canNext) selectPhoto(photos[index + 1].id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx(
          "absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-black/50 text-white",
          "transition-opacity hover:bg-black/70",
          "disabled:opacity-30 disabled:hover:bg-black/50",
        )}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 3 11 8 6 13" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/components/SinglePhotoView.test.tsx
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SinglePhotoView.tsx src/components/SinglePhotoView.test.tsx
git commit -m "feat(single-view): SinglePhotoView component"
```

---

## Task 8: Wire double-click on `PhotoThumb` to `enterSingle`

**Files:**
- Modify: `src/components/PhotoThumb.tsx`

- [ ] **Step 1: Add `onDoubleClick` wiring**

Modify `src/components/PhotoThumb.tsx`. Grab `enterSingle` from the store:

```tsx
  const toggleSelect = useLibraryStore((s) => s.toggleSelect);
  const enterSingle = useLibraryStore((s) => s.enterSingle);
```

Then add `onDoubleClick` to the outer `<div>`:

```tsx
    <div
      ref={draggable.setNodeRef}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        enterSingle(photo.id);
      }}
      ...
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test (optional here — full QA in Task 10)**

Run `npm run tauri dev`, double-click a thumbnail. The grid should not flip yet because `Library.tsx` is not wired; instead, open devtools and run `useLibraryStore.getState().viewMode` to confirm it's `"single"`. Hit `Esc` in devtools: `useLibraryStore.getState().exitSingle()`.

- [ ] **Step 4: Commit**

```bash
git add src/components/PhotoThumb.tsx
git commit -m "feat(single-view): double-click thumb to enter single view"
```

---

## Task 9: Library page — swap main area on `viewMode`, auto-exit effect

**Files:**
- Modify: `src/pages/Library.tsx`

- [ ] **Step 1: Import the new component and read `viewMode`**

In `src/pages/Library.tsx`, add the import:

```tsx
import { SinglePhotoView } from "../components/SinglePhotoView";
```

Read `viewMode` and `exitSingle` from the store alongside existing selectors:

```tsx
  const viewMode = useLibraryStore((s) => s.viewMode);
  const exitSingle = useLibraryStore((s) => s.exitSingle);
```

- [ ] **Step 2: Replace the main area branch**

Find the existing block:

```tsx
<main className="min-w-0 flex-1">
  {visible.length === 0 && !loading ? (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      No photos in this view.
    </div>
  ) : (
    <PhotoGrid photos={visible} onRemoveFromAlbum={onRemoveFromAlbum} />
  )}
</main>
```

Replace with:

```tsx
<main className="min-w-0 flex-1">
  {visible.length === 0 && !loading ? (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      No photos in this view.
    </div>
  ) : viewMode === "single" && activePhotoId ? (
    <SinglePhotoView photos={visible} activePhotoId={activePhotoId} />
  ) : (
    <PhotoGrid photos={visible} onRemoveFromAlbum={onRemoveFromAlbum} />
  )}
</main>
```

- [ ] **Step 3: Add the auto-exit effect**

Add near the top of the `Library` function, before the `return`:

```tsx
  useEffect(() => {
    if (viewMode !== "single") return;
    if (activePhotoId == null) return;
    if (!visible.some((p) => p.id === activePhotoId)) {
      exitSingle();
    }
  }, [viewMode, activePhotoId, visible, exitSingle]);
```

And add `useEffect` to the existing `react` import at the top:

```tsx
import { useEffect, useMemo, useState } from "react";
```

- [ ] **Step 4: Type-check + existing tests**

Run:

```bash
npx tsc --noEmit
npx vitest run
```

Expected: no TS errors; all vitest suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Library.tsx
git commit -m "feat(single-view): Library swaps grid vs single + auto-exit"
```

---

## Task 10: Manual QA + commit spec deviation note if anything changes

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Run:

```bash
npm run tauri dev
```

- [ ] **Step 2: Run the QA checklist**

Against a real library containing at least one HEIC and several JPGs:

1. Double-click a JPG thumbnail → single view loads in main area. Sidenav + metadata panel remain visible. Preview replaces thumbnail within ~1s.
2. Press `→` several times — photo advances, metadata panel updates each step.
3. Press `←` back to the start — left arrow button becomes visually disabled; another `←` keypress does nothing.
4. Navigate to the last photo with `→` — right arrow button disables.
5. Press `Esc` — returns to grid; selected photo is scrolled into view.
6. Re-enter single view by double-clicking a different thumb; confirm double-click on the image exits.
7. Open an HEIC-based photo in single view — confirm it renders (sips conversion path).
8. While in single view, click a different album in SideNav where the current photo isn't a member — view auto-exits back to grid.
9. Resize the window rapidly — preview does not regenerate every frame (debounced); image stays sharp at the final size.

- [ ] **Step 3: Full test suite**

Run:

```bash
npx vitest run
cd src-tauri && cargo test -p archiva_lib
```

Expected: all suites PASS.

- [ ] **Step 4: (No commit unless something broke and needed a fix.)**

If an issue surfaces during manual QA, commit the fix on top with a clear message. Otherwise move on.

---

## Self-Review Notes

**Spec coverage:**
- Goal "double-click to enter" — Task 8.
- Goal "arrow keys" + "on-screen arrows" — Task 7.
- Goal "Esc" — Task 7.
- Goal "scope = visible set, stops at ends" — Task 7 bounds checks.
- Goal "preview on-demand, viewport-bucketed" — Tasks 1, 2, 4, 6.
- Goal "thumbnail placeholder" — Task 7 fallback `src`.
- Goal "metadata panel updates during nav" — Task 7 calls `selectPhoto` which updates `activePhotoId`, which `MetadataPanel` already reads.
- Goal "auto-exit when activePhotoId leaves visible" — Task 9 effect.
- Goal "non-destructive, originals untouched" — Tasks 1–3 only write into `preview_dir` under `app_data_dir`.

**Spec deviation:** sips for all formats (see top of plan). Same functional outcome.

**Type consistency:** `viewMode`, `enterSingle`, `exitSingle`, `usePreview`, `generatePreview`, `generate_preview_impl`, `preview_dir`, `bucket_for`, `preview_path`, `preview_filename` — each name is used identically every time it appears.
