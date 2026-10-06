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

const userA = '768efac1-8d4c-4a19-8919-2de323884569';

// 1. Fetch 20 saved records for User A
const savedRes = await client.query(`
  SELECT 
    s.id as saved_id,
    s.product_id,
    s.company_id,
    COALESCE(p.name, ent.canonical_name, 'Empresa / Proveedor') as product_name,
    COALESCE(p.attributes_json->>'company_name', ent.canonical_name, '') as company_name,
    ent.primary_domain,
    COALESCE(p.attributes_json->>'website', ent.metadata->>'website', ent.primary_domain, '') as website,
    ent.metadata as entity_metadata
  FROM public.atlas_user_saved_relations s
  LEFT JOIN public.atlas_products p ON s.product_id = p.product_id
  LEFT JOIN public.atlas_canonical_entities ent ON (s.product_id = ent.canonical_entity_id OR s.company_id = ent.canonical_entity_id)
  WHERE s.user_id = $1::uuid
  ORDER BY s.saved_at DESC;
`, [userA]);

console.log(`Analyzing ${savedRes.rows.length} saved records with purely certified production sources:\n`);

const genericDomains = new Set(['argentina.gob.ar', 'buenosaires.gob.ar', 'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'gov.ar']);

let countWithEmail = 0;
let countWithPhone = 0;
let countWithWebsite = 0;
let countWithContactForm = 0;
let countWithPerson = 0;
let countWithNoContact = 0;

let sugHigh = 0;
let sugMed = 0;
let sugLow = 0;
let sugInsufficient = 0;

for (const row of savedRes.rows) {
  let domain = row.primary_domain?.replace(/^www\./, '').toLowerCase();
  if (domain && genericDomains.has(domain)) {
    domain = null;
  }

  // Check 500K authority
  let emails = [];
  let people = [];
  if (domain) {
    const authRes = await client.query(`
      SELECT email_normalized, contact_type, associated_entity, source_id, source_url, evidence
      FROM public.atlas_public_email_contacts_1m
      WHERE email_normalized LIKE '%@' || $1;
    `, [domain]);

    for (const m of authRes.rows) {
      if (m.contact_type === 'PROFESSIONAL_PERSON_EMAIL') {
        people.push({ email: m.email_normalized, name: m.associated_entity });
      } else {
        emails.push(m.email_normalized);
      }
    }
  }

  // Website from metadata or valid primary domain
  const rawWeb = row.entity_metadata?.website;
  let website = null;
  if (rawWeb && !rawWeb.includes('argentina.gob.ar')) {
    website = rawWeb;
  } else if (domain) {
    website = `https://${domain}`;
  }

  const hasEmail = emails.length > 0;
  const hasPhone = false; // 0 production phones in pre-existing DB
  const hasWeb = Boolean(website);
  const hasForm = Boolean(row.entity_metadata?.contact_form);
  const hasPerson = people.length > 0;
  const hasNoContact = !hasEmail && !hasPhone && !hasWeb && !hasForm;

  if (hasEmail) countWithEmail++;
  if (hasPhone) countWithPhone++;
  if (hasWeb) countWithWebsite++;
  if (hasForm) countWithContactForm++;
  if (hasPerson) countWithPerson++;
  if (hasNoContact) countWithNoContact++;

  let prio = 'LOW';
  if (hasEmail || hasPhone) {
    prio = 'HIGH';
    sugHigh++;
  } else if (hasWeb || hasForm) {
    prio = 'MEDIUM';
    sugMed++;
  } else {
    prio = 'LOW';
    sugLow++;
  }

  console.log(`- ${row.company_name} | Emails: ${emails.length} | Web: ${hasWeb ? 'YES' : 'NO'} | Prio: ${prio}`);
}

console.log('\n--- SIMULATION TOTALS ---');
console.log(`WITH_PUBLIC_EMAIL = ${countWithEmail}`);
console.log(`WITH_PUBLIC_PHONE = ${countWithPhone}`);
console.log(`WITH_WEBSITE = ${countWithWebsite}`);
console.log(`WITH_CONTACT_FORM = ${countWithContactForm}`);
console.log(`WITH_ASSOCIATED_PERSON = ${countWithPerson}`);
console.log(`WITH_NO_CONTACT = ${countWithNoContact}`);
console.log(`SUGGESTED_HIGH = ${sugHigh}`);
console.log(`SUGGESTED_MEDIUM = ${sugMed}`);
console.log(`SUGGESTED_LOW = ${sugLow}`);
console.log(`SUGGESTED_INSUFFICIENT_DATA = ${sugInsufficient}`);

await client.end();
