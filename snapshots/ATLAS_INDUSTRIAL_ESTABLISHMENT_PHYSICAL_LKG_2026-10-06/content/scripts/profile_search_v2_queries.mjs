import 'dotenv/config';
import { performance } from 'perf_hooks';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2.ts';

const testCases = [
  { category: 'NAME', query: 'JUAN CARLOS' },
  { category: 'FULL_NAME', query: 'GOMEZ PABLO' },
  { category: 'ROLE_PROFESSION', query: 'GERENTE' },
  { category: 'ORGANIZATION', query: 'SOCIEDAD ANONIMA' },
  { category: 'GEOGRAPHY', query: 'BUENOS AIRES' },
  { category: 'COMBINED', query: 'JUAN DIRECTOR' },
  { category: 'LOW_SELECTIVITY', query: 'MARIA' },
  { category: 'NEGATIVE', query: 'ZZZZNONEXISTENTXZQ999' }
];

console.log('=== PROFILING ATLAS PEOPLE SEARCH V2 ACROSS CATEGORIES ===\n');

for (const tc of testCases) {
  const times = [];
  let resultCount = 0;
  let uniqueCanonicalCount = 0;

  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const res = await AtlasPeopleSearchV2.search({
      query: tc.query,
      evidence_state: 'ALL_ARGENTINA',
      limit: 20
    });
    const t1 = performance.now();
    times.push(t1 - t0);
    if (i === 0) {
      resultCount = res.results.length;
      const ids = new Set(res.results.map(it => it.atlas_person_id));
      uniqueCanonicalCount = ids.size;
    }
  }

  const avgMs = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
  const minMs = Math.min(...times).toFixed(1);
  console.log(`[${tc.category}] "${tc.query}"`);
  console.log(`  -> Results: ${resultCount} items | Unique canonical: ${uniqueCanonicalCount}/${resultCount}`);
  console.log(`  -> Latency: Avg ${avgMs}ms | Min ${minMs}ms | Runs: [${times.map(t => t.toFixed(0)).join(', ')}ms]\n`);
}
