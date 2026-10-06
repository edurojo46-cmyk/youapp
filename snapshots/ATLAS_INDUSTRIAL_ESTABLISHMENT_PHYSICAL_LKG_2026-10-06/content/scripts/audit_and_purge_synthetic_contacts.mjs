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

console.log('Inspecting atlas_contacts table...');

const totalRes = await client.query('SELECT count(*) FROM public.atlas_contacts;');
console.log('Total contacts in DB:', totalRes.rows[0].count);

// Check contacts by source
const sourceRes = await client.query(`
  SELECT email_source_type, count(*) 
  FROM public.atlas_contacts 
  GROUP BY email_source_type;
`);
console.log('Contacts by source type:', sourceRes.rows);

// Check which contacts have evidence in atlas_contact_evidence
const evidenceRes = await client.query(`
  SELECT 
    count(DISTINCT c.contact_id) as contacts_with_evidence,
    count(DISTINCT e.contact_id) as evidence_count
  FROM public.atlas_contacts c
  JOIN public.atlas_contact_evidence e ON c.contact_id = e.contact_id;
`);
console.log('Contacts with valid evidence:', evidenceRes.rows[0]);

// Look at unverified / synthetic contacts
const unverifiedRes = await client.query(`
  SELECT c.contact_id, c.email, c.company, c.email_source_type
  FROM public.atlas_contacts c
  LEFT JOIN public.atlas_contact_evidence e ON c.contact_id = e.contact_id
  WHERE e.evidence_id IS NULL OR c.email LIKE '%example%' OR c.email LIKE '%test%'
  LIMIT 15;
`);
console.log('Sample unverified / synthetic contacts:', unverifiedRes.rows);

await client.end();
