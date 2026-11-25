/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunityScorer.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityScorer.ts
 * 
 * Multi-dimensional Opportunity Scoring & Recency Decay Engine.
 * 
 * Strict Invariants:
 * - SEPARATION OF SCORE AND CONFIDENCE:
 *   Score (0.00 - 1.00): Commercial momentum, intensity, and breadth of activity.
 *   Confidence (0.00 - 1.00): Physical evidence certainty and multi-source corroboration.
 * - RECENCY DECAY:
 *   Configurable half-life per signal type (e.g. Job postings decay faster than Company incorporation).
 * - MULTI-SOURCE CORROBORATION:
 *   Multiple independent sources confirming signals increases confidence without creating duplicate opportunities.
 */

import type { OpportunitySignal, OpportunitySignalType } from './AtlasOpportunitySignal.ts';

export interface SignalDecayConfig {
  halfLifeDays: number;
}

export const DEFAULT_SIGNAL_DECAY_CONFIG: Record<OpportunitySignalType, SignalDecayConfig> = {
  JOB_POSTING_APPEARED: { halfLifeDays: 30 },
  PUBLIC_TENDER_APPEARED: { halfLifeDays: 45 },
  PUBLIC_CONTRACT_APPEARED: { halfLifeDays: 90 },
  ADDRESS_CHANGED: { halfLifeDays: 90 },
  ORGANIZATION_CHANGED: { halfLifeDays: 90 },
  NEW_ROLE: { halfLifeDays: 90 },
  NEW_BRANCH: { halfLifeDays: 120 },
  CONTACT_APPEARED: { halfLifeDays: 120 },
  ACTIVITY_APPEARED: { halfLifeDays: 120 },
  COMPANY_OPENED: { halfLifeDays: 180 },
  NEW_LICENSE: { halfLifeDays: 180 },
  NEW_REGISTRATION: { halfLifeDays: 180 }
};

export interface ScoringContext {
  signals: OpportunitySignal[];
  hasVerifiedContact: boolean;
  referenceDate?: string;
  customDecayConfig?: Partial<Record<OpportunitySignalType, SignalDecayConfig>>;
}

export interface ScoreEvaluationResult {
  score: number;
  confidence: number;
  decayedSignalWeights: Map<string, number>;
  distinctSourcesCount: number;
  distinctSignalTypesCount: number;
}

export class AtlasOpportunityScorer {
  /**
   * Calculates exponential time decay factor: 2^(-deltaDays / halfLifeDays).
   */
  public static calculateRecencyDecay(
    timeAnchor: string,
    signalType: OpportunitySignalType,
    referenceDate: string = new Date().toISOString(),
    customDecayConfig?: Partial<Record<OpportunitySignalType, SignalDecayConfig>>
  ): number {
    const refTime = new Date(referenceDate).getTime();
    const anchorTime = new Date(timeAnchor).getTime();
    const deltaDays = Math.max(0, (refTime - anchorTime) / (1000 * 60 * 60 * 24));

    const config = customDecayConfig?.[signalType] || DEFAULT_SIGNAL_DECAY_CONFIG[signalType] || { halfLifeDays: 60 };
    const decay = Math.pow(2, -deltaDays / config.halfLifeDays);
    return Math.max(0.05, Math.min(1.0, decay)); // Clamp between 0.05 and 1.00
  }

  /**
   * Evaluates Score and Confidence independently.
   */
  public static evaluateScore(context: ScoringContext): ScoreEvaluationResult {
    const { signals, hasVerifiedContact, referenceDate = new Date().toISOString(), customDecayConfig } = context;

    if (signals.length === 0) {
      return {
        score: 0.0,
        confidence: 0.0,
        decayedSignalWeights: new Map(),
        distinctSourcesCount: 0,
        distinctSignalTypesCount: 0
      };
    }

    const decayedWeights = new Map<string, number>();
    const distinctSources = new Set<string>();
    const distinctTypes = new Set<string>();
    let weightedScoreSum = 0;
    let baseConfidenceSum = 0;

    for (const sig of signals) {
      distinctSources.add(sig.source_id);
      distinctTypes.add(sig.signal_type);

      const decayFactor = AtlasOpportunityScorer.calculateRecencyDecay(
        sig.time_anchor,
        sig.signal_type,
        referenceDate,
        customDecayConfig
      );

      // Base weight: signal quality * decayFactor
      const effectiveWeight = sig.quality_score * decayFactor;
      decayedWeights.set(sig.signal_id, effectiveWeight);

      weightedScoreSum += effectiveWeight;
      baseConfidenceSum += sig.quality_score;
    }

    // 1. Calculate Score (Commercial momentum / Breadth)
    // Non-linear combination: more independent signal types yield higher momentum
    const diversityMultiplier = Math.min(1.5, 1.0 + (distinctTypes.size - 1) * 0.15);
    const contactBonus = hasVerifiedContact ? 0.10 : 0.0;
    
    // Scale normalized score:
    // Base score approaches 1.0 asymptotically with number of quality decayed signals
    const rawScore = (1 - Math.exp(-weightedScoreSum * 0.7)) * diversityMultiplier + contactBonus;
    const score = Math.round(Math.min(1.0, Math.max(0.1, rawScore)) * 100) / 100;

    // 2. Calculate Confidence (Evidence corroboration & physical robustness)
    const avgSourceQuality = baseConfidenceSum / signals.length;
    // Multi-source bonus: each additional independent source increases certainty
    const multiSourceBonus = distinctSources.size > 1 ? Math.min(0.30, (distinctSources.size - 1) * 0.15) : 0.0;
    const rawConfidence = avgSourceQuality * 0.7 + multiSourceBonus;
    const confidence = Math.round(Math.min(1.0, Math.max(0.2, rawConfidence)) * 100) / 100;

    return {
      score,
      confidence,
      decayedSignalWeights: decayedWeights,
      distinctSourcesCount: distinctSources.size,
      distinctSignalTypesCount: distinctTypes.size
    };
  }

  /**
   * Checks whether the signals list contains any true commercial opportunity signal.
   * Requirement 9: Sólo calcular Opportunity Score si existe al menos una señal comercial válida:
   * REAL_TRANSITION, EXPLICIT_HISTORICAL_EVENT, HIRING_SIGNAL, PROCUREMENT_SIGNAL,
   * EXPANSION_SIGNAL, NEW_BUSINESS_SIGNAL, NEW_MARKET_SIGNAL u otra señal comercial definida.
   * CONTACT_APPEARED por sí solo NO crea Opportunity Score.
   */
  public static hasCommercialSignals(signals: OpportunitySignal[]): boolean {
    const commercialTypes: OpportunitySignalType[] = [
      'COMPANY_OPENED',
      'NEW_REGISTRATION',
      'NEW_LICENSE',
      'ADDRESS_CHANGED',
      'ORGANIZATION_CHANGED',
      'NEW_ROLE',
      'NEW_BRANCH',
      'JOB_POSTING_APPEARED',
      'PUBLIC_TENDER_APPEARED',
      'PUBLIC_CONTRACT_APPEARED'
    ];

    return signals.some(s => {
      // Must be a commercial type
      if (!commercialTypes.includes(s.signal_type)) return false;
      // If address or activity, it must have real transition or explicit historical event (not just first observed)
      if (['ADDRESS_CHANGED', 'ORGANIZATION_CHANGED'].includes(s.signal_type)) {
        return s.temporal_semantics === 'REAL_TRANSITION' || s.temporal_semantics === 'EXPLICIT_HISTORICAL_EVENT';
      }
      return true;
    });
  }

  /**
   * Evaluates contact channels breakdown from contact signals.
   */
  public static extractContactChannelsBreakdown(signals: OpportunitySignal[]) {
    const contactSignals = signals.filter(s => s.signal_type === 'CONTACT_APPEARED');
    let emailCount = 0;
    let phoneCount = 0;
    let linkedinCount = 0;
    let instagramCount = 0;
    let facebookCount = 0;
    let otherCount = 0;

    for (const sig of contactSignals) {
      const val = (sig.payload?.value || sig.assertion_id || '').toLowerCase();
      const channel = (sig.payload?.channel || '').toLowerCase();

      if (channel.includes('email') || val.includes('@') || sig.assertion_id?.includes('HAS_EMAIL')) {
        emailCount++;
      } else if (channel.includes('phone') || val.includes('tel') || val.match(/\+?\d{8,}/) || sig.assertion_id?.includes('HAS_PHONE')) {
        phoneCount++;
      } else if (channel.includes('linkedin') || val.includes('linkedin') || sig.assertion_id?.includes('LINKEDIN')) {
        linkedinCount++;
      } else if (channel.includes('instagram') || val.includes('instagram') || sig.assertion_id?.includes('INSTAGRAM')) {
        instagramCount++;
      } else if (channel.includes('facebook') || val.includes('facebook') || sig.assertion_id?.includes('FACEBOOK')) {
        facebookCount++;
      } else {
        otherCount++;
      }
    }

    const totalChannels = emailCount + phoneCount + linkedinCount + instagramCount + facebookCount + otherCount;
    const distinctSources = Array.from(new Set(contactSignals.map(s => s.source_id).filter(Boolean)));

    return {
      emailCount,
      phoneCount,
      linkedinCount,
      instagramCount,
      facebookCount,
      otherCount,
      totalChannels,
      distinctSources,
      distinctSourceCount: distinctSources.length,
      isMultisource: distinctSources.length >= 2
    };
  }

  /**
   * Calculates independent CONTACTABILITY_SCORE (0.00 - 1.00).
   * Requirement 3: Calcular independientemente considerando cantidad de canales,
   * calidad de evidencia, vigencia y diversidad de tipo de canal.
   */
  public static calculateContactabilityScore(signals: OpportunitySignal[]): number {
    const breakdown = this.extractContactChannelsBreakdown(signals);
    if (breakdown.totalChannels === 0) return 0.0;

    const contactSignals = signals.filter(s => s.signal_type === 'CONTACT_APPEARED');

    // Channel scoring with diminishing returns
    const emailScore = breakdown.emailCount > 0 ? Math.min(0.50, 0.30 + (breakdown.emailCount - 1) * 0.10) : 0;
    const phoneScore = breakdown.phoneCount > 0 ? Math.min(0.35, 0.25 + (breakdown.phoneCount - 1) * 0.10) : 0;
    const linkedinScore = breakdown.linkedinCount > 0 ? Math.min(0.25, 0.20 + (breakdown.linkedinCount - 1) * 0.05) : 0;
    const socialScore = (breakdown.instagramCount + breakdown.facebookCount + breakdown.otherCount) > 0 ? 0.15 : 0;

    // Channel diversity multiplier
    const channelTypesCount = [
      breakdown.emailCount > 0,
      breakdown.phoneCount > 0,
      breakdown.linkedinCount > 0,
      (breakdown.instagramCount + breakdown.facebookCount + breakdown.otherCount) > 0
    ].filter(Boolean).length;
    const diversityMultiplier = channelTypesCount > 1 ? (1.0 + (channelTypesCount - 1) * 0.15) : 1.0;

    // Quality and recency decay average
    let qualityDecaySum = 0;
    for (const s of contactSignals) {
      const decay = this.calculateRecencyDecay(s.time_anchor, s.signal_type);
      qualityDecaySum += (s.quality_score || 0.9) * decay;
    }
    const avgQualityDecay = qualityDecaySum / contactSignals.length;

    const rawScore = (emailScore + phoneScore + linkedinScore + socialScore) * diversityMultiplier * avgQualityDecay;
    return Math.round(Math.min(1.0, Math.max(0.1, rawScore)) * 100) / 100;
  }

  /**
   * Calculates independent Confidence Score for Contactability.
   * Requirement 6 & 7: Múltiples contactos de la misma fuente NO aumentan confianza multifuente.
   * Tres emails de una misma fuente NO equivalen a tres fuentes independientes.
   * CONFIDENCE_SCORE mide robustez de evidencia, no cantidad bruta de contactos.
   */
  public static calculateContactabilityConfidence(signals: OpportunitySignal[]): number {
    const breakdown = this.extractContactChannelsBreakdown(signals);
    if (breakdown.totalChannels === 0) return 0.0;

    const contactSignals = signals.filter(s => s.signal_type === 'CONTACT_APPEARED');
    const avgQuality = contactSignals.reduce((acc, s) => acc + (s.quality_score || 0.8), 0) / contactSignals.length;

    // Base confidence from physical source quality
    const baseConfidence = avgQuality * 0.65;

    // Multi-source bonus ONLY if distinct physical sources >= 2
    const multiSourceBonus = breakdown.distinctSourceCount >= 2
      ? Math.min(0.25, (breakdown.distinctSourceCount - 1) * 0.12)
      : 0.0;

    const rawConfidence = baseConfidence + multiSourceBonus;
    return Math.round(Math.min(1.0, Math.max(0.2, rawConfidence)) * 100) / 100;
  }
}
