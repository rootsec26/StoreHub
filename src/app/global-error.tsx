"use client";

import { useEffect, type CSSProperties } from "react";
import Link from "next/link";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const pageStyle: CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "16px",
  padding: "24px",
  textAlign: "center",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  background: "#f8fafc",
  color: "#0f172a",
};

const buttonStyle: CSSProperties = {
  padding: "10px 24px",
  borderRadius: "8px",
  border: "none",
  background: "#4f46e5",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const linkStyle: CSSProperties = {
  padding: "10px 24px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={pageStyle}>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#d97706",
          }}
        >
          500
        </p>
        <h1 style={{ margin: 0, fontSize: "24px" }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: "420px", color: "#475569" }}>
          An unexpected error occurred while loading this page. Please try again.
        </p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" onClick={reset} style={buttonStyle}>
            Try again
          </button>
          <Link href="/" style={linkStyle}>
            Go Home
          </Link>
        </div>
      </body>
    </html>
  );
}
