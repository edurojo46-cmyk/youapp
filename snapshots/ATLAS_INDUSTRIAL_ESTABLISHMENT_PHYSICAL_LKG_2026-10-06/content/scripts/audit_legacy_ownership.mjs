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

async function audit() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('--- AUDITING ATLAS OWNERSHIP & LEGACY DATA ---');

  // 1. Fetch all real Supabase auth users
  const authUsersRes = await client.query('SELECT id, email, created_at FROM auth.users');
  console.log(`Total auth.users registered: ${authUsersRes.rows.length}`);
  const authUserIds = new Set(authUsersRes.rows.map(r => r.id));

  // 2. atlas_user_bases
  const basesTableExists = await client.query(
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'atlas_user_bases')"
  );
  let basesStats = { valid: 0, missing: 0, legacy: 0, total: 0 };
  if (basesTableExists.rows[0].exists) {
    const basesRes = await client.query('SELECT * FROM public.atlas_user_bases');
    basesStats.total = basesRes.rows.length;
    for (const r of basesRes.rows) {
      if (!r.user_id) basesStats.missing++;
      else if (authUserIds.has(r.user_id)) basesStats.valid++;
      else basesStats.legacy++;
    }
  }
  console.log('atlas_user_bases:', basesStats);

  // 3. atlas_user_saved_relations
  const relsRes = await client.query('SELECT id, user_id, product_id, base_name FROM public.atlas_user_saved_relations');
  let relStats = { valid: 0, missing: 0, legacy: 0, total: relsRes.rows.length };
  for (const r of relsRes.rows) {
    if (!r.user_id) relStats.missing++;
    else if (authUserIds.has(r.user_id)) relStats.valid++;
    else relStats.legacy++;
  }
  console.log('atlas_user_saved_relations:', relStats);

  // 4. atlas_commercial_proposals
  const propsRes = await client.query('SELECT proposal_id, user_id, seller_organization_id, title FROM public.atlas_commercial_proposals');
  let propStats = { valid: 0, missing: 0, legacy: 0, total: propsRes.rows.length };
  for (const r of propsRes.rows) {
    if (!r.user_id) propStats.missing++;
    else if (authUserIds.has(r.user_id)) propStats.valid++;
    else propStats.legacy++;
  }
  console.log('atlas_commercial_proposals:', propStats);

  const totalValid = basesStats.valid + relStats.valid + propStats.valid;
  const totalMissing = basesStats.missing + relStats.missing + propStats.missing;
  const totalLegacy = basesStats.legacy + relStats.legacy + propStats.legacy;

  console.log('\n==================================================');
  console.log('OWNERSHIP AUDIT TOTALS:');
  console.log(`ROWS_WITH_VALID_AUTH_USER = ${totalValid}`);
  console.log(`ROWS_WITH_MISSING_USER = ${totalMissing}`);
  console.log(`ROWS_WITH_UNKNOWN_OR_LEGACY_USER = ${totalLegacy}`);
  console.log('==================================================');

  await client.end();
}

audit().catch(console.error);
