import dotenv from 'dotenv';
dotenv.config();

import { MassDiscoveryEngine } from '../src/lib/search/MassDiscoveryEngine';
import { OnDemandEnrichmentEngine } from '../src/lib/search/OnDemandEnrichmentEngine';

async function runMassDiscoveryTests() {
  console.log('=== MASS DISCOVERY REAL LARGE-SCALE VERIFICATION ===\n');

  const engine = new MassDiscoveryEngine();

  // Test 1: Priority Query: EMPLEADO EN CABA
  console.log('--- TEST 1: EMPLEADO EN CABA ---');
  const empRes = await engine.discover({
    query: 'empleado en CABA',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });

  console.log('EMPLOYEE_CABA_VERIFIED_SOURCES =', empRes.source_trace.sources_consulted_count);
  console.log('EMPLOYEE_CABA_PAGINATED_SOURCES =', empRes.source_trace.sources_paginated_count);
  console.log('RAW_DISCOVERED =', empRes.source_trace.diagnostics.raw_discovered);
  console.log('UNIQUE_DISCOVERED =', empRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTALS =', empRes.provider_reported_totals);
  console.log('KNOWN_TOTAL =', empRes.known_total);
  console.log('ESTIMATED_TOTAL =', empRes.estimated_total);
  console.log('CURRENTLY_LOADED =', empRes.currently_loaded);
  console.log('HAS_MORE =', empRes.has_next_cursor ? 'YES' : 'NO');
  console.log('Sample result 1:', empRes.results[0]?.display_name, '|', empRes.results[0]?.role_claim, '| Org:', empRes.results[0]?.organization);
  console.log('Sample result 2:', empRes.results[1]?.display_name, '|', empRes.results[1]?.role_claim, '| Org:', empRes.results[1]?.organization);

  // Check Privacy Rule: ZERO raw DNI, CUIL, CUIT, TAX_ID
  let sensitiveCount = 0;
  for (const r of empRes.results) {
    if ((r as any).national_id || (r as any).tax_id || (r as any).cuil || (r as any).dni) sensitiveCount++;
    if (r.candidate_id.includes('-') && r.candidate_id.length > 10 && /\d{2}-\d{8}-\d/.test(r.candidate_id)) sensitiveCount++;
  }
  console.log('RAW_SENSITIVE_PERSON_IDENTIFIERS =', sensitiveCount);

  // Test 2: COMERCIANTE EN CABA (PERSON != BUSINESS)
  console.log('\n--- TEST 2: COMERCIANTE EN CABA ---');
  const comRes = await engine.discover({
    query: 'comerciante en CABA',
    budget: 'QUICK',
    page: 1,
    page_size: 50
  });
  console.log('COMERCIANTE_CABA_PERSONS =', comRes.results.filter(r => r.entity_type === 'PERSON').length);
  console.log('COMERCIANTE_CABA_BUSINESSES =', comRes.businesses.length);
  console.log('UNIQUE_DISCOVERED =', comRes.query_discovered_unique);

  // Test 3: PROGRAMADOR EN ARGENTINA
  console.log('\n--- TEST 3: PROGRAMADOR EN ARGENTINA ---');
  const progRes = await engine.discover({
    query: 'programador en Argentina',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });
  console.log('PROGRAMADOR_ARGENTINA_UNIQUE =', progRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTAL =', progRes.provider_reported_totals['GITHUB_API']);
  console.log('CURRENTLY_LOADED =', progRes.currently_loaded);
  console.log('Sample developer:', progRes.results[0]?.display_name, '| URL:', progRes.results[0]?.source_url);

  // Test 4: MEDICO EN ARGENTINA
  console.log('\n--- TEST 4: MEDICO EN ARGENTINA ---');
  const medRes = await engine.discover({
    query: 'médico en Argentina',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });
  console.log('MEDICO_ARGENTINA_UNIQUE =', medRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTAL =', medRes.provider_reported_totals['WIKIDATA_SPARQL']);
  console.log('CURRENTLY_LOADED =', medRes.currently_loaded);

  // Test 5: ABOGADO EN ARGENTINA
  console.log('\n--- TEST 5: ABOGADO EN ARGENTINA ---');
  const aboRes = await engine.discover({
    query: 'abogado en Argentina',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });
  console.log('ABOGADO_ARGENTINA_UNIQUE =', aboRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTAL =', aboRes.provider_reported_totals['WIKIDATA_SPARQL']);
  console.log('CURRENTLY_LOADED =', aboRes.currently_loaded);

  // Test 6: DOCENTE EN ARGENTINA
  console.log('\n--- TEST 6: DOCENTE EN ARGENTINA ---');
  const docRes = await engine.discover({
    query: 'docente en Argentina',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });
  console.log('DOCENTE_ARGENTINA_UNIQUE =', docRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTAL =', docRes.provider_reported_totals['WIKIDATA_SPARQL']);
  console.log('CURRENTLY_LOADED =', docRes.currently_loaded);

  // Test 7: ARQUITECTO EN ARGENTINA
  console.log('\n--- TEST 7: ARQUITECTO EN ARGENTINA ---');
  const arqRes = await engine.discover({
    query: 'arquitecto en Argentina',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });
  console.log('ARQUITECTO_ARGENTINA_UNIQUE =', arqRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTAL =', arqRes.provider_reported_totals['WIKIDATA_SPARQL']);
  console.log('CURRENTLY_LOADED =', arqRes.currently_loaded);

  // Test 8: INVESTIGADOR EN ARGENTINA
  console.log('\n--- TEST 8: INVESTIGADOR EN ARGENTINA ---');
  const invRes = await engine.discover({
    query: 'investigador en Argentina',
    budget: 'STANDARD',
    page: 1,
    page_size: 100
  });
  console.log('INVESTIGADOR_ARGENTINA_UNIQUE =', invRes.query_discovered_unique);
  console.log('PROVIDER_REPORTED_TOTAL =', invRes.provider_reported_totals['WIKIDATA_SPARQL']);
  console.log('CURRENTLY_LOADED =', invRes.currently_loaded);

  // Test 9: On-demand Lazy Enrichment
  console.log('\n--- TEST 9: ON-DEMAND LAZY ENRICHMENT ---');
  const enriched = await OnDemandEnrichmentEngine.enrichRecords(progRes.results.slice(0, 3));
  console.log('Enriched items:', enriched.length);
  console.log('Sample enriched avatar:', enriched[0]?.avatar_url);
  console.log('Sample social links:', enriched[0]?.social_links);

  console.log('\n=== ALL TESTS FINISHED ===');
}

runMassDiscoveryTests().catch(console.error);
