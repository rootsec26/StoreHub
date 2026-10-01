const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const urlMatch = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
const directUrl = new URL(urlMatch[1]);
const ref = directUrl.hostname.startsWith('db.') ? directUrl.hostname.split('.')[1] : decodeURIComponent(directUrl.username).split('.')[1];
const password = decodeURIComponent(directUrl.password);
const pool = new Pool({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

pool.query("select column_name, data_type, column_default, is_nullable from information_schema.columns where table_name = 'stores' and column_name in ('custom_domain', 'custom_domain_verified') order by column_name")
  .then(r => { console.table(r.rows); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });