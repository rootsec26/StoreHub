/**
 * Supabase cleanup utility — finds and (optionally) deletes orphaned files
 * in the `store-assets` Storage bucket, plus optional DB row counts.
 *
 * An object is "orphaned" when its path is not referenced by any of:
 *   stores.logo_url, stores.cover_url,
 *   products.image_url, products.image_gallery[]
 *
 * Usage:
 *   node scripts/cleanup-supabase.js              # dry-run report (safe)
 *   node scripts/cleanup-supabase.js --apply      # delete orphans (needs service key)
 *   node scripts/cleanup-supabase.js --db-counts  # also print table row counts
 *
 * Deletion requires SUPABASE_SERVICE_ROLE_KEY in .env.local (or env) because
 * Storage RLS only lets each tenant delete its own objects. Without it the
 * script still produces the full orphan report.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const envGet = (key) => {
  const m = env.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"));
  return m ? m[1].trim() : process.env[key] || "";
};

const DATABASE_URL = envGet("DATABASE_URL");
const SUPABASE_URL = envGet("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = envGet("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_KEY = envGet("SUPABASE_SERVICE_ROLE_KEY");
const BUCKET = "store-assets";

const APPLY = process.argv.includes("--apply");
const DB_COUNTS = process.argv.includes("--db-counts");

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const storageKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
if (APPLY && !SUPABASE_SERVICE_KEY) {
  console.error(
    "--apply requires SUPABASE_SERVICE_ROLE_KEY in .env.local.\n" +
      "Storage RLS restricts deletes to each object's owner, so the anon key cannot remove orphans.\n" +
      "Running in report-only mode instead."
  );
}
const actuallyApply = APPLY && Boolean(SUPABASE_SERVICE_KEY);
const supabase = createClient(SUPABASE_URL, storageKey, {
  auth: { persistSession: false },
});

const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

/** Extract the object path from a stored URL (handles full URLs and raw paths). */
function urlToObjectPath(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const idx = v.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null; // external URL — never ours, never touched
  const p = decodeURIComponent(v.slice(idx + PUBLIC_MARKER.length).split("?")[0]);
  return p || null;
}

/** Recursively list every file path in the bucket. */
async function listAllObjects(prefix = "") {
  const files = [];
  const folders = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Storage list failed at "${prefix}": ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have a null id in the Storage API.
      if (entry.id === null) folders.push(entryPath);
      else files.push({ path: entryPath, size: entry.metadata?.size ?? null });
    }
    if (data.length < limit) break;
    offset += limit;
  }
  for (const folder of folders) {
    files.push(...(await listAllObjects(folder)));
  }
  return files;
}

async function referencedPaths(pool) {
  const refs = new Set();
  const add = (v) => {
    const p = urlToObjectPath(v);
    if (p) refs.add(p);
  };

  const stores = await pool.query("SELECT logo_url, cover_url FROM stores");
  for (const r of stores.rows) {
    add(r.logo_url);
    add(r.cover_url);
  }

  const products = await pool.query("SELECT image_url, image_gallery FROM products");
  for (const r of products.rows) {
    add(r.image_url);
    const gallery = Array.isArray(r.image_gallery) ? r.image_gallery : [];
    for (const g of gallery) add(g);
  }
  return refs;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const [objects, refs] = await Promise.all([
      listAllObjects(),
      referencedPaths(pool),
    ]);

    const orphans = objects.filter((o) => !refs.has(o.path));
    const totalBytes = orphans.reduce((s, o) => s + (o.size || 0), 0);

    console.log(`\n=== store-assets cleanup report ===`);
    console.log(`Bucket objects : ${objects.length}`);
    console.log(`Referenced     : ${refs.size}`);
    console.log(`Orphans        : ${orphans.length} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Mode           : ${actuallyApply ? "APPLY (deleting)" : "dry-run"}\n`);

    for (const o of orphans) {
      const size = o.size != null ? `${(o.size / 1024).toFixed(1)} KB` : "?";
      console.log(`  ${size.padStart(10)}  ${o.path}`);
    }

    if (actuallyApply && orphans.length > 0) {
      const paths = orphans.map((o) => o.path);
      let deleted = 0;
      for (let i = 0; i < paths.length; i += 1000) {
        const chunk = paths.slice(i, i + 1000);
        const { error } = await supabase.storage.from(BUCKET).remove(chunk);
        if (error) {
          console.error(`\nDelete chunk failed at offset ${i}: ${error.message}`);
          process.exitCode = 1;
          break;
        }
        deleted += chunk.length;
      }
      console.log(`\nDeleted ${deleted} orphaned object(s).`);
    } else if (orphans.length > 0) {
      console.log(
        `\nRe-run with --apply (and SUPABASE_SERVICE_ROLE_KEY set) to delete these files.`
      );
    } else {
      console.log("\nNo orphaned files found — storage is clean.");
    }

    if (DB_COUNTS) {
      const tables = [
        "users", "stores", "products", "categories", "orders", "order_items",
        "order_status_logs", "coupons", "promotions", "price_alerts",
        "abandoned_carts", "notifications", "notification_recipients",
        "notification_events", "customers", "loyalty_transactions",
        "warehouses", "warehouse_stock", "stock_transfers", "analytics_events",
      ];
      console.log("\n=== table row counts ===");
      for (const t of tables) {
        try {
          const { rows } = await pool.query(`SELECT count(*)::int AS c FROM ${t}`);
          console.log(`  ${t.padEnd(28)} ${rows[0].c}`);
        } catch {
          console.log(`  ${t.padEnd(28)} (missing)`);
        }
      }
      console.log(
        "\nTo purge test data see supabase/cleanup-test-data.sql (review before running)."
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
