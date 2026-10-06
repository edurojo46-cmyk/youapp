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

async function inspectLegacy() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('=== DETAILED INSPECTION OF 26 LEGACY RECORDS ===\n');

  // Fetch all current real auth.users
  const authUsersRes = await client.query('SELECT id, email, created_at FROM auth.users');
  const authUserIds = new Set(authUsersRes.rows.map(r => r.id));

  // 1. atlas_user_bases
  console.log('--- 1. atlas_user_bases ---');
  const bases = await client.query('SELECT * FROM public.atlas_user_bases');
  const legacyBases = bases.rows.filter(r => !authUserIds.has(r.user_id));
  console.log(`Found ${legacyBases.length} legacy bases:`);
  console.log(JSON.stringify(legacyBases, null, 2));

  // 2. atlas_user_saved_relations
  console.log('\n--- 2. atlas_user_saved_relations ---');
  const rels = await client.query('SELECT id, user_id, product_id, company_id, base_name, commercial_status, priority, notes, saved_at FROM public.atlas_user_saved_relations');
  const legacyRels = rels.rows.filter(r => !authUserIds.has(r.user_id));
  console.log(`Found ${legacyRels.length} legacy saved relations:`);
  
  // Group by user_id to see distinct legacy users
  const relsByUser = {};
  for (const r of legacyRels) {
    if (!relsByUser[r.user_id]) relsByUser[r.user_id] = [];
    relsByUser[r.user_id].push(r);
  }
  for (const [uid, items] of Object.entries(relsByUser)) {
    console.log(`User ID: ${uid} -> count: ${items.length}, dates: ${items[0].saved_at} to ${items[items.length-1].saved_at}`);
    console.log(`Sample notes/status: status=${items[0].commercial_status}, notes=${items[0].notes}, base=${items[0].base_name}`);
  }

  // 3. atlas_commercial_proposals
  console.log('\n--- 3. atlas_commercial_proposals ---');
  const props = await client.query('SELECT proposal_id, user_id, title, status, created_at, buyer_name, seller_organization_id FROM public.atlas_commercial_proposals');
  const legacyProps = props.rows.filter(r => !authUserIds.has(r.user_id));
  console.log(`Found ${legacyProps.length} legacy proposals:`);
  console.log(JSON.stringify(legacyProps, null, 2));

  await client.end();
}

inspectLegacy().catch(console.error);
