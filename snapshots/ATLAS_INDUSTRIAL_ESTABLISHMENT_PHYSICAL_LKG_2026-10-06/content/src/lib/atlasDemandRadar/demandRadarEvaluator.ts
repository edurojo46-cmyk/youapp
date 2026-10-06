/**
 * Atlas Demand Radar V1 — End-to-End Demand Evaluator Pipeline
 */

import type {
  DemandSignal,
  DemandSnapshot,
  DemandOpportunity,
  NormalizedMetric
} from './types';
import { validateSourceCapability, isSignalFresh, validateZeroPii } from './sourceCapabilities';
import { BaselineRegistry, normalizeSourceMetric } from './normalizationEngine';
import { analyzeCommercialIntent } from './commercialIntentLexicon';
import { SemanticClusterRegistry } from './semanticClusterEngine';
import { constructDemandVector, deriveMarketState, computeLeadLagMetadata } from './demandVectorEngine';
import { evaluateDemandOpportunity } from './scoringEngine';
import { matchClusterToCommerce, CandidateProductBundle } from './commerceBridge';
import type { MercadoLibreSiteId, VersionedSitePolicy, CommissionRule } from '../atlasCommerce/types';

export class DemandRadarEvaluator {
  public baselineRegistry: BaselineRegistry;
  public clusterRegistry: SemanticClusterRegistry;

  constructor() {
    this.baselineRegistry = new BaselineRegistry();
    this.clusterRegistry = new SemanticClusterRegistry();
  }

  evaluateSignals(
    signals: DemandSignal[],
    siteId: MercadoLibreSiteId,
    sitePolicy: VersionedSitePolicy,
    commissionRule: CommissionRule,
    commerceCandidates: CandidateProductBundle[] = [],
    options: {
      nowIso?: string;
      activeHours?: number;
      saturationIndex?: number;
    } = {}
  ): {
    snapshot: DemandSnapshot;
    opportunity?: DemandOpportunity;
    rejected_signals: Array<{ signal: DemandSignal; reason: string }>;
  } {
    const rejectedSignals: Array<{ signal: DemandSignal; reason: string }> = [];
    const validSignals: DemandSignal[] = [];

    // 1. Ingestion validation (Zero PII, Capability, Freshness)
    for (const sig of signals) {
      // Zero PII check
      const piiCheck = validateZeroPii(sig.raw_query_topic);
      if (!piiCheck.is_clean) {
        rejectedSignals.push({
          signal: sig,
          reason: `PII_VIOLATION_DETECTED: [${piiCheck.violations.join(', ')}]`
        });
        continue;
      }

      // Capability Check (Fail closed on UNKNOWN / DISABLED / NON-COMMERCIAL)
      const capCheck = validateSourceCapability(sig.source_platform);
      if (!capCheck.is_authorized) {
        rejectedSignals.push({
          signal: sig,
          reason: capCheck.rejection_reason || 'UNAUTHORIZED_CAPABILITY'
        });
        continue;
      }

      // Freshness Check
      const freshCheck = isSignalFresh(sig, options.nowIso);
      if (!freshCheck.is_fresh) {
        rejectedSignals.push({
          signal: sig,
          reason: `SIGNAL_STALE: Age ${freshCheck.age_seconds}s exceeds max allowed ${freshCheck.max_allowed_seconds}s`
        });
        continue;
      }

      validSignals.push(sig);
    }

    if (validSignals.length === 0) {
      const emptySnapshot: DemandSnapshot = {
        snapshot_id: `snap_empty_${Date.now()}`,
        cluster_id: 'cluster_unknown',
        as_of: options.nowIso || new Date().toISOString(),
        metrics: [],
        demand_vector: {
          search_strength: 0,
          social_strength: 0,
          content_signal_strength: 0,
          commercial_intent: 0,
          confidence: 0,
          persistence: 0,
          acceleration: 0,
          saturation_index: options.saturationIndex || 20
        },
        demand_score: 0,
        market_state: 'INACTIVE',
        source_diversity_count: 0,
        is_stale: true
      };

      return {
        snapshot: emptySnapshot,
        rejected_signals: rejectedSignals
      };
    }

    // 2. Cluster Resolution
    const representativeTopic = validSignals[0].raw_query_topic;
    const cluster = this.clusterRegistry.resolveCluster(representativeTopic);

    // 3. Normalization per source
    const normalizedMetrics: NormalizedMetric[] = [];
    const sourceFirstObserved: Array<{ platform: any; observedAtIso: string }> = [];

    for (const sig of validSignals) {
      const hourOfDay = new Date(sig.observed_at).getUTCHours();
      const baseline = this.baselineRegistry.getBaseline(
        sig.source_platform,
        cluster.slug,
        sig.region_code,
        hourOfDay
      );

      const norm = normalizeSourceMetric(
        sig.source_platform,
        sig.metric_kind,
        sig.metric_value,
        baseline
      );
      normalizedMetrics.push(norm);

      sourceFirstObserved.push({
        platform: sig.source_platform,
        observedAtIso: sig.observed_at
      });
    }

    // 4. Commercial Intent Analysis
    const intentAnalysis = analyzeCommercialIntent(representativeTopic);

    // 5. Construct Demand Vector
    const demandVector = constructDemandVector(
      normalizedMetrics,
      intentAnalysis,
      options.activeHours || 1,
      options.saturationIndex || 20
    );

    // 6. Commerce Match Bridge
    const snapshotId = `snap_${cluster.slug}_${Date.now()}`;
    const opportunityId = `opp_${cluster.slug}_${siteId}_${Date.now()}`;

    const commerceResult = matchClusterToCommerce(
      opportunityId,
      siteId,
      sitePolicy,
      commissionRule,
      commerceCandidates,
      options.nowIso
    );

    const hasEligible = (commerceResult.commerce_match?.eligible_items_count || 0) > 0;

    // 7. Derive Market State
    const marketState = deriveMarketState(demandVector, hasEligible);

    // 8. Calculate Demand Score
    const leadLag = computeLeadLagMetadata(sourceFirstObserved);

    const snapshot: DemandSnapshot = {
      snapshot_id: snapshotId,
      cluster_id: cluster.cluster_id,
      as_of: options.nowIso || new Date().toISOString(),
      metrics: normalizedMetrics,
      demand_vector: demandVector,
      demand_score: 0, // Assigned below
      market_state: marketState,
      source_diversity_count: new Set(validSignals.map(s => s.source_platform)).size,
      lead_lag_metadata: leadLag,
      is_stale: false
    };

    // 9. Generate Opportunity
    const opportunity = evaluateDemandOpportunity(
      cluster.cluster_id,
      snapshot.snapshot_id,
      siteId,
      demandVector,
      marketState,
      commerceResult.commerce_match_score
    );

    snapshot.demand_score = opportunity.demand_score;

    return {
      snapshot,
      opportunity,
      rejected_signals: rejectedSignals
    };
  }
}
