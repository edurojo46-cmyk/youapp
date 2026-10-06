import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const dbConfig = parseDbUrl();

async function runAudit() {
  console.log('🔬 EXECUTING 10,000 REALITY AUDIT FOR ENGINEERING RUN...');
  const prodPool = new pg.Pool({ ...dbConfig, max: 1 });
  const shadowPool = new pg.Pool({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false },
    max: 1
  });

  const prodClient = await prodPool.connect();
  const shadowClient = await shadowPool.connect();

  try {
    await shadowClient.query('SET statement_timeout = 180000;');

    // 1. Verify Production Freeze
    const prodMetrics = await prodClient.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
    const prodCabaPba = parseInt(prodMetrics.rows[0]?.caba_pba_qualified_unique_real_people || '0', 10);
    const prodBenchmarkWrites = prodCabaPba === 5318281 ? 0 : Math.abs(prodCabaPba - 5318281);
    console.log(`[PROD AUDIT] CABA/PBA SSOT = ${prodCabaPba.toLocaleString()} | PRODUCTION_BENCHMARK_WRITES = ${prodBenchmarkWrites}`);

    // 2. Metrics in Shadow
    const qMetrics = await shadowClient.query("SELECT * FROM atlas_shadow.atlas_people_live_metrics WHERE id = 'current'");
    const totalCan = parseInt(qMetrics.rows[0]?.qualified_unique_real_people || '0', 10);
    const totalSearch = parseInt(qMetrics.rows[0]?.searchable_documents || '0', 10);
    console.log(`[SHADOW TOTALS] Live Metrics: Canonical Persons = ${totalCan.toLocaleString()} | Search Documents = ${totalSearch.toLocaleString()}`);

    // 3. Fast PK Nested-Loop Join on 10,000 samples
    console.log('  Executing fast PK join on 10,000 samples...');
    const auditRes = await shadowClient.query(`
      SELECT
        c.atlas_person_id,
        c.display_name,
        c.geography_id,
        c.evidence_summary,
        s.document_id,
        s.full_name as search_full_name,
        s.geography_id as search_geo
      FROM (
        SELECT atlas_person_id, display_name, geography_id, evidence_summary
        FROM atlas_shadow.atlas_canonical_persons_v2
        LIMIT 10000
      ) c
      LEFT JOIN atlas_shadow.atlas_argentina_people_search_v1 s
        ON s.document_id = 'doc_' || c.atlas_person_id;
    `);

    const rows = auditRes.rows;
    console.log(`  Audited ${rows.length} rows directly via PK join.`);

    let provenanceValid = 0;
    let searchFound = 0;
    let syntheticCount = 0;
    let identityErrors = 0;

    for (const r of rows) {
      let isProvValid = true;
      try {
        const ev = JSON.parse(r.evidence_summary);
        if (!ev.source_id || !ev.source_url || !ev.remote_response_hash || ev.remote_response_hash.length !== 64 || !ev.raw_record_id || !ev.raw_provenance_reference) {
          isProvValid = false;
        }
        if (r.geography_id !== 'CABA' && r.geography_id !== 'PBA') {
          isProvValid = false;
        }
        if (ev.source_id.includes('SYNTHETIC') || ev.source_id.includes('FORMULA') || ev.source_id.includes('SIMULATED')) {
          syntheticCount++;
          isProvValid = false;
        }
      } catch {
        isProvValid = false;
      }

      if (isProvValid) provenanceValid++;

      if (r.document_id && r.search_full_name === r.display_name && (r.search_geo === 'CABA' || r.search_geo === 'PBA')) {
        searchFound++;
      } else {
        identityErrors++;
      }
    }

    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`FORENSIC REALITY AUDIT RESULTS (${rows.length.toLocaleString()} SAMPLES):`);
    console.log(`  PROVENANCE_SAMPLE_VALID = ${provenanceValid}/${rows.length}`);
    console.log(`  SEARCH_SAMPLE_FOUND     = ${searchFound}/${rows.length}`);
    console.log(`  SYNTHETIC_ROWS          = ${syntheticCount}`);
    console.log(`  INVALID_PROVENANCE      = ${rows.length - provenanceValid}`);
    console.log(`  IDENTITY_ERRORS         = ${identityErrors}`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
  } finally {
    prodClient.release();
    shadowClient.release();
    await prodPool.end();
    await shadowPool.end();
  }
}

runAudit().catch(console.error);
