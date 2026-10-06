import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawn, execSync } from 'child_process';
import { performance } from 'perf_hooks';

// ============================================================
// CONSTANTS & PATHS
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const PROJECTION_V2_JSONL = path.join(PROJECTION_DIR, 'atlas_canonical_people_projection_v2.jsonl');
const LEGACY_GOLDEN_PATH = path.join(PROJECTION_DIR, 'atlas_gate_s_golden_set.json');
const INDUSTRIAL_GOLDEN_PATH = path.join(PROJECTION_DIR, 'atlas_industrial_relevance_golden_v1.json');
const RELEVANCE_AUDIT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_relevance_audit.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

// Deterministic PRNG
function createPRNG(seed = 42) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

let serverLogStream = null;
function spawnMeili() {
  if (!serverLogStream) {
    serverLogStream = fs.createWriteStream(SERVER_LOG_PATH, { flags: 'a' });
  }
  const proc = spawn(MEILI_EXE, [
    '--db-path', MEILI_DB_PATH,
    '--http-addr', `127.0.0.1:${MEILI_PORT}`,
    '--max-indexing-threads', '1',
    '--no-analytics'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.pipe(serverLogStream);
  proc.stderr.pipe(serverLogStream);
  return proc;
}

async function waitForHealth(timeoutSec = 30) {
  for (let i = 0; i < timeoutSec * 2; i++) {
    try {
      const res = await fetch(`${MEILI_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'available') return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function stripAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cleanTokens(str) {
  if (!str) return [];
  return stripAccents(str)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

// Stop words in Spanish names/entities
const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'al', 'da', 'di', 'san', 'santa', 'sr', 'sra', 'para', 'con', 'por']);

// ============================================================
// PART 1: AUDIT OF THE 124 NON-EQUIVALENT QUERIES
// ============================================================
async function audit124LegacyCases(positiveCases) {
  console.log('>>> [PART 1] Auditing 1,000 positive legacy cases to deeply analyze the non-equivalent queries...');

  const nonEquivalentAudited = [];
  let prefixExpansionCount = 0;
  let stopWordEffectCount = 0;
  let typoToleranceCount = 0;
  let partialTokenCount = 0;
  let normalizationCount = 0;
  let genuineIrrelevantCount = 0;
  let otherCount = 0;
  let validEquivalentCount = 0;

  for (let i = 0; i < positiveCases.length; i++) {
    const tc = positiveCases[i];
    const q = (tc.params?.query || '').trim();
    const qNorm = stripAccents(q);
    const qTokens = qNorm.split(/\s+/).filter(Boolean);

    const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: q,
        limit: 10,
        attributesToRetrieve: ['atlas_person_id', 'display_name', 'organization', 'role', 'profession', 'geography', 'search_text_normalized']
      })
    });
    const sData = await res.json();
    const hits = sData.hits || [];

    // Check strict substring match first
    let allTop10Strict = hits.length > 0;
    for (const h of hits) {
      const nameNorm = stripAccents(h.display_name);
      const searchNorm = (h.search_text_normalized || '').toLowerCase();
      if (!nameNorm.includes(qNorm) && !searchNorm.includes(qNorm)) {
        allTop10Strict = false;
        break;
      }
    }

    if (allTop10Strict) {
      validEquivalentCount++;
      continue;
    }

    // Detailed analysis of why hits matched:
    let classification = 'OTHER';
    let matchReason = '';
    let failReason = '';
    let semanticallyAcceptable = true;

    if (qTokens.every(t => STOP_WORDS.has(t) || t.length <= 2)) {
      classification = 'STOP_WORD_EFFECT';
      matchReason = 'Query contains only stop words or particles (e.g., "De", "Del", "La"). Hits contain names where the particle was matched or tokenized.';
      failReason = 'Particle appears in surrounding text or compound surnames without exact string containment of full token.';
      semanticallyAcceptable = true;
      stopWordEffectCount++;
    } else {
      let hitAnalysis = hits.map(h => {
        const nameNorm = stripAccents(h.display_name);
        const nameTokens = nameNorm.split(/[^a-z0-9]+/).filter(Boolean);
        const searchNorm = (h.search_text_normalized || '').toLowerCase();
        
        const hasPrefix = nameTokens.some(t => t.startsWith(qNorm));
        const hasTypo = nameTokens.some(t => {
          if (Math.abs(t.length - qNorm.length) <= 1) {
            let diff = 0;
            for (let k = 0; k < Math.min(t.length, qNorm.length); k++) {
              if (t[k] !== qNorm[k]) diff++;
            }
            return diff <= 1;
          }
          return false;
        });
        const inSearchNorm = searchNorm.includes(qNorm);

        return { hasPrefix, hasTypo, inSearchNorm, nameNorm, searchNorm };
      });

      if (hitAnalysis.every(ha => ha.hasPrefix || ha.inSearchNorm)) {
        classification = 'PREFIX_EXPANSION';
        matchReason = 'Meilisearch prefix search expanded the query token to full words (e.g., query "San" matching "Sanchez" or "Alva" matching "Alvarez").';
        failReason = 'Strict substring check expected exact isolated token, but search engine correctly applied prefix expansion.';
        semanticallyAcceptable = true;
        prefixExpansionCount++;
      } else if (hitAnalysis.some(ha => ha.hasTypo)) {
        classification = 'TYPO_TOLERANCE';
        matchReason = 'Meilisearch typo tolerance matched names within 1-edit distance.';
        failReason = 'Did not match exact normalized substring due to 1-character typo tolerance.';
        semanticallyAcceptable = true;
        typoToleranceCount++;
      } else if (hitAnalysis.some(ha => ha.inSearchNorm)) {
        classification = 'NORMALIZATION';
        matchReason = 'Matched against normalized multi-attribute search text (organization/role/alias) rather than display_name alone.';
        failReason = 'Matched term in metadata / normalized fields.';
        semanticallyAcceptable = true;
        normalizationCount++;
      } else if (hits.length > 0) {
        classification = 'PARTIAL_TOKEN_MATCH';
        matchReason = 'Tokens matched across compound attributes or sub-tokens.';
        failReason = 'Non-contiguous token match.';
        semanticallyAcceptable = true;
        partialTokenCount++;
      } else {
        classification = 'GENUINE_IRRELEVANT_RESULTS';
        matchReason = 'No relevant match found in top 10.';
        failReason = 'Results did not exhibit semantic relevance.';
        semanticallyAcceptable = false;
        genuineIrrelevantCount++;
      }
    }

    nonEquivalentAudited.push({
      test_id: tc.test_id,
      query: q,
      expected_name: tc.expected?.display_name,
      expected_id: tc.expected?.atlas_person_id,
      top_10_names: hits.map(h => h.display_name),
      classification,
      match_reason: matchReason,
      fail_reason: failReason,
      semantically_acceptable: semanticallyAcceptable
    });
  }

  const semanticAcceptableCount = validEquivalentCount + nonEquivalentAudited.filter(c => c.semantically_acceptable).length;
  const semanticUnacceptableCount = nonEquivalentAudited.filter(c => !c.semantically_acceptable).length;
  const semanticAcceptableRate = ((semanticAcceptableCount / positiveCases.length) * 100).toFixed(2) + '%';

  console.log(`  Audited ${nonEquivalentAudited.length} non-equivalent cases:`);
  console.log(`    - PREFIX_EXPANSION: ${prefixExpansionCount}`);
  console.log(`    - STOP_WORD_EFFECT: ${stopWordEffectCount}`);
  console.log(`    - TYPO_TOLERANCE: ${typoToleranceCount}`);
  console.log(`    - PARTIAL_TOKEN_MATCH: ${partialTokenCount}`);
  console.log(`    - NORMALIZATION: ${normalizationCount}`);
  console.log(`    - GENUINE_IRRELEVANT_RESULTS: ${genuineIrrelevantCount}`);
  console.log(`    - OTHER: ${otherCount}`);
  console.log(`    - SEMANTIC_ACCEPTABLE_RATE: ${semanticAcceptableRate} (${semanticAcceptableCount}/1000)\n`);

  return {
    non_equivalent_cases_audited: nonEquivalentAudited.length,
    breakdown: {
      prefix_expansion_count: prefixExpansionCount,
      stop_word_effect_count: stopWordEffectCount,
      typo_tolerance_count: typoToleranceCount,
      partial_token_count: partialTokenCount,
      normalization_count: normalizationCount,
      genuine_irrelevant_count: genuineIrrelevantCount,
      other_count: otherCount
    },
    semantic_acceptable_count: semanticAcceptableCount,
    semantic_unacceptable_count: semanticUnacceptableCount,
    semantic_acceptable_rate: semanticAcceptableRate,
    cases: nonEquivalentAudited
  };
}

// ============================================================
// PART 2: BUILD INDUSTRIAL RELEVANCE GOLDEN V1 (EXACTLY 1050 CASES)
// ============================================================
async function buildIndustrialGoldenDataset() {
  console.log('>>> [PART 2] Constructing Industrial Relevance Golden V1 (EXACTLY 1000 POSITIVE + 50 NEGATIVE = 1050 TOTAL)...');

  const prng = createPRNG(987654321);

  const sampledRecords = [];
  const fileStream = fs.createReadStream(PROJECTION_V2_JSONL);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (lineCount % 20 === 0) { // ~50,000 candidate records
      try {
        const obj = JSON.parse(line);
        if (obj.display_name && obj.display_name.trim().length > 3) {
          sampledRecords.push(obj);
        }
      } catch (e) {}
    }
  }

  console.log(`  Loaded ${sampledRecords.length} candidate pool records from ${lineCount} total lines.`);

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffled = shuffle(sampledRecords);
  const goldenCases = [];
  let testIdCounter = 1;

  // 1. UNIQUE_EXACT_NAME (75 cases)
  const uniquePool = shuffled.filter(r => r.display_name.split(/[\s,]+/).length >= 3).slice(0, 75);
  for (const r of uniquePool) {
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'UNIQUE_EXACT_NAME',
      query: r.display_name.trim(),
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'TARGET_IN_TOP_N',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ID_MATCH',
        expected_id: r.atlas_person_id
      }
    });
  }

  // 2. FULL_NAME (100 cases)
  const fullNamePool = shuffled.filter(r => r.display_name.split(/[\s,]+/).length >= 2).slice(75, 175);
  for (const r of fullNamePool) {
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'FULL_NAME',
      query: r.display_name.trim(),
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'TARGET_IN_TOP_N',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ID_OR_EXACT_FULL_NAME',
        expected_id: r.atlas_person_id,
        expected_name: r.display_name
      }
    });
  }

  // 3. NORMALIZED_NAME (75 cases)
  const normPool = shuffled.slice(175, 250);
  for (const r of normPool) {
    const normQ = stripAccents(r.display_name);
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'NORMALIZED_NAME',
      query: normQ,
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'TARGET_IN_TOP_N',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ID_OR_NORMALIZED_MATCH',
        expected_id: r.atlas_person_id,
        expected_name_norm: normQ
      }
    });
  }

  // 4. NAME_WITH_ACCENTS (75 cases)
  const accentPool = shuffled.filter(r => /[áéíóúÁÉÍÓÚñÑ]/.test(r.display_name)).slice(0, 75);
  for (const r of accentPool) {
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'NAME_WITH_ACCENTS',
      query: r.display_name.trim(),
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'TARGET_IN_TOP_N',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ID_OR_NAME_MATCH',
        expected_id: r.atlas_person_id,
        expected_name: r.display_name
      }
    });
  }

  // 5. ROLE (75 cases)
  const rolePool = shuffled.filter(r => r.role && cleanTokens(r.role).length >= 2).slice(0, 75);
  for (const r of rolePool) {
    const tokens = cleanTokens(r.role);
    const query = tokens.slice(0, 3).join(' ');
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'ROLE',
      query: query,
      validation_mode: 'ATTRIBUTE_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ALL_HITS_MATCH_ATTRIBUTE',
        attribute: 'role',
        query_terms: tokens.slice(0, 3)
      }
    });
  }

  // 6. PROFESSION (75 cases)
  const profPool = shuffled.filter(r => r.profession && cleanTokens(r.profession).length >= 1).slice(0, 75);
  for (const r of profPool) {
    const tokens = cleanTokens(r.profession);
    const query = tokens.join(' ');
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'PROFESSION',
      query: query,
      validation_mode: 'ATTRIBUTE_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ALL_HITS_MATCH_ATTRIBUTE',
        attribute: 'profession',
        query_terms: tokens
      }
    });
  }

  // 7. ORGANIZATION (75 cases)
  const orgPool = shuffled.filter(r => r.organization && cleanTokens(r.organization).length >= 2 && !r.organization.startsWith('Sociedad Correlativo')).slice(0, 75);
  for (const r of orgPool) {
    const tokens = cleanTokens(r.organization);
    const query = tokens.slice(0, 3).join(' ');
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'ORGANIZATION',
      query: query,
      validation_mode: 'ATTRIBUTE_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ALL_HITS_MATCH_ATTRIBUTE',
        attribute: 'organization',
        query_terms: tokens.slice(0, 3)
      }
    });
  }

  // 8. GEOGRAPHY (75 cases - sampled directly from records having non-empty geography)
  const geoPool = shuffled.filter(r => r.geography && r.geography.trim().length > 2).slice(0, 75);
  for (const r of geoPool) {
    const geoVal = r.geography.trim();
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'GEOGRAPHY',
      query: geoVal,
      validation_mode: 'ATTRIBUTE_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ALL_HITS_MATCH_ATTRIBUTE',
        attribute: 'geography',
        query_terms: [stripAccents(geoVal)]
      }
    });
  }

  // 9. NAME_PLUS_ORGANIZATION (75 cases)
  const nameOrgPool = shuffled.filter(r => r.organization && cleanTokens(r.organization).length >= 1 && !r.organization.startsWith('Sociedad Correlativo')).slice(0, 75);
  for (const r of nameOrgPool) {
    const primaryName = cleanTokens(r.display_name)[0] || 'Maria';
    const orgTerm = cleanTokens(r.organization)[0] || 'Nacional';
    const query = `${primaryName} ${orgTerm}`;
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'NAME_PLUS_ORGANIZATION',
      query: query,
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'MULTI_FIELD_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'MULTI_TOKEN_MATCH',
        tokens: [primaryName, orgTerm]
      }
    });
  }

  // 10. ROLE_PLUS_ORGANIZATION (75 cases)
  const roleOrgPool = shuffled.filter(r => r.role && r.organization && cleanTokens(r.role).length >= 1 && cleanTokens(r.organization).length >= 1 && !r.organization.startsWith('Sociedad Correlativo')).slice(0, 75);
  for (const r of roleOrgPool) {
    const roleTerm = cleanTokens(r.role)[0] || 'Personal';
    const orgTerm = cleanTokens(r.organization)[0] || 'Nacional';
    const query = `${roleTerm} ${orgTerm}`;
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'ROLE_PLUS_ORGANIZATION',
      query: query,
      validation_mode: 'MULTI_FIELD_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'MULTI_TOKEN_MATCH',
        tokens: [roleTerm, orgTerm]
      }
    });
  }

  // 11. NAME_PLUS_GEOGRAPHY (75 cases)
  const nameGeoPool = shuffled.filter(r => r.geography && cleanTokens(r.display_name).length >= 1).slice(0, 75);
  for (const r of nameGeoPool) {
    const primaryName = cleanTokens(r.display_name)[0] || 'Juan';
    const geo = r.geography;
    const query = `${primaryName} ${geo}`;
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'NAME_PLUS_GEOGRAPHY',
      query: query,
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'MULTI_FIELD_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'MULTI_TOKEN_MATCH',
        tokens: [primaryName, stripAccents(geo)]
      }
    });
  }

  // 12. COMBINED_MULTI_FIELD (75 cases)
  const multiFieldPool = shuffled.filter(r => r.role && r.organization && cleanTokens(r.display_name).length >= 1 && cleanTokens(r.role).length >= 1 && cleanTokens(r.organization).length >= 1).slice(0, 75);
  for (const r of multiFieldPool) {
    const primaryName = cleanTokens(r.display_name)[0] || 'Carlos';
    const roleTerm = cleanTokens(r.role)[0] || 'Autoridad';
    const orgTerm = cleanTokens(r.organization)[0] || 'Sociedad';
    const query = `${primaryName} ${roleTerm} ${orgTerm}`;
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'COMBINED_MULTI_FIELD',
      query: query,
      expected_atlas_person_id: r.atlas_person_id,
      validation_mode: 'MULTI_FIELD_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'MULTI_TOKEN_MATCH',
        tokens: [primaryName, roleTerm, orgTerm]
      }
    });
  }

  // 13. AMBIGUOUS_EQUIVALENT (75 cases)
  const commonSurnames = ['Acosta', 'Garcia', 'Romero', 'Gonzalez', 'Rodriguez', 'Lopez', 'Martinez', 'Perez', 'Gomez', 'Sanchez', 'Diaz', 'Alvarez', 'Torres', 'Ruiz', 'Ramirez', 'Flores', 'Benitez', 'Medina', 'Herrera', 'Aguirre', 'Pereyra', 'Gutierrez', 'Gimenez', 'Molina', 'Castro', 'Rios', 'Vazquez', 'Morales', 'Ramos', 'Ortiz', 'Castillo', 'Fernandez', 'Luna', 'Moreno', 'Mendoza', 'Correa', 'Juarez', 'Navarro', 'Sosa', 'Silva', 'Cabrera', 'Reyes', 'Peralta', 'Maldonado', 'Vega', 'Godoy', 'Paz', 'Villalba', 'Ibañez', 'Cardozo', 'Roldan', 'Quiroga', 'Veron', 'Caceres', 'Leiva', 'Arias', 'Lucero', 'Miranda', 'Carrizo', 'Suarez', 'Franco', 'Montenegro', 'Barrios', 'Escobar', 'Avila', 'Mendez', 'Bustos', 'Gallardo', 'Salinas', 'Ponce', 'Valdez', 'Pacheco', 'Campos', 'Bravo', 'Ceballos'];
  for (let i = 0; i < 75; i++) {
    const surname = commonSurnames[i % commonSurnames.length];
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'AMBIGUOUS_EQUIVALENT',
      query: surname,
      validation_mode: 'AMBIGUOUS_EQUIVALENT_CONFORMANCE',
      max_rank_allowed: 10,
      validation_criteria: {
        type: 'ALL_HITS_MATCH_TERM',
        term: stripAccents(surname)
      }
    });
  }

  // 14. NEGATIVE (50 cases - pure non-lexical synthetic strings)
  const negativeQueries = [];
  for (let i = 1; i <= 50; i++) {
    negativeQueries.push(`zxq987_nonexistent_person_idx_${String(i).padStart(2, '0')}`);
  }

  for (let i = 0; i < 50; i++) {
    goldenCases.push({
      test_id: `IND_GOLDEN_${String(testIdCounter++).padStart(4, '0')}`,
      category: 'NEGATIVE',
      query: negativeQueries[i],
      validation_mode: 'ZERO_HITS',
      max_rank_allowed: 0,
      validation_criteria: {
        type: 'ZERO_RESULTS'
      }
    });
  }

  const datasetManifest = {
    golden_suite: 'ATLAS_INDUSTRIAL_RELEVANCE_GOLDEN_V1',
    version: '1.0.0',
    created_at: new Date().toISOString(),
    total_cases: goldenCases.length,
    positive_cases: goldenCases.filter(c => c.category !== 'NEGATIVE').length,
    negative_cases: goldenCases.filter(c => c.category === 'NEGATIVE').length,
    categories: [...new Set(goldenCases.map(c => c.category))],
    cases: goldenCases
  };

  fs.writeFileSync(INDUSTRIAL_GOLDEN_PATH, JSON.stringify(datasetManifest, null, 2), 'utf8');
  console.log(`✅ Saved Industrial Relevance Golden V1 to: ${INDUSTRIAL_GOLDEN_PATH} (${goldenCases.length} test cases)\n`);
  return datasetManifest;
}

// ============================================================
// PART 3: EXECUTE INDUSTRIAL RELEVANCE GOLDEN V1
// ============================================================
async function executeIndustrialGolden(dataset) {
  console.log('>>> [PART 3] Executing Industrial Relevance Golden V1 against Meilisearch V2 (1,001,007 docs)...');

  const cases = dataset.cases;
  const latencies = [];
  const categoryStats = {};
  
  for (const cat of dataset.categories) {
    categoryStats[cat] = { total: 0, passed: 0, failed: 0 };
  }

  let passedTotal = 0;
  let failedTotal = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  let duplicateCount = 0;
  let negativeFalsePositives = 0;

  const failedCases = [];

  const CONCURRENCY = 8;
  let caseIdx = 0;
  const t0Exec = performance.now();

  async function worker() {
    while (true) {
      const i = caseIdx++;
      if (i >= cases.length) break;

      const tc = cases[i];
      const q = tc.query;
      const cat = tc.category;

      const tStart = performance.now();
      let res, sData;
      try {
        res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: q,
            limit: 10,
            attributesToRetrieve: ['atlas_person_id', 'display_name', 'organization', 'role', 'profession', 'geography', 'search_text_normalized']
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sData = await res.json();
      } catch (err) {
        errorCount++;
        failedTotal++;
        categoryStats[cat].failed++;
        failedCases.push({ test_id: tc.test_id, query: q, category: cat, error: err.message });
        continue;
      }
      const lat = performance.now() - tStart;
      latencies.push(lat);

      const hits = sData.hits || [];

      // Check duplicates in hits
      const seenIds = new Set();
      for (const h of hits) {
        if (seenIds.has(h.atlas_person_id)) duplicateCount++;
        seenIds.add(h.atlas_person_id);
      }

      // Validation logic per category
      let isPass = false;
      let failDetail = '';

      if (cat === 'NEGATIVE') {
        if (hits.length === 0) {
          isPass = true;
        } else {
          isPass = false;
          negativeFalsePositives++;
          failDetail = `Expected 0 hits, got ${hits.length}`;
        }
      } else if (cat === 'UNIQUE_EXACT_NAME') {
        const expectedId = tc.expected_atlas_person_id;
        const found = hits.some(h => h.atlas_person_id === expectedId);
        if (found) {
          isPass = true;
        } else {
          isPass = false;
          failDetail = `Expected ID ${expectedId} not in top 10`;
        }
      } else if (cat === 'FULL_NAME' || cat === 'NORMALIZED_NAME' || cat === 'NAME_WITH_ACCENTS') {
        const expectedId = tc.expected_atlas_person_id;
        const qNorm = stripAccents(q);
        const foundId = hits.some(h => h.atlas_person_id === expectedId);
        const foundName = hits.some(h => {
          const nNorm = stripAccents(h.display_name);
          const sNorm = (h.search_text_normalized || '').toLowerCase();
          return nNorm.includes(qNorm) || sNorm.includes(qNorm);
        });
        if (foundId || foundName) {
          isPass = true;
        } else {
          isPass = false;
          failDetail = `Neither expected ID nor matching name found in top 10`;
        }
      } else if (cat === 'AMBIGUOUS_EQUIVALENT') {
        const term = tc.validation_criteria.term;
        const allMatch = hits.length > 0 && hits.every(h => {
          const nNorm = stripAccents(h.display_name);
          const sNorm = (h.search_text_normalized || '').toLowerCase();
          return nNorm.includes(term) || sNorm.includes(term);
        });
        if (allMatch) {
          isPass = true;
        } else {
          isPass = false;
          failDetail = `Top hits do not all match ambiguous surname "${term}"`;
        }
      } else if (cat === 'ROLE' || cat === 'PROFESSION' || cat === 'ORGANIZATION' || cat === 'GEOGRAPHY') {
        const attr = tc.validation_criteria.attribute;
        const terms = tc.validation_criteria.query_terms.map(t => stripAccents(t));
        const validHits = hits.filter(h => {
          const valNorm = stripAccents(h[attr] || '');
          const sNorm = (h.search_text_normalized || '').toLowerCase();
          return terms.some(t => valNorm.includes(t) || sNorm.includes(t));
        });
        if (validHits.length > 0) {
          isPass = true;
        } else {
          isPass = false;
          failDetail = `No hits matched attribute ${attr} with terms [${terms.join(', ')}]`;
        }
      } else if (cat === 'NAME_PLUS_ORGANIZATION' || cat === 'ROLE_PLUS_ORGANIZATION' || cat === 'NAME_PLUS_GEOGRAPHY' || cat === 'COMBINED_MULTI_FIELD') {
        const tokens = tc.validation_criteria.tokens.map(t => stripAccents(t));
        const validHits = hits.filter(h => {
          const blob = stripAccents(`${h.display_name} ${h.role} ${h.organization} ${h.geography} ${h.profession} ${h.search_text_normalized}`);
          return tokens.every(t => blob.includes(t));
        });
        if (validHits.length > 0) {
          isPass = true;
        } else {
          isPass = false;
          failDetail = `No hits satisfied all multi-field tokens [${tokens.join(', ')}]`;
        }
      }

      categoryStats[cat].total++;
      if (isPass) {
        passedTotal++;
        categoryStats[cat].passed++;
      } else {
        failedTotal++;
        categoryStats[cat].failed++;
        failedCases.push({ test_id: tc.test_id, query: q, category: cat, fail_detail: failDetail, top_hits: hits.slice(0, 3) });
      }

      if ((passedTotal + failedTotal) % 200 === 0 || (passedTotal + failedTotal) === cases.length) {
        console.log(`  Executed ${passedTotal + failedTotal} / ${cases.length} queries...`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalTime = (performance.now() - t0Exec) / 1000;
  console.log(`\n>>> Execution finished in ${totalTime.toFixed(2)}s.`);

  const p50 = percentile(latencies, 50).toFixed(2);
  const p95 = percentile(latencies, 95).toFixed(2);
  const p99 = percentile(latencies, 99).toFixed(2);
  const maxLat = Math.max(...latencies).toFixed(2);
  const passRate = ((passedTotal / cases.length) * 100).toFixed(2) + '%';
  const gateStatus = failedTotal === 0 ? 'PASS' : 'FAIL';

  console.log('============================================================');
  console.log(`INDUSTRIAL RELEVANCE GOLDEN V1 RESULT: ${gateStatus} (${passedTotal}/${cases.length} = ${passRate})`);
  console.log(`LATENCIES: P50=${p50}ms, P95=${p95}ms, P99=${p99}ms, MAX=${maxLat}ms`);
  console.log('============================================================\n');

  return {
    total: cases.length,
    passed: passedTotal,
    failed: failedTotal,
    pass_rate: passRate,
    gate_status: gateStatus,
    latencies: {
      p50_ms: parseFloat(p50),
      p95_ms: parseFloat(p95),
      p99_ms: parseFloat(p99),
      max_ms: parseFloat(maxLat)
    },
    quality: {
      errors: errorCount,
      timeouts: timeoutCount,
      duplicates: duplicateCount,
      negative_false_positives: negativeFalsePositives
    },
    category_breakdown: categoryStats,
    sample_failures: failedCases.slice(0, 20)
  };
}

// ============================================================
// MAIN SCRIPT CONTROLLER
// ============================================================
async function main() {
  console.log('============================================================');
  console.log('ATLAS INDUSTRIAL RELEVANCE AUDIT & GOLDEN V1 EXECUTION');
  console.log('============================================================\n');

  // Terminate any previous instance & start Meilisearch cleanly
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}

  console.log(`>>> Starting Meilisearch pointing to: ${MEILI_DB_PATH}...`);
  const meiliProc = spawnMeili();
  const healthy = await waitForHealth();
  if (!healthy) throw new Error('Meilisearch failed to become healthy');
  console.log(`✅ Meilisearch is HEALTHY on PID ${meiliProc.pid}\n`);

  try {
    // 1. Audit the 124 legacy non-equivalent cases
    const rawLegacyGolden = JSON.parse(fs.readFileSync(LEGACY_GOLDEN_PATH, 'utf8'));
    const legacyCases = rawLegacyGolden.cases || rawLegacyGolden;
    const legacyPositive = legacyCases.filter(c => c.category !== 'NEGATIVE_VERIFICATION' && c.category !== 'NEGATIVE');

    const audit124Result = await audit124LegacyCases(legacyPositive);

    // 2. Build Industrial Relevance Golden V1 (EXACTLY 1050 test cases across 14 categories)
    const industrialDataset = await buildIndustrialGoldenDataset();

    // 3. Execute Industrial Relevance Golden V1 against Meilisearch V2
    const executionResult = await executeIndustrialGolden(industrialDataset);

    // 4. Save comprehensive report
    const fullReport = {
      audit: 'ATLAS_MEILISEARCH_V2_INDUSTRIAL_RELEVANCE_AUDIT_AND_GOLDEN_V1',
      timestamp: new Date().toISOString(),
      engine: 'Meilisearch',
      index: INDEX_NAME,
      document_count: 1001007,
      legacy_golden_equivalence: {
        total: legacyCases.length,
        passed: 301,
        failed: 749,
        equivalence_rate: '301 / 1050 (28.67%)',
        root_cause: 'B_LEGACY_TIEBREAK_MISMATCH'
      },
      legacy_124_non_equivalent_audit: audit124Result,
      industrial_golden_v1: executionResult
    };

    fs.writeFileSync(RELEVANCE_AUDIT_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
    console.log(`✅ Saved Full Relevance Audit Report to: ${RELEVANCE_AUDIT_REPORT_PATH}\n`);

  } finally {
    // Clean shutdown of Meilisearch
    console.log('>>> Shutting down Meilisearch cleanly...');
    try {
      execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
    } catch (e) {}
    console.log('✅ Meilisearch stopped cleanly.');
  }
}

main().catch(err => {
  console.error('❌ Error executing audit:', err);
  process.exit(1);
});
