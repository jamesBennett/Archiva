use archiva_lib::db;
use sqlx::Row;

#[tokio::test]
async fn migration_creates_all_tables() {
    let pool = db::connect_in_memory().await.expect("pool");
    db::migrate(&pool).await.expect("migrate");

    let tables: Vec<String> =
        sqlx::query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .fetch_all(&pool)
            .await
            .unwrap()
            .into_iter()
            .map(|row| row.get::<String, _>("name"))
            .collect();

    assert!(tables.contains(&"photos".to_string()));
    assert!(tables.contains(&"albums".to_string()));
    assert!(tables.contains(&"album_photos".to_string()));
    assert!(tables.contains(&"smart_album_rules".to_string()));
    assert!(tables.contains(&"folders".to_string()));
}

#[tokio::test]
async fn migration_is_idempotent() {
    let pool = db::connect_in_memory().await.unwrap();
    db::migrate(&pool).await.unwrap();
    db::migrate(&pool).await.unwrap();
}
