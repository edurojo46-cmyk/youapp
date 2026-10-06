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

console.log('Preserving audit trail: updating constraint and marking seed contacts as TEST_NON_PRODUCTION...');

await client.query(`
  ALTER TABLE public.atlas_contacts DROP CONSTRAINT IF EXISTS atlas_contacts_status_check;
  ALTER TABLE public.atlas_contacts ADD CONSTRAINT atlas_contacts_status_check 
    CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'UNVERIFIED'::text, 'SUPPRESSED'::text, 'INVALID'::text, 'TEST_NON_PRODUCTION'::text])));
`);

const updRes = await client.query(`
  UPDATE public.atlas_contacts
  SET status = 'TEST_NON_PRODUCTION';
`);

console.log(`Updated ${updRes.rowCount} contacts to TEST_NON_PRODUCTION.`);

const checkRes = await client.query(`
  SELECT status, count(*) 
  FROM public.atlas_contacts 
  GROUP BY status;
`);
console.log('Current status distribution in atlas_contacts:', checkRes.rows);

await client.end();
