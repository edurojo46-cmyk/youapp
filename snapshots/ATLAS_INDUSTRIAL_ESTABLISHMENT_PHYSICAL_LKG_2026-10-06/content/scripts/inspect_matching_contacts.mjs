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
    s.company_id,
    s.product_id,
    COALESCE(p.name, ent.canonical_name) as name,
    ent.canonical_entity_id,
    ent.canonical_name,
    ent.primary_domain,
    ent.metadata as ent_meta
  FROM public.atlas_user_saved_relations s
  LEFT JOIN public.atlas_products p ON s.product_id = p.product_id
  LEFT JOIN public.atlas_canonical_entities ent ON s.company_id = ent.canonical_entity_id
  WHERE s.user_id = $1::uuid
  ORDER BY s.saved_at DESC
  LIMIT 20;
`, [testUserId]);

console.log(`Checking 20 records for test user:`);

let withEmail = 0;
let withPhone = 0;
let withWebsite = 0;
let withForm = 0;
let withPerson = 0;
let withNoContact = 0;

for (const r of res.rows) {
  const entityId = r.company_id || r.canonical_entity_id;
  
  // Query atlas_contacts
  const contactsRes = await client.query(`
    SELECT contact_id, email, full_name, recipient_type, job_title 
    FROM public.atlas_contacts 
    WHERE entity_id = $1::uuid;
  `, [entityId]);

  const emails = contactsRes.rows.filter(c => c.recipient_type !== 'PERSON' && !c.email.startsWith('tel:'));
  const phones = contactsRes.rows.filter(c => c.email.startsWith('tel:'));
  const people = contactsRes.rows.filter(c => c.recipient_type === 'PERSON');
  const website = r.ent_meta?.website || (r.primary_domain && r.primary_domain !== 'argentina.gob.ar' ? `https://${r.primary_domain}` : null);
  const form = r.ent_meta?.contact_form_url;

  const hasAny = emails.length > 0 || phones.length > 0 || website || form || people.length > 0;

  if (emails.length > 0) withEmail++;
  if (phones.length > 0) withPhone++;
  if (website) withWebsite++;
  if (form) withForm++;
  if (people.length > 0) withPerson++;
  if (!hasAny) withNoContact++;

  console.log(`- ${r.canonical_name || r.name}: emails=${emails.length}, phones=${phones.length}, web=${Boolean(website)}, form=${Boolean(form)}, people=${people.length}, hasAny=${hasAny}`);
}

console.log('\n--- 20-RECORD CONTACT BREAKDOWN ---');
console.log(`WITH_PUBLIC_EMAIL = ${withEmail}`);
console.log(`WITH_PUBLIC_PHONE = ${withPhone}`);
console.log(`WITH_WEBSITE = ${withWebsite}`);
console.log(`WITH_CONTACT_FORM = ${withForm}`);
console.log(`WITH_ASSOCIATED_PERSON = ${withPerson}`);
console.log(`WITH_NO_CONTACT = ${withNoContact}`);

await client.end();
