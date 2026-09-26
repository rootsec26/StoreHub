/**
 * Applies supabase/migrations/*.sql to the project database.
 *
 * Tries the direct host from DATABASE_URL first, then falls back to Supabase's
 * IPv4 pooler hosts (useful on machines without IPv6, since `db.<ref>` is
 * AAAA-only). Usage: node scripts/apply-migration.js
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const root = path.resolve(__dirname, "..");
const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const urlMatch = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
if (!urlMatch) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const directUrl = new URL(urlMatch[1]);
// Works for both `db.<ref>.supabase.co` and `aws-X-<region>.pooler.supabase.com`
// (the pooler form keeps the ref in the `postgres.<ref>` username).
const ref = directUrl.hostname.startsWith("db.")
  ? directUrl.hostname.split(".")[1]
  : decodeURIComponent(directUrl.username).split(".")[1];
const password = decodeURIComponent(directUrl.password);
const migrationsDir = path.join(root, "supabase", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migration files found");
  process.exit(1);
}

// Splits on `;` at end of line, but ignores semicolons inside dollar-quoted
// bodies (DO $$ ... $$;) and inside single-quoted strings.
const statementsFor = (file) => {
  const text = fs
    .readFileSync(path.join(migrationsDir, file), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = [];
  let current = "";
  let dollarTag = null;
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === "$") {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        current += match[0];
        i += match[0].length - 1;
        continue;
      }
    }

    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString && char === ";" && /^\s*(?:\r?\n|$)/.test(text.slice(i + 1))) {
      statements.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements.filter((s) => s.length > 0);
};

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "ap-south-1",
  "sa-east-1", "ca-central-1",
];
const POOLER_PREFIXES = ["aws-1", "aws-0"];

function candidates() {
  const list = [{ label: directUrl.host, url: urlMatch[1] }];
  for (const prefix of POOLER_PREFIXES) {
    for (const region of REGIONS) {
      for (const port of [6543, 5432]) {
        list.push({
          label: `${prefix}-${region}.pooler.supabase.com:${port}`,
          url: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${prefix}-${region}.pooler.supabase.com:${port}/postgres`,
        });
      }
    }
  }
  return list;
}

async function tryCandidate(candidate) {
  const pool = new Pool({
    connectionString: candidate.url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    queryTimeout: 15000,
  });
  try {
    await pool.query("select 1");
    return pool;
  } catch (error) {
    await pool.end().catch(() => {});
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }
}

async function main() {
  let pool = null;
  let used = null;

  for (const candidate of candidates()) {
    try {
      pool = await tryCandidate(candidate);
      used = candidate.label;
      break;
    } catch (error) {
      const fatal = ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code);
      if (fatal) continue;
      console.log(`  ${candidate.label}: ${error.code || ""} ${error.message}`);
    }
  }

  if (!pool) {
    console.error("Could not connect to the database from this machine.");
    console.error("Run supabase/migrations/*.sql in the Supabase SQL editor instead.");
    process.exit(1);
  }

  console.log(`Connected via ${used}`);

  for (const file of files) {
    for (const statement of statementsFor(file)) {
      await pool.query(statement);
    }
    console.log(`Applied ${file}`);
  }

  const check = await pool.query(
    "select column_name, data_type, column_default from information_schema.columns where table_name = 'stores' and column_name in ('plan', 'accent_color') order by column_name"
  );
  console.table(check.rows);
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
