import 'dotenv/config';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2';

async function testSpecific() {
  console.log('--- Testing 4 Physical Persons in Search V2 ---');

  // 1. Girardi Raúl
  const r1 = await AtlasPeopleSearchV2.search({ query: 'Girardi Raúl', evidence_state: 'ALL_CABA' });
  console.log('1. Girardi Raúl:', {
    total_matches: r1.total_matches,
    firstResult: r1.results[0] ? {
      name: r1.results[0].display_name,
      org: r1.results[0].organization,
      state: r1.results[0].evidence_state,
      src: r1.results[0].source_id
    } : null
  });

  // 2. Jesús Rodríguez Marín
  const r2 = await AtlasPeopleSearchV2.search({ query: 'Jesús Rodríguez Marín', evidence_state: 'ALL_CABA' });
  console.log('2. Jesús Rodríguez Marín:', {
    total_matches: r2.total_matches,
    firstResult: r2.results[0] ? {
      name: r2.results[0].display_name,
      org: r2.results[0].organization,
      state: r2.results[0].evidence_state,
      src: r2.results[0].source_id
    } : null
  });

  // 3. Grimanesa Lazaro
  const r3 = await AtlasPeopleSearchV2.search({ query: 'Grimanesa Lazaro', evidence_state: 'ALL_CABA' });
  console.log('3. Grimanesa Lazaro:', {
    total_matches: r3.total_matches,
    firstResult: r3.results[0] ? {
      name: r3.results[0].display_name,
      org: r3.results[0].organization,
      state: r3.results[0].evidence_state,
      src: r3.results[0].source_id
    } : null
  });

  // 4. CESAR DANIEL LLANOS
  const r4 = await AtlasPeopleSearchV2.search({ query: 'CESAR DANIEL LLANOS', evidence_state: 'CANONICAL' });
  console.log('4. CESAR DANIEL LLANOS:', {
    total_matches: r4.total_matches,
    firstResult: r4.results[0] ? {
      name: r4.results[0].display_name,
      org: r4.results[0].organization,
      state: r4.results[0].evidence_state,
      src: r4.results[0].source_id
    } : null
  });

  console.log('\n--- Testing Tab Counts ---');
  const states = ['ALL_CABA', 'CURRENT', 'RECENT', 'ASSOCIATED_STALE', 'CANONICAL', 'HISTORICAL'] as const;
  for (const s of states) {
    const res = await AtlasPeopleSearchV2.search({ evidence_state: s, limit: 1 });
    console.log(`Tab ${s}: total_matches = ${res.total_matches}, firstItem = ${res.results[0]?.display_name} (${res.results[0]?.evidence_state})`);
  }
}

testSpecific().catch(console.error);
