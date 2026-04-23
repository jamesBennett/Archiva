use std::path::{Path, PathBuf};

pub const PREVIEW_BUCKETS: [u32; 3] = [1024, 2048, 4096];

pub fn bucket_for(max_px: u32) -> u32 {
    for &b in &PREVIEW_BUCKETS {
        if max_px <= b {
            return b;
        }
    }
    *PREVIEW_BUCKETS.last().expect("non-empty")
}

pub fn preview_filename(photo_id: &str, bucket: u32) -> String {
    format!("{photo_id}_{bucket}.jpg")
}

pub fn preview_path(preview_dir: &Path, photo_id: &str, bucket: u32) -> PathBuf {
    preview_dir.join(preview_filename(photo_id, bucket))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_for_rounds_up_to_next_bucket() {
        assert_eq!(bucket_for(0), 1024);
        assert_eq!(bucket_for(500), 1024);
        assert_eq!(bucket_for(1024), 1024);
        assert_eq!(bucket_for(1025), 2048);
        assert_eq!(bucket_for(2048), 2048);
        assert_eq!(bucket_for(2049), 4096);
        assert_eq!(bucket_for(4096), 4096);
    }

    #[test]
    fn bucket_for_clamps_oversize_to_4096() {
        assert_eq!(bucket_for(4097), 4096);
        assert_eq!(bucket_for(10_000), 4096);
    }

    #[test]
    fn preview_filename_includes_id_and_bucket() {
        assert_eq!(preview_filename("abc-123", 2048), "abc-123_2048.jpg");
    }

    #[test]
    fn preview_path_joins_dir_and_filename() {
        let dir = Path::new("/tmp/previews");
        let p = preview_path(dir, "abc-123", 1024);
        assert_eq!(p, PathBuf::from("/tmp/previews/abc-123_1024.jpg"));
    }
}
