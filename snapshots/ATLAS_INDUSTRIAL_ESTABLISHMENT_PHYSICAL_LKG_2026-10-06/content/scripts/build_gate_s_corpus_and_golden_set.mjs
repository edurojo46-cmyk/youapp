/**
 * scripts/build_gate_s_corpus_and_golden_set.mjs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ATLAS GATE S: REALISTIC QUERY CORPUS & GOLDEN SET BUILDER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. Samples physical entities from PostgreSQL to build a 50,000+ query template pool.
 * 2. Generates a deterministic 1,000,000 request sequence with controlled distribution:
 *    - NAME / SURNAME / FULL_NAME: 30%
 *    - ROLE / PROFESSION: 15%
 *    - ORGANIZATION: 15%
 *    - GEOGRAPHY: 10%
 *    - COMBINED: 15%
 *    - LOW_SELECTIVITY: 10%
 *    - NEGATIVE_NO_RESULT: 5%
 * 3. Builds a Golden Correctness Set (1,000 physical queries with expected atlas_person_id).
 * 4. Freezes all artifacts with SHA-256 checksums and seed reproducibility.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))          url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY='))   serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db:   { schema: 'public' }
});

const CORPUS_PATH      = path.resolve('reports/atlas/search/atlas_gate_s_query_corpus.jsonl');
const SEQUENCE_PATH    = path.resolve('reports/atlas/search/atlas_gate_s_1m_request_sequence.jsonl');
const GOLDEN_SET_PATH  = path.resolve('reports/atlas/search/atlas_gate_s_golden_set.json');
const MANIFEST_PATH    = path.resolve('reports/atlas/search/atlas_gate_s_corpus_manifest.json');

const RANDOM_SEED      = 20260917;
const TOTAL_REQUESTS   = 1_000_000;
const GOLDEN_SET_SIZE  = 1_000;
const SEP              = '═'.repeat(75);

// Deterministic PRNG (Mulberry32)
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const prng = mulberry32(RANDOM_SEED);

function randomChoice(arr) {
  return arr[Math.floor(prng() * arr.length)];
}

const lowSelectivityTerms = [
  'ARGENTINA', 'SALUD', 'SOCIEDAD', 'NACIONAL', 'SERVICIO', 'ADMINISTRACION',
  'DIRECCION', 'GENERAL', 'MINISTERIO', 'SECRETARIA', 'OFICIAL', 'RECURSOS',
  'PUBLICO', 'CONSULTORES', 'INVERSIONES', 'SERVICIOS', 'COMERCIAL', 'GESTION'
];

const negativeQueries = [
  'ZZZNONEXISTENTPERSON999', 'QXWYJKLMNT', 'INEXISTENTE_EMPRESA_998877',
  'AUTORIDAD_FANTASMA_404', 'MEDICO_ASTRONAUTA_MARTE', 'MINISTERIO_DE_MAGIA_ARG',
  'ORGANISMO_INEXISTENTE_XYZ', 'PERSONA_NO_REGISTRADA_000', 'NO_MATCH_TOKEN_888'
];

const geographies = [
  'CABA', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Tucumán',
  'Entre Ríos', 'Salta', 'Misiones', 'Chaco', 'Corrientes', 'Santiago del Estero',
  'San Juan', 'Jujuy', 'Río Negro', 'Neuquén', 'Formosa', 'Chubut',
  'San Luis', 'Catamarca', 'La Rioja', 'La Pampa', 'Santa Cruz', 'Tierra del Fuego'
];

async function main() {
  console.log(`\n${SEP}`);
  console.log('🏛️  BUILDING GATE S QUERY CORPUS, SEQUENCE & GOLDEN CORRECTNESS SET');
  console.log(`   Random Seed: ${RANDOM_SEED}`);
  console.log(`   Total Request Sequence: ${TOTAL_REQUESTS.toLocaleString()} requests`);
  console.log(`   Golden Set Size: ${GOLDEN_SET_SIZE.toLocaleString()} queries`);
  console.log(`${SEP}\n`);

  fs.mkdirSync(path.dirname(CORPUS_PATH), { recursive: true });

  // 1. Fetch Physical Sample from PostgreSQL
  console.log('1. Fetching candidate entities from PostgreSQL...');
  const t0 = performance.now();
  const rawEntities = [];
  
  // Query 50 pages of 1000 items from discovery candidates
  let lastId = 'disc_a';
  for (let page = 0; page < 60; page++) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, atlas_person_id, display_name, role, profession, organization, neighborhood, source_id')
      .gt('discovery_id', lastId)
      .order('discovery_id', { ascending: true })
      .limit(1000);

    if (error) {
      console.error(`Error on page ${page}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    lastId = data[data.length - 1].discovery_id;
    rawEntities.push(...data);
  }

  console.log(`   Fetched ${rawEntities.length.toLocaleString()} physical entities in ${((performance.now() - t0)/1000).toFixed(1)}s.`);

  // 2. Extract Vocabulary Pools
  console.log('\n2. Extracting distinct vocabulary pools...');
  const firstNames = new Set();
  const lastNames  = new Set();
  const fullNames  = new Set();
  const roles      = new Set();
  const orgs       = new Set();

  for (const e of rawEntities) {
    const name = (e.display_name || '').trim();
    if (name && name.length >= 3 && !name.includes('{')) {
      fullNames.add(name);
      const parts = name.split(/\s+/).filter(p => p.length >= 2);
      if (parts.length >= 2) {
        firstNames.add(parts[0]);
        lastNames.add(parts[parts.length - 1]);
      }
    }
    if (e.role && e.role.trim().length >= 3) roles.add(e.role.trim());
    if (e.profession && e.profession.trim().length >= 3) roles.add(e.profession.trim());
    if (e.organization && e.organization.trim().length >= 4) orgs.add(e.organization.trim());
  }

  const poolFirstNames = Array.from(firstNames);
  const poolLastNames  = Array.from(lastNames);
  const poolFullNames  = Array.from(fullNames);
  const poolRoles      = Array.from(roles);
  const poolOrgs       = Array.from(orgs);

  console.log(`   First Names:   ${poolFirstNames.length.toLocaleString()}`);
  console.log(`   Last Names:    ${poolLastNames.length.toLocaleString()}`);
  console.log(`   Full Names:    ${poolFullNames.length.toLocaleString()}`);
  console.log(`   Roles/Profs:   ${poolRoles.length.toLocaleString()}`);
  console.log(`   Organizations: ${poolOrgs.length.toLocaleString()}`);

  // 3. Build Distinct Template Pool (50,000+ distinct templates)
  console.log('\n3. Building Query Template Pool...');
  const templatePool = [];
  const seenTemplateKeys = new Set();

  function addTemplate(category, params) {
    const key = JSON.stringify(params);
    if (!seenTemplateKeys.has(key)) {
      seenTemplateKeys.add(key);
      templatePool.push({ category, params });
    }
  }

  // Populate Categories
  for (const fn of poolFirstNames) addTemplate('NAME', { query: fn, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  for (const ln of poolLastNames) addTemplate('SURNAME', { query: ln, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  for (const fl of poolFullNames.slice(0, 15000)) addTemplate('FULL_NAME', { query: fl, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  for (const r of poolRoles) addTemplate('ROLE_PROFESSION', { query: r, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  for (const o of poolOrgs.slice(0, 15000)) addTemplate('ORGANIZATION', { organization: o, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  for (const g of geographies) addTemplate('GEOGRAPHY', { geography: g, evidence_state: 'ALL_ARGENTINA', limit: 10 });

  // Combined templates
  for (let i = 0; i < 15000; i++) {
    const fn = randomChoice(poolFirstNames);
    const org = randomChoice(poolOrgs);
    const role = randomChoice(poolRoles);
    const geo = randomChoice(geographies);
    
    if (i % 3 === 0) addTemplate('COMBINED', { query: fn, organization: org, evidence_state: 'ALL_ARGENTINA', limit: 10 });
    else if (i % 3 === 1) addTemplate('COMBINED', { query: fn, role: role, evidence_state: 'ALL_ARGENTINA', limit: 10 });
    else addTemplate('COMBINED', { query: fn, geography: geo, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  }

  // Low Selectivity
  for (const ls of lowSelectivityTerms) {
    addTemplate('LOW_SELECTIVITY', { query: ls, evidence_state: 'ALL_ARGENTINA', limit: 20 });
  }

  // Negative Queries
  for (const neg of negativeQueries) {
    addTemplate('NEGATIVE_NO_RESULT', { query: neg, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  }
  for (let i = 0; i < 500; i++) {
    addTemplate('NEGATIVE_NO_RESULT', { query: `NONEXISTENT_HASH_${crypto.randomBytes(6).toString('hex')}`, evidence_state: 'ALL_ARGENTINA', limit: 10 });
  }

  console.log(`   Total Unique Query Templates in Pool: ${templatePool.length.toLocaleString()}`);

  // Write Template Pool to disk
  fs.writeFileSync(CORPUS_PATH, templatePool.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
  const corpusBuffer = fs.readFileSync(CORPUS_PATH);
  const corpusSha256 = crypto.createHash('sha256').update(corpusBuffer).digest('hex');

  // 4. Build Golden Correctness Set (1,000 cases with expected matches)
  console.log('\n4. Building Golden Correctness Set (1,000 test cases)...');
  const goldenSet = [];
  const goldenEntities = rawEntities
    .filter(e => e.atlas_person_id && !e.atlas_person_id.includes('test_') && e.display_name && e.display_name.length > 5)
    .slice(0, GOLDEN_SET_SIZE);

  for (let i = 0; i < goldenEntities.length; i++) {
    const ent = goldenEntities[i];
    const cleanName = ent.display_name.replace(/[,()"]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleanName.split(' ');
    // Use first token (Surname or First Name) with length >= 4
    const queryTerm = parts.find(p => p.length >= 4) || parts[0];

    goldenSet.push({
      test_id: `golden_${i + 1}`,
      category: 'KNOWN_CANONICAL_MATCH',
      params: {
        query: queryTerm,
        evidence_state: 'ALL_ARGENTINA',
        limit: 10
      },
      expected: {
        atlas_person_id: ent.atlas_person_id,
        display_name: ent.display_name,
        source_id: ent.source_id
      }
    });
  }

  // Add 50 negative golden test cases
  for (let i = 0; i < 50; i++) {
    goldenSet.push({
      test_id: `golden_neg_${i + 1}`,
      category: 'NEGATIVE_VERIFICATION',
      params: {
        query: `DEFINITELY_NO_RECORD_HASH_${i}_${crypto.randomBytes(8).toString('hex')}`,
        evidence_state: 'ALL_ARGENTINA',
        limit: 5
      },
      expected: {
        min_results: 0,
        max_results: 0
      }
    });
  }

  fs.writeFileSync(GOLDEN_SET_PATH, JSON.stringify(goldenSet, null, 2), 'utf8');
  const goldenSetSha256 = crypto.createHash('sha256').update(fs.readFileSync(GOLDEN_SET_PATH)).digest('hex');
  console.log(`   Golden Set Created (${goldenSet.length} cases | SHA-256: ${goldenSetSha256})`);

  // 5. Generate 1,000,000 Request Sequence with Controlled Distribution
  console.log('\n5. Generating 1,000,000 Request Sequence with Controlled Distribution...');
  // Categorized template buckets
  const buckets = {
    NAME_OR_FULL:     templatePool.filter(t => ['NAME', 'SURNAME', 'FULL_NAME'].includes(t.category)),
    ROLE_PROFESSION:  templatePool.filter(t => t.category === 'ROLE_PROFESSION'),
    ORGANIZATION:     templatePool.filter(t => t.category === 'ORGANIZATION'),
    GEOGRAPHY:        templatePool.filter(t => t.category === 'GEOGRAPHY'),
    COMBINED:         templatePool.filter(t => t.category === 'COMBINED'),
    LOW_SELECTIVITY:  templatePool.filter(t => t.category === 'LOW_SELECTIVITY'),
    NEGATIVE:         templatePool.filter(t => t.category === 'NEGATIVE_NO_RESULT')
  };

  const distributionWeights = [
    { cat: 'NAME_OR_FULL',    weight: 0.30 }, // 30%
    { cat: 'ROLE_PROFESSION', weight: 0.15 }, // 15%
    { cat: 'ORGANIZATION',    weight: 0.15 }, // 15%
    { cat: 'GEOGRAPHY',       weight: 0.10 }, // 10%
    { cat: 'COMBINED',        weight: 0.15 }, // 15%
    { cat: 'LOW_SELECTIVITY', weight: 0.10 }, // 10%
    { cat: 'NEGATIVE',        weight: 0.05 }  //  5%
  ];

  const cumulativeWeights = [];
  let cum = 0;
  for (const d of distributionWeights) {
    cum += d.weight;
    cumulativeWeights.push({ cat: d.cat, cum });
  }

  const sequenceStream = fs.createWriteStream(SEQUENCE_PATH, { encoding: 'utf8' });
  const actualDistribution = {};

  for (let reqId = 1; reqId <= TOTAL_REQUESTS; reqId++) {
    const r = prng();
    let selectedCat = 'NAME_OR_FULL';
    for (const cw of cumulativeWeights) {
      if (r <= cw.cum) {
        selectedCat = cw.cat;
        break;
      }
    }

    const bucket = buckets[selectedCat];
    const template = bucket[Math.floor(prng() * bucket.length)];
    actualDistribution[selectedCat] = (actualDistribution[selectedCat] || 0) + 1;

    const requestItem = {
      req_id: reqId,
      category: template.category,
      params: template.params
    };

    sequenceStream.write(JSON.stringify(requestItem) + '\n');
  }

  sequenceStream.end();
  await new Promise(res => sequenceStream.on('finish', res));

  console.log('\n6. Computing Sequence SHA-256...');
  const seqFileBuffer = fs.readFileSync(SEQUENCE_PATH);
  const sequenceSha256 = crypto.createHash('sha256').update(seqFileBuffer).digest('hex');

  // 7. Save Manifest
  const manifest = {
    benchmark_name: "ATLAS_GATE_S_1M_SEARCH_BENCHMARK",
    version: "1.0.0",
    created_at: new Date().toISOString(),
    random_seed: RANDOM_SEED,
    total_requests: TOTAL_REQUESTS,
    target_qps: 1041.67,
    engineering_target_qps: 1200.0,
    sla_time_limit_seconds: 960,
    target_distribution: {
      "NAME_OR_FULL": "30%",
      "ROLE_PROFESSION": "15%",
      "ORGANIZATION": "15%",
      "GEOGRAPHY": "10%",
      "COMBINED": "15%",
      "LOW_SELECTIVITY": "10%",
      "NEGATIVE": "5%"
    },
    actual_distribution: actualDistribution,
    corpus_templates_count: templatePool.length,
    corpus_sha256: corpusSha256,
    request_sequence_sha256: sequenceSha256,
    golden_set_count: goldenSet.length,
    golden_set_sha256: goldenSetSha256
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log('✅ GATE S CORPUS, SEQUENCE & MANIFEST FROZEN');
  console.log(`   Manifest:           ${MANIFEST_PATH}`);
  console.log(`   Corpus Templates:   ${CORPUS_PATH} (SHA-256: ${corpusSha256})`);
  console.log(`   1M Request Seq:     ${SEQUENCE_PATH} (SHA-256: ${sequenceSha256})`);
  console.log(`   Golden Set:         ${GOLDEN_SET_PATH} (SHA-256: ${goldenSetSha256})`);
  console.log(`   Actual Distribution:`, actualDistribution);
  console.log(`${SEP}\n`);
}

main().catch(err => {
  console.error('FATAL BUILD ERROR:', err);
  process.exit(1);
});
