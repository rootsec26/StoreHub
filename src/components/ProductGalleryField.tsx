"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { compressImageForUpload } from "@/lib/imageCompress";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import {
  StoreAssetError,
  extractStoreAssetPath,
  removeStoreAsset,
  uploadStoreAsset,
  type UploadErrorCode,
} from "@/lib/storage";

const ERROR_KEY: Record<UploadErrorCode, TranslationKey> = {
  "not-configured": "upload.notConfigured",
  "invalid-type": "upload.invalidType",
  "too-large": "upload.tooLarge",
  "upload-failed": "upload.failed",
};

interface ProductGalleryFieldProps {
  storeId: string;
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
}

export default function ProductGalleryField({
  storeId,
  label,
  value,
  onChange,
}: ProductGalleryFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleError(err: unknown) {
    if (err instanceof StoreAssetError) {
      setError(err.message ? `${t(ERROR_KEY[err.code])} — ${err.message}` : t(ERROR_KEY[err.code]));
      return;
    }
    setError(t("upload.failed"));
  }

  function addUrl(next: string) {
    const trimmed = next.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= 12) return;
    onChange([...value, trimmed]);
    setUrl("");
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 12 - value.length)) {
        const prepared = await compressImageForUpload(file);
        const asset = await uploadStoreAsset(storeId, "product", prepared);
        onChange([...value, asset.publicUrl]);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeAt(index: number) {
    const urlToRemove = value[index];
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
    const path = extractStoreAssetPath(urlToRemove, storeId);
    if (path) await removeStoreAsset(path, storeId);
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {value.map((image, index) => (
          <div
            key={`${image}-${index}`}
            className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          >
            {isValidImageUrl(image) ? (
              <Image
                src={image}
                alt={`${label} ${index + 1}`}
                fill
                sizes="80px"
                unoptimized={!canOptimizeImage(image)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImagePlus className="h-5 w-5 text-slate-400" />
              </div>
            )}
            <button
              type="button"
              onClick={() => void removeAt(index)}
              className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
              aria-label={t("upload.remove")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || value.length >= 12}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          <span className="text-[10px] font-medium">{t("upload.choose")}</span>
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl(url);
            }
          }}
          placeholder={t("upload.pasteUrl")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => addUrl(url)}
          disabled={!url.trim() || value.length >= 12}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("common.add")}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
