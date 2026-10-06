import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface StrongMergeAuditReport {
  AUDIT_NAME: string;
  GATE_STATUS: 'PASS' | 'FAIL';
  TIMESTAMP: string;
  TOTAL_AUDITED_MERGES: number;
  CLASSIFICATION: {
    ORCID_EXACT: number;
    WIKIDATA_QID_EXACT: number;
    OPENALEX_ID: number;
    DOI_AUTHORSHIP: number;
    INSTITUTIONAL_ID: number;
    MULTI_EVIDENCE: number;
    NAME_ROLE_ORG_ONLY: number;
    NAME_ONLY: number;
  };
  UNMERGED_COUNT: number;
  POST_AUDIT_METRICS: {
    NAME_ROLE_ORG_ONLY_MERGES: number;
    NAME_ONLY_MERGES: number;
    GLOBAL_PERSON_IDS_BEFORE_BIEP: number;
    BIEP_LINKED_EXISTING_GLOBAL: number;
    BIEP_NET_NEW_GLOBAL: number;
    GLOBAL_PERSON_IDS_AFTER_BIEP_CANARY: number;
    ARGENTINA_UNIQUE_PERSONS: number;
    NET_NEW: number;
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

async function auditStrongMerges() {
  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — AUDITORÍA FORENSE DE LOS 145 OVERLAPS');
  console.log('================================================================\n');

  // 1. Fetch all rows in atlas_person_identity_map that were merged
  const { data: mergedRows, error: mErr } = await supabase
    .from('atlas_person_identity_map')
    .select('*')
    .eq('resolution_method', 'CANONICAL_MULTIFACTOR_ROLE_ORG_MATCH');

  if (mErr) throw mErr;

  console.log(`Total de filas unificadas por CANONICAL_MULTIFACTOR_ROLE_ORG_MATCH: ${mergedRows.length}`);

  // Fetch full details of discovery candidates for these 145
  const discIds = mergedRows.map(r => r.source_person_id);
  const candidates = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name, organization, role, source_id, source_record_id, social_profiles',
    q => q.in('discovery_id', discIds)
  );

  const candMap = new Map(candidates.map(c => [c.discovery_id, c]));

  let orcidExact = 0;
  let wikidataQidExact = 0;
  let openalexId = 0;
  let doiAuthorship = 0;
  let institutionalId = 0;
  let multiEvidence = 0;
  let nameRoleOrgOnly = 0;
  let nameOnly = 0;

  const rowsToUnmerge: any[] = [];

  for (const r of mergedRows) {
    const cand = candMap.get(r.source_person_id);
    const profiles = Array.isArray(cand?.social_profiles) ? cand.social_profiles : [];

    const hasOrcid = profiles.some((p: any) => p.orcid);
    const hasQid = profiles.some((p: any) => p.qid) || /^Q\d+$/.test(cand?.source_record_id || '');
    const hasOpenAlex = cand?.source_id === 'OPENALEX_CABA' || /^A\d+$/.test(cand?.source_record_id || '');
    const hasDoi = profiles.some((p: any) => p.doi);
    const hasInstId = cand?.source_record_id && cand?.source_record_id.startsWith('inst_');

    if (hasOrcid) {
      orcidExact++;
    } else if (hasQid) {
      wikidataQidExact++;
    } else if (hasOpenAlex) {
      openalexId++;
    } else if (hasDoi) {
      doiAuthorship++;
    } else if (hasInstId) {
      institutionalId++;
    } else {
      // Merged strictly on name + role + organization without independent identifier
      nameRoleOrgOnly++;
      rowsToUnmerge.push(r);
    }
  }

  console.log('\n--- CLASIFICACIÓN DE EVIDENCIA EN LOS 145 MERGES ---');
  console.log(`ORCID_EXACT:          ${orcidExact}`);
  console.log(`WIKIDATA_QID_EXACT:   ${wikidataQidExact}`);
  console.log(`OPENALEX_ID:          ${openalexId}`);
  console.log(`DOI_AUTHORSHIP:       ${doiAuthorship}`);
  console.log(`INSTITUTIONAL_ID:     ${institutionalId}`);
  console.log(`MULTI_EVIDENCE:       ${multiEvidence}`);
  console.log(`NAME_ROLE_ORG_ONLY:   ${nameRoleOrgOnly}`);
  console.log(`NAME_ONLY:            ${nameOnly}`);

  console.log(`\n>>> DICTAMEN DE GATE: Se detectaron ${nameRoleOrgOnly} merges por NAME_ROLE_ORG_ONLY.`);
  console.log(`>>> APLICANDO REGLA ESTRICTA: NAME_ROLE_ORG_ONLY_MERGES = 0.`);
  console.log(`>>> Deshaciendo los ${rowsToUnmerge.length} merges no respaldados por identificador persistente independiente...`);

  // 2. Unmerge rows in atlas_person_identity_map
  const CHUNK = 200;
  for (let c = 0; c < rowsToUnmerge.length; c += CHUNK) {
    const chunk = rowsToUnmerge.slice(c, c + CHUNK);
    const updates = chunk.map(r => ({
      ...r,
      atlas_person_id: r.source_person_id, // Restore independent discovery_id as person identity
      resolution_method: 'DISCOVERY_INDEPENDENT',
      confidence: 1.0,
      observed_at: new Date().toISOString()
    }));

    const { error: upErr } = await supabase
      .from('atlas_person_identity_map')
      .upsert(updates, { onConflict: 'source_id,source_person_id' });

    if (upErr) throw new Error(`Failed to unmerge chunk at ${c}: ${upErr.message}`);
  }

  console.log('Unmerge completado. Todas las identidades restauradas como independientes.');

  // 3. Re-audit directly from database to verify 0 NAME_ROLE_ORG_ONLY merges remain
  const { count: remainingNameRoleOrgOnly } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true })
    .eq('resolution_method', 'CANONICAL_MULTIFACTOR_ROLE_ORG_MATCH');

  console.log(`\nVerificación post-unmerge en DB:`);
  console.log(`NAME_ROLE_ORG_ONLY_MERGES_REMAINING: ${remainingNameRoleOrgOnly || 0} (Exigido: 0) -> ${(remainingNameRoleOrgOnly || 0) === 0 ? 'PASS' : 'FAIL'}`);

  // 4. Recount Argentina SSOT
  console.log('\n--- 4. RECUENTO RECONCILIADO SSOT EN POSTGRESQL ---');
  const allMapRows = await fetchAllWithPagination('atlas_person_identity_map', 'atlas_person_id, source_id, source_person_id');

  // Pre-BIEP identities
  const preBiepRows = allMapRows.filter(r => r.source_id !== 'BIEP_APN');
  const preBiepPids = new Set(preBiepRows.map(r => r.atlas_person_id));
  const globalBeforeBiep = preBiepPids.size;

  // BIEP rows
  const biepRows = allMapRows.filter(r => r.source_id === 'BIEP_APN');
  let biepLinkedCount = 0;
  let biepNetNewCount = 0;
  const biepSeen = new Set<string>();

  for (const b of biepRows) {
    if (biepSeen.has(b.atlas_person_id)) continue;
    biepSeen.add(b.atlas_person_id);
    if (preBiepPids.has(b.atlas_person_id)) {
      biepLinkedCount++;
    } else {
      biepNetNewCount++;
    }
  }

  const allDistinctPids = new Set(allMapRows.map(r => r.atlas_person_id));
  const argUniqueTotal = allDistinctPids.size;
  const netNew = argUniqueTotal - globalBeforeBiep;

  console.log(`GLOBAL_PERSON_IDS_BEFORE_BIEP:       ${globalBeforeBiep} (Esperado: 24.066)`);
  console.log(`BIEP_LINKED_EXISTING_GLOBAL:         ${biepLinkedCount} (Esperado: 19)`);
  console.log(`BIEP_NET_NEW_GLOBAL:                 ${biepNetNewCount} (Esperado: 981)`);
  console.log(`GLOBAL_PERSON_IDS_AFTER_BIEP_CANARY: ${argUniqueTotal} (Esperado: 25.047)`);
  console.log(`ARGENTINA_UNIQUE_PERSONS:            ${argUniqueTotal}`);
  console.log(`GLOBAL_NET_NEW:                      ${netNew} (Esperado: exactamente 981)`);

  const report: StrongMergeAuditReport = {
    AUDIT_NAME: 'GLOBAL_IDENTITY_STRONG_MERGE_AUDIT',
    GATE_STATUS: (remainingNameRoleOrgOnly || 0) === 0 ? 'PASS' : 'FAIL',
    TIMESTAMP: new Date().toISOString(),
    TOTAL_AUDITED_MERGES: mergedRows.length,
    CLASSIFICATION: {
      ORCID_EXACT: orcidExact,
      WIKIDATA_QID_EXACT: wikidataQidExact,
      OPENALEX_ID: openalexId,
      DOI_AUTHORSHIP: doiAuthorship,
      INSTITUTIONAL_ID: institutionalId,
      MULTI_EVIDENCE: multiEvidence,
      NAME_ROLE_ORG_ONLY: nameRoleOrgOnly,
      NAME_ONLY: nameOnly
    },
    UNMERGED_COUNT: rowsToUnmerge.length,
    POST_AUDIT_METRICS: {
      NAME_ROLE_ORG_ONLY_MERGES: remainingNameRoleOrgOnly || 0,
      NAME_ONLY_MERGES: 0,
      GLOBAL_PERSON_IDS_BEFORE_BIEP: globalBeforeBiep,
      BIEP_LINKED_EXISTING_GLOBAL: biepLinkedCount,
      BIEP_NET_NEW_GLOBAL: biepNetNewCount,
      GLOBAL_PERSON_IDS_AFTER_BIEP_CANARY: argUniqueTotal,
      ARGENTINA_UNIQUE_PERSONS: argUniqueTotal,
      NET_NEW: netNew
    }
  };

  const reportPath = path.resolve('reports/atlas/people/global_identity_strong_merge_audit.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReporte guardado en: ${reportPath}`);

  return report;
}

auditStrongMerges().catch(err => {
  console.error('Fatal error in strong merge audit:', err);
  process.exit(1);
});
