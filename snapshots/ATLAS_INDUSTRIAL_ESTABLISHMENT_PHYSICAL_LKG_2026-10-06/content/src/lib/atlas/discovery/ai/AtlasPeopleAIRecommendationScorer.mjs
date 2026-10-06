/**
 * src/lib/atlas/discovery/ai/AtlasPeopleAIRecommendationScorer.mjs
 * 
 * Atlas People AI Source Advisor — Deterministic Scoring Engine
 * 
 * PRINCIPLES:
 * - AI OUTPUT != FINAL SCORE
 * - The AI produces structured factors, reasoning, and interval predictions.
 * - The deterministic scorer computes reproducible scores.
 * - SEPARATE SCALES:
 *     1. EXPLORATION_SCORE: For unverified source hypotheses (Validation Portfolio).
 *     2. EXPLOITATION_SCORE: For verified sources (Machine-Ready Portfolio).
 * - HARD POLICY GATE: Restrictive policy forces Machine-Ready Score = 0 and execution_eligible = FALSE.
 */

import crypto from 'crypto';
import { POLICY_STATUSES, EVIDENCE_LABELS } from './AtlasPeopleAIRecommendationSchema.mjs';

export const SCORING_POLICY_VERSION = 'v1.0.0';

export class AtlasPeopleAIRecommendationScorer {
  /**
   * Computes the deterministic exploration score for unverified source hypotheses.
   * Focuses on: coverage gap severity, population orthogonality, expected analog yield,
   * identity signal strength, probability of machine access, and potential source authority.
   * 
   * Score range: [0, 1000]
   */
  static computeExplorationScore(rec) {
    // Factors:
    // 1. Coverage Gap Weight: 0 - 250
    let gapScore = 100;
    const domain = (rec.domain || '').toUpperCase();
    if (domain === 'HEALTH') gapScore = 250; // Critically under-covered
    else if (domain === 'LEGAL') gapScore = 220; // Under-covered
    else if (domain === 'GOVERNMENT' && rec.geography !== 'CABA') gapScore = 190;
    else if (domain === 'BUSINESS' && rec.geography !== 'CABA') gapScore = 170;
    else if (domain === 'CULTURE_CIVIC') gapScore = 160;
    else if (domain === 'ACADEMIA') gapScore = 50; // Saturated

    // 2. Geographic Orthogonality: 0 - 200
    let geoScore = 80;
    const geo = (rec.geography || '').toUpperCase();
    if (geo === 'PBA') geoScore = 200; // Top population reservoir
    else if (geo === 'CORDOBA' || geo === 'SANTA_FE') geoScore = 180;
    else if (geo === 'MENDOZA') geoScore = 160;
    else if (geo === 'AR_NATIONAL') geoScore = 120;
    else if (geo === 'CABA') geoScore = 40; // Heavily saturated

    // 3. Expected Net-New Yield (Base): 0 - 250
    const netNewBase = rec.expected_net_new_yield?.base ?? 0;
    const yieldScore = Math.min(250, Math.round(netNewBase * 250));

    // 4. Identity Signal Strength: 0 - 150
    let signalScore = 50;
    const signals = rec.identity_signal_expectation || [];
    if (signals.some(s => /dni|cuil|cuit/i.test(s))) signalScore += 80;
    if (signals.some(s => /matricula|license|id/i.test(s))) signalScore += 20;

    // 5. Machine Accessibility Potential: 0 - 150
    let accessScore = 50;
    const motor = rec.preferred_motor_template || '';
    if (motor === 'CSV_BULK_MOTOR' || motor === 'PARQUET_BULK_MOTOR') accessScore = 150;
    else if (motor === 'REST_API_MOTOR' || motor === 'JSON_DATASET_MOTOR') accessScore = 130;
    else if (motor === 'OAI_PMH_MOTOR' || motor === 'SPARQL_MOTOR') accessScore = 100;
    else if (motor === 'HTML_DIRECTORY_MOTOR') accessScore = 40;

    // Penalty for motor template gap
    if (rec.motor_template_gap) {
      accessScore = 0;
    }

    const totalScore = gapScore + geoScore + yieldScore + signalScore + accessScore;

    return {
      score_type: 'EXPLORATION_SCORE',
      score: totalScore,
      factors: {
        gap_weight: gapScore,
        geo_orthogonality: geoScore,
        expected_net_new_yield_factor: yieldScore,
        identity_signal_factor: signalScore,
        machine_access_factor: accessScore
      }
    };
  }

  /**
   * Computes the deterministic exploitation score for verified/candidate sources.
   * Focuses on: observed net-new yield, machine accessibility, policy status,
   * delivery rate, observed overlap, and 30m supply deliverability.
   * 
   * Score range: [0, 1000]
   */
  static computeExploitationScore(rec) {
    // HARD POLICY GATE
    if (rec.policy_status === POLICY_STATUSES.RESTRICTED || rec.policy_status === POLICY_STATUSES.REJECTED) {
      return {
        score_type: 'EXPLOITATION_SCORE',
        score: 0,
        factors: {
          policy_gate: 'BLOCKED_BY_POLICY',
          reason: 'POLICY_RESTRICTED_OR_REJECTED'
        }
      };
    }

    if (!rec.execution_eligible) {
      return {
        score_type: 'EXPLOITATION_SCORE',
        score: 0,
        factors: {
          eligibility_gate: 'NOT_EXECUTION_ELIGIBLE',
          reason: 'SOURCE_NOT_CANARY_READY'
        }
      };
    }

    // 1. Observed / Verified Net-New Yield (0 - 400)
    const netNewBase = rec.expected_net_new_yield?.base ?? 0;
    const yieldScore = Math.min(400, Math.round(netNewBase * 400));

    // 2. 30M Supply Deliverability (0 - 300)
    const supply30m = rec.expected_30m_supply?.base ?? 0;
    const supplyScore = Math.min(300, Math.round((supply30m / 5000) * 300));

    // 3. Low Overlap Bonus (0 - 200)
    const overlapBase = rec.expected_overlap?.base ?? 0;
    const overlapBonus = Math.max(0, Math.round((1.0 - overlapBase) * 200));

    // 4. Source Authority & Evidence Grade (0 - 100)
    let authScore = 50;
    if (rec.evidence_status === EVIDENCE_LABELS.CERTIFIED || rec.evidence_status === EVIDENCE_LABELS.OBSERVED) {
      authScore = 100;
    }

    const totalScore = yieldScore + supplyScore + overlapBonus + authScore;

    return {
      score_type: 'EXPLOITATION_SCORE',
      score: totalScore,
      factors: {
        verified_yield_factor: yieldScore,
        deliverability_factor: supplyScore,
        low_overlap_bonus: overlapBonus,
        evidence_authority_factor: authScore
      }
    };
  }

  /**
   * Applies deterministic scoring to a validated recommendation.
   */
  static scoreRecommendation(rec) {
    let scoreResult;
    if (rec.recommendation_type === 'VALIDATE_NEW_SOURCE') {
      scoreResult = this.computeExplorationScore(rec);
    } else {
      scoreResult = this.computeExploitationScore(rec);
    }

    rec.scoring_factors = scoreResult.factors;
    rec.deterministic_score = scoreResult.score;
    rec.score_version = SCORING_POLICY_VERSION;

    return rec;
  }
}

export function getScoringPolicySha256() {
  const code = AtlasPeopleAIRecommendationScorer.toString();
  return crypto.createHash('sha256').update(code).digest('hex');
}
