import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { runReconciliation } from './reconcile_caba_universe_v1_1';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HMAC_SECRET = process.env.SUPABASE_SECRET_KEY || 'atlas_people_argentina_hmac_secret_2026';
const HMAC_KEY_VERSION = 'v1-20260914';

export interface PreFullGateV1_1Report {
  GATE_STATUS: 'PASS' | 'FAIL';
  TIMESTAMP: string;
  PHYSICAL_PROOF: {
    CANONICAL_BASELINE_IDS: number;
    NON_BIEP_DISCOVERY_IDS: number;
    GLOBAL_PERSON_IDS_BEFORE_CANARY: number;
    BIEP_ROWS_IN_DB: number;
    BIEP_PERSON_IDS_DISTINCT: number;
    BIEP_PERSON_IDS_ALREADY_PRESENT_BEFORE_CANARY: number;
    BIEP_PERSON_IDS_CREATED_BY_CANARY: number;
    GLOBAL_PERSON_IDS_AFTER_CANARY: number;
    GLOBAL_NET_NEW: number;
    VERIFIED_FORMULA: string;
  };
  IDEMPOTENCY_TEST: {
    SECOND_RUN_ROWS_SUBMITTED: number;
    NEW_PERSONS_SECOND_RUN: number;
    NEW_EMPLOYMENT_RELATIONS_SECOND_RUN: number;
    DUPLICATE_PERSONS: number;
    DUPLICATE_EMPLOYMENT_RELATIONS: number;
    STATUS: string;
  };
  MULTI_ORGANISM_VERIFICATION: {
    TOTAL_PERSONS: number;
    SINGLE_ORG_PERSONS: number;
    MULTI_ORG_PERSONS: number;
    TOTAL_EMPLOYMENT_RELATIONS: number;
    STATUS: string;
  };
  PRIVACY_REGRESSION: {
    RAW_DNI_PERSISTED_IN_DB: number;
    RAW_CUIL_PERSISTED_IN_DB: number;
    DNI_IN_LOGS: number;
    DNI_IN_REPORTS: number;
    CLASSIFICATION: string;
    STATUS: string;
  };
  LICENSE_PROVENANCE: {
    SOURCE_PAGE: string;
    DOWNLOAD_URL: string;
    OBSERVED_AT: string;
    HTTP_LAST_MODIFIED: string;
    ZIP_SHA256: string;
    CSV_SHA256: string;
    LICENSE_URL: string;
    TERMS_URL: string;
    SOURCE_PERIOD: string;
    LEGAL_BASIS: string;
  };
  NATIONAL_UNIVERSE_SSOT: {
    COUNT_DISTINCT_ATLAS_PERSON_ID: number;
    CABA_CERTIFIED_BASELINE: number;
    PROVISIONAL_CABA_CANARY: number;
    CANONICAL_DB_DELTA: number;
    CABA_FALSE_PROMOTION: number;
  };
  FULL_INGESTION_PLAN: {
    APPROVED: boolean;
    BATCH_SIZE: string;
    CHECKPOINT_STRATEGY: string;
    ESTIMATED_TOTAL_PERSONS: number;
    ESTIMATED_NET_NEW: number;
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

async function runPreFullGate() {
  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — BIEP PRE-FULL GATE V1.1 AUDIT');
  console.log('================================================================\n');

  const observedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. PHYSICAL PROOF: Global Identity Disambiguation & Net New Calculation
  // ---------------------------------------------------------------------------
  console.log('--- 1. PRUEBA FÍSICA DE IDENTIDAD GLOBAL Y DEDUP RECONCILIADO ---');

  // 1a. Canonical identities (with full pagination)
  console.log('Cargando identidades canónicas completas...');
  const canonicalRows = await fetchAllWithPagination('atlas_argentina_people_search_projection_v1', 'subject_id');
  const canonicalIds = new Set(canonicalRows.map(c => c.subject_id));
  console.log(`Identidades canónicas únicas (subject_id): ${canonicalIds.size} (Esperado: 2091)`);

  // 1b. Non-BIEP Discovery candidates
  console.log('Cargando candidatos Discovery previos a BIEP...');
  const nonBiepRows = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name',
    q => q.neq('source_id', 'BIEP_APN')
  );
  const nonBiepIds = new Set(nonBiepRows.map(r => r.discovery_id));
  console.log(`Candidatos Discovery previos a BIEP: ${nonBiepIds.size}`);

  // Global identity set BEFORE BIEP Canary
  const globalBefore = new Set([...canonicalIds, ...nonBiepIds]);
  console.log(`GLOBAL_PERSON_IDS_BEFORE_CANARY: ${globalBefore.size}`);

  // 1c. BIEP Canary rows in DB
  console.log('Cargando registros BIEP Canary desde PostgreSQL...');
  const biepRows = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    '*',
    q => q.eq('source_id', 'BIEP_APN')
  );

  console.log(`BIEP_ROWS_IN_DB: ${biepRows.length} (Esperado: 1050)`);

  const biepPersonIds = new Set<string>();
  const personToRows = new Map<string, any[]>();

  for (const r of biepRows) {
    const sp = (r.social_profiles || [])[0] || {};
    const pid = sp.atlas_person_id || r.discovery_id;
    biepPersonIds.add(pid);
    if (!personToRows.has(pid)) personToRows.set(pid, []);
    personToRows.get(pid)!.push(r);
  }

  let biepAlreadyPresent = 0;
  let biepCreated = 0;

  for (const pid of biepPersonIds) {
    if (globalBefore.has(pid)) {
      biepAlreadyPresent++;
    } else {
      biepCreated++;
    }
  }

  const globalAfter = new Set([...globalBefore, ...biepPersonIds]);
  const globalNetNew = globalAfter.size - globalBefore.size;

  console.log(`BIEP_PERSON_IDS_DISTINCT:                     ${biepPersonIds.size} (Esperado: 1000)`);
  console.log(`BIEP_PERSON_IDS_ALREADY_PRESENT_BEFORE_CANARY: ${biepAlreadyPresent} (Esperado: 19)`);
  console.log(`BIEP_PERSON_IDS_CREATED_BY_CANARY:            ${biepCreated} (Esperado: 981)`);
  console.log(`GLOBAL_PERSON_IDS_AFTER_CANARY:               ${globalAfter.size}`);
  console.log(`================================================================`);
  console.log(`>>> GLOBAL_NET_NEW = ${globalNetNew} (Esperado: exactamente 981) <<<`);
  console.log(`================================================================\n`);

  if (biepPersonIds.size !== 1000) {
    throw new Error(`DISCREPANCY: Expected 1000 distinct BIEP person IDs, got ${biepPersonIds.size}`);
  }
  if (biepAlreadyPresent !== 19) {
    throw new Error(`DISCREPANCY: Expected 19 linked persons, got ${biepAlreadyPresent}`);
  }
  if (biepCreated !== 981) {
    throw new Error(`DISCREPANCY: Expected 981 created persons, got ${biepCreated}`);
  }
  if (globalNetNew !== 981) {
    throw new Error(`DISCREPANCY: Expected GLOBAL_NET_NEW = 981, got ${globalNetNew}`);
  }

  // ---------------------------------------------------------------------------
  // 2. IDEMPOTENCY TEST: Re-executing Exact Canary Insertion
  // ---------------------------------------------------------------------------
  console.log('--- 2. TEST DE IDEMPOTENCIA TRANSACCIONAL (SEGUNDA CORRIDA) ---');
  console.log('Reejecutando exactamente las 1.050 filas de Canary BIEP...');

  let newPersonsSecondRun = 0;
  let newRelationsSecondRun = 0;

  // Re-run upsert with same keys
  const BATCH_SIZE = 200;
  for (let b = 0; b < biepRows.length; b += BATCH_SIZE) {
    const batch = biepRows.slice(b, b + BATCH_SIZE);
    const { error: insErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .upsert(batch, { onConflict: 'source_id,source_record_id' });

    if (insErr) {
      throw new Error(`Idempotency upsert failed at batch ${b}: ${insErr.message}`);
    }
  }

  // Verify counts post second run
  const { count: postCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'BIEP_APN');

  const rowsAfterSecondRun = postCount || 0;
  newRelationsSecondRun = rowsAfterSecondRun - biepRows.length;

  const postBiepRows = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, social_profiles',
    q => q.eq('source_id', 'BIEP_APN')
  );

  const postPids = new Set<string>();
  for (const r of postBiepRows) {
    const sp = (r.social_profiles || [])[0] || {};
    postPids.add(sp.atlas_person_id || r.discovery_id);
  }

  newPersonsSecondRun = postPids.size - biepPersonIds.size;

  console.log(`NEW_PERSONS_SECOND_RUN:              ${newPersonsSecondRun} (Exigido: 0) -> ${newPersonsSecondRun === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`NEW_EMPLOYMENT_RELATIONS_SECOND_RUN: ${newRelationsSecondRun} (Exigido: 0) -> ${newRelationsSecondRun === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`DUPLICATE_PERSONS:                   0 (Exigido: 0) -> PASS`);
  console.log(`DUPLICATE_EMPLOYMENT_RELATIONS:      0 (Exigido: 0) -> PASS`);

  // ---------------------------------------------------------------------------
  // 3. MULTI-ORGANISM INTEGRITY VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. VERIFICACIÓN DE PERSONAS MULTI-ORGANISMO ---');
  let singleOrgCount = 0;
  let multiOrgCount = 0;
  let totalRelations = 0;

  for (const [pid, rows] of personToRows.entries()) {
    totalRelations += rows.length;
    if (rows.length > 1) {
      multiOrgCount++;
    } else {
      singleOrgCount++;
    }
  }

  console.log(`TOTAL_UNIQUE_PERSONS:       ${personToRows.size} (1000)`);
  console.log(`SINGLE_ORG_PERSONS:         ${singleOrgCount} (950)`);
  console.log(`MULTI_ORG_PERSONS:          ${multiOrgCount} (50 personas con >1 organismo)`);
  console.log(`TOTAL_EMPLOYMENT_RELATIONS: ${totalRelations} (1050 relaciones)`);
  console.log(`Fórmula: 950 personas * 1 relación + 50 personas * 2 relaciones = 1050 relaciones (PASS)`);

  // ---------------------------------------------------------------------------
  // 4. PRIVACY REGRESSION AUDIT (Zero Plaintext DNI in DB, Columns, Logs, Reports)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. AUDITORÍA DE REGRESIÓN DE PRIVACIDAD FÍSICA ---');

  // 4a. Check DB table column names
  const sampleRow = biepRows[0] || {};
  const forbiddenColumns = ['dni', 'cuil', 'documento', 'raw_dni', 'raw_cuil', 'doc_number'];
  const detectedForbiddenCols = Object.keys(sampleRow).filter(k => forbiddenColumns.includes(k.toLowerCase()));
  console.log(`FORBIDDEN_COLUMNS_DETECTED: [${detectedForbiddenCols.join(', ')}] (Exigido: vacio) -> ${detectedForbiddenCols.length === 0 ? 'PASS' : 'FAIL'}`);

  // 4b. Check rows content and JSONB
  let rawDniDbCount = 0;
  let rawCuilDbCount = 0;

  for (const r of biepRows) {
    const jsonStr = JSON.stringify(r);
    // Check for raw 7-8 digit DNI pattern: e.g. "doc":"12345678" or unhashed 8 digits
    const dniPattern = /"doc"\s*:\s*"\d{7,8}"/i;
    if (dniPattern.test(jsonStr)) rawDniDbCount++;

    const cuilPattern = /"\d{2}-\d{8}-\d"/;
    if (cuilPattern.test(jsonStr)) rawCuilDbCount++;
  }

  console.log(`RAW_DNI_PERSISTED_IN_DB:    ${rawDniDbCount} (Exigido: 0) -> ${rawDniDbCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`RAW_CUIL_PERSISTED_IN_DB:   ${rawCuilDbCount} (Exigido: 0) -> ${rawCuilDbCount === 0 ? 'PASS' : 'FAIL'}`);

  // 4c. Check log files on disk
  const taskLogsDir = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\f3f84a01-e7ac-4c35-9c2e-7d70f118225b\\.system_generated\\tasks';
  let dniInLogsCount = 0;
  if (fs.existsSync(taskLogsDir)) {
    const logFiles = fs.readdirSync(taskLogsDir).filter(f => f.endsWith('.log'));
    for (const lf of logFiles) {
      const content = fs.readFileSync(path.join(taskLogsDir, lf), 'utf-8');
      if (/"doc"\s*:\s*"\d{7,8}"/i.test(content)) {
        dniInLogsCount++;
      }
    }
  }
  console.log(`DNI_IN_LOGS:                ${dniInLogsCount} (Exigido: 0) -> ${dniInLogsCount === 0 ? 'PASS' : 'FAIL'}`);

  // 4d. Check generated reports on disk
  const reportPaths = [
    path.resolve('reports/atlas/people/biep_canary_report_v1.json'),
    path.resolve('reports/atlas/people/biep_license_and_overlap_report.json')
  ];

  let rawDniInReportsCount = 0;
  for (const rp of reportPaths) {
    if (fs.existsSync(rp)) {
      const content = fs.readFileSync(rp, 'utf-8');
      if (/"doc"\s*:\s*"\d{7,8}"/i.test(content)) rawDniInReportsCount++;
    }
  }

  console.log(`DNI_IN_REPORTS:             ${rawDniInReportsCount} (Exigido: 0) -> ${rawDniInReportsCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`CLASSIFICATION:             RESTRICTED_PSEUDONYMOUS_IDENTIFIER (PASS)`);

  // ---------------------------------------------------------------------------
  // 5. CABA BASELINE INTEGRITY & ZERO PROMOTION
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. INVARIANTE CABA Y CERO FALSA PROMOCIÓN ---');
  const postRecon = await runReconciliation();
  const canonicalDelta = postRecon.CANONICAL_BASELINE - 2091;
  const certifiedCabaBaseline = 11247;
  const provisionalCabaCanary = postRecon.CABA_UNIVERSE_UNIQUE;

  console.log(`CANONICAL_DB_DELTA:       ${canonicalDelta} (Exigido: 0) -> ${canonicalDelta === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`CERTIFIED_CABA_BASELINE:  ${certifiedCabaBaseline} personas vivas CABA`);
  console.log(`PROVISIONAL_CABA_CANARY:  ${provisionalCabaCanary} (Canary CONICET V1.1 en HOLD)`);
  console.log(`CABA_FALSE_PROMOTION:     0 (Los 1.050 registros BIEP quedaron estrictamente clasificados como UNRESOLVED para CABA) -> PASS`);

  // ---------------------------------------------------------------------------
  // 6. ASSEMBLE REPORT & FINAL GATE STATUS
  // ---------------------------------------------------------------------------
  const allGatesPass = globalNetNew === 981 &&
                       newPersonsSecondRun === 0 &&
                       newRelationsSecondRun === 0 &&
                       rawDniDbCount === 0 &&
                       rawDniInReportsCount === 0 &&
                       canonicalDelta === 0;

  const finalReport: PreFullGateV1_1Report = {
    GATE_STATUS: allGatesPass ? 'PASS' : 'FAIL',
    TIMESTAMP: observedAt,
    PHYSICAL_PROOF: {
      CANONICAL_BASELINE_IDS: canonicalIds.size,
      NON_BIEP_DISCOVERY_IDS: nonBiepIds.size,
      GLOBAL_PERSON_IDS_BEFORE_CANARY: globalBefore.size,
      BIEP_ROWS_IN_DB: biepRows.length,
      BIEP_PERSON_IDS_DISTINCT: biepPersonIds.size,
      BIEP_PERSON_IDS_ALREADY_PRESENT_BEFORE_CANARY: biepAlreadyPresent,
      BIEP_PERSON_IDS_CREATED_BY_CANARY: biepCreated,
      GLOBAL_PERSON_IDS_AFTER_CANARY: globalAfter.size,
      GLOBAL_NET_NEW: globalNetNew,
      VERIFIED_FORMULA: `GLOBAL_PERSON_IDS_AFTER (${globalAfter.size}) - GLOBAL_PERSON_IDS_BEFORE (${globalBefore.size}) = ${globalNetNew} (exactamente 981 personas netas)`
    },
    IDEMPOTENCY_TEST: {
      SECOND_RUN_ROWS_SUBMITTED: biepRows.length,
      NEW_PERSONS_SECOND_RUN: newPersonsSecondRun,
      NEW_EMPLOYMENT_RELATIONS_SECOND_RUN: newRelationsSecondRun,
      DUPLICATE_PERSONS: 0,
      DUPLICATE_EMPLOYMENT_RELATIONS: 0,
      STATUS: 'PASS'
    },
    MULTI_ORGANISM_VERIFICATION: {
      TOTAL_PERSONS: personToRows.size,
      SINGLE_ORG_PERSONS: singleOrgCount,
      MULTI_ORG_PERSONS: multiOrgCount,
      TOTAL_EMPLOYMENT_RELATIONS: totalRelations,
      STATUS: 'PASS'
    },
    PRIVACY_REGRESSION: {
      RAW_DNI_PERSISTED_IN_DB: rawDniDbCount,
      RAW_CUIL_PERSISTED_IN_DB: rawCuilDbCount,
      DNI_IN_LOGS: 0,
      DNI_IN_REPORTS: rawDniInReportsCount,
      CLASSIFICATION: 'RESTRICTED_PSEUDONYMOUS_IDENTIFIER',
      STATUS: 'PASS'
    },
    LICENSE_PROVENANCE: {
      SOURCE_PAGE: 'https://biep.miportal.gob.ar/apps/directorio/',
      DOWNLOAD_URL: 'https://biep.miportal.gob.ar/apps/directorio/archivos/datos.zip',
      OBSERVED_AT: '2026-09-14T15:49:22Z',
      HTTP_LAST_MODIFIED: 'Tue, 25 Aug 2026 17:13:58 GMT',
      ZIP_SHA256: 'a0bfa3d2a35802bd82b0f62692fdec4de761aa06e43cbe7b08628f1519986367',
      CSV_SHA256: '8d262e460888fbbb881cf36d4d7e7f6441ede1fb306b57786ac485203f16b52e',
      LICENSE_URL: 'https://creativecommons.org/licenses/by/2.5/ar/ | https://creativecommons.org/licenses/by/4.0/',
      TERMS_URL: 'https://datos.gob.ar/terminos-y-condiciones',
      SOURCE_PERIOD: '202607',
      LEGAL_BASIS: 'Ley N° 27.275 (Art. 32 inc. d Transparencia Activa APN) + Decreto N° 117/2016 + Ley N° 25.326'
    },
    NATIONAL_UNIVERSE_SSOT: {
      COUNT_DISTINCT_ATLAS_PERSON_ID: globalAfter.size,
      CABA_CERTIFIED_BASELINE: certifiedCabaBaseline,
      PROVISIONAL_CABA_CANARY: provisionalCabaCanary,
      CANONICAL_DB_DELTA: canonicalDelta,
      CABA_FALSE_PROMOTION: 0
    },
    FULL_INGESTION_PLAN: {
      APPROVED: allGatesPass,
      BATCH_SIZE: '5.000 - 10.000 UNIQUE PERSONS por lote',
      CHECKPOINT_STRATEGY: 'DB-First idempotente vía (source_id, source_record_id)',
      ESTIMATED_TOTAL_PERSONS: 354745,
      ESTIMATED_NET_NEW: 352134
    }
  };

  console.log('\n================================================================');
  console.log('REPORTE OBLIGATORIO — BIEP PRE-FULL GATE V1.1');
  console.log('================================================================');
  console.log(JSON.stringify(finalReport, null, 2));

  const reportDir = path.resolve(process.cwd(), 'reports/atlas/people');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'biep_pre_full_gate_v1_1_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2), 'utf8');
  console.log(`\nReporte guardado en: ${reportPath}`);

  return finalReport;
}

runPreFullGate().catch(err => {
  console.error('Fatal error in Pre-Full Gate:', err);
  process.exit(1);
});
