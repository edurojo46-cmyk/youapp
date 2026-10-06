import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GlobalIdentityResolutionMetrics {
  TIMESTAMP: string;
  CANONICAL_RECORDS_MAPPED: number;
  DISCOVERY_RECORDS_MAPPED: number;
  BIEP_RECORDS_MAPPED: number;
  TOTAL_IDENTITY_MAP_ROWS: number;
  OVERLAP_AUDIT: {
    CANONICAL_DISCOVERY_STRONG_OVERLAP: number;
    CANONICAL_DISCOVERY_SAME_GLOBAL_PERSON_ID: number;
    CANONICAL_DISCOVERY_UNRESOLVED_OVERLAP: number;
    OPENALEX_CONICET_OVERLAP: number;
    WIKIDATA_CANONICAL_OVERLAP: number;
    BIEP_EXISTING_OVERLAP: number;
  };
  SSOT_RECOUNT: {
    GLOBAL_PERSON_IDS_BEFORE_BIEP: number;
    BIEP_LINKED_EXISTING_GLOBAL: number;
    BIEP_NET_NEW_GLOBAL: number;
    GLOBAL_PERSON_IDS_AFTER_BIEP_CANARY: number;
    GLOBAL_NET_NEW: number;
    COUNT_DISTINCT_ATLAS_PERSON_ID: number;
  };
  PRIVACY_REGRESSION: {
    RAW_DNI_IN_IDENTITY_MAP: number;
    RAW_CUIL_IN_IDENTITY_MAP: number;
    CLASSIFICATION: string;
    STATUS: string;
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

export async function buildAtlasGlobalIdentityMap(): Promise<GlobalIdentityResolutionMetrics> {
  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — GLOBAL IDENTITY SSOT RESOLUTION ENGINE');
  console.log('================================================================\n');

  const startTime = Date.now();

  // ---------------------------------------------------------------------------
  // 1. CARGA DE ENTIDADES CANÓNICAS (2.091 entidades)
  // ---------------------------------------------------------------------------
  console.log('--- 1. CARGANDO ENTIDADES CANÓNICAS (atlas_argentina_people_search_projection_v1) ---');
  const canonicalRows = await fetchAllWithPagination(
    'atlas_argentina_people_search_projection_v1',
    'subject_id, canonical_person_id, display_name, role, organization, social_profiles'
  );
  console.log(`Entidades canónicas cargadas: ${canonicalRows.length} (Esperado: 2.091)`);

  const canonicalNormNameMap = new Map<string, any>();
  const identityMapRows: any[] = [];

  for (const c of canonicalRows) {
    const atlasPersonId = c.subject_id; // Invariant UUID
    const normName = normalizeNameForComparison(c.display_name);
    canonicalNormNameMap.set(normName, { ...c, atlasPersonId });

    identityMapRows.push({
      atlas_person_id: atlasPersonId,
      source_id: 'CANONICAL_ATLAS',
      source_person_id: c.subject_id,
      identifier_type: 'CANONICAL_SUBJECT_ID',
      identifier_value: c.subject_id,
      evidence_id: `canonical_proj_${c.subject_id}`,
      confidence: 1.0,
      resolution_method: 'CANONICAL_DIRECT',
      observed_at: new Date(startTime).toISOString()
    });
  }

  console.log(`Registros canónicos mapeados: ${identityMapRows.length}`);

  // ---------------------------------------------------------------------------
  // 2. CARGA DE CANDIDATOS DISCOVERY (21.975 no-BIEP)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. CARGANDO CANDIDATOS DISCOVERY (atlas_people_discovery_candidates) ---');
  const nonBiepCandidates = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name, organization, role, source_id, source_record_id, social_profiles, location_evidence',
    q => q.neq('source_id', 'BIEP_APN')
  );
  console.log(`Candidatos Discovery previos a BIEP: ${nonBiepCandidates.length} (Esperado: 21.975)`);

  let wikidataCanonicalOverlap = 0;
  let canonicalDiscoveryStrongOverlap = 0;
  let canonicalDiscoverySameGlobalPersonId = 0;
  let canonicalDiscoveryUnresolvedOverlap = 0;
  let openalexConicetOverlap = 0;

  // Index OpenAlex researchers by normalized name + org keywords
  const openalexResearchers = new Map<string, { discovery_id: string; org: string }>();

  for (const cand of nonBiepCandidates) {
    if (cand.source_id === 'OPENALEX_CABA') {
      const normName = normalizeNameForComparison(cand.display_name);
      openalexResearchers.set(normName, {
        discovery_id: cand.discovery_id,
        org: (cand.organization || '').toLowerCase()
      });
    }
  }

  // Second pass: Resolve each Discovery candidate
  for (const cand of nonBiepCandidates) {
    const normName = normalizeNameForComparison(cand.display_name);
    let resolvedPersonId = '';
    let resolutionMethod = 'DISCOVERY_INDEPENDENT';
    let confidence = 1.0;

    // A. Check CONICET overlap with OpenAlex (multi-factor: name + institution token)
    if (cand.source_id === 'CONICET_OAI_PMH' && openalexResearchers.has(normName)) {
      const oMatch = openalexResearchers.get(normName)!;
      const conicetOrg = (cand.organization || '').toLowerCase();
      const sharedInst = (conicetOrg.includes('uba') && oMatch.org.includes('uba')) ||
                         (conicetOrg.includes('conicet') && oMatch.org.includes('conicet')) ||
                         (conicetOrg.includes('favaloro') && oMatch.org.includes('favaloro')) ||
                         (conicetOrg.includes('hospital') && oMatch.org.includes('hospital'));

      if (sharedInst) {
        openalexConicetOverlap++;
        resolvedPersonId = oMatch.discovery_id;
        resolutionMethod = 'CROSS_SOURCE_ACADEMIC_AFFILIATION_MATCH';
      }
    }

    // B. Check overlap with Canonical Figures (multi-factor: name + organization/role)
    if (!resolvedPersonId && canonicalNormNameMap.has(normName)) {
      const canMatch = canonicalNormNameMap.get(normName);
      const candOrg = (cand.organization || '').toLowerCase();
      const canOrg = (canMatch.organization || '').toLowerCase();
      const candRole = (cand.role || '').toLowerCase();
      const canRole = (canMatch.role || '').toLowerCase();

      const orgTokensCand = candOrg.split(/[\s,.-]+/).filter((t: string) => t.length > 3);
      const orgTokensCan = canOrg.split(/[\s,.-]+/).filter((t: string) => t.length > 3);
      const sharesOrgToken = orgTokensCand.some((t: string) => orgTokensCan.includes(t));

      if (cand.source_id === 'WIKIDATA_CABA_PERSONS' && sharesOrgToken) {
        wikidataCanonicalOverlap++;
      }

      if (sharesOrgToken || (candRole && canRole && candRole === canRole)) {
        canonicalDiscoveryStrongOverlap++;
        canonicalDiscoverySameGlobalPersonId++;
        resolvedPersonId = canMatch.atlasPersonId;
        resolutionMethod = 'CANONICAL_MULTIFACTOR_ROLE_ORG_MATCH';
      } else {
        // Name matched, but distinct domain/institution -> UNRESOLVED_OVERLAP
        canonicalDiscoveryUnresolvedOverlap++;
        // Maintain as distinct identity!
        resolvedPersonId = cand.discovery_id;
        resolutionMethod = 'DISCOVERY_INDEPENDENT';
      }
    }

    // Default: independent discovery identity preserving discovery_id
    if (!resolvedPersonId) {
      resolvedPersonId = cand.discovery_id;
      resolutionMethod = 'DISCOVERY_INDEPENDENT';
    }

    identityMapRows.push({
      atlas_person_id: resolvedPersonId,
      source_id: cand.source_id,
      source_person_id: cand.discovery_id,
      identifier_type: 'DISCOVERY_ID',
      identifier_value: cand.discovery_id,
      evidence_id: cand.source_record_id || cand.discovery_id,
      confidence,
      resolution_method: resolutionMethod,
      observed_at: new Date(startTime).toISOString()
    });
  }

  // Pre-BIEP distinct identities in the map
  const preBiepGlobalSet = new Set(identityMapRows.map(r => r.atlas_person_id));
  const globalBeforeBiep = preBiepGlobalSet.size;

  console.log(`\n--- MÉTRICAS PRE-BIEP AUDITADAS ---`);
  console.log(`GLOBAL_PERSON_IDS_BEFORE_BIEP:            ${globalBeforeBiep}`);
  console.log(`CANONICAL_DISCOVERY_STRONG_OVERLAP:       ${canonicalDiscoveryStrongOverlap}`);
  console.log(`CANONICAL_DISCOVERY_SAME_GLOBAL_PERSON_ID: ${canonicalDiscoverySameGlobalPersonId}`);
  console.log(`CANONICAL_DISCOVERY_UNRESOLVED_OVERLAP:    ${canonicalDiscoveryUnresolvedOverlap} (Nombres iguales mantenidos como identidades distintas)`);
  console.log(`OPENALEX_CONICET_OVERLAP:                 ${openalexConicetOverlap}`);
  console.log(`WIKIDATA_CANONICAL_OVERLAP:               ${wikidataCanonicalOverlap}`);

  // ---------------------------------------------------------------------------
  // 3. CARGA DE BIEP CANARY (1.050 filas / 1.000 personas)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. CARGANDO Y RESOLVIENDO REGISTROS BIEP CANARY ---');
  const biepCandidates = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name, organization, role, source_id, source_record_id, social_profiles',
    q => q.eq('source_id', 'BIEP_APN')
  );

  console.log(`Registros BIEP Canary cargados: ${biepCandidates.length} (Esperado: 1.050)`);

  let biepLinkedExistingCount = 0;
  let biepNetNewCount = 0;
  const biepPersonIdsSeen = new Set<string>();

  for (const b of biepCandidates) {
    const sp = (b.social_profiles || [])[0] || {};
    const candidateAtlasPersonId = sp.atlas_person_id || b.discovery_id;
    const nationalIdentityHash = sp.national_identity_hash;
    const linkedType = sp.linked_type || 'NET_NEW_IDENTITY';

    let resolvedPersonId = '';
    let resolutionMethod = '';

    if (linkedType !== 'NET_NEW_IDENTITY' && preBiepGlobalSet.has(candidateAtlasPersonId)) {
      resolvedPersonId = candidateAtlasPersonId;
      resolutionMethod = `BIEP_${linkedType}`;
      if (!biepPersonIdsSeen.has(resolvedPersonId)) {
        biepLinkedExistingCount++;
        biepPersonIdsSeen.add(resolvedPersonId);
      }
    } else {
      resolvedPersonId = `atlas_arg_per_${nationalIdentityHash.slice(0, 16)}`;
      resolutionMethod = 'BIEP_NET_NEW_IDENTITY';
      if (!biepPersonIdsSeen.has(resolvedPersonId)) {
        biepNetNewCount++;
        biepPersonIdsSeen.add(resolvedPersonId);
      }
    }

    identityMapRows.push({
      atlas_person_id: resolvedPersonId,
      source_id: 'BIEP_APN',
      source_person_id: b.source_record_id, // HMAC of (doc:org:escalafon:period)
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: nationalIdentityHash,
      evidence_id: b.source_record_id,
      confidence: 1.0,
      resolution_method: resolutionMethod,
      observed_at: new Date(startTime).toISOString()
    });
  }

  const postBiepGlobalSet = new Set(identityMapRows.map(r => r.atlas_person_id));
  const globalAfterBiep = postBiepGlobalSet.size;
  const globalNetNew = globalAfterBiep - globalBeforeBiep;

  console.log(`BIEP_LINKED_EXISTING_GLOBAL:              ${biepLinkedExistingCount} (Esperado: 19)`);
  console.log(`BIEP_NET_NEW_GLOBAL:                      ${biepNetNewCount} (Esperado: 981)`);
  console.log(`GLOBAL_PERSON_IDS_AFTER_BIEP_CANARY:      ${globalAfterBiep}`);
  console.log(`GLOBAL_NET_NEW:                           ${globalNetNew} (Esperado: exactamente 981)`);

  if (biepLinkedExistingCount !== 19) {
    throw new Error(`DISCREPANCY: Expected 19 linked persons in BIEP, got ${biepLinkedExistingCount}`);
  }
  if (biepNetNewCount !== 981) {
    throw new Error(`DISCREPANCY: Expected 981 net new persons in BIEP, got ${biepNetNewCount}`);
  }
  if (globalNetNew !== 981) {
    throw new Error(`DISCREPANCY: Expected GLOBAL_NET_NEW = 981, got ${globalNetNew}`);
  }

  // ---------------------------------------------------------------------------
  // 4. PERSISTENCIA FÍSICA EN atlas_person_identity_map
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. PERSISTENCIA EN TABLA FÍSICA atlas_person_identity_map ---');
  console.log(`Total de tuplas de mapeo a persistir: ${identityMapRows.length}`);

  const CHUNK_SIZE = 500;
  for (let c = 0; c < identityMapRows.length; c += CHUNK_SIZE) {
    const chunk = identityMapRows.slice(c, c + CHUNK_SIZE);
    const { error: insErr } = await supabase
      .from('atlas_person_identity_map')
      .upsert(chunk, { onConflict: 'source_id,source_person_id' });

    if (insErr) {
      throw new Error(`Error persisting identity map at chunk ${c}: ${insErr.message}`);
    }
  }

  console.log('Persistencia completada exitosamente.');

  // ---------------------------------------------------------------------------
  // 5. RECONCILIACIÓN FÍSICA Y RECONTADOR SSOT DIRECTO EN POSTGRESQL
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. RECUENTO DIRECTO SSOT MEDIANTE COUNT(DISTINCT atlas_person_id) ---');
  const distinctRows = await fetchAllWithPagination('atlas_person_identity_map', 'atlas_person_id');
  const dbDistinctIds = new Set(distinctRows.map(r => r.atlas_person_id));
  console.log(`Filas totales en atlas_person_identity_map: ${distinctRows.length}`);
  console.log(`COUNT(DISTINCT atlas_person_id) FÍSICO EN POSTGRESQL: ${dbDistinctIds.size}`);

  // ---------------------------------------------------------------------------
  // 6. REGRESIÓN DE PRIVACIDAD EN atlas_person_identity_map
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. AUDITORÍA DE REGRESIÓN DE PRIVACIDAD EN MAPA DE IDENTIDAD ---');
  let rawDniCount = 0;
  let rawCuilCount = 0;

  for (const r of identityMapRows) {
    if (/^\d{7,8}$/.test(r.identifier_value)) rawDniCount++;
    if (/^\d{2}-\d{8}-\d$/.test(r.identifier_value)) rawCuilCount++;
  }

  console.log(`RAW_DNI_IN_IDENTITY_MAP:  ${rawDniCount} (Exigido: 0) -> ${rawDniCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`RAW_CUIL_IN_IDENTITY_MAP: ${rawCuilCount} (Exigido: 0) -> ${rawCuilCount === 0 ? 'PASS' : 'FAIL'}`);

  const report: GlobalIdentityResolutionMetrics = {
    TIMESTAMP: new Date().toISOString(),
    CANONICAL_RECORDS_MAPPED: canonicalRows.length,
    DISCOVERY_RECORDS_MAPPED: nonBiepCandidates.length,
    BIEP_RECORDS_MAPPED: biepCandidates.length,
    TOTAL_IDENTITY_MAP_ROWS: identityMapRows.length,
    OVERLAP_AUDIT: {
      CANONICAL_DISCOVERY_STRONG_OVERLAP: canonicalDiscoveryStrongOverlap,
      CANONICAL_DISCOVERY_SAME_GLOBAL_PERSON_ID: canonicalDiscoverySameGlobalPersonId,
      CANONICAL_DISCOVERY_UNRESOLVED_OVERLAP: canonicalDiscoveryUnresolvedOverlap,
      OPENALEX_CONICET_OVERLAP: openalexConicetOverlap,
      WIKIDATA_CANONICAL_OVERLAP: wikidataCanonicalOverlap,
      BIEP_EXISTING_OVERLAP: biepLinkedExistingCount
    },
    SSOT_RECOUNT: {
      GLOBAL_PERSON_IDS_BEFORE_BIEP: globalBeforeBiep,
      BIEP_LINKED_EXISTING_GLOBAL: biepLinkedExistingCount,
      BIEP_NET_NEW_GLOBAL: biepNetNewCount,
      GLOBAL_PERSON_IDS_AFTER_BIEP_CANARY: globalAfterBiep,
      GLOBAL_NET_NEW: globalNetNew,
      COUNT_DISTINCT_ATLAS_PERSON_ID: dbDistinctIds.size
    },
    PRIVACY_REGRESSION: {
      RAW_DNI_IN_IDENTITY_MAP: rawDniCount,
      RAW_CUIL_IN_IDENTITY_MAP: rawCuilCount,
      CLASSIFICATION: 'RESTRICTED_PSEUDONYMOUS_IDENTIFIER',
      STATUS: rawDniCount === 0 && rawCuilCount === 0 ? 'PASS' : 'FAIL'
    }
  };

  const reportPath = path.resolve('reports/atlas/people/global_identity_ssot_gate_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReporte SSOT guardado en: ${reportPath}`);

  return report;
}

buildAtlasGlobalIdentityMap().catch(err => {
  console.error('Fatal error in Global Identity Map builder:', err);
  process.exit(1);
});
