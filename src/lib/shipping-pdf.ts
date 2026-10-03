import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { code128Bars } from "@/lib/barcode";

/**
 * Air Waybill (AWB) PDF rendering for the multi-carrier routing engine.
 *
 * Every label is a 4×6 in thermal-friendly page built with pdf-lib, and
 * `mergePdfs` stitches a whole batch into one printable document.
 */

export interface AwbLabelData {
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  /** Brand color applied to the header band (hex, e.g. `#4f46e5`). */
  accent?: string | null;
  carrierLabel: string;
  /** Short reference printed for the merchant (order id). */
  orderReference: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  destination: string;
  codAmount: number;
  currency: string;
  itemsCount: number;
  /** Public tracking link, printed + encoded in the barcode. */
  trackingUrl: string;
}

const PAGE_WIDTH = 288; // 4in
const PAGE_HEIGHT = 432; // 6in
const MARGIN = 16;

/** Helvetica/WinAnsi cannot encode Arabic — fold unsupported glyphs. */
function safeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\r?\n/g, " ")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function fit(value: string, maxChars: number): string {
  const text = safeText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function parseHexColor(value: string | null | undefined) {
  const hex = (value || "").trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return rgb(0.29, 0.27, 0.85); // indigo-600
  const int = parseInt(match[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function drawLine(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color = rgb(0.06, 0.09, 0.16)
) {
  page.drawText(fit(text, 64), { x, y, size, font, color });
}

async function drawBarcode(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const { bars, modules } = code128Bars(value);
  if (modules === 0) return;
  const moduleWidth = width / modules;
  for (const bar of bars) {
    page.drawRectangle({
      x: x + bar.x * moduleWidth,
      y,
      width: Math.max(0.6, bar.width * moduleWidth),
      height,
      color: rgb(0, 0, 0),
    });
  }
}

/** Renders one 4×6 airway bill. */
export async function createAwbPdf(label: AwbLabelData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`AWB ${label.trackingNumber}`);
  doc.setProducer("StoreHub Shipping Engine");

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = parseHexColor(label.accent);

  const left = MARGIN;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let cursor = PAGE_HEIGHT - MARGIN;

  // ---- Header band -------------------------------------------------------
  const headerHeight = 64;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - headerHeight,
    width: PAGE_WIDTH,
    height: headerHeight,
    color: accent,
  });
  page.drawText(fit(label.storeName, 30), {
    x: left,
    y: PAGE_HEIGHT - 30,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("AIR WAYBILL", {
    x: left,
    y: PAGE_HEIGHT - 48,
    size: 9,
    font: regular,
    color: rgb(1, 1, 1),
  });
  page.drawText(fit(label.carrierLabel, 22), {
    x: PAGE_WIDTH - MARGIN - 90,
    y: PAGE_HEIGHT - 30,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  if (label.storePhone) {
    page.drawText(fit(label.storePhone, 22), {
      x: PAGE_WIDTH - MARGIN - 90,
      y: PAGE_HEIGHT - 46,
      size: 8,
      font: regular,
      color: rgb(1, 1, 1),
    });
  }

  cursor = PAGE_HEIGHT - headerHeight - 20;

  // ---- Shipper / consignee ---------------------------------------------
  drawLine(page, bold, "FROM", left, cursor, 8, rgb(0.39, 0.45, 0.55));
  cursor -= 14;
  drawLine(page, bold, label.storeName, left, cursor, 11);
  cursor -= 13;
  drawLine(page, regular, label.storeAddress || "", left, cursor, 8, rgb(0.39, 0.45, 0.55));
  cursor -= 20;

  drawLine(page, bold, "SHIP TO", left, cursor, 8, rgb(0.39, 0.45, 0.55));
  cursor -= 14;
  drawLine(page, bold, label.recipientName, left, cursor, 12);
  cursor -= 14;
  drawLine(page, regular, label.recipientPhone, left, cursor, 9);
  cursor -= 13;
  drawLine(page, regular, label.recipientAddress, left, cursor, 9);
  cursor -= 13;
  drawLine(page, bold, label.destination, left, cursor, 9, accent);

  cursor -= 18;
  page.drawLine({
    start: { x: left, y: cursor },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor },
    thickness: 0.75,
    color: rgb(0.8, 0.82, 0.86),
  });
  cursor -= 16;

  // ---- Order meta --------------------------------------------------------
  drawLine(page, bold, `ORDER ${fit(label.orderReference, 24)}`, left, cursor, 9);
  drawLine(
    page,
    regular,
    `${label.itemsCount} item${label.itemsCount === 1 ? "" : "s"}`,
    PAGE_WIDTH - MARGIN - 70,
    cursor,
    9,
    rgb(0.39, 0.45, 0.55)
  );
  cursor -= 26;

  // ---- COD box -----------------------------------------------------------
  if (label.codAmount > 0) {
    const boxHeight = 44;
    page.drawRectangle({
      x: left,
      y: cursor - boxHeight + 12,
      width: contentWidth,
      height: boxHeight,
      borderColor: accent,
      borderWidth: 1.5,
      color: rgb(0.97, 0.97, 1),
    });
    page.drawText("CASH ON DELIVERY", {
      x: left + 10,
      y: cursor - 6,
      size: 9,
      font: bold,
      color: accent,
    });
    const amount = `${label.currency} ${label.codAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    page.drawText(fit(`COLLECT ${amount}`, 40), {
      x: left + 10,
      y: cursor - 26,
      size: 14,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    cursor -= boxHeight + 6;
  }

  // ---- Barcode -----------------------------------------------------------
  const barcodeHeight = 46;
  cursor -= barcodeHeight;
  await drawBarcode(page, label.trackingNumber, left, cursor, contentWidth, barcodeHeight);
  cursor -= 14;
  page.drawText(fit(label.trackingNumber, 32), {
    x: left + (contentWidth - regular.widthOfTextAtSize(fit(label.trackingNumber, 32), 12)) / 2,
    y: cursor,
    size: 12,
    font: bold,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursor -= 16;
  page.drawText(fit(label.trackingUrl, 54), {
    x: left,
    y: cursor,
    size: 7,
    font: regular,
    color: rgb(0.39, 0.45, 0.55),
  });
  cursor -= 14;
  page.drawText("Scan the barcode or open the link to track this shipment live.", {
    x: left,
    y: cursor,
    size: 7,
    font: regular,
    color: rgb(0.55, 0.58, 0.64),
  });

  return doc.save();
}

/** Stitches label PDFs into one printable bulk document (page per order). */
export async function mergePdfs(documents: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  merged.setProducer("StoreHub Shipping Engine");
  merged.setTitle("Bulk Airway Bills");

  for (const bytes of documents) {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return merged.save();
}
