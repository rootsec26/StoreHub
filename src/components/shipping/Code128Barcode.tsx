"use client";

import { code128Bars } from "@/lib/barcode";

interface Code128BarcodeProps {
  /** Encoded value — normally the order tracking number. */
  value: string;
  height?: number;
  /** Quiet zone width in modules on each side (Code 128 minimum is 10). */
  quietModules?: number;
  className?: string;
}

/**
 * High-contrast Code 128 barcode rendered as crisp SVG bars so it survives
 * thermal printing at 203/300 dpi.
 */
export default function Code128Barcode({
  value,
  height = 54,
  quietModules = 10,
  className = "",
}: Code128BarcodeProps) {
  const { bars, modules } = code128Bars(value);

  if (modules === 0) return null;

  const total = modules + quietModules * 2;

  return (
    <svg
      viewBox={`0 0 ${total} 60`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label={`Barcode ${value}`}
      className={className}
      shapeRendering="crispEdges"
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x + quietModules}
          y={0}
          width={bar.width}
          height={60}
          fill="#000000"
        />
      ))}
    </svg>
  );
}
