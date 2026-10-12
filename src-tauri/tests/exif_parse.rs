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

fn write_exif(path: &std::path::Path, fields: &[exif::Field]) {
    let mut writer = exif::experimental::Writer::new();
    for field in fields {
        writer.push_field(field);
    }
    let mut bytes = std::io::Cursor::new(Vec::new());
    writer.write(&mut bytes, false).unwrap();
    std::fs::write(path, bytes.into_inner()).unwrap();
}

#[test]
fn reads_padded_ascii_text_without_serializing_empty_entries() {
    use exif::{Field, In, Tag, Value};
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("padded.tiff");
    let fields = [
        (Tag::Make, "FUJIFILM"),
        (Tag::Model, "X-T5"),
        (Tag::LensModel, "XF35mmF2 R WR"),
        (Tag::DateTimeOriginal, "2026:09:06 12:34:56"),
    ]
    .map(|(tag, text)| {
        let mut entries = vec![text.as_bytes().to_vec()];
        entries.extend(vec![Vec::new(); 60]);
        Field {
            tag,
            ifd_num: In::PRIMARY,
            value: Value::Ascii(entries),
        }
    });
    write_exif(&path, &fields);
    let data = metadata::read_exif(&path);
    assert_eq!(data.camera_make.as_deref(), Some("FUJIFILM"));
    assert_eq!(data.camera_model.as_deref(), Some("X-T5"));
    assert_eq!(data.lens_model.as_deref(), Some("XF35mmF2 R WR"));
    assert_eq!(
        data.created_at.as_deref(),
        Some("2026-09-06T12:34:56+00:00")
    );
}

#[test]
fn ignores_empty_lens_padding_and_preserves_real_punctuation() {
    use exif::{Field, In, Tag, Value};
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("lens.tiff");
    for (entries, expected) in [
        (vec![""; 60], None),
        (vec!["", "  ", ""], None),
        (
            vec!["  Acme 2\" lens, Limited Edition  ", ""],
            Some("Acme 2\" lens, Limited Edition"),
        ),
        (
            vec!["", "Lens name", "", "Adapter"],
            Some("Lens name, Adapter"),
        ),
    ] {
        write_exif(
            &path,
            &[Field {
                tag: Tag::LensModel,
                ifd_num: In::PRIMARY,
                value: Value::Ascii(entries.iter().map(|s| s.as_bytes().to_vec()).collect()),
            }],
        );
        assert_eq!(metadata::read_exif(&path).lens_model.as_deref(), expected);
    }
}

#[test]
fn preserves_formatted_non_ascii_exposure_time() {
    use exif::{Field, In, Rational, Tag, Value};
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("shutter.tiff");
    write_exif(
        &path,
        &[Field {
            tag: Tag::ExposureTime,
            ifd_num: In::PRIMARY,
            value: Value::Rational(vec![Rational { num: 1, denom: 125 }]),
        }],
    );
    assert_eq!(
        metadata::read_exif(&path).shutter_speed.as_deref(),
        Some("1/125")
    );
}
