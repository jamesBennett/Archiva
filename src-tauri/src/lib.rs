pub mod commands;
pub mod db;
pub mod legacy;
pub mod library;
pub mod prefs;
pub mod state;
pub mod types;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
                    if let Err(e) = commands::library::open_library_at(&handle, &state, &root).await
                    {
                        log::warn!("could not reopen {}: {e:#}", recent.path);
                    }
                }
                // 3. Nothing opened → frontend shows the picker.
            });
            Ok(())
        })
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
        .invoke_handler(tauri::generate_handler![
            commands::photos::scan_folder,
            commands::photos::rescan_folders,
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
            commands::library::list_recent_libraries,
            commands::library::create_library,
            commands::library::open_library,
            commands::library::current_library,
            commands::library::close_library,
            commands::library::reveal_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
