/**
 * src/lib/atlas/discovery/complementarity/AtlasSourceComplementarityGraph.mjs
 * 
 * ATLAS SOURCE COMPLEMENTARITY GRAPH (SHADOW STRUCTURE - GATE #29)
 * 
 * Defines the directed relationship graph between source families and surfaces:
 * - Direct edges: A -> B != B -> A
 * - Edge types: COMPLEMENTS, CORROBORATES, OVERLAPS, ENRICHES, SUPERSEDES, LOW_MARGINAL_VALUE_AFTER
 * - 19 Complementarity dimensions (Identity, Alias, Profession, Role, Assets, Freshness, etc.)
 * - Sample-size guardrails: INSUFFICIENT (<20), EARLY_SIGNAL (20-49), EMERGING (50-99), CALIBRATED (>=100)
 * - Strict descriptive framing (OBSERVED_COMPLEMENTARITY_GAIN / DESCRIPTIVE_COMPLEMENTARITY_LIFT)
 * - Safe hashed/ephemeral identifiers only (Zero raw PII/DNI/CUIT)
 */

export const COMPLEMENTARITY_EDGE_TYPES = Object.freeze({
  COMPLEMENTS: 'COMPLEMENTS',
  CORROBORATES: 'CORROBORATES',
  OVERLAPS: 'OVERLAPS',
  ENRICHES: 'ENRICHES',
  SUPERSEDES: 'SUPERSEDES',
  LOW_MARGINAL_VALUE_AFTER: 'LOW_MARGINAL_VALUE_AFTER'
});

export const COMPLEMENTARITY_DIMENSIONS = Object.freeze([
  'IDENTITY',
  'ALIAS',
  'PROFESSION',
  'EMPLOYMENT',
  'ORGANIZATION',
  'ROLE',
  'GEOGRAPHY',
  'CONTACTABILITY',
  'SOCIAL_PRESENCE',
  'PUBLIC_ACTIVITY',
  'PUBLICATIONS',
  'FINANCIAL',
  'LEGAL',
  'ASSETS',
  'RELATIONSHIPS',
  'FRESHNESS',
  'CURRENTNESS',
  'AUTHORITY',
  'SOURCE_AUTHORITY'
]);

export const CONFIDENCE_STATUSES = Object.freeze({
  INSUFFICIENT: 'INSUFFICIENT',               // N < 20
  EARLY_SIGNAL: 'EARLY_SIGNAL',               // 20 <= N < 50
  EMERGING: 'EMERGING',                       // 50 <= N < 100
  CALIBRATED_CANARY_SIGNAL: 'CALIBRATED_CANARY_SIGNAL' // N >= 100
});

export function getConfidenceStatus(sampleSize) {
  if (sampleSize < 20) return CONFIDENCE_STATUSES.INSUFFICIENT;
  if (sampleSize < 50) return CONFIDENCE_STATUSES.EARLY_SIGNAL;
  if (sampleSize < 100) return CONFIDENCE_STATUSES.EMERGING;
  return CONFIDENCE_STATUSES.CALIBRATED_CANARY_SIGNAL;
}

export class AtlasSourceComplementarityGraph {
  constructor() {
    this.nodes = new Map(); // family_id or surface_id -> Node
    this.directedEdges = []; // Array of Edge objects
  }

  addNode(nodeId, nodeType, metadata = {}) {
    if (!this.nodes.has(nodeId)) {
      this.nodes.set(nodeId, Object.freeze({
        node_id: nodeId,
        node_type: nodeType, // SOURCE_FAMILY or SOURCE_SURFACE
        ...metadata
      }));
    }
    return this.nodes.get(nodeId);
  }

  recordObservation({
    sourceA, // Family or Surface A
    sourceB, // Family or Surface B
    edgeType = COMPLEMENTARITY_EDGE_TYPES.COMPLEMENTS,
    peopleMatched = 0,
    fieldsAlreadyKnown = 0,
    fieldsAddedByB = 0,
    relationshipsAddedByB = 0,
    evidenceCorroborated = 0,
    freshnessImproved = 0,
    noNewInformation = 0,
    conflictsIntroduced = 0,
    sampleSize = 0,
    dimensionsEnriched = []
  }) {
    const confidence = getConfidenceStatus(sampleSize);
    
    // Descriptive lift / marginal information gain calculation
    const totalOpportunities = sampleSize > 0 ? sampleSize : 1;
    const marginalGain = sampleSize > 0
      ? Number(((fieldsAddedByB + relationshipsAddedByB + (freshnessImproved * 0.5)) / totalOpportunities).toFixed(2))
      : 0;

    const edge = Object.freeze({
      edge_id: `${sourceA}->${sourceB}:${edgeType}`,
      source_a: sourceA,
      source_b: sourceB,
      edge_type: edgeType,
      sample_size: sampleSize,
      confidence_status: confidence,
      people_matched: peopleMatched,
      fields_already_known: fieldsAlreadyKnown,
      fields_added_by_b: fieldsAddedByB,
      relationships_added_by_b: relationshipsAddedByB,
      evidence_corroborated: evidenceCorroborated,
      freshness_improved: freshnessImproved,
      no_new_information: noNewInformation,
      conflicts_introduced: conflictsIntroduced,
      observed_complementarity_gain: marginalGain,
      dimensions_enriched: dimensionsEnriched,
      recorded_at: new Date().toISOString()
    });

    this.directedEdges.push(edge);
    return edge;
  }

  getEdges() {
    return [...this.directedEdges];
  }

  getSummaryMetrics() {
    const totalPairs = this.directedEdges.length;
    let totalFieldsAdded = 0;
    let totalRelationshipsAdded = 0;
    let totalCorroborations = 0;
    let totalSampleSize = 0;

    for (const e of this.directedEdges) {
      totalFieldsAdded += e.fields_added_by_b;
      totalRelationshipsAdded += e.relationships_added_by_b;
      totalCorroborations += e.evidence_corroborated;
      totalSampleSize += e.sample_size;
    }

    const avgCorroborationRate = totalSampleSize > 0
      ? Number((totalCorroborations / totalSampleSize).toFixed(3))
      : 0;

    return {
      total_nodes: this.nodes.size,
      total_directed_edges: totalPairs,
      total_sample_size_observed: totalSampleSize,
      total_fields_added: totalFieldsAdded,
      total_relationships_added: totalRelationshipsAdded,
      total_evidence_corroborated: totalCorroborations,
      identity_corroboration_rate: avgCorroborationRate
    };
  }
}
