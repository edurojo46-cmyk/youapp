const pg = require('pg');
require('dotenv').config();

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  try {
    const r1 = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_canonical_entities' ORDER BY ordinal_position;"
    );
    console.log('canonical_entities columns:', r1.rows.map(r => `${r.column_name} (${r.data_type})`));

    const r2 = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_products' ORDER BY ordinal_position;"
    );
    console.log('atlas_products columns:', r2.rows.map(r => `${r.column_name} (${r.data_type})`));

    const r3 = await pool.query(
      "SELECT count(*) FROM public.atlas_source_knowledge_map;"
    );
    console.log('atlas_source_knowledge_map count:', r3.rows[0].count);

    const r4 = await pool.query(
      "SELECT source_id, source_name, source_family, protocol, current_status, reliability_score FROM public.atlas_source_knowledge_map LIMIT 10;"
    );
    console.log('sample sources:', r4.rows);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
