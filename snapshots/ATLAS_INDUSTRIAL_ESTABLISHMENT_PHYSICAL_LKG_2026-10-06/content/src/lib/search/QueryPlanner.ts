import type { QueryIntent } from './UniversalQueryModel';
import type { IExternalPersonSourceAdapter } from './IExternalPersonSourceAdapter';
import { SourceCapabilityRegistry, type RegisteredSource, type RetrievalStrategy } from './SourceCapabilityRegistry';

export interface QueryPlan {
  executeAtlas: boolean;
  executeExternalAdapters: string[];
  executeGemini: boolean;
  plannedSources: string[];
  notApplicableSources: string[];
}

export type RetrievalDecisionMode = 
  | 'LOCAL_ONLY' 
  | 'LOCAL_PLUS_LIVE' 
  | 'LIVE_ONLY' 
  | 'BLOCKED' 
  | 'INSUFFICIENT_CAPABILITY';

export interface PlannedSourceItem {
  source_id: string;
  source_name: string;
  strategy: RetrievalStrategy;
  score: number;
  reason_selected: string;
  is_authoritative: boolean;
  scoring_details?: {
    authority_score: number;
    freshness_score: number;
    geographic_fit_score: number;
    previous_success_score: number;
    latency_penalty: number;
    failure_penalty: number;
    stale_penalty: number;
  };
}

export interface RejectedSourceItem {
  source_id: string;
  reason: string;
}

export interface HybridRetrievalPlan {
  plan_id: string;
  query: string;
  intent: QueryIntent;
  decision_mode: RetrievalDecisionMode;
  local_evidence_found: number;
  local_evidence_sufficient: boolean;
  freshness_required: boolean;
  planned_sources: PlannedSourceItem[];
  rejected_sources: RejectedSourceItem[];
  external_calls_planned: number;
  reason_codes: string[];
  created_at: string;
}

export class QueryPlanner {
  /**
   * Legacy planner for backward compatibility with existing tests and search pipelines
   */
  static plan(intent: QueryIntent, adapters: IExternalPersonSourceAdapter[]): QueryPlan {
    const plan: QueryPlan = {
      executeAtlas: true,
      executeExternalAdapters: [],
      executeGemini: true,
      plannedSources: ['ATLAS', 'GEMINI_WEB'],
      notApplicableSources: []
    };
    
    for (const adapter of adapters) {
      const cap = adapter.getCapabilities();
      const id = adapter.getAdapterId();
      
      let shouldExecute = true;
      let notApplicableReason = '';
      
      if (intent.person_name) {
        if (!cap.name_search) {
          shouldExecute = false;
          notApplicableReason = 'No name search capability';
        }
      }
      
      const prof = (intent.profession || intent.occupation || intent.trade || intent.role_class || '').toUpperCase();

      if (id === 'GITHUB_API') {
        const isSoftware = ['PROGRAMADOR', 'DESARROLLADOR', 'SOFTWARE', 'INGENIERO'].includes(prof) || 
                           intent.activity === 'SOFTWARE_DEVELOPMENT';
        if (!isSoftware) {
          shouldExecute = false;
          notApplicableReason = 'Solo aplicable a perfiles de desarrollo de software';
        }
      } else if (id === 'ORCID_PUBLIC_API') {
        const isAcademic = ['INVESTIGADOR', 'CIENTIFICO', 'CIENTÍFICO', 'DOCENTE', 'DOCENTE UNIVERSITARIO', 'ACADEMICO', 'ACADÉMICO', 'RESEARCHER'].includes(prof) ||
                           intent.activity === 'RESEARCH';
        if (!isAcademic) {
          shouldExecute = false;
          notApplicableReason = 'Solo aplicable a perfiles académicos y de investigación';
        }
      } else if (id === 'WIKIDATA_SPARQL') {
        if (intent.role_class === 'EMPLOYEE' && !intent.person_name && !intent.profession) {
          shouldExecute = false;
          notApplicableReason = 'Wikidata no indexa listados generales de empleados';
        }
      }
      
      if (shouldExecute) {
        plan.executeExternalAdapters.push(id);
        plan.plannedSources.push(id);
      } else {
        plan.notApplicableSources.push(id);
      }
    }
    
    return plan;
  }

  /**
   * Knowledge Universe & Hybrid Retrieval Planner (V4.7.1 / Phase C)
   * Decides: LOCAL_ONLY | LOCAL_PLUS_LIVE | LIVE_ONLY | BLOCKED | INSUFFICIENT_CAPABILITY
   */
  public static planHybridRetrieval(
    intent: QueryIntent,
    options?: {
      localRecordCount?: number;
      freshnessRequired?: boolean;
      adapters?: IExternalPersonSourceAdapter[];
      history?: Record<string, { successCount: number; failureCount: number; avgLatencyMs: number }>;
      targetSourceId?: string;
    }
  ): HybridRetrievalPlan {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rawQuery = intent.raw_query || `${intent.person_name || ''} ${intent.profession || ''} ${intent.geography || ''}`.trim();
    const localCount = options?.localRecordCount ?? 0;
    const freshnessRequired = options?.freshnessRequired ?? false;
    const reasonCodes: string[] = [];

    // 1. Evaluate Local Knowledge Completeness
    const localSufficient = localCount > 0 && !freshnessRequired;

    if (localSufficient) {
      reasonCodes.push(`LOCAL_KNOWLEDGE_SUFFICIENT: Found ${localCount} verified local records; query does not demand real-time verification.`);
      return {
        plan_id: planId,
        query: rawQuery,
        intent,
        decision_mode: 'LOCAL_ONLY',
        local_evidence_found: localCount,
        local_evidence_sufficient: true,
        freshness_required: false,
        planned_sources: [
          {
            source_id: 'ATLAS_DISCOVERY_INDEX',
            source_name: 'Atlas Verified Discovery Index (Local Postgres)',
            strategy: 'INDEX_FULL',
            score: 100,
            reason_selected: 'Authoritative local validated repository',
            is_authoritative: true
          }
        ],
        rejected_sources: [],
        external_calls_planned: 0,
        reason_codes: reasonCodes,
        created_at: new Date().toISOString()
      };
    }

    // 2. Query Source Capability Registry for matching sources
    let capableSources = SourceCapabilityRegistry.getCapableSources(intent);
    const plannedSources: PlannedSourceItem[] = [];
    const rejectedSources: RejectedSourceItem[] = [];
    const seenDomains = new Set<string>();

    // If a specific target source is requested (e.g. CUCICBA test), evaluate exclusively that source
    if (options?.targetSourceId) {
      const specificSource = SourceCapabilityRegistry.getSource(options.targetSourceId);
      capableSources = specificSource ? [specificSource] : [];
    }

    for (const src of capableSources) {
      // TEST 19: Fail-closed capability - unverified capability or source cannot be called
      if (src.capability_status === 'UNVERIFIED' || src.verification_status === 'UNVERIFIED' || src.verification_status === 'DISCOVERED_UNVERIFIED') {
        rejectedSources.push({
          source_id: src.source_id,
          reason: 'CAPABILITY_UNVERIFIED: Source capability is unverified or untrusted; fail-closed enforcement.'
        });
        continue;
      }

      const strategy = SourceCapabilityRegistry.resolveRetrievalStrategy(src);

      // Invariant: Zero bypass for login or captcha
      if (strategy === 'BLOCKED') {
        rejectedSources.push({
          source_id: src.source_id,
          reason: `SOURCE_ACCESS_BLOCKED: ${src.verification_notes || 'Login required or public directory unavailable'}`
        });
        continue;
      }

      // Deduplication: Avoid multiple adapters calling the same underlying domain/source (Test 14)
      if (seenDomains.has(src.domain)) {
        rejectedSources.push({
          source_id: src.source_id,
          reason: `DUPLICATE_SOURCE_SUPPRESSED: Domain ${src.domain} already covered by another planned source`
        });
        continue;
      }

      // Score and rank source
      const hist = options?.history ? options.history[src.source_id] : undefined;
      const scoreResult = SourceCapabilityRegistry.computeSourceScore(src, intent, {
        history: hist,
        freshnessRequired
      });

      if (scoreResult.score > 0) {
        seenDomains.add(src.domain);
        plannedSources.push({
          source_id: src.source_id,
          source_name: src.source_name,
          strategy,
          score: scoreResult.score,
          reason_selected: scoreResult.reason_codes.why_selected.join('; ') || 'Capability match',
          is_authoritative: src.authority_level === 'PRIMARY_GOVERNMENT' || src.authority_level === 'OFFICIAL_REGISTRY' || src.authority_level === 'HEALTH_INSTITUTION',
          scoring_details: {
            authority_score: scoreResult.reason_codes.authority_score,
            freshness_score: scoreResult.reason_codes.freshness_score,
            geographic_fit_score: scoreResult.reason_codes.geographic_fit_score,
            previous_success_score: scoreResult.reason_codes.previous_success_score,
            latency_penalty: scoreResult.reason_codes.latency_penalty,
            failure_penalty: scoreResult.reason_codes.failure_penalty,
            stale_penalty: scoreResult.reason_codes.stale_penalty
          }
        });
      } else {
        rejectedSources.push({
          source_id: src.source_id,
          reason: scoreResult.reason_codes.why_rejected.join('; ') || 'Score below threshold'
        });
      }
    }

    // Sort planned sources by score descending (Authority prioritization - Test 15)
    plannedSources.sort((a, b) => b.score - a.score);

    // 3. Determine Decision Mode
    let decisionMode: RetrievalDecisionMode = 'LIVE_ONLY';

    if (localCount > 0 && freshnessRequired) {
      decisionMode = 'LOCAL_PLUS_LIVE';
      reasonCodes.push(`LOCAL_PLUS_LIVE: Found ${localCount} local records, but real-time freshness required; planning targeted live verification.`);
    } else if (plannedSources.length === 0) {
      if (rejectedSources.some(r => r.reason.includes('BLOCKED'))) {
        decisionMode = 'BLOCKED';
        reasonCodes.push('ACCESS_BLOCKED: Candidate sources require authentication or CAPTCHA; zero bypass enforced.');
      } else {
        decisionMode = 'INSUFFICIENT_CAPABILITY';
        reasonCodes.push('INSUFFICIENT_CAPABILITY: No capable, verified source supports this specific query criteria; fail-closed.');
      }
    } else {
      decisionMode = 'LIVE_ONLY';
      reasonCodes.push(`LIVE_ONLY: No local records; activating ${plannedSources.length} prioritized live source(s).`);
    }

    return {
      plan_id: planId,
      query: rawQuery,
      intent,
      decision_mode: decisionMode,
      local_evidence_found: localCount,
      local_evidence_sufficient: localSufficient,
      freshness_required: freshnessRequired,
      planned_sources: plannedSources,
      rejected_sources: rejectedSources,
      external_calls_planned: decisionMode === 'LOCAL_ONLY' || decisionMode === 'BLOCKED' || decisionMode === 'INSUFFICIENT_CAPABILITY' ? 0 : plannedSources.length,
      reason_codes: reasonCodes,
      created_at: new Date().toISOString()
    };
  }
}

