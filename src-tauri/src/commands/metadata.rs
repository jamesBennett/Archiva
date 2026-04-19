use crate::types::ExifData;
use exif::{In, Reader, Tag, Value};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

pub fn read_exif(path: &Path) -> ExifData {
    let Ok(file) = File::open(path) else {
        return ExifData::default();
    };
    let mut buf = BufReader::new(&file);
    let Ok(exif) = Reader::new().read_from_container(&mut buf) else {
        return ExifData::default();
    };

    let mut out = ExifData::default();

    out.camera_make = string_field(&exif, Tag::Make);
    out.camera_model = string_field(&exif, Tag::Model);
    out.lens_model = string_field(&exif, Tag::LensModel);
    out.created_at = string_field(&exif, Tag::DateTimeOriginal)
        .and_then(|s| parse_exif_datetime(&s));

    out.width = u_field(&exif, Tag::PixelXDimension);
    out.height = u_field(&exif, Tag::PixelYDimension);

    out.focal_length = rational_field(&exif, Tag::FocalLength);
    out.aperture = rational_field(&exif, Tag::FNumber);
    out.shutter_speed = string_field(&exif, Tag::ExposureTime);
    out.iso = u_field(&exif, Tag::PhotographicSensitivity);

    out.latitude = gps_coord(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef, b'S');
    out.longitude = gps_coord(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef, b'W');
    out.altitude = rational_field(&exif, Tag::GPSAltitude);

    out
}

fn string_field(exif: &exif::Exif, tag: Tag) -> Option<String> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    let s = field.display_value().to_string();
    let trimmed = s.trim_matches('"').trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn u_field(exif: &exif::Exif, tag: Tag) -> Option<i64> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    match field.value {
        Value::Short(ref v) => v.first().map(|n| *n as i64),
        Value::Long(ref v) => v.first().map(|n| *n as i64),
        _ => None,
    }
}

fn rational_field(exif: &exif::Exif, tag: Tag) -> Option<f64> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    match field.value {
        Value::Rational(ref v) => v.first().map(|r| r.to_f64()),
        _ => None,
    }
}

fn gps_coord(
    exif: &exif::Exif,
    coord_tag: Tag,
    ref_tag: Tag,
    negative_ref: u8,
) -> Option<f64> {
    let field = exif.get_field(coord_tag, In::PRIMARY)?;
    let Value::Rational(ref rationals) = field.value else {
        return None;
    };
    if rationals.len() < 3 {
        return None;
    }
    let degrees = rationals[0].to_f64();
    let minutes = rationals[1].to_f64();
    let seconds = rationals[2].to_f64();
    let mut decimal = degrees + minutes / 60.0 + seconds / 3600.0;

    if let Some(ref_field) = exif.get_field(ref_tag, In::PRIMARY) {
        if let Value::Ascii(ref bytes) = ref_field.value {
            if bytes.first().and_then(|b| b.first()).copied() == Some(negative_ref) {
                decimal = -decimal;
            }
        }
    }
    Some(decimal)
}

fn parse_exif_datetime(s: &str) -> Option<String> {
    use chrono::NaiveDateTime;
    let dt = NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S").ok()?;
    Some(dt.and_utc().to_rfc3339())
}
