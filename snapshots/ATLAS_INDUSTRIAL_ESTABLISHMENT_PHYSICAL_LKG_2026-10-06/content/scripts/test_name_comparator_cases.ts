import { compareAuthorNames, normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';

async function testCases() {
  console.log('=== TEST COMPARADOR COMPARATIVO DE NOMBRES CONICET ===\n');

  // Case 1: C. Martín Gómez vs C Martín-Gómez
  const c1Target = 'C. Martín Gómez';
  const c1Candidate = 'C Martín-Gómez';
  const res1 = compareAuthorNames(c1Target, c1Candidate);
  console.log('Caso 1 (C. Martín Gómez vs C Martín-Gómez):', {
    normTarget: normalizeNameForComparison(c1Target),
    normCandidate: normalizeNameForComparison(c1Candidate),
    matches: res1.matches,
    confidence: res1.confidence,
    reason: res1.reason
  });

  if (!res1.matches || res1.confidence < 0.95) {
    throw new Error('Case 1 FAILED');
  }

  // Case 2: I. Echeverría Huarte vs I Echeverría-Huarte
  const c2Target = 'I. Echeverría Huarte';
  const c2Candidate = 'I Echeverría-Huarte';
  const res2 = compareAuthorNames(c2Target, c2Candidate);
  console.log('\nCaso 2 (I. Echeverría Huarte vs I Echeverría-Huarte):', {
    normTarget: normalizeNameForComparison(c2Target),
    normCandidate: normalizeNameForComparison(c2Candidate),
    matches: res2.matches,
    confidence: res2.confidence,
    reason: res2.reason
  });

  if (!res2.matches || res2.confidence < 0.95) {
    throw new Error('Case 2 FAILED');
  }

  // Negative tests: ensure no collisions with other people
  const neg1 = compareAuthorNames('C. Martín Gómez', 'A. Martín Gómez');
  console.log('\nNegative Test 1 (C. Martín Gómez vs A. Martín Gómez): matches =', neg1.matches);
  if (neg1.matches) throw new Error('Negative test 1 FAILED: Initial mismatch should not match!');

  const neg2 = compareAuthorNames('I. Echeverría Huarte', 'Iker Zuriguel');
  console.log('Negative Test 2 (I. Echeverría Huarte vs Iker Zuriguel): matches =', neg2.matches);
  if (neg2.matches) throw new Error('Negative test 2 FAILED: Different surname should not match!');

  console.log('\n>>> NAME_NORMALIZATION_EQUIVALENCE = PASS (100% SUCCESS) <<<');
}

testCases().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
