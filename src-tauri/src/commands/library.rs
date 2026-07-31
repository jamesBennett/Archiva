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
    let preview_dir = library::preview_dir(root);
    tokio::fs::create_dir_all(&thumb_dir).await?;
    tokio::fs::create_dir_all(&preview_dir).await?;

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
            preview_dir,
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

    // Thumbs/previews live inside the bundle (e.g. under ~/Pictures) —
    // outside the static asset-protocol scope, so allow it at runtime.
    let _ = app.asset_protocol_scope().allow_directory(root, true);

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
    let root =
        library::create_bundle(Path::new(&parent_dir), trimmed).map_err(|e| e.to_string())?;
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
