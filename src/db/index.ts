import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type PoolConfig, type PoolOptions } from "pg";
import { cleanUrlInput, ensureScheme } from "@/lib/url";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Copy .env.example to .env.local and set DATABASE_URL to your Supabase Postgres connection string."
  );
}

const connectionString: string = databaseUrl;

const CONNECT_TIMEOUT_MS = 8000;
const PROBE_TIMEOUT_MS = 6000;
const FALLBACK_BATCH_SIZE = 12;

// Supabase publishes one pooler host per region. The direct host (`db.<ref>`)
// can be IPv6-only, which is unreachable from IPv4-only machines, so we fall
// back to the pooler hosts when the configured host cannot be dialled.
const POOLER_PREFIXES = ["aws-1", "aws-0"];
const POOLER_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "sa-east-1",
  "ca-central-1",
];

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function invalidDatabaseUrl(): Error {
  return new Error(
    "DATABASE_URL is not a valid PostgreSQL connection string. " +
      "Expected postgresql://user:password@host:port/database " +
      "(quotes around the value are not allowed)."
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDatabaseUrl(rawUrl: string): PoolConfig {
  const normalized = ensureScheme(cleanUrlInput(rawUrl), "postgresql");

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw invalidDatabaseUrl();
  }

  if (!url.hostname) throw invalidDatabaseUrl();

  const sslmode = url.searchParams.get("sslmode");
  const remote = !isLoopback(url.hostname);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: safeDecode(url.username),
    password: safeDecode(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
    ssl: remote && sslmode !== "disable" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  };
}

function projectRefOf(config: PoolConfig): string {
  const host = config.host ?? "";
  const user = config.user ?? "";

  if (host.startsWith("db.")) {
    return host.split(".")[1] ?? "";
  }
  if (user.includes(".")) {
    return user.split(".")[1] ?? "";
  }
  return "";
}

function buildFallbacks(primary: PoolConfig): PoolConfig[] {
  const ref = projectRefOf(primary);
  if (ref.length < 10) {
    return [];
  }

  const base = {
    password: primary.password,
    database: primary.database,
    ssl: primary.ssl,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  };
  const fallbacks: PoolConfig[] = [];

  for (const prefix of POOLER_PREFIXES) {
    for (const region of POOLER_REGIONS) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      fallbacks.push({ ...base, host, port: 6543, user: `postgres.${ref}` });
      fallbacks.push({ ...base, host, port: 5432, user: `postgres.${ref}` });
      fallbacks.push({ ...base, host, port: 5432, user: "postgres" });
    }
  }

  return fallbacks;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}

function hostLabel(config: PoolConfig): string {
  return `${config.host ?? "?"}:${config.port ?? 5432}`;
}

async function probe(config: PoolConfig): Promise<void> {
  const probePool = new Pool({
    ...config,
    max: 1,
    connectionTimeoutMillis: PROBE_TIMEOUT_MS,
  });
  probePool.on("error", () => undefined);

  try {
    await probePool.query("select 1");
  } finally {
    await probePool.end().catch(() => undefined);
  }
}

async function resolveConfig(
  primary: PoolConfig,
  fallbacks: PoolConfig[]
): Promise<PoolConfig> {
  let primaryError: unknown = null;

  try {
    await probe(primary);
    return primary;
  } catch (error) {
    primaryError = error;
    console.warn(
      `[db] ${hostLabel(primary)} unreachable (${describeError(error)}), ` +
        `trying ${fallbacks.length} fallback hosts`
    );
  }

  for (let i = 0; i < fallbacks.length; i += FALLBACK_BATCH_SIZE) {
    const batch = fallbacks.slice(i, i + FALLBACK_BATCH_SIZE);
    try {
      const winner = await Promise.any(
        batch.map(async (config) => {
          await probe(config);
          return config;
        })
      );
      console.warn(`[db] connected via fallback host ${hostLabel(winner)}`);
      return winner;
    } catch {
      // Every candidate in this batch failed; try the next one.
    }
  }

  throw new Error(
    `Could not connect to the database. Primary host ${hostLabel(primary)} failed ` +
      `(${describeError(primaryError)}). ` +
      `Verify DATABASE_URL, that the Supabase project is running, and that this ` +
      `machine can reach it.`
  );
}

class ResilientPool extends Pool {
  private resolution: Promise<PoolConfig> | null = null;
  private resolved = false;

  private ensureResolved(): Promise<PoolConfig> {
    if (!this.resolution) {
      this.resolution = (async () => {
        const { primary, fallbacks } = getConnectionConfig();
        return resolveConfig(primary, fallbacks);
      })()
        .then((config) => {
          Object.assign(this.options as PoolOptions, config);
          this.resolved = true;
          return config;
        })
        .catch((error: unknown) => {
          this.resolution = null;
          throw error;
        });
    }
    return this.resolution;
  }

  // pg-pool builds every connection from `options` at connect time, so pick a
  // reachable host once before handing over to the default connect logic.
  connect(
    cb?: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: unknown) => void
    ) => void
  ): any {
    if (this.resolved) {
      return super.connect(cb as never);
    }

    const pending = this.ensureResolved().then(() => super.connect(cb as never));

    if (cb) {
      pending.catch((error: unknown) => {
        cb(
          error instanceof Error ? error : new Error(describeError(error)),
          undefined,
          () => undefined
        );
      });
      return;
    }

    return pending;
  }
}

interface ConnectionConfig {
  primary: PoolConfig;
  fallbacks: PoolConfig[];
}

function resolveConnectionConfig(): ConnectionConfig {
  const primary = parseDatabaseUrl(connectionString);
  return { primary, fallbacks: buildFallbacks(primary) };
}

let connectionConfig: ConnectionConfig | null = null;

try {
  connectionConfig = resolveConnectionConfig();
} catch {
  connectionConfig = null;
}

function getConnectionConfig(): ConnectionConfig {
  if (!connectionConfig) connectionConfig = resolveConnectionConfig();
  return connectionConfig;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool: Pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  (() => {
    const created = new ResilientPool(connectionConfig?.primary ?? {});
    created.on("error", (error) => {
      console.error("[db] idle connection error:", describeError(error));
    });
    return created;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
