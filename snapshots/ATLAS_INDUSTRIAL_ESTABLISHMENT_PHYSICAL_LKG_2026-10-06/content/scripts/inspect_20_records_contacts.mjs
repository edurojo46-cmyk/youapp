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

const testUserId = 'a1111111-2222-3333-4444-555555555555';
const res = await client.query(`
  SELECT 
    s.id as saved_id,
    s.product_id,
    s.company_id,
    p.name as prod_name,
    ent.canonical_name as ent_name,
    ent.canonical_entity_id,
    ent.primary_domain,
    ent.metadata as ent_meta,
    p.attributes_json as prod_attr
  FROM public.atlas_user_saved_relations s
  LEFT JOIN public.atlas_products p ON s.product_id = p.product_id
  LEFT JOIN public.atlas_canonical_entities ent ON (s.product_id = ent.canonical_entity_id OR s.company_id = ent.canonical_entity_id)
  WHERE s.user_id = $1::uuid
  ORDER BY s.saved_at DESC
  LIMIT 20;
`, [testUserId]);

console.log(`20 Records Analysis:`);
let count = 0;
for (const r of res.rows) {
  count++;
  console.log(`\n--- Record #${count} ---`);
  console.log(`Company / Prod: ${r.ent_name || r.prod_name}`);
  console.log(`Company ID: ${r.company_id || r.canonical_entity_id}`);
  console.log(`Primary Domain: ${r.primary_domain}`);
  console.log(`Ent Meta:`, JSON.stringify(r.ent_meta));
  console.log(`Prod Evidence:`, JSON.stringify(r.prod_attr?.evidence));
}

await client.end();
