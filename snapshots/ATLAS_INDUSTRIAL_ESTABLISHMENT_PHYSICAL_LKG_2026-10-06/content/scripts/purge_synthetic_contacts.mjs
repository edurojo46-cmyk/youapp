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

console.log('Purging legacy synthetic and unverified contacts without provenance...');

const purgeRes = await client.query(`
  DELETE FROM public.atlas_contacts
  WHERE email_source_type IS NULL 
     OR email LIKE '%test.com%' 
     OR email LIKE '%example%'
     OR contact_id NOT IN (SELECT contact_id FROM public.atlas_contact_evidence);
`);

console.log(`Purged ${purgeRes.rowCount} synthetic / unverified contact rows.`);

const remainingRes = await client.query('SELECT count(*) FROM public.atlas_contacts;');
console.log(`Remaining canonical contacts in DB: ${remainingRes.rows[0].count}`);

await client.end();
