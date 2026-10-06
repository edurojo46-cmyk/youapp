import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OpenAlexAuthorRow {
  id: string; // https://openalex.org/A...
  display_name: string;
  orcid?: string;
  works_count: number;
  counts_by_year?: Array<{ year: number; works_count: number }>;
  last_known_institutions?: Array<{
    id: string;
    display_name: string;
    ror?: string;
    country_code?: string;
  }>;
}

interface HarvestStats {
  RAW_AUTHORS: number;
  UNIQUE_AUTHORS: number;
  WITH_ORCID: number;
  ALREADY_IN_ATLAS: number;
  NEW_CANDIDATES: number;
  CABA_ASSOCIATED: number;
  CURRENT_DIRECT_CABA: number;
  RECENT: number;
  HISTORICAL: number;
  STALE_UNKNOWN: number;
  REQUESTS: number;
  EXTERNAL_COST: string;
  CANONICAL_DB_DELTA: number;
  PROCESSING_TIME_MS: number;
}

const CONFIRMED_NODES = [
  { id: 'I2802359038', name: 'Hospital Italiano de Buenos Aires', ror: '00bq4rw46', limit: 2500 },
  { id: 'I4210119967', name: 'Hospital de Clínicas José de San Martín', ror: '02hbrab76', limit: 2049 },
  { id: 'I2801749607', name: 'Fundación Instituto Leloir', ror: '0431v7h69', limit: 565 },
  { id: 'I4210154782', name: 'Fundación Favaloro', ror: '053f3rt53', limit: 579 },
  { id: 'I232641801', name: 'Universidad Torcuato Di Tella', ror: '04sxme922', limit: 764 },
  { id: 'I4210133962', name: 'Instituto Tecnológico de Buenos Aires (ITBA)', ror: '02qwadn23', limit: 526 },
];

function cleanName(n: string): string {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function runHarvest() {
  const startTime = Date.now();
  console.log('=== TRACK A2: OPENALEX CABA CONTROLLED HARVEST PHASE 1 ===');
  console.log('Timestamp:', new Date().toISOString());

  // 1. Verify Canonical Baseline Invariant
  const { count: preCanonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`PRE_CANONICAL_BASELINE: ${preCanonicalCount} (Invariant: 2091)`);
  if (preCanonicalCount !== 2091) {
    throw new Error(`CANONICAL BASELINE BREACH! Expected 2091, got ${preCanonicalCount}`);
  }

  // 2. Load Existing Atlas Discovery keys for strict multi-key deduplication
  console.log('\nLoading existing Atlas Discovery candidates for strict multi-key de-duplication...');
  const existingByOrcid = new Map<string, string>();
  const existingByOpenAlexId = new Map<string, string>();
  const existingByName = new Set<string>();

  let offset = 0;
  const BATCH_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, source_record_id, social_profiles')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data) {
      if (r.source_record_id) {
        existingByOpenAlexId.set(r.source_record_id, r.discovery_id);
      }
      if (Array.isArray(r.social_profiles)) {
        for (const sp of r.social_profiles) {
          if (sp.orcid) {
            const cleanOrcid = sp.orcid.replace(/https?:\/\/orcid\.org\//, '').trim();
            existingByOrcid.set(cleanOrcid, r.discovery_id);
          }
          if (sp.openalex_id) {
            existingByOpenAlexId.set(sp.openalex_id, r.discovery_id);
          }
        }
      }
      if (r.display_name) {
        existingByName.add(cleanName(r.display_name));
      }
    }

    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }
  console.log(`Loaded ${offset} existing records into memory.`);

  const stats: HarvestStats = {
    RAW_AUTHORS: 0,
    UNIQUE_AUTHORS: 0,
    WITH_ORCID: 0,
    ALREADY_IN_ATLAS: 0,
    NEW_CANDIDATES: 0,
    CABA_ASSOCIATED: 0,
    CURRENT_DIRECT_CABA: 0,
    RECENT: 0,
    HISTORICAL: 0,
    STALE_UNKNOWN: 0,
    REQUESTS: 0,
    EXTERNAL_COST: '$0.00',
    CANONICAL_DB_DELTA: 0,
    PROCESSING_TIME_MS: 0,
  };

  const recordsToInsert: any[] = [];
  const processedOpenAlexIds = new Set<string>();

  // 3. Harvest from confirmed nodes
  for (const node of CONFIRMED_NODES) {
    console.log(`\nHarvesting node: ${node.name} (${node.id}) - Target: ~${node.limit} authors`);
    let cursor: string | null = '*';
    let nodeHarvested = 0;

    while (cursor && nodeHarvested < node.limit) {
      const perPage = Math.min(100, node.limit - nodeHarvested);
      const url = `https://api.openalex.org/authors?filter=last_known_institutions.id:${node.id}&per_page=${perPage}&cursor=${encodeURIComponent(cursor)}&mailto=contact@youapp.com`;
      
      stats.REQUESTS++;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Error fetching page for ${node.name}: ${res.status}`);
        break;
      }

      const json = await res.json();
      cursor = json.meta?.next_cursor || null;
      const authors: OpenAlexAuthorRow[] = json.results || [];
      if (authors.length === 0) break;

      for (const a of authors) {
        stats.RAW_AUTHORS++;
        const shortId = a.id.replace('https://openalex.org/', '');
        if (processedOpenAlexIds.has(shortId)) continue;
        processedOpenAlexIds.add(shortId);
        stats.UNIQUE_AUTHORS++;

        const orcid = a.orcid ? a.orcid.replace(/https?:\/\/orcid\.org\//, '').trim() : undefined;
        if (orcid) stats.WITH_ORCID++;

        // Dedup Check:
        // Priority 1: Exact ORCID
        // Priority 2: OpenAlex ID
        // Priority 3: Exact name match (if in Atlas, count as already existing, DO NOT NAME_ONLY_MERGE)
        let isExisting = false;
        if (orcid && existingByOrcid.has(orcid)) {
          isExisting = true;
        } else if (existingByOpenAlexId.has(shortId)) {
          isExisting = true;
        } else if (existingByName.has(cleanName(a.display_name))) {
          isExisting = true;
        }

        if (isExisting) {
          stats.ALREADY_IN_ATLAS++;
          continue;
        }

        // Determine Temporal and Territorial Classification:
        // Check latest work year from counts_by_year
        let latestYear = 0;
        if (a.counts_by_year && a.counts_by_year.length > 0) {
          latestYear = Math.max(...a.counts_by_year.map(c => c.year));
        }

        let activityState: 'ACTIVE' | 'STALE' | 'HISTORICAL' = 'STALE';
        let relType = 'CABA_INSTITUTION_ASSOCIATED';

        if (latestYear >= 2025) {
          // Contemporary evidence in confirmed CABA institution
          activityState = 'ACTIVE';
          relType = 'WORKS_IN'; // Confirmed active contemporary CABA affiliation
          stats.CURRENT_DIRECT_CABA++;
        } else if (latestYear >= 2023) {
          // Recent evidence (2023-2024)
          activityState = 'ACTIVE';
          relType = 'CABA_INSTITUTION_ASSOCIATED';
          stats.RECENT++;
        } else if (latestYear > 0 && latestYear < 2000) {
          // Historical (works ended over 25 years ago)
          activityState = 'HISTORICAL';
          relType = 'CABA_INSTITUTION_ASSOCIATED';
          stats.HISTORICAL++;
        } else {
          // Living with uncertain temporality
          activityState = 'STALE';
          relType = 'CABA_INSTITUTION_ASSOCIATED';
          stats.STALE_UNKNOWN++;
        }

        stats.CABA_ASSOCIATED++;
        stats.NEW_CANDIDATES++;

        // Prepare record for ledger
        const nowIso = new Date().toISOString();
        const discoveryId = `disc_openalex_${shortId.toLowerCase()}`;
        recordsToInsert.push({
          discovery_id: discoveryId,
          display_name: a.display_name,
          source_id: 'OPENALEX_CABA',
          source_record_id: shortId,
          organization: node.name,
          role: 'Investigador / Autor Científico',
          geography_id: 'caba',
          neighborhood: 'Ciudad Autónoma de Buenos Aires',
          location_relation_type: relType,
          location_evidence: `Afiliación institucional en ${node.name} (CABA), última obra registrada: ${latestYear || 'N/D'}`,
          location_source_url: `https://openalex.org/${shortId}`,
          person_source_url: `https://openalex.org/${shortId}`,
          current_activity_state: activityState,
          public_email: null,
          email_type: null,
          email_source_url: null,
          public_phone: null,
          phone_type: null,
          phone_source_url: null,
          website: orcid ? `https://orcid.org/${orcid}` : null,
          social_profiles: [
            {
              platform: 'OPENALEX',
              profile_url: `https://openalex.org/${shortId}`,
              openalex_id: shortId,
              orcid: orcid || null,
              ror: node.ror,
              institution_id: node.id,
              institution_name: node.name,
              works_count: a.works_count,
              latest_work_year: latestYear || null
            }
          ],
          evidence_strength: latestYear >= 2024 ? 'HIGH' : 'MEDIUM',
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          source_last_checked_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        });

        // Add to local deduplication maps
        if (orcid) existingByOrcid.set(orcid, shortId);
        existingByOpenAlexId.set(shortId, shortId);
        existingByName.add(cleanName(a.display_name));
        nodeHarvested++;
      }

      console.log(`  [Progress ${node.name}] Harvested: ${nodeHarvested}/${node.limit} (Total New Candidates: ${stats.NEW_CANDIDATES})`);
      await sleep(150); // Polite rate limit
    }
  }

  console.log(`\n=== HARVEST COMPLETE: INSERTING ${recordsToInsert.length} CANDIDATES IN BATCHES ===`);

  // 4. Batch Insert into atlas_people_discovery_candidates
  const INSERT_BATCH = 500;
  for (let i = 0; i < recordsToInsert.length; i += INSERT_BATCH) {
    const chunk = recordsToInsert.slice(i, i + INSERT_BATCH);
    const { error: insertErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .insert(chunk);

    if (insertErr) {
      console.error(`Error inserting chunk ${i}-${i + chunk.length}:`, insertErr.message);
      throw insertErr;
    }
    console.log(`Inserted chunk ${i + 1} to ${Math.min(i + INSERT_BATCH, recordsToInsert.length)}`);
  }

  // 5. Post-Harvest Canonical Invariant Check
  const { count: postCanonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  stats.CANONICAL_DB_DELTA = (postCanonicalCount || 0) - (preCanonicalCount || 0);
  stats.PROCESSING_TIME_MS = Date.now() - startTime;

  console.log('\n=== TELEMETRÍA FINAL DE COSECHA OPENALEX FASE 1 ===');
  console.table(stats);

  if (stats.CANONICAL_DB_DELTA !== 0) {
    console.error('FATAL: CANONICAL_DB_DELTA != 0');
  } else {
    console.log(`CANONICAL INVARIANT VERIFIED: 2091 == ${postCanonicalCount} (DELTA = 0)`);
  }

  return stats;
}

if (process.argv[1]?.endsWith('harvest_openalex_caba_phase1.ts')) {
  runHarvest().catch(console.error);
}
