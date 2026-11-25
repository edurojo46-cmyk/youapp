/**
 * ATLAS — SOURCE INTELLIGENCE LAYER
 * Module: SourceBrain (Sections 1, 2, 3, 4, 8, 9)
 * 
 * Central Source Reasoning & Tactical Dispatcher:
 * - Bridges GeneralRetrievalPlanner ("WHAT evidence is needed") with physical source execution ("WHERE & HOW to get it").
 * - Evaluates EvidenceGoals against SourceKnowledgeMap.
 * - Categorizes each goal resolution:
 *     1. KNOWN_WINNER: Established high-yield, low-latency, reliable source.
 *     2. KNOWN_ALTERNATIVE: Verified secondary source in known family.
 *     3. UNEXPLORED_FAMILY: Known family/ecosystem without calibrated endpoints.
 *     4. NEW_DISCOVERY_REQUIRED: Complete gap, triggers SourceFamilyGapEngine.
 * - Manages Canary Probing and the Speed Loop:
 *     CANARY -> MEASURE QUALIFIED YIELD -> PROMOTE -> SCALE EXTRACTION.
 *     Zero-yield -> Fast deprioritization / kill.
 *     High qualified/sec -> Allocate more rotor capacity.
 */

import type { EvidenceGoal, SourceClass, PathPlan } from '../types.ts';
import { dbPool } from '../../../../server/db.ts';
import {
  SourceKnowledgeMap,
  type SourceKnowledgeEntry,
  type SourceMissionFeedback,
  type SourceBatchFeedback,
  type SourceStatus
} from './SourceKnowledgeMap.ts';
import { SourceFamilyGapEngine, type EcosystemDiscoveryResult } from './SourceFamilyGapEngine.ts';

export type SourceDecisionCategory =
  | 'KNOWN_WINNER'
  | 'KNOWN_ALTERNATIVE'
  | 'UNEXPLORED_FAMILY'
  | 'NEW_DISCOVERY_REQUIRED';

export interface GoalSourceDecision {
  goalId: string;
  statementToProve: string;
  category: SourceDecisionCategory;
  recommendedSources: SourceKnowledgeEntry[];
  gapDetected: boolean;
  selectedSourceId?: string;
  priorityScore: number;
  reasoning: string;
}

export interface CanaryProbeResult {
  sourceId: string;
  sampleTested: number;
  candidatesFound: number;
  verified: number;
  qualified: number;
  latencyMs: number;
  qualifiedPerSecond: number;
  action: 'PROMOTE' | 'DEPRIORITIZE_FAST' | 'RETRY';
  allocatedRotors: number;
}

export class SourceBrain {
  private static instance: SourceBrain;
  private knowledgeMapOverride?: SourceKnowledgeMap;
  private gapEngineOverride?: SourceFamilyGapEngine;

  // Active rotor capacity allocation per source
  private rotorAllocations: Map<string, number> = new Map();

  private constructor(knowledgeMap?: SourceKnowledgeMap, gapEngine?: SourceFamilyGapEngine) {
    this.knowledgeMapOverride = knowledgeMap;
    this.gapEngineOverride = gapEngine;
  }

  public static getInstance(): SourceBrain {
    if (!this.instance) {
      this.instance = new SourceBrain();
    }
    return this.instance;
  }

  public static resetForTest(): void {
    this.instance = new SourceBrain();
  }

  public getKnowledgeMap(): SourceKnowledgeMap {
    return this.knowledgeMapOverride || SourceKnowledgeMap.getInstance();
  }

  public getGapEngine(): SourceFamilyGapEngine {
    return this.gapEngineOverride || SourceFamilyGapEngine.getInstance();
  }

  /**
   * 4. SOURCE BRAIN EVALUATION:
   * For each EvidenceGoal, consults SourceKnowledgeMap and classifies into:
   * KNOWN_WINNER, KNOWN_ALTERNATIVE, UNEXPLORED_FAMILY, or NEW_DISCOVERY_REQUIRED.
   */
  public evaluateGoal(goal: EvidenceGoal, geography: string = 'Argentina'): GoalSourceDecision {
    const candidateSources = this.getKnowledgeMap().findSourcesForGoal(goal, geography);

    if (candidateSources.length === 0) {
      // Check if any source shares a related family or parent domain
      const allSources = this.getKnowledgeMap().getAllSources();
      const familyCandidate = allSources.find(s =>
        goal.preferred_source_classes.includes(s.source_class) ||
        s.topics.some(t => goal.statement_to_prove.toLowerCase().includes(t.toLowerCase()))
      );

      if (familyCandidate) {
        return {
          goalId: goal.id,
          statementToProve: goal.statement_to_prove,
          category: 'UNEXPLORED_FAMILY',
          recommendedSources: [familyCandidate],
          gapDetected: true,
          priorityScore: 0.5,
          reasoning: `Family ${familyCandidate.source_family} matches class ${familyCandidate.source_class}, but specific endpoint needs calibration.`
        };
      }

      return {
        goalId: goal.id,
        statementToProve: goal.statement_to_prove,
        category: 'NEW_DISCOVERY_REQUIRED',
        recommendedSources: [],
        gapDetected: true,
        priorityScore: 0.3,
        reasoning: `No sources in SourceKnowledgeMap satisfy criteria or classes [${goal.preferred_source_classes.join(', ')}]. Family gap engine required.`
      };
    }

    // Filter active or promoted candidates
    const winners = candidateSources.filter(s =>
      (s.current_status === 'PROMOTED' || s.current_status === 'ACTIVE' || s.current_status === 'SEMANTIC_MOTOR') &&
      s.qualified_yield >= 0.65 &&
      s.reliability_score >= 0.80 &&
      (s.saturation < 0.85 || s.evidence_goals_solved.includes(goal.id) || s.evidence_goals_solved.includes(goal.statement_to_prove))
    );

    if (winners.length > 0) {
      const topWinner = winners[0];
      return {
        goalId: goal.id,
        statementToProve: goal.statement_to_prove,
        category: 'KNOWN_WINNER',
        recommendedSources: winners,
        gapDetected: false,
        selectedSourceId: topWinner.source_id,
        priorityScore: 0.95 + (topWinner.qualified_yield * 0.05),
        reasoning: `Authoritative winner [${topWinner.source_id}] available with proven qualified yield ${(topWinner.qualified_yield * 100).toFixed(0)}% and ${topWinner.qualified_per_second}/s.`
      };
    }

    // Otherwise, known alternative available
    const topAlternative = candidateSources[0];
    return {
      goalId: goal.id,
      statementToProve: goal.statement_to_prove,
      category: 'KNOWN_ALTERNATIVE',
      recommendedSources: candidateSources,
      gapDetected: false,
      selectedSourceId: topAlternative.source_id,
      priorityScore: 0.70 + (topAlternative.qualified_yield * 0.1),
      reasoning: `Known alternative source [${topAlternative.source_id}] in knowledge map (yield ${(topAlternative.qualified_yield * 100).toFixed(0)}%).`
    };
  }

  /**
   * Evaluates all EvidenceGoals for a mission plan.
   */
  public evaluateGoals(goals: EvidenceGoal[], geography: string = 'Argentina'): GoalSourceDecision[] {
    return goals.map(g => this.evaluateGoal(g, geography));
  }

  /**
   * 7. GAP RESOLUTION & ECOSYSTEM DISCOVERY:
   * When a goal requires new discovery or unexplored family, dispatches to SourceFamilyGapEngine.
   */
  public async resolveGoalGap(
    goal: EvidenceGoal,
    geography: string = 'Argentina',
    seedQuery?: string
  ): Promise<EcosystemDiscoveryResult> {
    const discovery = await this.getGapEngine().discoverEcosystemForGoal(goal, geography, seedQuery);
    return discovery;
  }

  /**
   * 9. SPEED LOOP:
   * Evaluates canary probe results and either rapidly kills/deprioritizes or promotes and scales rotors.
   */
  public evaluateCanary(
    sourceId: string,
    sampleTested: number,
    candidatesFound: number,
    verified: number,
    qualified: number,
    latencyMs: number
  ): CanaryProbeResult {
    const latencySec = Math.max(0.001, latencyMs / 1000);
    const qualifiedPerSec = parseFloat((qualified / latencySec).toFixed(2));
    const qualifiedYield = sampleTested > 0 ? qualified / sampleTested : 0;

    let action: CanaryProbeResult['action'] = 'RETRY';
    let allocatedRotors = 1;

    if (qualified === 0 && verified === 0) {
      // Zero yield in canary -> deprioritize fast
      action = 'DEPRIORITIZE_FAST';
      allocatedRotors = 0;
      this.rotorAllocations.set(sourceId, 0);

      this.getKnowledgeMap().updateSourceMetrics(sourceId, {
        current_status: 'DORMANT',
        failure_modes: ['CANARY_ZERO_YIELD']
      });
    } else if (qualifiedYield >= 0.60 || qualifiedPerSec >= 5.0) {
      // High-yield winner -> promote and scale up extraction rotors
      action = 'PROMOTE';
      allocatedRotors = qualifiedPerSec >= 10.0 ? 8 : 4;
      this.rotorAllocations.set(sourceId, allocatedRotors);

      this.getKnowledgeMap().updateSourceMetrics(sourceId, {
        current_status: 'PROMOTED',
        qualified_yield: parseFloat(qualifiedYield.toFixed(2)),
        qualified_per_second: qualifiedPerSec,
        last_success: new Date().toISOString()
      });
    } else {
      // Moderate yield -> active baseline rotor
      allocatedRotors = 2;
      this.rotorAllocations.set(sourceId, allocatedRotors);
    }

    return {
      sourceId,
      sampleTested,
      candidatesFound,
      verified,
      qualified,
      latencyMs,
      qualifiedPerSecond: qualifiedPerSec,
      action,
      allocatedRotors
    };
  }

  public getAllocatedRotors(sourceId: string): number {
    return this.rotorAllocations.get(sourceId) || 1;
  }

  /**
   * MICRO-CANARY ADAPTATIVO:
   * CANARY_1 = 200 rows -> Si yield es prometedor -> CANARY_2 = 1000 rows -> Si es malo -> DEPRIORITIZE temprano.
   */
  public evaluateMicroCanary(params: {
    stage: 'CANARY_1' | 'CANARY_2';
    rowsScanned: number;
    personEmailsFound: number;
    trueNetNew: number;
    latencyMs: number;
  }): {
    action: 'PROCEED_TO_CANARY_2' | 'PROMOTE_TO_WINNER' | 'DEPRIORITIZE_EARLY';
    expectedNetNewPerMin: number;
    noveltyRate: number;
    density: number;
    reason: string;
  } {
    const noveltyRate = params.personEmailsFound > 0 ? params.trueNetNew / params.personEmailsFound : 0;
    const density = params.rowsScanned > 0 ? params.trueNetNew / params.rowsScanned : 0;
    const latencySec = Math.max(0.001, params.latencyMs / 1000);
    const netNewPerMin = parseFloat(((params.trueNetNew / latencySec) * 60).toFixed(2));

    if (params.stage === 'CANARY_1') {
      if (params.trueNetNew === 0 || density < 0.005) {
        return {
          action: 'DEPRIORITIZE_EARLY',
          expectedNetNewPerMin: 0,
          noveltyRate,
          density,
          reason: `CANARY_1_EARLY_REJECTION_NET_NEW_${params.trueNetNew}_OF_${params.rowsScanned}`
        };
      }
      return {
        action: 'PROCEED_TO_CANARY_2',
        expectedNetNewPerMin: netNewPerMin,
        noveltyRate,
        density,
        reason: 'CANARY_1_PASSED_PROCEED_TO_CANARY_2_1000'
      };
    } else {
      if (params.trueNetNew >= 30 && (noveltyRate >= 0.15 || density >= 0.05)) {
        return {
          action: 'PROMOTE_TO_WINNER',
          expectedNetNewPerMin: netNewPerMin,
          noveltyRate,
          density,
          reason: `CANARY_2_PROMOTED_HIGH_YIELD_WINNER_NET_NEW_${params.trueNetNew}`
        };
      }
      return {
        action: 'DEPRIORITIZE_EARLY',
        expectedNetNewPerMin: netNewPerMin,
        noveltyRate,
        density,
        reason: `CANARY_2_INSUFFICIENT_YIELD_NOVELTY_${(noveltyRate * 100).toFixed(1)}%`
      };
    }
  }

  /**
   * RANKING POR NET-NEW/MINUTO:
   * remaining_rows * person_email_density * true_novelty_rate * gate_pass_probability / expected_processing_time
   */
  public calculateExpectedNetNewPerMin(params: {
    remainingRows: number;
    personEmailDensity: number;
    trueNoveltyRate: number;
    gatePassProbability: number;
    expectedProcessingMinutes?: number;
  }): number {
    const processingMinutes = Math.max(0.1, params.expectedProcessingMinutes || (params.remainingRows / 5000));
    const expectedNetNewTotal = params.remainingRows * params.personEmailDensity * params.trueNoveltyRate * params.gatePassProbability;
    return parseFloat((expectedNetNewTotal / processingMinutes).toFixed(2));
  }

  /**
   * SIBLING EXPANSION:
   * Automatically discovers candidate sibling sources sharing parent domain, organization, or family
   * across jurisdictions, resolving strictly by CANONICAL_RESOURCE_ID.
   */
  public async expandSiblings(winnerSource: {
    sourceId: string;
    canonicalResourceId?: string;
    parentDomain?: string;
    sourceFamily?: string;
  }): Promise<Array<{
    source_id: string;
    source_name: string;
    canonical_resource_id: string;
    canonical_url: string;
    estimated_records: number;
    sibling_type: 'SAME_ORGANIZATION' | 'SAME_FAMILY_CROSS_JURISDICTION' | 'RELATED_ENDPOINT';
  }>> {
    const pool = dbPool;
    if (!pool) return [];

    try {
      const res = await pool.query(`
        SELECT source_id, source_name, canonical_resource_id, canonical_url, estimated_records,
          CASE
            WHEN canonical_url ILIKE ('%' || $1::text || '%') THEN 'SAME_ORGANIZATION'
            WHEN source_family = $2::text THEN 'SAME_FAMILY_CROSS_JURISDICTION'
            ELSE 'RELATED_ENDPOINT'
          END as sibling_type
        FROM public.atlas_source_knowledge_map
        WHERE source_id != $3
          AND (
            ($1::text IS NOT NULL AND $1::text != '' AND canonical_url ILIKE ('%' || $1::text || '%')) OR
            ($2::text IS NOT NULL AND source_family = $2::text)
          )
          AND current_status NOT IN ('EXHAUSTED', 'DEPRIORITIZED', 'DORMANT')
          AND (
            $4::text IS NULL OR canonical_resource_id IS NULL OR canonical_resource_id != $4::text
          )
        ORDER BY estimated_records DESC
        LIMIT 10;
      `, [
        winnerSource.parentDomain || '',
        winnerSource.sourceFamily || '',
        winnerSource.sourceId,
        winnerSource.canonicalResourceId || ''
      ]);

      return res.rows;
    } catch (err: any) {
      console.warn('[SourceBrain] expandSiblings error:', err.message);
      return [];
    }
  }

  /**
   * 6. BI-DIRECTIONAL MISSION FEEDBACK:
   * Submits feedback from physical execution back to SourceKnowledgeMap.
   */
  public feedbackMissionResult(feedback: SourceMissionFeedback): void {
    this.getKnowledgeMap().recordMissionObservation(feedback);
  }

  /**
   * Returns batch-level telemetry to SourceBrain and dynamically updates
   * torque/priority and deprioritizes low-yield sources.
   */
  public async recordBatchFeedback(feedback: SourceBatchFeedback): Promise<{
    should_rotate: boolean;
    action: 'CONTINUE' | 'DEPRIORITIZE_AND_ROTATE' | 'SCALE_UP';
    reason: string;
  }> {
    return await this.getKnowledgeMap().recordBatchFeedback(feedback);
  }

  /**
   * Prioritizes and leases the next capable source based on EXPECTED NET-NEW CERTIFIED YIELD,
   * checking the consumed ledger (records_scanned, overlap_memory, exhaustion status).
   */
  public async selectNextCapableSource(options: {
    currentlyLeased?: Set<string>;
    workerId?: number;
    requiredEntityType?: string;
  }): Promise<SourceKnowledgeEntry | null> {
    const currentlyLeased = options.currentlyLeased || new Set<string>();
    const pool = dbPool;
    if (!pool) return null;

    try {
      // Query SSOT for capable sources, filtering out exhausted, deprioritized, and currently leased
      const res = await pool.query(`
        SELECT *,
          (
            -- EXPECTED_NET_NEW_CERTIFIED_PER_MIN:
            -- remaining_rows * person_email_density * true_novelty_rate * gate_pass_probability / expected_processing_time
            (
              GREATEST(1, COALESCE(estimated_records, 5000) - COALESCE((overlap_memory->>'records_scanned')::bigint, 0)) *
              CASE 
                WHEN entity_types_supported::text ILIKE '%PERSON%' THEN 0.60
                WHEN source_family ILIKE '%PROFESSIONAL%' OR source_family ILIKE '%REGISTRY%' OR source_family ILIKE '%ADMIN%' THEN 0.40
                ELSE 0.15
              END *
              (1.0 - COALESCE((field_telemetry->>'overlap')::numeric, 0.15)) *
              COALESCE(quality_score, 0.90)
            ) /
            GREATEST(1.0, (GREATEST(1, COALESCE(estimated_records, 5000) - COALESCE((overlap_memory->>'records_scanned')::bigint, 0)) / 5000.0))
          ) as expected_net_new_per_min
        FROM public.atlas_source_knowledge_map
        WHERE can_produce_entity_rows = 'TRUE'
          AND current_status IN ('PROMOTED', 'ACTIVE', 'CANARY')
          AND current_status NOT IN ('EXHAUSTED', 'DEPRIORITIZED', 'DORMANT', 'DISCOVERY_HINT')
          AND COALESCE(overlap_memory->>'provenance_status', '') != 'DISCOVERY_HINT_ONLY'
          AND COALESCE(overlap_memory->>'source_origin', '') != 'INTERNAL_ARTIFACT'
          AND canonical_url NOT ILIKE '%reports/atlas%'
          AND canonical_url NOT ILIKE '%contact_pointer_store%'
          AND canonical_url NOT ILIKE '%canonical_relation_store%'
          AND source_id NOT ILIKE '%DB_PERSON%'
          AND source_id NOT ILIKE '%EMAIL_POINTERS%'
          AND source_id NOT ILIKE '%RELATIONS%'
          AND source_id != ALL($1::text[])
          -- Semantic Gate memory check: exclude sources marked as non-person, identity reservoirs without email, or rejected
          AND COALESCE(semantic_gate_status, '') NOT IN ('SKIP_NON_PERSON', 'SKIP_IDENTITY_RESERVOIR', 'REJECT_UNKNOWN')
          AND current_status NOT IN ('NON_PERSON_SOURCE', 'IDENTITY_RESERVOIR')
          AND (direct_person_email_binding_possible IS NULL OR direct_person_email_binding_possible = true)
          -- Canonical Resource Identity check: prevent leasing any alias of an already leased physical resource
          AND (
            canonical_resource_id IS NULL OR
            canonical_resource_id NOT IN (
              SELECT DISTINCT canonical_resource_id 
              FROM public.atlas_source_knowledge_map
              WHERE source_id = ANY($1::text[])
                AND canonical_resource_id IS NOT NULL
            )
          )
          AND (
            current_status = 'PROMOTED' OR
            $2::text IS NULL OR
            entity_types_supported::text ILIKE ('%' || $2::text || '%') OR
            row_unit_supported::text ILIKE ('%' || $2::text || '%') OR
            source_family ILIKE '%PROFESSIONAL%' OR
            source_family ILIKE '%ADMIN%' OR
            source_family ILIKE '%MUNICIPAL%' OR
            source_family ILIKE '%REGISTRY%' OR
            source_family ILIKE '%HEALTH%' OR
            source_family ILIKE '%PROCUREMENT%'
          )
          -- Consumed ledger check: exclude if scanned full volume with zero yield and no remaining supply
          AND NOT (
            COALESCE((overlap_memory->>'records_scanned')::bigint, 0) > 1000 AND
            COALESCE((overlap_memory->>'true_net_new_found')::bigint, 0) = 0 AND
            COALESCE((overlap_memory->>'canary_true_net_new')::int, 0) = 0
          )
          -- Remaining supply check: do not lease exhausted files where cursor >= estimated_records
          AND (
            current_status = 'PROMOTED' AND (
              COALESCE((overlap_memory->>'estimated_remaining_net_new')::int, 0) > 0 OR
              COALESCE((overlap_memory->>'records_scanned')::bigint, 0) < COALESCE(estimated_records, 999999999)
            )
            OR current_status != 'PROMOTED'
          )
        ORDER BY 
          CASE WHEN current_status = 'PROMOTED' THEN 0 ELSE 1 END,
          expected_net_new_per_min DESC NULLS LAST, 
          quality_score DESC
        LIMIT 10;
      `, [Array.from(currentlyLeased), options.requiredEntityType || 'PERSON']);

      if (res.rows.length === 0) return null;

      // Map top row to entry
      const { mapRowToSourceEntry } = await import('./SourceKnowledgeMap.ts');
      const topRow = res.rows[0];
      return mapRowToSourceEntry(topRow);
    } catch (err: any) {
      console.warn('[SourceBrain] selectNextCapableSource error:', err.message);
      return null;
    }
  }

  /**
   * Reads semantic gate memory from SKM for a given canonical resource or source id.
   */
  public async readSemanticMemory(sourceIdOrCanonicalId: string): Promise<{
    has_semantic_memory: boolean;
    canonical_resource_id?: string;
    entity_grain?: string;
    semantic_gate_status?: string;
    direct_person_email_binding_possible?: boolean;
    source_classification?: string;
    identity_reservoir?: string;
    semantic_rejection_reason?: string;
  }> {
    const res = await dbPool.query(`
      SELECT 
        source_id,
        canonical_resource_id,
        entity_grain,
        semantic_gate_status,
        direct_person_email_binding_possible,
        source_classification,
        identity_reservoir,
        semantic_rejection_reason
      FROM atlas_source_knowledge_map
      WHERE source_id = $1 OR canonical_resource_id = $1
      LIMIT 1;
    `, [sourceIdOrCanonicalId]);

    if (res.rows.length === 0) {
      return { has_semantic_memory: false };
    }

    const r = res.rows[0];
    return {
      has_semantic_memory: Boolean(r.semantic_gate_status),
      canonical_resource_id: r.canonical_resource_id,
      entity_grain: r.entity_grain,
      semantic_gate_status: r.semantic_gate_status,
      direct_person_email_binding_possible: r.direct_person_email_binding_possible,
      source_classification: r.source_classification,
      identity_reservoir: r.identity_reservoir,
      semantic_rejection_reason: r.semantic_rejection_reason
    };
  }
}
