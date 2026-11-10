import { config as loadEnv } from "dotenv";
import type { CapacitorConfig } from "@capacitor/cli";
import { PRODUCTION_SITE_URL } from "./src/lib/url";

loadEnv({ path: [".env.local", ".env"] });

/**
 * StoreHub Android app configuration (Capacitor).
 *
 * The Next.js app uses SSR/API routes, so it cannot be fully statically
 * exported. The Android app therefore loads the deployed StoreHub site via
 * `server.url` at runtime.
 *
 * Build-time setup:
 *   1. Set CAPACITOR_SERVER_URL (or NEXT_PUBLIC_SITE_URL) to the production
 *      HTTPS origin, e.g. https://storehub.example.com
 *   2. npx cap sync android
 *   3. cd android && gradlew assembleDebug
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  PRODUCTION_SITE_URL;

const isHttp = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.storehub.app",
  appName: "StoreHub",
  webDir: "out",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: isHttp,
        },
      }
    : {}),
  android: {
    allowMixedContent: false,
  },
};

export default config;
