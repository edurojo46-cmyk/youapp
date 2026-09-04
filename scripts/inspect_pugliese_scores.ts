import { retrieveInternalCandidates } from '../src/lib/search/retrievalEngine';
import { parseQuery } from '../src/lib/search/queryEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { normalizeItems } from '../src/lib/search/normalizationEngine';
import { deduplicateItems } from '../src/lib/search/deduplicationEngine';
import { calculateBaseRanking } from '../src/lib/search/rankingEngine';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';
import { applyPersonalization } from '../src/lib/search/personalizationEngine';
import { applyIntentFit } from '../src/lib/search/intentFit';

async function main() {
  const rawQuery = 'osvaldo pugliese';
  const query = parseQuery(rawQuery);
  const retrieval = await retrieveInternalCandidates(query);
  console.log('Retrieval count:', retrieval.candidates.length);

  let candidates = normalizeItems(retrieval.candidates);
  candidates = deduplicateItems(candidates);
  candidates = calculateBaseRanking(candidates, query);
  candidates = calculateQualityScore(candidates);

  const detection = exactWorkSearchGate.detectExactWork(rawQuery);

  console.log('\n--- Candidates after BaseRanking & Quality ---');
  candidates.forEach((c, i) => {
    const af = exactWorkSearchGate.calculateArtistFidelity(c, detection);
    console.log(`[${i+1}] "${c.title}"`);
    console.log(`    Provider: ${c.provider}, Source: ${c.retrievalSource}`);
    console.log(`    Quality: ${c.qualityScore}, Relevance: ${c.relevanceScore}, AF: ${af}`);
  });

  const filtered = exactWorkSearchGate.filterAndDiversifyExactWorkCandidates(candidates, detection, 75);
  console.log('\n--- After filterAndDiversifyExactWorkCandidates ---', filtered.length);
  filtered.forEach((c, i) => {
    console.log(`[${i+1}] "${c.title}" Q:${c.qualityScore} R:${c.relevanceScore} AF:${c.artistFidelityScore}`);
  });
}

main().catch(console.error);
