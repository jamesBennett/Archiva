use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::Path;

const PREFS_FILE: &str = "prefs.json";
const MAX_RECENTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Prefs {
    pub recents: Vec<RecentLibrary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentLibrary {
    pub uuid: String,
    pub path: String,
    pub name: String,
    pub last_opened: String,
}

pub fn load(app_data_dir: &Path) -> Prefs {
    let path = app_data_dir.join(PREFS_FILE);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(app_data_dir: &Path, prefs: &Prefs) -> anyhow::Result<()> {
    std::fs::create_dir_all(app_data_dir).context("create app_data_dir")?;
    let raw = serde_json::to_string_pretty(prefs)?;
    std::fs::write(app_data_dir.join(PREFS_FILE), raw).context("write prefs.json")?;
    Ok(())
}

pub fn push_recent(prefs: &mut Prefs, entry: RecentLibrary) {
    prefs.recents.retain(|r| r.uuid != entry.uuid);
    prefs.recents.insert(0, entry);
    prefs.recents.truncate(MAX_RECENTS);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(uuid: &str, path: &str) -> RecentLibrary {
        RecentLibrary {
            uuid: uuid.into(),
            path: path.into(),
            name: "Lib".into(),
            last_opened: "2026-07-30T00:00:00Z".into(),
        }
    }

    #[test]
    fn load_missing_file_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        let prefs = load(dir.path());
        assert!(prefs.recents.is_empty());
    }

    #[test]
    fn load_corrupt_file_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("prefs.json"), "{not json").unwrap();
        assert!(load(dir.path()).recents.is_empty());
    }

    #[test]
    fn save_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let mut prefs = Prefs::default();
        push_recent(&mut prefs, entry("a", "/tmp/a.archivalib"));
        save(dir.path(), &prefs).unwrap();
        let loaded = load(dir.path());
        assert_eq!(loaded.recents.len(), 1);
        assert_eq!(loaded.recents[0].uuid, "a");
    }

    #[test]
    fn push_recent_dedupes_by_uuid_and_moves_to_front() {
        let mut prefs = Prefs::default();
        push_recent(&mut prefs, entry("a", "/old/a.archivalib"));
        push_recent(&mut prefs, entry("b", "/b.archivalib"));
        push_recent(&mut prefs, entry("a", "/new/a.archivalib"));
        assert_eq!(prefs.recents.len(), 2);
        assert_eq!(prefs.recents[0].uuid, "a");
        assert_eq!(prefs.recents[0].path, "/new/a.archivalib");
        assert_eq!(prefs.recents[1].uuid, "b");
    }

    #[test]
    fn push_recent_caps_at_ten() {
        let mut prefs = Prefs::default();
        for i in 0..12 {
            push_recent(&mut prefs, entry(&format!("u{i}"), &format!("/p{i}")));
        }
        assert_eq!(prefs.recents.len(), 10);
        assert_eq!(prefs.recents[0].uuid, "u11");
    }
}
