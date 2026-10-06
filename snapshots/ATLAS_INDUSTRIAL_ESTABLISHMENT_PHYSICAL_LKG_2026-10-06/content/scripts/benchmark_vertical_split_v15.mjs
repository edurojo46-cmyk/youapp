import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

function makeCandidateBatch(count, offset) {
  const sources = [];
  const srcIds = [];
  const hmacs = [];
  const personIds = [];
  const decisions = [];
  const evidenceIds = [];
  const observedAts = [];
  const payloads = [];

  const now = new Date().toISOString();

  for (let i = 0; i < count; i++) {
    const idx = offset + i;
    const srcId = `arca_${idx}`;
    const hmac = crypto.createHash('sha256').update(`hmac_${idx}`).digest('hex');
    const pId = `atlas_v15_cand_${idx}`;
    
    sources.push('ARCA_CONDICION_TRIBUTARIA');
    srcIds.push(srcId);
    hmacs.push(hmac);
    personIds.push(pId);
    decisions.push('NEW');
    evidenceIds.push(`ev_${idx}`);
    observedAts.push(now);
    payloads.push(JSON.stringify({
      display_name: `CONTRIBUYENTE SHADOW ${idx}`,
      province: 'BUENOS AIRES',
      tax_status: 'ACTIVO',
      cuit: `${idx}`
    }));
  }

  return { sources, srcIds, hmacs, personIds, decisions, evidenceIds, observedAts, payloads };
}

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('🔬 ATLAS V1.5 VERTICAL SPLIT EXPERIMENT (CURRENT VS HOT PATH)');
  console.log('================================================================\n');

  try {
    const BATCH_SIZE = 1500;
    const baseOffset = Math.floor(Math.random() * 80000000) + 10000000;
    const currentBatch = makeCandidateBatch(BATCH_SIZE, baseOffset);
    const hotBatch = makeCandidateBatch(BATCH_SIZE, baseOffset + 100000); // Fresh distinct keys

    // --- 1. CURRENT PRODUCTION SCHEMA MEASUREMENT ---
    console.log(`Executing CURRENT production-fidelity path with ${BATCH_SIZE} candidates...`);
    
    // Measure via instrumented RPC
    const currRes = await client.query(`
      SELECT * FROM public.atlas_resolve_and_ingest_batch_instrumented_rpc(
        $1::text, $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::numeric[],
        $11::text[]
      );
    `, [
      'ARCA_CONDICION_TRIBUTARIA',
      currentBatch.srcIds,
      currentBatch.srcIds.map(() => 'ARCA_CUIT'),
      currentBatch.srcIds,
      currentBatch.srcIds.map(s => 'PERSONA ' + s),
      currentBatch.srcIds.map(s => 'PERSONA ' + s),
      currentBatch.srcIds.map(() => 'DEFINITELY_ABSENT'),
      currentBatch.personIds,
      currentBatch.evidenceIds,
      currentBatch.srcIds.map(() => 1.0),
      currentBatch.srcIds.map(() => 'DETERMINISTIC')
    ]);
    const currMetrics = {
      SERVER_IDENTITY_INSERT_MS: Number(currRes.rows[0].server_identity_insert_ms),
      SERVER_OUTBOX_INSERT_MS: Number(currRes.rows[0].server_outbox_insert_ms)
    };

    // Measure WAL and Buffers on Current via EXPLAIN
    const explainCurr = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, WAL)
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, observed_at, resolution_method
      )
      SELECT 
        u.atlas_person_id, u.source_id, u.source_person_id, 'ARCA_CUIT', u.source_person_id, u.evidence_id, u.observed_at, 'DETERMINISTIC'
      FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
        AS u(source_id, source_person_id, atlas_person_id, evidence_id, observed_at)
      ON CONFLICT (source_id, source_person_id) DO NOTHING;
    `, [
      currentBatch.sources,
      currentBatch.srcIds.map(s => s + '_exp'),
      currentBatch.personIds,
      currentBatch.evidenceIds,
      currentBatch.observedAts
    ]);
    const explainCurrText = explainCurr.rows.map(r => r['QUERY PLAN']).join('\n');

    // Extract Buffers & WAL from explainCurrText
    const currSharedHit = parseInt(explainCurrText.match(/shared hit=(\d+)/)?.[1] || '0', 10);
    const currSharedRead = parseInt(explainCurrText.match(/read=(\d+)/)?.[1] || '0', 10);
    const currWalRecords = parseInt(explainCurrText.match(/WAL: records=(\d+)/)?.[1] || '0', 10);
    const currWalBytes = parseInt(explainCurrText.match(/bytes=(\d+)/)?.[1] || '0', 10);

    // --- 2. HOT RESOLVER V1.5 SHADOW SCHEMA MEASUREMENT ---
    console.log(`Executing HOT PATH shadow path with ${BATCH_SIZE} candidates...`);
    const hotRes = await client.query(`
      SELECT public.atlas_resolve_and_ingest_batch_v15_shadow_rpc(
        $1, $2, $3, $4, $5, $6, $7
      ) as metrics;
    `, [
      hotBatch.sources,
      hotBatch.srcIds,
      hotBatch.hmacs,
      hotBatch.personIds,
      hotBatch.decisions,
      hotBatch.evidenceIds,
      hotBatch.observedAts
    ]);
    const hotMetrics = hotRes.rows[0].metrics;

    // Measure WAL and Buffers on Hot Path via EXPLAIN
    const explainHot = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, WAL)
      INSERT INTO public.atlas_hot_source_key_map (
        source_id, source_person_id, atlas_person_id, created_at
      )
      SELECT 
        u.source_id, u.source_person_id, u.atlas_person_id, u.observed_at
      FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[])
        AS u(source_id, source_person_id, atlas_person_id, observed_at)
      ON CONFLICT (source_id, source_person_id) DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
    `, [
      hotBatch.sources,
      hotBatch.srcIds.map(s => s + '_exp'),
      hotBatch.personIds,
      hotBatch.observedAts
    ]);
    const explainHotText = explainHot.rows.map(r => r['QUERY PLAN']).join('\n');

    const hotSharedHit = parseInt(explainHotText.match(/shared hit=(\d+)/)?.[1] || '0', 10);
    const hotSharedRead = parseInt(explainHotText.match(/read=(\d+)/)?.[1] || '0', 10);
    const hotWalRecords = parseInt(explainHotText.match(/WAL: records=(\d+)/)?.[1] || '0', 10);
    const hotWalBytes = parseInt(explainHotText.match(/bytes=(\d+)/)?.[1] || '0', 10);

    const report = {
      TIMESTAMP: new Date().toISOString(),
      BATCH_SIZE,
      CURRENT_IDENTITY_INSERT_MS: currMetrics.SERVER_IDENTITY_INSERT_MS,
      HOT_IDENTITY_INSERT_MS: hotMetrics.HOT_IDENTITY_INSERT_MS,
      CURRENT_OUTBOX_INSERT_MS: currMetrics.SERVER_OUTBOX_INSERT_MS,
      MINIMAL_OUTBOX_INSERT_MS: hotMetrics.MINIMAL_OUTBOX_INSERT_MS,
      CURRENT_WAL_BYTES: currWalBytes,
      HOT_PATH_WAL_BYTES: hotWalBytes,
      CURRENT_BLOCK_READS: currSharedRead,
      HOT_PATH_BLOCK_READS: hotSharedRead,
      HOT_PATH_TOTAL_SERVER_MS: hotMetrics.HOT_PATH_TOTAL_SERVER_MS,
      SPEEDUP_IDENTITY: Number((currMetrics.SERVER_IDENTITY_INSERT_MS / hotMetrics.HOT_IDENTITY_INSERT_MS).toFixed(2)),
      SPEEDUP_OUTBOX: Number((currMetrics.SERVER_OUTBOX_INSERT_MS / hotMetrics.MINIMAL_OUTBOX_INSERT_MS).toFixed(2)),
      WAL_REDUCTION_PERCENT: `${Number(((1 - (hotWalBytes / (currWalBytes || 1))) * 100).toFixed(2))}%`,
      BLOCK_READ_REDUCTION_PERCENT: `${Number(((1 - (hotSharedRead / (currSharedRead || 1))) * 100).toFixed(2))}%`
    };

    console.log('\n--- VERTICAL SPLIT EXPERIMENT RESULTS ---');
    console.log(`CURRENT_IDENTITY_INSERT_MS : ${report.CURRENT_IDENTITY_INSERT_MS} ms`);
    console.log(`HOT_IDENTITY_INSERT_MS     : ${report.HOT_IDENTITY_INSERT_MS} ms (${report.SPEEDUP_IDENTITY}x speedup)`);
    console.log(`CURRENT_OUTBOX_INSERT_MS   : ${report.CURRENT_OUTBOX_INSERT_MS} ms`);
    console.log(`MINIMAL_OUTBOX_INSERT_MS   : ${report.MINIMAL_OUTBOX_INSERT_MS} ms (${report.SPEEDUP_OUTBOX}x speedup)`);
    console.log(`CURRENT_WAL_BYTES          : ${report.CURRENT_WAL_BYTES} bytes`);
    console.log(`HOT_PATH_WAL_BYTES         : ${report.HOT_PATH_WAL_BYTES} bytes (${report.WAL_REDUCTION_PERCENT} reduction)`);
    console.log(`CURRENT_BLOCK_READS        : ${report.CURRENT_BLOCK_READS} blocks`);
    console.log(`HOT_PATH_BLOCK_READS       : ${report.HOT_PATH_BLOCK_READS} blocks`);
    console.log(`HOT_PATH_TOTAL_SERVER_MS   : ${report.HOT_PATH_TOTAL_SERVER_MS} ms`);
    console.log('-----------------------------------------\n');

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync('reports/atlas/discovery/vertical_split_benchmark.json', JSON.stringify(report, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Vertical split benchmark failed:', err);
  process.exit(1);
});
