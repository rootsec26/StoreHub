import type { NextConfig } from "next";

function supabaseHost(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (!raw) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+\-.]*:\/\//i.test(raw)
      ? raw
      : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const extraImageHosts = (process.env.NEXT_PUBLIC_IMAGE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const host = supabaseHost();

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      ...(host
        ? [
            {
              protocol: "https" as const,
              hostname: host,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      ...extraImageHosts.map((extra) => ({
        protocol: "https" as const,
        hostname: extra,
      })),
      { protocol: "http", hostname: "localhost", port: "3000" },
    ],
  },
};

export default nextConfig;
