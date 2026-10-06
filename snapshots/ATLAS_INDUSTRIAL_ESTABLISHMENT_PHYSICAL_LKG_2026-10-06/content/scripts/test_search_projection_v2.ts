import 'dotenv/config';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2';

async function testSearchV2() {
  console.log('=== VERIFYING ATLAS PEOPLE SEARCH V2 (SERVER-SIDE POSTGRES) ===\n');

  // 1. Search OpenAlex Current
  console.log('1. Testing OpenAlex Current: "Girardi Raúl"...');
  const resCurrent = await AtlasPeopleSearchV2.search({
    query: 'Girardi Raúl',
    evidence_state: 'ALL_CABA'
  });
  console.log(`   Matches: ${resCurrent.total_matches}, DB latency: ${resCurrent.db_query_ms}ms, Total: ${resCurrent.api_total_ms}ms`);
  console.log(`   Result:`, resCurrent.results[0] ? {
    display_name: resCurrent.results[0].display_name,
    organization: resCurrent.results[0].organization,
    source_id: resCurrent.results[0].source_id,
    evidence_state: resCurrent.results[0].evidence_state
  } : 'NOT FOUND');
  if (!resCurrent.results[0] || resCurrent.results[0].evidence_state !== 'CURRENT') {
    throw new Error('FAILED: Expected Girardi Raúl to be found with evidence_state CURRENT');
  }

  // 2. Search OpenAlex Recent
  console.log('\n2. Testing OpenAlex Recent: "Jesús Rodríguez Marín"...');
  const resRecent = await AtlasPeopleSearchV2.search({
    query: 'Jesús Rodríguez Marín',
    evidence_state: 'ALL_CABA'
  });
  console.log(`   Matches: ${resRecent.total_matches}, DB latency: ${resRecent.db_query_ms}ms`);
  console.log(`   Result:`, resRecent.results[0] ? {
    display_name: resRecent.results[0].display_name,
    organization: resRecent.results[0].organization,
    source_id: resRecent.results[0].source_id,
    evidence_state: resRecent.results[0].evidence_state
  } : 'NOT FOUND');
  if (!resRecent.results[0] || resRecent.results[0].evidence_state !== 'RECENT') {
    throw new Error('FAILED: Expected Jesús Rodríguez Marín to be found with evidence_state RECENT');
  }

  // 3. Search Wikidata Associated
  console.log('\n3. Testing Wikidata Associated: "Grimanesa Lazaro"...');
  const resWiki = await AtlasPeopleSearchV2.search({
    query: 'Grimanesa Lazaro',
    evidence_state: 'ALL_CABA'
  });
  console.log(`   Matches: ${resWiki.total_matches}, DB latency: ${resWiki.db_query_ms}ms`);
  console.log(`   Result:`, resWiki.results[0] ? {
    display_name: resWiki.results[0].display_name,
    organization: resWiki.results[0].organization,
    source_id: resWiki.results[0].source_id,
    evidence_state: resWiki.results[0].evidence_state
  } : 'NOT FOUND');
  if (!resWiki.results[0] || resWiki.results[0].evidence_state !== 'ASSOCIATED_STALE') {
    throw new Error('FAILED: Expected Grimanesa Lazaro with evidence_state ASSOCIATED_STALE');
  }

  // 4. Search Canonical
  console.log('\n4. Testing Canonical baseline: "CESAR DANIEL LLANOS"...');
  const resCan = await AtlasPeopleSearchV2.search({
    query: 'CESAR DANIEL LLANOS',
    evidence_state: 'CANONICAL'
  });
  console.log(`   Matches: ${resCan.total_matches}, DB latency: ${resCan.db_query_ms}ms`);
  console.log(`   Result:`, resCan.results[0] ? {
    display_name: resCan.results[0].display_name,
    organization: resCan.results[0].organization,
    source_id: resCan.results[0].source_id,
    evidence_state: resCan.results[0].evidence_state
  } : 'NOT FOUND');
  if (!resCan.results[0] || resCan.results[0].evidence_state !== 'CANONICAL') {
    throw new Error('FAILED: Expected CESAR DANIEL LLANOS with evidence_state CANONICAL');
  }

  // 5. Check Tab ALL_CABA total count
  console.log('\n5. Checking Default ALL_CABA tab count...');
  const resAll = await AtlasPeopleSearchV2.search({
    evidence_state: 'ALL_CABA',
    limit: 10
  });
  console.log(`   ALL_CABA total matches: ${resAll.total_matches} (Expected: 11247)`);
  if (resAll.total_matches !== 11247) {
    throw new Error(`FAILED: Expected 11247 for ALL_CABA, got ${resAll.total_matches}`);
  }

  // 6. Check Tab CANONICAL total count
  console.log('\n6. Checking CANONICAL tab count...');
  const resCanAll = await AtlasPeopleSearchV2.search({
    evidence_state: 'CANONICAL',
    limit: 10
  });
  console.log(`   CANONICAL total matches: ${resCanAll.total_matches} (Expected: 2091)`);
  if (resCanAll.total_matches !== 2091) {
    throw new Error(`FAILED: Expected 2091 for CANONICAL, got ${resCanAll.total_matches}`);
  }

  // 7. Check Tab RECENT total count
  console.log('\n7. Checking RECENT tab count...');
  const resRecAll = await AtlasPeopleSearchV2.search({
    evidence_state: 'RECENT',
    limit: 10
  });
  console.log(`   RECENT total matches: ${resRecAll.total_matches} (Expected: 1083)`);
  if (resRecAll.total_matches !== 1083) {
    throw new Error(`FAILED: Expected 1083 for RECENT, got ${resRecAll.total_matches}`);
  }

  console.log('\n>>> ALL 7 PHYSICAL SEARCH V2 ACCEPTANCE CRITERIA PASSED! <<<');
}

testSearchV2().catch(err => {
  console.error(err);
  process.exit(1);
});
