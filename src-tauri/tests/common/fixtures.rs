use image::{ImageBuffer, Rgb};
use std::path::Path;

pub fn write_solid_jpeg(path: &Path, w: u32, h: u32, rgb: [u8; 3]) {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(w, h, |_, _| Rgb(rgb));
    img.save_with_format(path, image::ImageFormat::Jpeg)
        .expect("write jpeg fixture");
}

pub fn write_solid_png(path: &Path, w: u32, h: u32, rgb: [u8; 3]) {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(w, h, |_, _| Rgb(rgb));
    img.save_with_format(path, image::ImageFormat::Png)
        .expect("write png fixture");
}
