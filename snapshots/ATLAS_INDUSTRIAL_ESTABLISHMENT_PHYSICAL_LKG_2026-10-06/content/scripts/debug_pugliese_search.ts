import { retrieveInternalCandidates } from '../src/lib/search/retrievalEngine';
import { parseQuery } from '../src/lib/search/queryEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { executeSearch } from '../src/lib/search/searchEngine';

async function main() {
  const rawQuery = 'osvaldo pugliese';
  const query = parseQuery(rawQuery);
  console.log('Query:', query);

  const retrieval = await retrieveInternalCandidates(query);
  console.log(`retrieveInternalCandidates returned: ${retrieval.candidates.length} items`);
  retrieval.candidates.forEach((c, i) => {
    console.log(`  [${i + 1}] [${c.provider}:${c.id}] "${c.title}"`);
  });

  const detection = exactWorkSearchGate.detectExactWork(rawQuery);
  console.log('\nDetection:', detection);

  retrieval.candidates.forEach((c, i) => {
    const af = exactWorkSearchGate.calculateArtistFidelity(c, detection);
    const wf = exactWorkSearchGate.calculateWorkFidelity(c, detection);
    const role = exactWorkSearchGate.classifyContentRole(c, detection);
    const objType = exactWorkSearchGate.detectObjectType(c, role);
    const directPerf = exactWorkSearchGate.isDirectPerformance(c, role);

    console.log(`\nCandidate [${i + 1}]: "${c.title}"`);
    console.log(`  ArtistFidelity: ${af}`);
    console.log(`  WorkFidelity: ${wf}`);
    console.log(`  ContentRole: ${role}`);
    console.log(`  ObjectType: ${objType}`);
    console.log(`  DirectPerformance: ${directPerf}`);
  });

  console.log('\n--- Running full executeSearch ---');
  const res = await executeSearch(rawQuery, {
    excludeProviders: ['youtube-radar']
  });

  console.log(`executeSearch returned all: ${res.all.length} items`);
  res.all.forEach((c, i) => {
    console.log(`  [${i + 1}] [${c.provider}:${c.id}] "${c.title}" (Q:${c.qualityScore}, R:${c.relevanceScore}, AF:${c.artistFidelityScore})`);
  });
}

main().catch(console.error);
