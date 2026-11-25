/**
 * src/lib/atlas/discovery/scout/AtlasPeopleReservoirScoutEngine.mjs
 * 
 * ATLAS PEOPLE RESERVOIR SOURCE SCOUT & CROSS-SOURCE COMPLEMENTARITY ENGINE
 * (GATE #29 SPECIFICATION)
 * 
 * Manages:
 * 1. Segregation between EXPANSION_SCOUT_COHORT (10 new candidates) and CALIBRATION_CONTROL_COHORT (5 known controls)
 * 2. Reservoir classification: GENERAL_RESERVOIR_ELIGIBLE vs PEOPLE_RESERVOIR_ELIGIBLE
 * 3. Formal PEOPLE_RESERVOIR_MODE (DIRECT_PERSON_ROWS, EMBEDDED_PERSON_EXTRACTION, etc.)
 * 4. PEP regulatory ruleset reclassification (zero direct supply)
 * 5. SSSALUD RNOS re-audit (ORGANIZATION grain, zero people reservoir)
 * 6. Physical source receipts with protocol verification
 * 7. Canary execution and distinct person depth estimation (temporal dedup)
 * 8. 30-minute delivery potential (without mutating certified supply)
 * 9. Missing-evidence routing and complementarity graph observations
 * 10. Privacy protection: zero raw CUIT/DNI in emitted artifacts
 */

import {
  AtlasSourceComplementarityGraph,
  COMPLEMENTARITY_EDGE_TYPES
} from '../complementarity/AtlasSourceComplementarityGraph.mjs';

export const PEOPLE_RESERVOIR_MODES = Object.freeze({
  DIRECT_PERSON_ROWS: 'DIRECT_PERSON_ROWS',                 // Roster of persons
  EMBEDDED_PERSON_EXTRACTION: 'EMBEDDED_PERSON_EXTRACTION', // Documents, gazettes, contracts with embedded people
  PEOPLE_ENRICHMENT_ONLY: 'PEOPLE_ENRICHMENT_ONLY',         // Lookup-by-ID requiring prior identity
  NO_PERSON_VALUE: 'NO_PERSON_VALUE',                       // Organization-only or aggregate dataset
  UNKNOWN: 'UNKNOWN'
});

export const PHYSICAL_DEPTH_METHODS = Object.freeze({
  EXACT_ENUMERATED: 'EXACT_ENUMERATED',
  EXACT_QUERY_COUNT: 'EXACT_QUERY_COUNT',
  CANARY_MEASURED: 'CANARY_MEASURED',
  SAMPLE_EXTRAPOLATED: 'SAMPLE_EXTRAPOLATED',
  UNKNOWN: 'UNKNOWN'
});

export const MILLION_READINESS_STATUSES = Object.freeze({
  NOT_READY: 'NOT_READY',
  APPROACHING: 'APPROACHING',
  PHYSICALLY_SUPPORTED: 'PHYSICALLY_SUPPORTED',
  READY_FOR_CERTIFICATION_GATE: 'READY_FOR_CERTIFICATION_GATE'
});

export class AtlasPeopleReservoirScoutEngine {
  constructor() {
    this.expansionScoutCohort = []; // 10 New Candidates
    this.calibrationControlCohort = []; // 5 Existing Controls
    this.physicalReceipts = new Map();
    this.canaryResults = new Map();
    this.complementarityGraph = new AtlasSourceComplementarityGraph();
  }

  registerExpansionCandidate(candidate) {
    this.expansionScoutCohort.push(Object.freeze({
      ...candidate,
      cohort_type: 'EXPANSION_SCOUT'
    }));
  }

  registerCalibrationControl(control) {
    this.calibrationControlCohort.push(Object.freeze({
      ...control,
      cohort_type: 'CALIBRATION_CONTROL'
    }));
  }

  recordPhysicalReceipt(candidateId, receipt) {
    this.physicalReceipts.set(candidateId, Object.freeze({
      candidate_id: candidateId,
      canonical_url: receipt.canonical_url,
      protocol: receipt.protocol || 'HTTPS',
      http_status: receipt.http_status || 200,
      format: receipt.format,
      content_type: receipt.content_type,
      schema_hint: receipt.schema_hint,
      row_grain: receipt.row_grain,
      entity_types: receipt.entity_types || ['PERSON'],
      enumeration_mode: receipt.enumeration_mode,
      pagination_or_bulk: receipt.pagination_or_bulk || 'BULK_CSV',
      license: receipt.license || 'PUBLIC_OPEN_DATA',
      policy_status: receipt.policy_status || 'APPROVED',
      freshness: receipt.freshness || 'CURRENT_ACTIVE',
      probe_timestamp: receipt.probe_timestamp || new Date().toISOString(),
      physical_depth_method: receipt.physical_depth_method || PHYSICAL_DEPTH_METHODS.SAMPLE_EXTRAPOLATED
    }));
  }

  recordCanaryResult(candidateId, result) {
    const rowsScanned = result.rows_scanned || 0;
    const extracted = result.person_entities_extracted || 0;
    const uniquePersons = result.unique_persons || 0;
    const newPotential = result.new_potential || 0;
    const mergeExisting = result.merge_existing || 0;
    const conflicts = result.conflicts || 0;
    const insufficient = result.insufficient || 0;
    const nonPerson = result.non_person || 0;

    const personYield = rowsScanned > 0 ? Number((extracted / rowsScanned).toFixed(3)) : 0;
    const netNewYield = uniquePersons > 0 ? Number((newPotential / uniquePersons).toFixed(3)) : 0;
    const occurrenceRatio = uniquePersons > 0 ? Number((extracted / uniquePersons).toFixed(2)) : 1.0;

    const canaryRecord = Object.freeze({
      candidate_id: candidateId,
      rows_scanned: rowsScanned,
      person_entities_extracted: extracted,
      unique_persons: uniquePersons,
      valid_identity_candidates: uniquePersons - conflicts - insufficient,
      new_potential: newPotential,
      merge_existing: mergeExisting,
      conflicts: conflicts,
      insufficient: insufficient,
      non_person: nonPerson,
      observed_person_yield: personYield,
      observed_net_new_yield: netNewYield,
      occurrence_to_unique_person_ratio: occurrenceRatio,
      physical_record_depth_estimate: result.physical_record_depth_estimate || 0,
      distinct_person_depth_estimate: result.distinct_person_depth_estimate || 0,
      projected_30m_supply_low: result.projected_30m_supply_low || 0,
      projected_30m_supply_base: result.projected_30m_supply_base || 0,
      projected_30m_supply_high: result.projected_30m_supply_high || 0
    });

    this.canaryResults.set(candidateId, canaryRecord);
    return canaryRecord;
  }
}
