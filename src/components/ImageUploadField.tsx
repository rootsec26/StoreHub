"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { compressImageForUpload } from "@/lib/imageCompress";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import {
  StoreAssetError,
  extractStoreAssetPath,
  removeStoreAsset,
  uploadStoreAsset,
  type StoreAssetField,
  type UploadErrorCode,
} from "@/lib/storage";

const ERROR_KEY: Record<UploadErrorCode, TranslationKey> = {
  "not-configured": "upload.notConfigured",
  "invalid-type": "upload.invalidType",
  "too-large": "upload.tooLarge",
  "upload-failed": "upload.failed",
};

interface ImageUploadFieldProps {
  storeId: string;
  field: StoreAssetField;
  label: string;
  value: string;
  onChange: (url: string) => void;
}

export default function ImageUploadField({
  storeId,
  field,
  label,
  value,
  onChange,
}: ImageUploadFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = uploading || processing;

  function handleError(err: unknown) {
    if (err instanceof StoreAssetError) {
      setError(t(ERROR_KEY[err.code]));
      return;
    }
    setError(t("upload.failed"));
  }

  async function handleFile(file: File) {
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setLocalPreview(previewUrl);
    try {
      setProcessing(true);
      const prepared = await compressImageForUpload(file);
      setProcessing(false);
      setUploading(true);

      const previous = value;
      const asset = await uploadStoreAsset(storeId, field, prepared);
      onChange(asset.publicUrl);

      const oldPath = extractStoreAssetPath(previous, storeId);
      if (oldPath && oldPath !== asset.path) {
        await removeStoreAsset(oldPath, storeId);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setProcessing(false);
      setUploading(false);
      setLocalPreview(null);
      URL.revokeObjectURL(previewUrl);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    const path = extractStoreAssetPath(value, storeId);
    onChange("");
    if (path) await removeStoreAsset(path, storeId);
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <div className="flex items-start gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {localPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={localPreview}
                alt={label}
                className="h-full w-full object-cover"
              />
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </>
          ) : isValidImageUrl(value) ? (
            <Image
              src={value}
              alt={label}
              width={80}
              height={80}
              unoptimized={!canOptimizeImage(value)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImagePlus className="h-6 w-6 text-slate-400" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              {processing
                ? t("upload.processing")
                : uploading
                  ? t("upload.inProgress")
                  : t("upload.choose")}
            </button>

            {value && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                {t("upload.remove")}
              </button>
            )}
          </div>

          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("upload.pasteUrl")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
