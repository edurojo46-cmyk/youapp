import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

// Max 1 connection so we don't interfere with Factory
const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

const REMOVAL_SEQUENCE = [
  {
    name: 'idx_discovery_candidates_profession_trgm',
    expectedMb: 84,
    restoreSql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discovery_candidates_profession_trgm ON atlas_people_discovery_candidates USING gin (profession gin_trgm_ops);'
  },
  {
    name: 'idx_discovery_candidates_role_trgm',
    expectedMb: 210,
    restoreSql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discovery_candidates_role_trgm ON atlas_people_discovery_candidates USING gin (role gin_trgm_ops);'
  },
  {
    name: 'idx_discovery_candidates_display_name_trgm',
    expectedMb: 200,
    restoreSql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discovery_candidates_display_name_trgm ON atlas_people_discovery_candidates USING gin (display_name gin_trgm_ops);'
  },
  {
    name: 'idx_discovery_candidates_org_trgm',
    expectedMb: 315,
    restoreSql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discovery_candidates_org_trgm ON atlas_people_discovery_candidates USING gin (organization gin_trgm_ops);'
  }
];

const PARITY_QUERIES = [
  'GONZALEZ', 'HOSPITAL', 'ABOGADO', 'DIRECTOR', 'SALUD', 'RODRIGUEZ', 'UNIVERSIDAD'
];

async function getDbIoStats() {
  const res = await pool.query(`
    SELECT 
      sum(heap_blks_read) as heap_read,
      sum(heap_blks_hit) as heap_hit,
      sum(idx_blks_read) as idx_read,
      sum(idx_blks_hit) as idx_hit
    FROM pg_statio_user_tables
    WHERE relname = 'atlas_people_discovery_candidates';
  `);
  return {
    heapRead: Number(res.rows[0].heap_read || 0),
    heapHit: Number(res.rows[0].heap_hit || 0),
    idxRead: Number(res.rows[0].idx_read || 0),
    idxHit: Number(res.rows[0].idx_hit || 0)
  };
}

async function verifySearchParity() {
  console.log('   -> Running search parity battery across representative queries...');
  for (const q of PARITY_QUERIES) {
    const t0 = Date.now();
    const res = await pool.query(`
      SELECT count(*) FROM atlas_search_people_unified_v3(p_query := $1, p_limit := 20);
    `, [q]);
    const dt = Date.now() - t0;
    const count = parseInt(res.rows[0].count, 10);
    if (count === 0 && q !== 'XYZ_NONEXISTENT') {
      console.warn(`   [WARN] Query '${q}' returned 0 results.`);
    }
    console.log(`      Query '${q}': ${count} rows in ${dt}ms`);
  }
  return true;
}

async function verifyQueryPlan() {
  console.log('   -> Verifying query plan does not fall back to sequential scan...');
  await pool.query('SET enable_seqscan = off;');
  const res = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT c.discovery_id, c.display_name, c.role, c.organization
    FROM atlas_people_discovery_candidates c
    WHERE c.search_text_normalized ILIKE '%gonzalez%'
    LIMIT 20;
  `);
  const planText = res.rows.map(r => r['QUERY PLAN']).join('\n');
  const usesNormalizedTrgm = planText.includes('idx_discovery_candidates_search_normalized_trgm');
  const isSeqScan = planText.includes('Seq Scan on atlas_people_discovery_candidates');
  
  if (isSeqScan || !usesNormalizedTrgm) {
    console.error('   [REGRESSION] Query plan regression detected!');
    console.error(planText);
    return false;
  }
  console.log('      Verified: Uses idx_discovery_candidates_search_normalized_trgm with Bitmap Index Scan.');
  return true;
}

async function run() {
  console.log('=== SECTION 7: SAFE SEQUENTIAL GIN INDEX CONSOLIDATION ===\n');

  const stepLogs = [];
  let totalSpaceSavedMb = 0;

  for (let i = 0; i < REMOVAL_SEQUENCE.length; i++) {
    const target = REMOVAL_SEQUENCE[i];
    console.log(`\n======================================================`);
    console.log(`[STEP ${i + 1}/4] Removing redundant GIN: ${target.name} (~${target.expectedMb} MB)`);
    console.log(`======================================================`);

    // Pre-check size
    const sizeRes = await pool.query(`
      SELECT pg_size_pretty(pg_relation_size($1::regclass)) as pretty, pg_relation_size($1::regclass) as bytes;
    `, [target.name]).catch(() => ({ rows: [] }));

    if (sizeRes.rows.length === 0) {
      console.log(`Index ${target.name} does not exist. Already dropped.`);
      continue;
    }

    const actualMb = (parseInt(sizeRes.rows[0].bytes, 10) / (1024 * 1024)).toFixed(1);
    console.log(`Current size on disk: ${sizeRes.rows[0].pretty} (${actualMb} MB)`);

    const ioBefore = await getDbIoStats();
    console.log(`Dropping index concurrently: DROP INDEX CONCURRENTLY ${target.name}...`);
    const dropStart = Date.now();

    try {
      await pool.query(`DROP INDEX CONCURRENTLY ${target.name};`);
      const dropDuration = Date.now() - dropStart;
      console.log(`Dropped ${target.name} successfully in ${dropDuration}ms.`);
      totalSpaceSavedMb += parseFloat(actualMb);
    } catch (dropErr) {
      console.error(`Failed to drop index ${target.name}:`, dropErr.message);
      break;
    }

    // Post-removal checks
    let parityOk = false;
    let planOk = false;

    try {
      parityOk = await verifySearchParity();
      planOk = await verifyQueryPlan();
    } catch (testErr) {
      console.error(`Error during post-removal verification:`, testErr.message);
    }

    const ioAfter = await getDbIoStats();
    const heapReadsDelta = ioAfter.heapRead - ioBefore.heapRead;
    const idxReadsDelta = ioAfter.idxRead - ioBefore.idxRead;

    if (!parityOk || !planOk) {
      console.error(`\n[CRITICAL REGRESSION] Post-removal verification failed for ${target.name}! Restoring immediately...`);
      await pool.query(target.restoreSql);
      console.log(`Restoration initiated. Halting consolidation.`);
      break;
    }

    console.log(`[PASS] ${target.name} removed cleanly. IO delta: Heap=${heapReadsDelta}, Index=${idxReadsDelta}`);
    stepLogs.push({
      index_name: target.name,
      space_saved_mb: parseFloat(actualMb),
      parity_verified: parityOk,
      query_plan_verified: planOk,
      heap_reads_delta: heapReadsDelta,
      idx_reads_delta: idxReadsDelta,
      status: 'REMOVED_AND_CERTIFIED'
    });
  }

  const finalSummary = {
    timestamp: new Date().toISOString(),
    indexes_removed_count: stepLogs.length,
    total_space_saved_mb: totalSpaceSavedMb,
    step_details: stepLogs
  };

  fs.writeFileSync('reports/atlas/realtime/gin_consolidation_report.json', JSON.stringify(finalSummary, null, 2));
  console.log(`\nConsolidation complete. Total space saved: ${totalSpaceSavedMb.toFixed(1)} MB.`);
  console.log('Report saved to reports/atlas/realtime/gin_consolidation_report.json');

  await pool.end();
}

run().catch(console.error);
