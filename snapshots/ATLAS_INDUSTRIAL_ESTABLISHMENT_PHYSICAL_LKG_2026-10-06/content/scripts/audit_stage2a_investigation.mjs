/**
 * scripts/audit_stage2a_investigation.mjs
 * 
 * Deep forensic audit script for Stage 2A:
 * - Census of raw range 10,000 to 60,000 in ARCA file
 * - Stage 1 (10k) vs Stage 2 (50k) coverage and overlap calculation
 * - Query atlas_snapshot_processing_runs, atlas_checkpoints, atlas_person_identity_map, atlas_search_outbox
 * - Timestamp distributions and execution lineage
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

function classifyRecord(line) {
  if (!line || typeof line !== 'string') return { classification: 'INVALID_RECORD' };
  if (line.length < 51) return { classification: 'MALFORMED_RECORD' };
  const cuit = line.slice(0, 11).trim();
  if (!/^\d{11}$/.test(cuit)) return { classification: 'MALFORMED_RECORD' };
  const prefix = cuit.slice(0, 2);
  const rawName = line.slice(11, 41).trim();

  if (prefix === '30' || prefix === '33' || prefix === '34') {
    return { classification: 'NON_PERSON_LEGAL_ENTITY', cuit, entity_name: rawName, prefix, is_person: false };
  }
  if (['20', '27', '23', '24'].includes(prefix)) {
    if (!rawName || rawName.length < 2) {
      return { classification: 'INSUFFICIENT_EVIDENCE', cuit, is_person: true };
    }
    const dni = String(parseInt(cuit.slice(2, 10), 10));
    return { classification: 'CANDIDATE_NATURAL_PERSON', cuit, dni, raw_name: rawName, prefix, is_person: true };
  }
  return { classification: 'OTHER_PREFIX_RECORD', cuit, prefix, raw_name: rawName };
}

async function main() {
  const pgClient = new Client(dbConfig);
  await pgClient.connect();

  try {
    console.log('=== 1. CURRENT POSTGRESQL DB BASELINE ===');
    const t0 = await pgClient.query(`
      SELECT 
        (SELECT COUNT(DISTINCT atlas_person_id) FROM public.atlas_person_identity_map) as canonical_distinct,
        (SELECT COUNT(*) FROM public.atlas_person_identity_map) as identity_map_rows,
        (SELECT COUNT(*) FROM public.atlas_search_outbox) as outbox_total,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'PENDING') as outbox_pending,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING') as outbox_processing,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'PUBLISHED') as outbox_published,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'QUARANTINED') as outbox_quarantined;
    `);
    console.log('Baseline:', t0.rows[0]);

    console.log('\n=== 2. SNAPSHOT PROCESSING RUNS ===');
    const runsRes = await pgClient.query(`
      SELECT * FROM public.atlas_snapshot_processing_runs ORDER BY started_at ASC;
    `);
    console.log(`Runs count: ${runsRes.rowCount}`);
    for (const r of runsRes.rows) {
      console.log(JSON.stringify(r, null, 2));
    }

    console.log('\n=== 3. STAGE 2 CHECKPOINTS ===');
    const ckptsRes = await pgClient.query(`
      SELECT checkpoint_id, job_type, owner_worker_id, saved_at, state
      FROM public.atlas_checkpoints
      WHERE checkpoint_id LIKE 'chk_stage2%'
      ORDER BY saved_at ASC;
    `);
    console.log(`Stage 2 Checkpoints count: ${ckptsRes.rowCount}`);
    const ckptList = ckptsRes.rows.map(r => ({
      checkpoint_id: r.checkpoint_id,
      worker_id: r.owner_worker_id,
      saved_at: r.saved_at,
      evaluated_count: r.state.evaluated_candidate_count,
      raw_offset: r.state.raw_record_offset,
      ordinal: r.state.eligible_candidate_ordinal,
      run_id: r.state.run_id,
      last_key: r.state.last_source_person_key
    }));
    console.log('First 3 checkpoints:', ckptList.slice(0, 3));
    console.log('Last 3 checkpoints:', ckptList.slice(-3));

    console.log('\n=== 4. PHYSICAL CENSUS OF RAW RANGE 10,000 -> 60,000 IN ARCA FILE ===');
    const sourceFilePath = path.resolve('cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp');
    if (!fs.existsSync(sourceFilePath)) {
      throw new Error(`File not found: ${sourceFilePath}`);
    }

    const stream = fs.createReadStream(sourceFilePath, { encoding: 'latin1' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let rawLineNumber = 0; // 1-indexed
    let census = {
      RAW_ROWS_IN_RANGE: 0,
      NATURAL_PERSON_ROWS: 0,
      LEGAL_ENTITY_ROWS: 0,
      MALFORMED_ROWS: 0,
      INSUFFICIENT_EVIDENCE_ROWS: 0,
      OTHER_PREFIX_ROWS: 0,
      DISTINCT_SOURCE_KEYS: 0
    };
    const rangeKeys = new Set();

    // Also track Stage 1 reconstruction (first 10,000 natural persons)
    let s1RawOffset = 0;
    let s1CandidatesCount = 0;
    const stage1Keys = new Set();
    const stage1Items = [];

    // Also track Stage 2 physical scan (next 50,000 natural persons after s1RawOffset)
    let s2RawMinOffset = null;
    let s2RawMaxOffset = null;
    let s2CandidatesCount = 0;
    const stage2KeysFromFile = new Set();
    let s2LegalEntities = 0;
    let s2Malformed = 0;
    let s2Other = 0;

    for await (const line of rl) {
      rawLineNumber++;
      const cl = classifyRecord(line);

      // Census for 10000 <= offset < 60000 (using 0-indexed offset: line 10001 to 60000)
      const offset0Indexed = rawLineNumber - 1;
      if (offset0Indexed >= 10000 && offset0Indexed < 60000) {
        census.RAW_ROWS_IN_RANGE++;
        if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
          census.NATURAL_PERSON_ROWS++;
          rangeKeys.add(cl.cuit);
        } else if (cl.classification === 'NON_PERSON_LEGAL_ENTITY') {
          census.LEGAL_ENTITY_ROWS++;
          rangeKeys.add(cl.cuit);
        } else if (cl.classification === 'MALFORMED_RECORD' || cl.classification === 'INVALID_RECORD') {
          census.MALFORMED_ROWS++;
        } else if (cl.classification === 'INSUFFICIENT_EVIDENCE') {
          census.INSUFFICIENT_EVIDENCE_ROWS++;
          rangeKeys.add(cl.cuit);
        } else if (cl.classification === 'OTHER_PREFIX_RECORD') {
          census.OTHER_PREFIX_ROWS++;
          rangeKeys.add(cl.cuit);
        }
      }

      // Stage 1 Tracking
      if (s1CandidatesCount < 10000) {
        s1RawOffset = rawLineNumber;
        if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
          stage1Keys.add(cl.cuit);
          stage1Items.push({ rawLine: rawLineNumber, cuit: cl.cuit, dni: cl.dni });
          s1CandidatesCount++;
        }
      } else if (s2CandidatesCount < 50000) {
        // Stage 2 Tracking (lines after s1RawOffset)
        if (s2RawMinOffset === null) s2RawMinOffset = rawLineNumber;
        s2RawMaxOffset = rawLineNumber;

        if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
          if (!stage1Keys.has(cl.cuit)) {
            stage2KeysFromFile.add(cl.cuit);
            s2CandidatesCount++;
          }
        } else if (cl.classification === 'NON_PERSON_LEGAL_ENTITY') {
          s2LegalEntities++;
        } else if (cl.classification === 'MALFORMED_RECORD') {
          s2Malformed++;
        } else {
          s2Other++;
        }
      }

      if (rawLineNumber >= 80000 && s2CandidatesCount >= 50000) {
        // Can stop after getting all census and stage 2 data
        break;
      }
    }
    rl.close();

    census.DISTINCT_SOURCE_KEYS = rangeKeys.size;
    console.log('Raw Range [10000..60000) Census:', census);
    console.log(`Stage 1 End Raw Line: ${s1RawOffset}, Candidates: ${stage1Keys.size}`);
    console.log(`Stage 2 Raw Range: [${s2RawMinOffset} .. ${s2RawMaxOffset}], Candidates: ${stage2KeysFromFile.size}`);
    console.log(`Stage 2 Operational Rows in between: Legal Entities = ${s2LegalEntities}, Malformed = ${s2Malformed}, Other = ${s2Other}`);

    console.log('\n=== 5. STAGE 1 & STAGE 2 DB IDENTITY MAPPINGS ===');
    // Query DB for ARCA source mappings
    const arcaMapRes = await pgClient.query(`
      SELECT source_person_id, atlas_person_id, observed_at, resolution_method
      FROM public.atlas_person_identity_map
      WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      ORDER BY observed_at ASC;
    `);
    console.log(`Total ARCA Mappings in DB: ${arcaMapRes.rowCount}`);

    const dbArcaKeys = new Set(arcaMapRes.rows.map(r => r.source_person_id));

    // Overlap between stage 1 keys and stage 2 keys
    let s1s2Intersection = 0;
    for (const k of stage1Keys) {
      if (stage2KeysFromFile.has(k)) {
        s1s2Intersection++;
      }
    }
    console.log(`Set Intersection (Stage 1 Keys ∩ Stage 2 File Keys): ${s1s2Intersection}`);

    // Check timestamps distribution in DB
    const timestampGroups = await pgClient.query(`
      SELECT date_trunc('minute', observed_at) as minute_bucket,
             count(*) as count,
             min(observed_at) as min_ts,
             max(observed_at) as max_ts
      FROM public.atlas_person_identity_map
      WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      GROUP BY date_trunc('minute', observed_at)
      ORDER BY minute_bucket ASC;
    `);
    console.log('ARCA Mapping Timestamp Minute Buckets:');
    for (const b of timestampGroups.rows) {
      console.log(`  Bucket: ${b.minute_bucket.toISOString()} | Count: ${b.count} | Min: ${b.min_ts.toISOString()} | Max: ${b.max_ts.toISOString()}`);
    }

    console.log('\n=== 6. OUTBOX STAGE 2 DISTRIBUTION ===');
    const outboxStage2 = await pgClient.query(`
      SELECT 
        date_trunc('minute', created_at) as created_minute,
        status,
        count(*) as count,
        min(created_at) as min_created,
        max(created_at) as max_created,
        min(published_at) as min_published,
        max(published_at) as max_published
      FROM public.atlas_search_outbox
      WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      GROUP BY date_trunc('minute', created_at), status
      ORDER BY created_minute ASC;
    `);
    console.log('Stage 2 Outbox Buckets:');
    for (const ob of outboxStage2.rows) {
      console.log(`  Created Minute: ${ob.created_minute.toISOString()} | Status: ${ob.status} | Count: ${ob.count} | Min Created: ${ob.min_created.toISOString()} | Max Created: ${ob.max_created.toISOString()} | Min Pub: ${ob.min_published?.toISOString()} | Max Pub: ${ob.max_published?.toISOString()}`);
    }

  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
