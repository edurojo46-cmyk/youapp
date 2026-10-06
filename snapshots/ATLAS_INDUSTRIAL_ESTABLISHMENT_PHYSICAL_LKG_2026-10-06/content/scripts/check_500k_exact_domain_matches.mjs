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

console.log('--- Checking 500K Authority for the 20 test prospects ---');

// The 20 saved companies for User A
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

const genericDomains = new Set(['argentina.gob.ar', 'buenosaires.gob.ar', 'gmail.com', 'yahoo.com', 'hotmail.com']);

for (const c of compRes.rows) {
  let domain = c.primary_domain?.replace(/^www\./, '').toLowerCase();
  const name = c.canonical_name;

  if (domain && genericDomains.has(domain)) {
    console.log(`Company "${name}": domain "${domain}" is generic/government portal -> SKIPPED (AMBIGUOUS / WRONG_ENTITY)`);
    domain = null;
  }

  if (domain) {
    // Check exact domain match in 1M authority
    const m = await client.query(`
      SELECT email_normalized, contact_type, associated_entity, source_id, source_url, evidence
      FROM public.atlas_public_email_contacts_1m
      WHERE email_normalized LIKE '%@' || $1 OR email_normalized LIKE '%.@' || $1
      LIMIT 5;
    `, [domain]);

    if (m.rows.length > 0) {
      console.log(`\n>>> EXACT MATCH for "${name}" (domain: ${domain}):`, m.rows);
    } else {
      console.log(`Company "${name}" (domain: ${domain}): 0 matches in 500K authority`);
    }
  } else {
    console.log(`Company "${name}": No private domain`);
  }
}

await client.end();
