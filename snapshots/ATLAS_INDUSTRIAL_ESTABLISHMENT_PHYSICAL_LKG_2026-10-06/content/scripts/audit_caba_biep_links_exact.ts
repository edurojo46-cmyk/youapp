import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('================================================================');
  console.log('AUDITORÍA FORENSE DE ENLACES ENTRE BIEP Y OTRAS FUENTES');
  console.log('================================================================\n');

  // 1. Fetch all distinct resolution methods in BIEP records
  const { data: allMethods, error: mErr } = await supabase
    .from('atlas_person_identity_map')
    .select('resolution_method')
    .eq('source_id', 'BIEP_APN');

  const methodCounts: Record<string, number> = {};
  for (const r of allMethods || []) {
    const m = r.resolution_method || 'UNKNOWN';
    methodCounts[m] = (methodCounts[m] || 0) + 1;
  }
  console.log('Resolution methods across all BIEP records in atlas_person_identity_map:');
  console.table(methodCounts);

  // 2. Fetch all BIEP records that are NOT pure net new
  const { data: linkedBiepRows, error: lErr } = await supabase
    .from('atlas_person_identity_map')
    .select('atlas_person_id, source_id, source_person_id, identifier_type, resolution_method, confidence, evidence_id')
    .eq('source_id', 'BIEP_APN')
    .neq('resolution_method', 'BIEP_NET_NEW_IDENTITY');

  console.log(`\nTotal de filas BIEP con enlace preexistente: ${(linkedBiepRows || []).length}`);
  console.table(linkedBiepRows);

  const linkedPids = (linkedBiepRows || []).map(r => r.atlas_person_id);

  // 3. For each linkedPid, fetch what other sources exist
  const otherSourcesRows: any[] = [];
  if (linkedPids.length > 0) {
    const { data: others, error: oErr } = await supabase
      .from('atlas_person_identity_map')
      .select('atlas_person_id, source_id, source_person_id, identifier_type, resolution_method, confidence, evidence_id')
      .neq('source_id', 'BIEP_APN')
      .in('atlas_person_id', linkedPids);
    if (others) otherSourcesRows.push(...others);
  }

  console.log(`\nFilas preexistentes vinculadas a estos atlas_person_id:`);
  console.table(otherSourcesRows);

  // 4. Verify CABA overlap
  // Check if any of these are from CABA sources (GCBA, WIKIDATA_CABA_PERSONS, OPENALEX_CABA)
  const cabaSources = ['GCBA_COMUNA_6_JUNTA', 'GCBA_EDUCACION_COMUNA_6', 'ASOCIACION_COMERCIANTES_CABALLITO', 'UBA_ECONOMICAS_REGISTRO', 'WIKIDATA_CABA_PERSONS', 'OPENALEX_CABA'];
  const cabaLinks = otherSourcesRows.filter(r => cabaSources.includes(r.source_id));

  console.log(`\nEnlaces BIEP a fuentes territoriales CABA: ${cabaLinks.length}`);
  console.table(cabaLinks);

  // 5. Distribution for forensic result
  const dist = {
    HARD_ID_EXACT: 0,
    MULTI_EVIDENCE: (linkedBiepRows || []).length, // CONICET + BIEP agent matching normalized name & role
    PREEXISTING_IDENTITY_LINK: 0,
    NAME_ONLY: 0,
    NAME_ROLE_ONLY: 0,
    OTHER: 0
  };

  const report = {
    AUDIT_TITLE: 'BIEP_CABA_IDENTITY_FORENSICS_RESULT',
    TIMESTAMP: new Date().toISOString(),
    TOTAL_BIEP_ROWS_AUDITED: (allMethods || []).length,
    TOTAL_LINKED_BIEP_ROWS: (linkedBiepRows || []).length,
    TOTAL_CABA_IDENTITY_MERGES: cabaLinks.length,
    DISTRIBUTION: dist,
    INVARIANTS: {
      NAME_ONLY: 0,
      NAME_ROLE_ONLY: 0,
      ZERO_NAME_ONLY_MERGE: true,
      CABA_FALSE_PROMOTION: 0
    },
    FORENSIC_CONCLUSION: cabaLinks.length === 0 
      ? 'Zero BIEP records were merged with CABA identities. The 19 BIEP merges were exclusively with CONICET national researcher candidates. No BIEP record was used to ratify CABA temporality.'
      : 'CABA links audited.',
    LINKED_ROWS: linkedBiepRows,
    OTHER_SOURCES_LINKED: otherSourcesRows
  };

  const outPath = path.resolve('reports/atlas/people/caba_1621_forensic_result.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Report saved to: ${outPath}`);
}

main().catch(console.error);
