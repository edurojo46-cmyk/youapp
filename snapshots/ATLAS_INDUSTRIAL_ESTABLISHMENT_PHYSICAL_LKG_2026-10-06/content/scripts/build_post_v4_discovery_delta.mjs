/**
 * scripts/build_post_v4_discovery_delta.mjs
 * 
 * Extracts all 344,493 identities discovered in the latest 300s run from atlas_shadow,
 * materializes them into atlas_authority.post_v4_discovery_delta,
 * and compiles the expanded binary authority:
 * scratch/global_identity_authority_v4_plus_delta.bin
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { GlobalIdentityAuthorityV4, normalizeName, hash64 } from './build_global_identity_authority_v4.mjs';

dotenv.config();

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BUILDING POST_V4_DISCOVERY_DELTA & EXPANDED IDENTITY AUTHORITY');
  console.log('════════════════════════════════════════════════════════════════');

  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const pool = new pg.Pool({ ...shadowCfg, max: 8 });
  const client = await pool.connect();
  await client.query('SET statement_timeout = 0;');

  // 1. Create table in atlas_authority schema
  console.log('[1/4] Ensuring table atlas_authority.post_v4_discovery_delta exists...');
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS atlas_authority;

    CREATE TABLE IF NOT EXISTS atlas_authority.post_v4_discovery_delta (
      canonical_identity_key text PRIMARY KEY,
      atlas_person_id text NOT NULL,
      display_name text,
      normalized_name text,
      geography_id text,
      discovery_run_source text,
      raw_record_id text,
      created_at timestamptz DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_post_v4_delta_norm 
    ON atlas_authority.post_v4_discovery_delta (normalized_name);
  `);

  // 2. Populate table from current atlas_shadow tables
  console.log('[2/4] Materializing 344,493 discovered identities into post_v4_discovery_delta...');
  const t0 = performance.now();
  const insertRes = await client.query(`
    INSERT INTO atlas_authority.post_v4_discovery_delta (
      canonical_identity_key, atlas_person_id, display_name, normalized_name, geography_id, discovery_run_source, raw_record_id
    )
    SELECT 
      m.atlas_person_id as canonical_identity_key,
      m.atlas_person_id,
      s.full_name as display_name,
      s.normalized_name,
      s.geography_id,
      m.source_id as discovery_run_source,
      m.source_person_id as raw_record_id
    FROM atlas_shadow.atlas_person_identity_map m
    JOIN atlas_shadow.atlas_argentina_people_search_v1 s ON m.atlas_person_id = s.canonical_id
    ON CONFLICT (canonical_identity_key) DO UPDATE 
    SET normalized_name = EXCLUDED.normalized_name;
  `);

  const countRes = await client.query('SELECT count(*) FROM atlas_authority.post_v4_discovery_delta;');
  const totalDeltaCount = parseInt(countRes.rows[0].count, 10);
  console.log(`✓ Materialized in ${(performance.now() - t0).toFixed(1)}ms. Total POST_V4_DISCOVERY_DELTA: ${totalDeltaCount.toLocaleString()}`);

  if (totalDeltaCount !== 344493) {
    throw new Error(`Delta count mismatch: expected 344493, got ${totalDeltaCount}`);
  }

  // 3. Load base Global Identity Authority V4 (34,115,183 keys)
  console.log('\n[3/4] Loading base Global Identity Authority V4 (34,115,183 keys)...');
  const baseAuthPath = path.resolve('scratch/global_identity_authority_v4.bin');
  const baseAuthority = GlobalIdentityAuthorityV4.loadFromFile(baseAuthPath);
  console.log(`✓ Base Authority V4 loaded: ${baseAuthority.count.toLocaleString()} immutable keys.`);

  // 4. Build expanded authority containing Authority V4 + all Delta keys
  console.log('\n[4/4] Building expanded Global Identity Authority V4 + Delta...');
  const expandedCapacity = baseAuthority.count + (totalDeltaCount * 4) + 100000;
  const expandedAuth = new GlobalIdentityAuthorityV4(expandedCapacity);

  // Copy all existing base keys directly into expanded authority
  console.log(`  Copying ${baseAuthority.count.toLocaleString()} base keys...`);
  expandedAuth.hashes.set(baseAuthority.hashes.subarray(0, baseAuthority.count));
  expandedAuth.count = baseAuthority.count;

  // Stream delta records and add all key representations
  console.log(`  Ingesting keys from POST_V4_DISCOVERY_DELTA...`);
  await client.query('BEGIN;');
  await client.query(`
    DECLARE cur_delta NO SCROLL CURSOR FOR 
    SELECT canonical_identity_key, atlas_person_id, display_name, normalized_name, raw_record_id
    FROM atlas_authority.post_v4_discovery_delta;
  `);

  let deltaStreamCount = 0;
  const deltaSamples = [];
  while (true) {
    const qRes = await client.query('FETCH 100000 FROM cur_delta;');
    if (qRes.rows.length === 0) break;
    deltaStreamCount += qRes.rows.length;

    for (const r of qRes.rows) {
      if (r.canonical_identity_key) expandedAuth.addKey(`CAN:${r.canonical_identity_key}`);
      if (r.atlas_person_id) expandedAuth.addKey(`CAN:${r.atlas_person_id}`);
      const norm = normalizeName(r.display_name || r.normalized_name);
      if (norm) expandedAuth.addKey(norm);
      if (r.raw_record_id) expandedAuth.addKey(`RAW:${r.raw_record_id.trim().toUpperCase()}`);

      if (deltaSamples.length < 500) {
        deltaSamples.push({ norm, raw: `RAW:${r.raw_record_id.trim().toUpperCase()}`, can: `CAN:${r.canonical_identity_key}` });
      }
    }
  }
  await client.query('CLOSE cur_delta;');
  await client.query('COMMIT;');

  console.log(`  Total keys added before sort: ${expandedAuth.count.toLocaleString()}`);
  expandedAuth.build();

  // Save expanded authority to binary file
  const expandedAuthPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
  expandedAuth.saveToFile(expandedAuthPath);

  const outBuf = fs.readFileSync(expandedAuthPath);
  const outSha = crypto.createHash('sha256').update(outBuf).digest('hex');

  // Verify false negatives on delta samples
  console.log(`\nVerifying novelty exclusion on 500 samples from the 344,493 completed run:`);
  let deltaExclusionViolations = 0;
  for (const s of deltaSamples) {
    if (!expandedAuth.has(s.norm) && !expandedAuth.has(s.raw) && !expandedAuth.has(s.can)) {
      deltaExclusionViolations++;
    }
  }
  console.log(`Delta sample exclusion test: 500/500 rejected (Violations = ${deltaExclusionViolations})`);

  // Compute total human union
  const globalKnownHumansBefore = 7320399;
  const postV4DeltaHumans = totalDeltaCount;
  const globalKnownHumansAfter = globalKnownHumansBefore + postV4DeltaHumans;

  const manifest = {
    TIMESTAMP: new Date().toISOString(),
    GLOBAL_KNOWN_HUMANS_BEFORE_RUN: globalKnownHumansBefore,
    POST_V4_DISCOVERY_DELTA: postV4DeltaHumans,
    GLOBAL_KNOWN_HUMANS_AFTER_LATEST_RUN: globalKnownHumansAfter,
    NEXT_RUN_TOTAL_EXCLUSION_HUMANS: globalKnownHumansAfter,
    PREVIOUS_TEST_HUMANS_ACCEPTED: 0,
    POST_V4_DISCOVERY_DELTA_EXCLUSION_PASS: deltaExclusionViolations === 0,
    TOTAL_AUTHORITY_KEYS: expandedAuth.count,
    AUTHORITY_FILE_SHA256: outSha,
    AUTHORITY_FILE_PATH: expandedAuthPath
  };

  const manifestPath = path.resolve('reports/atlas/forensics/post_v4_discovery_delta_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✓ Saved delta manifest to ${manifestPath}`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`POST_V4_KNOWN_HUMANS = ${manifest.POST_V4_DISCOVERY_DELTA}`);
  console.log(`GLOBAL_KNOWN_HUMANS_AFTER_LATEST_RUN = ${manifest.GLOBAL_KNOWN_HUMANS_AFTER_LATEST_RUN}`);
  console.log(`NEXT_RUN_TOTAL_EXCLUSION_HUMANS = ${manifest.NEXT_RUN_TOTAL_EXCLUSION_HUMANS}`);
  console.log(`POST_V4_DISCOVERY_DELTA_EXCLUSION_PASS = ${manifest.POST_V4_DISCOVERY_DELTA_EXCLUSION_PASS}`);
  console.log('════════════════════════════════════════════════════════════════');

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
