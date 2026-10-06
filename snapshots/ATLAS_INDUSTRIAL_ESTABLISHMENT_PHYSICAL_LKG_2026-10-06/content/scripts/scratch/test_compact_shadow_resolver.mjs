import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = process.env.SOURCE_FILE_PATH || 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('🔬 STRUCTURAL SHADOW EXPERIMENT: COMPACT HOT RESOLVER VS CURRENT');
  console.log('================================================================\n');

  try {
    // 1. Setup disposable tables
    console.log('Creating disposable comparison structures...');
    await client.query(`
      DROP TABLE IF EXISTS disposable_current_identity_map CASCADE;
      CREATE UNLOGGED TABLE disposable_current_identity_map (
        atlas_person_id text,
        source_id text,
        source_person_id text,
        identifier_type text,
        identifier_value text,
        evidence_id text,
        confidence numeric,
        resolution_method text,
        observed_at timestamptz,
        CONSTRAINT uq_disp_curr_src UNIQUE (source_id, source_person_id)
      );
      CREATE INDEX idx_disp_curr_id ON disposable_current_identity_map (identifier_type, identifier_value);

      DROP TABLE IF EXISTS disposable_compact_source_map CASCADE;
      CREATE UNLOGGED TABLE disposable_compact_source_map (
        source_id text,
        source_person_id text,
        atlas_person_id text,
        PRIMARY KEY (source_id, source_person_id)
      );

      DROP TABLE IF EXISTS disposable_compact_national_id_map CASCADE;
      CREATE UNLOGGED TABLE disposable_compact_national_id_map (
        identifier_value text PRIMARY KEY,
        atlas_person_id text
      );

      DROP TABLE IF EXISTS disposable_wide_observation_log CASCADE;
      CREATE UNLOGGED TABLE disposable_wide_observation_log (
        atlas_person_id text,
        evidence_id text,
        confidence numeric,
        resolution_method text,
        observed_at timestamptz
      );
    `);

    // Load 10,000 candidates
    console.log('Loading 10,000 candidates for comparison...');
    const candidates = [];
    for await (const batch of streamChunkedCandidates(SOURCE_FILE, { startLine: 3650000, limit: 10000, batchSize: 2000 })) {
      candidates.push(...batch);
      if (candidates.length >= 10000) break;
    }
    const cohort = candidates.slice(0, 10000);

    const source_person_ids = cohort.map(c => c.source_person_id);
    const identifier_values = cohort.map(c => c.identifier_value);
    const atlas_person_ids = cohort.map(() => 'atlas_exp_' + crypto.randomBytes(8).toString('hex'));
    const evidence_ids = cohort.map(c => 'ev_exp_' + c.source_person_id);
    const confidences = cohort.map(() => 1.0);
    const resolutions = cohort.map(() => 'DETERMINISTIC');

    // TEST A: Current Wide Structure Insertion
    console.log('Benchmarking Current Wide Schema (10,000 records)...');
    const t0Curr = performance.now();
    await client.query(`
      INSERT INTO disposable_current_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, observed_at
      )
      SELECT
        u.a_id, 'ARCA_CONDICION_TRIBUTARIA', u.s_pid, 'NATIONAL_IDENTITY_HMAC', u.i_val,
        u.e_id, u.conf, u.res, NOW()
      FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::text[]
      ) AS u(a_id, s_pid, i_val, e_id, conf, res)
      ON CONFLICT (source_id, source_person_id) DO NOTHING;
    `, [atlas_person_ids, source_person_ids, identifier_values, evidence_ids, confidences, resolutions]);
    const currInsertMs = performance.now() - t0Curr;

    // Current Lookup
    const t0CurrLookup = performance.now();
    await client.query(`
      SELECT identifier_value, atlas_person_id
      FROM disposable_current_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
    `, [identifier_values.slice(0, 500)]);
    const currLookupMs = performance.now() - t0CurrLookup;

    const currSizeRes = await client.query(`
      SELECT 
        pg_total_relation_size('disposable_current_identity_map') AS total_bytes,
        pg_indexes_size('disposable_current_identity_map') AS index_bytes,
        pg_relation_size('disposable_current_identity_map') AS table_bytes;
    `);

    // TEST B: Compact Shadow Architecture Insertion
    console.log('Benchmarking Compact Shadow Architecture (10,000 records)...');
    const t0Comp = performance.now();
    // 1. Source map insert
    await client.query(`
      INSERT INTO disposable_compact_source_map (source_id, source_person_id, atlas_person_id)
      SELECT 'ARCA_CONDICION_TRIBUTARIA', u.s_pid, u.a_id
      FROM UNNEST($1::text[], $2::text[]) AS u(s_pid, a_id)
      ON CONFLICT (source_id, source_person_id) DO NOTHING;
    `, [source_person_ids, atlas_person_ids]);

    // 2. Compact national identity HMAC map insert
    await client.query(`
      INSERT INTO disposable_compact_national_id_map (identifier_value, atlas_person_id)
      SELECT u.i_val, u.a_id
      FROM UNNEST($1::text[], $2::text[]) AS u(i_val, a_id)
      ON CONFLICT (identifier_value) DO NOTHING;
    `, [identifier_values, atlas_person_ids]);

    // 3. Wide observation log insert (append-only, unindexed)
    await client.query(`
      INSERT INTO disposable_wide_observation_log (atlas_person_id, evidence_id, confidence, resolution_method, observed_at)
      SELECT u.a_id, u.e_id, u.conf, u.res, NOW()
      FROM UNNEST($1::text[], $2::text[], $3::numeric[], $4::text[]) AS u(a_id, e_id, conf, res);
    `, [atlas_person_ids, evidence_ids, confidences, resolutions]);
    const compInsertMs = performance.now() - t0Comp;

    // Compact Lookup
    const t0CompLookup = performance.now();
    await client.query(`
      SELECT identifier_value, atlas_person_id
      FROM disposable_compact_national_id_map
      WHERE identifier_value = ANY($1::text[])
    `, [identifier_values.slice(0, 500)]);
    const compLookupMs = performance.now() - t0CompLookup;

    const compSizeRes = await client.query(`
      SELECT 
        (pg_total_relation_size('disposable_compact_source_map') + 
         pg_total_relation_size('disposable_compact_national_id_map') + 
         pg_total_relation_size('disposable_wide_observation_log')) AS total_bytes,
        (pg_indexes_size('disposable_compact_source_map') + 
         pg_indexes_size('disposable_compact_national_id_map') + 
         pg_indexes_size('disposable_wide_observation_log')) AS index_bytes;
    `);

    // Clean up disposable tables
    await client.query(`
      DROP TABLE IF EXISTS disposable_current_identity_map CASCADE;
      DROP TABLE IF EXISTS disposable_compact_source_map CASCADE;
      DROP TABLE IF EXISTS disposable_compact_national_id_map CASCADE;
      DROP TABLE IF EXISTS disposable_wide_observation_log CASCADE;
    `);

    const currTotalBytes = parseInt(currSizeRes.rows[0].total_bytes, 10);
    const currIndexBytes = parseInt(currSizeRes.rows[0].index_bytes, 10);
    const compTotalBytes = parseInt(compSizeRes.rows[0].total_bytes, 10);
    const compIndexBytes = parseInt(compSizeRes.rows[0].index_bytes, 10);

    const insertSpeedup = Number((currInsertMs / compInsertMs).toFixed(2));
    const lookupSpeedup = Number((currLookupMs / compLookupMs).toFixed(2));
    const indexFootprintReduction = Number((((currIndexBytes - compIndexBytes) / currIndexBytes) * 100).toFixed(2));

    const currCandSec = Number((10000 / (currInsertMs / 1000)).toFixed(2));
    const compCandSec = Number((10000 / (compInsertMs / 1000)).toFixed(2));

    const report = {
      TIMESTAMP: new Date().toISOString(),
      COHORT_SIZE: 10000,
      CURRENT_WIDE_SCHEMA: {
        INSERT_MS: Number(currInsertMs.toFixed(2)),
        LOOKUP_MS: Number(currLookupMs.toFixed(2)),
        INDEX_SIZE_BYTES: currIndexBytes,
        TOTAL_SIZE_BYTES: currTotalBytes,
        CAND_SEC: currCandSec
      },
      COMPACT_SHADOW_SCHEMA: {
        INSERT_MS: Number(compInsertMs.toFixed(2)),
        LOOKUP_MS: Number(compLookupMs.toFixed(2)),
        INDEX_SIZE_BYTES: compIndexBytes,
        TOTAL_SIZE_BYTES: compTotalBytes,
        CAND_SEC: compCandSec
      },
      INSERT_SPEEDUP: `${insertSpeedup}x`,
      LOOKUP_SPEEDUP: `${lookupSpeedup}x`,
      INDEX_FOOTPRINT_REDUCTION: `${indexFootprintReduction}%`,
      GAIN_IS_MATERIAL: insertSpeedup >= 1.10
    };

    console.log('\n================================================================');
    console.log('🏆 COMPACT SHADOW EXPERIMENT RESULTS');
    console.log('================================================================');
    console.log(`CURRENT_INSERT_MS         : ${report.CURRENT_WIDE_SCHEMA.INSERT_MS} ms (${report.CURRENT_WIDE_SCHEMA.CAND_SEC} cand/s)`);
    console.log(`COMPACT_INSERT_MS         : ${report.COMPACT_SHADOW_SCHEMA.INSERT_MS} ms (${report.COMPACT_SHADOW_SCHEMA.CAND_SEC} cand/s)`);
    console.log(`INSERT_SPEEDUP            : ${report.INSERT_SPEEDUP}`);
    console.log(`CURRENT_LOOKUP_MS         : ${report.CURRENT_WIDE_SCHEMA.LOOKUP_MS} ms`);
    console.log(`COMPACT_LOOKUP_MS         : ${report.COMPACT_SHADOW_SCHEMA.LOOKUP_MS} ms`);
    console.log(`LOOKUP_SPEEDUP            : ${report.LOOKUP_SPEEDUP}`);
    console.log(`INDEX_FOOTPRINT_REDUCTION : ${report.INDEX_FOOTPRINT_REDUCTION}`);
    console.log(`GAIN_IS_MATERIAL (>=10%)  : ${report.GAIN_IS_MATERIAL}`);
    console.log('================================================================\n');

    fs.writeFileSync('reports/atlas/discovery/atlas_compact_shadow_experiment.json', JSON.stringify(report, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Compact experiment error:', err);
  process.exit(1);
});
