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

const res = await client.query(`
  SELECT 
    c.contact_id,
    c.entity_id as company_id,
    ent.canonical_name as company_name,
    e.field as contact_type,
    e.value as contact_value,
    c.email_source_type as source,
    e.source_url as evidence_ref,
    to_char(c.last_verified_at, 'YYYY-MM-DD') as last_verified,
    c.status as trust_status
  FROM public.atlas_contacts c
  JOIN public.atlas_contact_evidence e ON c.contact_id = e.contact_id
  JOIN public.atlas_canonical_entities ent ON c.entity_id = ent.canonical_entity_id
  ORDER BY ent.canonical_name ASC, e.field ASC;
`);

console.log(JSON.stringify(res.rows, null, 2));
await client.end();
