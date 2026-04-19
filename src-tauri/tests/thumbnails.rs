mod common;

use archiva_lib::commands::photos::scan_folder_impl;
use archiva_lib::commands::thumbnails::generate_thumbnail_impl;
use archiva_lib::db;
use common::fixtures;
use image::GenericImageView;
use tempfile::TempDir;

#[tokio::test]
async fn generates_jpeg_thumbnail_under_target_size() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let src_dir = TempDir::new().unwrap();
    fixtures::write_solid_jpeg(&src_dir.path().join("big.jpg"), 2048, 1024, [10, 20, 30]);

    let thumb_dir = TempDir::new().unwrap();

    let scanned = scan_folder_impl(src_dir.path(), &pool).await.unwrap();
    let photo_id = scanned.photo_ids[0].clone();

    let thumb_path = generate_thumbnail_impl(&photo_id, thumb_dir.path(), &pool)
        .await
        .unwrap();

    let img = image::open(&thumb_path).unwrap();
    let (w, h) = img.dimensions();
    assert!(w <= 256 && h <= 256, "thumb too big: {w}x{h}");
    assert!(w == 256 || h == 256, "thumb should hit target on long edge");

    let row: (i64, Option<String>) =
        sqlx::query_as("SELECT thumb_ready, thumb_path FROM photos WHERE id = ?")
            .bind(&photo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row.0, 1);
    assert!(row.1.unwrap().ends_with(".jpg"));
}

#[tokio::test]
async fn generates_thumbnail_for_png() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();

    let src_dir = TempDir::new().unwrap();
    fixtures::write_solid_png(&src_dir.path().join("p.png"), 1024, 2048, [90, 90, 90]);

    let thumb_dir = TempDir::new().unwrap();
    let scanned = scan_folder_impl(src_dir.path(), &pool).await.unwrap();
    let thumb_path = generate_thumbnail_impl(&scanned.photo_ids[0], thumb_dir.path(), &pool)
        .await
        .unwrap();
    assert!(thumb_path.exists());
}
