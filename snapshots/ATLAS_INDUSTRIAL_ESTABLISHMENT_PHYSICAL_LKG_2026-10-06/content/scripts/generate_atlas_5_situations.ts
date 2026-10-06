import dotenv from 'dotenv';
dotenv.config();
import { AtlasKnowledgeUniverse } from '../src/lib/search/AtlasKnowledgeUniverse';
import { AtlasQueryDecisionMemory } from '../src/lib/search/AtlasQueryDecisionMemory';
import { AtlasSourceRankingEngine } from '../src/lib/search/AtlasSourceRankingEngine';
import { IExternalPersonSourceAdapter, ExternalSearchFilters, ExternalPersonObservation } from '../src/lib/search/IExternalPersonSourceAdapter';

class MockLiveHospitalAdapter implements IExternalPersonSourceAdapter {
  getAdapterId(): string { return 'HOSPITAL_ITALIANO_CABA'; }
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
      source_system: 'HOSPITAL_ITALIANO_CABA',
      source_record_id: 'rec_hi_991',
      source_url: 'https://hospitalitaliano.org.ar/profesionales/carlos-fernandez',
      observed_at: new Date().toISOString(),
      display_name: filters.name || 'Dr. Carlos Fernandez',
      profession: 'Cardiólogo',
      location: 'CABA',
      company: 'Hospital Italiano de Buenos Aires',
      email: 'UNKNOWN',
      phone: 'UNKNOWN',
      provenance_quality: 'HIGH',
      strong_identifiers: { verified_url: 'https://hospitalitaliano.org.ar/profesionales/carlos-fernandez' }
    }];
  }
}

class MockLiveWikidataAdapter implements IExternalPersonSourceAdapter {
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

async function runFiveSituationsDemo() {
  console.log('================================================================');
  console.log('ATLAS KNOWLEDGE UNIVERSE — 5 REAL SCENARIOS DEMONSTRATION');
  console.log('================================================================\n');

  // 1. LOCAL_ONLY
  console.log('----------------------------------------------------------------');
  console.log('SITUATION 1: LOCAL_ONLY');
  console.log('----------------------------------------------------------------');
  const localEvidence1 = [{
    display_name: 'Dr. Osvaldo Martinez',
    role: 'Médico Clínico',
    organization: 'Hospital Durand',
    source_id: 'HOSPITAL_DURAND',
    person_source_url: 'https://buenosaires.gob.ar/hospital-durand'
  }];
  const ans1 = await AtlasKnowledgeUniverse.executeQuery('médico en Hospital Durand', {
    freshnessRequired: false,
    localCandidates: localEvidence1
  });
  printScenarioReport(ans1, localEvidence1, 'Consulta resuelta íntegramente por conocimiento local validado.');

  // 2. LIVE_ONLY
  console.log('\n----------------------------------------------------------------');
  console.log('SITUATION 2: LIVE_ONLY');
  console.log('----------------------------------------------------------------');
  const ans2 = await AtlasKnowledgeUniverse.executeQuery('médico José Rafael Gómez en CABA', {
    freshnessRequired: false,
    localCandidates: [],
    adapters: [new MockLiveWikidataAdapter()]
  });
  printScenarioReport(ans2, [], 'Cero registros locales; activación de fuentes verificadas en vivo.');

  // 3. LOCAL_PLUS_LIVE
  console.log('\n----------------------------------------------------------------');
  console.log('SITUATION 3: LOCAL_PLUS_LIVE');
  console.log('----------------------------------------------------------------');
  const localEvidence3 = [{
    display_name: 'Dr. Carlos Fernandez',
    role: 'Cardiólogo',
    organization: 'Hospital Durand',
    source_id: 'HOSPITAL_DURAND',
    person_source_url: 'https://buenosaires.gob.ar/hospital-durand'
  }];
  const ans3 = await AtlasKnowledgeUniverse.executeQuery('cardiólogo Carlos Fernandez en CABA', {
    freshnessRequired: true,
    localCandidates: localEvidence3,
    adapters: [new MockLiveHospitalAdapter()]
  });
  printScenarioReport(ans3, localEvidence3, 'Registro local corroborado con verificación en vivo bajo requerimiento de frescura 2026.');

  // 4. BLOCKED
  console.log('\n----------------------------------------------------------------');
  console.log('SITUATION 4: BLOCKED');
  console.log('----------------------------------------------------------------');
  const ans4 = await AtlasKnowledgeUniverse.executeQuery('corredor inmobiliario en CUCICBA matriculados', {
    freshnessRequired: false,
    localCandidates: [],
    targetSourceId: 'CUCICBA_CABA'
  });
  printScenarioReport(ans4, [], 'Fuente protegida por CAPTCHA / Login; invariante de cero bypass aplicado.');

  // 5. INSUFFICIENT_CAPABILITY
  console.log('\n----------------------------------------------------------------');
  console.log('SITUATION 5: INSUFFICIENT_CAPABILITY');
  console.log('----------------------------------------------------------------');
  const ans5 = await AtlasKnowledgeUniverse.executeQuery('astronauta en Mar del Plata', {
    freshnessRequired: false,
    localCandidates: [],
    targetSourceId: 'UNVERIFIED_SOURCE_TEST'
  });
  printScenarioReport(ans5, [], 'Ninguna fuente verificada posee cobertura autorizada para este criterio; fail-closed.');
}

function printScenarioReport(ans: any, localEv: any[], note: string) {
  const dMem = AtlasQueryDecisionMemory.getDecisionsForQuery(ans.query_id)[0];
  const stats = ans.retrieval_plan.planned_sources[0] ? AtlasSourceRankingEngine.getSourceStats(ans.retrieval_plan.planned_sources[0].source_id) : undefined;

  console.log(`USER_QUERY: "${ans.query}"`);
  console.log(`INTENT: Person="${ans.intent.person_name || 'N/A'}", Profession="${ans.intent.profession || 'N/A'}", Geo="${ans.intent.geography || 'N/A'}", Org="${ans.intent.organization || 'N/A'}"`);
  console.log(`LOCAL_EVIDENCE: ${localEv.length} registro(s) verificado(s)`);
  console.log(`SOURCES_CONSIDERED: [${dMem?.candidate_sources.join(', ') || 'NONE'}]`);
  console.log(`SOURCE_SELECTED: [${dMem?.selected_sources.join(', ') || 'NONE'}]`);
  console.log(`REASON_CODES:`);
  console.log(`  - WHY_SELECTED: ${dMem?.reason_codes.why_selected.join('; ') || '(Ninguna)'}`);
  console.log(`  - WHY_REJECTED: ${dMem?.reason_codes.why_rejected.join('; ') || '(Ninguna)'}`);
  console.log(`  - SCORES: Authority=${dMem?.reason_codes.authority_score ?? 'N/A'}, Freshness=${dMem?.reason_codes.freshness_score ?? 'N/A'}, GeoFit=${dMem?.reason_codes.geographic_fit_score ?? 'N/A'}`);
  console.log(`EXTERNAL_CALLS: ${ans.external_calls_executed}`);
  console.log(`EVIDENCE_RETURNED: ${ans.evidence.length} elemento(s)`);
  ans.evidence.forEach((e: any, i: number) => {
    console.log(`  [${i + 1}] "${e.claim}" (Fuente: ${e.source_id}, Dominio: ${e.domain}, Status: ${e.temporal_status})`);
  });
  console.log(`FINAL_CONFIDENCE: ${ans.final_confidence}`);
  console.log(`MEMORY_RECORD: DecisionId=${ans.decision_id}, QueryId=${ans.query_id}, Result=${dMem?.result}`);
  console.log(`OUTCOME_SIGNAL: ${stats ? `Source=${stats.source_id}, TotalQueries=${stats.total_queries}, SuccessRate=${stats.factual_success_rate}` : 'NONE_RECORDED'}`);
  console.log(`NOTA: ${note}\n`);
}

runFiveSituationsDemo().catch(console.error);
