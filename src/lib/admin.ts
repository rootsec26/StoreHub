import { headers } from "next/headers";

/**
 * The Super Admin panel and its APIs are only reachable from the local
 * machine (development / an operator running the server on their box).
 * The request middleware applies the same rule for `/admin` pages.
 */
export async function isLocalhostRequest(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  const headersList = await headers();
  const host = headersList.get("host") || "";

  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return true;
  }

  const xForwardedFor = headersList.get("x-forwarded-for") || "";
  const xRealIp = headersList.get("x-real-ip") || "";
  const clientIp = xForwardedFor.split(",")[0]?.trim() || xRealIp || "";

  return (
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp.startsWith("192.168.") ||
    clientIp.startsWith("10.") ||
    clientIp.startsWith("172.16.") ||
    clientIp.startsWith("172.17.") ||
    clientIp.startsWith("172.18.") ||
    clientIp.startsWith("172.19.") ||
    clientIp.startsWith("172.20.") ||
    clientIp.startsWith("172.21.") ||
    clientIp.startsWith("172.22.") ||
    clientIp.startsWith("172.23.") ||
    clientIp.startsWith("172.24.") ||
    clientIp.startsWith("172.25.") ||
    clientIp.startsWith("172.26.") ||
    clientIp.startsWith("172.27.") ||
    clientIp.startsWith("172.28.") ||
    clientIp.startsWith("172.29.") ||
    clientIp.startsWith("172.30.") ||
    clientIp.startsWith("172.31.")
  );
}
