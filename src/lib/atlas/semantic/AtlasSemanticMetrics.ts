/**
 * src/lib/atlas/semantic/AtlasSemanticMetrics.ts
 * 
 * ATLAS SEMANTIC ENRICHMENT MODE — SPECIFICATION & KPI DEFINITIONS (Post-5M Target)
 * 
 * Mandate:
 * When CABA_PBA_QUALIFIED_UNIQUE_REAL_PEOPLE reaches 5,000,000, massive expansion
 * halts cleanly (STOP_NET_NEW_ACQUISITION = TRUE) and Atlas transitions into:
 * ATLAS_MODE = SEMANTIC_ENRICHMENT
 * 
 * The primary scoring metric will shift from Net-New People per Second
 * to Semantic Information Gain across these 8 core dimensions.
 */

export interface AtlasSemanticKPIs {
  // 1. Completeness score of canonical person entity [0.0 - 1.0]
  person_profile_completeness: number;

  // 2. Percentage of persons with verified canonical role/position [0.0 - 100.0]
  role_coverage_percent: number;

  // 3. Percentage of persons linked to verified institutional entity [0.0 - 100.0]
  organization_coverage_percent: number;

  // 4. Granularity level of geographic attribution (PROVINCE, PARTIDO_COMUNA, LOCALITY, NEIGHBORHOOD)
  geo_depth_score: number;

  // 5. Co-occurrence and verified relationships mapped per person entity
  relationship_coverage_ratio: number;

  // 6. Number of independent verified evidentiary facts per person entity
  evidence_density_avg: number;

  // 7. Distinct verified independent sources corroborating the same identity
  source_diversity_per_person_avg: number;

  // 8. Sector, academic discipline, and thematic classification coverage [0.0 - 100.0]
  topic_coverage_percent: number;
}

export const SEMANTIC_ENRICHMENT_SPEC = {
  phase: 'PREPARED_STANDBY',
  activation_trigger: 'CABA_PBA_QUALIFIED_UNIQUE_REAL_PEOPLE >= 5000000',
  target_canonical_entities: 5000000,
  dimensions: [
    { id: 'PERSON_PROFILE_COMPLETENESS', target: 0.85, description: 'Normalized name, gender, DNI/hash, verified attributes' },
    { id: 'ROLE_COVERAGE', target: 80.0, description: 'Standardized occupational role classification' },
    { id: 'ORGANIZATION_COVERAGE', target: 85.0, description: 'Entity linking to registered corporations/institutions' },
    { id: 'GEO_DEPTH', target: 3.5, description: 'Resolution down to CABA Comuna or PBA Partido/Localidad' },
    { id: 'RELATIONSHIP_COVERAGE', target: 2.0, description: 'Corporate board, co-authorship, institutional colleague links' },
    { id: 'EVIDENCE_DENSITY', target: 4.0, description: 'Average distinct corroborating evidence documents' },
    { id: 'SOURCE_DIVERSITY_PER_PERSON', target: 2.2, description: 'Cross-source corroboration without duplicate counting' },
    { id: 'TOPIC_COVERAGE', target: 75.0, description: 'Industry/academic/public sector taxonomy mapping' }
  ]
};
