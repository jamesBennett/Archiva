pub mod commands;
pub mod db;
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
            Ok(())
        })
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
