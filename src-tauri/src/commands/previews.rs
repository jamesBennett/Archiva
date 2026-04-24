use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context};
use sqlx::SqlitePool;

pub const PREVIEW_BUCKETS: [u32; 3] = [1024, 2048, 4096];

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

    use crate::db;
    use chrono::Utc;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_tiny_jpg(path: &Path) {
        let bytes: &[u8] = &[
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
            0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06,
            0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D,
            0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
            0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28,
            0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,
            0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
            0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
            0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10,
            0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00,
            0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42,
            0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16,
            0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37,
            0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55,
            0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73,
            0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5,
            0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA,
            0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6,
            0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA,
            0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08,
            0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD0, 0xFF, 0xD9,
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
}
