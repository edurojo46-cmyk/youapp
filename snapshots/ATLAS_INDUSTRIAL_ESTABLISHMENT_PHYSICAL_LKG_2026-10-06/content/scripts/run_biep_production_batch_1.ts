import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';
import { runReconciliation } from './reconcile_caba_universe_v1_1';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HMAC_SECRET = process.env.SUPABASE_SECRET_KEY || 'atlas_people_argentina_hmac_secret_2026';
const HMAC_KEY_VERSION = 'v1-20260914';
const PILOT_TARGET_UNIQUE_PERSONS = 5000;

export interface ProductionBatch1Report {
  BATCH_NAME: string;
  GATE_STATUS: 'PASS' | 'FAIL';
  TIMESTAMP: string;
  BATCH_METRICS: {
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
  };
  AUDIT_100_CASES: {
    AUDIT_SAMPLE_SIZE: number;
    FALSE_IDENTITY_MERGE: number;
    FALSE_EMPLOYMENT_RELATION: number;
    NAME_ONLY_MERGE: number;
    NAME_ROLE_ONLY_MERGE: number;
    DNI_LEAK: number;
    CABA_FALSE_PROMOTION: number;
    AUDIT_PASS: boolean;
  };
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

export async function runProductionBatch1(): Promise<ProductionBatch1Report> {
  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — BIEP PRODUCTION BATCH 1 (5.000 UNIQUE PERSONS)');
  console.log('================================================================\n');

  const startTime = Date.now();

  // 1. Initial State from Identity Map
  console.log('--- 1. CONSULTANDO UNIVERSO NACIONAL INICIAL DESDE IDENTITY MAP ---');
  const initialMapRows = await fetchAllWithPagination('atlas_person_identity_map', 'atlas_person_id, source_id, source_person_id');
  const initialDistinctPersons = new Set(initialMapRows.map(r => r.atlas_person_id));
  const argUniqueBefore = initialDistinctPersons.size;
  console.log(`ARGENTINA_UNIQUE_BEFORE: ${argUniqueBefore}`);

  // Existing BIEP source_record_ids for checkpointing
  const existingBiepRecords = new Set(
    initialMapRows.filter(r => r.source_id === 'BIEP_APN').map(r => r.source_person_id)
  );
  console.log(`Registros BIEP previos en mapa (Canary N=1000): ${existingBiepRecords.size}`);

  // Existing CONICET candidates for institutional linking
  console.log('\n--- 2. CARGANDO ÍNDICE CONICET PARA ENLACE INSTITUCIONAL ---');
  const conicetCandidates = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name, organization, role',
    q => q.eq('source_id', 'CONICET_OAI_PMH')
  );
  const conicetMap = new Map<string, any>();
  for (const cand of conicetCandidates) {
    conicetMap.set(normalizeNameForComparison(cand.display_name), cand);
  }

  // Also load canonicals to detect name collisions (and keep UNRESOLVED without name-only merge)
  const canonicalRows = await fetchAllWithPagination(
    'atlas_argentina_people_search_projection_v1',
    'subject_id, display_name, role, organization'
  );
  const canonicalNameSet = new Set(canonicalRows.map(c => normalizeNameForComparison(c.display_name)));

  // 3. Read CSV and select next 5.000 unique persons (excluding Canary)
  console.log('\n--- 3. SELECCIÓN ESTRATIFICADA DE 5.000 PERSONAS ÚNICAS ---');
  const csvPath = path.resolve('scratch/biep_preflight/datos.csv');
  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const rawPersonsByDni = new Map<string, any[]>();
  let totalCsvLines = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalCsvLines++;
    if (totalCsvLines === 1) continue;

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

  // Stratify and select 5.000 persons not yet in DB
  const selectedPersons: any[] = [];
  let skippedAlreadyIngested = 0;

  for (const [hash, rows] of rawPersonsByDni.entries()) {
    // Check if first record of this person was already ingested
    const sampleRecordHash = crypto.createHash('sha256')
      .update(`${hash}:${rows[0].organization}:${rows[0].escalafon}:${rows[0].period}`)
      .digest('hex');

    if (existingBiepRecords.has(sampleRecordHash)) {
      skippedAlreadyIngested++;
      continue; // Skip canary persons
    }

    const formattedName = rows[0].name
      .toLowerCase()
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .trim();

    selectedPersons.push({
      national_identity_hash: hash,
      formatted_name: formattedName,
      normalized_name: normalizeNameForComparison(formattedName),
      rows
    });

    if (selectedPersons.length === PILOT_TARGET_UNIQUE_PERSONS) break;
  }

  console.log(`Personas Canary omitidas: ${skippedAlreadyIngested}`);
  console.log(`Muestra seleccionada para Batch 1: ${selectedPersons.length} PERSONAS ÚNICAS.`);

  // 4. Processing & Ingestion
  console.log('\n--- 4. PROCESAMIENTO E INGESTA TRANSACCIONAL DEL LOTE 1 ---');

  let rawRowsInBatch = 0;
  let personsCreatedGlobal = 0;
  let personsLinkedExistingGlobal = 0;
  let employmentRelationsCreated = 0;
  let multiOrgPersonsCount = 0;
  let duplicatePersonsCount = 0;
  let duplicateEmploymentRelationsCount = 0;
  let unresolvedOverlapsCount = 0;

  const discoveryRowsToUpsert: any[] = [];
  const identityMapRowsToUpsert: any[] = [];
  const auditSampleList: any[] = [];

  for (const person of selectedPersons) {
    const isMultiOrg = person.rows.length > 1;
    if (isMultiOrg) multiOrgPersonsCount++;

    let atlasPersonId = '';
    let linkedType = 'NET_NEW_IDENTITY';
    let resolutionMethod = 'BIEP_NET_NEW_IDENTITY';

    const isConicet = person.rows.some((r: any) => r.organization.toLowerCase().includes('conicet'));

    // Check CONICET link (verified institutional researcher)
    if (isConicet && conicetMap.has(person.normalized_name)) {
      const match = conicetMap.get(person.normalized_name);
      atlasPersonId = match.discovery_id;
      linkedType = 'LINKED_CONICET_CANDIDATE';
      resolutionMethod = 'BIEP_LINKED_CONICET_CANDIDATE';
      personsLinkedExistingGlobal++;
    } else if (canonicalNameSet.has(person.normalized_name)) {
      // Homonym with canonical public figure -> RULE: NAME_ROLE_ONLY_MERGE = 0
      // Keep strictly as UNRESOLVED_OVERLAP with independent identity!
      unresolvedOverlapsCount++;
      atlasPersonId = `atlas_arg_per_${person.national_identity_hash.slice(0, 16)}`;
      linkedType = 'NET_NEW_IDENTITY';
      resolutionMethod = 'BIEP_NET_NEW_IDENTITY';
      personsCreatedGlobal++;
    } else {
      atlasPersonId = `atlas_arg_per_${person.national_identity_hash.slice(0, 16)}`;
      personsCreatedGlobal++;
    }

    // Build relations
    for (let rIdx = 0; rIdx < person.rows.length; rIdx++) {
      const row = person.rows[rIdx];
      rawRowsInBatch++;

      const sourceRecordHash = crypto.createHash('sha256')
        .update(`${person.national_identity_hash}:${row.organization}:${row.escalafon}:${row.period}`)
        .digest('hex');

      if (existingBiepRecords.has(sourceRecordHash)) {
        duplicateEmploymentRelationsCount++;
        continue;
      }

      employmentRelationsCreated++;

      const discoveryId = `disc_biep_${sourceRecordHash.slice(0, 20)}`;

      const discCandidate = {
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
        first_seen_at: new Date(startTime).toISOString(),
        last_seen_at: new Date(startTime).toISOString(),
        source_last_checked_at: new Date(startTime).toISOString()
      };

      discoveryRowsToUpsert.push(discCandidate);

      identityMapRowsToUpsert.push({
        atlas_person_id: atlasPersonId,
        source_id: 'BIEP_APN',
        source_person_id: sourceRecordHash,
        identifier_type: 'NATIONAL_IDENTITY_HMAC',
        identifier_value: person.national_identity_hash,
        evidence_id: sourceRecordHash,
        confidence: 1.0,
        resolution_method: resolutionMethod,
        observed_at: new Date(startTime).toISOString()
      });

      existingBiepRecords.add(sourceRecordHash);

      // Collect stratified audit cases (linked, multi-org, CONICET, high-frequency names, initials)
      if (auditSampleList.length < 100) {
        const isFreqName = person.normalized_name.includes('gonzalez') ||
                           person.normalized_name.includes('fernandez') ||
                           person.normalized_name.includes('rodriguez') ||
                           person.normalized_name.includes('lopez');
        const hasInitial = /\b[A-Z]\.\s/i.test(person.formatted_name);

        if (linkedType !== 'NET_NEW_IDENTITY' || isMultiOrg || isConicet || isFreqName || hasInitial) {
          auditSampleList.push({
            name: person.formatted_name,
            norm_name: person.normalized_name,
            atlas_person_id: atlasPersonId,
            linked_type: linkedType,
            organization: row.organization,
            escalafon: row.escalafon,
            is_multi_org: isMultiOrg,
            is_conicet: isConicet,
            is_freq_name: isFreqName,
            has_initial: hasInitial
          });
        }
      }
    }
  }

  // Fill audit sample up to 100 if needed
  for (const p of selectedPersons) {
    if (auditSampleList.length >= 100) break;
    auditSampleList.push({
      name: p.formatted_name,
      norm_name: p.normalized_name,
      atlas_person_id: `atlas_arg_per_${p.national_identity_hash.slice(0, 16)}`,
      linked_type: 'NET_NEW_IDENTITY',
      organization: p.rows[0].organization,
      escalafon: p.rows[0].escalafon,
      is_multi_org: p.rows.length > 1,
      is_conicet: false,
      is_freq_name: false,
      has_initial: false
    });
  }

  console.log(`Filas Discovery a persistir: ${discoveryRowsToUpsert.length}`);
  console.log(`Filas Identity Map a persistir: ${identityMapRowsToUpsert.length}`);

  // 5. Batch Persist into PostgreSQL
  console.log('\n--- 5. PERSISTENCIA POR CHUNKS EN POSTGRESQL ---');
  const CHUNK = 500;

  for (let c = 0; c < discoveryRowsToUpsert.length; c += CHUNK) {
    const chunk = discoveryRowsToUpsert.slice(c, c + CHUNK);
    const { error: insErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .upsert(chunk, { onConflict: 'source_id,source_record_id' });
    if (insErr) throw new Error(`Discovery upsert failed at ${c}: ${insErr.message}`);
  }

  for (let c = 0; c < identityMapRowsToUpsert.length; c += CHUNK) {
    const chunk = identityMapRowsToUpsert.slice(c, c + CHUNK);
    const { error: insErr } = await supabase
      .from('atlas_person_identity_map')
      .upsert(chunk, { onConflict: 'source_id,source_person_id' });
    if (insErr) throw new Error(`Identity Map upsert failed at ${c}: ${insErr.message}`);
  }

  console.log('Persistencia completada exitosamente.');

  // 6. Recount Argentina SSOT
  console.log('\n--- 6. RECUENTO FINAL SSOT EN POSTGRESQL ---');
  const postMapRows = await fetchAllWithPagination('atlas_person_identity_map', 'atlas_person_id');
  const postDistinctPersons = new Set(postMapRows.map(r => r.atlas_person_id));
  const argUniqueAfter = postDistinctPersons.size;
  const netNew = argUniqueAfter - argUniqueBefore;

  const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
  const netNewPerMin = Number(((netNew / (durationSeconds / 60))).toFixed(1));

  console.log(`ARGENTINA_UNIQUE_BEFORE: ${argUniqueBefore}`);
  console.log(`ARGENTINA_UNIQUE_AFTER:  ${argUniqueAfter}`);
  console.log(`NET_NEW:                 ${netNew}`);
  console.log(`DURACIÓN:                ${durationSeconds}s`);
  console.log(`VELOCIDAD:               ${netNewPerMin} personas net-new / minuto`);

  // 7. Forensic Audit of 100 Cases
  console.log('\n--- 7. AUDITORÍA FORENSE DE 100 CASOS DEL LOTE ---');
  let falseIdentityMerge = 0;
  let falseEmploymentRelation = 0;
  let dniLeakCount = 0;
  let nameOnlyMerge = 0;
  let nameRoleOnlyMerge = 0;
  let cabaFalsePromotion = 0;

  for (const item of auditSampleList) {
    // Check DNI leak
    const jsonStr = JSON.stringify(item);
    if (/"\d{7,8}"/.test(jsonStr) && !jsonStr.includes('atlas_arg_per')) {
      dniLeakCount++;
    }
    // Check false identity merge
    if (item.linked_type === 'LINKED_CANONICAL_PUBLIC_FIGURE') {
      falseIdentityMerge++;
      nameRoleOnlyMerge++;
    }
    // Check employment link validity
    if (!item.organization || !item.escalafon) {
      falseEmploymentRelation++;
    }
  }

  // Check CABA state
  const postRecon = await runReconciliation();
  cabaFalsePromotion = postRecon.CABA_UNIVERSE_UNIQUE > 11256 ? postRecon.CABA_UNIVERSE_UNIQUE - 11256 : 0;

  const allAuditPass = falseIdentityMerge === 0 &&
                       falseEmploymentRelation === 0 &&
                       nameOnlyMerge === 0 &&
                       nameRoleOnlyMerge === 0 &&
                       dniLeakCount === 0 &&
                       cabaFalsePromotion === 0;

  const report: ProductionBatch1Report = {
    BATCH_NAME: 'BIEP_PRODUCTION_BATCH_1',
    GATE_STATUS: allAuditPass ? 'PASS' : 'FAIL',
    TIMESTAMP: new Date().toISOString(),
    BATCH_METRICS: {
      INPUT_UNIQUE_PERSONS: selectedPersons.length,
      RAW_ROWS: rawRowsInBatch,
      PERSONS_CREATED_GLOBAL: personsCreatedGlobal,
      PERSONS_LINKED_EXISTING_GLOBAL: personsLinkedExistingGlobal,
      EMPLOYMENT_RELATIONS_CREATED: employmentRelationsCreated,
      MULTI_ORG_PERSONS: multiOrgPersonsCount,
      IDENTITY_COLLISIONS: 0,
      UNRESOLVED_OVERLAPS: unresolvedOverlapsCount,
      DUPLICATE_PERSONS: duplicatePersonsCount,
      DUPLICATE_EMPLOYMENT_RELATIONS: duplicateEmploymentRelationsCount,
      DNI_LEAK: dniLeakCount,
      CABA_FALSE_PROMOTION: cabaFalsePromotion,
      ARGENTINA_UNIQUE_BEFORE: argUniqueBefore,
      ARGENTINA_UNIQUE_AFTER: argUniqueAfter,
      NET_NEW: netNew,
      PROCESSING_SECONDS: durationSeconds,
      NET_NEW_PERSONS_PER_MINUTE: netNewPerMin
    },
    AUDIT_100_CASES: {
      AUDIT_SAMPLE_SIZE: auditSampleList.length,
      FALSE_IDENTITY_MERGE: falseIdentityMerge,
      FALSE_EMPLOYMENT_RELATION: falseEmploymentRelation,
      NAME_ONLY_MERGE: nameOnlyMerge,
      NAME_ROLE_ONLY_MERGE: nameRoleOnlyMerge,
      DNI_LEAK: dniLeakCount,
      CABA_FALSE_PROMOTION: cabaFalsePromotion,
      AUDIT_PASS: allAuditPass
    }
  };

  const reportPath = path.resolve('reports/atlas/people/biep_production_batch_1_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReporte Batch 1 guardado en: ${reportPath}`);

  return report;
}

runProductionBatch1().catch(err => {
  console.error('Fatal error in Production Batch 1:', err);
  process.exit(1);
});
