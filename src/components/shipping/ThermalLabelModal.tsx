"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Package, Printer, ScanLine, Store, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { canOptimizeImage } from "@/lib/images";
import { buildTrackingUrl, type ShippingLabelStore, type ShippingOrderRecord } from "@/lib/shipping";
import Code128Barcode from "@/components/shipping/Code128Barcode";

type PaperSize = "4x6" | "80mm";

interface ThermalLabelModalProps {
  /** Orders whose waybills should be rendered (tracking numbers assigned). */
  orders: ShippingOrderRecord[];
  store: ShippingLabelStore;
  onClose: () => void;
  /** Fired once the browser print dialog has been opened. */
  onPrinted?: (orderIds: string[]) => void;
}

/**
 * Printable 4x6 inch (or 80mm receipt) shipping waybills.
 *
 * On screen the labels render as paper-sized cards inside a modal; clicking
 * "Print" runs the native print dialog where scoped `@media print` rules hide
 * every piece of chrome and page-break between labels.
 */
export default function ThermalLabelModal({
  orders,
  store,
  onClose,
  onPrinted,
}: ThermalLabelModalProps) {
  const { t, formatMoney, formatDate } = useI18n();
  const [paperSize, setPaperSize] = useState<PaperSize>("4x6");

  const [container] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body
  );

  const origin = useMemo(
    () => (typeof window === "undefined" ? "" : window.location.origin),
    []
  );

  const printable = useMemo(
    () => orders.filter((order) => Boolean(order.trackingNumber)),
    [orders]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const pageSize = paperSize === "4x6" ? "4in 6in" : "80mm auto";

  const styles = `
.thermal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.55);
  padding: 1rem;
}
.thermal-card {
  max-width: 520px;
  margin: 1.5rem auto;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}
.thermal-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
  border-bottom: 1px solid #e2e8f0;
  padding: 0.75rem 1rem;
  background: #f8fafc;
}
.thermal-print-area {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}
.thermal-label {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.1in;
  padding: 0.16in;
  background: #ffffff;
  color: #000000;
  border: 1px dashed #94a3b8;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
  font-family: Arial, Helvetica, "Noto Sans Arabic", sans-serif;
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.thermal-labels--4x6 .thermal-label {
  width: 4in;
  height: 6in;
}
.thermal-labels--80mm .thermal-label {
  width: 80mm;
  min-height: 110mm;
  height: auto;
}
.thermal-store-row {
  display: flex;
  align-items: center;
  gap: 0.1in;
}
.thermal-store-name {
  font-size: 13pt;
  font-weight: 800;
  line-height: 1.1;
  text-transform: uppercase;
}
.thermal-store-meta {
  font-size: 7.5pt;
  line-height: 1.25;
  color: #000000;
}
.thermal-rule {
  border: 0;
  border-top: 2px solid #000000;
  margin: 0.02in 0;
}
.thermal-caption {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.thermal-recipient {
  font-size: 13pt;
  font-weight: 800;
  line-height: 1.2;
}
.thermal-address {
  font-size: 9.5pt;
  line-height: 1.3;
}
.thermal-phone {
  font-size: 10.5pt;
  font-weight: 700;
  direction: ltr;
  text-align: start;
}
.thermal-chip {
  display: inline-block;
  border: 1.5px solid #000000;
  padding: 0.02in 0.08in;
  font-size: 8pt;
  font-weight: 700;
}
.thermal-cod {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.1in;
  background: #000000;
  color: #ffffff;
  padding: 0.08in 0.12in;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.thermal-cod-title {
  font-size: 11pt;
  font-weight: 900;
  letter-spacing: 0.06em;
}
.thermal-cod-note {
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
}
.thermal-cod-amount {
  font-size: 17pt;
  font-weight: 900;
  white-space: nowrap;
}
.thermal-codes {
  display: flex;
  align-items: flex-start;
  gap: 0.1in;
}
.thermal-barcode {
  flex: 1;
  min-width: 0;
}
.thermal-barcode-value {
  font-family: "Courier New", Courier, monospace;
  font-size: 11pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  direction: ltr;
}
.thermal-barcode-meta {
  font-size: 7.5pt;
  line-height: 1.3;
}
.thermal-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.03in;
}
.thermal-qr-caption {
  font-size: 6.5pt;
  font-weight: 700;
  text-align: center;
  max-width: 0.95in;
}
.thermal-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  gap: 0.08in;
  border-top: 1px solid #000000;
  padding-top: 0.05in;
  font-size: 7.5pt;
  font-weight: 700;
}
@media print {
  @page {
    size: ${pageSize};
    margin: 0;
  }
  html,
  body {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body > *:not(.thermal-overlay) {
    display: none !important;
  }
  .thermal-overlay {
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
    background: transparent !important;
    padding: 0 !important;
    z-index: auto !important;
  }
  .thermal-card {
    max-width: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .thermal-toolbar {
    display: none !important;
  }
  .thermal-print-area {
    padding: 0 !important;
    gap: 0 !important;
    display: block !important;
  }
  .thermal-label {
    border: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
  }
  .thermal-label:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
`;

  function handlePrint() {
    try {
      window.print();
      onPrinted?.(printable.map((order) => order.id));
    } catch (error) {
      console.error("Label print failed:", error);
    }
  }

  if (!container) return null;

  return createPortal(
    <div
      className="thermal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("shipping.label.title")}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <div className="thermal-card">
        <div className="thermal-toolbar">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Printer className="h-4 w-4 text-indigo-600" />
              {t("shipping.label.title")}
            </p>
            <p className="text-xs text-slate-500">
              {t("shipping.label.subtitle", { count: printable.length })}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {(["4x6", "80mm"] as PaperSize[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPaperSize(size)}
                aria-pressed={paperSize === size}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  paperSize === size
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {size === "4x6" ? t("shipping.label.paper4x6") : t("shipping.label.paper80")}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePrint}
            disabled={printable.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {t("shipping.label.print")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`thermal-print-area ${
            paperSize === "4x6" ? "thermal-labels--4x6" : "thermal-labels--80mm"
          }`}
        >
          {printable.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {t("shipping.orders.noTracking")}
            </p>
          ) : (
            printable.map((order) => (
              <article key={order.id} className="thermal-label">
                {/* Store identity */}
                <div className="thermal-store-row">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-black">
                    {store.logoUrl ? (
                      <Image
                        src={store.logoUrl}
                        alt={store.name}
                        width={36}
                        height={36}
                        unoptimized={!canOptimizeImage(store.logoUrl)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="thermal-store-name">{store.name}</p>
                    <p className="thermal-store-meta">
                      {[store.phone, store.address].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <hr className="thermal-rule" />

                {/* Recipient */}
                <div>
                  <p className="thermal-caption">{t("shipping.label.to")}</p>
                  <p className="thermal-recipient">{order.customerName}</p>
                  {order.customerPhone && (
                    <p className="thermal-phone">{order.customerPhone}</p>
                  )}
                  <p className="thermal-address">
                    {order.customerAddress || "—"}
                  </p>
                  <p className="mt-1">
                    <span className="thermal-chip">
                      {t("shipping.label.zone")}:{" "}
                      {order.zoneName || t("shipping.label.noZone")}
                    </span>
                  </p>
                </div>

                {/* COD banner for the courier driver */}
                <div className="thermal-cod">
                  <div className="min-w-0">
                    <p className="thermal-cod-title">{t("shipping.label.cod")}</p>
                    <p className="thermal-cod-note">{t("shipping.label.codNote")}</p>
                  </div>
                  <p className="thermal-cod-amount" dir="ltr">
                    {t("shipping.label.codAmount", {
                      amount: formatMoney(order.totalAmount),
                    })}
                  </p>
                </div>

                {/* Barcode + QR */}
                <div className="thermal-codes">
                  <div className="thermal-barcode">
                    <Code128Barcode
                      value={order.trackingNumber ?? ""}
                      height={paperSize === "4x6" ? 56 : 48}
                    />
                    <p className="thermal-barcode-value">{order.trackingNumber}</p>
                    <p className="thermal-barcode-meta">
                      {t("shipping.label.order")}: {order.id.slice(0, 8).toUpperCase()}
                      {order.courierName
                        ? ` · ${t("shipping.label.courier")}: ${order.courierName}`
                        : ""}
                    </p>
                  </div>
                  {store.slug ? (
                    <div className="thermal-qr">
                      <QRCodeSVG
                        value={buildTrackingUrl(origin, store.slug, order.id)}
                        size={paperSize === "4x6" ? 86 : 76}
                        level="M"
                        marginSize={0}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        title={t("shipping.label.scan")}
                      />
                      <p className="thermal-qr-caption">
                        <ScanLine className="mx-auto mb-0.5 h-3 w-3" />
                        {t("shipping.label.scan")}
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* Footer */}
                <div className="thermal-footer">
                  <span>
                    <Package className="me-1 inline h-3 w-3 align-[-2px]" />
                    {t("shipping.orders.itemsCount", { count: order.itemsCount })}
                  </span>
                  <span dir="ltr">{formatDate(order.createdAt)}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>,
    container
  );
}
