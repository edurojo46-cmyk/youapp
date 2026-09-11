import {
  GroundedAnswer,
  GroundedClaim,
  StructuredQueryPlan,
  EntitySummaryItem,
  ProvenanceChainItem,
  AnswerState,
  EvidenceSourceItem
} from './types';

export class AtlasAnswerSynthesizer {
  /**
   * Synthesizes a grounded answer from ranked claims and entities.
   */
  public static synthesize(
    query: string,
    plan: StructuredQueryPlan,
    claims: GroundedClaim[],
    entities: EntitySummaryItem[],
    provenance: ProvenanceChainItem[],
    contradictions?: any[]
  ): GroundedAnswer {
    let userConfirmedFactsCount = 0;
    let factsCount = 0;
    let inferencesCount = 0;
    let claimsCount = 0;
    let predictionsCount = 0;
    let rawObservationsCount = 0;
    let contradictedCount = 0;

    const citations: EvidenceSourceItem[] = [];

    for (const c of claims) {
      switch (c.epistemic_status) {
        case 'USER_CONFIRMED_FACT':
          userConfirmedFactsCount++;
          break;
        case 'FACT':
          factsCount++;
          break;
        case 'INFERRED':
          inferencesCount++;
          break;
        case 'CLAIM':
          claimsCount++;
          break;
        case 'PREDICTION':
          predictionsCount++;
          break;
        case 'RAW_OBSERVATION':
          rawObservationsCount++;
          break;
      }

      if (c.contradiction_info?.is_disputed) contradictedCount++;

      if (c.evidence_sources) {
        for (const ev of c.evidence_sources) {
          citations.push(ev);
        }
      }
    }

    if (contradictions && contradictions.length > 0) {
      contradictedCount = Math.max(contradictedCount, contradictions.length);
    }

    let answerState: AnswerState = 'ANSWERABLE';
    let summary = '';
    let explanation = '';

    if (entities.length === 0 && claims.length === 0) {
      answerState = 'NO_DATA_FOUND';
      summary = `No verified entities or knowledge found in Atlas for "${query}".`;
      explanation = 'Atlas evaluated entity registries and semantic knowledge layers within tenant boundaries and found no matching records.';
    } else if (entities.length > 1 && claims.length === 0) {
      answerState = 'AMBIGUOUS_ENTITY';
      const entityNames = entities.map(e => `"${e.canonical_name}" [${e.entity_type}]`).join(', ');
      summary = `Ambiguous Entity Query: Found multiple matching canonical entities: ${entityNames}. Please specify the intended entity.`;
      explanation = `Atlas identified ${entities.length} distinct canonical entities matching the query term.`;
    } else if (claims.length === 0) {
      answerState = 'INSUFFICIENT_KNOWLEDGE';
      const entityNames = entities.map(e => `"${e.canonical_name}" [${e.entity_type}]`).join(', ');
      summary = `Atlas identifies ${entityNames}, but currently possesses insufficient semantic facts or relationships to fully answer "${query}".`;
      explanation = 'Canonical entity records exist, but no active facts or relationships match the requested predicates.';
    } else if (contradictedCount > 0) {
      answerState = 'CONTRADICTED';
      const claimBullets = claims.map(c => `• [${c.epistemic_status}] ${c.statement}`).join('\n');
      summary = `Contradiction Notice: Atlas found competing or conflicting assertions for this query:\n${claimBullets}`;
      explanation = 'Multiple contradictory observations exist across sources and require resolution or human confirmation.';
    } else {
      answerState = 'ANSWERABLE';
      const claimBullets = claims.map(c => `• [${c.epistemic_status}] ${c.statement}`).join('\n');
      summary = claimBullets;
      explanation = `Answer derived deterministically from ${claims.length} grounded claims across ${entities.length} canonical entities.`;
    }

    return {
      query,
      plan,
      summary,
      answer_state: answerState,
      grounded_claims: claims,
      entities_involved: entities,
      citations,
      epistemic_breakdown: {
        user_confirmed_facts_count: userConfirmedFactsCount,
        facts_count: factsCount,
        inferences_count: inferencesCount,
        claims_count: claimsCount,
        predictions_count: predictionsCount,
        raw_observations_count: rawObservationsCount,
        contradicted_count: contradictedCount
      },
      provenance_chain: provenance,
      explanation,
      executed_at: new Date().toISOString()
    };
  }
}
