import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
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

const client = new pg.Client({ ...parseDbUrl() });
await client.connect();

console.log('--- Inspecting database tables related to contacts and emails ---');

const tablesRes = await client.query(`
  SELECT table_schema, table_name 
  FROM information_schema.tables 
  WHERE table_name LIKE '%contact%' OR table_name LIKE '%email%' OR table_name LIKE '%authority%'
  ORDER BY table_name;
`);
console.log('Tables found:', tablesRes.rows);

for (const row of tablesRes.rows) {
  try {
    const c = await client.query(`SELECT count(*) FROM "${row.table_schema}"."${row.table_name}";`);
    console.log(`- ${row.table_name}: ${c.rows[0].count} rows`);
  } catch (e) {
    console.log(`- ${row.table_name}: error reading (${e.message})`);
  }
}

// Check if any of the 15 emails exist in atlas_global_email_authority
try {
  const checkRes = await client.query(`
    SELECT email_normalized, source_origin, authority_generation, is_preexisting 
    FROM public.atlas_global_email_authority
    WHERE email_normalized IN (
      'contacto@cormillot.com',
      'consultas@cormillot.com',
      'institucional@fundacionfavaloro.org',
      'info@fundacionfavaloro.org',
      'ventas@dulcor.com.ar',
      'contacto@dulcor.com.ar',
      'atencionalcliente@dulcor.com.ar',
      'info@vanoli.com.ar'
    );
  `);
  console.log('\nMatching in atlas_global_email_authority:', checkRes.rows);
} catch (e) {
  console.log('Error querying atlas_global_email_authority:', e.message);
}

await client.end();
