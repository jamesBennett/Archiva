use anyhow::Context;
use std::path::{Path, PathBuf};

/// One-time migration of the pre-bundle `archiva.db` into a fresh bundle.
/// Returns Ok(None) when there is nothing to migrate.
pub async fn migrate_legacy(
    app_data_dir: &Path,
    pictures_dir: &Path,
) -> anyhow::Result<Option<PathBuf>> {
    let legacy_db = app_data_dir.join("archiva.db");
    if !legacy_db.exists() {
        return Ok(None);
    }

    // A crashed prior run may have left a -wal; checkpoint before copying so
    // the bare-file copy contains all committed data.
    {
        let pool = crate::db::connect_file(&legacy_db).await?;
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&pool)
            .await?;
        pool.close().await;
    }

    // Uniquify: Archiva, Archiva 2, Archiva 3, …
    let mut name = "Archiva".to_string();
    let mut i = 2;
    while pictures_dir
        .join(format!("{name}.{}", crate::library::BUNDLE_EXT))
        .exists()
    {
        name = format!("Archiva {i}");
        i += 1;
    }
    let root = crate::library::create_bundle(pictures_dir, &name)?;

    // Copy, never move — the original stays recoverable if this dies midway.
    std::fs::copy(&legacy_db, crate::library::catalog_db_path(&root))
        .context("copy legacy db into bundle")?;

    // Move cached thumbnail/preview files into the bundle (renames within a
    // volume; falls back to copy+delete across volumes).
    fn move_dir_contents(src: &Path, dest_dir: &Path) -> anyhow::Result<()> {
        if !src.is_dir() {
            return Ok(());
        }
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let dest = dest_dir.join(entry.file_name());
            if std::fs::rename(entry.path(), &dest).is_err() {
                std::fs::copy(entry.path(), &dest)?;
                let _ = std::fs::remove_file(entry.path());
            }
        }
        Ok(())
    }
    move_dir_contents(
        &app_data_dir.join("thumbs"),
        &crate::library::thumb_dir(&root),
    )?;
    move_dir_contents(
        &app_data_dir.join("previews"),
        &crate::library::preview_dir(&root),
    )?;

    // thumb_path is dead (paths are derived from the bundle now), but the moved
    // files land exactly where the derived path points — so keep thumb_ready
    // for rows whose thumb actually made it, and only regenerate the rest.
    {
        let thumbs = crate::library::thumb_dir(&root);
        let pool = crate::db::connect_file(&crate::library::catalog_db_path(&root)).await?;
        let ids: Vec<(String,)> = sqlx::query_as("SELECT id FROM photos")
            .fetch_all(&pool)
            .await?;
        let mut tx = pool.begin().await?;
        sqlx::query("UPDATE photos SET thumb_path = NULL, thumb_ready = 0")
            .execute(&mut *tx)
            .await?;
        for (id,) in ids {
            if thumbs.join(format!("{id}.jpg")).is_file() {
                sqlx::query("UPDATE photos SET thumb_ready = 1 WHERE id = ?")
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
        tx.commit().await?;
        pool.close().await;
    }

    // Success — retire the legacy file (and its WAL leftovers).
    std::fs::rename(&legacy_db, app_data_dir.join("archiva.db.migrated"))
        .context("rename legacy db")?;
    let _ = std::fs::remove_file(app_data_dir.join("archiva.db-wal"));
    let _ = std::fs::remove_file(app_data_dir.join("archiva.db-shm"));

    Ok(Some(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_legacy_db(app_data: &Path) {
        let db_path = app_data.join("archiva.db");
        let pool = crate::db::connect_file(&db_path).await.unwrap();
        crate::db::migrate(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at, thumb_path, thumb_ready)
             VALUES ('p1', '/photos/a.jpg', 'a.jpg', 'jpg', 10, '2026-01-01T00:00:00Z', '/old/thumbs/p1.jpg', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        // p2 has no cached thumb file — must come out needing regeneration.
        sqlx::query(
            "INSERT INTO photos (id, path, filename, ext, size_bytes, imported_at, thumb_path, thumb_ready)
             VALUES ('p2', '/photos/b.jpg', 'b.jpg', 'jpg', 20, '2026-01-01T00:00:00Z', '/old/thumbs/p2.jpg', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        // Leave WAL un-checkpointed on purpose: pool dropped without close.
        drop(pool);
    }

    #[tokio::test]
    async fn migrates_legacy_db_into_new_bundle() {
        let app_data = tempfile::tempdir().unwrap();
        let pictures = tempfile::tempdir().unwrap();
        make_legacy_db(app_data.path()).await;
        std::fs::create_dir_all(app_data.path().join("thumbs")).unwrap();
        std::fs::write(app_data.path().join("thumbs/p1.jpg"), b"jpegbytes").unwrap();

        let root = migrate_legacy(app_data.path(), pictures.path())
            .await
            .unwrap()
            .expect("should migrate");

        // Bundle opens and the photo row survived (WAL was checkpointed pre-copy).
        let pool = crate::db::connect_file(&crate::library::catalog_db_path(&root))
            .await
            .unwrap();
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM photos")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 2);
        // Migrated thumb survives; the row without a file regenerates.
        let rows: Vec<(String, Option<String>, i64)> =
            sqlx::query_as("SELECT id, thumb_path, thumb_ready FROM photos ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows[0].0, "p1");
        assert_eq!(rows[0].1, None);
        assert_eq!(rows[0].2, 1);
        assert_eq!(rows[1].0, "p2");
        assert_eq!(rows[1].1, None);
        assert_eq!(rows[1].2, 0);
        pool.close().await;

        // Thumbs moved into the bundle; legacy db renamed, original gone.
        assert!(crate::library::thumb_dir(&root).join("p1.jpg").is_file());
        assert!(app_data.path().join("archiva.db.migrated").is_file());
        assert!(!app_data.path().join("archiva.db").exists());
    }

    #[tokio::test]
    async fn no_legacy_db_is_a_noop() {
        let app_data = tempfile::tempdir().unwrap();
        let pictures = tempfile::tempdir().unwrap();
        let out = migrate_legacy(app_data.path(), pictures.path())
            .await
            .unwrap();
        assert!(out.is_none());
    }

    #[tokio::test]
    async fn uniquifies_bundle_name_when_taken() {
        let app_data = tempfile::tempdir().unwrap();
        let pictures = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(pictures.path().join("Archiva.archivalib")).unwrap();
        make_legacy_db(app_data.path()).await;

        let root = migrate_legacy(app_data.path(), pictures.path())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(root, pictures.path().join("Archiva 2.archivalib"));
    }
}
