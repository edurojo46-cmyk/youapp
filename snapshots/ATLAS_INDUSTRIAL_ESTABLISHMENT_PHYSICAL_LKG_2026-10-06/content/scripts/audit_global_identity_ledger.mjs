import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

const poolCold = new pg.Pool({
  user: dbConfig.user,
  password: dbConfig.password,
  host: dbConfig.host,
  port: 5432,
  database: 'atlas_shadow_cold_gate',
  ssl: { rejectUnauthorized: false },
  max: 4
});

const poolProd = new pg.Pool({
  user: dbConfig.user,
  password: dbConfig.password,
  host: dbConfig.host,
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 4
});

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('AUDITING GLOBAL NET-NEW IDENTITY LEDGER & PRIOR REAL GATES');
  console.log('════════════════════════════════════════════════════════════════');

  const coldClient = await poolCold.connect();
  const prodClient = await poolProd.connect();

  try {
    // 1. Production baseline metrics
    console.log('[1/5] Inspecting production known metrics...');
    const qProdMetrics = await prodClient.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
    const prodMetrics = qProdMetrics.rows[0];
    const prodUnique = parseInt(prodMetrics.unique_people || '6625560', 10);
    const prodCabaPba = parseInt(prodMetrics.caba_pba_qualified_unique_real_people || '5318281', 10);
    console.log(`  Production unique_people: ${prodUnique.toLocaleString()}`);
    console.log(`  Production caba_pba_qualified_unique_real_people: ${prodCabaPba.toLocaleString()}`);

    // 2. Cold gate canonical persons
    console.log('[2/5] Inspecting atlas_shadow_cold_gate canonical persons (Third Clean 1M run)...');
    const qColdPersons = await coldClient.query(`
      SELECT count(*) as total, count(DISTINCT atlas_person_id) as unique_persons, count(DISTINCT primary_identity_hash) as unique_hashes
      FROM atlas_shadow.atlas_canonical_persons_v2;
    `);
    const coldStats = qColdPersons.rows[0];
    console.log(`  Total: ${coldStats.total} | Unique Persons: ${coldStats.unique_persons} | Unique Hashes: ${coldStats.unique_hashes}`);

    // 3. Postgres shadow canonical persons (10K, 100K, Sprint)
    console.log('[3/5] Inspecting postgres atlas_ingest_v2_shadow canonical persons...');
    const qProdShadow = await prodClient.query(`
      SELECT count(*) as total, count(DISTINCT atlas_person_id) as unique_persons, count(DISTINCT primary_identity_hash) as unique_hashes
      FROM atlas_ingest_v2_shadow.atlas_canonical_persons_v2;
    `);
    const prodShadowStats = qProdShadow.rows[0];
    console.log(`  Total: ${prodShadowStats.total} | Unique Persons: ${prodShadowStats.unique_persons} | Unique Hashes: ${prodShadowStats.unique_hashes}`);

    // 4. Inspecting Outbox Tables in Postgres
    console.log('[4/5] Inspecting outbox tables in postgres...');
    const outboxCounts = {};
    for (const table of ['atlas_search_outbox_v2_2026_09_22', 'atlas_search_outbox_v2_2026_09_23', 'atlas_search_outbox_v2_2026_09_24', 'atlas_search_outbox_v2_2026_09_25']) {
      const qO = await prodClient.query(`SELECT count(DISTINCT atlas_person_id) as unique_persons FROM public.${table};`);
      outboxCounts[table] = parseInt(qO.rows[0].unique_persons, 10);
      console.log(`  ${table}: ${outboxCounts[table].toLocaleString()} unique persons`);
    }

    // 5. Check overlap between atlas_shadow canonical persons and postgres shadow canonical persons
    console.log('[5/5] Checking identity overlap between Cold Gate (Third Clean 1M) and prior gates...');
    const sampleCold = await coldClient.query(`
      SELECT atlas_person_id, display_name, primary_organization, geography_id 
      FROM atlas_shadow.atlas_canonical_persons_v2 
      LIMIT 10000;
    `);
    const coldPersonIds = sampleCold.rows.map(r => r.atlas_person_id);

    const qOverlap = await prodClient.query(`
      SELECT count(*) as overlap_count 
      FROM atlas_ingest_v2_shadow.atlas_canonical_persons_v2 
      WHERE atlas_person_id = ANY($1::text[]);
    `, [coldPersonIds]);
    console.log(`  Sample 10,000 cold persons vs atlas_ingest_v2_shadow: ${qOverlap.rows[0].overlap_count} overlapping IDs.`);

  } finally {
    coldClient.release();
    prodClient.release();
    await poolCold.end();
    await poolProd.end();
  }
}

main().catch(console.error);
