use crate::commands::metadata;
use crate::types::{Photo, RescanResult, ScanResult};
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

    for (path, ext) in collect_candidates(root.to_path_buf()).await? {
        let path = path.as_path();
        let path_str = path.to_string_lossy().to_string();
        let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM photos WHERE path = ?")
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

async fn collect_candidates(root: PathBuf) -> anyhow::Result<Vec<(PathBuf, String)>> {
    tokio::task::spawn_blocking(move || {
        WalkDir::new(root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| {
                let ext = ext_lower(e.path())?;
                INDEXED_EXTS
                    .contains(&ext.as_str())
                    .then(|| (e.into_path(), ext))
            })
            .collect()
    })
    .await
    .context("directory walk panicked")
}

async fn record_folder(root: &Path, pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO folders (id, path, last_scanned_at) VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET last_scanned_at = excluded.last_scanned_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(root.to_string_lossy().to_string())
    .bind(Utc::now().to_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

/// Libraries created before scan roots were recorded have an empty `folders`
/// table, so their roots have to be inferred from indexed photo paths.
async fn backfill_folders(pool: &SqlitePool) -> anyhow::Result<()> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM folders")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }
    let paths: Vec<(String,)> = sqlx::query_as("SELECT path FROM photos")
        .fetch_all(pool)
        .await?;
    let home = std::env::var_os("HOME").map(PathBuf::from);
    for root in infer_roots(paths.iter().map(|(p,)| Path::new(p)), home.as_deref()) {
        sqlx::query("INSERT OR IGNORE INTO folders (id, path) VALUES (?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(root.to_string_lossy().to_string())
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// Prefers the single deepest common ancestor of all photo dirs, so new
/// sibling folders (e.g. a new year) are picked up. Falls back to the
/// outermost photo dirs when that ancestor is `/`, home, or above home —
/// rescanning those would walk far more than the user ever imported.
fn infer_roots<'a>(files: impl Iterator<Item = &'a Path>, home: Option<&Path>) -> Vec<PathBuf> {
    let dirs: Vec<PathBuf> = files
        .filter_map(|f| f.parent().map(Path::to_path_buf))
        .collect();
    let Some(common) = common_ancestor(&dirs) else {
        return Vec::new();
    };
    let too_broad = common.parent().is_none() || home.is_some_and(|h| h.starts_with(&common));
    if too_broad {
        outermost(dirs)
    } else {
        vec![common]
    }
}

fn common_ancestor(dirs: &[PathBuf]) -> Option<PathBuf> {
    let mut iter = dirs.iter();
    let mut common = iter.next()?.clone();
    for dir in iter {
        while !dir.starts_with(&common) {
            if !common.pop() {
                return None;
            }
        }
    }
    Some(common)
}

/// Drops every path nested under another path in the set.
fn outermost(mut dirs: Vec<PathBuf>) -> Vec<PathBuf> {
    // Sorted order puts every ancestor before its descendants.
    dirs.sort();
    dirs.dedup();
    let mut roots: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        if !roots.last().is_some_and(|r| dir.starts_with(r)) {
            roots.push(dir);
        }
    }
    roots
}

/// Removes recorded roots covered by another root, e.g. after the user adds a
/// parent of folders inferred by an earlier backfill.
async fn prune_nested_folders(pool: &SqlitePool) -> anyhow::Result<Vec<PathBuf>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT path FROM folders")
        .fetch_all(pool)
        .await?;
    let all: Vec<PathBuf> = rows.into_iter().map(|(p,)| PathBuf::from(p)).collect();
    let keep = outermost(all.clone());
    for path in all.iter().filter(|p| !keep.contains(p)) {
        sqlx::query("DELETE FROM folders WHERE path = ?")
            .bind(path.to_string_lossy().to_string())
            .execute(pool)
            .await?;
    }
    Ok(keep)
}

pub async fn rescan_folders_impl(pool: &SqlitePool) -> anyhow::Result<(RescanResult, Vec<String>)> {
    backfill_folders(pool).await?;
    let roots = prune_nested_folders(pool).await?;

    let mut result = RescanResult {
        folders: 0,
        inserted: 0,
        skipped: 0,
        missing: Vec::new(),
    };
    let mut photo_ids = Vec::new();
    for root_path in roots {
        if !tokio::fs::metadata(&root_path)
            .await
            .is_ok_and(|m| m.is_dir())
        {
            result.missing.push(root_path.to_string_lossy().to_string());
            continue;
        }
        let scan = scan_folder_impl(&root_path, pool).await?;
        record_folder(&root_path, pool).await?;
        result.folders += 1;
        result.inserted += scan.inserted;
        result.skipped += scan.skipped;
        photo_ids.extend(scan.photo_ids);
    }
    Ok((result, photo_ids))
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
    let modified_at: Option<String> = meta
        .modified()
        .ok()
        .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339());
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

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

use tauri::{AppHandle, Emitter, State};

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

    record_folder(&path_buf, &pool_inner)
        .await
        .map_err(|e| e.to_string())?;
    queue_thumbnails(result.photo_ids.clone(), pool_inner, thumb_dir, app);
    Ok(result)
}

#[tauri::command]
pub async fn rescan_folders(
    state: State<'_, crate::state::AppState>,
    app: AppHandle,
) -> Result<RescanResult, String> {
    let pool = state.pool().await?;
    let thumb_dir = state.thumb_dir().await?;
    let (result, photo_ids) = rescan_folders_impl(&pool)
        .await
        .map_err(|e| e.to_string())?;
    queue_thumbnails(photo_ids, pool, thumb_dir, app);
    Ok(result)
}

fn queue_thumbnails(ids: Vec<String>, pool: SqlitePool, thumb_dir: PathBuf, app: AppHandle) {
    // Keep semaphore below max_connections (8) so reads stay unblocked during thumb generation.
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
    for id in ids {
        let pool_clone = pool.clone();
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
}

#[tauri::command]
pub async fn list_photos(state: State<'_, crate::state::AppState>) -> Result<Vec<Photo>, String> {
    let pool = state.pool().await?;
    let thumb_dir = state.thumb_dir().await?;
    list_photos_impl(&pool, &thumb_dir)
        .await
        .map_err(|e| e.to_string())
}

pub async fn list_photos_impl(pool: &SqlitePool, thumb_dir: &Path) -> anyhow::Result<Vec<Photo>> {
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
            camera_make: metadata::clean_cached_ascii(r.camera_make),
            camera_model: metadata::clean_cached_ascii(r.camera_model),
            lens_model: metadata::clean_cached_ascii(r.lens_model),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn insert_photo(pool: &SqlitePool, id: &str, thumb_ready: i64) {
        sqlx::query(
            "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at, thumb_path, thumb_ready) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(format!("/src/{id}.jpg"))
        .bind(format!("{id}.jpg"))
        .bind("jpg")
        .bind(1_i64)
        .bind(Utc::now().to_rfc3339())
        .bind("/stale/absolute/path.jpg")
        .bind(thumb_ready)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn list_photos_derives_thumb_path_from_thumb_dir() {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        insert_photo(&pool, "ready", 1).await;
        insert_photo(&pool, "notready", 0).await;

        let photos = list_photos_impl(&pool, Path::new("/tmp/thumbs"))
            .await
            .unwrap();
        assert_eq!(photos.len(), 2);

        let ready = photos.iter().find(|p| p.id == "ready").unwrap();
        assert_eq!(
            ready.thumb_path.as_deref(),
            Some("/tmp/thumbs/ready.jpg"),
            "stored absolute thumb_path must be replaced by one derived from thumb_dir"
        );

        let not_ready = photos.iter().find(|p| p.id == "notready").unwrap();
        assert_eq!(not_ready.thumb_path, None);
    }

    #[tokio::test]
    async fn list_photos_cleans_legacy_ascii_padding_without_original_files() {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        insert_photo(&pool, "padded", 0).await;
        insert_photo(&pool, "empty", 0).await;
        insert_photo(&pool, "normal", 0).await;
        for (id, lens) in [
            ("padded", "XF35mmF2 R WR\", \"\", \"\","),
            ("empty", ", \"\", \"\","),
            ("normal", "Acme 2\" lens, Limited Edition"),
        ] {
            sqlx::query(
                "UPDATE photos SET lens_model = ?, camera_model = ?, camera_make = ? WHERE id = ?",
            )
            .bind(lens)
            .bind(lens)
            .bind(lens)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        }

        let photos = list_photos_impl(&pool, Path::new("/missing/thumbs"))
            .await
            .unwrap();
        for (id, expected) in [
            ("padded", Some("XF35mmF2 R WR")),
            ("empty", None),
            ("normal", Some("Acme 2\" lens, Limited Edition")),
        ] {
            let photo = photos.iter().find(|p| p.id == id).unwrap();
            assert_eq!(photo.lens_model.as_deref(), expected);
            assert_eq!(photo.camera_model.as_deref(), expected);
            assert_eq!(photo.camera_make.as_deref(), expected);
        }
    }

    async fn folder_paths(pool: &SqlitePool) -> Vec<String> {
        sqlx::query_as::<_, (String,)>("SELECT path FROM folders ORDER BY path")
            .fetch_all(pool)
            .await
            .unwrap()
            .into_iter()
            .map(|(p,)| p)
            .collect()
    }

    #[tokio::test]
    async fn rescan_indexes_only_new_files_in_recorded_folders() {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.jpg"), b"x").unwrap();

        scan_folder_impl(dir.path(), &pool).await.unwrap();
        record_folder(dir.path(), &pool).await.unwrap();

        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/b.jpg"), b"x").unwrap();
        std::fs::write(dir.path().join("notes.txt"), b"x").unwrap();

        let (result, ids) = rescan_folders_impl(&pool).await.unwrap();
        assert_eq!(result.folders, 1);
        assert_eq!(result.inserted, 1);
        assert_eq!(result.skipped, 1);
        assert!(result.missing.is_empty());
        assert_eq!(ids.len(), 1);
    }

    #[tokio::test]
    async fn rescan_reports_missing_folders() {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        record_folder(Path::new("/definitely/not/here"), &pool)
            .await
            .unwrap();

        let (result, ids) = rescan_folders_impl(&pool).await.unwrap();
        assert_eq!(result.folders, 0);
        assert_eq!(result.missing, vec!["/definitely/not/here".to_string()]);
        assert!(ids.is_empty());
    }

    #[tokio::test]
    async fn rescan_backfills_common_ancestor_when_no_folders_recorded() {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        for (id, path) in [
            ("1", "/p/photos/2025/sept/a.jpg"),
            ("2", "/p/photos/2025/oct/day2/b.jpg"),
            ("3", "/p/photos/2024/c.jpg"),
        ] {
            sqlx::query(
                "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at) VALUES (?, ?, '', 'jpg', 1, '')",
            )
            .bind(id)
            .bind(path)
            .execute(&pool)
            .await
            .unwrap();
        }

        let (result, _) = rescan_folders_impl(&pool).await.unwrap();
        assert_eq!(folder_paths(&pool).await, vec!["/p/photos"]);
        assert_eq!(result.missing, vec!["/p/photos".to_string()]);
    }

    #[test]
    fn infer_roots_falls_back_to_outermost_dirs_when_ancestor_is_home_or_above() {
        let files = [
            Path::new("/Users/me/Pictures/a/1.jpg"),
            Path::new("/Users/me/Pictures/a/b/2.jpg"),
            Path::new("/Users/me/Desktop/3.jpg"),
        ];
        assert_eq!(
            infer_roots(files.into_iter(), Some(Path::new("/Users/me"))),
            vec![
                PathBuf::from("/Users/me/Desktop"),
                PathBuf::from("/Users/me/Pictures/a")
            ],
        );

        let split = [Path::new("/Volumes/X/1.jpg"), Path::new("/p/2.jpg")];
        assert_eq!(
            infer_roots(split.into_iter(), None),
            vec![PathBuf::from("/Volumes/X"), PathBuf::from("/p")],
        );

        let trip = [Path::new("/p/trip/a.jpg"), Path::new("/p/trip-2/c.jpg")];
        assert_eq!(
            infer_roots(trip.into_iter(), None),
            vec![PathBuf::from("/p")]
        );
    }

    #[tokio::test]
    async fn rescan_prunes_folders_nested_under_another_root() {
        let pool = db::connect_in_memory().await.unwrap();
        db::migrate(&pool).await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("2025/sept")).unwrap();
        std::fs::create_dir_all(dir.path().join("2026/oct")).unwrap();
        std::fs::write(dir.path().join("2026/oct/new.jpg"), b"x").unwrap();
        record_folder(&dir.path().join("2025/sept"), &pool)
            .await
            .unwrap();
        record_folder(dir.path(), &pool).await.unwrap();

        let (result, _) = rescan_folders_impl(&pool).await.unwrap();
        assert_eq!(
            folder_paths(&pool).await,
            vec![dir.path().to_string_lossy().to_string()],
        );
        assert_eq!(result.folders, 1);
        assert_eq!(result.inserted, 1);
    }
}
