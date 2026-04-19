mod common;

use archiva_lib::commands::photos::scan_folder_impl;
use archiva_lib::db;
use common::fixtures;
use sqlx::Row;
use tempfile::TempDir;

#[tokio::test]
async fn indexes_jpg_and_png_and_ignores_other_files() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let dir = TempDir::new().unwrap();
    fixtures::write_solid_jpeg(&dir.path().join("a.jpg"), 32, 32, [200, 50, 50]);
    fixtures::write_solid_png(&dir.path().join("b.png"), 32, 32, [50, 200, 50]);
    std::fs::write(dir.path().join("readme.txt"), "skip me").unwrap();

    let result = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(result.inserted, 2);
    assert_eq!(result.photo_ids.len(), 2);

    let count: i64 = sqlx::query("SELECT COUNT(*) AS c FROM photos")
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("c");
    assert_eq!(count, 2);
}

#[tokio::test]
async fn rescanning_same_folder_skips_existing() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let dir = TempDir::new().unwrap();
    fixtures::write_solid_jpeg(&dir.path().join("a.jpg"), 32, 32, [128, 128, 128]);

    let first = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(first.inserted, 1);

    let second = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(second.inserted, 0);
    assert_eq!(second.skipped, 1);
}

#[tokio::test]
async fn recurses_into_subdirectories() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let dir = TempDir::new().unwrap();
    let sub = dir.path().join("nested/deep");
    std::fs::create_dir_all(&sub).unwrap();
    fixtures::write_solid_jpeg(&sub.join("x.jpg"), 32, 32, [0, 0, 0]);

    let result = scan_folder_impl(dir.path(), &pool).await.unwrap();
    assert_eq!(result.inserted, 1);
}
