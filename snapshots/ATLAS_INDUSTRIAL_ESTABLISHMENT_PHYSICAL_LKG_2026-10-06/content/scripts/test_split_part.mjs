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

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_apec_domain 
  ON public.atlas_public_email_contacts_1m (split_part(email_normalized, '@', 2));
`);
console.log('Domain index ensured.');

const t0 = Date.now();
const q = await client.query(`
  SELECT email_normalized, contact_type, associated_entity, source_id 
  FROM public.atlas_public_email_contacts_1m 
  WHERE split_part(email_normalized, '@', 2) = ANY(ARRAY['dulcor.com.ar', 'drcormillot.com', 'vanoli.com.ar']);
`);
console.log(`Query took ${Date.now() - t0}ms. Matches:`, q.rows);

await client.end();
