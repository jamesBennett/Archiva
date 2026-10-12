import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { thumbUrl } from "../lib/tauri";
import type { PhotoOpenOrigin } from "../store/useLibraryStore";
import type { Photo } from "../types";

interface Props {
  photo: Photo;
  previewUrl: string | null;
  previewError: string | null;
  size: { w: number; h: number };
  origin: PhotoOpenOrigin | null;
}

export function PhotoImage({ photo, previewUrl, previewError, size, origin }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const initialPhotoId = useRef<string | null>(photo.id);
  const [dimensions, setDimensions] = useState({
    w: origin?.imageWidth || photo.width || 1,
    h: origin?.imageHeight || photo.height || 1,
  });
  const [decoded, setDecoded] = useState<{
    photoId: string;
    filename: string;
    url: string;
  } | null>(null);
  const [decodeFailedId, setDecodeFailedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(!!origin);
  const didAnimate = useRef(false);
  const failed = !!previewError || decodeFailedId === photo.id;
  // Navigation keeps the current sharp image until the next one is ready.
  // Only the initial opening (or a failed preview) uses a thumbnail.
  const fallback = photo.thumb_ready && (photo.id === initialPhotoId.current || failed)
    ? thumbUrl(photo.thumb_path)
    : null;
  const visiblePreview = decoded?.photoId === photo.id || (!failed && !fallback) ? decoded : null;
  const loading = decoded?.photoId !== photo.id && !failed;

  useEffect(() => {
    if (photo.id !== initialPhotoId.current) initialPhotoId.current = null;
  }, [photo.id]);

  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    setDecodeFailedId(null);
    const image = new Image();
    image.src = previewUrl;
    // Decode off screen, then replace the displayed preview in one render.
    image.decode().then(() => {
      if (cancelled) return;
      // The measured thumbnail already has the correct orientation. Preserve
      // its aspect ratio during expansion despite preview rounding differences.
      if (!origin) setDimensions({ w: image.naturalWidth, h: image.naturalHeight });
      setDecoded({ photoId: photo.id, filename: photo.filename, url: previewUrl });
    }).catch(() => {
      if (!cancelled) setDecodeFailedId(photo.id);
    });
    return () => { cancelled = true; };
  }, [previewUrl, origin, photo.id, photo.filename]);

  const fit = Math.min(size.w / dimensions.w, size.h / dimensions.h);
  const width = dimensions.w * fit;
  const height = dimensions.h * fit;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || width <= 0 || height <= 0) return;
    if (didAnimate.current || !origin || !frame.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setOpening(false);
      return;
    }

    const target = frame.getBoundingClientRect();
    // Match the thumbnail's cover crop with a uniform scale, then reveal the
    // uncropped image as it expands. Portraits and panoramas never stretch.
    const scale = Math.max(origin.width / width, origin.height / height);
    const insetX = Math.max(0, (1 - origin.width / (width * scale)) * 50);
    const insetY = Math.max(0, (1 - origin.height / (height * scale)) * 50);
    const x = origin.left + origin.width / 2 - (target.left + target.width / 2);
    const y = origin.top + origin.height / 2 - (target.top + target.height / 2);
    const animation = frame.animate([
      {
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        clipPath: `inset(${insetY}% ${insetX}% round ${6 / scale}px)`,
      },
      { transform: "translate(0, 0) scale(1)", clipPath: "inset(0% 0% round 0px)" },
    ], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" });
    animation.onfinish = () => {
      didAnimate.current = true;
      setOpening(false);
      animation.cancel();
    };
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [origin, width, height]);

  if (!fallback && !visiblePreview) {
    return <div className="text-sm text-muted">{failed ? "Preview unavailable" : "Loading…"}</div>;
  }

  return (
    <div ref={frameRef} aria-busy={loading} className="relative shrink-0" style={{ width, height }}>
      {fallback && (
        <img
          src={fallback}
          alt={photo.filename}
          draggable={false}
          onLoad={(e) => {
            const image = e.currentTarget;
            if (decoded?.photoId !== photo.id && image.naturalWidth > 0) {
              setDimensions({ w: image.naturalWidth, h: image.naturalHeight });
            }
          }}
          className="absolute inset-0 h-full w-full select-none object-contain"
        />
      )}
      {visiblePreview && (
        <img
          src={visiblePreview.url}
          alt={fallback ? "" : visiblePreview.filename}
          aria-hidden={fallback ? true : undefined}
          draggable={false}
          className={clsx(
            "absolute inset-0 h-full w-full select-none object-contain",
            origin && "photo-preview",
          )}
          style={{ opacity: opening ? 0 : 1 }}
        />
      )}
      {loading && visiblePreview && visiblePreview.photoId !== photo.id && (
        <div role="status" className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Loading…
        </div>
      )}
      {decodeFailedId === photo.id && !previewError && (
        <div role="status" className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Preview failed
        </div>
      )}
    </div>
  );
}
