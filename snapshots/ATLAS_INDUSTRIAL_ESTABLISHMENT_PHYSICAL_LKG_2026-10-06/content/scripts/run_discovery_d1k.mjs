/**
 * run_discovery_d1k.mjs — Atlas Discovery Industrial V1 — Build & Canary
 *
 * ARCHITECTURE:
 *   PUBLIC SOURCE → CONNECTOR → Candidate Deduplication
 *   → atlas_people_discovery_candidates (staging)
 *   → IDENTITY RESOLVER (conservative) → DECISION
 *   → atlas_person_identity_map (SSOT via commit_canonical_with_search_outbox)
 *   → atlas_people_search_projection_v2_discovery_delta (Postgres delta table)
 *   → atlas_people_discovery_d1k_delta (Meilisearch delta index on port 7700)
 *
 * CANONICAL ID MECHANISM:
 *   atlas_person_id = `atlas_arg_per_${HMAC_SHA256(HMAC_KEY, payload).slice(0, 16)}`
 *   Length: 14 chars ('atlas_arg_per_') + 16 chars (hex) = 30 characters total.
 *   - For DNI-bearing sources: payload = `ARG:DNI:<cleaned_dni>`
 *   - For external persistent IDs: payload = `EXT:<source_id>:<external_id>`
 *   - For name-only sources: NOT GENERATED (→ INSUFFICIENT_EVIDENCE)
 *
 * ATOMICITY BOUNDARIES:
 *   - IDENTITY_MAP_ATOMIC = TRUE (inside commit_canonical_with_search_outbox RPC)
 *   - SEARCH_OUTBOX_ATOMIC = TRUE (inside commit_canonical_with_search_outbox RPC in same Postgres transaction)
 *   - DELTA_PROJECTION_SAME_TRANSACTION = FALSE (executed as immediate subsequent DML in Postgres)
 *   - MEILISEARCH_EVENTUAL = TRUE (asynchronous task polling via Meilisearch HTTP API)
 *
 * CERTIFIED INDEX: data_v2_shadow.ms — FROZEN. NOT TOUCHED.
 *
 * Usage:
 *   node scripts/run_discovery_d1k.mjs [--fresh] [--fresh-replay] [--limit=N]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

// ============================================================
// CONFIGURATION
// ============================================================
const HMAC_KEY = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const REPORTS_DIR = path.resolve('reports/atlas/discovery');
const CHECKPOINTS_DIR = path.join(REPORTS_DIR, 'checkpoints');

const args = process.argv.slice(2);
const IS_FRESH = args.includes('--fresh');
const IS_FRESH_REPLAY = args.includes('--fresh-replay') || (args.includes('--replay') && !IS_FRESH);
const LIMIT_OVERRIDE = (() => {
  const a = args.find(a => a.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1]) : null;
})();
const CANDIDATE_LIMIT = LIMIT_OVERRIDE ?? 35; // Default: 35 candidates

const BATCH_FILE_PATH = (IS_FRESH || IS_FRESH_REPLAY)
  ? path.join(REPORTS_DIR, 'fresh_canary_batch_candidates.json')
  : path.join(REPORTS_DIR, 'canary_batch_candidates.json');

const REPORT_FILE_PATH = (IS_FRESH_REPLAY)
  ? path.join(REPORTS_DIR, 'atlas_discovery_v1_fresh_canary_replay.json')
  : (IS_FRESH)
    ? path.join(REPORTS_DIR, 'atlas_discovery_v1_fresh_canary.json')
    : path.join(REPORTS_DIR, 'atlas_discovery_v1_canary.json');

const DELTA_MEILI_INDEX = 'atlas_people_discovery_d1k_delta';
const MEILI_URL = 'http://127.0.0.1:7700';
const CERTIFIED_SHADOW_PATH = path.resolve('data_v2_shadow.ms');

// Source Policy Contracts (verified before first run)
const SOURCE_POLICIES = {
  WIKIDATA_SPARQL_CABA: {
    source_id: 'WIKIDATA_SPARQL_CABA',
    source_name: 'Wikidata SPARQL Endpoint',
    source_type: 'SPARQL',
    base_url: 'https://query.wikidata.org/sparql',
    can_discover: true,
    can_cache: true,
    can_index: true,
    can_republish: false,
    rate_limit: '1_req_per_sec',
    refresh_interval: '7d',
    attribution_required: true,
    restricted_fields: [],
    policy_checked_at: '2026-09-18T00:00:00Z',
    policy_evidence_url: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
  },
  OPENALEX_ROR_UBA: {
    source_id: 'OPENALEX_ROR_UBA',
    source_name: 'OpenAlex Authors (UBA via ROR)',
    source_type: 'REST_API',
    base_url: 'https://api.openalex.org',
    can_discover: true,
    can_cache: true,
    can_index: true,
    can_republish: false,
    rate_limit: '10_req_per_sec_polite_pool',
    refresh_interval: '30d',
    attribution_required: true,
    restricted_fields: [],
    policy_checked_at: '2026-09-18T00:00:00Z',
    policy_evidence_url: 'https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication',
  },
  IGJ_CSV_AUTORIDADES: {
    source_id: 'IGJ_CSV_AUTORIDADES',
    source_name: 'IGJ Autoridades y Género 2026',
    source_type: 'CSV_OFFLINE',
    base_url: 'https://datos.jus.gob.ar/dataset/igj-autoridades-genero',
    can_discover: true,
    can_cache: true,
    can_index: true,
    can_republish: true,
    rate_limit: 'OFFLINE',
    refresh_interval: '90d',
    attribution_required: true,
    restricted_fields: ['dni_number'],
    policy_checked_at: '2026-09-18T00:00:00Z',
    policy_evidence_url: 'https://datos.jus.gob.ar/dataset/igj-autoridades-genero',
  },
  CONICET_OAI_PMH: {
    source_id: 'CONICET_OAI_PMH',
    source_name: 'CONICET Digital - Repositorio Institucional OAI-PMH',
    source_type: 'OAI_PMH',
    base_url: 'https://ri.conicet.gov.ar/oai/request',
    can_discover: true,
    can_cache: true,
    can_index: true,
    can_republish: false,
    rate_limit: '1_req_per_2_sec',
    refresh_interval: '14d',
    attribution_required: true,
    restricted_fields: [],
    policy_checked_at: '2026-09-18T00:00:00Z',
    policy_evidence_url: 'https://www.conicet.gov.ar/conicet-digital/',
    requires_persistent_id_for_canonical: true,
  },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function generateAtlasPersonId(payloadStr) {
  if (!HMAC_KEY) throw new Error('ATLAS_IGJ_IDENTITY_HMAC_KEY not set');
  const hmac = crypto.createHmac('sha256', HMAC_KEY).update(payloadStr).digest('hex');
  // prefix: 'atlas_arg_per_' (14 chars) + hmac.slice(0, 16) (16 hex chars) = 30 chars total
  const id = `atlas_arg_per_${hmac.slice(0, 16)}`;
  return id;
}

function generateEvidenceHash(rawEvidence) {
  const canonical = JSON.stringify(rawEvidence, Object.keys(rawEvidence).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function normalizePersonName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(dr|dra|lic|mg|prof|profa|ing|arq|cr|cdor|cdora|sr|sra|don|dona)\b\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCheckpoint(sourceId) {
  const p = path.join(CHECKPOINTS_DIR, `checkpoint_${sourceId.toLowerCase()}.json`);
  if (!fs.existsSync(p)) return { next_cursor: null, last_successful_item: null, attempt_count: 0, updated_at: null };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveCheckpoint(sourceId, data) {
  fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });
  const p = path.join(CHECKPOINTS_DIR, `checkpoint_${sourceId.toLowerCase()}.json`);
  fs.writeFileSync(p, JSON.stringify({ ...data, updated_at: new Date().toISOString() }, null, 2));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getShadowIndexSnapshot() {
  if (fs.existsSync(CERTIFIED_SHADOW_PATH)) {
    const stat = fs.statSync(CERTIFIED_SHADOW_PATH);
    return {
      exists: true,
      mtime: stat.mtime.toISOString(),
      mtime_ms: stat.mtimeMs,
      size: stat.size,
    };
  }
  return { exists: false };
}

// ============================================================
// QUERY OFFICIAL CANONICAL DISTINCT PEOPLE (SSOT)
// ============================================================
async function queryOfficialCanonicalDistinctPeople(pgClient) {
  const query = 'SELECT COUNT(DISTINCT atlas_person_id) AS cnt FROM atlas_person_identity_map WHERE atlas_person_id IS NOT NULL';
  const res = await pgClient.query(query);
  return parseInt(res.rows[0].cnt, 10);
}

// ============================================================
// CONNECTOR: WIKIDATA SPARQL
// ============================================================
async function* connectWikidata(limit, startOffset = null) {
  const checkpoint = loadCheckpoint('WIKIDATA_SPARQL_CABA');
  let offset = startOffset !== null ? startOffset : (checkpoint.next_cursor ? parseInt(checkpoint.next_cursor) : 0);
  console.log(`  [WIKIDATA] Fetching from offset=${offset}`);

  const pageSize = 25;
  let fetched = 0;

  while (fetched < limit) {
    const thisPage = Math.min(pageSize, limit - fetched + 10);
    const sparql = `
      SELECT ?person ?personLabel ?description ?orcid ?occupationLabel ?birthPlaceLabel WHERE {
        ?person wdt:P31 wd:Q5 ;
                (wdt:P19|wdt:P131|wdt:P551) ?place .
        ?place (wdt:P17|wdt:P131*) wd:Q414 .
        FILTER(CONTAINS(LCASE(?place), "buenos") || ?place = wd:Q1486 || ?place = wd:Q44941)
        OPTIONAL { ?person wdt:P496 ?orcid . }
        OPTIONAL { ?person wdt:P106 ?occupation . }
        OPTIONAL { ?person wdt:P19 ?birthPlace . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
      }
      LIMIT ${thisPage} OFFSET ${offset}
    `.trim();

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;

    try {
      await sleep(1100);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'AtlasDiscoveryBot/1.0 (atlas-discovery@youapp.ar; Discovery Industrial V1)',
          'Accept': 'application/sparql-results+json',
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn('  [WIKIDATA] Rate limited 429, waiting 10s...');
          await sleep(10000);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const results = data?.results?.bindings || [];

      for (const r of results) {
        const wikidataQid = r.person?.value?.split('/').pop();
        if (!wikidataQid) continue;

        const displayName = r.personLabel?.value;
        if (!displayName || displayName === wikidataQid || /^Q\d+$/.test(displayName)) continue;

        const orcid = r.orcid?.value || null;
        const occupation = r.occupationLabel?.value || null;
        const birthPlace = r.birthPlaceLabel?.value || null;

        const rawEvidence = {
          wikidata_qid: wikidataQid,
          display_name: displayName,
          description: r.description?.value || null,
          orcid,
          occupation,
          birth_place: birthPlace,
        };

        yield {
          candidate_id: `disc_WIKIDATA_SPARQL_CABA_${wikidataQid}`,
          source_id: 'WIKIDATA_SPARQL_CABA',
          source_record_id: wikidataQid,
          source_url: `https://www.wikidata.org/wiki/${wikidataQid}`,
          observed_at: new Date().toISOString(),
          display_name: displayName,
          organization: null,
          role: null,
          profession: occupation || 'Figura Pública',
          geography: 'Buenos Aires, Argentina',
          public_contact: null,
          external_ids: {
            wikidata_qid: wikidataQid,
            orcid: orcid || null,
          },
          raw_evidence: rawEvidence,
          evidence_hash: generateEvidenceHash(rawEvidence),
          has_persistent_id: true,
        };
        fetched++;
        if (fetched >= limit) break;
      }

      saveCheckpoint('WIKIDATA_SPARQL_CABA', { next_cursor: String(offset + thisPage), last_successful_item: String(offset + results.length) });
      offset += thisPage;
      if (results.length < thisPage) break;
    } catch (err) {
      console.warn(`  [WIKIDATA] Error: ${err.message}`);
      break;
    }
  }
}

// ============================================================
// CONNECTOR: OPENALEX (UBA Authors via ROR)
// ============================================================
async function* connectOpenAlex(limit, startCursor = null) {
  const checkpoint = loadCheckpoint('OPENALEX_ROR_UBA');
  let cursor = startCursor !== null ? startCursor : (checkpoint.next_cursor || '*');
  const ROR_UBA = 'https://ror.org/0081fs513';
  const PAGE_SIZE = 15;
  let fetched = 0;

  console.log(`  [OPENALEX] Fetching with cursor=${cursor}`);

  while (fetched < limit) {
    try {
      await sleep(250);
      const url = `https://api.openalex.org/authors?filter=last_known_institutions.ror:${encodeURIComponent(ROR_UBA)}&per-page=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}&mailto=atlas-discovery@youapp.ar`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'AtlasDiscoveryBot/1.0 (atlas-discovery@youapp.ar)' },
      });

      if (!res.ok) {
        if (res.status === 429) { await sleep(5000); continue; }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const authors = data?.results || [];
      const nextCursor = data?.meta?.next_cursor;

      for (const a of authors) {
        if (!a.id || !a.display_name) continue;
        const openAlexId = a.id.split('/').pop();
        const orcid = a.orcid ? a.orcid.replace('https://orcid.org/', '') : null;
        const institution = a.last_known_institutions?.[0]?.display_name || 'Universidad de Buenos Aires';

        const rawEvidence = {
          openalex_id: openAlexId,
          display_name: a.display_name,
          orcid,
          institution,
          works_count: a.works_count || 0,
          cited_by_count: a.cited_by_count || 0,
        };

        yield {
          candidate_id: `disc_OPENALEX_ROR_UBA_${openAlexId}`,
          source_id: 'OPENALEX_ROR_UBA',
          source_record_id: openAlexId,
          source_url: a.id,
          observed_at: new Date().toISOString(),
          display_name: a.display_name,
          organization: institution,
          role: 'Investigador / Docente',
          profession: 'Investigación académica',
          geography: 'Buenos Aires, Argentina',
          public_contact: null,
          external_ids: {
            openalex_id: openAlexId,
            orcid: orcid || null,
          },
          raw_evidence: rawEvidence,
          evidence_hash: generateEvidenceHash(rawEvidence),
          has_persistent_id: true,
        };

        fetched++;
        if (fetched >= limit) break;
      }

      saveCheckpoint('OPENALEX_ROR_UBA', { next_cursor: nextCursor || null, last_successful_item: authors[authors.length - 1]?.id });
      if (!nextCursor || authors.length < PAGE_SIZE) break;
      cursor = nextCursor;
    } catch (err) {
      console.warn(`  [OPENALEX] Error: ${err.message}`);
      break;
    }
  }
}

// ============================================================
// CONNECTOR: IGJ CSV (via fast Postgres indexed query)
// ============================================================
async function* connectIGJ(pgClient, limit, startOffset = null) {
  const checkpoint = loadCheckpoint('IGJ_CSV_AUTORIDADES');
  const offsetStart = startOffset !== null ? startOffset : (checkpoint.next_cursor ? parseInt(checkpoint.next_cursor, 10) : 0);
  console.log(`  [IGJ] Loading from candidates staging (offset=${offsetStart})`);

  const res = await pgClient.query(`
    SELECT discovery_id, source_id, source_record_id, display_name, profession, role, organization, geography_id, person_source_url, created_at
    FROM atlas_people_discovery_candidates
    WHERE source_id = 'IGJ_AUTORIDADES_GENERO_2026'
    OFFSET $1
    LIMIT $2
  `, [offsetStart, limit]);

  const rows = res.rows || [];
  for (const r of rows) {
    const rawEvidence = {
      discovery_id: r.discovery_id,
      source_id: r.source_id,
      source_record_id: r.source_record_id,
      display_name: r.display_name,
      organization: r.organization,
      role: r.role,
    };

    yield {
      candidate_id: r.discovery_id,
      source_id: 'IGJ_AUTORIDADES_GENERO_2026',
      source_record_id: r.source_record_id,
      source_url: r.person_source_url || 'https://datos.jus.gob.ar/dataset/igj-autoridades-genero',
      observed_at: r.created_at || new Date().toISOString(),
      display_name: r.display_name,
      organization: r.organization,
      role: r.role,
      profession: r.profession,
      geography: r.geography_id || 'ARGENTINA',
      public_contact: null,
      external_ids: { igj_source_record_id: r.source_record_id },
      raw_evidence: rawEvidence,
      evidence_hash: generateEvidenceHash(rawEvidence),
      has_persistent_id: true,
    };
  }

  saveCheckpoint('IGJ_CSV_AUTORIDADES', { next_cursor: String(offsetStart + rows.length) });
}

// ============================================================
// CONSERVATIVE IDENTITY RESOLVER
// ============================================================
async function resolveIdentity(candidate, sb) {
  const { source_id, source_record_id, display_name, organization, external_ids, has_persistent_id } = candidate;

  // STEP 0: Non-person reject
  const NON_PERSON_PATTERNS = [/^(sociedad|s\.a\.|s\.r\.l\.|inc\.|ltda|corp|company|empresa|ministerio|secretaria|municipalidad)/i];
  if (NON_PERSON_PATTERNS.some(p => p.test(display_name.trim()))) {
    return {
      decision: 'REJECT',
      decision_reason: 'Detected as non-person entity (organization/government body)',
      matched_atlas_person_id: null,
      confidence: 0,
      signals: ['non_person_pattern'],
    };
  }

  // STEP 1: Check direct source_id + source_person_id in identity map
  const { data: directSourceRows, error: dirErr } = await sb
    .from('atlas_person_identity_map')
    .select('atlas_person_id, source_id, source_person_id, identifier_value')
    .eq('source_id', source_id)
    .eq('source_person_id', source_record_id)
    .limit(2);

  if (dirErr) throw new Error(`IR direct lookup error: ${dirErr.message}`);

  if (directSourceRows && directSourceRows.length > 0) {
    return {
      decision: 'MERGE_EXISTING',
      decision_reason: `Exact source mapping already registered: ${source_id}:${source_record_id} -> ${directSourceRows[0].atlas_person_id}`,
      matched_atlas_person_id: directSourceRows[0].atlas_person_id,
      confidence: 1.0,
      signals: ['direct_source_mapping_exists'],
      derived_person_id: directSourceRows[0].atlas_person_id,
    };
  }

  // STEP 2: External ID checks (Option A) — indexed by (identifier_type, identifier_value)
  const extIdPayloads = [];
  if (external_ids?.orcid) extIdPayloads.push({ type: 'ORCID', value: external_ids.orcid, payload: `EXT:ORCID:${external_ids.orcid}` });
  if (external_ids?.openalex_id) extIdPayloads.push({ type: 'OPENALEX_ID', value: external_ids.openalex_id, payload: `EXT:OPENALEX:${external_ids.openalex_id}` });
  if (external_ids?.wikidata_qid) extIdPayloads.push({ type: 'WIKIDATA_QID', value: external_ids.wikidata_qid, payload: `EXT:WIKIDATA:${external_ids.wikidata_qid}` });

  for (const extId of extIdPayloads) {
    const { data: existingRows, error: extErr } = await sb
      .from('atlas_person_identity_map')
      .select('atlas_person_id, source_id, source_person_id, identifier_value')
      .eq('identifier_type', extId.type)
      .eq('identifier_value', extId.payload)
      .limit(5);

    if (extErr) throw new Error(`IR external ID lookup error: ${extErr.message}`);

    if (existingRows && existingRows.length > 0) {
      const distinctPersonIds = [...new Set(existingRows.map(r => r.atlas_person_id))];
      if (distinctPersonIds.length > 1) {
        return {
          decision: 'IDENTITY_CONFLICT',
          decision_reason: `External ID ${extId.type}:${extId.value} linked to multiple distinct atlas_person_ids: ${distinctPersonIds.join(', ')}`,
          matched_atlas_person_id: null,
          confidence: 0,
          signals: [extId.type, 'conflict_multiple_canonicals'],
        };
      }
      return {
        decision: 'MERGE_EXISTING',
        decision_reason: `OPTION_A: External ID ${extId.type}:${extId.value} already linked to canonical ${distinctPersonIds[0]}`,
        matched_atlas_person_id: distinctPersonIds[0],
        confidence: 1.0,
        signals: [extId.type],
        derived_person_id: distinctPersonIds[0],
      };
    }
  }

  // STEP 3: Name-based validation
  const normalizedName = normalizePersonName(display_name);
  if (!normalizedName || normalizedName.split(' ').filter(Boolean).length < 2) {
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      decision_reason: 'Name has fewer than 2 words after normalization',
      matched_atlas_person_id: null,
      confidence: 0,
      signals: ['single_token_name'],
    };
  }

  // STEP 4: Option B (Exact Name + Strong Org + 3rd Corroborating Signal)
  if (organization) {
    const normOrg = normalizePersonName(organization);
    const firstWord = normalizedName.split(' ')[0];
    const { data: candidatesMatch } = await sb
      .from('atlas_people_discovery_candidates')
      .select('atlas_person_id, display_name, organization')
      .ilike('display_name', `%${firstWord}%`)
      .not('atlas_person_id', 'is', null)
      .limit(5);

    if (candidatesMatch && candidatesMatch.length > 0) {
      for (const m of candidatesMatch) {
        const mNormName = normalizePersonName(m.display_name);
        const mNormOrg = normalizePersonName(m.organization || '');
        const exactName = mNormName === normalizedName;
        const orgMatch = normOrg && mNormOrg && (mNormOrg.includes(normOrg.slice(0, 8)) || normOrg.includes(mNormOrg.slice(0, 8)));

        if (exactName && orgMatch) {
          const hasThirdSignal = has_persistent_id || candidate.role || candidate.profession;
          if (hasThirdSignal) {
            return {
              decision: 'MERGE_EXISTING',
              decision_reason: 'OPTION_B: Exact normalized name + strong org match + corroborating signal',
              matched_atlas_person_id: m.atlas_person_id,
              confidence: 0.9,
              signals: ['exact_name', 'org_match', 'third_signal'],
              derived_person_id: m.atlas_person_id,
            };
          } else {
            return {
              decision: 'INSUFFICIENT_EVIDENCE',
              decision_reason: 'OPTION_B near-match: exact name + org match but lacking third corroborating signal',
              matched_atlas_person_id: m.atlas_person_id,
              confidence: 0.65,
              signals: ['exact_name', 'org_match'],
            };
          }
        }
      }
    }
  }

  // STEP 5: New Canonical Evaluation
  const hasSufficientEvidence = has_persistent_id || (organization && (candidate.role || candidate.profession));
  if (!hasSufficientEvidence) {
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      decision_reason: 'Insufficient evidence: no persistent external ID, and missing organization+role/profession',
      matched_atlas_person_id: null,
      confidence: 0.3,
      signals: [],
    };
  }

  let idPayload;
  if (external_ids?.orcid) idPayload = `EXT:ORCID:${external_ids.orcid}`;
  else if (external_ids?.openalex_id) idPayload = `EXT:OPENALEX:${external_ids.openalex_id}`;
  else if (external_ids?.wikidata_qid) idPayload = `EXT:WIKIDATA:${external_ids.wikidata_qid}`;
  else idPayload = `EXT:${source_id}:${source_record_id}`;

  const derivedPersonId = generateAtlasPersonId(idPayload);

  return {
    decision: 'NEW_CANONICAL',
    decision_reason: `New canonical person: verified provenance + persistent ID (${idPayload})`,
    matched_atlas_person_id: null,
    derived_person_id: derivedPersonId,
    confidence: has_persistent_id ? 0.95 : 0.75,
    signals: [has_persistent_id ? 'persistent_id' : null, organization ? 'organization' : null, candidate.role ? 'role' : null, candidate.profession ? 'profession' : null].filter(Boolean),
    id_payload: idPayload,
  };
}

// ============================================================
// TRANSACTIONAL WRITE PATH (Atomic RPC + Delta Projection)
// ============================================================
async function commitNewCanonical(candidate, resolution, sb, pgClient) {
  const { derived_person_id, id_payload, confidence } = resolution;

  const evidenceId = `evi_disc_${candidate.source_id.toLowerCase()}_${candidate.source_record_id.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}`;

  const identityRow = {
    atlas_person_id: derived_person_id,
    source_id: candidate.source_id,
    source_person_id: candidate.source_record_id,
    identifier_type: id_payload?.startsWith('EXT:ORCID') ? 'ORCID' :
                     id_payload?.startsWith('EXT:OPENALEX') ? 'OPENALEX_ID' :
                     id_payload?.startsWith('EXT:WIKIDATA') ? 'WIKIDATA_QID' : 'SOURCE_RECORD_ID',
    identifier_value: id_payload,
    evidence_id: evidenceId,
    confidence,
    resolution_method: `DISCOVERY_${candidate.source_id}_V1`,
    observed_at: candidate.observed_at,
  };

  const normName = normalizePersonName(candidate.display_name);
  const nameParts = normName.split(' ');
  const firstName = nameParts.slice(0, -1).join(' ');
  const lastName = nameParts[nameParts.length - 1] || '';
  const searchText = [normName, normalizePersonName(candidate.role), normalizePersonName(candidate.organization), normalizePersonName(candidate.profession)].filter(Boolean).join(' ');

  const projectionPayload = {
    atlas_person_id: derived_person_id,
    display_name: candidate.display_name,
    display_name_normalized: normName,
    first_name: firstName,
    last_name: lastName,
    role: candidate.role || '',
    profession: candidate.profession || '',
    organization: candidate.organization || '',
    geography: candidate.geography || 'ARGENTINA',
    province: 'BUENOS AIRES',
    neighborhood: '',
    source_ids: [candidate.source_id],
    search_text_normalized: searchText,
    evidence_state: 'IDENTITY_ONLY',
    ranking_weight: 100,
    last_seen_at: new Date(candidate.observed_at).getTime(),
    created_at: Date.now(),
  };

  const outboxRow = {
    atlas_person_id: derived_person_id,
    source_id: candidate.source_id,
    source_record_id: candidate.source_record_id,
    payload: projectionPayload,
    payload_version: 1,
  };

  // 1. Transactional RPC (Identity Map + Outbox in same PostgreSQL transaction)
  const { data: rpcResult, error: rpcError } = await sb
    .rpc('commit_canonical_with_search_outbox', {
      p_identity_rows: [identityRow],
      p_outbox_rows: [outboxRow],
    });

  if (rpcError) throw new Error(`commit_canonical_with_search_outbox failed: ${rpcError.message}`);
  if (!rpcResult?.ok) throw new Error(`RPC returned ok=false: ${JSON.stringify(rpcResult)}`);

  // 2. Write to Delta Projection Table (Postgres)
  const deltaQuery = `
    INSERT INTO public.atlas_people_search_projection_v2_discovery_delta (
      atlas_person_id, display_name, display_name_normalized, first_name, last_name,
      role, profession, organization, geography, province, neighborhood,
      source_ids, search_text_normalized, evidence_state, ranking_weight,
      last_seen_at, created_at, discovery_source_id, discovery_decision
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    ON CONFLICT (atlas_person_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
  `;

  await pgClient.query(deltaQuery, [
    projectionPayload.atlas_person_id,
    projectionPayload.display_name,
    projectionPayload.display_name_normalized,
    projectionPayload.first_name,
    projectionPayload.last_name,
    projectionPayload.role,
    projectionPayload.profession,
    projectionPayload.organization,
    projectionPayload.geography,
    projectionPayload.province,
    projectionPayload.neighborhood,
    projectionPayload.source_ids,
    projectionPayload.search_text_normalized,
    projectionPayload.evidence_state,
    projectionPayload.ranking_weight,
    projectionPayload.last_seen_at,
    projectionPayload.created_at,
    candidate.source_id,
    resolution.decision,
  ]);

  // 3. Update candidate row in staging with atlas_person_id
  await sb.from('atlas_people_discovery_candidates')
    .update({ atlas_person_id: derived_person_id })
    .eq('discovery_id', candidate.candidate_id);

  return projectionPayload;
}

// ============================================================
// INDEX TO MEILISEARCH DELTA INDEX & VERIFY SEARCHABILITY
// ============================================================
async function indexToMeilisearchDelta(doc) {
  const indexUrl = `${MEILI_URL}/indexes/${DELTA_MEILI_INDEX}`;
  const addRes = await fetch(`${indexUrl}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([doc]),
  });

  if (!addRes.ok) throw new Error(`Meili insert failed: ${addRes.statusText}`);
  const task = await addRes.json();

  // Wait for task completion
  let attempts = 0;
  while (attempts < 50) {
    await sleep(25);
    const tr = await fetch(`${MEILI_URL}/tasks/${task.taskUid}`);
    const td = await tr.json();
    if (td.status === 'succeeded') break;
    if (td.status === 'failed') throw new Error(`Meili task failed: ${td.error?.message}`);
    attempts++;
  }

  // Verify searchability via query
  const searchRes = await fetch(`${indexUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: doc.display_name_normalized, limit: 2 }),
  });
  const sd = await searchRes.json();
  const isSearchable = sd.hits?.some(h => h.atlas_person_id === doc.atlas_person_id);
  return isSearchable;
}

// ============================================================
// MAIN EXECUTION
// ============================================================
async function main() {
  const mode = IS_FRESH_REPLAY ? 'FRESH_REPLAY' : (IS_FRESH ? 'FRESH_CANARY' : (args.includes('--replay') ? 'REPLAY' : 'CANARY'));
  console.log('================================================================================');
  console.log(`ATLAS DISCOVERY INDUSTRIAL V1 — ${mode} (target: ~${CANDIDATE_LIMIT} unique candidates)`);
  console.log('================================================================================\n');

  if (!HMAC_KEY) { console.error('❌ ATLAS_IGJ_IDENTITY_HMAC_KEY not set'); process.exit(1); }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('❌ Supabase credentials not set'); process.exit(1); }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const pgClient = new pg.Client(parseDbUrl());
  await pgClient.connect();

  // ── Baseline checks ──────────────────────────────────────────
  console.log('>>> Baseline Safety & SSOT Checks');
  const shadowBefore = getShadowIndexSnapshot();
  console.log(`  data_v2_shadow.ms exists: ${shadowBefore.exists}, mtime: ${shadowBefore.mtime}`);

  console.log('  Querying CANONICAL_DISTINCT_PEOPLE_BEFORE via official SQL...');
  const CANONICAL_DISTINCT_PEOPLE_BEFORE = await queryOfficialCanonicalDistinctPeople(pgClient);
  console.log(`  CANONICAL_DISTINCT_PEOPLE_BEFORE: ${CANONICAL_DISTINCT_PEOPLE_BEFORE}\n`);

  // ── Source Policy verification ──────────────────────────────
  console.log('>>> Source Policy Contracts Verification');
  for (const [sid, pol] of Object.entries(SOURCE_POLICIES)) {
    console.log(`  ${sid}: can_discover=${pol.can_discover}, rate_limit=${pol.rate_limit}, evidence_url=${pol.policy_evidence_url}`);
  }
  console.log();

  // ── Candidate gathering / loading ───────────────────────────
  let candidatesToEvaluate = [];
  let rawFetchedCount = 0;
  let batchDuplicatesFiltered = 0;

  if (IS_FRESH_REPLAY || (!IS_FRESH && args.includes('--replay'))) {
    console.log(`>>> REPLAY MODE: Loading identical candidates batch from ${BATCH_FILE_PATH}`);
    if (!fs.existsSync(BATCH_FILE_PATH)) {
      console.error(`❌ Cannot replay: ${BATCH_FILE_PATH} not found`);
      process.exit(1);
    }
    candidatesToEvaluate = JSON.parse(fs.readFileSync(BATCH_FILE_PATH, 'utf8'));
    rawFetchedCount = candidatesToEvaluate.length;
    console.log(`  Loaded ${candidatesToEvaluate.length} pre-deduplicated candidates for replay.\n`);
  } else {
    console.log('>>> Gathering candidates across sources (Wikidata, OpenAlex, IGJ)...');
    const perSource = Math.ceil(CANDIDATE_LIMIT / 3) + 5;

    // Offsets for fresh canary: start after previous batches to obtain novel candidates
    const wStartOffset = IS_FRESH ? 40 : null;
    const iStartOffset = IS_FRESH ? 25 : null;

    const rawCandidates = [];

    for await (const c of connectWikidata(perSource, wStartOffset)) rawCandidates.push(c);
    console.log(`  Raw fetched from Wikidata: ${rawCandidates.filter(c => c.source_id === 'WIKIDATA_SPARQL_CABA').length}`);

    for await (const c of connectOpenAlex(perSource)) rawCandidates.push(c);
    console.log(`  Raw fetched from OpenAlex: ${rawCandidates.filter(c => c.source_id === 'OPENALEX_ROR_UBA').length}`);

    for await (const c of connectIGJ(pgClient, perSource, iStartOffset)) rawCandidates.push(c);
    console.log(`  Raw fetched from IGJ: ${rawCandidates.filter(c => c.source_id === 'IGJ_AUTORIDADES_GENERO_2026').length}`);

    rawFetchedCount = rawCandidates.length;

    // ── BATCH DEDUPLICATION BEFORE EVALUATION ──
    const seenCandidateKeys = new Set();
    for (const c of rawCandidates) {
      const key = `${c.source_id}:${c.source_record_id}`;
      if (seenCandidateKeys.has(key)) {
        batchDuplicatesFiltered++;
        continue;
      }
      seenCandidateKeys.add(key);
      candidatesToEvaluate.push(c);
      if (candidatesToEvaluate.length >= CANDIDATE_LIMIT) break;
    }

    console.log(`\n  RAW_RECORDS_FETCHED: ${rawFetchedCount}`);
    console.log(`  BATCH_DUPLICATES_DEDUPLICATED: ${batchDuplicatesFiltered}`);
    console.log(`  UNIQUE_CANDIDATES_TO_EVALUATE: ${candidatesToEvaluate.length}`);

    fs.writeFileSync(BATCH_FILE_PATH, JSON.stringify(candidatesToEvaluate, null, 2));
    console.log(`  Saved ${candidatesToEvaluate.length} unique candidates to ${BATCH_FILE_PATH} for replay.\n`);
  }

  // ── Processing pipeline ─────────────────────────────────────
  const metrics = {
    raw_records_fetched: rawFetchedCount,
    candidates_discovered: rawFetchedCount,
    batch_duplicates_deduplicated: batchDuplicatesFiltered,
    candidates_evaluated: 0,
    new_canonical: 0,
    merge_existing: 0,
    insufficient_evidence: 0,
    reject: 0,
    identity_conflict: 0,
    new_canonical_searchable: 0,
    pipeline_errors: 0,
    source_breakdown: {},
    decisions: [],
    new_canonical_latencies_ms: [],
  };

  // Initialize source breakdown
  for (const sid of Object.keys(SOURCE_POLICIES)) {
    metrics.source_breakdown[sid] = {
      raw_fetched: 0,
      candidates_discovered: 0,
      candidates_evaluated: 0,
      new_canonical: 0,
      merge_existing: 0,
      insufficient_evidence: 0,
      reject: 0,
      identity_conflict: 0,
    };
  }

  const t0 = performance.now();

  console.log('>>> Executing Staging, Identity Resolution & Write Path...');
  for (const candidate of candidatesToEvaluate) {
    const src = candidate.source_id;
    if (!metrics.source_breakdown[src]) {
      metrics.source_breakdown[src] = {
        raw_fetched: 0, candidates_discovered: 0, candidates_evaluated: 0,
        new_canonical: 0, merge_existing: 0, insufficient_evidence: 0, reject: 0, identity_conflict: 0,
      };
    }
    metrics.source_breakdown[src].candidates_evaluated++;
    metrics.candidates_evaluated++;

    const tDiscovered = Date.now();

    // 1. Stage in DB
    try {
      const stagingRecord = {
        discovery_id: candidate.candidate_id,
        display_name: candidate.display_name,
        profession: candidate.profession,
        role: candidate.role,
        organization: candidate.organization,
        geography_id: candidate.geography || 'argentina',
        neighborhood: 'Nacional',
        location_relation_type: 'PUBLIC_SOURCE_DISCOVERY',
        location_evidence: `Discovered from ${candidate.source_id}. URL: ${candidate.source_url}`,
        location_source_url: candidate.source_url,
        source_id: candidate.source_id,
        source_record_id: candidate.source_record_id,
        person_source_url: candidate.source_url,
        evidence_strength: candidate.has_persistent_id ? 'HIGH' : 'MEDIUM',
      };
      await sb.from('atlas_people_discovery_candidates').upsert(stagingRecord, { onConflict: 'source_id,source_record_id' });
    } catch (e) {
      console.warn(`  [STAGING WARN] ${candidate.display_name}: ${e.message}`);
    }

    // 2. Identity Resolution (Every evaluated candidate MUST receive an explicit decision)
    let resolution;
    try {
      resolution = await resolveIdentity(candidate, sb);
    } catch (irErr) {
      metrics.pipeline_errors++;
      resolution = {
        decision: 'INSUFFICIENT_EVIDENCE',
        decision_reason: `IR_EXCEPTION: ${irErr.message}`,
        matched_atlas_person_id: null,
        derived_person_id: null,
        confidence: 0,
        signals: ['error_fallback'],
      };
    }

    const { decision, decision_reason, matched_atlas_person_id, derived_person_id, confidence, signals } = resolution;
    const finalPersonId = matched_atlas_person_id || derived_person_id || null;

    // Record decision in audit list
    metrics.decisions.push({
      candidate_id: candidate.candidate_id,
      source: candidate.source_id,
      source_record_id: candidate.source_record_id,
      display_name: candidate.display_name,
      decision,
      decision_reason,
      atlas_person_id: finalPersonId,
      evidence_signals: signals || [],
      confidence,
    });

    // Accounting per decision
    if (decision === 'NEW_CANONICAL') {
      metrics.new_canonical++;
      metrics.source_breakdown[src].new_canonical++;
      try {
        const projectionDoc = await commitNewCanonical(candidate, resolution, sb, pgClient);
        const isSearchable = await indexToMeilisearchDelta(projectionDoc);
        if (isSearchable) {
          metrics.new_canonical_searchable++;
          const e2eMs = Date.now() - tDiscovered;
          metrics.new_canonical_latencies_ms.push(e2eMs);
        }
        console.log(`  [NEW_CANONICAL] ${candidate.display_name} -> ${derived_person_id} (searchable: ${isSearchable})`);
      } catch (err) {
        metrics.pipeline_errors++;
        console.error(`  [WRITE ERROR] ${candidate.display_name}: ${err.message}`);
      }
    } else if (decision === 'MERGE_EXISTING') {
      metrics.merge_existing++;
      metrics.source_breakdown[src].merge_existing++;
      console.log(`  [MERGE_EXISTING] ${candidate.display_name} -> ${matched_atlas_person_id}`);
    } else if (decision === 'INSUFFICIENT_EVIDENCE') {
      metrics.insufficient_evidence++;
      metrics.source_breakdown[src].insufficient_evidence++;
      console.log(`  [INSUFFICIENT_EVIDENCE] ${candidate.display_name}: ${decision_reason}`);
    } else if (decision === 'REJECT') {
      metrics.reject++;
      metrics.source_breakdown[src].reject++;
      console.log(`  [REJECT] ${candidate.display_name}: ${decision_reason}`);
    } else if (decision === 'IDENTITY_CONFLICT') {
      metrics.identity_conflict++;
      metrics.source_breakdown[src].identity_conflict++;
      console.warn(`  [IDENTITY_CONFLICT] ${candidate.display_name}: ${decision_reason}`);
    }
  }

  const totalDurationSec = (performance.now() - t0) / 1000;

  // ── INVARIANTS CHECK ────────────────────────────────────────
  const DECISION_TOTAL =
    metrics.new_canonical +
    metrics.merge_existing +
    metrics.insufficient_evidence +
    metrics.reject +
    metrics.identity_conflict;

  const DECISION_CONSERVATION_INVARIANT = DECISION_TOTAL === metrics.candidates_evaluated;

  if (!DECISION_CONSERVATION_INVARIANT) {
    console.error('\n🚨 CRITICAL ERROR: DECISION_CONSERVATION_INVARIANT_VIOLATION 🚨');
    console.error(`  CANDIDATES_EVALUATED: ${metrics.candidates_evaluated}`);
    console.error(`  DECISION_TOTAL:       ${DECISION_TOTAL}`);
    console.error('  PIPELINE_ACCOUNTING_ERROR = TRUE. Halting execution.\n');
    await pgClient.end();
    process.exit(1);
  }

  // ── Post-run safety & canonical count ───────────────────────
  console.log('\n>>> Querying CANONICAL_DISTINCT_PEOPLE_AFTER via official SQL...');
  const CANONICAL_DISTINCT_PEOPLE_AFTER = await queryOfficialCanonicalDistinctPeople(pgClient);
  const CANONICAL_DELTA = CANONICAL_DISTINCT_PEOPLE_AFTER - CANONICAL_DISTINCT_PEOPLE_BEFORE;

  const shadowAfter = getShadowIndexSnapshot();
  const CERTIFIED_INDEX_MUTATED = shadowBefore.mtime_ms !== shadowAfter.mtime_ms || shadowBefore.size !== shadowAfter.size;

  // ── Time to Searchable percentiles ──────────────────────────
  const sortedLatencies = [...metrics.new_canonical_latencies_ms].sort((a, b) => a - b);
  function getPercentile(arr, p) {
    if (!arr.length) return 0;
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(idx, arr.length - 1))];
  }
  const p50TTS = getPercentile(sortedLatencies, 50);
  const p95TTS = getPercentile(sortedLatencies, 95);
  const p99TTS = getPercentile(sortedLatencies, 99);

  // ── Output Summary ──────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`CANARY RESULTS SUMMARY (${mode})`);
  console.log('================================================================================');
  console.log(`RAW_RECORDS_FETCHED:              ${metrics.raw_records_fetched}`);
  console.log(`CANDIDATES_DISCOVERED:            ${metrics.candidates_discovered}`);
  console.log(`BATCH_DUPLICATES_DEDUPLICATED:    ${metrics.batch_duplicates_deduplicated}`);
  console.log(`CANDIDATES_EVALUATED:             ${metrics.candidates_evaluated}`);
  console.log(`DECISION_TOTAL:                   ${DECISION_TOTAL}`);
  console.log(`DECISION_CONSERVATION_INVARIANT:  ${DECISION_CONSERVATION_INVARIANT ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`NEW_CANONICAL:                    ${metrics.new_canonical}`);
  console.log(`MERGE_EXISTING:                   ${metrics.merge_existing}`);
  console.log(`INSUFFICIENT_EVIDENCE:            ${metrics.insufficient_evidence}`);
  console.log(`REJECT:                           ${metrics.reject}`);
  console.log(`IDENTITY_CONFLICT:                ${metrics.identity_conflict}`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`NEW_CANONICAL_SEARCHABLE:         ${metrics.new_canonical_searchable}`);
  console.log(`PIPELINE_ERRORS:                  ${metrics.pipeline_errors}`);
  console.log(`CANONICAL_COUNT_BEFORE:           ${CANONICAL_DISTINCT_PEOPLE_BEFORE}`);
  console.log(`CANONICAL_COUNT_AFTER:            ${CANONICAL_DISTINCT_PEOPLE_AFTER}`);
  console.log(`CANONICAL_DELTA:                  ${CANONICAL_DELTA}`);
  console.log(`END_TO_END_TIME_TO_SEARCHABLE_P50: ${p50TTS} ms`);
  console.log(`END_TO_END_TIME_TO_SEARCHABLE_P95: ${p95TTS} ms`);
  console.log(`END_TO_END_TIME_TO_SEARCHABLE_P99: ${p99TTS} ms`);
  console.log(`CERTIFIED_INDEX_MUTATED:          ${CERTIFIED_INDEX_MUTATED ? 'TRUE (MUTATED!)' : 'FALSE'}`);

  const replayIdempotent = IS_FRESH_REPLAY
    ? (metrics.new_canonical === 0 && CANONICAL_DELTA === 0)
    : null;

  if (IS_FRESH_REPLAY) {
    console.log('--------------------------------------------------------------------------------');
    console.log(`SECOND_RUN_NEW_CANONICAL:         ${metrics.new_canonical}`);
    console.log(`SECOND_RUN_NEW_WRITES_TO_MAP:     ${CANONICAL_DELTA}`);
    console.log(`REPLAY_IDEMPOTENT:                ${replayIdempotent ? 'TRUE ✅' : 'FALSE ❌'}`);
  }

  // ── Source Breakdown Display ────────────────────────────────
  console.log('\n================================================================================');
  console.log('SOURCE BREAKDOWN ACCOUNTING');
  console.log('================================================================================');
  for (const [sname, sbk] of Object.entries(metrics.source_breakdown)) {
    if (sbk.candidates_evaluated > 0) {
      const srcTotalDecisions = sbk.new_canonical + sbk.merge_existing + sbk.insufficient_evidence + sbk.reject + sbk.identity_conflict;
      console.log(`[${sname}]`);
      console.log(`  EVALUATED:    ${sbk.candidates_evaluated}`);
      console.log(`  NEW:          ${sbk.new_canonical}`);
      console.log(`  MERGE:        ${sbk.merge_existing}`);
      console.log(`  INSUFFICIENT: ${sbk.insufficient_evidence}`);
      console.log(`  REJECT:       ${sbk.reject}`);
      console.log(`  CONFLICT:     ${sbk.identity_conflict}`);
      console.log(`  SUBTOTAL:     ${srcTotalDecisions} (Matches evaluated: ${srcTotalDecisions === sbk.candidates_evaluated ? 'YES ✅' : 'NO ❌'})`);
    }
  }

  // ── Save Artifact ───────────────────────────────────────────
  const reportPayload = {
    benchmark: mode,
    timestamp: new Date().toISOString(),
    duration_seconds: parseFloat(totalDurationSec.toFixed(2)),
    candidate_limit: CANDIDATE_LIMIT,
    canonical_id_generation_mechanism: 'atlas_arg_per_ (14 chars) + HMAC_SHA256(ATLAS_IGJ_IDENTITY_HMAC_KEY, payload).slice(0, 16) (16 chars) = 30 chars total',
    transactional_write_path: {
      identity_map_atomic: true,
      search_outbox_atomic: true,
      delta_projection_same_transaction: false,
      meilisearch_eventual: true,
    },
    certified_index_mutated: CERTIFIED_INDEX_MUTATED,
    decision_conservation_invariant: DECISION_CONSERVATION_INVARIANT ? 'PASS' : 'FAIL',
    metrics: {
      raw_records_fetched: metrics.raw_records_fetched,
      candidates_discovered: metrics.candidates_discovered,
      batch_duplicates_deduplicated: metrics.batch_duplicates_deduplicated,
      candidates_evaluated: metrics.candidates_evaluated,
      decision_total: DECISION_TOTAL,
      new_canonical: metrics.new_canonical,
      merge_existing: metrics.merge_existing,
      insufficient_evidence: metrics.insufficient_evidence,
      reject: metrics.reject,
      identity_conflict: metrics.identity_conflict,
      new_canonical_searchable: metrics.new_canonical_searchable,
      pipeline_errors: metrics.pipeline_errors,
      source_breakdown: metrics.source_breakdown,
      decisions: metrics.decisions,
    },
    canonical_counts: {
      before: CANONICAL_DISTINCT_PEOPLE_BEFORE,
      after: CANONICAL_DISTINCT_PEOPLE_AFTER,
      delta: CANONICAL_DELTA,
    },
    replay_idempotency: IS_FRESH_REPLAY ? {
      second_run_new_canonical: metrics.new_canonical,
      second_run_new_writes_to_map: CANONICAL_DELTA,
      replay_idempotent: replayIdempotent,
    } : null,
    time_to_searchable_ms: {
      p50: p50TTS,
      p95: p95TTS,
      p99: p99TTS,
    },
  };

  fs.writeFileSync(REPORT_FILE_PATH, JSON.stringify(reportPayload, null, 2));
  console.log(`\n✅ Saved report to ${REPORT_FILE_PATH}`);

  await pgClient.end();
}

main().catch(err => {
  console.error('Fatal Canary Error:', err);
  process.exit(1);
});
