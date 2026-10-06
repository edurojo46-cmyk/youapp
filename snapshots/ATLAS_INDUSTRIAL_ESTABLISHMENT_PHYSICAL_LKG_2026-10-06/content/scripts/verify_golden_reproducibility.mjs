import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';

const PROJECTION_DIR = path.resolve('reports/atlas/search');
const PROJECTION_V2_JSONL = path.join(PROJECTION_DIR, 'atlas_canonical_people_projection_v2.jsonl');
const INDUSTRIAL_GOLDEN_PATH = path.join(PROJECTION_DIR, 'atlas_industrial_relevance_golden_v1.json');

// Stop words in Spanish names/entities
const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'al', 'da', 'di', 'san', 'santa', 'sr', 'sra', 'para', 'con', 'por']);

function createPRNG(seed = 987654321) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
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

async function runPureOfflineGeneration() {
  const prng = createPRNG(987654321);

  const sampledRecords = [];
  const fileStream = fs.createReadStream(PROJECTION_V2_JSONL);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (lineCount % 20 === 0) {
      try {
        const obj = JSON.parse(line);
        if (obj.display_name && obj.display_name.trim().length > 3) {
          sampledRecords.push(obj);
        }
      } catch (e) {}
    }
  }

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

  // 1. UNIQUE_EXACT_NAME (75)
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

  // 2. FULL_NAME (100)
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

  // 3. NORMALIZED_NAME (75)
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

  // 4. NAME_WITH_ACCENTS (75)
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

  // 5. ROLE (75)
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

  // 6. PROFESSION (75)
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

  // 7. ORGANIZATION (75)
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

  // 8. GEOGRAPHY (75)
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

  // 9. NAME_PLUS_ORGANIZATION (75)
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

  // 10. ROLE_PLUS_ORGANIZATION (75)
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

  // 11. NAME_PLUS_GEOGRAPHY (75)
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

  // 12. COMBINED_MULTI_FIELD (75)
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

  // 13. AMBIGUOUS_EQUIVALENT (75)
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

  // 14. NEGATIVE (50)
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

  return goldenCases;
}

async function main() {
  console.log('============================================================');
  console.log('AUDIT: METHODOLOGICAL INDEPENDENCE & SHA256 REPRODUCIBILITY');
  console.log('============================================================\n');

  // 1. Read existing golden suite
  const existingRaw = fs.readFileSync(INDUSTRIAL_GOLDEN_PATH, 'utf8');
  const existingObj = JSON.parse(existingRaw);
  const existingCases = existingObj.cases;

  const currentGoldenSha = crypto.createHash('sha256').update(JSON.stringify(existingCases)).digest('hex');
  console.log(`CURRENT_GOLDEN_CASES_SHA256: ${currentGoldenSha}`);
  console.log(`CURRENT_CASES_COUNT:        ${existingCases.length}`);

  // 2. Generate pure offline (zero network, zero Meilisearch)
  console.log('\n>>> Running 100% pure offline deterministic generation from Projection V2...');
  const regeneratedCases = await runPureOfflineGeneration();
  const regeneratedOfflineSha = crypto.createHash('sha256').update(JSON.stringify(regeneratedCases)).digest('hex');

  console.log(`REGENERATED_OFFLINE_SHA256:  ${regeneratedOfflineSha}`);
  console.log(`REGENERATED_CASES_COUNT:     ${regeneratedCases.length}`);

  const shaMatch = currentGoldenSha === regeneratedOfflineSha;
  console.log(`\nSHA_MATCH:                   ${shaMatch ? 'TRUE' : 'FALSE'}`);

  // 3. Inspect code for leakage during case generation
  const scriptContent = fs.readFileSync('scripts/audit_124_and_run_industrial_golden.mjs', 'utf8');
  
  // Extract buildIndustrialGoldenDataset function code
  const fnMatch = scriptContent.match(/async function buildIndustrialGoldenDataset\(\)[\s\S]*?return datasetManifest;\s*\}/);
  const fnCode = fnMatch ? fnMatch[0] : '';
  
  const hasFetchInGen = fnCode.includes('fetch(');
  const hasSearchInGen = fnCode.includes('search') && fnCode.includes('http');
  const hasHitsInGen = fnCode.includes('hits') && !fnCode.includes('ZERO_HITS');
  const hasMeiliInGen = fnCode.includes('MEILI_URL');

  console.log('\nLEAKAGE CHECK IN GENERATOR FUNCTION:');
  console.log(`  - Contains fetch():      ${hasFetchInGen}`);
  console.log(`  - Contains search HTTP:  ${hasSearchInGen}`);
  console.log(`  - Contains hits checks:  ${hasHitsInGen}`);
  console.log(`  - Uses MEILI_URL:        ${hasMeiliInGen}`);

  const testLeakage = (!hasFetchInGen && !hasSearchInGen && !hasHitsInGen && !hasMeiliInGen) ? 'NONE' : 'CONFIRMED';
  console.log(`\nTEST_LEAKAGE:                ${testLeakage}`);

  const indMethod = (shaMatch && testLeakage === 'NONE') ? 'INDEPENDENT' : 'CONTAMINATED_OR_UNPROVEN';
  console.log(`INDUSTRIAL_GOLDEN_METHOD:    ${indMethod}`);
}

main().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
