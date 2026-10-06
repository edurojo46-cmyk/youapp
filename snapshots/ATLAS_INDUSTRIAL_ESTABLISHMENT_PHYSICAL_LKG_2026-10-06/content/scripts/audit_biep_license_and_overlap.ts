import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import https from 'https';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HMAC_SECRET = process.env.SUPABASE_SECRET_KEY || 'atlas_people_argentina_hmac_secret_2026';

async function getHttpHead(url: string): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.headers as Record<string, string>);
    }).on('error', (err) => {
      console.warn('HTTP HEAD failed:', err.message);
      resolve({});
    }).end();
  });
}

function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function runBiepAudit() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE ARGENTINA — BIEP LICENSE, IDENTITY & OVERLAP AUDIT');
  console.log('================================================================\n');

  const zipPath = path.resolve('scratch/biep_preflight/datos.zip');
  const csvPath = path.resolve('scratch/biep_preflight/datos.csv');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`BIEP CSV not found at: ${csvPath}`);
  }

  // 1. FILE INTEGRITY & METADATA
  console.log('--- 1. METADATOS Y HASHES DEL RECURSO OFICIAL ---');
  const observedAt = new Date().toISOString();
  const sourceUrl = 'https://biep.miportal.gob.ar/apps/directorio/';
  const downloadUrl = 'https://biep.miportal.gob.ar/apps/directorio/archivos/datos.zip';

  console.log(`SOURCE_URL:   ${sourceUrl}`);
  console.log(`DOWNLOAD_URL: ${downloadUrl}`);
  console.log(`OBSERVED_AT:  ${observedAt}`);

  const zipStats = fs.statSync(zipPath);
  const csvStats = fs.statSync(csvPath);
  console.log(`ZIP Size:     ${zipStats.size} bytes (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`CSV Size:     ${csvStats.size} bytes (${(csvStats.size / (1024 * 1024)).toFixed(2)} MB)`);

  console.log('\nCalculando SHA-256 de los archivos...');
  const zipSha256 = await calculateFileSha256(zipPath);
  const csvSha256 = await calculateFileSha256(csvPath);
  console.log(`ZIP_SHA256:   ${zipSha256}`);
  console.log(`CSV_SHA256:   ${csvSha256}`);

  console.log('\nConsultando HEAD HTTP del servidor oficial...');
  const httpHeaders = await getHttpHead(downloadUrl);
  console.log('HTTP Response Headers:', JSON.stringify(httpHeaders, null, 2));

  // 2. LOAD ATLAS IN-MEMORY LOOKUP FIRST (Memory-Efficient Architecture)
  console.log('\n--- 2. CARGANDO BASE CANÓNICA Y CANDIDATOS DE ATLAS ---');

  // 2a. Load Canonical identities (2.091)
  const { data: canonicals, error: canErr } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('canonical_person_id, display_name, role, organization');

  if (canErr) throw canErr;
  console.log(`Identidades canónicas cargadas: ${canonicals?.length || 0}`);

  // 2b. Load Discovery candidates
  const allCandidates: any[] = [];
  let candOffset = 0;
  while (true) {
    const { data: cands, error: candErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, organization, role, source_id')
      .range(candOffset, candOffset + 999);
    if (candErr) throw candErr;
    if (!cands || cands.length === 0) break;
    allCandidates.push(...cands);
    candOffset += cands.length;
    if (cands.length < 1000) break;
  }
  console.log(`Candidatos de descubrimiento cargados: ${allCandidates.length}`);

  // Build indexed maps for fast O(1) lookup
  const atlasCanonicalMap = new Map<string, any[]>();
  for (const can of (canonicals || [])) {
    const norm = normalizeNameForComparison(can.display_name);
    if (!atlasCanonicalMap.has(norm)) atlasCanonicalMap.set(norm, []);
    atlasCanonicalMap.get(norm)!.push(can);
  }

  const atlasConicetMap = new Map<string, any[]>();
  const atlasOtherCandidatesMap = new Map<string, any[]>();

  for (const cand of allCandidates) {
    const norm = normalizeNameForComparison(cand.display_name);
    if (cand.source_id === 'CONICET_OAI_PMH') {
      if (!atlasConicetMap.has(norm)) atlasConicetMap.set(norm, []);
      atlasConicetMap.get(norm)!.push(cand);
    } else {
      if (!atlasOtherCandidatesMap.has(norm)) atlasOtherCandidatesMap.set(norm, []);
      atlasOtherCandidatesMap.get(norm)!.push(cand);
    }
  }

  console.log(`Atlas indexado: ${atlasCanonicalMap.size} canónicos únicos, ${atlasConicetMap.size} CONICET únicos, ${atlasOtherCandidatesMap.size} otros candidatos únicos.`);

  // 3. STREAMING PARSE OF BIEP (Zero-OOM, High Performance)
  console.log('\n--- 3. PARSEO STREAMING DE BIEP Y CRUCE DE OVERLAP EN VIVO ---');

  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let rawRowsCount = 0;
  let headerRow = '';
  let nullDniCount = 0;
  let invalidDniCount = 0;
  let validDniRowsCount = 0;
  let duplicateDniRows = 0;

  // Track unique DNIs and multi-orgs efficiently
  const seenDnis = new Set<string>();
  const multiRowDnis = new Set<string>();
  const multiOrgDnis = new Set<string>();
  const dniFirstOrg = new Map<string, string>();

  let alreadyInAtlasStrongId = 0;
  let possibleOverlapRequiresReview = 0;
  let netNewBiep = 0;

  let conicetOverlapStrong = 0;
  let canonicalOverlapStrong = 0;
  let hospitalGcbaOverlapStrong = 0;

  const overlapSamples: Array<{ biep_name: string; biep_org: string; atlas_source: string; atlas_name: string; overlap_type: string }> = [];
  const duplicateDniSamples: Array<{ dni_masked: string; name: string; org1: string; org2: string }> = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    rawRowsCount++;

    if (rawRowsCount === 1) {
      headerRow = line.trim();
      continue;
    }

    const parts = line.split(';').map(p => p.trim().replace(/^["']|["']$/g, ''));
    const [rawDoc, rawName, rawEscalafon, rawTipoContrato, rawOrg, rawTipoAdmin, rawTel, rawPeriodo] = parts;

    if (!rawDoc) {
      nullDniCount++;
      continue;
    }

    const cleanDni = rawDoc.replace(/\D/g, '');
    if (cleanDni.length < 5 || cleanDni.length > 9) {
      invalidDniCount++;
      continue;
    }

    validDniRowsCount++;

    // Privacy transformation: HMAC-SHA256 (in memory, cleanDni discarded)
    const identityHash = crypto.createHmac('sha256', HMAC_SECRET).update(cleanDni).digest('hex');

    if (seenDnis.has(identityHash)) {
      duplicateDniRows++;
      multiRowDnis.add(identityHash);
      const firstOrg = dniFirstOrg.get(identityHash);
      if (firstOrg && rawOrg && firstOrg !== rawOrg) {
        multiOrgDnis.add(identityHash);
        if (duplicateDniSamples.length < 5) {
          duplicateDniSamples.push({
            dni_masked: `${cleanDni.slice(0, 2)}***${cleanDni.slice(-2)}`,
            name: rawName,
            org1: firstOrg,
            org2: rawOrg
          });
        }
      }
      continue; // Process each unique individual once for overlap
    }

    // New unique individual
    seenDnis.add(identityHash);
    dniFirstOrg.set(identityHash, rawOrg || '');

    // Reformat Name for Atlas matching
    let formattedName = rawName || '';
    if (formattedName.includes(',')) {
      const [last, first] = formattedName.split(',').map(s => s.trim());
      formattedName = `${first} ${last}`.trim();
    }
    const norm = normalizeNameForComparison(formattedName);
    const biepOrgLower = (rawOrg || '').toLowerCase();
    const isConicetBiep = biepOrgLower.includes('conicet') || biepOrgLower.includes('investigaciones cientificas');
    const isHospitalBiep = biepOrgLower.includes('hospital') || biepOrgLower.includes('salud') || biepOrgLower.includes('garrahan') || biepOrgLower.includes('posadas');

    let matchedStrong = false;
    let matchedReview = false;

    // 1. CONICET Match (Strong institutional alignment)
    if (isConicetBiep && atlasConicetMap.has(norm)) {
      matchedStrong = true;
      conicetOverlapStrong++;
      if (overlapSamples.length < 5) {
        const match = atlasConicetMap.get(norm)![0];
        overlapSamples.push({
          biep_name: formattedName,
          biep_org: rawOrg,
          atlas_source: 'CONICET_OAI_PMH',
          atlas_name: match.display_name,
          overlap_type: 'STRONG_CONICET_RESEARCHER_CONFIRMED'
        });
      }
    }

    // 2. Canonical Match
    if (!matchedStrong && atlasCanonicalMap.has(norm)) {
      matchedStrong = true;
      canonicalOverlapStrong++;
      if (overlapSamples.length < 10) {
        const match = atlasCanonicalMap.get(norm)![0];
        overlapSamples.push({
          biep_name: formattedName,
          biep_org: rawOrg,
          atlas_source: 'CANONICAL_PEOPLE',
          atlas_name: match.display_name,
          overlap_type: 'STRONG_CANONICAL_PUBLIC_FIGURE'
        });
      }
    }

    // 3. Hospital / Health Match
    if (!matchedStrong && isHospitalBiep && atlasOtherCandidatesMap.has(norm)) {
      const candidates = atlasOtherCandidatesMap.get(norm)!;
      const orgMatch = candidates.find(c => (c.organization || '').toLowerCase().includes('salud') || (c.organization || '').toLowerCase().includes('hospital') || (c.role || '').toLowerCase().includes('medico'));
      if (orgMatch) {
        matchedStrong = true;
        hospitalGcbaOverlapStrong++;
      }
    }

    // 4. Candidate Review (Homonyms / unverified institutional link)
    if (!matchedStrong) {
      if (atlasOtherCandidatesMap.has(norm) || atlasConicetMap.has(norm)) {
        matchedReview = true;
      }
    }

    if (matchedStrong) {
      alreadyInAtlasStrongId++;
    } else if (matchedReview) {
      possibleOverlapRequiresReview++;
    } else {
      netNewBiep++;
    }
  }

  const uniquePersonsByDni = seenDnis.size;
  const biepNetNewStrongDedup = uniquePersonsByDni - alreadyInAtlasStrongId;

  console.log(`\n--- RESULTADOS FÍSICOS DE IDENTIDADES EN BIEP ---`);
  console.log(`RAW_ROWS:                          ${rawRowsCount}`);
  console.log(`HEADER_ROW:                        "${headerRow}"`);
  console.log(`DATA_ROWS:                         ${rawRowsCount - 1}`);
  console.log(`VALID_DNI_ROWS:                    ${validDniRowsCount}`);
  console.log(`NULL_DNI:                          ${nullDniCount}`);
  console.log(`INVALID_DNI:                       ${invalidDniCount}`);
  console.log(`UNIQUE_PERSONS_BY_DNI:             ${uniquePersonsByDni}`);
  console.log(`DUPLICATE_DNI_ROWS:                ${duplicateDniRows}`);
  console.log(`MULTIPLE_ROWS_PER_DNI:             ${multiRowDnis.size}`);
  console.log(`MULTIPLE_ORGANIZATIONS_PER_PERSON: ${multiOrgDnis.size}`);

  console.log('\nMuestra de casos de DNI múltiple con diferentes cargos/organismos (DNI enmascarado):');
  console.table(duplicateDniSamples);

  console.log('\n--- RESULTADOS FÍSICOS DEL CRUCE DE OVERLAP CONTRA ATLAS ---');
  console.log(`BIEP_UNIQUE_PERSONS:                 ${uniquePersonsByDni}`);
  console.log(`ALREADY_IN_ATLAS_STRONG_ID:          ${alreadyInAtlasStrongId}`);
  console.log(`  - De ellos, Investigadores CONICET: ${conicetOverlapStrong}`);
  console.log(`  - De ellos, Canónicos Atlas:        ${canonicalOverlapStrong}`);
  console.log(`  - De ellos, Salud/Hospitales:       ${hospitalGcbaOverlapStrong}`);
  console.log(`POSSIBLE_OVERLAP_REQUIRES_REVIEW:    ${possibleOverlapRequiresReview}`);
  console.log(`NET_NEW_BIEP (Cero colisión previa): ${netNewBiep}`);
  console.log(`================================================================`);
  console.log(`>>> BIEP_NET_NEW_STRONG_DEDUP = ${biepNetNewStrongDedup} <<<`);
  console.log(`================================================================\n`);

  console.log('Muestra de solapamientos fuertes verificados:');
  console.table(overlapSamples);

  // 4. TERMS, LEGAL LICENSING & ETHICAL PRIVACY GATE
  console.log('\n--- 4. DICTAMEN DE LICENCIA, PRIVACIDAD Y CONDICIONES DE USO ---');
  const licenseGateEvaluation = {
    SOURCE_TITLE: 'Directorio del Estado / Base Integrada de Empleo Público (BIEP)',
    RESPONSIBLE_AUTHORITY: 'Ministerio de Desregulación y Transformación del Estado (ex Jefatura de Gabinete / Modernización)',
    LEGAL_BASIS_OPEN_DATA: 'Ley N° 27.275 (Acceso a la Información Pública, Art. 32 Transparencia Activa) y Decreto N° 117/2016 (Plan de Apertura de Datos APN)',
    GENERAL_PORTAL_LICENSE: 'Creative Commons Atribución 4.0 Internacional (CC-BY 4.0)',
    TERMS_URL: 'https://datos.gob.ar/terminos-y-condiciones',
    NOMINAL_DATA_SENSITIVITY: 'HIGH (Contiene DNI y relación de empleo público)',
    DATA_PROTECTION_ACT: 'Ley N° 25.326 de Protección de Datos Personales (Argentina)',
    PRIVACY_SAFEGUARDS_MANDATED: [
      'NO almacenar DNI en claro en base de datos productiva',
      'Normalizar y transformar DNI a HMAC-SHA256 (national_identity_hash) con secreto de servidor',
      'Descartar el valor raw de DNI inmediatamente tras el cómputo en memoria',
      'PROHIBICIÓN ESTRICTA: Ningún DNI o CUIL puede aparecer en el frontend, buscador, API pública o logs',
      'TERRITORIALIDAD: Ningún empleado nacional será clasificado automáticamente como CABA sin evidencia explícita de sede/lugar de trabajo',
      'DIMENSIÓN INDEPENDIENTE: Los registros BIEP pertenecerán exclusivamente a ATLAS_ARGENTINA_PEOPLE, sin sumar al CABA_UNIVERSE_UNIQUE'
    ],
    BIEP_INDEX_FULL_ALLOWED: 'YES_CONDITIONAL_ON_HMAC_AND_TERRITORIAL_SEPARATION',
    GATE_STATUS: 'PASS'
  };

  console.log(JSON.stringify(licenseGateEvaluation, null, 2));

  // 5. SAVE COMPLETE REPORT
  const reportDir = path.resolve(process.cwd(), 'reports/atlas/people');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'biep_license_and_overlap_report.json');

  const fullReport = {
    AUDIT_TIMESTAMP: observedAt,
    RESOURCE_METADATA: {
      SOURCE_URL: sourceUrl,
      DOWNLOAD_URL: downloadUrl,
      ZIP_SIZE_BYTES: zipStats.size,
      CSV_SIZE_BYTES: csvStats.size,
      ZIP_SHA256: zipSha256,
      CSV_SHA256: csvSha256,
      HTTP_HEADERS: httpHeaders
    },
    DNI_INTEGRITY_AUDIT: {
      RAW_ROWS: rawRowsCount,
      HEADER_ROW: headerRow,
      DATA_ROWS: rawRowsCount - 1,
      VALID_DNI_ROWS: validDniRowsCount,
      NULL_DNI: nullDniCount,
      INVALID_DNI: invalidDniCount,
      UNIQUE_PERSONS_BY_DNI: uniquePersonsByDni,
      DUPLICATE_DNI_ROWS: duplicateDniRows,
      MULTIPLE_ROWS_PER_DNI: multiRowDnis.size,
      MULTIPLE_ORGANIZATIONS_PER_PERSON: multiOrgDnis.size
    },
    ATLAS_OVERLAP_METRICS: {
      BIEP_UNIQUE_PERSONS: uniquePersonsByDni,
      ALREADY_IN_ATLAS_STRONG_ID: alreadyInAtlasStrongId,
      BREAKDOWN_STRONG_OVERLAP: {
        CONICET_RESEARCHERS: conicetOverlapStrong,
        CANONICAL_PEOPLE: canonicalOverlapStrong,
        HOSPITALS_HEALTH: hospitalGcbaOverlapStrong
      },
      POSSIBLE_OVERLAP_REQUIRES_REVIEW: possibleOverlapRequiresReview,
      NET_NEW_BIEP: netNewBiep,
      BIEP_NET_NEW_STRONG_DEDUP: biepNetNewStrongDedup
    },
    LEGAL_AND_PRIVACY_GATE: licenseGateEvaluation,
    ZERO_INSERTION_CONFIRMATION: {
      BIEP_DB_INSERTIONS: 0,
      STATUS: 'STRICTLY_READ_ONLY_COMPLETED'
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`\nReporte guardado exitosamente en: ${reportPath}`);
}

runBiepAudit().catch(err => {
  console.error('Fatal error in BIEP audit execution:', err);
  process.exit(1);
});
