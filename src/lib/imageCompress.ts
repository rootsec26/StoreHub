"use client";

/**
 * Client-side image compression for uploads. Raster images are resized to a
 * max dimension and re-encoded (WebP preferred, JPEG fallback) via canvas so
 * Supabase Storage only ever receives small files. SVG/GIF and images that
 * would not shrink are passed through untouched.
 */

const MAX_DIMENSION = 800;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

/** Types we must never rasterize (vector / animated). */
const SKIP_MIME_TYPES = new Set(["image/svg+xml", "image/gif"]);

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function withExtension(name: string, mime: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  const ext = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "png";
  return `${base}.${ext}`;
}

/**
 * Returns a compressed `File` when possible, otherwise the original file.
 * Never throws — decoding/encoding failures fall back to the source file.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (SKIP_MIME_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, w, h);

    let blob = await encode(canvas, "image/webp", WEBP_QUALITY);
    if (blob && blob.type !== "image/webp") blob = null;

    // JPEG fallback for browsers without WebP encoding — flatten alpha first.
    if (!blob) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const jpeg = await encode(canvas, "image/jpeg", JPEG_QUALITY);
      if (jpeg && jpeg.type === "image/jpeg") blob = jpeg;
    }

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], withExtension(file.name, blob.type), {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
