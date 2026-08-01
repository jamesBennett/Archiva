use anyhow::{anyhow, bail, Context};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const SCHEMA_VERSION: u32 = 1;
pub const BUNDLE_EXT: &str = "archivalib";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryMeta {
    pub uuid: String,
    pub name: String,
    pub schema_version: u32,
    pub created_at: String,
    pub app_version: String,
}

pub fn catalog_db_path(root: &Path) -> PathBuf {
    root.join("catalog.db")
}

pub fn thumb_dir(root: &Path) -> PathBuf {
    root.join("thumbs")
}

pub fn preview_dir(root: &Path) -> PathBuf {
    root.join("previews")
}

fn meta_path(root: &Path) -> PathBuf {
    root.join("meta.json")
}

pub fn read_meta(root: &Path) -> anyhow::Result<LibraryMeta> {
    let raw = std::fs::read_to_string(meta_path(root))
        .with_context(|| format!("not an Archiva library: {}", root.display()))?;
    serde_json::from_str(&raw).context("invalid meta.json")
}

pub fn write_meta(root: &Path, meta: &LibraryMeta) -> anyhow::Result<()> {
    let raw = serde_json::to_string_pretty(meta)?;
    std::fs::write(meta_path(root), raw).context("write meta.json")?;
    Ok(())
}

const INFO_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundlePackageType</key>
    <string>LIBR</string>
    <key>CFBundleIdentifier</key>
    <string>com.archiva.library</string>
</dict>
</plist>
"#;

pub fn create_bundle(parent: &Path, name: &str) -> anyhow::Result<PathBuf> {
    let root = parent.join(format!("{name}.{BUNDLE_EXT}"));
    if root.exists() {
        bail!("a library already exists at {}", root.display());
    }
    std::fs::create_dir_all(thumb_dir(&root)).context("create bundle dirs")?;
    std::fs::create_dir_all(preview_dir(&root)).context("create bundle dirs")?;
    std::fs::write(root.join("Info.plist"), INFO_PLIST).context("write Info.plist")?;
    let meta = LibraryMeta {
        uuid: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        schema_version: SCHEMA_VERSION,
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    write_meta(&root, &meta)?;
    Ok(root)
}

pub fn validate_bundle(root: &Path) -> anyhow::Result<LibraryMeta> {
    let meta = read_meta(root)?;
    if meta.schema_version > SCHEMA_VERSION {
        bail!(
            "this library was created by a newer version of Archiva (schema v{} > v{})",
            meta.schema_version,
            SCHEMA_VERSION
        );
    }
    if !is_local_volume(root)? {
        bail!("libraries on network volumes are not supported");
    }
    Ok(meta)
}

/// macOS statfs MNT_LOCAL check — SQLite WAL is unsafe on SMB/NFS.
pub fn is_local_volume(path: &Path) -> anyhow::Result<bool> {
    use std::os::unix::ffi::OsStrExt;
    let c_path = std::ffi::CString::new(path.as_os_str().as_bytes())?;
    let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::statfs(c_path.as_ptr(), &mut stat) };
    if rc != 0 {
        return Err(anyhow!("statfs failed for {}", path.display()));
    }
    Ok(stat.f_flags & (libc::MNT_LOCAL as u32) != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_bundle_produces_expected_layout() {
        let dir = tempfile::tempdir().unwrap();
        let root = create_bundle(dir.path(), "Test Library").unwrap();

        assert_eq!(root, dir.path().join("Test Library.archivalib"));
        assert!(root.join("Info.plist").is_file());
        assert!(root.join("meta.json").is_file());
        assert!(thumb_dir(&root).is_dir());
        assert!(preview_dir(&root).is_dir());

        let meta = read_meta(&root).unwrap();
        assert_eq!(meta.name, "Test Library");
        assert_eq!(meta.schema_version, SCHEMA_VERSION);
        assert!(!meta.uuid.is_empty());
    }

    #[test]
    fn create_bundle_refuses_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        create_bundle(dir.path(), "Dup").unwrap();
        assert!(create_bundle(dir.path(), "Dup").is_err());
    }

    #[test]
    fn validate_bundle_rejects_plain_directory() {
        let dir = tempfile::tempdir().unwrap();
        let err = validate_bundle(dir.path()).unwrap_err();
        assert!(err.to_string().contains("not an Archiva library"));
    }

    #[test]
    fn validate_bundle_rejects_future_schema_version() {
        let dir = tempfile::tempdir().unwrap();
        let root = create_bundle(dir.path(), "Future").unwrap();
        let mut meta = read_meta(&root).unwrap();
        meta.schema_version = SCHEMA_VERSION + 1;
        write_meta(&root, &meta).unwrap();

        let err = validate_bundle(&root).unwrap_err();
        assert!(err.to_string().contains("newer version"));
    }

    #[test]
    fn meta_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let root = create_bundle(dir.path(), "RT").unwrap();
        let meta = read_meta(&root).unwrap();
        write_meta(&root, &meta).unwrap();
        let again = read_meta(&root).unwrap();
        assert_eq!(again.uuid, meta.uuid);
        assert_eq!(again.created_at, meta.created_at);
    }

    #[test]
    fn tempdir_is_local_volume() {
        let dir = tempfile::tempdir().unwrap();
        assert!(is_local_volume(dir.path()).unwrap());
    }
}
