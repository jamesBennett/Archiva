use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS photos (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    filename      TEXT NOT NULL,
    ext           TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    created_at    TEXT,
    modified_at   TEXT,
    imported_at   TEXT NOT NULL,
    camera_make   TEXT,
    camera_model  TEXT,
    lens_model    TEXT,
    focal_length  REAL,
    aperture      REAL,
    shutter_speed TEXT,
    iso           INTEGER,
    latitude      REAL,
    longitude     REAL,
    altitude      REAL,
    rating        INTEGER DEFAULT 0,
    flag          INTEGER DEFAULT 0,
    color_label   TEXT,
    is_favorite   INTEGER DEFAULT 0,
    thumb_path    TEXT,
    thumb_ready   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS albums (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
    is_smart       INTEGER DEFAULT 0,
    sort_order     INTEGER DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS album_photos (
    album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    photo_id   TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    added_at   TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (album_id, photo_id)
);

CREATE TABLE IF NOT EXISTS smart_album_rules (
    id         TEXT PRIMARY KEY,
    album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    field      TEXT NOT NULL,
    operator   TEXT NOT NULL,
    value      TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS folders (
    id              TEXT PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    last_scanned_at TEXT,
    auto_scan       INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_photos_created_at   ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_rating       ON photos(rating);
CREATE INDEX IF NOT EXISTS idx_photos_flag         ON photos(flag);
CREATE INDEX IF NOT EXISTS idx_photos_camera_model ON photos(camera_model);
CREATE INDEX IF NOT EXISTS idx_photos_latitude     ON photos(latitude);
CREATE INDEX IF NOT EXISTS idx_album_photos_album  ON album_photos(album_id);
"#;

pub async fn connect_file(db_path: &Path) -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.display()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await?;
    Ok(pool)
}

pub async fn connect_in_memory() -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")?.foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await?;
    Ok(pool)
}

pub async fn migrate(pool: &SqlitePool) -> anyhow::Result<()> {
    for stmt in SCHEMA.split(';') {
        let trimmed = stmt.trim();
        if trimmed.is_empty() {
            continue;
        }
        sqlx::query(trimmed).execute(pool).await?;
    }
    Ok(())
}
