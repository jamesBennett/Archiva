import type { Photo } from "../types";

interface Props {
  photo: Photo | null;
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-right text-white break-all">{String(value)}</span>
    </div>
  );
}

function formatShutter(s: string | null): string | null {
  return s;
}

function formatAperture(a: number | null): string | null {
  return a === null ? null : `f/${a.toFixed(1)}`;
}

function formatFocal(f: number | null): string | null {
  return f === null ? null : `${f.toFixed(0)}mm`;
}

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function MetadataPanel({ photo }: Props) {
  if (!photo) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        No photo selected
      </div>
    );
  }

  const dims = photo.width && photo.height ? `${photo.width} × ${photo.height}` : null;
  const gps =
    photo.latitude !== null && photo.longitude !== null
      ? `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}`
      : null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <div className="truncate text-sm font-medium text-white">{photo.filename}</div>
        <div className="truncate text-xs text-muted">{photo.path}</div>
      </div>

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-muted">File</h3>
        <Row label="Dimensions" value={dims} />
        <Row label="Size" value={formatSize(photo.size_bytes)} />
        <Row label="Format" value={photo.ext.toUpperCase()} />
        <Row label="Created" value={photo.created_at} />
        <Row label="Modified" value={photo.modified_at} />
      </section>

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-muted">Camera</h3>
        <Row label="Make" value={photo.camera_make} />
        <Row label="Model" value={photo.camera_model} />
        <Row label="Lens" value={photo.lens_model} />
        <Row label="Focal" value={formatFocal(photo.focal_length)} />
        <Row label="Aperture" value={formatAperture(photo.aperture)} />
        <Row label="Shutter" value={formatShutter(photo.shutter_speed)} />
        <Row label="ISO" value={photo.iso} />
      </section>

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-muted">GPS</h3>
        <Row label="Coords" value={gps} />
        <Row label="Altitude" value={photo.altitude === null ? null : `${photo.altitude.toFixed(0)} m`} />
      </section>
    </div>
  );
}
