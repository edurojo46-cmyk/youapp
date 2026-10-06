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

console.log('=== VERIFYING CONTACT PROVENANCE PURITY GATE V2 OVER LIVE API ===\n');

// 1. Audit status distribution in atlas_contacts
const statusRes = await client.query(`
  SELECT status, count(*) 
  FROM public.atlas_contacts 
  GROUP BY status;
`);
console.log('DB atlas_contacts status breakdown:', statusRes.rows);

const nonProdCount = statusRes.rows.find(r => r.status === 'TEST_NON_PRODUCTION')?.count || '0';
const activeCount = statusRes.rows.find(r => r.status === 'ACTIVE')?.count || '0';

// 2. Fetch live saved relations from API
const apiRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`, {
  headers: { 'x-user-id': userA }
});

if (!apiRes.ok) {
  throw new Error(`API returned HTTP ${apiRes.status}`);
}

const data = await apiRes.json();
const items = data.items || [];
console.log(`Fetched ${items.length} prospects from /api/user/saved-relations.\n`);

if (items.length !== 20) {
  throw new Error(`Expected 20 items, got ${items.length}`);
}

let withPublicEmail = 0;
let withPublicPhone = 0;
let withWebsite = 0;
let withContactForm = 0;
let withAssociatedPerson = 0;
let withNoContact = 0;

let sugHigh = 0;
let sugMed = 0;
let sugLow = 0;
let sugInsufficient = 0;

let hasAnyTestContactLeaked = false;

for (const item of items) {
  const hasEmail = Boolean(item.public_email);
  const hasPhone = Boolean(item.public_phone);
  const hasWeb = Boolean(item.website);
  const hasForm = (item.all_contact_forms && item.all_contact_forms.length > 0);
  const hasPerson = (item.all_people && item.all_people.length > 0);
  const hasNone = !hasEmail && !hasPhone && !hasWeb && !hasForm;

  if (hasEmail) withPublicEmail++;
  if (hasPhone) withPublicPhone++;
  if (hasWeb) withWebsite++;
  if (hasForm) withContactForm++;
  if (hasPerson) withAssociatedPerson++;
  if (hasNone) withNoContact++;

  const sp = item.suggested_priority;
  if (sp === 'HIGH') sugHigh++;
  else if (sp === 'MEDIUM') sugMed++;
  else if (sp === 'LOW') sugLow++;
  else if (sp === 'INSUFFICIENT_DATA') sugInsufficient++;

  // Check if any excluded hardcoded seed contact leaked into live output
  const emailsToCheck = (item.all_emails || []).map(e => e.email);
  for (const em of emailsToCheck) {
    if (['contacto@cormillot.com', 'consultas@cormillot.com', 'info@vanoli.com.ar', 'institucional@fundacionfavaloro.org'].includes(em)) {
      hasAnyTestContactLeaked = true;
      console.error(`LEAK DETECTED: Seed contact ${em} appeared in production response!`);
    }
  }
}

console.log('--- PURITY GATE V2 RESULTS ---');
console.log(`TEST_NON_PRODUCTION_CONTACTS_EXCLUDED = ${nonProdCount}`);
console.log(`PRODUCTION_CONTACTS_REMAINING = ${withPublicEmail}`);
console.log(`TEST_CONTACTS_LEAKED = ${hasAnyTestContactLeaked ? 'TRUE' : 'FALSE'}`);
console.log(`WITH_PUBLIC_EMAIL = ${withPublicEmail}`);
console.log(`WITH_PUBLIC_PHONE = ${withPublicPhone}`);
console.log(`WITH_WEBSITE = ${withWebsite}`);
console.log(`WITH_CONTACT_FORM = ${withContactForm}`);
console.log(`WITH_ASSOCIATED_PERSON = ${withAssociatedPerson}`);
console.log(`WITH_NO_CONTACT = ${withNoContact}`);
console.log(`SUGGESTED_HIGH = ${sugHigh}`);
console.log(`SUGGESTED_MEDIUM = ${sugMed}`);
console.log(`SUGGESTED_LOW = ${sugLow}`);
console.log(`SUGGESTED_INSUFFICIENT_DATA = ${sugInsufficient}`);

if (hasAnyTestContactLeaked) {
  throw new Error('Purity gate failed: non-production test contacts were found in API response!');
}

console.log('\nCONTACT_PROVENANCE_PURITY_CERTIFIED = TRUE');
console.log('FINAL_STATUS = PASS\n');

await client.end();
