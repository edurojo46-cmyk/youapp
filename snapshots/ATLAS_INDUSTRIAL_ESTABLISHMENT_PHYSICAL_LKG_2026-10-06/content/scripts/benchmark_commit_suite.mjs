import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

function toPrebuiltTsvector(text) {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  const unique = [...new Set(words)];
  return unique.map((w, idx) => `'${w}':${idx + 1}`).join(' ');
}

function generateCandidates(count, prefix = 'bench') {
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const rawId = `${prefix}:${i}:${crypto.randomUUID()}`;
    const hashHex = crypto.createHash('sha256').update(rawId).digest('hex');
    const personId = `per_${prefix}_${hashHex.slice(0, 16)}`;
    const name = `Persona ${prefix} ${i}`;
    candidates.push({
      person_id: personId,
      identity_hash_hex: hashHex,
      display_name: name,
      normalized_name: name.toUpperCase(),
      organization: 'Sociedad Anónima Comercial',
      role: 'Director Titular',
      profession: 'Empresario',
      geography_id: 'CABA',
      source_id: 'SRC_BENCHMARK',
      source_url: 'https://benchmark.internal',
      fetched_at: new Date().toISOString(),
      remote_response_hash: hashHex,
      raw_record_id: rawId,
      raw_provenance_reference: `bench:${rawId}`,
      parser_version: 'bench_v2',
      extraction_timestamp: new Date().toISOString(),
      geo_evidence: 'CABA Institutional Origin',
      qualification_evidence: 'Director Titular IGJ CABA'
    });
  }
  return candidates;
}

// Method 1: Atomic CTE Dual Insert
async function commitAtomicCte(client, candidates) {
  const canIds = [];
  const canHashes = [];
  const canNames = [];
  const canOrgs = [];
  const canRoles = [];
  const canProfs = [];
  const canGeos = [];
  const canEvidences = [];

  const searchDocIds = [];
  const searchCanIds = [];
  const searchNames = [];
  const searchNorms = [];
  const searchOrgs = [];
  const searchRoles = [];
  const searchProfs = [];
  const searchGeos = [];
  const searchVectors = [];

  for (const c of candidates) {
    canIds.push(c.person_id);
    canHashes.push(Buffer.from(c.identity_hash_hex, 'hex'));
    canNames.push(c.display_name);
    canOrgs.push(c.organization);
    canRoles.push(c.role);
    canProfs.push(c.profession);
    canGeos.push(c.geography_id);
    canEvidences.push(JSON.stringify({ s: c.source_id }));

    searchDocIds.push(`doc_${c.person_id}`);
    searchCanIds.push(c.person_id);
    searchNames.push(c.display_name);
    searchNorms.push(c.normalized_name);
    searchOrgs.push(c.organization);
    searchRoles.push(c.role);
    searchProfs.push(c.profession);
    searchGeos.push(c.geography_id);
    searchVectors.push(toPrebuiltTsvector(`${c.display_name} ${c.organization} ${c.role} ${c.geography_id}`));
  }

  const query = `
    WITH ins_can AS (
      INSERT INTO atlas_shadow.atlas_canonical_persons_v2 (
        atlas_person_id, primary_identity_hash, display_name, primary_organization, primary_role, primary_profession, geography_id, qualification_state, activity_state, evidence_summary, first_committed_at, last_seen_at
      )
      SELECT
        u.id, u.hash, u.name, u.org, u.role, u.prof, u.geo, 'QUALIFIED', 'ACTIVE', u.ev, clock_timestamp(), clock_timestamp()
      FROM UNNEST(
        $1::text[], $2::bytea[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]
      ) AS u(id, hash, name, org, role, prof, geo, ev)
      ON CONFLICT (atlas_person_id) DO NOTHING
    )
    INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 (
      document_id, canonical_id, full_name, normalized_name, organization, role, profession, geography_id, qualification_state, search_vector, created_at
    )
    SELECT
      u.doc_id, u.can_id, u.name, u.norm, u.org, u.role, u.prof, u.geo, 'QUALIFIED', u.vec::tsvector, clock_timestamp()
    FROM UNNEST(
      $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[], $15::text[], $16::text[], $17::text[]
    ) AS u(doc_id, can_id, name, norm, org, role, prof, geo, vec)
    ON CONFLICT (document_id) DO NOTHING;
  `;

  await client.query(query, [
    canIds, canHashes, canNames, canOrgs, canRoles, canProfs, canGeos, canEvidences,
    searchDocIds, searchCanIds, searchNames, searchNorms, searchOrgs, searchRoles, searchProfs, searchGeos, searchVectors
  ]);
}

// Method 2: Vectorized Sequential UNNEST
async function commitSequentialUnnest(client, candidates) {
  const canIds = [];
  const canHashes = [];
  const canNames = [];
  const canOrgs = [];
  const canRoles = [];
  const canProfs = [];
  const canGeos = [];
  const canEvidences = [];

  const searchDocIds = [];
  const searchCanIds = [];
  const searchNames = [];
  const searchNorms = [];
  const searchOrgs = [];
  const searchRoles = [];
  const searchProfs = [];
  const searchGeos = [];
  const searchVectors = [];

  for (const c of candidates) {
    canIds.push(c.person_id);
    canHashes.push(Buffer.from(c.identity_hash_hex, 'hex'));
    canNames.push(c.display_name);
    canOrgs.push(c.organization);
    canRoles.push(c.role);
    canProfs.push(c.profession);
    canGeos.push(c.geography_id);
    canEvidences.push(JSON.stringify({ s: c.source_id }));

    searchDocIds.push(`doc_${c.person_id}`);
    searchCanIds.push(c.person_id);
    searchNames.push(c.display_name);
    searchNorms.push(c.normalized_name);
    searchOrgs.push(c.organization);
    searchRoles.push(c.role);
    searchProfs.push(c.profession);
    searchGeos.push(c.geography_id);
    searchVectors.push(toPrebuiltTsvector(`${c.display_name} ${c.organization} ${c.role} ${c.geography_id}`));
  }

  await client.query(`
    INSERT INTO atlas_shadow.atlas_canonical_persons_v2 (
      atlas_person_id, primary_identity_hash, display_name, primary_organization, primary_role, primary_profession, geography_id, qualification_state, activity_state, evidence_summary, first_committed_at, last_seen_at
    )
    SELECT
      u.id, u.hash, u.name, u.org, u.role, u.prof, u.geo, 'QUALIFIED', 'ACTIVE', u.ev, clock_timestamp(), clock_timestamp()
    FROM UNNEST(
      $1::text[], $2::bytea[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]
    ) AS u(id, hash, name, org, role, prof, geo, ev)
    ON CONFLICT (atlas_person_id) DO NOTHING;
  `, [canIds, canHashes, canNames, canOrgs, canRoles, canProfs, canGeos, canEvidences]);

  await client.query(`
    INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 (
      document_id, canonical_id, full_name, normalized_name, organization, role, profession, geography_id, qualification_state, search_vector, created_at
    )
    SELECT
      u.doc_id, u.can_id, u.name, u.norm, u.org, u.role, u.prof, u.geo, 'QUALIFIED', u.vec::tsvector, clock_timestamp()
    FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[]
    ) AS u(doc_id, can_id, name, norm, org, role, prof, geo, vec)
    ON CONFLICT (document_id) DO NOTHING;
  `, [searchDocIds, searchCanIds, searchNames, searchNorms, searchOrgs, searchRoles, searchProfs, searchGeos, searchVectors]);
}

// Method 3: Staging UNNEST + Set-Based Merge
async function commitStagingMerge(client, candidates) {
  const canIds = [];
  const canHashes = [];
  const canNames = [];
  const canOrgs = [];
  const canRoles = [];
  const canProfs = [];
  const canGeos = [];
  const canEvidences = [];
  const searchVectors = [];

  for (const c of candidates) {
    canIds.push(c.person_id);
    canHashes.push(c.identity_hash_hex);
    canNames.push(c.display_name);
    canOrgs.push(c.organization);
    canRoles.push(c.role);
    canProfs.push(c.profession);
    canGeos.push(c.geography_id);
    canEvidences.push(JSON.stringify({ s: c.source_id }));
    searchVectors.push(toPrebuiltTsvector(`${c.display_name} ${c.organization} ${c.role} ${c.geography_id}`));
  }

  const mergeSql = `
    WITH raw_stage AS (
      SELECT
        u.id, decode(u.hash, 'hex') AS hash_bytes, u.name, u.org, u.role, u.prof, u.geo, u.ev, u.vec::tsvector AS vec
      FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[]
      ) AS u(id, hash, name, org, role, prof, geo, ev, vec)
    ),
    ins_can AS (
      INSERT INTO atlas_shadow.atlas_canonical_persons_v2 (
        atlas_person_id, primary_identity_hash, display_name, primary_organization, primary_role, primary_profession, geography_id, qualification_state, activity_state, evidence_summary, first_committed_at, last_seen_at
      )
      SELECT
        id, hash_bytes, name, org, role, prof, geo, 'QUALIFIED', 'ACTIVE', ev, clock_timestamp(), clock_timestamp()
      FROM raw_stage
      ON CONFLICT (atlas_person_id) DO NOTHING
    )
    INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 (
      document_id, canonical_id, full_name, normalized_name, organization, role, profession, geography_id, qualification_state, search_vector, created_at
    )
    SELECT
      'doc_' || id, id, name, UPPER(name), org, role, prof, geo, 'QUALIFIED', vec, clock_timestamp()
    FROM raw_stage
    ON CONFLICT (document_id) DO NOTHING;
  `;

  await client.query(mergeSql, [
    canIds, canHashes, canNames, canOrgs, canRoles, canProfs, canGeos, canEvidences, searchVectors
  ]);
}

async function runBenchmark() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BENCHMARK SUITE: COMMIT PATHS, BATCH SIZES & COMMITTERS');
  console.log('════════════════════════════════════════════════════════════════');

  const pool = new pg.Pool({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false },
    max: 20
  });

  pool.on('connect', (client) => {
    client.query('SET synchronous_commit = off; SET statement_timeout = 60000;').catch(() => {});
  });

  const setupClient = await pool.connect();
  try {
    console.log('Resetting cold test state in atlas_shadow...');
    await setupClient.query('TRUNCATE atlas_shadow.atlas_canonical_persons_v2 CASCADE;');
    await setupClient.query('TRUNCATE atlas_shadow.atlas_argentina_people_search_v1 CASCADE;');
    await setupClient.query('ALTER TABLE atlas_shadow.atlas_canonical_persons_v2 SET (autovacuum_enabled = false);');
    await setupClient.query('ALTER TABLE atlas_shadow.atlas_argentina_people_search_v1 SET (autovacuum_enabled = false);');
    await setupClient.query('DROP INDEX IF EXISTS atlas_shadow.idx_shadow_search_trgm;');
    await setupClient.query('ALTER INDEX atlas_shadow.idx_shadow_search_vector SET (fastupdate = on, gin_pending_list_limit = 65536);');
    console.log('✓ Tables truncated and cold state initialized.');
  } finally {
    setupClient.release();
  }

  const batchSizes = [500, 1000, 2000, 5000];
  const methods = [
    { name: 'Atomic CTE Dual Insert', fn: commitAtomicCte },
    { name: 'Vectorized Sequential UNNEST', fn: commitSequentialUnnest },
    { name: 'Staging UNNEST Set-Based Merge', fn: commitStagingMerge }
  ];

  console.log('\n--- PART A: METHOD & BATCH SIZE COMPARISON (Single Committer) ---');
  for (const m of methods) {
    console.log(`\nMethod: ${m.name}`);
    for (const bSize of batchSizes) {
      const candidates = generateCandidates(bSize, `test_${bSize}`);
      const client = await pool.connect();
      try {
        const t0 = performance.now();
        await m.fn(client, candidates);
        const dt = performance.now() - t0;
        const rate = (bSize / (dt / 1000)).toFixed(1);
        console.log(`  Batch: ${bSize.toString().padStart(4)} | Latency: ${dt.toFixed(1).padStart(7)} ms | Throughput: ${rate.padStart(7)} rows/sec`);
      } catch (err) {
        console.log(`  Batch: ${bSize.toString().padStart(4)} | ERROR: ${err.message}`);
      } finally {
        client.release();
      }
    }
  }

  console.log('\n--- PART B: CONCURRENCY BENCHMARK (8 vs 10 vs 12 Committers) ---');
  // We'll test with the best batch size (500 and 1000) using Atomic CTE
  for (const bSize of [500, 1000]) {
    for (const wCount of [8, 10, 12]) {
      const batchesPerWorker = 3;
      const totalRows = wCount * bSize * batchesPerWorker;
      
      const clientPromises = Array.from({ length: wCount }, async (wId) => {
        const client = await pool.connect();
        const lats = [];
        try {
          for (let b = 0; b < batchesPerWorker; b++) {
            const cands = generateCandidates(bSize, `w${wCount}_b${bSize}_w${wId}_b${b}`);
            const t0 = performance.now();
            await commitAtomicCte(client, cands);
            lats.push(performance.now() - t0);
          }
          return lats;
        } finally {
          client.release();
        }
      });

      const start = performance.now();
      const allLats = (await Promise.all(clientPromises)).flat().sort((a, b) => a - b);
      const totalSec = (performance.now() - start) / 1000;
      const sustainedRate = (totalRows / totalSec).toFixed(1);
      const p50 = allLats[Math.floor(allLats.length * 0.50)].toFixed(1);
      const p95 = allLats[Math.floor(allLats.length * 0.95)].toFixed(1);

      console.log(`Committers: ${wCount.toString().padStart(2)} | Batch: ${bSize.toString().padStart(4)} | Total Rows: ${totalRows.toString().padStart(5)} | Time: ${totalSec.toFixed(2)}s | Rate: ${sustainedRate.padStart(6)}/sec | P50: ${p50}ms | P95: ${p95}ms`);
    }
  }

  await pool.end();
}

runBenchmark().catch(console.error);
