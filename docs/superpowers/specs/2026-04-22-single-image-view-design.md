# Single Image View — Design

**Status:** Approved design, pending implementation plan
**Date:** 2026-04-22
**Issue:** #4
**Phase:** 1 (Core Library) — viewing

## Summary

Add a single-photo view that replaces the `PhotoGrid` in the main viewing area while keeping `SideNav` and `MetadataPanel` visible on the sides. Users enter it by double-clicking a thumbnail, navigate between adjacent photos with arrow keys or on-screen side arrows, and exit with `Esc` or a second double-click on the image.

The view filters through the currently-visible photo set (whatever the active source resolves to — library, date, album, or no-date bucket), with bounds-stopping navigation. Preview images are generated on demand by a new Tauri command and cached at viewport-appropriate resolutions.

## Goals

- Let the user examine a single photo at full viewport resolution without losing context (sidenav + metadata stay visible).
- Navigate adjacent photos with arrow keys and on-screen arrow buttons.
- Reuse existing state (`activePhotoId`, `useVisiblePhotos`) so the right metadata panel updates during navigation.
- Keep first paint fast by falling back to the cached thumbnail while the preview generates.
- Non-destructive: originals are never touched; previews are cache-only in `app_data_dir()/previews/`.

## Non-goals

- True OS-level fullscreen (image still sits between sidenav and metadata panel).
- Filmstrip at the bottom of the view.
- In-view metadata overlay (camera/date/etc. stays in the right panel).
- Keyboard shortcuts beyond arrow keys and `Esc`.
- Swipe / trackpad gesture navigation.
- Zoom / pan inside the image.
- Wrap-around navigation (last → first). Navigation stops at bounds.
- Background-click-to-close (not a modal, shouldn't feel like one).
- Preview regeneration during scan — previews are strictly on-demand.
- New routing layer — the view is a render-mode switch inside the existing single-page shell.

## User-facing behavior

### Entering single view

- Double-click on a `PhotoThumb` in the grid → the main area swaps to `SinglePhotoView` showing that photo. The thumbnail's `photo.id` becomes `activePhotoId`.
- SideNav (left) and MetadataPanel (right) remain visible and unchanged.
- Header (Archiva title + Back/Forward + counter + Refresh + FolderPicker + AddToCollection) remains visible and functional.

### In single view

- The image is rendered with `object-fit: contain` centered in the available main area. Background is the app's `bg` color.
- Until the preview loads, the cached thumbnail is shown in the same placement as a fallback.
- Two circular arrow buttons sit over the image at vertical center (left edge and right edge), each ~32px. At the beginning of the visible set the left arrow is disabled (reduced opacity, no hover, no click); at the end the right arrow is disabled.
- No counter, no filename, no metadata overlay in this view. Filename and EXIF remain in the right `MetadataPanel`, which updates as navigation changes `activePhotoId`.

### Navigation

- `ArrowRight` / right arrow button → next photo in `useVisiblePhotos()` ordering. Clamps at end.
- `ArrowLeft` / left arrow button → previous photo. Clamps at start.
- Each navigation updates `activePhotoId` so the right panel follows.
- Preview for the new photo loads via `usePreview`; the adjacent photos (`index ± 1`) are prefetched fire-and-forget to warm the cache.

### Exiting single view

- `Esc` key → returns to grid. `activePhotoId` is preserved so the grid re-reveals the selected photo and scroll restoration positions it.
- Double-click on the image → same behavior as `Esc`.
- No other exit triggers (no backdrop click, no button — header has no single-view–specific control).

### Auto-exit edge case

- If `activeSource` changes while in single view (user clicks a different album / date in SideNav) and the current `activePhotoId` is not in the new visible set, `Library.tsx` calls `exitSingle()` via effect so the view flips back to the grid automatically.
- Entering single view is a no-op when `visible.length === 0`.

## Architecture

Two layers: a frontend render-mode switch and a new backend preview command.

### Frontend

Store (`src/store/useLibraryStore.ts`):
- New field `viewMode: "grid" | "single"` (default `"grid"`).
- New action `enterSingle(photoId: string)` → sets `viewMode: "single"` and `activePhotoId: photoId`.
- New action `exitSingle()` → sets `viewMode: "grid"`. `activePhotoId` preserved.

Navigation math (next/prev index, clamping) lives in `SinglePhotoView`, which has access to the visible array via `useVisiblePhotos()`. The store stays source-agnostic.

New component `src/components/SinglePhotoView.tsx`:

```ts
interface Props {
  photos: Photo[];        // = useVisiblePhotos() result, passed by Library
  activePhotoId: string;  // guaranteed present by Library gating
}
```

Responsibilities:
- Compute `index = photos.findIndex(p => p.id === activePhotoId)`.
- Measure its own container (`ResizeObserver`) to get CSS width/height of the main area.
- Compute `maxPx = ceil(max(widthCSS, heightCSS) * devicePixelRatio)` and pass to `usePreview`.
- Render the image with `object-fit: contain`. Use `photo.thumb_path` via `thumbUrl()` as the fallback `src` while preview loads.
- Render two side arrow buttons; disable each at its bound.
- Bind `keydown` listener on `window` for `ArrowLeft`, `ArrowRight`, `Escape` only while mounted.
- Double-click on the image container calls `exitSingle()`.
- Fire `generate_preview` for neighbors (`photos[index - 1]`, `photos[index + 1]`) fire-and-forget on `activePhotoId` change (or on mount).

New hook `src/hooks/usePreview.ts`:

```ts
interface UsePreviewResult {
  url: string | null;     // convertFileSrc-wrapped preview path once ready
  loading: boolean;
  error: string | null;
}

function usePreview(photoId: string | null, maxPx: number): UsePreviewResult;
```

- Calls `generatePreview(photoId, maxPx)` from `src/lib/tauri.ts`.
- Uses a ref (`latestRequestedId`) to discard stale resolutions when the user navigates faster than the backend can respond.
- On success, wraps the returned filesystem path through `convertFileSrc`.
- Debounces on rapid `maxPx` changes during window resize (e.g. 100ms trailing) — not a new library, just `setTimeout`/`clearTimeout` inside the effect.

Library page (`src/pages/Library.tsx`) changes:
- Read `viewMode` from the store.
- In the `<main>` area: if `viewMode === "single"` and `activePhoto != null` and `visible.length > 0`, render `<SinglePhotoView photos={visible} activePhotoId={activePhoto.id} />`; otherwise render the existing `<PhotoGrid>` branch.
- Effect: watch `viewMode + visible + activePhotoId`; if `viewMode === "single"` and `activePhotoId` no longer in `visible`, call `exitSingle()`.

`PhotoThumb` (`src/components/PhotoThumb.tsx`) changes:
- Add `onDoubleClick` that calls `enterSingle(photo.id)`. Single-click still calls `selectPhoto` (active) and checkbox still toggles selection as today.

Tauri wrapper (`src/lib/tauri.ts`):
- Export `generatePreview(photoId: string, maxPx: number): Promise<string>` → `invoke("generate_preview", { photoId, maxPx })`.

### Backend

New module `src-tauri/src/commands/previews.rs`:

```rust
#[tauri::command]
pub async fn generate_preview(
    photo_id: String,
    max_px: u32,
    app_handle: tauri::AppHandle,
    db: tauri::State<'_, DbPool>,
) -> Result<String, String>
```

Behavior:
1. Look up photo row → `path` and `ext`.
2. Bucket the requested size: `bucket = next_pow2(max_px).clamp(1024, 4096)`. Only three possible buckets: 1024, 2048, 4096.
3. Compute destination: `app_data_dir()/previews/{photo_id}_{bucket}.jpg`.
4. If destination exists, return its absolute path.
5. Otherwise, ensure the `previews/` directory exists, then generate:
   - HEIC / HEIF (`.heic`, `.heif`, case-insensitive): shell out to `sips -Z {bucket} -s format jpeg {source} --out {dest}`. Use `tokio::process::Command`.
   - Everything else: load via `image` crate inside `tokio::task::spawn_blocking`, resize with `image::imageops::FilterType::Lanczos3` so that `max(width, height) <= bucket`, encode JPEG quality 85 via `image::codecs::jpeg::JpegEncoder`.
6. Return absolute destination path.

Registration (`src-tauri/src/main.rs`): add `commands::previews::generate_preview` to `tauri::generate_handler![]`. Ensure `previews/` directory initialization lives alongside existing thumbnail directory setup (`db.rs` or `main.rs` — wherever `thumbs/` is created today).

## Data flow

```
User double-clicks PhotoThumb
  └─> enterSingle(photo.id)                  [store: viewMode=single, activePhotoId=id]
       └─> Library re-renders <main>
            └─> <SinglePhotoView photos={visible} activePhotoId={id}/>
                 ├─> measures size (ResizeObserver)
                 ├─> usePreview(id, maxPx)
                 │    ├─> invoke("generate_preview", { photoId: id, maxPx })
                 │    └─> Rust: cached? return path : sips|image crate -> write -> return path
                 ├─> renders <img src={previewUrl ?? thumbUrl(photo.thumb_path)}/>
                 ├─> prefetches neighbors (index-1, index+1)
                 └─> MetadataPanel (right) re-reads activePhotoId -> updates automatically

Arrow key / arrow button
  └─> selectPhoto(photos[newIndex].id)       [clamped]
       └─> SinglePhotoView re-renders for new photo, loop repeats

Esc / double-click on image
  └─> exitSingle()                           [viewMode=grid, activePhotoId retained]
       └─> Library re-renders <PhotoGrid>; existing scroll restoration places user
           at the previously-selected photo
```

## Error handling

Frontend:
- `usePreview` returns `{ url, loading, error }`. On `error`, the image element falls back to the thumbnail URL and a small red text ("Preview failed") is shown in a corner overlay. No crash, no retry.
- Invalid `activePhotoId` (not in photos) is prevented by the gating in Library — if it ever happens, `SinglePhotoView` is simply not rendered that frame.

Backend `generate_preview` returns `Err(String)` for:
- `"photo not found: {id}"` — no row matches `photo_id`.
- `"source unreadable: {path}"` — file missing or not readable.
- `"sips failed: {stderr}"` — HEIC conversion exit code nonzero.
- `"decode failed: {err}"` — `image` crate decode error.

All other logic (bucket math, directory creation) uses `anyhow::Context` internally and converts to `String` at the command boundary, matching the existing convention.

## Race-safety

- `usePreview` compares resolved `photo_id` + `bucket` against a `latestRequestedRef` before committing state. Stale responses are dropped.
- Prefetch calls for neighbors are `.catch(() => {})` — errors don't surface anywhere.
- Navigation clamps on both index and button-disabled state, so no out-of-range fetches.

## File layout

**Added**

```
src/components/SinglePhotoView.tsx
src/components/SinglePhotoView.test.tsx
src/hooks/usePreview.ts
src/hooks/usePreview.test.ts
src-tauri/src/commands/previews.rs
```

**Modified**

```
src/store/useLibraryStore.ts        viewMode + enterSingle + exitSingle
src/store/useLibraryStore.test.ts   new cases
src/pages/Library.tsx               swap PhotoGrid vs SinglePhotoView in <main>; auto-exit effect
src/components/PhotoThumb.tsx       onDoubleClick -> enterSingle
src/lib/tauri.ts                    generatePreview wrapper
src-tauri/src/main.rs               register generate_preview handler
src-tauri/src/commands/mod.rs       pub mod previews
(optional) src-tauri/src/db.rs      previews/ directory initialization
```

## Testing strategy

### Frontend (Vitest + @testing-library/react)

`useLibraryStore.test.ts`:
- `enterSingle(id)` sets `viewMode === "single"` and `activePhotoId === id`.
- `exitSingle()` sets `viewMode === "grid"` and keeps `activePhotoId`.
- Calling `enterSingle` twice with different ids resets `activePhotoId` each time.

`SinglePhotoView.test.tsx`:
- Renders an `<img>` whose `src` is the preview URL when `usePreview` resolves, otherwise the thumbnail URL.
- `ArrowRight` selects `photos[index + 1]` (`selectPhoto` called with that id).
- `ArrowLeft` selects `photos[index - 1]`.
- At index 0, the left button has `disabled` and `ArrowLeft` is a no-op.
- At the last index, right button is `disabled` and `ArrowRight` is a no-op.
- `Escape` calls `exitSingle`.
- Double-clicking the image calls `exitSingle`.
- Unmount removes the `keydown` listener (no leak; re-mount doesn't double-fire).

`usePreview.test.ts`:
- Happy path: mocked `invoke` resolves with a path; `url` ends up as `convertFileSrc(path)` and `loading` is false.
- Error path: mocked rejection populates `error` and leaves `url === null`.
- Stale-response dropping: two rapid `photoId` changes; the older resolution does not clobber state.
- Debounce on rapid `maxPx` changes: only the trailing call actually invokes.

Integration (inside existing Library test or a new `Library.test.tsx`):
- With `viewMode === "single"` and `activePhotoId` present in `visible`, `SinglePhotoView` is rendered and `PhotoGrid` is not.
- Toggling `viewMode` back flips the render.
- Changing `activeSource` so `activePhotoId` is no longer in the new `visible` triggers auto-exit.

`PhotoThumb` test (if one exists, otherwise inline):
- `dblClick` on the thumb fires `enterSingle(photo.id)`.

### Backend (`cargo test`)

`previews::tests`:
- `bucket_for(500) == 1024`, `bucket_for(1024) == 1024`, `bucket_for(1025) == 2048`, `bucket_for(4097) == 4096`.
- `preview_path(id, bucket)` returns `.../previews/{id}_{bucket}.jpg`.
- Given a small JPG fixture, generate returns a path whose file exists and whose decoded image has `max(w,h) <= bucket`.
- Second call for the same `photo_id + bucket` does not rewrite the file (compare mtime).
- Missing source path → `Err(_)` starting with `"source unreadable"`.

### Manual QA

Run `npm run tauri dev` against a real library containing at least one HEIC and assorted JPGs:

1. Double-click a JPG thumbnail → single view loads. Preview replaces thumbnail within ~1s.
2. `→` several times — photo advances, metadata panel updates each step.
3. `←` back to the start; left arrow button becomes visually disabled.
4. Navigate to the last photo; right arrow button disables.
5. `Esc` returns to grid; the selected photo is scrolled into view.
6. Re-enter single view; double-click on the image exits the same way.
7. Open an HEIC and confirm it renders (sips path).
8. While in single view, click a different album in SideNav: view auto-exits.
9. Resize the window: preview does not regenerate constantly (debounced), bucket is stable.

## Open questions

None outstanding at spec time.

## Follow-ups (out of scope)

- Preview generation queued alongside thumbnails at scan time (eagerly warm the cache).
- Zoom / pan interactions.
- Filmstrip at the bottom.
- Keyboard shortcuts for rating/flagging while in single view (Phase 3).
- Swipe gestures (Phase 4 polish).
