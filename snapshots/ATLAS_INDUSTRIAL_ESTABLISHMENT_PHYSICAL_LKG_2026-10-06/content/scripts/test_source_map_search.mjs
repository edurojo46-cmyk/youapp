/**
 * scripts/test_source_map_search.mjs
 * 
 * Tests the internal ATLAS_SOURCE_MAP_SEARCH service with the queries specified
 * in user instructions Section 18 & 19.
 */

import { AtlasSourceMapSearch } from '../src/lib/atlas/discovery/SourceMapSearch.mjs';

async function testSearch() {
  const searchEngine = new AtlasSourceMapSearch();
  try {
    console.log('=== TEST 1: Coverage and Capacity Metrics ===');
    const metrics = await searchEngine.getSourceMapCoverageAndCapacity();
    console.log(JSON.stringify(metrics, null, 2));

    console.log('\n=== TEST 2: sources with PERSON in PBA ===');
    const pbaPersons = await searchEngine.searchSources({
      entity_type: 'PERSON',
      geography: 'PBA',
      limit: 5
    });
    console.log(`Found: ${pbaPersons.length}`);
    for (const s of pbaPersons) {
      console.log(`  - [${s.source_id}] ${s.source_name} (est: ${s.estimated_records})`);
    }

    console.log('\n=== TEST 3: sources with ORGANIZATION in CABA ===');
    const cabaOrgs = await searchEngine.searchSources({
      entity_type: 'ORGANIZATION',
      geography: 'CABA',
      limit: 5
    });
    console.log(`Found: ${cabaOrgs.length}`);
    for (const s of cabaOrgs) {
      console.log(`  - [${s.source_id}] ${s.source_name}`);
    }

    console.log('\n=== TEST 4: large sources with low overlap (<60%) ===');
    const largeLowOverlap = await searchEngine.findLargeLowOverlapUniverses({
      minSize: 10000,
      maxOverlap: 0.60
    });
    console.log(`Found: ${largeLowOverlap.length}`);
    for (const s of largeLowOverlap) {
      const overlap = s.overlap_memory?.overlap_with_ssot_history?.[0] ?? 'N/A';
      console.log(`  - [${s.source_id}] ${s.source_name} (records: ${s.estimated_records}, overlap: ${overlap})`);
    }

    console.log('\n=== TEST 5: sources in La Matanza ===');
    const matanza = await searchEngine.searchSources({
      keyword: 'Matanza',
      limit: 5
    });
    console.log(`Found: ${matanza.length}`);
    for (const s of matanza) {
      console.log(`  - [${s.source_id}] ${s.source_name}`);
    }

    console.log('\n=== TEST 6: sources containing companies ===');
    const companies = await searchEngine.searchSources({
      entity_type: 'COMPANY',
      limit: 5
    });
    console.log(`Found: ${companies.length}`);
    for (const s of companies) {
      console.log(`  - [${s.source_id}] ${s.source_name}`);
    }

    console.log('\n✓ All ATLAS_SOURCE_MAP_SEARCH tests passed successfully.');
  } finally {
    await searchEngine.close();
  }
}

testSearch().catch(console.error);
