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

    ExifData {
        camera_make: string_field(&exif, Tag::Make),
        camera_model: string_field(&exif, Tag::Model),
        lens_model: string_field(&exif, Tag::LensModel),
        created_at: string_field(&exif, Tag::DateTimeOriginal)
            .and_then(|s| parse_exif_datetime(&s)),
        width: u_field(&exif, Tag::PixelXDimension),
        height: u_field(&exif, Tag::PixelYDimension),
        focal_length: rational_field(&exif, Tag::FocalLength),
        aperture: rational_field(&exif, Tag::FNumber),
        shutter_speed: string_field(&exif, Tag::ExposureTime),
        iso: u_field(&exif, Tag::PhotographicSensitivity),
        latitude: gps_coord(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef, b'S'),
        longitude: gps_coord(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef, b'W'),
        altitude: rational_field(&exif, Tag::GPSAltitude),
    }
}

fn string_field(exif: &exif::Exif, tag: Tag) -> Option<String> {
    let field = exif.get_field(tag, In::PRIMARY)?;
    let s = match &field.value {
        // The display formatter quotes each ASCII entry, including empty
        // entries produced by cameras that pad fixed-width fields with NULs.
        Value::Ascii(values) => values
            .iter()
            .map(|bytes| String::from_utf8_lossy(bytes).trim().to_owned())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        _ => field.display_value().to_string(),
    };
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Clean the old formatter's repeated empty ASCII entries when reading an
/// existing catalog. This also works when the original photo is offline.
pub(crate) fn clean_cached_ascii(value: Option<String>) -> Option<String> {
    let value = value?;
    let text = value.trim_end();
    // The old trim_matches('"') removed the final empty entry's quotes,
    // leaving a trailing comma (e.g. `Lens name", "", "",`).
    let Some(mut text) = text.strip_suffix(',').map(str::trim_end) else {
        return Some(value);
    };
    let mut removed_padding = false;
    while let Some(prefix) = text.strip_suffix(", \"\"") {
        text = prefix;
        removed_padding = true;
    }
    if !removed_padding && !text.is_empty() {
        return Some(value);
    }
    let text = text.strip_suffix('"').unwrap_or(text).trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_owned())
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

fn gps_coord(exif: &exif::Exif, coord_tag: Tag, ref_tag: Tag, negative_ref: u8) -> Option<f64> {
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
