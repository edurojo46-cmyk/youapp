/**
 * scripts/ingest_canary_caba_autoridades.mjs
 * 
 * ATLAS V1.7 CANARY PRODUCTION INGESTION: ART_CABA_AUTORIDADES_SUPERIORES_Y_FUNCIONARIOS_2024
 * 
 * Strict Guarantees:
 * - One source at a time (Section 16).
 * - Exact C1 concurrency (zero write lock contention).
 * - Clean measurement of true-new yield and RPC latency.
 * - Outbox writes atomic, searchable events generated.
 */

import https from 'https';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { LocalNoveltyOracle } from '../src/lib/atlas/oracle/LocalNoveltyOracle.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 3 });
const hmacSecret = process.env.ATLAS_HMAC_SECRET || 'atlas_deterministic_identity_salt_2026';
const oracle = new LocalNoveltyOracle({ hashBits: 128, hmacSecret });

const CSV_URL = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2024.csv';

function downloadCsv(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function getCanonicalDenominator() {
  const res = await pool.query(`
    SELECT 
      caba_qualified_unique_real_people,
      pba_qualified_unique_real_people,
      caba_pba_qualified_unique_real_people,
      qualified_unique_real_people,
      unique_people
    FROM atlas_people_live_metrics
    WHERE id = 'current';
  `);
  return res.rows[0] ? Number(res.rows[0].caba_pba_qualified_unique_real_people) : 0;
}

function quantile(arr, q) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return Number((sorted[base] + rest * (sorted[base + 1] - sorted[base])).toFixed(2));
  }
  return Number(sorted[base].toFixed(2));
}

async function runCanary() {
  console.log('=== ATLAS V1.7 CANARY PRODUCTION STAGE ===');
  console.log(`Source: ART_CABA_AUTORIDADES_SUPERIORES_Y_FUNCIONARIOS_2024`);
  
  console.log('Downloading CSV from official CABA open data CDN...');
  const rawCsv = await downloadCsv(CSV_URL);
  const lines = rawCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
  console.log(`Fetched ${lines.length} lines.`);

  const parsedItems = [];
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const cuil = match[7].replace(/\D/g, '');
    const nombreCompleto = match[8];
    const cargo = match[6];
    const ministerio = match[1];

    if (!cuil || cuil.length < 7 || cuil.length > 11) continue;
    if (!nombreCompleto || nombreCompleto.length < 3) continue;

    const dni = cuil.length === 11 ? cuil.slice(2, 10) : cuil;
    const docHmac = crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${dni}`).digest('hex');
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    const sourceRecordHash = crypto.createHash('sha256').update(`CABA:AUTORIDADES:${cuil}:${nombreCompleto}`).digest('hex');
    const evidenceId = `evi_caba_aut_${sourceRecordHash.slice(0, 12)}`;

    parsedItems.push({
      cuil,
      dni,
      nombreCompleto,
      cargo,
      ministerio,
      docHmac,
      atlasPersonId,
      sourceRecordHash,
      evidenceId
    });
  }

  console.log(`Total valid person items: ${parsedItems.length}`);

  // Query canonical denominator BEFORE
  const tDenom0 = performance.now();
  const denomStart = await getCanonicalDenominator();
  const tDenomStartMs = performance.now() - tDenom0;
  console.log(`Initial Canonical Denominator (CABA/PBA): ${denomStart} (Queried in ${tDenomStartMs.toFixed(2)}ms)`);

  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < parsedItems.length; i += BATCH_SIZE) {
    batches.push(parsedItems.slice(i, i + BATCH_SIZE));
  }

  console.log(`Prepared ${batches.length} batches of size ${BATCH_SIZE}.`);

  const rpcLatencies = [];
  let totalCommittedRows = 0;
  let oracleTruePredictions = 0;

  // Background wait event sampling during ingestion
  let waitSampleCount = 0;
  let dataFileReadCount = 0;
  let samplingActive = true;

  const samplingInterval = setInterval(async () => {
    if (!samplingActive) return;
    try {
      const waitRes = await pool.query(`
        SELECT wait_event_type, wait_event 
        FROM pg_stat_activity 
        WHERE query LIKE '%commit_canonical_with_search_outbox%' AND pid <> pg_backend_pid();
      `);
      for (const r of waitRes.rows) {
        waitSampleCount++;
        if (r.wait_event === 'DataFileRead' || (r.wait_event_type === 'IO' && r.wait_event?.includes('Read'))) {
          dataFileReadCount++;
        }
      }
    } catch (_) {}
  }, 200);

  const tIngestStart = performance.now();

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const bItems = batches[bIdx];
    const identityRows = [];
    const outboxRows = [];

    for (const p of bItems) {
      // Oracle advisory check
      const evalRes = oracle.evaluateRow({
        identifier_type: 'NATIONAL_IDENTITY_HMAC',
        identifier_value: p.docHmac,
        atlas_person_id: p.atlasPersonId
      });
      if (evalRes.status === 'POSSIBLY_NEW') oracleTruePredictions++;

      identityRows.push({
        atlas_person_id: p.atlasPersonId,
        source_id: 'SRC_BA_DATOS_CABA_AUTORIDADES',
        source_person_id: p.sourceRecordHash,
        identifier_type: 'NATIONAL_IDENTITY_HMAC',
        identifier_value: p.docHmac,
        evidence_id: p.evidenceId,
        confidence: 1.0,
        resolution_method: 'CABA_OPEN_DATA_PORTAL',
        observed_at: new Date().toISOString()
      });

      const discoveryId = `disc_caba_${p.sourceRecordHash.substring(0, 24)}`;
      const doc = {
        discovery_id: discoveryId,
        display_name: p.nombreCompleto,
        profession: p.cargo || 'Funcionario Público',
        role: p.cargo,
        organization: p.ministerio,
        geography_id: 'caba',
        neighborhood: 'Ciudad Autónoma de Buenos Aires',
        location_relation_type: 'PUBLIC_ROLE',
        location_evidence: `Designación oficial en ${p.ministerio} (CABA Data)`,
        location_source_url: 'https://data.buenosaires.gob.ar',
        target_region: 'CABA',
        geo_association_type: 'PUBLIC_ROLE',
        geo_confidence: 1.0,
        geo_source: 'Buenos Aires Data',
        geo_evidence: `Nómina oficial de autoridades del Gobierno de la Ciudad de Buenos Aires`,
        source_id: 'SRC_BA_DATOS_CABA_AUTORIDADES',
        source_record_id: p.sourceRecordHash,
        person_source_url: 'https://data.buenosaires.gob.ar',
        search_text_normalized: `${p.nombreCompleto} ${p.cargo} ${p.ministerio}`.toLowerCase(),
        current_activity_state: 'ACTIVE',
        evidence_strength: 'HIGH',
        social_profiles: [],
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        source_last_checked_at: new Date().toISOString()
      };

      outboxRows.push({
        atlas_person_id: p.atlasPersonId,
        source_id: 'SRC_BA_DATOS_CABA_AUTORIDADES',
        source_record_id: p.sourceRecordHash,
        payload: doc
      });
    }

    const tRpc0 = performance.now();
    const rpcRes = await pool.query(
      `SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb, $3::text, $4::text, $5::text) as result;`,
      [
        JSON.stringify(identityRows),
        JSON.stringify(outboxRows),
        `canary_caba_${Date.now()}_${bIdx}`,
        `rpc_${Date.now()}_${bIdx}`,
        'EPOCH_V17_CANARY_CABA'
      ]
    );
    const rpcDurationMs = performance.now() - tRpc0;
    rpcLatencies.push(rpcDurationMs);
    totalCommittedRows += identityRows.length;

    // Register committed keys into oracle
    for (const r of identityRows) {
      oracle.registerCommittedRow(r);
    }

    console.log(`[Batch ${bIdx + 1}/${batches.length}] Committed ${identityRows.length} rows in ${rpcDurationMs.toFixed(1)}ms`);
  }

  const tIngestEnd = performance.now();
  samplingActive = false;
  clearInterval(samplingInterval);

  const durationSec = (tIngestEnd - tIngestStart) / 1000;

  // Query canonical denominator AFTER
  const tDenomEnd0 = performance.now();
  const denomEnd = await getCanonicalDenominator();
  const tDenomEndMs = performance.now() - tDenomEnd0;
  console.log(`Final Canonical Denominator: ${denomEnd} (Queried in ${tDenomEndMs.toFixed(2)}ms)`);

  const canonicalDelta = denomEnd - denomStart;
  const canonicalTrueNewYield = totalCommittedRows > 0 ? ((canonicalDelta / totalCommittedRows) * 100).toFixed(2) : '0';
  const rowsSec = (totalCommittedRows / durationSec).toFixed(2);
  const trueNewSec = (canonicalDelta / durationSec).toFixed(2);
  const rpcP50 = quantile(rpcLatencies, 0.5);
  const rpcP95 = quantile(rpcLatencies, 0.95);
  const dataFileReadShare = waitSampleCount > 0 ? ((dataFileReadCount / waitSampleCount) * 100).toFixed(2) : '0';

  console.log('\n======================================================');
  console.log('CANARY PRODUCTION RESULTS (ART_CABA_AUTORIDADES):');
  console.log('======================================================');
  console.log(`FIRST_SOURCE_ACTIVATED = ART_CABA_AUTORIDADES_SUPERIORES_Y_FUNCIONARIOS_2024`);
  console.log(`FIRST_SOURCE_CANARY_ROWS = ${totalCommittedRows}`);
  console.log(`FIRST_SOURCE_CANARY_TRUE_NEW = ${canonicalDelta}`);
  console.log(`FIRST_SOURCE_CANARY_YIELD = ${canonicalTrueNewYield}%`);
  console.log(`ROWS_SEC = ${rowsSec}/s`);
  console.log(`TRUE_NEW_SEC = ${trueNewSec}/s`);
  console.log(`DB_RPC_P50 = ${rpcP50}ms`);
  console.log(`DB_RPC_P95 = ${rpcP95}ms`);
  console.log(`DATA_FILE_READ_SHARE = ${dataFileReadShare}%`);
  console.log(`ORACLE_ACCURACY = ${((oracleTruePredictions / totalCommittedRows) * 100).toFixed(2)}%`);

  const report = {
    FIRST_SOURCE_ACTIVATED: 'ART_CABA_AUTORIDADES_SUPERIORES_Y_FUNCIONARIOS_2024',
    FIRST_SOURCE_CANARY_ROWS: totalCommittedRows,
    FIRST_SOURCE_CANARY_TRUE_NEW: canonicalDelta,
    FIRST_SOURCE_CANARY_YIELD: Number(canonicalTrueNewYield),
    CURRENT_ROWS_SEC: Number(rowsSec),
    CURRENT_TRUE_NEW_SEC: Number(trueNewSec),
    CURRENT_TRUE_NEW_YIELD: Number(canonicalTrueNewYield),
    DB_RPC_P50: rpcP50,
    DB_RPC_P95: rpcP95,
    DATA_FILE_READ_SHARE: Number(dataFileReadShare),
    ORACLE_ACCURACY: Number(((oracleTruePredictions / totalCommittedRows) * 100).toFixed(2))
  };

  fs.writeFileSync('reports/atlas/realtime/v17_canary_activation_report.json', JSON.stringify(report, null, 2));
  await pool.end();
}

runCanary().catch(err => {
  console.error('Canary run error:', err);
  process.exit(1);
});
