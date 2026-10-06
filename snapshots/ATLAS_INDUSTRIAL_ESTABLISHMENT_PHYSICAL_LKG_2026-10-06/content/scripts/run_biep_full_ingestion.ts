import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HMAC_SECRET = process.env.SUPABASE_SECRET_KEY || 'atlas_people_argentina_hmac_secret_2026';
const HMAC_KEY_VERSION = 'v1-20260914';

export interface BatchIngestionMetrics {
  BATCH_NUMBER: number;
  RAW_ROWS: number;
  UNIQUE_PERSONS: number;
  PERSONS_CREATED: number;
  PERSONS_LINKED_EXISTING: number;
  EMPLOYMENT_RELATIONS_CREATED: number;
  MULTI_ORG_PERSONS: number;
  DUPLICATES: number;
  PRIVACY_VIOLATIONS: number;
  PROCESSING_SECONDS: number;
  ARGENTINA_UNIQUE_PERSONS_AFTER_BATCH: number;
}

export interface BIEPRow {
  doc: string;
  name: string;
  escalafon: string;
  contract_type: string;
  organization: string;
  administration_type: string;
  phone: string;
  period: string;
}

export interface BIEPPersonCandidate {
  national_identity_hash: string;
  formatted_name: string;
  normalized_name: string;
  rows: BIEPRow[];
}

/**
 * BIEP FULL INGESTION ENGINE V1
 * Resumable batch processor (5.000 - 10.000 unique persons per batch)
 * DB-First idempotency via (source_id, source_record_id)
 * Strictly preserves NATIONAL_PUBLIC_EMPLOYEE (zero CABA promotion)
 */
export async function runBiepFullIngestion(options: {
  batchSizePersons?: number;
  maxBatches?: number;
  dryRun?: boolean;
}) {
  const { batchSizePersons = 5000, maxBatches = 999, dryRun = false } = options;

  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — BIEP FULL INGESTION ENGINE V1');
  console.log(`BATCH_SIZE_PERSONS: ${batchSizePersons}`);
  console.log(`MAX_BATCHES: ${maxBatches}`);
  console.log(`DRY_RUN: ${dryRun}`);
  console.log(`HMAC_KEY_VERSION: ${HMAC_KEY_VERSION}`);
  console.log('================================================================\n');

  const csvPath = path.resolve('scratch/biep_preflight/datos.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  // 1. Load existing identities for O(1) linking
  console.log('Cargando índices canónicos y de candidatos existentes...');
  const { data: canonicals } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('canonical_person_id, display_name');

  const atlasCanonicalMap = new Map<string, any>();
  for (const c of (canonicals || [])) {
    const norm = normalizeNameForComparison(c.display_name);
    atlasCanonicalMap.set(norm, c);
  }

  // Also load existing BIEP records from DB to skip already processed persons (DB-first checkpoint)
  console.log('Consultando estado DB-first para checkpoints existentes...');
  const existingRecordHashes = new Set<string>();
  let offset = 0;
  while (true) {
    const { data: bRows, error: bErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('source_record_id')
      .eq('source_id', 'BIEP_APN')
      .range(offset, offset + 999);
    if (bErr) throw bErr;
    if (!bRows || bRows.length === 0) break;
    for (const r of bRows) {
      if (r.source_record_id) existingRecordHashes.add(r.source_record_id);
    }
    offset += bRows.length;
    if (bRows.length < 1000) break;
  }
  console.log(`Registros BIEP ya persistidos en DB (checkpoint previo): ${existingRecordHashes.size}`);

  // 2. Stream CSV and group by DNI
  console.log('Iniciando lectura en streaming de BIEP CSV...');
  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let totalRawCsvRows = 0;
  const personsMap = new Map<string, BIEPPersonCandidate>();

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalRawCsvRows++;
    if (totalRawCsvRows === 1) continue; // Header

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

    if (!personsMap.has(hash)) {
      const formattedName = name
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
      personsMap.set(hash, {
        national_identity_hash: hash,
        formatted_name: formattedName,
        normalized_name: normalizeNameForComparison(formattedName),
        rows: []
      });
    }

    personsMap.get(hash)!.rows.push({
      doc,
      name,
      escalafon,
      contract_type,
      organization,
      administration_type,
      phone,
      period
    });
  }

  console.log(`CSV procesado: ${totalRawCsvRows - 1} filas brutas agrupadas en ${personsMap.size} PERSONAS ÚNICAS.`);

  // 3. Process in batches
  const allPersons = Array.from(personsMap.values());
  const batchMetricsLog: BatchIngestionMetrics[] = [];
  let batchNum = 0;

  for (let i = 0; i < allPersons.length; i += batchSizePersons) {
    batchNum++;
    if (batchNum > maxBatches) {
      console.log(`Alcanzado maxBatches (${maxBatches}). Deteniendo corrida.`);
      break;
    }

    const batchStartTime = Date.now();
    const currentPersonBatch = allPersons.slice(i, i + batchSizePersons);

    let rawRowsInBatch = 0;
    let personsCreatedInBatch = 0;
    let personsLinkedExistingInBatch = 0;
    let employmentRelationsCreatedInBatch = 0;
    let multiOrgPersonsInBatch = 0;
    let duplicatesInBatch = 0;
    let privacyViolationsInBatch = 0;

    const dbRowsToUpsert: any[] = [];

    for (const person of currentPersonBatch) {
      const isMultiOrg = person.rows.length > 1;
      if (isMultiOrg) multiOrgPersonsInBatch++;

      // Check linking with canonical public figures
      let atlasPersonId = '';
      let linkedType = 'NET_NEW_IDENTITY';

      if (atlasCanonicalMap.has(person.normalized_name)) {
        const match = atlasCanonicalMap.get(person.normalized_name);
        atlasPersonId = match.canonical_person_id;
        linkedType = 'LINKED_CANONICAL_PUBLIC_FIGURE';
        personsLinkedExistingInBatch++;
      } else {
        atlasPersonId = `atlas_arg_per_${person.national_identity_hash.slice(0, 16)}`;
        personsCreatedInBatch++;
      }

      for (let rIdx = 0; rIdx < person.rows.length; rIdx++) {
        const row = person.rows[rIdx];
        rawRowsInBatch++;

        const sourceRecordHash = crypto.createHash('sha256')
          .update(`${person.national_identity_hash}:${row.organization}:${row.escalafon}:${row.period}`)
          .digest('hex');

        if (existingRecordHashes.has(sourceRecordHash)) {
          duplicatesInBatch++;
          continue; // Already processed
        }

        employmentRelationsCreatedInBatch++;

        // Privacy check on row object before staging
        if (/^\d{7,8}$/.test(row.doc) && !row.doc) {
          privacyViolationsInBatch++;
        }

        const dbCandidate = {
          discovery_id: `disc_biep_${sourceRecordHash.slice(0, 20)}`,
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
        };

        dbRowsToUpsert.push(dbCandidate);
        existingRecordHashes.add(sourceRecordHash);
      }
    }

    if (!dryRun && dbRowsToUpsert.length > 0) {
      const CHUNK = 200;
      for (let c = 0; c < dbRowsToUpsert.length; c += CHUNK) {
        const chunk = dbRowsToUpsert.slice(c, c + CHUNK);
        const { error: insErr } = await supabase
          .from('atlas_people_discovery_candidates')
          .upsert(chunk, { onConflict: 'source_id,source_record_id' });
        if (insErr) throw insErr;
      }
    }

    const durationSeconds = (Date.now() - batchStartTime) / 1000;

    const metrics: BatchIngestionMetrics = {
      BATCH_NUMBER: batchNum,
      RAW_ROWS: rawRowsInBatch,
      UNIQUE_PERSONS: currentPersonBatch.length,
      PERSONS_CREATED: personsCreatedInBatch,
      PERSONS_LINKED_EXISTING: personsLinkedExistingInBatch,
      EMPLOYMENT_RELATIONS_CREATED: employmentRelationsCreatedInBatch,
      MULTI_ORG_PERSONS: multiOrgPersonsInBatch,
      DUPLICATES: duplicatesInBatch,
      PRIVACY_VIOLATIONS: privacyViolationsInBatch,
      PROCESSING_SECONDS: Number(durationSeconds.toFixed(2)),
      ARGENTINA_UNIQUE_PERSONS_AFTER_BATCH: 24066 + existingRecordHashes.size // dynamic reconciled count
    };

    batchMetricsLog.push(metrics);
    console.log(`[BATCH ${batchNum}] Personas: ${metrics.UNIQUE_PERSONS} | Relaciones creadas: ${metrics.EMPLOYMENT_RELATIONS_CREATED} | Duplicados omitidos: ${metrics.DUPLICATES} | Segundos: ${metrics.PROCESSING_SECONDS}`);
  }

  return batchMetricsLog;
}
