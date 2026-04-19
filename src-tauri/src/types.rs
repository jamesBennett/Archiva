use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Photo {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub ext: String,
    pub size_bytes: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub imported_at: String,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
    pub rating: i64,
    pub flag: i64,
    pub color_label: Option<String>,
    pub is_favorite: i64,
    pub thumb_path: Option<String>,
    pub thumb_ready: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExifData {
    pub created_at: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub inserted: usize,
    pub skipped: usize,
    pub photo_ids: Vec<String>,
}
