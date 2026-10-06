import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
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

console.log('--- Inspecting atlas_public_email_contacts_1m columns and sample ---');

const colsRes = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'atlas_public_email_contacts_1m'
  ORDER BY ordinal_position;
`);
console.log('Columns:', colsRes.rows);

const sampleRes = await client.query(`
  SELECT * FROM public.atlas_public_email_contacts_1m LIMIT 3;
`);
console.log('Sample rows:', sampleRes.rows);

const entCols = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'atlas_canonical_entities'
  ORDER BY ordinal_position;
`);
console.log('atlas_canonical_entities Columns:', entCols.rows.map(r => r.column_name));

// Get the 20 saved prospects in User A's base
const compRes = await client.query(`
  SELECT DISTINCT 
    r.company_id,
    e.canonical_name,
    e.primary_domain,
    e.metadata
  FROM atlas_user_saved_relations r
  LEFT JOIN atlas_canonical_entities e ON r.company_id = e.canonical_entity_id
  WHERE r.user_id = '768efac1-8d4c-4a19-8919-2de323884569';
`);
console.log('Saved companies in Mi Base (User A):', compRes.rows.map(c => ({
  company_id: c.company_id,
  name: c.canonical_name,
  domain: c.primary_domain,
  website: c.metadata?.website || c.metadata?.url
})));

console.log('\n--- Checking matches for saved companies in atlas_public_email_contacts_1m ---');
for (const c of compRes.rows) {
  const name = c.canonical_name;
  if (!name) continue;
  
  // Search by primary domain
  if (c.primary_domain) {
    const domainMatch = await client.query(`
      SELECT email_normalized, contact_type, associated_entity, source_id, source_url
      FROM public.atlas_public_email_contacts_1m
      WHERE email_normalized LIKE '%' || $1
      LIMIT 3;
    `, [c.primary_domain]);
    if (domainMatch.rows.length > 0) {
      console.log(`Company "${name}" domain "${c.primary_domain}": matches in 1M = ${domainMatch.rows.length}:`, domainMatch.rows);
    }
  }

  // Search by name in associated_entity
  const nameMatch = await client.query(`
    SELECT email_normalized, contact_type, associated_entity, source_id, source_url
    FROM public.atlas_public_email_contacts_1m
    WHERE associated_entity ILIKE '%' || $1 || '%'
    LIMIT 3;
  `, [name]);

  if (nameMatch.rows.length > 0) {
    console.log(`Company "${name}": found ${nameMatch.rows.length} matches by name in 1M:`, nameMatch.rows);
  }
}

await client.end();
