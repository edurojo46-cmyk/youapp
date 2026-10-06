import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runCardinalityAudit() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE — V4.2 IDENTITY CARDINALITY & KPI TRUTH AUDIT');
  console.log('================================================================\n');

  // 1. Total counts in DB
  const { count: totalDiscoveryRows } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: canonicalIdentities } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`TOTAL DISCOVERY INDEX ROWS: ${totalDiscoveryRows}`);
  console.log(`CANONICAL ATLAS IDENTITIES: ${canonicalIdentities}`);

  // 2. Fetch all non-CONICET rows
  console.log('\n--- FETCHING NON-CONICET ROWS ---');
  let page = 0;
  const pageSize = 1000;
  const nonConicetRows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .neq('source_id', 'CONICET_OAI_PMH')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    nonConicetRows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`NON-CONICET DISCOVERY ROWS: ${nonConicetRows.length}`);

  // 3. Inspect CONICET rows
  const { count: conicetRowsCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH');

  console.log(`CONICET PUBLICATION AUTHOR ROWS: ${conicetRowsCount}`);

  // Check distinct names in CONICET
  // Sample or full scan for strong identifiers
  let conicetPage = 0;
  let rowsWithOrcid = 0;
  let rowsWithConicetId = 0;
  let rowsWithAuthorityUri = 0;
  let rowsWithProfileId = 0;
  const conicetNames = new Set<string>();

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name, website, person_source_url, source_record_id')
      .eq('source_id', 'CONICET_OAI_PMH')
      .range(conicetPage * pageSize, (conicetPage + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const r of data) {
      conicetNames.add(r.display_name.trim().toLowerCase());
      const str = `${r.website || ''} ${r.person_source_url || ''} ${r.source_record_id || ''}`.toLowerCase();
      if (str.includes('orcid.org')) rowsWithOrcid++;
      if (str.includes('conicet.gov.ar/investigadores/')) rowsWithConicetId++;
      if (str.includes('viaf.org') || str.includes('isni.org')) rowsWithAuthorityUri++;
      if (str.includes('ri.conicet.gov.ar/browse?type=author')) rowsWithProfileId++;
    }
    if (data.length < pageSize) break;
    conicetPage++;
  }

  console.log(`CONICET DISTINCT AUTHOR LABELS: ${conicetNames.size}`);
  console.log(`ROWS WITH ORCID: ${rowsWithOrcid}`);
  console.log(`ROWS WITH CONICET ID: ${rowsWithConicetId}`);
  console.log(`ROWS WITH AUTHORITY URI: ${rowsWithAuthorityUri}`);
  console.log(`ROWS WITH PROFILE ID: ${rowsWithProfileId}`);

  // 4. Audit Non-CONICET Rows
  // Check location_relation_type in non-CONICET rows
  const nonConicetRelations: Record<string, number> = {};
  const nonConicetSources: Record<string, number> = {};
  const uniqueNonConicetNames = new Set<string>();
  let directCabaDiscoveryPeople = 0;

  for (const r of nonConicetRows) {
    const rel = r.location_relation_type || 'UNKNOWN';
    nonConicetRelations[rel] = (nonConicetRelations[rel] || 0) + 1;
    nonConicetSources[r.source_id] = (nonConicetSources[r.source_id] || 0) + 1;
    uniqueNonConicetNames.add(r.display_name.trim().toLowerCase());

    // Direct CABA evidence: WORKS_IN, TEACHES_IN, PROFESSIONAL_PRACTICE_IN, BUSINESS_LOCATED_IN, RESIDES_IN, SERVES_AREA
    if (['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'BUSINESS_LOCATED_IN', 'RESIDES_IN', 'SERVES_AREA'].includes(rel)) {
      directCabaDiscoveryPeople++;
    }
  }

  console.log('\n--- NON-CONICET RELATIONS ---');
  console.log(JSON.stringify(nonConicetRelations, null, 2));

  console.log('\n--- NON-CONICET SOURCES ---');
  console.log(JSON.stringify(nonConicetSources, null, 2));

  console.log(`\nUNIQUE NON-CONICET AUTHOR/PERSON NAMES: ${uniqueNonConicetNames.size}`);
  console.log(`DISCOVERY DIRECT CABA ROWS: ${directCabaDiscoveryPeople}`);

  // 5. Canonical DB direct CABA count
  console.log('\n--- CANONICAL DB DIRECT CABA AUDIT ---');
  let canonPage = 0;
  let canonicalDirectCaba = 0;

  while (true) {
    const { data, error } = await supabase
      .from('atlas_argentina_people_search_projection_v1')
      .select('person_id, city, jurisdiction, metadata')
      .range(canonPage * pageSize, (canonPage + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const r of data) {
      const locStr = `${r.city || ''} ${r.jurisdiction || ''} ${JSON.stringify(r.metadata || '')}`.toLowerCase();
      if (locStr.includes('buenos aires') || locStr.includes('caba') || locStr.includes('caballito') || locStr.includes('capital federal')) {
        canonicalDirectCaba++;
      }
    }
    if (data.length < pageSize) break;
    canonPage++;
  }

  console.log(`CANONICAL DIRECT CABA PEOPLE: ${canonicalDirectCaba}`);
}

runCardinalityAudit().catch(console.error);
