import type { QueryIntent } from './UniversalQueryModel';
import type { HybridRetrievalPlan, RetrievalDecisionMode } from './QueryPlanner';

function computeSnapshotHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'snap_' + Math.abs(hash).toString(16).padStart(8, '0');
}

export interface QueryMemoryRecord {
  query_id: string;
  normalized_query: string;
  query_intent: QueryIntent;
  entities_requested: string[];
  retrieval_plan_id: string;
  decision_mode: RetrievalDecisionMode;
  sources_selected: string[];
  sources_succeeded: string[];
  sources_failed: string[];
  latency_ms: number;
  evidence_count: number;
  answer_confidence: number;
  timestamp: string;
}

export interface DecisionMemoryRecord {
  decision_id: string;
  query_id: string;
  decision_type: RetrievalDecisionMode;
  candidate_sources: string[];
  selected_sources: string[];
  rejected_sources: string[];
  reason_codes: {
    why_selected: string[];
    why_rejected: string[];
    authority_score?: number;
    freshness_score?: number;
    geographic_fit_score?: number;
    previous_success_score?: number;
    latency_penalty?: number;
    failure_penalty?: number;
    stale_penalty?: number;
  };
  freshness_requirement: boolean;
  authority_requirement: string;
  evidence_snapshot_hash: string;
  result: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'BLOCKED' | 'INSUFFICIENT';
  created_at: string;
}

export class AtlasQueryDecisionMemory {
  private static queryMemory: QueryMemoryRecord[] = [];
  private static decisionMemory: DecisionMemoryRecord[] = [];
  private static maxRecords: number = 1000;

  /**
   * Sanitizes input to ensure zero unnecessary PII is stored
   */
  public static sanitizeQuery(query: string): string {
    return query
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/\b\d{8,11}\b/g, '[REDACTED_NUMBER]')
      .trim();
  }

  public static recordQuery(params: {
    query: string;
    intent: QueryIntent;
    plan: HybridRetrievalPlan;
    sourcesSucceeded?: string[];
    sourcesFailed?: string[];
    latencyMs: number;
    evidenceCount: number;
    answerConfidence: number;
  }): QueryMemoryRecord {
    const queryId = `qry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entities = [
      params.intent.person_name,
      params.intent.organization,
      params.intent.profession
    ].filter(Boolean) as string[];

    const record: QueryMemoryRecord = {
      query_id: queryId,
      normalized_query: this.sanitizeQuery(params.query),
      query_intent: params.intent,
      entities_requested: entities,
      retrieval_plan_id: params.plan.plan_id,
      decision_mode: params.plan.decision_mode,
      sources_selected: params.plan.planned_sources.map(s => s.source_id),
      sources_succeeded: params.sourcesSucceeded || params.plan.planned_sources.map(s => s.source_id),
      sources_failed: params.sourcesFailed || [],
      latency_ms: params.latencyMs,
      evidence_count: params.evidenceCount,
      answer_confidence: params.answerConfidence,
      timestamp: new Date().toISOString()
    };

    this.queryMemory.unshift(record);
    if (this.queryMemory.length > this.maxRecords) {
      this.queryMemory.pop();
    }

    return record;
  }

  public static recordDecision(params: {
    queryId: string;
    plan: HybridRetrievalPlan;
    evidenceSnapshot?: any[];
    result?: DecisionMemoryRecord['result'];
  }): DecisionMemoryRecord {
    const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const snapshotString = JSON.stringify(params.evidenceSnapshot || []);
    const hash = computeSnapshotHash(snapshotString);

    const whySelected: string[] = [];
    for (const p of params.plan.planned_sources) {
      whySelected.push(`${p.source_id}: ${p.reason_selected} (Score: ${p.score})`);
    }

    const whyRejected: string[] = [];
    for (const r of params.plan.rejected_sources) {
      whyRejected.push(`${r.source_id}: ${r.reason}`);
    }

    const topPlanned = params.plan.planned_sources[0];
    const scoring = topPlanned?.scoring_details;

    const record: DecisionMemoryRecord = {
      decision_id: decisionId,
      query_id: params.queryId,
      decision_type: params.plan.decision_mode,
      candidate_sources: [...params.plan.planned_sources.map(s => s.source_id), ...params.plan.rejected_sources.map(r => r.source_id)],
      selected_sources: params.plan.planned_sources.map(s => s.source_id),
      rejected_sources: params.plan.rejected_sources.map(r => r.source_id),
      reason_codes: {
        why_selected: whySelected,
        why_rejected: whyRejected,
        authority_score: scoring?.authority_score ?? (params.plan.decision_mode === 'LOCAL_ONLY' ? 30 : 15),
        freshness_score: scoring?.freshness_score ?? (params.plan.freshness_required ? 20 : 15),
        geographic_fit_score: scoring?.geographic_fit_score ?? 25,
        previous_success_score: scoring?.previous_success_score ?? 15,
        latency_penalty: scoring?.latency_penalty ?? 0,
        failure_penalty: scoring?.failure_penalty ?? 0,
        stale_penalty: scoring?.stale_penalty ?? 0
      },
      freshness_requirement: params.plan.freshness_required,
      authority_requirement: params.plan.planned_sources.some(s => s.is_authoritative) ? 'HIGH' : 'STANDARD',
      evidence_snapshot_hash: hash,
      result: params.result || (params.plan.decision_mode === 'BLOCKED' ? 'BLOCKED' : params.plan.decision_mode === 'INSUFFICIENT_CAPABILITY' ? 'INSUFFICIENT' : 'SUCCESS'),
      created_at: new Date().toISOString()
    };

    this.decisionMemory.unshift(record);
    if (this.decisionMemory.length > this.maxRecords) {
      this.decisionMemory.pop();
    }

    return record;
  }

  public static getQueryMemory(): QueryMemoryRecord[] {
    return [...this.queryMemory];
  }

  public static getDecisionMemory(): DecisionMemoryRecord[] {
    return [...this.decisionMemory];
  }

  public static getDecisionsForQuery(queryId: string): DecisionMemoryRecord[] {
    return this.decisionMemory.filter(d => d.query_id === queryId);
  }

  public static getAuditExplanation(decisionId: string): string {
    const d = this.decisionMemory.find(item => item.decision_id === decisionId);
    if (!d) return `Decision ${decisionId} not found.`;

    const totalPenalties = (d.reason_codes.latency_penalty ?? 0) + (d.reason_codes.failure_penalty ?? 0) + (d.reason_codes.stale_penalty ?? 0);

    return `
[DECISION AUDIT ${d.decision_id}]
DECISION_MODE: ${d.decision_type}
RESULT: ${d.result}
FRESHNESS_REQUIRED: ${d.freshness_requirement ? 'YES' : 'NO'}
AUTHORITY_REQUIRED: ${d.authority_requirement}
SELECTED_SOURCES: ${d.selected_sources.join(', ') || 'NONE'}
WHY_SELECTED:
${d.reason_codes.why_selected.map(w => '  + ' + w).join('\n') || '  (None)'}
WHY_REJECTED:
${d.reason_codes.why_rejected.map(w => '  - ' + w).join('\n') || '  (None)'}
AUTHORITY: ${d.reason_codes.authority_score ?? 0}/30
FRESHNESS: ${d.reason_codes.freshness_score ?? 0}/20
GEOGRAPHIC_FIT: ${d.reason_codes.geographic_fit_score ?? 0}/25
PREVIOUS_SUCCESS: ${d.reason_codes.previous_success_score ?? 0}/25
FAILURE/LATENCY PENALTIES: -${totalPenalties}
EVIDENCE_HASH: ${d.evidence_snapshot_hash}
TIMESTAMP: ${d.created_at}
    `.trim();
  }

  public static clear(): void {
    this.queryMemory = [];
    this.decisionMemory = [];
  }
}
