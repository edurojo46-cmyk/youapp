/**
 * src/lib/atlas/discovery/benchmark/AtlasMultiBenchmarkEngine.mjs
 * 
 * ATLAS MULTI-BENCHMARK SOURCE INTELLIGENCE ENGINE
 * 
 * Manages:
 * 1. 10 Benchmark systems cohort with strict evidence provenance
 * 2. Multi-benchmark family union and deduplication
 * 3. Argentine Federal Coverage Grid (National + 24 subnational jurisdictions)
 * 4. Three Top-25 Expansion Portfolios + Complete Candidate Universe
 * 5. Physical verification receipts and row grain analysis
 */

export const EVIDENCE_STATUSES = Object.freeze({
  PUBLICLY_DECLARED: 'PUBLICLY_DECLARED',
  PUBLIC_DOCUMENTATION_VERIFIED: 'PUBLIC_DOCUMENTATION_VERIFIED',
  DERIVED_FROM_PUBLIC_DESCRIPTION: 'DERIVED_FROM_PUBLIC_DESCRIPTION',
  NOT_VERIFIED: 'NOT_VERIFIED'
});

export const FEDERAL_COVERAGE_SCOPES = Object.freeze([
  'NATIONAL',
  'CABA',
  'PBA',
  'CATAMARCA',
  'CHACO',
  'CHUBUT',
  'CORDOBA',
  'CORRIENTES',
  'ENTRE_RIOS',
  'FORMOSA',
  'JUJUY',
  'LA_PAMPA',
  'LA_RIOJA',
  'MENDOZA',
  'MISIONES',
  'NEUQUEN',
  'RIO_NEGRO',
  'SALTA',
  'SAN_JUAN',
  'SAN_LUIS',
  'SANTA_CRUZ',
  'SANTA_FE',
  'SANTIAGO_DEL_ESTERO',
  'TIERRA_DEL_FUEGO',
  'TUCUMAN'
]);

export class AtlasMultiBenchmarkEngine {
  constructor() {
    this.benchmarkSystems = new Map();
    this.evidenceReferences = [];
    this.candidateUniverse = [];
  }

  registerBenchmarkSystem(system) {
    this.benchmarkSystems.set(system.benchmark_id, Object.freeze({
      benchmark_id: system.benchmark_id,
      name: system.name,
      origin_country: system.origin_country || 'AR',
      commercial_role: system.commercial_role, // CREDIT_BUREAU, CORPORATE_REGISTRY_AGGREGATOR, COMPLIANCE_GRAPH
      public_documentation_url: system.public_documentation_url,
      declared_scale_summary: system.declared_scale_summary,
      declared_source_families: system.declared_source_families || []
    }));
  }

  recordEvidence(claim) {
    this.evidenceReferences.push(Object.freeze({
      benchmark_entity_id: claim.benchmark_entity_id,
      source_family_id: claim.source_family_id,
      relationship_family_id: claim.relationship_family_id || null,
      public_reference_url: claim.public_reference_url,
      public_reference_type: claim.public_reference_type, // MARKETING_SITE, API_DOCS, USER_MANUAL, PRODUCT_SHEET
      observed_claim: claim.observed_claim,
      evidence_excerpt_or_summary: claim.evidence_excerpt_or_summary,
      evidence_status: claim.evidence_status || EVIDENCE_STATUSES.PUBLICLY_DECLARED,
      retrieved_at: claim.retrieved_at || new Date().toISOString()
    }));
  }

  registerCandidate(candidate) {
    this.candidateUniverse.push(Object.freeze({
      candidate_id: candidate.candidate_id,
      source_family: candidate.source_family,
      subfamily: candidate.subfamily,
      public_entity: candidate.public_entity,
      public_entity_status: candidate.public_entity_status, // PUBLIC_ENTITY_VERIFIED, CANDIDATE
      proposed_surface: candidate.proposed_surface,
      surface_status: candidate.surface_status, // PHYSICAL_SURFACE_VERIFIED, PHYSICAL_SURFACE_CANDIDATE
      canonical_url: candidate.canonical_url || null,
      row_grain: candidate.row_grain, // PERSON, ORGANIZATION, TRANSACTION, EVENT, DOCUMENT, AGGREGATE, MIXED
      person_entities_embedded: candidate.person_entities_embedded ?? (candidate.row_grain === 'PERSON'),
      entity_types_present: candidate.entity_types_present || ['PERSON'],
      relationship_types_present: candidate.relationship_types_present || [],
      domains_served: candidate.domains_served || ['PEOPLE'],
      domain_reuse_count: (candidate.domains_served || ['PEOPLE']).length,
      geography: candidate.geography || 'NATIONAL',
      machine_access_status: candidate.machine_access_status || 'UNKNOWN',
      policy_status: candidate.policy_status || 'UNKNOWN',
      connector_reusable: candidate.connector_reusable ?? true,
      motor_template_reusable: candidate.motor_template_reusable ?? true,
      expected_connector: candidate.expected_connector || 'REST_API_CLIENT',
      expected_template: candidate.expected_template || 'REST_API_MOTOR',
      general_map_priority_score: candidate.general_map_priority_score || 70,
      people_priority_score: candidate.people_priority_score || 70,
      relationship_priority_score: candidate.relationship_priority_score || 70,
      why_now: candidate.why_now,
      what_gap_it_closes: candidate.what_gap_it_closes,
      scout_handoff: Object.freeze({
        validation_questions: candidate.validation_questions || ['Is dataset open without auth?', 'What is current row count?'],
        required_policy_checks: candidate.required_policy_checks || ['Verify public license terms', 'Check robots.txt / terms of service'],
        required_canary: candidate.required_canary || 'Sample 50 records via Source Scout'
      }),
      verification_receipt: candidate.verification_receipt ? Object.freeze({ ...candidate.verification_receipt }) : null
    }));
  }

  /**
   * Generates Top 25 General Map Expansion Portfolio
   */
  getTop25GeneralMapPortfolio() {
    return [...this.candidateUniverse]
      .sort((a, b) => b.general_map_priority_score - a.general_map_priority_score)
      .slice(0, 25);
  }

  /**
   * Generates Top 25 People Source Expansion Portfolio
   */
  getTop25PeoplePortfolio() {
    return [...this.candidateUniverse]
      .filter(c => c.domains_served.includes('PEOPLE') && (c.row_grain === 'PERSON' || c.person_entities_embedded))
      .sort((a, b) => b.people_priority_score - a.people_priority_score)
      .slice(0, 25);
  }

  /**
   * Generates Top 25 Relationship Intelligence Expansion Portfolio
   */
  getTop25RelationshipPortfolio() {
    return [...this.candidateUniverse]
      .filter(c => c.relationship_types_present.length > 0)
      .sort((a, b) => b.relationship_priority_score - a.relationship_priority_score)
      .slice(0, 25);
  }
}
