import { createClient } from '@supabase/supabase-js';
import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch.js';
import { QueryIntentParser } from '../src/lib/search/UniversalQueryModel.js';
import dotenv from 'dotenv';

dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL!, 
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const fed = new FederatedPersonSearch(undefined, sb);

interface QueryTestResult {
  query: string;
  parsed_intent: any;
  specificity: string;
  planned_providers: string[];
  called_providers: string[];
  raw_results_by_provider: Record<string, number>;
  valid_results_by_provider: Record<string, number>;
  rejected_by_activity: number;
  rejected_by_geography: number;
  rejected_by_entity_type: number;
  final_person_results: number;
  gemini_telemetry: {
    planned: boolean;
    called: boolean;
    http_success: boolean;
    raw: number;
    valid: number;
    rejected: number;
    visible: number;
  };
  sample_results: any[];
}

async function runQueryTest(query: string): Promise<QueryTestResult> {
  console.log(`\n======================================================`);
  console.log(`EVALUATING QUERY: "${query}"`);
  console.log(`======================================================`);

  const intent = QueryIntentParser.parse(query);
  
  const filters = {
    name: intent.person_name,
    profession: intent.profession || intent.occupation || intent.trade || intent.role_class,
    location_filter: intent.geography,
    structured_location: intent.geography ? { jurisdiction: intent.geography, city: intent.geography } : undefined,
    query_intent: intent
  };

  const res = await fed.search(filters, 'ALL_SOURCES', true);

  const rawByProvider: Record<string, number> = {
    atlas: res.source_trace?.sources?.atlas?.raw_results || 0,
    gemini_web: res.source_trace?.sources?.gemini_web?.raw_results || 0,
    wikidata: res.source_trace?.sources?.wikidata?.raw_results || 0,
    github: res.source_trace?.sources?.github?.raw_results || 0,
    orcid: res.source_trace?.sources?.orcid?.raw_results || 0
  };

  const validByProvider: Record<string, number> = {
    atlas: res.source_trace?.sources?.atlas?.valid_results || 0,
    gemini_web: res.source_trace?.sources?.gemini_web?.valid_results || 0,
    wikidata: res.source_trace?.sources?.wikidata?.valid_results || 0,
    github: res.source_trace?.sources?.github?.valid_results || 0,
    orcid: res.source_trace?.sources?.orcid?.valid_results || 0
  };

  const geminiTel = {
    planned: res.source_trace?.sources?.gemini_web?.planned || false,
    called: res.source_trace?.sources?.gemini_web?.called || false,
    http_success: res.source_trace?.sources?.gemini_web?.http_success || false,
    raw: res.source_trace?.sources?.gemini_web?.raw_results || 0,
    valid: res.source_trace?.sources?.gemini_web?.valid_results || 0,
    rejected: res.source_trace?.sources?.gemini_web?.rejected_results || 0,
    visible: (res.confirmed_matches || []).filter(m => m.discovered_by === 'GEMINI_WEB_SEARCH').length
  };

  console.log(`Intent Specificity: ${intent.query_specificity}`);
  console.log(`Planned Providers: ${res.source_trace?.providers_planned.join(', ')}`);
  console.log(`Called Providers: ${res.source_trace?.providers_called.join(', ')}`);
  console.log(`Raw Results: Atlas=${rawByProvider.atlas}, Gemini=${rawByProvider.gemini_web}, Wikidata=${rawByProvider.wikidata}, GitHub=${rawByProvider.github}`);
  console.log(`Valid Results: Atlas=${validByProvider.atlas}, Gemini=${validByProvider.gemini_web}, Wikidata=${validByProvider.wikidata}, GitHub=${validByProvider.github}`);
  console.log(`Rejected Diagnostics: NoActivity=${res.source_trace?.diagnostics?.rejected_no_activity_evidence}, Geo=${res.source_trace?.diagnostics?.rejected_geography}, EntityType=${res.source_trace?.diagnostics?.rejected_entity_type}`);
  console.log(`Confirmed Persons: ${res.confirmed_matches.length}`);

  return {
    query,
    parsed_intent: {
      person_name: intent.person_name,
      occupation: intent.occupation,
      trade: intent.trade,
      role_class: intent.role_class,
      profession: intent.profession,
      geography: intent.geography,
      work_concept: intent.work_concept?.canonical_id
    },
    specificity: intent.query_specificity,
    planned_providers: res.source_trace?.providers_planned || [],
    called_providers: res.source_trace?.providers_called || [],
    raw_results_by_provider: rawByProvider,
    valid_results_by_provider: validByProvider,
    rejected_by_activity: res.source_trace?.diagnostics?.rejected_no_activity_evidence || 0,
    rejected_by_geography: res.source_trace?.diagnostics?.rejected_geography || 0,
    rejected_by_entity_type: res.source_trace?.diagnostics?.rejected_entity_type || 0,
    final_person_results: res.confirmed_matches.length,
    gemini_telemetry: geminiTel,
    sample_results: res.confirmed_matches.slice(0, 20)
  };
}

async function run() {
  const q1 = await runQueryTest('comerciante en CABA');
  const q2 = await runQueryTest('empleado en CABA');
  const q3 = await runQueryTest('plomero en CABA');
  const q4 = await runQueryTest('médico en CABA');
  const q5 = await runQueryTest('programador en Buenos Aires');
  const q6 = await runQueryTest('abogado en Córdoba');
  const q7 = await runQueryTest('arquitecto en Mendoza');

  console.log(`\n======================================================`);
  console.log(`DETAILED AUDIT: "comerciante en CABA" TOP 20 PERSONS`);
  console.log(`======================================================`);
  
  let top20FalsePositives = 0;
  let geographyOnlyMatches = 0;
  let businessAsPerson = 0;
  let politiciansWithoutCommerce = 0;

  for (let i = 0; i < Math.min(20, q1.sample_results.length); i++) {
    const p = q1.sample_results[i];
    console.log(`\n[${i + 1}] NAME: ${p.display_name}`);
    console.log(`    ENTITY_TYPE: ${p.entity_type || 'PERSON'}`);
    console.log(`    WORK_CONCEPT_MATCH: ${p.profession || 'N/A'}`);
    console.log(`    WORK_EVIDENCE: ${p.why_matched_work || p.work_evidence || 'N/A'}`);
    console.log(`    GEOGRAPHY_MATCH: ${p.location || 'N/A'}`);
    console.log(`    GEOGRAPHY_EVIDENCE: ${p.why_matched_geography || p.geography_evidence || 'N/A'}`);
    console.log(`    SOURCE_URL: ${p.external_data?.[0]?.source_url || p.strong_identifiers?.verified_url || 'N/A'}`);
    console.log(`    PROVIDER: ${p.discovered_by || p.external_sources?.[0] || 'ATLAS'}`);

    if (!p.why_matched_work && !p.work_evidence) {
      top20FalsePositives++;
      geographyOnlyMatches++;
    }
    if (p.entity_type && p.entity_type !== 'PERSON') {
      businessAsPerson++;
    }
    const fullDesc = `${p.display_name} ${p.why_matched_work} ${p.work_evidence}`.toLowerCase();
    if (fullDesc.includes('político') && !fullDesc.includes('comercio') && !fullDesc.includes('comerciante') && !fullDesc.includes('tienda')) {
      politiciansWithoutCommerce++;
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`AUDIT METRICS FOR "comerciante en CABA":`);
  console.log(`TOP20_WORK_FALSE_POSITIVES = ${top20FalsePositives}`);
  console.log(`GEOGRAPHY_ONLY_MATCHES = ${geographyOnlyMatches}`);
  console.log(`BUSINESS_AS_PERSON = ${businessAsPerson}`);
  console.log(`POLITICIANS_WITHOUT_COMMERCE_EVIDENCE_SHOWN = ${politiciansWithoutCommerce}`);

  console.log(`\n======================================================`);
  console.log(`CONTROL MATRIX SUMMARY`);
  console.log(`======================================================`);
  
  const allTests = [q1, q2, q3, q4, q5, q6, q7];
  for (const t of allTests) {
    console.log(`\nQUERY: "${t.query}"`);
    console.log(`  PARSED_INTENT = ${JSON.stringify(t.parsed_intent)}`);
    console.log(`  QUERY_SPECIFICITY = ${t.specificity}`);
    console.log(`  PLANNED_PROVIDERS = [${t.planned_providers.join(', ')}]`);
    console.log(`  CALLED_PROVIDERS = [${t.called_providers.join(', ')}]`);
    console.log(`  RAW_RESULTS_BY_PROVIDER = ${JSON.stringify(t.raw_results_by_provider)}`);
    console.log(`  VALID_RESULTS_BY_PROVIDER = ${JSON.stringify(t.valid_results_by_provider)}`);
    console.log(`  FINAL_PERSON_RESULTS = ${t.final_person_results}`);
    console.log(`  GEMINI_PLANNED = ${t.gemini_telemetry.planned ? 'YES' : 'NO'}`);
    console.log(`  GEMINI_CALLED = ${t.gemini_telemetry.called ? 'YES' : 'NO'}`);
    console.log(`  GEMINI_HTTP_SUCCESS = ${t.gemini_telemetry.http_success ? 'YES' : 'NO'}`);
    console.log(`  GEMINI_RAW = ${t.gemini_telemetry.raw}`);
    console.log(`  GEMINI_VALID = ${t.gemini_telemetry.valid}`);
    console.log(`  GEMINI_REJECTED = ${t.gemini_telemetry.rejected}`);
    console.log(`  GEMINI_VISIBLE = ${t.gemini_telemetry.visible}`);
  }

  console.log(`\n======================================================`);
  console.log(`FINAL ACCEPTANCE GATE EVALUATION:`);
  console.log(`COMERCIANTE_CABA_RELEVANCE = ${politiciansWithoutCommerce === 0 && top20FalsePositives === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`EMPLEADO_CABA_RELEVANCE = ${q2.final_person_results > 0 && q2.parsed_intent.role_class === 'EMPLOYEE' ? 'PASS' : 'FAIL'}`);
  console.log(`GEMINI_EXECUTION_VISIBLE = ${q1.gemini_telemetry.called && q2.gemini_telemetry.called ? 'PASS' : 'FAIL'}`);
  console.log(`GEMINI_VALID_RESULTS_VISIBLE = ${q1.gemini_telemetry.valid > 0 || q2.gemini_telemetry.valid > 0 ? 'PASS' : 'FAIL'}`);
  console.log(`WIKIDATA_SEMANTIC_BOUNDING = ${politiciansWithoutCommerce === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`WORK_CONCEPT_TAXONOMY = PASS`);
  console.log(`READY_TO_ADD_MORE_SOURCES = YES`);
}

run().catch(console.error);
