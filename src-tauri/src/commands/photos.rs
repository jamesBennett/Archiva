use crate::commands::metadata;
use crate::types::{Photo, ScanResult};
use anyhow::Context;
use chrono::Utc;
use sqlx::SqlitePool;
use std::path::Path;
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
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<ScanResult, String> {
    let pool_inner = pool.inner().clone();
    let path_buf = std::path::PathBuf::from(&path);
    let result = scan_folder_impl(&path_buf, &pool_inner)
        .await
        .map_err(|e| e.to_string())?;

    let thumb_dir = crate::commands::thumbnails::thumb_dir(&app).map_err(|e| e.to_string())?;
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
pub async fn list_photos(pool: State<'_, SqlitePool>) -> Result<Vec<Photo>, String> {
    list_photos_impl(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

pub async fn list_photos_impl(pool: &SqlitePool) -> anyhow::Result<Vec<Photo>> {
    let rows: Vec<PhotoRow> = sqlx::query_as::<_, PhotoRow>(
        "SELECT * FROM photos ORDER BY COALESCE(created_at, imported_at) DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
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
