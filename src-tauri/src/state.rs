use sqlx::SqlitePool;
use std::path::PathBuf;
use tokio::sync::RwLock;

pub struct OpenLibrary {
    pub uuid: String,
    pub root: PathBuf,
    pub pool: SqlitePool,
    pub thumb_dir: PathBuf,
    pub preview_dir: PathBuf,
}

pub struct AppState {
    pub current: RwLock<Option<OpenLibrary>>,
}

const NO_LIBRARY: &str = "No library open";

impl AppState {
    pub fn new() -> Self {
        Self {
            current: RwLock::new(None),
        }
    }

    pub async fn pool(&self) -> Result<SqlitePool, String> {
        let guard = self.current.read().await;
        guard
            .as_ref()
            .map(|l| l.pool.clone())
            .ok_or_else(|| NO_LIBRARY.to_string())
    }

    pub async fn thumb_dir(&self) -> Result<PathBuf, String> {
        let guard = self.current.read().await;
        guard
            .as_ref()
            .map(|l| l.thumb_dir.clone())
            .ok_or_else(|| NO_LIBRARY.to_string())
    }

    pub async fn preview_dir(&self) -> Result<PathBuf, String> {
        let guard = self.current.read().await;
        guard
            .as_ref()
            .map(|l| l.preview_dir.clone())
            .ok_or_else(|| NO_LIBRARY.to_string())
    }

    /// Install a new library, returning the previous one (caller closes its pool).
    pub async fn install(&self, lib: OpenLibrary) -> Option<OpenLibrary> {
        self.current.write().await.replace(lib)
    }

    pub async fn take(&self) -> Option<OpenLibrary> {
        self.current.write().await.take()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pool_errors_when_no_library_open() {
        let state = AppState::new();
        assert_eq!(state.pool().await.unwrap_err(), "No library open");
        assert_eq!(state.thumb_dir().await.unwrap_err(), "No library open");
    }

    #[tokio::test]
    async fn install_returns_previous_library() {
        let state = AppState::new();
        let pool = crate::db::connect_in_memory().await.unwrap();
        let lib = OpenLibrary {
            uuid: "u1".into(),
            root: PathBuf::from("/tmp/a.archivalib"),
            pool: pool.clone(),
            thumb_dir: PathBuf::from("/tmp/a.archivalib/thumbs"),
            preview_dir: PathBuf::from("/tmp/a.archivalib/previews"),
        };
        assert!(state.install(lib).await.is_none());
        assert_eq!(
            state.thumb_dir().await.unwrap(),
            PathBuf::from("/tmp/a.archivalib/thumbs")
        );

        let pool2 = crate::db::connect_in_memory().await.unwrap();
        let lib2 = OpenLibrary {
            uuid: "u2".into(),
            root: PathBuf::from("/tmp/b.archivalib"),
            pool: pool2,
            thumb_dir: PathBuf::from("/tmp/b.archivalib/thumbs"),
            preview_dir: PathBuf::from("/tmp/b.archivalib/previews"),
        };
        let old = state.install(lib2).await.unwrap();
        assert_eq!(old.uuid, "u1");

        let taken = state.take().await.unwrap();
        assert_eq!(taken.uuid, "u2");
        assert!(state.pool().await.is_err());
    }
}
