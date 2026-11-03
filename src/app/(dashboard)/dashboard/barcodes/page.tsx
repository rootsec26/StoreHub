"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Plus, Package, X } from "lucide-react";
import jsbarcode from "jsbarcode";
import { useI18n } from "@/lib/i18n";
import { QRCodeSVG } from "qrcode.react";

interface Product {
  id: string;
  name: string;
  price: string;
  sku: string | null;
  imageUrl: string | null;
  description: string;
}

const DEFAULT_BARCODE_FORMAT = "CODE128";

// JsBarcode only registers format names in their exact/upper/lower-case forms.
// Mixed-case names such as "Code128" are not valid and throw at runtime.
const SUPPORTED_BARCODE_FORMATS = new Set([
  "CODE128",
  "CODE128A",
  "CODE128B",
  "CODE128C",
  "CODE39",
  "CODE93",
  "EAN13",
  "EAN8",
  "EAN5",
  "EAN2",
  "UPC",
  "ITF14",
  "ITF",
  "MSI",
  "MSI10",
  "MSI11",
  "MSI1010",
  "MSI1110",
  "PHARMACODE",
  "CODABAR",
]);

function resolveBarcodeFormat(format?: string): string {
  const normalized = (format ?? "").trim().toUpperCase();
  return SUPPORTED_BARCODE_FORMATS.has(normalized)
    ? normalized
    : DEFAULT_BARCODE_FORMAT;
}

/**
 * Renders a barcode onto a real <canvas> element using a validated format.
 * Guards against null/missing elements and unsupported render targets so
 * JsBarcode never receives a container <div> or an invalid format name.
 */
function renderBarcode(
  canvas: HTMLCanvasElement | null,
  value: string,
  height = 80,
  format: string = DEFAULT_BARCODE_FORMAT,
): void {
  if (!canvas || !canvas.isConnected || !value) return;

  const safeFormat = resolveBarcodeFormat(format);

  try {
    jsbarcode(canvas, value, { format: safeFormat, width: 2, height });
  } catch (error) {
    console.error("Barcode generation failed:", error);
  }
}

export default function BarcodesPage() {
  const { t, formatMoney } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [search, setSearch] = useState("");

  const detailBarcodeRef = useRef<HTMLCanvasElement | null>(null);
  const modalBarcodeRef = useRef<HTMLCanvasElement | null>(null);
  const detailQrRef = useRef<SVGSVGElement | null>(null);

  // Derived from the selection so no extra state/effect is needed.
  const qrValue = selectedProduct
    ? `${selectedProduct.name}\n${selectedProduct.price}\nSKU: ${selectedProduct.sku || selectedProduct.id}`
    : "";

  // Load products on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("Failed to load products");
        const data = await res.json();
        setProducts(data.products || []);
      } catch (error) {
        console.error("Failed to load products:", error);
      }
    };
    loadProducts();
  }, []);

  // Draw the detail barcode only after the canvas has mounted.
  useEffect(() => {
    if (!selectedProduct) return;
    renderBarcode(detailBarcodeRef.current, selectedProduct.sku || selectedProduct.id);
  }, [selectedProduct]);

  // Draw the modal barcode only after the modal/canvas has mounted.
  useEffect(() => {
    if (!selectedProduct || !showPrintModal) return;
    renderBarcode(modalBarcodeRef.current, selectedProduct.sku || selectedProduct.id);
  }, [selectedProduct, showPrintModal]);

  // Handle print
  const handlePrint = () => {
    if (!selectedProduct) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${t("barcodes.labelTitle")}</title>
          <style>
            @media print {
              @page { size: 4in 6in; margin: 0; }
              body { background: white; }
              .label { break-after: page; }
            }
            body { font-family: Arial, sans-serif; padding: 20px; }
            .container { max-width: 4in; margin: 0 auto; }
            .label-card {
              width: 100%;
              height: 6in;
              border: 1px solid #000;
              padding: 10px;
              margin-bottom: 10px;
              position: relative;
              background: white;
              break-after: page;
            }
            .product-name {
              font-size: 14pt;
              font-weight: bold;
              text-align: center;
              margin: 5px 0;
            }
            .product-price {
              font-size: 12pt;
              text-align: center;
              color: #666;
              margin: 5px 0;
            }
            .sku {
              font-size: 10pt;
              text-align: center;
              color: #888;
              margin: 5px 0;
            }
            .barcode-container { text-align: center; margin: 10px 0; }
            .qr-container { text-align: center; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="label-card">
              <div class="product-name">${selectedProduct.name}</div>
              <div class="product-price">${formatMoney(selectedProduct.price)}</div>
              <div class="sku">${t("barcodes.skuLabel")}: ${selectedProduct.sku || selectedProduct.id}</div>
              <div class="barcode-container">
                <canvas id="barcode" width="200" height="80"></canvas>
              </div>
              <div class="qr-container">
                <svg width="120" height="120">
                  <path d="M0,0h120v120H0z" fill="#ffffff"/>
                  <path d="M0,0h12v12H0z" fill="#000000"/>
                </svg>
              </div>
            </div>
          </body>
        </html>
      `);

    printWindow.document.close();

    // Draw the barcode once the print document has a real canvas in the DOM.
    const renderPrintBarcode = () => {
      const canvas = printWindow.document.getElementById("barcode");
      if (canvas?.tagName === "CANVAS") {
        renderBarcode(
          canvas as HTMLCanvasElement,
          selectedProduct.sku || selectedProduct.id,
          50,
        );
      }
      setShowPrintModal(false);
    };

    if (printWindow.document.readyState === "complete") {
      renderPrintBarcode();
    } else {
      printWindow.addEventListener("load", renderPrintBarcode, { once: true });
    }

    setShowPrintModal(true);
  };

  // Handle download as image (rasterise the already-rendered QR SVG so we do
  // not depend on an extra QR encoder package that is not installed).
  const handleDownload = () => {
    if (!selectedProduct) return;

    const svg = detailQrRef.current;
    if (!svg) return;

    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], {
      type: "image/svg+xml;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const image = new window.Image();

    image.onload = () => {
      const size = 400;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);

      const safeName = selectedProduct.name
        .replace(/[\\/:*?"<>|]+/g, "-")
        .trim() || selectedProduct.id;
      const link = document.createElement("a");
      link.download = `${safeName}-label.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    image.onerror = () => URL.revokeObjectURL(objectUrl);
    image.src = objectUrl;
  };

  // Filter products by search
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("barcodes.searchProducts")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => setShowPrintModal(true)}
          disabled={products.length === 0}
          title={products.length === 0 ? t("barcodes.noProductsFound") : undefined}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t("barcodes.addProductsFirst")}
        </button>
      </div>

      {/* Free plan product limit banner */}
      {products.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0" />
            {t("products.planUsage", { used: products.length, limit: 15 }) }
          </span>
          <Link
            href="/dashboard/billing"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            {t("products.upgrade")}
          </Link>
        </div>
      )}

      {/* Products Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.length === 0 ? (
          <div className="rounded-xl bg-white py-16 text-center shadow-sm">
            <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p className="text-lg font-medium text-slate-600">
              {t("barcodes.noProducts")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t("barcodes.noProductsFound")}
            </p>
          </div>
        ) : (
          <div>
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md cursor-pointer"
                onClick={() => setSelectedProduct(product)}
              >
                {product.imageUrl ? (
                  <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-t-xl bg-slate-100">
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={400}
                      height={160}
                      style={{ width: "auto", height: "auto" }}
                      className="max-h-full max-w-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div
                    className="flex h-40 items-center justify-center"
                    style={{ background: "var(---sidebar-item-hover-bg, #f3f4f6)", color: "var(--silver, #6b7280)" }}
                  >
                    <Package className="h-12 w-12 text-slate-300" />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-medium text-slate-900">{product.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-1">
                    {product.description || ""}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-indigo-600">
                      {formatMoney(product.price)}
                    </span>
                    <span
                      className={`text-xs font-medium ${product.sku ? "text-emerald-600" : "text-slate-500"} ${product.sku ? "" : "line-through"}`}
                    >
                      {product.sku || t("barcodes.skuLabel")}: {product.sku || product.id}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Product Details & Generator */}
      {selectedProduct && (
        <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              {t("barcodes.labelTitle2")}
            </h2>
            <p className="text-slate-500">{selectedProduct.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Barcode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("barcodes.code128")}
              </label>
              <div
                className="relative rounded-lg border border-slate-300 bg-white p-4"
                style={{ height: 90 }}
              >
                <canvas ref={detailBarcodeRef} className="mx-auto block max-w-full" />
              </div>
              <p className="mt-2 text-center text-slate-500 text-xs">
                {t("barcodes.skuLabel")}: {selectedProduct.sku || selectedProduct.id}
              </p>
            </div>

            {/* QR Code */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("barcodes.qrCode")}
              </label>
              <div className="relative rounded-lg border border-slate-300 bg-white p-4" style={{ height: 90, position: "relative" }}>
                <QRCodeSVG
                  ref={detailQrRef}
                  value={qrValue}
                  size={80}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  title={t("barcodes.scan")}
                />
              </div>
              <p className="mt-2 text-center text-slate-500 text-xs">
                {t("barcodes.scan")}
              </p>
            </div>
          </div>

          {/* Product Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-slate-500">{t("barcodes.skuLabel")}</p>
              <p className="font-medium">{selectedProduct.sku || selectedProduct.id}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">{t("barcodes.priceLabel")}</p>
              <p className="font-medium">{formatMoney(selectedProduct.price)}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("barcodes.printLabel")}
            </button>
            <button
              onClick={() => handleDownload()}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("barcodes.download")}
            </button>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPrintModal(false)}
        >
          <div className="relative max-w-2xl w-full max-h-screen bg-white rounded-xl p-6 shadow-xl transform scale-100 transition-transform">
            <button
              onClick={() => setShowPrintModal(false)}
              className="absolute top-4 right-4 rounded-lg p-1 text-slate-400 hover:text-slate-600"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="print-area" style={{ padding: "20px 0" }}>
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  {t("barcodes.labelTitle")}
                </h2>
                <p className="text-slate-500">
                  {t("barcodes.forStore", { store: selectedProduct.name })}
                </p>
                <p className="text-sm text-slate-500">
                  {t("barcodes.labelFor", { name: selectedProduct.name })}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-8">
                {/* Barcode */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 text-center mb-2">
                    {t("barcodes.code128")}
                  </label>
                  <div
                    className="relative rounded-lg border border-slate-300 bg-white p-4 mx-auto"
                    style={{ height: 90, width: "100%" }}
                  >
                    <canvas ref={modalBarcodeRef} className="mx-auto block max-w-full" />
                  </div>
                  <p className="mt-2 text-center text-slate-500 text-xs">
                    {t("barcodes.skuLabel")}: {selectedProduct.sku || selectedProduct.id}
                  </p>
                </div>

                {/* QR Code */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 text-center mb-2">
                    {t("barcodes.qrCode")}
                  </label>
                  <div
                    className="relative rounded-lg border border-slate-300 bg-white p-4 mx-auto"
                    style={{ height: 90, width: "100%" }}
                  >
                    <QRCodeSVG
                      value={qrValue}
                      size={80}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                      title={t("barcodes.scan")}
                    />
                  </div>
                  <p className="mt-2 text-center text-slate-500 text-xs">
                    {t("barcodes.scan")}
                  </p>
                </div>
              </div>

              {/* Product Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-slate-500">{t("barcodes.skuLabel")}</p>
                  <p className="font-medium">{selectedProduct.sku || selectedProduct.id}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("barcodes.priceLabel")}</p>
                  <p className="font-medium">{formatMoney(selectedProduct.price)}</p>
                </div>
              </div>

              {/* Print Button */}
              <div className="pt-6 border-t border-slate-200">
                <button
                  onClick = {() => {
                    window.print();
                    setShowPrintModal(false);
                  }}
                  className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-lg font-medium text-white hover:bg-indigo-700"
                >
                  {t("barcodes.printLabel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}