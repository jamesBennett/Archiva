pub mod commands;
pub mod db;
pub mod types;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app_data_dir");
            std::fs::create_dir_all(&data_dir).expect("create app_data_dir");
            let db_path = data_dir.join("archiva.db");

            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::connect_file(&db_path).await.expect("connect db");
                db::migrate(&pool).await.expect("migrate db");
                handle.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::photos::scan_folder,
            commands::photos::list_photos,
            commands::thumbnails::generate_thumbnail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
