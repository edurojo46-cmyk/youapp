import 'dotenv/config';
import pg from 'pg';

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

const client = new pg.Client({ ...parseDbUrl() });
await client.connect();

const countRes = await client.query('SELECT count(*) FROM public.atlas_contacts;');
console.log('atlas_contacts total rows:', countRes.rows[0].count);

const sampleRes = await client.query(`
  SELECT contact_id, entity_id, full_name, email, company, email_source_url 
  FROM public.atlas_contacts 
  WHERE email IS NOT NULL 
  LIMIT 5;
`);
console.log('sample atlas_contacts:', sampleRes.rows);

// Let's check what Contact Search services or classes exist in the repo
await client.end();
