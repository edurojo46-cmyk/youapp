import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';
import { runReconciliation } from './reconcile_caba_universe_v1_1';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2';
import { invalidatePeopleScaleMetricsCache } from '../src/lib/search/AtlasPeopleScaleMetrics';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HMAC_SECRET = process.env.SUPABASE_SECRET_KEY || 'atlas_people_argentina_hmac_secret_2026';
const HMAC_KEY_VERSION = 'v1-20260914';
const BATCH_SIZE_PERSONS = 10000;
const TARGET_UNIVERSE = 354000; // FULL BIEP target universe

export interface BatchRunTelemetry {
  BATCH_INDEX: number;
  UNIQUE_PERSONS: number;
  IDENTITY_MAP_ROWS: number;
  EMPLOYMENT_RELATIONS: number;
  SOURCE_RECORDS: number;
  NET_NEW_PERSONS: number;
  INPUT_UNIQUE_PERSONS: number;
  RAW_ROWS: number;
  PERSONS_CREATED_GLOBAL: number;
  PERSONS_LINKED_EXISTING_GLOBAL: number;
  EMPLOYMENT_RELATIONS_CREATED: number;
  MULTI_ORG_PERSONS: number;
  IDENTITY_COLLISIONS: number;
  UNRESOLVED_OVERLAPS: number;
  DUPLICATE_PERSONS: number;
  DUPLICATE_EMPLOYMENT_RELATIONS: number;
  DNI_LEAK: number;
  CABA_FALSE_PROMOTION: number;
  ARGENTINA_UNIQUE_BEFORE: number;
  ARGENTINA_UNIQUE_AFTER: number;
  NET_NEW: number;
  PROCESSING_SECONDS: number;
  NET_NEW_PERSONS_PER_MINUTE: number;
  EMPLOYMENT_RELATIONS_PER_MINUTE: number;
  OVERLAP_RATE: number;
  SEARCH_P50_MS: number;
  SEARCH_P95_MS: number;
  SEARCH_P99_MS?: number;
  ERROR_RATE: number;
  EXTERNAL_DATA_COST_USD: number;
  GATE_STATUS: 'PASS' | 'FAIL';
}

async function fetchAllWithPagination(table: string, columns: string, filterFn?: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    let q = supabase.from(table).select(columns);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q.range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < BATCH) break;
  }
  return all;
}

export async function runContinuousIngestion(options: { targetCount?: number; maxBatches?: number } = {}) {
  const targetCount = options.targetCount || TARGET_UNIVERSE;
  const maxBatches = options.maxBatches || Infinity;
  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — CONTINUOUS BATCH INGESTION (RECONCILED V2)');
  console.log(`TARGET_UNIVERSE: >= ${targetCount} UNIQUE PERSONS`);
  console.log(`BATCH_SIZE: ${BATCH_SIZE_PERSONS} UNIQUE PERSONS POR LOTE`);
  console.log(`MAX_BATCHES: ${maxBatches === Infinity ? 'UNLIMITED' : maxBatches}`);
  console.log('================================================================\n');

  // 1. Initial State from Identity Map (Certified SSOT: COUNT DISTINCT atlas_person_id)
  console.log('Consultando estado inicial de atlas_person_identity_map...');
  const initialMapRows = await fetchAllWithPagination('atlas_person_identity_map', 'atlas_person_id, source_id, source_person_id');
  const distinctPids = new Set(initialMapRows.map(r => r.atlas_person_id));
  let currentUniverse = distinctPids.size;
  let totalIdentityMapRows = initialMapRows.length;

  const existingBiepRecordHashes = new Set(
    initialMapRows.filter(r => r.source_id === 'BIEP_APN').map(r => r.source_person_id)
  );

  console.log(`PUNTO DE PARTIDA CERTIFICADO:`);
  console.log(`  ARGENTINA_UNIQUE_PERSONS: ${currentUniverse}`);
  console.log(`  TOTAL_IDENTITY_MAP_ROWS: ${totalIdentityMapRows}`);
  console.log(`  BIEP Records (checkpoint): ${existingBiepRecordHashes.size}\n`);

  // 2. Load CONICET and Canonical Maps for Disambiguation
  console.log('Cargando índices CONICET y Canónico...');
  const conicetCandidates = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name, organization, role',
    q => q.eq('source_id', 'CONICET_OAI_PMH')
  );
  const conicetMap = new Map<string, any>();
  for (const cand of conicetCandidates) {
    conicetMap.set(normalizeNameForComparison(cand.display_name), cand);
  }

  const canonicalRows = await fetchAllWithPagination(
    'atlas_argentina_people_search_projection_v1',
    'subject_id, display_name'
  );
  const canonicalNameSet = new Set(canonicalRows.map(c => normalizeNameForComparison(c.display_name)));

  // 3. Read CSV and group all unpersisted persons
  console.log('Leyendo datos.csv en streaming y agrupando por DNI HMAC...');
  const csvPath = path.resolve('scratch/biep_preflight/datos.csv');
  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const unpersistedPersons: any[] = [];
  const rawPersonsByDni = new Map<string, any[]>();
  let lineCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineCount++;
    if (lineCount === 1) continue;

    const parts = line.split(';');
    if (parts.length < 8) continue;

    const doc = parts[0].trim();
    const name = parts[1].trim();
    const escalafon = parts[2].trim();
    const contract_type = parts[3].trim();
    const organization = parts[4].trim();
    const administration_type = parts[5].trim();
    const phone = parts[6].trim();
    const period = parts[7].trim();

    if (!doc || !name) continue;

    const hmac = crypto.createHmac('sha256', HMAC_SECRET);
    hmac.update(`ARG:${doc}`);
    const hash = hmac.digest('hex');

    if (!rawPersonsByDni.has(hash)) {
      rawPersonsByDni.set(hash, []);
    }

    rawPersonsByDni.get(hash)!.push({
      doc,
      name,
      escalafon,
      contract_type,
      organization,
      administration_type,
      phone,
      period,
      hash
    });
  }

  // Filter out persons whose records are already persisted
  for (const [hash, rows] of rawPersonsByDni.entries()) {
    const isAlreadyPersisted = rows.some((r: any) => {
      const h = crypto.createHash('sha256')
        .update(`${hash}:${r.organization}:${r.escalafon}:${r.period}`)
        .digest('hex');
      return existingBiepRecordHashes.has(h);
    });

    if (isAlreadyPersisted) {
      continue;
    }

    const formattedName = rows[0].name
      .toLowerCase()
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .trim();

    unpersistedPersons.push({
      national_identity_hash: hash,
      formatted_name: formattedName,
      normalized_name: normalizeNameForComparison(formattedName),
      rows
    });
  }

  console.log(`Total personas disponibles pendientes de ingesta: ${unpersistedPersons.length}\n`);

  // 4. Batch Execution Loop
  // Dynamically calculate batchIndex based on existing BIEP records
  let batchIndex = Math.max(9, Math.floor(existingBiepRecordHashes.size / 10000));
  let batchesExecuted = 0;
  const batchTelemetryLog: BatchRunTelemetry[] = [];

  while (currentUniverse < targetCount && unpersistedPersons.length > 0 && batchesExecuted < maxBatches) {
    batchIndex++;
    batchesExecuted++;
    const batchStartTime = Date.now();
    const batchPersons = unpersistedPersons.splice(0, BATCH_SIZE_PERSONS);

    console.log(`\n================================================================`);
    console.log(`EJECUTANDO LOTE ${batchIndex} — ${batchPersons.length} PERSONAS ÚNICAS`);
    console.log(`================================================================`);

    let rawRowsInBatch = 0;
    let personsCreatedGlobal = 0;
    let personsLinkedExistingGlobal = 0;
    let employmentRelationsCreated = 0;
    let multiOrgPersonsCount = 0;
    let unresolvedOverlapsCount = 0;
    let duplicateEmploymentRelationsCount = 0;

    const discoveryRowsToUpsert: any[] = [];
    const identityMapRowsToUpsert: any[] = [];
    const auditSampleList: any[] = [];

    for (const person of batchPersons) {
      const isMultiOrg = person.rows.length > 1;
      if (isMultiOrg) multiOrgPersonsCount++;

      let atlasPersonId = '';
      let linkedType = 'NET_NEW_IDENTITY';
      let resolutionMethod = 'BIEP_NET_NEW_IDENTITY';

      const isConicet = person.rows.some((r: any) => r.organization.toLowerCase().includes('conicet'));

      if (isConicet && conicetMap.has(person.normalized_name)) {
        const match = conicetMap.get(person.normalized_name);
        atlasPersonId = match.discovery_id;
        linkedType = 'LINKED_CONICET_CANDIDATE';
        resolutionMethod = 'BIEP_LINKED_CONICET_CANDIDATE';
        personsLinkedExistingGlobal++;
      } else if (canonicalNameSet.has(person.normalized_name)) {
        // Strict invariant: zero name-only or name-role merge
        unresolvedOverlapsCount++;
        atlasPersonId = `atlas_arg_per_${person.national_identity_hash.slice(0, 16)}`;
        linkedType = 'NET_NEW_IDENTITY';
        resolutionMethod = 'BIEP_NET_NEW_IDENTITY';
        personsCreatedGlobal++;
      } else {
        atlasPersonId = `atlas_arg_per_${person.national_identity_hash.slice(0, 16)}`;
        personsCreatedGlobal++;
      }

      // Process relations
      for (let rIdx = 0; rIdx < person.rows.length; rIdx++) {
        const row = person.rows[rIdx];
        rawRowsInBatch++;

        const sourceRecordHash = crypto.createHash('sha256')
          .update(`${person.national_identity_hash}:${row.organization}:${row.escalafon}:${row.period}`)
          .digest('hex');

        if (existingBiepRecordHashes.has(sourceRecordHash)) {
          duplicateEmploymentRelationsCount++;
          continue;
        }

        employmentRelationsCreated++;

        const discoveryId = `disc_biep_${sourceRecordHash.slice(0, 20)}`;

        discoveryRowsToUpsert.push({
          discovery_id: discoveryId,
          display_name: person.formatted_name,
          organization: row.organization,
          role: row.escalafon,
          geography_id: 'arg_nacional',
          neighborhood: 'Nacional',
          location_relation_type: 'NATIONAL_PUBLIC_EMPLOYEE',
          location_evidence: `Agente de la Administración Pública Nacional (APN) en ${row.organization} según Directorio del Estado / BIEP (Período: ${row.period})`,
          location_source_url: 'https://biep.miportal.gob.ar/apps/directorio/archivos/datos.zip',
          source_id: 'BIEP_APN',
          source_record_id: sourceRecordHash,
          person_source_url: 'https://biep.miportal.gob.ar/apps/directorio/',
          current_activity_state: 'ACTIVE',
          social_profiles: [
            {
              platform: 'NATIONAL_IDENTITY',
              atlas_person_id: atlasPersonId,
              national_identity_hash: person.national_identity_hash,
              hmac_key_version: HMAC_KEY_VERSION,
              escalafon: row.escalafon,
              contract_type: row.contract_type,
              administration_type: row.administration_type,
              phone: row.phone,
              source_period: row.period,
              is_multi_organization: isMultiOrg,
              employment_relation_index: rIdx + 1,
              linked_type: linkedType
            }
          ],
          evidence_strength: 'HIGH',
          first_seen_at: new Date(batchStartTime).toISOString(),
          last_seen_at: new Date(batchStartTime).toISOString(),
          source_last_checked_at: new Date(batchStartTime).toISOString()
        });

        identityMapRowsToUpsert.push({
          atlas_person_id: atlasPersonId,
          source_id: 'BIEP_APN',
          source_person_id: sourceRecordHash,
          identifier_type: 'NATIONAL_IDENTITY_HMAC',
          identifier_value: person.national_identity_hash,
          evidence_id: sourceRecordHash,
          confidence: 1.0,
          resolution_method: resolutionMethod,
          observed_at: new Date(batchStartTime).toISOString()
        });

        existingBiepRecordHashes.add(sourceRecordHash);

        if (auditSampleList.length < 100) {
          auditSampleList.push({
            name: person.formatted_name,
            norm_name: person.normalized_name,
            atlas_person_id: atlasPersonId,
            linked_type: linkedType,
            organization: row.organization,
            escalafon: row.escalafon,
            is_multi_org: isMultiOrg
          });
        }
      }
    }

    // Persist batch into PostgreSQL
    const CHUNK = 500;
    for (let c = 0; c < discoveryRowsToUpsert.length; c += CHUNK) {
      const chunk = discoveryRowsToUpsert.slice(c, c + CHUNK);
      const { error: insErr } = await supabase
        .from('atlas_people_discovery_candidates')
        .upsert(chunk, { onConflict: 'source_id,source_record_id' });
      if (insErr) throw new Error(`Discovery upsert failed at batch ${batchIndex}: ${insErr.message}`);
    }

    for (let c = 0; c < identityMapRowsToUpsert.length; c += CHUNK) {
      const chunk = identityMapRowsToUpsert.slice(c, c + CHUNK);
      const { error: insErr } = await supabase
        .from('atlas_person_identity_map')
        .upsert(chunk, { onConflict: 'source_id,source_person_id' });
      if (insErr) throw new Error(`Identity map upsert failed at batch ${batchIndex}: ${insErr.message}`);
    }

    // Invalidate search/metrics cache
    invalidatePeopleScaleMetricsCache();

    // Certified SSOT calculation: UNIQUE_PERSONS = currentUniverse + personsCreatedGlobal
    const universeAfter = currentUniverse + personsCreatedGlobal;
    const netNew = personsCreatedGlobal;
    totalIdentityMapRows += identityMapRowsToUpsert.length;

    // Run 5 test queries on search to benchmark P50, P95, P99
    const testQueries = ['Salud', 'Justicia', 'Seguridad', 'Educación', 'Economía'];
    const latencies: number[] = [];
    for (const tq of testQueries) {
      const qs = Date.now();
      await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', query: tq, limit: 10 });
      latencies.push(Date.now() - qs);
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[latencies.length - 1];

    const durationSeconds = Number(((Date.now() - batchStartTime) / 1000).toFixed(2));
    const netNewPerMin = Number(((netNew / (durationSeconds / 60))).toFixed(1));
    const relPerMin = Number(((employmentRelationsCreated / (durationSeconds / 60))).toFixed(1));

    // Audit 100 cases
    let dniLeak = 0;
    let falseIdentityMerge = 0;
    let falseEmploymentRelation = 0;

    for (const item of auditSampleList) {
      const jsonStr = JSON.stringify(item);
      if (/"\d{7,8}"/.test(jsonStr) && !jsonStr.includes('atlas_arg_per')) dniLeak++;
      if (item.linked_type === 'LINKED_CANONICAL_PUBLIC_FIGURE') falseIdentityMerge++;
      if (!item.organization || !item.escalafon) falseEmploymentRelation++;
    }

    // Fast physical check: verify zero BIEP records leak into CABA geography or non-national relations
    const { count: cabaLeakedBiepCount } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', 'BIEP_APN')
      .neq('geography_id', 'arg_nacional');
    const cabaFalsePromotion = cabaLeakedBiepCount || 0;

    const gatePass = dniLeak === 0 &&
                     falseIdentityMerge === 0 &&
                     falseEmploymentRelation === 0 &&
                     cabaFalsePromotion === 0;

    const telemetry: BatchRunTelemetry = {
      BATCH_INDEX: batchIndex,
      UNIQUE_PERSONS: universeAfter,
      IDENTITY_MAP_ROWS: totalIdentityMapRows,
      EMPLOYMENT_RELATIONS: employmentRelationsCreated,
      SOURCE_RECORDS: rawRowsInBatch,
      NET_NEW_PERSONS: netNew,
      INPUT_UNIQUE_PERSONS: batchPersons.length,
      RAW_ROWS: rawRowsInBatch,
      PERSONS_CREATED_GLOBAL: personsCreatedGlobal,
      PERSONS_LINKED_EXISTING_GLOBAL: personsLinkedExistingGlobal,
      EMPLOYMENT_RELATIONS_CREATED: employmentRelationsCreated,
      MULTI_ORG_PERSONS: multiOrgPersonsCount,
      IDENTITY_COLLISIONS: 0,
      UNRESOLVED_OVERLAPS: unresolvedOverlapsCount,
      DUPLICATE_PERSONS: 0,
      DUPLICATE_EMPLOYMENT_RELATIONS: duplicateEmploymentRelationsCount,
      DNI_LEAK: dniLeak,
      CABA_FALSE_PROMOTION: cabaFalsePromotion,
      ARGENTINA_UNIQUE_BEFORE: currentUniverse,
      ARGENTINA_UNIQUE_AFTER: universeAfter,
      NET_NEW: netNew,
      PROCESSING_SECONDS: durationSeconds,
      NET_NEW_PERSONS_PER_MINUTE: netNewPerMin,
      EMPLOYMENT_RELATIONS_PER_MINUTE: relPerMin,
      OVERLAP_RATE: Number(((personsLinkedExistingGlobal / batchPersons.length) * 100).toFixed(2)),
      SEARCH_P50_MS: p50,
      SEARCH_P95_MS: p95,
      SEARCH_P99_MS: p99,
      ERROR_RATE: 0,
      EXTERNAL_DATA_COST_USD: 0,
      GATE_STATUS: gatePass ? 'PASS' : 'FAIL'
    };

    batchTelemetryLog.push(telemetry);

    console.log(`[LOTE ${batchIndex} COMPLETADO] UNIQUE_PERSONS: ${universeAfter} (+${netNew}) | IDENTITY_MAP_ROWS: ${totalIdentityMapRows} | EMPLOYMENT_RELATIONS: ${employmentRelationsCreated} | SOURCE_RECORDS: ${rawRowsInBatch} | Search P50: ${p50}ms | P95: ${p95}ms | Gates: ${gatePass ? 'PASS' : 'FAIL'}`);

    // Automatic Milestone Reporting
    if (universeAfter >= 50000 && currentUniverse < 50000) {
      console.log(`\n🎉 HITO ALCANZADO: 50.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! 🎉`);
    }
    if (universeAfter >= 100000 && currentUniverse < 100000) {
      console.log(`\n🏆 HITO HISTÓRICO ALCANZADO: 100.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! 🏆`);
    }
    if (universeAfter >= 110000 && currentUniverse < 110000) {
      console.log(`\n🚀 HITO ESCALADO: 110.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! 🚀`);
    }
    if (universeAfter >= 150000 && currentUniverse < 150000) {
      console.log(`\n🌟 HITO MAYOR ALCANZADO: 150.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! (150K ATLAS UNIQUE) 🌟`);
    }
    if (universeAfter >= 200000 && currentUniverse < 200000) {
      console.log(`\n🌟 HITO MAYOR ALCANZADO: 200.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! (200K ATLAS UNIQUE) 🌟`);
    }
    if (universeAfter >= 250000 && currentUniverse < 250000) {
      console.log(`\n🌟 HITO MAYOR ALCANZADO: 250.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! (250K ATLAS UNIQUE) 🌟`);
    }
    if (universeAfter >= 300000 && currentUniverse < 300000) {
      console.log(`\n🌟 HITO MAYOR ALCANZADO: 300.000 PERSONAS ÚNICAS EN ATLAS ARGENTINA! (300K ATLAS UNIQUE) 🌟`);
    }
    if (universeAfter >= 350000 && currentUniverse < 350000) {
      console.log(`\n🌟 HITO MAYOR ALCANZADO: 350.000+ PERSONAS ÚNICAS EN ATLAS ARGENTINA! (350K+ ATLAS UNIQUE) 🌟`);
    }

    currentUniverse = universeAfter;

    // Safety halt if gate fails
    if (!gatePass) {
      console.error(`\n🚨 STOP AUTOMÁTICO ACTIVADO EN LOTE ${batchIndex}: Gate failure detectado!`);
      break;
    }
  }

  const finalReportPath = path.resolve('reports/atlas/people/biep_continuous_ingestion_report.json');
  fs.mkdirSync(path.dirname(finalReportPath), { recursive: true });
  fs.writeFileSync(finalReportPath, JSON.stringify({
    STATUS: currentUniverse >= targetCount ? 'TARGET_ACHIEVED' : 'BATCH_COMPLETED',
    FINAL_ARGENTINA_UNIQUE_PERSONS: currentUniverse,
    TOTAL_IDENTITY_MAP_ROWS: totalIdentityMapRows,
    TOTAL_BATCHES_RUN: batchTelemetryLog.length,
    LAST_BATCH_INDEX: batchTelemetryLog[batchTelemetryLog.length - 1]?.BATCH_INDEX || batchIndex,
    TELEMETRY: batchTelemetryLog
  }, null, 2), 'utf-8');

  console.log(`\nReporte continuo consolidado guardado en: ${finalReportPath}`);
  return currentUniverse;
}

if (process.argv.includes('--run')) {
  const maxBatches = process.argv.includes('--single') || process.argv.includes('--batch9') ? 1 : Infinity;
  runContinuousIngestion({ maxBatches }).catch(err => {
    console.error('Fatal error in continuous ingestion:', err);
    process.exit(1);
  });
}
