use crate::types::Album;
use chrono::Utc;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

pub async fn list_albums_impl(pool: &SqlitePool) -> anyhow::Result<Vec<Album>> {
    let rows: Vec<AlbumRow> = sqlx::query_as::<_, AlbumRow>(
        "SELECT * FROM albums ORDER BY sort_order ASC, created_at ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn create_album_impl(pool: &SqlitePool, name: &str) -> anyhow::Result<Album> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let max_order: Option<(i64,)> =
        sqlx::query_as("SELECT COALESCE(MAX(sort_order), -1) FROM albums")
            .fetch_optional(pool)
            .await?;
    let sort_order = max_order.map(|(n,)| n + 1).unwrap_or(0);

    sqlx::query(
        r#"INSERT INTO albums (id, name, description, cover_photo_id, is_smart, sort_order, created_at, updated_at)
           VALUES (?, ?, NULL, NULL, 0, ?, ?, ?)"#,
    )
    .bind(&id)
    .bind(name)
    .bind(sort_order)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(Album {
        id,
        name: name.to_string(),
        description: None,
        cover_photo_id: None,
        is_smart: 0,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub async fn rename_album_impl(pool: &SqlitePool, id: &str, name: &str) -> anyhow::Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE albums SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_album_impl(pool: &SqlitePool, id: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM albums WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn reorder_albums_impl(pool: &SqlitePool, ordered_ids: &[String]) -> anyhow::Result<()> {
    let mut tx = pool.begin().await?;
    for (index, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE albums SET sort_order = ? WHERE id = ?")
            .bind(index as i64)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn list_album_photos_impl(
    pool: &SqlitePool,
    album_id: &str,
) -> anyhow::Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT photo_id FROM album_photos WHERE album_id = ? ORDER BY sort_order ASC, added_at ASC",
    )
    .bind(album_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(s,)| s).collect())
}

pub async fn add_photos_to_album_impl(
    pool: &SqlitePool,
    album_id: &str,
    photo_ids: &[String],
) -> anyhow::Result<usize> {
    let mut tx = pool.begin().await?;
    let max_order: Option<(i64,)> =
        sqlx::query_as("SELECT COALESCE(MAX(sort_order), -1) FROM album_photos WHERE album_id = ?")
            .bind(album_id)
            .fetch_optional(&mut *tx)
            .await?;
    let mut next_order = max_order.map(|(n,)| n).unwrap_or(-1);
    let now = Utc::now().to_rfc3339();
    let mut inserted = 0usize;
    for photo_id in photo_ids {
        next_order += 1;
        let res = sqlx::query(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at, sort_order) VALUES (?, ?, ?, ?)",
        )
        .bind(album_id)
        .bind(photo_id)
        .bind(&now)
        .bind(next_order)
        .execute(&mut *tx)
        .await?;
        if res.rows_affected() > 0 {
            inserted += 1;
        }
    }
    tx.commit().await?;
    Ok(inserted)
}

pub async fn remove_photos_from_album_impl(
    pool: &SqlitePool,
    album_id: &str,
    photo_ids: &[String],
) -> anyhow::Result<usize> {
    let mut tx = pool.begin().await?;
    let mut removed = 0usize;
    for photo_id in photo_ids {
        let res = sqlx::query("DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?")
            .bind(album_id)
            .bind(photo_id)
            .execute(&mut *tx)
            .await?;
        if res.rows_affected() > 0 {
            removed += 1;
        }
    }
    tx.commit().await?;
    Ok(removed)
}

#[derive(sqlx::FromRow)]
struct AlbumRow {
    id: String,
    name: String,
    description: Option<String>,
    cover_photo_id: Option<String>,
    is_smart: i64,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

impl From<AlbumRow> for Album {
    fn from(r: AlbumRow) -> Self {
        Album {
            id: r.id,
            name: r.name,
            description: r.description,
            cover_photo_id: r.cover_photo_id,
            is_smart: r.is_smart,
            sort_order: r.sort_order,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_albums(pool: State<'_, SqlitePool>) -> Result<Vec<Album>, String> {
    list_albums_impl(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_album(name: String, pool: State<'_, SqlitePool>) -> Result<Album, String> {
    create_album_impl(pool.inner(), &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_album(
    id: String,
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    rename_album_impl(pool.inner(), &id, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_album(id: String, pool: State<'_, SqlitePool>) -> Result<(), String> {
    delete_album_impl(pool.inner(), &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_albums(
    ordered_ids: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    reorder_albums_impl(pool.inner(), &ordered_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_album_photos(
    album_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<String>, String> {
    list_album_photos_impl(pool.inner(), &album_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_photos_to_album(
    album_id: String,
    photo_ids: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<usize, String> {
    add_photos_to_album_impl(pool.inner(), &album_id, &photo_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_photos_from_album(
    album_id: String,
    photo_ids: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<usize, String> {
    remove_photos_from_album_impl(pool.inner(), &album_id, &photo_ids)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn setup() -> SqlitePool {
        let pool = db::connect_in_memory().await.expect("pool");
        db::migrate(&pool).await.expect("migrate");
        pool
    }

    async fn insert_photo(pool: &SqlitePool, id: &str) {
        sqlx::query(
            "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(format!("/tmp/{id}.jpg"))
        .bind(format!("{id}.jpg"))
        .bind("jpg")
        .bind(1_i64)
        .bind(Utc::now().to_rfc3339())
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn create_and_list_albums_in_sort_order() {
        let pool = setup().await;
        let a = create_album_impl(&pool, "First").await.unwrap();
        let b = create_album_impl(&pool, "Second").await.unwrap();
        let list = list_albums_impl(&pool).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, a.id);
        assert_eq!(list[1].id, b.id);
        assert_eq!(list[0].sort_order, 0);
        assert_eq!(list[1].sort_order, 1);
    }

    #[tokio::test]
    async fn rename_updates_name_and_updated_at() {
        let pool = setup().await;
        let a = create_album_impl(&pool, "Old").await.unwrap();
        rename_album_impl(&pool, &a.id, "New").await.unwrap();
        let list = list_albums_impl(&pool).await.unwrap();
        assert_eq!(list[0].name, "New");
    }

    #[tokio::test]
    async fn delete_removes_album_and_cascades_membership() {
        let pool = setup().await;
        let a = create_album_impl(&pool, "A").await.unwrap();
        insert_photo(&pool, "p1").await;
        add_photos_to_album_impl(&pool, &a.id, &["p1".to_string()])
            .await
            .unwrap();
        delete_album_impl(&pool, &a.id).await.unwrap();
        let list = list_albums_impl(&pool).await.unwrap();
        assert!(list.is_empty());
        let ids = list_album_photos_impl(&pool, &a.id).await.unwrap();
        assert!(ids.is_empty());
    }

    #[tokio::test]
    async fn reorder_rewrites_sort_order_in_single_tx() {
        let pool = setup().await;
        let a = create_album_impl(&pool, "A").await.unwrap();
        let b = create_album_impl(&pool, "B").await.unwrap();
        let c = create_album_impl(&pool, "C").await.unwrap();
        reorder_albums_impl(&pool, &[c.id.clone(), a.id.clone(), b.id.clone()])
            .await
            .unwrap();
        let list = list_albums_impl(&pool).await.unwrap();
        let ids: Vec<_> = list.iter().map(|x| x.id.clone()).collect();
        assert_eq!(ids, vec![c.id, a.id, b.id]);
    }

    #[tokio::test]
    async fn add_photos_is_idempotent_and_returns_inserted_count() {
        let pool = setup().await;
        let a = create_album_impl(&pool, "A").await.unwrap();
        insert_photo(&pool, "p1").await;
        insert_photo(&pool, "p2").await;
        let first = add_photos_to_album_impl(&pool, &a.id, &["p1".to_string(), "p2".to_string()])
            .await
            .unwrap();
        assert_eq!(first, 2);
        let second = add_photos_to_album_impl(&pool, &a.id, &["p1".to_string()])
            .await
            .unwrap();
        assert_eq!(second, 0);
        let ids = list_album_photos_impl(&pool, &a.id).await.unwrap();
        assert_eq!(ids, vec!["p1".to_string(), "p2".to_string()]);
    }

    #[tokio::test]
    async fn remove_photos_deletes_only_matching_rows() {
        let pool = setup().await;
        let a = create_album_impl(&pool, "A").await.unwrap();
        insert_photo(&pool, "p1").await;
        insert_photo(&pool, "p2").await;
        insert_photo(&pool, "p3").await;
        add_photos_to_album_impl(
            &pool,
            &a.id,
            &["p1".to_string(), "p2".to_string(), "p3".to_string()],
        )
        .await
        .unwrap();
        let removed =
            remove_photos_from_album_impl(&pool, &a.id, &["p1".to_string(), "p3".to_string()])
                .await
                .unwrap();
        assert_eq!(removed, 2);
        let ids = list_album_photos_impl(&pool, &a.id).await.unwrap();
        assert_eq!(ids, vec!["p2".to_string()]);
    }
}
