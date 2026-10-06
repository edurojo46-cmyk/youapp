import fetch from 'node-fetch';

async function testEndpoint() {
  console.log('--- TESTING /api/mass-discovery WITH QUERY: CABA ---');
  const res = await fetch('http://localhost:5173/api/mass-discovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'CABA',
      budget: 'STANDARD',
      page: 1,
      page_size: 100,
      atlas_indexed_total: 2091
    })
  });

  if (!res.ok) {
    console.error('Request failed with status:', res.status);
    const text = await res.text();
    console.error(text);
    return;
  }

  const json = await res.json();
  console.log('STATUS: OK');
  console.log('CABA_KPIS:');
  console.log('  ATLAS_CANONICAL_PEOPLE:', json.caba_kpis?.atlas_canonical_people);
  console.log('  CABA_DISCOVERY_INDEX:', json.caba_kpis?.caba_discovery_index);
  console.log('  CURRENT_SEARCH_SESSION_UNIQUE:', json.caba_kpis?.current_search_session_unique);
  console.log('  SOURCE_REPORTED_UNIVERSE:', json.caba_kpis?.source_reported_universe);
  console.log('\nCABA_ROUTING:');
  console.log(json.caba_routing);
  console.log('\nCABA_SOURCES_PANEL (count):', json.caba_sources_panel?.length);
  if (json.caba_sources_panel?.length > 0) {
    console.log('First 5 sources:');
    json.caba_sources_panel.slice(0, 5).forEach((s: any) => {
      console.log(`  - ${s.source_name}: Status=${s.status}, Validated=${s.validated}, Indexed=${s.indexed_unique}`);
    });
  }
  console.log('\nRESULTS RETURNED (count):', json.results?.length);
  if (json.results?.length > 0) {
    console.log('Sample candidate:');
    console.log('  Name:', json.results[0].display_name);
    console.log('  Role:', json.results[0].role_claim);
    console.log('  Org:', json.results[0].organization);
    console.log('  Location:', json.results[0].location_evidence);
    console.log('  Source URL:', json.results[0].source_url);
  }
}

testEndpoint().catch(console.error);
