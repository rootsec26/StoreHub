"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Banknote, CreditCard, Printer, ReceiptText, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import Code128Barcode from "@/components/shipping/Code128Barcode";

export interface PosReceiptItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** Payload returned by POST /api/pos — everything the paper needs. */
export interface PosReceipt {
  orderId: string;
  receiptNumber: string;
  store: {
    name: string;
    logoUrl: string;
    phone: string;
    address: string;
  };
  cashierName: string;
  createdAt: string;
  items: PosReceiptItem[];
  subtotal: number;
  discountAmount: number;
  discountType: "percent" | "fixed";
  discountValue: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: "cash" | "card";
  channel: string;
  paymentStatus: string;
}

interface POSReceiptModalProps {
  sale: PosReceipt;
  onClose: () => void;
}

/**
 * 80mm thermal POS receipt.
 *
 * On screen the paper renders inside a modal with a light stage backdrop;
 * "Print" opens the native dialog where scoped `@page 80mm` rules strip every
 * piece of chrome so only the receipt reaches the printer.
 */
export default function POSReceiptModal({ sale, onClose }: POSReceiptModalProps) {
  const { t, formatMoney, formatDateTime } = useI18n();

  const [container] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handlePrint() {
    try {
      window.print();
    } catch (error) {
      console.error("Receipt print failed:", error);
    }
  }

  const styles = `
.posr-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.55);
  padding: 1rem;
}
.posr-card {
  max-width: 460px;
  margin: 1.5rem auto;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}
.posr-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
  border-bottom: 1px solid #e2e8f0;
  padding: 0.75rem 1rem;
  background: #f8fafc;
}
.posr-stage {
  display: flex;
  justify-content: center;
  padding: 1.25rem;
  background: #e2e8f0;
}
.posr-paper {
  box-sizing: border-box;
  width: 80mm;
  padding: 4mm 3.5mm;
  background: #ffffff;
  color: #000000;
  border: 1px dashed #94a3b8;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
  font-family: Arial, Helvetica, "Noto Sans Arabic", sans-serif;
  font-size: 10pt;
  line-height: 1.35;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.posr-head {
  display: flex;
  align-items: center;
  gap: 0.08in;
}
.posr-logo {
  display: flex;
  height: 0.42in;
  width: 0.42in;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #000000;
}
.posr-store-name {
  font-size: 13pt;
  font-weight: 800;
  line-height: 1.1;
  text-transform: uppercase;
}
.posr-store-meta {
  font-size: 7.5pt;
  line-height: 1.25;
}
.posr-title {
  margin-top: 0.05in;
  text-align: center;
  font-size: 10pt;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.posr-rule {
  border: 0;
  border-top: 1px dashed #000000;
  margin: 0.06in 0;
}
.posr-rule--solid {
  border-top: 1.5px solid #000000;
}
.posr-meta-row,
.posr-total-row {
  display: flex;
  justify-content: space-between;
  gap: 0.1in;
  font-size: 8.5pt;
}
.posr-meta-value {
  font-family: "Courier New", Courier, monospace;
  font-weight: 700;
  direction: ltr;
  text-align: end;
  word-break: break-all;
}
.posr-col-head {
  display: flex;
  justify-content: space-between;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.posr-item {
  margin-top: 0.04in;
  font-size: 9pt;
}
.posr-item-name {
  font-weight: 700;
}
.posr-item-line {
  display: flex;
  justify-content: space-between;
  gap: 0.1in;
  font-size: 8.5pt;
}
.posr-item-qty {
  font-family: "Courier New", Courier, monospace;
  direction: ltr;
}
.posr-total-row--strong {
  margin-top: 0.04in;
  font-size: 13pt;
  font-weight: 900;
}
.posr-payment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.08in;
  margin-top: 0.06in;
  border: 1.5px solid #000000;
  padding: 0.04in 0.08in;
  font-size: 9pt;
  font-weight: 700;
}
.posr-paid {
  background: #000000;
  color: #ffffff;
  padding: 0.01in 0.06in;
  font-size: 8pt;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.posr-barcode {
  margin-top: 0.08in;
}
.posr-barcode-value {
  font-family: "Courier New", Courier, monospace;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-align: center;
  direction: ltr;
}
.posr-note {
  margin-top: 0.04in;
  text-align: center;
  font-size: 7.5pt;
}
.posr-foot {
  margin-top: 0.06in;
  text-align: center;
  font-size: 8.5pt;
  font-weight: 700;
}
@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }
  html,
  body {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body > *:not(.posr-overlay) {
    display: none !important;
  }
  .posr-overlay {
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
    background: transparent !important;
    padding: 0 !important;
    z-index: auto !important;
  }
  .posr-card {
    max-width: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .posr-toolbar {
    display: none !important;
  }
  .posr-stage {
    display: block !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .posr-paper {
    width: 80mm !important;
    margin: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

  if (!container) return null;

  const methodLabel =
    sale.paymentMethod === "card"
      ? t("pos.receipt.method.card")
      : t("pos.receipt.method.cash");
  const MethodIcon = sale.paymentMethod === "card" ? CreditCard : Banknote;

  return createPortal(
    <div
      className="posr-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("pos.receipt.title")}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <div className="posr-card">
        <div className="posr-toolbar">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <ReceiptText className="h-4 w-4 text-indigo-600" />
              {t("pos.receipt.title")}
            </p>
            <p className="text-xs text-slate-500">{t("pos.receipt.subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            {t("pos.receipt.print")}
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

        <div className="posr-stage">
          <article className="posr-paper">
            {/* Store header */}
            <div className="posr-head">
              <div className="posr-logo">
                {isValidImageUrl(sale.store.logoUrl) ? (
                  <Image
                    src={sale.store.logoUrl}
                    alt={sale.store.name}
                    width={40}
                    height={40}
                    unoptimized={!canOptimizeImage(sale.store.logoUrl)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ReceiptText className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="posr-store-name">{sale.store.name}</p>
                {sale.store.address && (
                  <p className="posr-store-meta">{sale.store.address}</p>
                )}
                {sale.store.phone && (
                  <p className="posr-store-meta" dir="ltr">
                    {sale.store.phone}
                  </p>
                )}
              </div>
            </div>

            <p className="posr-title">{t("pos.receipt.title")}</p>

            <hr className="posr-rule posr-rule--solid" />

            {/* Sale meta */}
            <div className="posr-meta-row">
              <span>{t("pos.receipt.number")}</span>
              <span className="posr-meta-value">{sale.receiptNumber}</span>
            </div>
            <div className="posr-meta-row">
              <span>{t("table.date")}</span>
              <span className="posr-meta-value">
                {formatDateTime(sale.createdAt)}
              </span>
            </div>
            <div className="posr-meta-row">
              <span>{t("pos.receipt.cashier")}</span>
              <span className="posr-meta-value">{sale.cashierName || "—"}</span>
            </div>

            <hr className="posr-rule" />

            {/* Items */}
            <div className="posr-col-head">
              <span>{t("table.name")}</span>
              <span>{t("table.amount")}</span>
            </div>
            {sale.items.map((item) => (
              <div key={item.productId} className="posr-item">
                <p className="posr-item-name">{item.name}</p>
                <div className="posr-item-line">
                  <span className="posr-item-qty">
                    {item.quantity} x {formatMoney(item.unitPrice)}
                  </span>
                  <span className="posr-item-qty">
                    {formatMoney(item.lineTotal)}
                  </span>
                </div>
              </div>
            ))}

            <hr className="posr-rule" />

            {/* Totals */}
            <div className="posr-total-row">
              <span>{t("pos.subtotal")}</span>
              <span>{formatMoney(sale.subtotal)}</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="posr-total-row">
                <span>{t("pos.discount.label")}</span>
                <span>- {formatMoney(sale.discountAmount)}</span>
              </div>
            )}
            <div className="posr-total-row">
              <span>{t("pos.vat", { rate: sale.taxRate })}</span>
              <span>{formatMoney(sale.taxAmount)}</span>
            </div>
            <hr className="posr-rule posr-rule--solid" />
            <div className="posr-total-row posr-total-row--strong">
              <span>{t("pos.total")}</span>
              <span>{formatMoney(sale.total)}</span>
            </div>

            {/* Payment */}
            <div className="posr-payment">
              <span className="flex items-center gap-1.5">
                <MethodIcon className="h-3.5 w-3.5" />
                {t("pos.receipt.payment")}: {methodLabel}
              </span>
              <span className="posr-paid">{t("pos.receipt.paid")}</span>
            </div>

            {/* Return-handling barcode */}
            <div className="posr-barcode">
              <Code128Barcode value={sale.orderId} height={44} />
              <p className="posr-barcode-value">{sale.orderId}</p>
            </div>
            <p className="posr-note">{t("pos.receipt.returns")}</p>

            <hr className="posr-rule" />
            <p className="posr-foot">{t("pos.receipt.thanks")}</p>
          </article>
        </div>
      </div>
    </div>,
    container
  );
}
