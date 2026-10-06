import fs from 'node:fs';
import path from 'node:path';

// Contradiction detection engine with hardened classification rules
export function evaluateAttributeContradiction(field_type, obsA, obsB) {
  const valA = (obsA.value || '').trim();
  const valB = (obsB.value || '').trim();

  if (!valA || !valB) {
    return { isContradiction: false, reason: 'EMPTY_OR_MISSING' };
  }

  // 1. Placeholder & Anonymization Tokens Filter
  const placeholderRegex = /^(persona\s+[0-9a-f_]+|s\/d|no\s+declara|anonymized.*|[0-9a-f]{64})$/i;
  if (placeholderRegex.test(valA) || placeholderRegex.test(valB)) {
    return { isContradiction: false, reason: 'ANONYMIZATION_OR_PLACEHOLDER_ARTIFACT' };
  }

  // 2. Normalization Comparison
  const normA = valA.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = valB.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  if (normA === normB) {
    return { isContradiction: false, reason: 'NORMALIZATION_EQUIVALENCE' };
  }

  // 3. Formatting & Name Token Permutation (e.g. "Perez Juan" vs "Juan Perez")
  if (field_type === 'NAME') {
    const tokensA = normA.split(' ').sort().join(' ');
    const tokensB = normB.split(' ').sort().join(' ');
    if (tokensA === tokensB) {
      return { isContradiction: false, reason: 'FORMATTING_OR_TOKEN_ORDER' };
    }

    // Single-letter initial match (e.g. "Juan C Perez" vs "Juan Carlos Perez", or "Alvarez Prado, Juan M." vs "Juan Manuel Alvarez Prado")
    const wordsA = normA.split(' ').sort();
    const wordsB = normB.split(' ').sort();
    if (wordsA.length === wordsB.length) {
      let isInitialMatch = true;
      for (let i = 0; i < wordsA.length; i++) {
        const wA = wordsA[i];
        const wB = wordsB[i];
        if (wA !== wB && !(wA.length === 1 && wB.startsWith(wA)) && !(wB.length === 1 && wA.startsWith(wB))) {
          isInitialMatch = false;
          break;
        }
      }
      if (isInitialMatch) {
        return { isContradiction: false, reason: 'INITIAL_NAME_COMPATIBILITY' };
      }
    }
  }

  // 4. Temporal Multi-Value Transition (Roles, Orgs, Addresses across distinct timeframes)
  if (['ROLE', 'ORGANIZATION', 'ADDRESS'].includes(field_type)) {
    const dateA = obsA.observed_at ? new Date(obsA.observed_at).getTime() : 0;
    const dateB = obsB.observed_at ? new Date(obsB.observed_at).getTime() : 0;
    // If observations are from distinct periods or multi-cardinality is permitted
    if (Math.abs(dateA - dateB) > 30 * 24 * 3600 * 1000 || obsA.is_concurrent_allowed) {
      return { isContradiction: false, reason: 'TEMPORAL_SEQUENCE_OR_MULTI_CARDINALITY' };
    }
  }

  // 5. If none of the compatibility rules matched and the normalized values differ substantively
  return { 
    isContradiction: true, 
    reason: `GENUINE_ATTRIBUTE_DISCREPANCY: "${valA}" vs "${valB}"` 
  };
}

async function main() {
  console.log('================================================================');
  console.log('🔬 PROFILE CONTRADICTION ENGINE — GROUND TRUTH BENCHMARK');
  console.log('================================================================\n');

  // Explicit ground truth dataset (50 deterministic test cases)
  const truthSet = [
    // --- 1. True Conflicting Names (15 Cases -> True Contradictions) ---
    { id: 'C01', field: 'NAME', obsA: { value: 'Juan Carlos Perez' }, obsB: { value: 'Roberto Gomez' }, expected: true },
    { id: 'C02', field: 'NAME', obsA: { value: 'Maria Elena Rodriguez' }, obsB: { value: 'Lucia Fernández' }, expected: true },
    { id: 'C03', field: 'NAME', obsA: { value: 'Carlos Alberto Tevez' }, obsB: { value: 'Esteban Cambiasso' }, expected: true },
    { id: 'C04', field: 'NAME', obsA: { value: 'Agustin Rossi' }, obsB: { value: 'Franco Armani' }, expected: true },
    { id: 'C05', field: 'NAME', obsA: { value: 'Guillermo Barros Schelotto' }, obsB: { value: 'Marcelo Gallardo' }, expected: true },
    { id: 'C06', field: 'NAME', obsA: { value: 'Silvia Gonzalez' }, obsB: { value: 'Beatriz Gimenez' }, expected: true },
    { id: 'C07', field: 'NAME', obsA: { value: 'Federico Federico' }, obsB: { value: 'Eduardo Eduardo' }, expected: true },
    { id: 'C08', field: 'NAME', obsA: { value: 'Hernan Diaz' }, obsB: { value: 'Jorge Martinez' }, expected: true },
    { id: 'C09', field: 'NAME', obsA: { value: 'Pablo Aimar' }, obsB: { value: 'Javier Saviola' }, expected: true },
    { id: 'C10', field: 'NAME', obsA: { value: 'Matias Almeyda' }, obsB: { value: 'Diego Simeone' }, expected: true },
    { id: 'C11', field: 'NAME', obsA: { value: 'Romina Del Pla' }, obsB: { value: 'Myriam Bregman' }, expected: true },
    { id: 'C12', field: 'NAME', obsA: { value: 'Ignacio Torres' }, obsB: { value: 'Maximiliano Pullaro' }, expected: true },
    { id: 'C13', field: 'NAME', obsA: { value: 'Claudio Tapia' }, obsB: { value: 'Daniel Angelici' }, expected: true },
    { id: 'C14', field: 'NAME', obsA: { value: 'Sergio Massa' }, obsB: { value: 'Horacio Rodriguez Larreta' }, expected: true },
    { id: 'C15', field: 'NAME', obsA: { value: 'Patricia Bullrich' }, obsB: { value: 'Victoria Villarruel' }, expected: true },

    // --- 2. Normalization Differences (10 Cases -> NOT Contradictions) ---
    { id: 'N01', field: 'NAME', obsA: { value: 'JUAN PEREZ' }, obsB: { value: 'Juan Pérez' }, expected: false },
    { id: 'N02', field: 'NAME', obsA: { value: 'GONZALEZ, MARIA' }, obsB: { value: 'González, María' }, expected: false },
    { id: 'N03', field: 'NAME', obsA: { value: '  carlos   alberto ' }, obsB: { value: 'Carlos Alberto' }, expected: false },
    { id: 'N04', field: 'NAME', obsA: { value: 'MARTIN D\'ALESSANDRO' }, obsB: { value: 'Martin D Alessandro' }, expected: false },
    { id: 'N05', field: 'NAME', obsA: { value: 'HECTOR NUÑEZ' }, obsB: { value: 'Hector Nunez' }, expected: false },
    { id: 'N06', field: 'NAME', obsA: { value: 'sofia fernandez' }, obsB: { value: 'SOFÍA FERNÁNDEZ' }, expected: false },
    { id: 'N07', field: 'NAME', obsA: { value: 'AGUSTINA LOPEZ' }, obsB: { value: 'agustina lópez' }, expected: false },
    { id: 'N08', field: 'NAME', obsA: { value: 'DIEGO MARADONA' }, obsB: { value: 'Diego Maradona' }, expected: false },
    { id: 'N09', field: 'NAME', obsA: { value: 'LIONEL ANDRES MESSI' }, obsB: { value: 'Lionel Andrés Messi' }, expected: false },
    { id: 'N10', field: 'NAME', obsA: { value: 'LEANDRO PAREDES' }, obsB: { value: 'Leandro Paredes' }, expected: false },

    // --- 3. Temporal Transitions (10 Cases -> NOT Contradictions) ---
    { id: 'T01', field: 'ROLE', obsA: { value: 'Director', observed_at: '2019-03-01' }, obsB: { value: 'Presidente', observed_at: '2023-05-15' }, expected: false },
    { id: 'T02', field: 'ORGANIZATION', obsA: { value: 'Mercado Libre', observed_at: '2018-01-01' }, obsB: { value: 'Globant', observed_at: '2024-01-01' }, expected: false },
    { id: 'T03', field: 'ROLE', obsA: { value: 'Vocal Titular', observed_at: '2020-11-01' }, obsB: { value: 'Secretario General', observed_at: '2024-06-01' }, expected: false },
    { id: 'T04', field: 'ADDRESS', obsA: { value: 'Av Santa Fe 1234, CABA', observed_at: '2021-01-01' }, obsB: { value: 'Av Corrientes 4567, CABA', observed_at: '2025-01-01' }, expected: false },
    { id: 'T05', field: 'ROLE', obsA: { value: 'Gerente General', observed_at: '2017-08-01' }, obsB: { value: 'Socio Gerente', observed_at: '2022-10-01' }, expected: false },
    { id: 'T06', field: 'ORGANIZATION', obsA: { value: 'UBA - FFyL', observed_at: '2016-03-01' }, obsB: { value: 'CONICET', observed_at: '2021-02-01' }, expected: false },
    { id: 'T07', field: 'ROLE', obsA: { value: 'Diputado Nacional', observed_at: '2019-12-10' }, obsB: { value: 'Senador Nacional', observed_at: '2023-12-10' }, expected: false },
    { id: 'T08', field: 'ROLE', obsA: { value: 'Ministro de Economia', observed_at: '2022-08-03' }, obsB: { value: 'Candidato Presidencial', observed_at: '2023-10-01' }, expected: false },
    { id: 'T09', field: 'ORGANIZATION', obsA: { value: 'Accenture', observed_at: '2015-04-01' }, obsB: { value: 'Auth0', observed_at: '2020-09-01' }, expected: false },
    { id: 'T10', field: 'ROLE', obsA: { value: 'Docente Adjunto', observed_at: '2020-04-01' }, obsB: { value: 'Profesor Titular', observed_at: '2025-03-01' }, expected: false },

    // --- 4. Formatting Differences & Permutations (8 Cases -> NOT Contradictions) ---
    { id: 'F01', field: 'NAME', obsA: { value: 'Perez, Juan Carlos' }, obsB: { value: 'Juan Carlos Perez' }, expected: false },
    { id: 'F02', field: 'NAME', obsA: { value: 'Gomez - Rodriguez, Maria' }, obsB: { value: 'Maria Gomez Rodriguez' }, expected: false },
    { id: 'F03', field: 'NAME', obsA: { value: 'Juan C. Perez' }, obsB: { value: 'Juan Carlos Perez' }, expected: false },
    { id: 'F04', field: 'NAME', obsA: { value: 'M. Florencia Fernandez' }, obsB: { value: 'Maria Florencia Fernandez' }, expected: false },
    { id: 'F05', field: 'NAME', obsA: { value: 'Rossi, Agustin Daniel' }, obsB: { value: 'Agustin Daniel Rossi' }, expected: false },
    { id: 'F06', field: 'NAME', obsA: { value: 'De La Rua, Fernando' }, obsB: { value: 'Fernando De La Rua' }, expected: false },
    { id: 'F07', field: 'NAME', obsA: { value: 'Di Cesare, Lucas' }, obsB: { value: 'Lucas Di Cesare' }, expected: false },
    { id: 'F08', field: 'NAME', obsA: { value: 'Alvarez Prado, Juan M.' }, obsB: { value: 'Juan Manuel Alvarez Prado' }, expected: false },

    // --- 5. Placeholder & Anonymization Tokens (7 Cases -> NOT Contradictions) ---
    { id: 'P01', field: 'NAME', obsA: { value: 'PERSONA 20169201170' }, obsB: { value: 'Juan Carlos Perez' }, expected: false },
    { id: 'P02', field: 'NAME', obsA: { value: 'PERSONA d395cf507785d11c750b28498877112233445566778899aabbccddeeff001122' }, obsB: { value: 'Maria Rodriguez' }, expected: false },
    { id: 'P03', field: 'NAME', obsA: { value: 'S/D' }, obsB: { value: 'Carlos Alberto Tevez' }, expected: false },
    { id: 'P04', field: 'NAME', obsA: { value: 'NO DECLARA' }, obsB: { value: 'Sofia Gomez' }, expected: false },
    { id: 'P05', field: 'NAME', obsA: { value: 'PERSONA 27334455661' }, obsB: { value: 'PERSONA e89211aa8844' }, expected: false },
    { id: 'P06', field: 'NAME', obsA: { value: 'ANONYMIZED_RECORD' }, obsB: { value: 'Federico Gonzalez' }, expected: false },
    { id: 'P07', field: 'NAME', obsA: { value: '0000000000000000000000000000000000000000000000000000000000000000' }, obsB: { value: 'Esteban Cambiasso' }, expected: false }
  ];

  let TP = 0;
  let FP = 0;
  let TN = 0;
  let FN = 0;

  const results = [];

  for (const item of truthSet) {
    const res = evaluateAttributeContradiction(item.field, item.obsA, item.obsB);
    const predicted = res.isContradiction;
    const actual = item.expected;

    if (actual === true && predicted === true) TP++;
    else if (actual === false && predicted === true) FP++;
    else if (actual === false && predicted === false) TN++;
    else if (actual === true && predicted === false) FN++;

    results.push({
      id: item.id,
      field: item.field,
      valA: item.obsA.value,
      valB: item.obsB.value,
      actual,
      predicted,
      reason: res.reason,
      match: actual === predicted
    });
  }

  const precision = (TP + FP) > 0 ? Number((TP / (TP + FP)).toFixed(4)) : 1.0;
  const recall = (TP + FN) > 0 ? Number((TP / (TP + FN)).toFixed(4)) : 1.0;
  const accuracy = Number(((TP + TN) / truthSet.length).toFixed(4));
  const f1 = (precision + recall) > 0 ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4)) : 1.0;

  const summary = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_EVALUATED: truthSet.length,
    CONFUSION_MATRIX: {
      TP,
      FP,
      TN,
      FN
    },
    METRICS: {
      CONTRADICTION_PRECISION: precision,
      CONTRADICTION_RECALL: recall,
      CONTRADICTION_ACCURACY: accuracy,
      CONTRADICTION_F1: f1
    },
    GATE_STATUS: (FP === 0 && FN === 0 && precision === 1.0 && recall === 1.0) ? 'PASS' : 'FAIL',
    DETAILS: results
  };

  fs.mkdirSync('reports/atlas/profile', { recursive: true });
  fs.writeFileSync('reports/atlas/profile/contradiction_truth_set_evaluation.json', JSON.stringify(summary, null, 2));

  console.log('--- CONTRADICTION TRUTH SET EVALUATION RESULTS ---');
  console.log(`TOTAL EVALUATED          : ${summary.TOTAL_EVALUATED}`);
  console.log(`TRUE POSITIVES (TP)      : ${TP}`);
  console.log(`FALSE POSITIVES (FP)     : ${FP}`);
  console.log(`TRUE NEGATIVES (TN)      : ${TN}`);
  console.log(`FALSE NEGATIVES (FN)     : ${FN}`);
  console.log(`CONTRADICTION_PRECISION  : ${(precision * 100).toFixed(2)}%`);
  console.log(`CONTRADICTION_RECALL     : ${(recall * 100).toFixed(2)}%`);
  console.log(`CONTRADICTION_ACCURACY   : ${(accuracy * 100).toFixed(2)}%`);
  console.log(`CONTRADICTION_GATE       : ${summary.GATE_STATUS}`);
  console.log('Saved to reports/atlas/profile/contradiction_truth_set_evaluation.json\n');
}

main().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
