use anyhow::{anyhow, Context};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

pub const THUMB_MAX_EDGE: u32 = 256;

pub async fn generate_thumbnail_impl(
    photo_id: &str,
    thumb_dir: &Path,
    pool: &SqlitePool,
) -> anyhow::Result<PathBuf> {
    let (source_path, _ext): (String, String) =
        sqlx::query_as("SELECT path, ext FROM photos WHERE id = ?")
            .bind(photo_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow!("photo not found: {photo_id}"))?;

    tokio::fs::create_dir_all(thumb_dir).await?;
    let dest = thumb_dir.join(format!("{photo_id}.jpg"));

    let src = PathBuf::from(&source_path);
    let dest_clone = dest.clone();
    tokio::task::spawn_blocking(move || render_sips_thumb(&src, &dest_clone))
        .await
        .context("spawn_blocking panicked")??;

    let dest_str = dest.to_string_lossy().to_string();
    sqlx::query("UPDATE photos SET thumb_path = ?, thumb_ready = 1 WHERE id = ?")
        .bind(&dest_str)
        .bind(photo_id)
        .execute(pool)
        .await?;

    Ok(dest)
}

fn render_sips_thumb(src: &Path, dest: &Path) -> anyhow::Result<()> {
    let output = std::process::Command::new("sips")
        .args(["-Z", &THUMB_MAX_EDGE.to_string(), "-s", "format", "jpeg"])
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

// ---------------------------------------------------------------------------
// Tauri helper + command wrapper
// ---------------------------------------------------------------------------

use tauri::State;

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
