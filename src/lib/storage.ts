"use client";

import { getSupabaseAnonClient } from "@/lib/supabase/browser";
import { cleanUrlInput, safeParseUrl, urlToString } from "@/lib/url";

/** Public bucket created by `supabase/storage.sql`. */
export const STORAGE_BUCKET = "store-assets";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
] as const;

/** Which tenant asset is being replaced — drives the `{store_id}/*` folder. */
export type StoreAssetField = "logo" | "cover" | "product";

export type UploadErrorCode =
  | "not-configured"
  | "invalid-type"
  | "too-large"
  | "upload-failed";

export class StoreAssetError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StoreAssetError";
    this.code = code;
  }
}

export interface UploadedAsset {
  path: string;
  publicUrl: string;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

const FIELD_FOLDER: Record<StoreAssetField, { folder: "branding" | "products"; prefix: string }> = {
  logo: { folder: "branding", prefix: "logo" },
  cover: { folder: "branding", prefix: "cover" },
  product: { folder: "products", prefix: "product" },
};

function sanitizeFileName(fileName: string, mime: string): string {
  const extension = EXTENSION_BY_MIME[mime] ?? "bin";
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${base || "image"}-${Date.now().toString(36)}.${extension}`;
}

/**
 * Builds the tenant-scoped object path: `{store_id}/{branding|products}/<file>`.
 * `store_id` is always supplied by the caller's session, never by end users.
 */
export function buildStoreAssetPath(
  storeId: string,
  field: StoreAssetField,
  fileName: string,
  mime: string
): string {
  const { folder, prefix } = FIELD_FOLDER[field];
  return `${storeId}/${folder}/${prefix}-${sanitizeFileName(fileName, mime)}`;
}

/** True when the object path lives inside the given tenant's folder. */
export function isStoreAssetPath(path: string, storeId: string): boolean {
  return path.startsWith(`${storeId}/`);
}

export function getPublicAssetUrl(path: string): string {
  const parsed = safeParseUrl(
    cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
  if (!parsed) return path;
  return `${urlToString(parsed)}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

/**
 * Extracts the object path from a public Storage URL when it belongs to the
 * given tenant. Returns `null` for external/foreign URLs (never deleted).
 */
export function extractStoreAssetPath(url: string, storeId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  return isStoreAssetPath(path, storeId) ? path : null;
}

export function validateImageFile(file: File): UploadErrorCode | null {
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "invalid-type";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "too-large";
  }
  return null;
}

interface StorageFailureDetails {
  bucket: string;
  path: string;
  status?: number;
  statusCode?: string;
  errorCode?: string;
  message: string;
}

function describeStorageError(
  bucket: string,
  path: string,
  error: { message?: string; status?: number; statusCode?: string; error?: string }
): StorageFailureDetails {
  return {
    bucket,
    path,
    status: error.status,
    statusCode: error.statusCode,
    errorCode: error.error,
    message: error.message ?? "Unknown storage error",
  };
}

async function uploadOnce(
  storeId: string,
  field: StoreAssetField,
  file: File
): Promise<UploadedAsset> {
  const client = getSupabaseAnonClient();
  const path = buildStoreAssetPath(storeId, field, file.name, file.type);

  let error: { message?: string; status?: number; statusCode?: string; error?: string } | null = null;
  try {
    ({ error } = await client.storage.from(STORAGE_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "31536000",
    }));
  } catch (err) {
    // Network-level failure (offline, DNS, CORS) — surface a clear message.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[storage] upload threw", {
      storeId,
      field,
      fileName: file.name,
      bucket: STORAGE_BUCKET,
      path,
      message,
    });
    throw new StoreAssetError("upload-failed", `Network error during upload: ${message}`);
  }

  if (error) {
    const details = describeStorageError(STORAGE_BUCKET, path, error);
    console.error("[storage] upload failed", {
      storeId,
      field,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      ...details,
    });

    const suffix = [details.errorCode, details.message].filter(Boolean).join(": ");
    throw new StoreAssetError(
      "upload-failed",
      `Storage upload failed${details.status ? ` (HTTP ${details.status})` : ""}: ${suffix || "unknown error"}`
    );
  }

  return { path, publicUrl: getPublicAssetUrl(path) };
}

/**
 * Uploads an image into the tenant's folder of the public `store-assets`
 * bucket using the anon-key client. Storage RLS validates `{store_id}/*`
 * ownership on every write.
 */
export async function uploadStoreAsset(
  storeId: string,
  field: StoreAssetField,
  file: File
): Promise<UploadedAsset> {
  const validation = validateImageFile(file);
  if (validation) throw new StoreAssetError(validation);

  try {
    return await uploadOnce(storeId, field, file);
  } catch (error) {
    if (error instanceof StoreAssetError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[storage] unexpected upload error", { storeId, field, message });
    throw new StoreAssetError("upload-failed", message);
  }
}

/** Removes a tenant-owned object. Refuses anything outside `{store_id}/`. */
export async function removeStoreAsset(
  path: string,
  storeId: string
): Promise<void> {
  if (!path || !isStoreAssetPath(path, storeId)) return;

  try {
    const client = getSupabaseAnonClient();
    const { error } = await client.storage.from(STORAGE_BUCKET).remove([path]);
    if (error) {
      console.warn("[storage] asset removal failed", {
        bucket: STORAGE_BUCKET,
        path,
        status: error.status,
        message: error.message,
      });
    }
  } catch (err) {
    // Best-effort cleanup — orphaned files never break the product flow.
    console.warn("[storage] asset removal error", err);
  }
}
