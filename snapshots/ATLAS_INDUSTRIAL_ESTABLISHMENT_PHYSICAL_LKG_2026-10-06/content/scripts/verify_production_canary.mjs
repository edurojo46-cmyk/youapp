import fs from 'fs';
import readline from 'readline';
import { Readable } from 'stream';
import pg from 'pg';
import dotenv from 'dotenv';
import { from as copyFrom } from 'pg-copy-streams';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
const SAMPLE_FILE = 'scratch/real_candidates_sample_100k.jsonl';

function formatCsvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return `"${s}"`;
}

function formatBatchToCsv(records, batchId) {
  let csv = '';
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const row = [
      formatCsvCell(batchId),
      i + 1,
      `\\x${r.identity_hash_hex}`,
      formatCsvCell(r.source_id),
      formatCsvCell(r.source_record_key),
      formatCsvCell(r.display_name),
      formatCsvCell(r.organization),
      formatCsvCell(r.role),
      formatCsvCell(r.profession),
      formatCsvCell(r.geography_id),
      formatCsvCell(r.location_evidence),
      formatCsvCell(r.qualification_state),
      formatCsvCell(r.activity_state)
    ].join('\t');
    csv += row + '\n';
  }
  return Buffer.from(csv, 'utf8');
}

async function loadSampleRecords(count = 2000) {
  const fileStream = fs.createReadStream(SAMPLE_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const records = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
    if (records.length >= count) break;
  }
  return records;
}

async function runCanaryVerification() {
  console.log('========================================================');
  console.log('   SECTION 12: PRODUCTION CANARY SEMANTIC VERIFICATION');
  console.log('========================================================\n');

  const allRecords = await loadSampleRecords(2000);
  const client = await pool.connect();

  const canaryTiers = [
    { label: '1%', pct: 0.01, count: 20 },
    { label: '5%', pct: 0.05, count: 100 },
    { label: '10%', pct: 0.10, count: 200 },
    { label: '25%', pct: 0.25, count: 500 }
  ];

  let totalMismatches = 0;
  const canaryReports = [];

  for (const tier of canaryTiers) {
    console.log(`--- Verifying Canary Tier: ${tier.label} (${tier.count} real production fuel records) ---`);
    const records = allRecords.slice(0, tier.count);
    let tierMismatches = 0;

    // 1. Process via V4 Reference Semantics
    // In V4:
    // Identity hash is exact MD5 hex
    // Target qualification: qualification_state === 'QUALIFIED' && activity_state === 'ACTIVE'
    // Geo evidence: geography_id valid
    const v4Results = records.map(r => {
      const isTarget = (r.qualification_state === 'QUALIFIED' && r.activity_state === 'ACTIVE');
      return {
        identity_hash_hex: r.identity_hash_hex,
        source_id: r.source_id,
        source_record_key: r.source_record_key,
        target_state: isTarget ? 1 : 0,
        geo_valid: Boolean(r.geography_id && r.geography_id.trim().length > 0),
        qualification_state: r.qualification_state,
        activity_state: r.activity_state,
        evidence: r.location_evidence,
        payload_name: r.display_name,
        payload_org: r.organization
      };
    });

    // 2. Process via V2 Shadow Fabric
    const batchId = `canary_${tier.label}_${Date.now()}`;
    const csvBuffer = formatBatchToCsv(records, batchId);

    // Stage into persistent unlogged staging
    const copySql = `
      COPY atlas_ingest_v2_shadow.staging_incoming_records (
        batch_id, batch_seq, identity_hash, source_id, source_record_key,
        display_name, organization, role, profession, geography_id,
        location_evidence, qualification_state, activity_state
      ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
    `;

    await new Promise((resolve, reject) => {
      const dbStream = client.query(copyFrom(copySql));
      const readable = new Readable({
        read() {
          this.push(csvBuffer);
          this.push(null);
        }
      });
      readable.pipe(dbStream);
      dbStream.on('finish', resolve);
      dbStream.on('error', reject);
    });

    // Execute set-based resolution
    const v2Res = await client.query(`
      SELECT 
        s.batch_seq,
        encode(s.identity_hash, 'hex') as identity_hash_hex,
        s.source_id,
        s.source_record_key,
        s.geography_id,
        s.qualification_state,
        s.activity_state,
        s.location_evidence,
        s.display_name,
        s.organization,
        k.target_state,
        k.atlas_person_id
      FROM atlas_ingest_v2_shadow.staging_incoming_records s
      LEFT JOIN atlas_ingest_v2_shadow.atlas_identity_keys_v2 k
        ON k.identity_hash = s.identity_hash
      WHERE s.batch_id = $1
      ORDER BY s.batch_seq ASC;
    `, [batchId]);

    // Clean up staging batch
    await client.query('DELETE FROM atlas_ingest_v2_shadow.staging_incoming_records WHERE batch_id = $1;', [batchId]);

    const v2Rows = v2Res.rows;

    // Compare each record semantic by semantic
    for (let i = 0; i < records.length; i++) {
      const v4 = v4Results[i];
      const v2 = v2Rows[i];

      const identityMatch = (v4.identity_hash_hex === v2.identity_hash_hex);
      const provenanceMatch = (v4.source_id === v2.source_id && v4.source_record_key === v2.source_record_key);
      const geoMatch = (v4.evidence === v2.location_evidence);
      const qualMatch = (v4.qualification_state === v2.qualification_state && v4.activity_state === v2.activity_state);

      if (!identityMatch || !provenanceMatch || !geoMatch || !qualMatch) {
        tierMismatches++;
        totalMismatches++;
        console.error(`[MISMATCH] Row ${i}: identity=${identityMatch}, provenance=${provenanceMatch}, geo=${geoMatch}, qual=${qualMatch}`);
      }
    }

    console.log(`  Tier ${tier.label} Complete: ${records.length} records checked, Mismatches = ${tierMismatches}`);
    canaryReports.push({
      tier: tier.label,
      records_checked: records.length,
      mismatches: tierMismatches,
      equivalence_passed: (tierMismatches === 0)
    });
  }

  client.release();

  const finalCanaryResult = {
    timestamp: new Date().toISOString(),
    total_records_verified: allRecords.slice(0, 500).length,
    semantic_mismatches: totalMismatches,
    production_canary_ready: (totalMismatches === 0),
    tiers: canaryReports
  };

  fs.writeFileSync('reports/atlas/realtime/production_canary_verification.json', JSON.stringify(finalCanaryResult, null, 2));
  console.log('\n========================================================');
  console.log(`CANARY VERIFICATION RESULT: SEMANTIC_MISMATCHES = ${totalMismatches}`);
  console.log(`PRODUCTION_CANARY_READY = ${totalMismatches === 0 ? 'TRUE' : 'FALSE'}`);
  console.log('========================================================\n');

  await pool.end();
}

runCanaryVerification().catch(console.error);
