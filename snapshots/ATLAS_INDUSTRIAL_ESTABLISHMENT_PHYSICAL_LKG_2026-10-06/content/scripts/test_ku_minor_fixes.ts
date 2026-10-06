import dotenv from 'dotenv';
dotenv.config();
import { SmartPersonQueryRouter } from '../src/lib/search/SmartPersonQueryRouter';
import { SourceCapabilityRegistry } from '../src/lib/search/SourceCapabilityRegistry';
import { AtlasKnowledgeUniverse } from '../src/lib/search/AtlasKnowledgeUniverse';
import { IExternalPersonSourceAdapter, ExternalSearchFilters, ExternalPersonObservation } from '../src/lib/search/IExternalPersonSourceAdapter';

class MockWikidataSparqlAdapter implements IExternalPersonSourceAdapter {
  getAdapterId(): string { return 'WIKIDATA_SPARQL'; }
  getCapabilities() {
    return {
      name_search: true,
      profession_filter: true,
      location_filter: true,
      age_filter: false,
      company_filter: false,
      public_email: false,
      public_phone: false
    };
  }
  async search(filters: ExternalSearchFilters): Promise<ExternalPersonObservation[]> {
    return [{
      source_system: 'WIKIDATA_SPARQL',
      source_record_id: 'Q16583729',
      source_url: 'https://www.wikidata.org/wiki/Q16583729',
      observed_at: new Date().toISOString(),
      display_name: 'José Rafael Gómez',
      profession: 'Médico',
      location: 'CABA',
      company: 'Academia Nacional de Medicina',
      email: 'UNKNOWN',
      phone: 'UNKNOWN',
      provenance_quality: 'HIGH',
      strong_identifiers: { professional_registry_id: 'Q16583729' }
    }];
  }
}

async function runRegressionTests() {
  console.log('================================================================');
  console.log('KNOWLEDGE UNIVERSE MINOR FIXES — 3 REGRESSION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let total = 3;

  // 1. REGRESSION TEST 1: Geography Extraction for Mar del Plata
  console.log('--- REGRESSION TEST 1: Geography Extraction for Mar del Plata ---');
  const intent1 = SmartPersonQueryRouter.resolveQueryIntent('astronauta en Mar del Plata');
  console.log(`Query: "astronauta en Mar del Plata" -> Resolved Geo: "${intent1.geography}"`);
  if (intent1.geography === 'MAR DEL PLATA' && intent1.geography !== 'CABA') {
    console.log('REGRESSION TEST 1: PASS (Resolved to MAR DEL PLATA, never CABA)');
    passed++;
  } else {
    console.error(`REGRESSION TEST 1: FAIL (Expected "MAR DEL PLATA", got "${intent1.geography}")`);
  }

  // 2. REGRESSION TEST 2: Hospital Italiano Institutional Authority
  console.log('\n--- REGRESSION TEST 2: Hospital Italiano Institutional Authority ---');
  const hiSource = SourceCapabilityRegistry.getSource('HOSPITAL_ITALIANO_CABA');
  const hiFit = SourceCapabilityRegistry.computeSourceScore(hiSource!, {
    raw_query: 'médico en Hospital Italiano',
    profession: 'MEDICO',
    geography: 'CABA',
    intent_type: 'FACULTY_BY_FIELD'
  });
  console.log('Hospital Italiano source_type:', hiSource?.source_type);
  console.log('Hospital Italiano authority_level:', hiSource?.authority_level);
  console.log('Reason codes why_selected:', hiFit.reason_codes.why_selected);

  const containsGov = hiFit.reason_codes.why_selected.some(r => r.includes('Primary government institutional source'));
  const containsInst = hiFit.reason_codes.why_selected.some(r => r.includes('INSTITUTIONAL_AUTHORITY: Primary non-governmental / healthcare institutional source'));

  if (!containsGov && containsInst && hiSource?.authority_level === 'INSTITUTIONAL_PRIMARY') {
    console.log('REGRESSION TEST 2: PASS (Correctly classified as INSTITUTIONAL_PRIMARY, not government)');
    passed++;
  } else {
    console.error('REGRESSION TEST 2: FAIL (Government reason code still present or institutional missing)');
  }

  // 3. REGRESSION TEST 3: Wikidata SPARQL Domain Normalization
  console.log('\n--- REGRESSION TEST 3: Wikidata SPARQL Domain Normalization ---');
  const ans3 = await AtlasKnowledgeUniverse.executeQuery('médico José Rafael Gómez en CABA', {
    freshnessRequired: false,
    localCandidates: [],
    adapters: [new MockWikidataSparqlAdapter()]
  });

  const wikidataEvidence = ans3.evidence.find(e => e.source_id === 'WIKIDATA_SPARQL');
  console.log('Wikidata Evidence domain:', wikidataEvidence?.domain);
  console.log('Wikidata Evidence source_url:', wikidataEvidence?.source_url);

  const isRealHost = wikidataEvidence?.domain === 'wikidata.org' || wikidataEvidence?.domain === 'query.wikidata.org';
  const isSyntheticOrgAr = (wikidataEvidence?.domain || '').includes('wikidata_sparql.org.ar');

  if (isRealHost && !isSyntheticOrgAr) {
    console.log('REGRESSION TEST 3: PASS (Real host domain preserved, zero synthetic .org.ar)');
    passed++;
  } else {
    console.error(`REGRESSION TEST 3: FAIL (Got domain "${wikidataEvidence?.domain}")`);
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runRegressionTests().catch(err => {
  console.error(err);
  process.exit(1);
});
