mod common;

use archiva_lib::commands::metadata;
use common::fixtures;
use tempfile::TempDir;

#[test]
fn returns_default_for_file_without_exif() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("plain.jpg");
    fixtures::write_solid_jpeg(&path, 64, 48, [255, 0, 0]);

    let exif = metadata::read_exif(&path);
    assert!(exif.camera_make.is_none());
    assert!(exif.camera_model.is_none());
}

#[test]
fn returns_default_for_nonexistent_file() {
    let exif = metadata::read_exif(std::path::Path::new("/does/not/exist.jpg"));
    assert!(exif.camera_make.is_none());
}
