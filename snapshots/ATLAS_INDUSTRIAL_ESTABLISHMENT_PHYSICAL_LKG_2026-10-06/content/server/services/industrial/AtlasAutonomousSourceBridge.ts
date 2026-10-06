/**
 * ATLAS AUTONOMOUS SOURCE BRIDGE V1
 * @server/services/industrial/AtlasAutonomousSourceBridge.ts
 * 
 * Master Orchestrator for Autonomous Source Bridge Resolution:
 * 1. SOURCE KNOWLEDGE FIRST: Checks Concept Registry & Source Knowledge Map (0 AI calls if known).
 * 2. ONE-CALL GEMINI INTELLIGENCE: Single structured call if concept is new / unknown.
 * 3. PUBLIC TAXONOMY VALIDATION: Gemini proposes — Atlas proves. Validates OSM, CLAE, Wikidata tags.
 * 4. SOURCE BRIDGE VALIDATION: Verifies source existence, protocols, chamber directories, connector availability.
 * 5. PROBE BEFORE LEARNING: Executes minimal canary probe over public network (e.g. Overpass).
 * 6. CONCEPT INTEGRITY GATE: Strict anti-contamination filter (fail closed).
 * 7. VALIDATED LEARNING: Persists proven bridge to PostgreSQL SSOT for permanent 0-call future execution.
 */

import { dbPool } from '../../db.ts';
import { AtlasConceptRegistry, type AtlasConceptDefinition } from './AtlasConceptRegistry.ts';
import { AtlasConceptIntegrityGate } from './AtlasConceptIntegrityGate.ts';
import { AtlasPublicTaxonomyValidator } from './AtlasPublicTaxonomyValidator.ts';
import { AtlasSourceBridgeValidator, type BridgeValidationDecision, type SourceBridgeStatus } from './AtlasSourceBridgeValidator.ts';
import { AtlasOneCallMissionIntelligence, type OneCallMissionIntelligenceResult } from './AtlasOneCallMissionIntelligence.ts';
import { SourceKnowledgeMap } from '../../../src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts';
import type { AtlasMissionIR } from './AtlasMissionIR.ts';

export interface SafetyGateEvaluation {
  passed: boolean;
  taxonomy_validation: 'PASS' | 'FAIL';
  source_public_access: 'PASS' | 'FAIL';
  query_probe: 'PASS' | 'FAIL';
  mission_fit_sample: 'PASS' | 'FAIL';
  evidence_contract_sample: 'PASS' | 'FAIL';
  concept_integrity_gate: 'PASS' | 'FAIL';
  sample_metrics: {
    sample_total: number;
    mission_fit_pass: number;
    mission_fit_fail: number;
    mission_fit_rate: number;
  };
  rejection_reasons: string[];
}

export interface AutonomousBridgeResult {
  query: string;
  geography: string;
  terminal_state: SourceBridgeStatus;
  concept_id: string | null;
  canonical_name: string;
  source_knowledge_hit: boolean;
  gemini_called: boolean;
  probe_executed: boolean;
  probe_rows_found: number;
  learning_persisted: boolean;
  candidate_status?: 'VALIDATED_CANDIDATE' | 'STABLE';
  safety_gate?: SafetyGateEvaluation;
  decision: BridgeValidationDecision;
  intelligence?: OneCallMissionIntelligenceResult;
  integrity_issues?: string[];
}

export class AtlasAutonomousSourceBridge {
  private static instance: AtlasAutonomousSourceBridge;

  public static getInstance(): AtlasAutonomousSourceBridge {
    if (!this.instance) {
      this.instance = new AtlasAutonomousSourceBridge();
    }
    return this.instance;
  }

  /**
   * Resolves, proves, probes, and learns a source bridge for any query
   */
  public async resolveAndProveBridge(params: {
    query: string;
    geography?: string;
    persistLearning?: boolean;
  }): Promise<AutonomousBridgeResult> {
    const { query, geography = 'Argentina', persistLearning = true } = params;
    const cleanQuery = (query || '').trim();
    const queryLower = cleanQuery.toLowerCase();

    const conceptRegistry = AtlasConceptRegistry.getInstance();
    await conceptRegistry.ensureInitialized();
    await SourceKnowledgeMap.getSSOTInstance();

    const taxonomyValidator = AtlasPublicTaxonomyValidator.getInstance();
    const bridgeValidator = AtlasSourceBridgeValidator.getInstance();
    const intelligenceEngine = AtlasOneCallMissionIntelligence.getInstance();
    const integrityGate = AtlasConceptIntegrityGate.getInstance();

    // 1. SOURCE KNOWLEDGE FIRST: Check existing registry
    const existingMatches = conceptRegistry.findMatchingConcepts(queryLower);
    if (existingMatches.length > 0 && existingMatches[0].score >= 0.85) {
      const concept = existingMatches[0].concept;
      console.log(`[AutonomousSourceBridge] Zero-call resolution from Concept Registry: ${concept.concept_id}`);
      return {
        query: cleanQuery,
        geography,
        terminal_state: 'SOURCE_READY',
        concept_id: concept.concept_id,
        canonical_name: concept.canonical_name,
        source_knowledge_hit: true,
        gemini_called: false,
        probe_executed: false,
        probe_rows_found: 0,
        learning_persisted: false,
        decision: {
          status: 'SOURCE_READY',
          primary_source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
          selected_source_family: 'OSM_OVERPASS',
          executable: true,
          probe_required: false,
          reason: `Concept ${concept.concept_id} is already verified and mapped in Atlas Concept Registry.`
        }
      };
    }

    // 2. ONE GEMINI CALL FOR DIFFICULT MISSION
    console.log(`[AutonomousSourceBridge] Invoking One-Call Mission Intelligence for "${cleanQuery}"...`);
    const intelligence = await intelligenceEngine.resolveMission(cleanQuery, geography);

    // If ambiguous, user clarification is needed
    if (intelligence.is_ambiguous) {
      return {
        query: cleanQuery,
        geography,
        terminal_state: 'SEMANTICS_RESOLVED_SOURCE_BRIDGE_GAP',
        concept_id: null,
        canonical_name: cleanQuery,
        source_knowledge_hit: false,
        gemini_called: intelligence.gemini_called,
        probe_executed: false,
        probe_rows_found: 0,
        learning_persisted: false,
        intelligence,
        decision: {
          status: 'SEMANTICS_RESOLVED_SOURCE_BRIDGE_GAP',
          executable: false,
          probe_required: false,
          reason: intelligence.clarification_prompt || 'Término polisémico requiere aclaración del usuario.'
        }
      };
    }

    // 3. TAXONOMY VALIDATION (Gemini proposes — Atlas proves)
    const taxValidation = taxonomyValidator.validateHypotheses({
      canonical_candidate: intelligence.primary.semantics.canonical_candidate,
      osm_tags: intelligence.primary.public_taxonomies.osm_tags,
      wikidata_ids: intelligence.primary.public_taxonomies.wikidata_ids,
      clae_codes: intelligence.primary.public_taxonomies.clae_codes
    });

    // Synthesize mock MissionIR for validator
    const mockMissionIR: AtlasMissionIR = {
      raw_user_query: cleanQuery,
      ir_version: 'v1.0.0',
      intent: {
        action: intelligence.primary.semantics.action,
        role: intelligence.primary.semantics.role,
        target_entity_type: intelligence.primary.semantics.target_entity_type,
        row_unit: intelligence.primary.semantics.row_unit as any,
        relation: intelligence.primary.semantics.relation,
        expected_supply_behavior: 'DIRECT_DISCOVERY'
      },
      object: {
        raw_object_phrase: intelligence.primary.semantics.raw_object_phrase,
        canonical_name: intelligence.primary.semantics.canonical_candidate,
        domain: 'COMMERCIAL',
        qualifiers: intelligence.primary.semantics.qualifiers
      },
      geography: {
        raw_geography_phrase: geography,
        canonical_name: geography,
        country: 'ARG',
        resolution_type: 'NATIONAL'
      },
      evidence_contract: {
        mandatory_evidence: intelligence.primary.evidence_contract.identity_evidence.map(e => ({
          evidence_type: e,
          description: e,
          mandatory: true
        })),
        optional_evidence: []
      },
      negative_constraints: intelligence.primary.semantics.negative_constraints,
      confidence_score: intelligence.primary.semantics.confidence,
      resolution_state: 'SEMANTICS_RESOLVED',
      requires_user_clarification: false
    };

    // 4. SOURCE BRIDGE VALIDATION
    const decision = await bridgeValidator.evaluateBridge({
      missionIR: mockMissionIR,
      taxonomyValidation: taxValidation,
      sourceHypotheses: intelligence.primary.source_hypotheses
    });

    let probeExecuted = false;
    let probeRowsFound = 0;
    let learningPersisted = false;

    // 5. PROBE BEFORE LEARNING (Section 12)
    if (decision.status === 'NEEDS_PROBE' && decision.executable) {
      console.log(`[AutonomousSourceBridge] Executing canary probe for ${decision.primary_source_id}...`);
      probeExecuted = true;
      const probeRes = await bridgeValidator.executeCanaryProbe(decision);
      probeRowsFound = probeRes.rows_found;

      if (probeRes.success && probeRowsFound > 0) {
        console.log(`[AutonomousSourceBridge] Probe SUCCESS: ${probeRowsFound} physical rows found in ${geography}.`);

        // 6. LEARNING SAFETY GATE (Addendum Section B & C)
        const proposedConceptId = `CONCEPT_${intelligence.primary.semantics.canonical_candidate.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const candidateConceptDef: AtlasConceptDefinition = {
          concept_id: proposedConceptId,
          canonical_name: intelligence.primary.semantics.canonical_candidate,
          synonyms: [cleanQuery, intelligence.primary.semantics.raw_object_phrase],
          aliases: intelligence.primary.semantics.qualifiers,
          osm_tags: taxValidation.sanitized_osm_tags,
          clae_codes: taxValidation.sanitized_clae_codes,
          wikidata_ids: taxValidation.sanitized_wikidata_ids,
          categories: ['COMMERCIAL', 'ENTERTAINMENT_OR_INDUSTRY'],
          relations: [intelligence.primary.semantics.relation],
          row_unit: intelligence.primary.semantics.row_unit as any,
          evidence_requirements: intelligence.primary.evidence_contract.identity_evidence,
          confidence: 0.95,
          provenance: `ATLAS_AUTONOMOUS_SOURCE_BRIDGE::${decision.primary_source_id}::CANARY_PROBE_ROWS_${probeRowsFound}`,
          validation_state: 'VALIDATED_CANDIDATE'
        };

        const safetyGate = this.evaluateLearningSafetyGate({
          taxonomyValid: taxValidation.valid,
          decision,
          probeRes,
          candidateConceptDef,
          evidenceContract: intelligence.primary.evidence_contract,
          negativeConstraints: intelligence.primary.semantics.negative_constraints
        });

        if (!safetyGate.passed) {
          const isReviewRequired = safetyGate.sample_metrics.mission_fit_rate < 0.90;
          const terminalReason = isReviewRequired ? 'SOURCE_BRIDGE_REQUIRES_REVIEW' : 'REJECTED';
          console.warn(`[AutonomousSourceBridge] Learning Safety Gate ${terminalReason} for ${proposedConceptId}:`, safetyGate.rejection_reasons);
          return {
            query: cleanQuery,
            geography,
            terminal_state: terminalReason,
            concept_id: null,
            canonical_name: candidateConceptDef.canonical_name,
            source_knowledge_hit: false,
            gemini_called: intelligence.gemini_called,
            probe_executed: true,
            probe_rows_found: probeRowsFound,
            learning_persisted: false,
            safety_gate: safetyGate,
            decision: {
              ...decision,
              status: terminalReason,
              reason: `Safety Gate failed: ${safetyGate.rejection_reasons.join('; ')}`
            },
            intelligence,
            integrity_issues: safetyGate.rejection_reasons
          };
        }

        // 7. PERSIST VALIDATED LEARNING (Addendum Section I: Candidate Status)
        if (persistLearning) {
          try {
            await conceptRegistry.registerConceptInDb(candidateConceptDef);
            learningPersisted = true;
            console.log(`[AutonomousSourceBridge] Successfully learned and persisted candidate concept: ${proposedConceptId} (status: VALIDATED_CANDIDATE)`);
          } catch (err: any) {
            console.warn(`[AutonomousSourceBridge] Warning: Failed to persist concept ${proposedConceptId}:`, err.message);
          }
        }

        return {
          query: cleanQuery,
          geography,
          terminal_state: 'VALIDATED',
          concept_id: candidateConceptDef.concept_id,
          canonical_name: candidateConceptDef.canonical_name,
          source_knowledge_hit: false,
          gemini_called: intelligence.gemini_called,
          probe_executed: true,
          probe_rows_found: probeRowsFound,
          learning_persisted: learningPersisted,
          candidate_status: 'VALIDATED_CANDIDATE',
          safety_gate: safetyGate,
          decision: {
            ...decision,
            status: 'VALIDATED',
            reason: `Safety gate passed (Mission Fit: ${(safetyGate.sample_metrics.mission_fit_rate * 100).toFixed(0)}%). Bridge certified as VALIDATED_CANDIDATE.`
          },
          intelligence
        };
      } else {
        return {
          query: cleanQuery,
          geography,
          terminal_state: 'SOURCE_PROBE_FAILED',
          concept_id: null,
          canonical_name: intelligence.primary.semantics.canonical_candidate,
          source_knowledge_hit: false,
          gemini_called: intelligence.gemini_called,
          probe_executed: true,
          probe_rows_found: 0,
          learning_persisted: false,
          decision: {
            ...decision,
            status: 'SOURCE_PROBE_FAILED',
            reason: `Canary probe returned 0 rows or HTTP error (${probeRes.http_status}): ${probeRes.error || 'No rows returned'}`
          },
          intelligence
        };
      }
    }

    return {
      query: cleanQuery,
      geography,
      terminal_state: decision.status,
      concept_id: null,
      canonical_name: intelligence.primary.semantics.canonical_candidate,
      source_knowledge_hit: false,
      gemini_called: intelligence.gemini_called,
      probe_executed: false,
      probe_rows_found: 0,
      learning_persisted: false,
      decision,
      intelligence
    };
  }

  /**
   * LEARNING SAFETY GATE (Addendum Section B & C)
   * Enforces all 6 mandatory pillars before persisting any learned bridge.
   */
  public evaluateLearningSafetyGate(params: {
    taxonomyValid: boolean;
    decision: BridgeValidationDecision;
    probeRes: { success: boolean; rows_found: number; sample_records: any[] };
    candidateConceptDef: AtlasConceptDefinition;
    evidenceContract: any;
    negativeConstraints: string[];
  }): SafetyGateEvaluation {
    const reasons: string[] = [];

    // 1. Taxonomy Validation
    const taxPass = params.taxonomyValid;
    if (!taxPass) reasons.push('TAXONOMY_VALIDATION_FAILED');

    // 2. Source Public Access (Protocol is free open data, license cost = 0)
    const pubPass = params.decision.executable && ['OSM_OVERPASS', 'CKAN', 'OPEN_DATA_API', 'PUBLIC_REGISTRY'].includes(params.decision.selected_source_family || '');
    if (!pubPass) reasons.push('SOURCE_PUBLIC_ACCESS_RESTRICTED');

    // 3. Query Probe
    const probePass = params.probeRes.success && params.probeRes.rows_found > 0;
    if (!probePass) reasons.push('QUERY_PROBE_FAILED_ZERO_ROWS');

    // 4. Mission Fit Sample on up to 20 records
    const sample = params.probeRes.sample_records || [];
    const sampleTotal = sample.length;
    let fitPass = 0;

    const normalizeStr = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const negList = (params.negativeConstraints || []).map(normalizeStr).filter(Boolean);
    const candidateTags = (params.candidateConceptDef.osm_tags || []).map(t => t.toLowerCase());
    const conceptTerms = [
      params.candidateConceptDef.canonical_name,
      ...(params.candidateConceptDef.synonyms || []),
      ...(params.candidateConceptDef.aliases || [])
    ].map(normalizeStr).filter(Boolean);

    for (const r of sample) {
      const normName = normalizeStr(r.name || '');
      const tags = r.tags || {};

      // A) Negative constraint check
      const hasNegative = negList.some(neg => {
        if (!neg) return false;
        if (normName.includes(neg)) return true;
        return Object.values(tags).some((v: any) => normalizeStr(String(v)).includes(neg));
      });
      if (hasNegative) continue;

      // B) Identity and spatial coordinates check
      const hasIdentity = Boolean((r.name && r.name !== 'SIN_NOMBRE') || r.id);
      const hasCoordinates = (typeof r.lat === 'number' && typeof r.lon === 'number') || (r.lat && r.lon);
      if (!hasIdentity || !hasCoordinates) continue;

      // C) Semantic Tag or Name Match
      const matchesCandidateTag = candidateTags.some(t => {
        const [k, v] = t.split('=');
        if (!k) return false;
        const actual = tags[k];
        if (!actual) return false;
        if (!v) return true;
        return String(actual).toLowerCase() === v;
      });

      const matchesConceptTerm = conceptTerms.some(term => term.length >= 3 && normName.includes(term));

      if (matchesCandidateTag || matchesConceptTerm) {
        fitPass++;
      }
    }

    const fitRate = sampleTotal > 0 ? parseFloat((fitPass / sampleTotal).toFixed(2)) : 0;
    const missionFitPass = sampleTotal > 0 && fitRate >= 0.90;
    if (!missionFitPass) reasons.push(`MISSION_FIT_RATE_BELOW_THRESHOLD (${fitRate} < 0.90)`);

    // 5. Evidence Contract Sample
    const contractPass = sampleTotal > 0 && sample.every(r => r.lat && r.lon && (r.name || r.id));
    if (!contractPass) reasons.push('EVIDENCE_CONTRACT_UNFULFILLED_IN_SAMPLE');

    // 6. Concept Integrity Gate
    const integrityRes = AtlasConceptIntegrityGate.getInstance().validateConcept(params.candidateConceptDef);
    const integrityPass = integrityRes.valid;
    if (!integrityPass) reasons.push(...integrityRes.issues.map(i => `INTEGRITY_VIOLATION::${i.code}`));

    const allPassed = taxPass && pubPass && probePass && missionFitPass && contractPass && integrityPass;

    return {
      passed: allPassed,
      taxonomy_validation: taxPass ? 'PASS' : 'FAIL',
      source_public_access: pubPass ? 'PASS' : 'FAIL',
      query_probe: probePass ? 'PASS' : 'FAIL',
      mission_fit_sample: missionFitPass ? 'PASS' : 'FAIL',
      evidence_contract_sample: contractPass ? 'PASS' : 'FAIL',
      concept_integrity_gate: integrityPass ? 'PASS' : 'FAIL',
      sample_metrics: {
        sample_total: sampleTotal,
        mission_fit_pass: fitPass,
        mission_fit_fail: sampleTotal - fitPass,
        mission_fit_rate: fitRate
      },
      rejection_reasons: reasons
    };
  }

  /**
   * Promotes candidate bridge to STABLE in SSOT (Addendum Section I)
   */
  public async promoteBridgeToStable(conceptId: string): Promise<boolean> {
    try {
      await dbPool.query(`
        UPDATE public.atlas_concept_registry
        SET validation_state = 'STABLE', updated_at = NOW()
        WHERE concept_id = $1;
      `, [conceptId]);
      const reg = AtlasConceptRegistry.getInstance();
      const existing = reg.getConcept(conceptId);
      if (existing) {
        existing.validation_state = 'STABLE';
        reg.registerConcept(existing);
      }
      console.log(`[AutonomousSourceBridge] Successfully promoted bridge to STABLE: ${conceptId}`);
      return true;
    } catch (e: any) {
      console.warn(`[AutonomousSourceBridge] Failed to promote ${conceptId} to STABLE:`, e.message);
      return false;
    }
  }
}
