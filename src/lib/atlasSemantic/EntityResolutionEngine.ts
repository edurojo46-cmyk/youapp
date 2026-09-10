/**
 * Atlas Semantic Intelligence — Entity Resolution Engine V1
 * Multi-signal rule-based resolution engine with strong identity, supporting signals,
 * hard conflict detection, and machine-readable explainability.
 */

import { EntityNormalizationEngine } from './EntityNormalizationEngine';
import type {
  EntityCandidate,
  ResolutionExplanation,
  ResolutionThresholds,
  ResolutionDecision,
  SignalBreakdown,
  ConflictBreakdown
} from './types';

export class EntityResolutionEngine {
  public static readonly DEFAULT_THRESHOLDS: ResolutionThresholds = {
    auto_match_threshold: 0.90,
    review_required_threshold: 0.65
  };

  /**
   * Evaluates a candidate against an existing canonical entity (or another candidate)
   * and produces a fully explainable, deterministic resolution decision.
   */
  public static evaluateCandidateMatch(
    candidate: EntityCandidate,
    target: {
      canonical_entity_id?: string;
      canonical_name: string;
      entity_type: EntityCandidate['entity_type'];
      primary_domain?: string;
      email_hash?: string;
      phone_hash?: string;
      external_ids?: Record<string, string>;
      location?: any;
      company_context?: string;
    },
    customThresholds?: Partial<ResolutionThresholds>
  ): ResolutionExplanation {
    const thresholds: ResolutionThresholds = {
      ...this.DEFAULT_THRESHOLDS,
      ...customThresholds
    };

    const signals: SignalBreakdown[] = [];
    const conflicts: ConflictBreakdown[] = [];

    // 1. Check Entity Type compatibility
    if (candidate.entity_type !== target.entity_type) {
      conflicts.push({
        conflict_name: 'ENTITY_TYPE_MISMATCH',
        penalty: 1.0,
        reason: `Candidate type ${candidate.entity_type} does not match target type ${target.entity_type}`
      });

      return {
        candidate_source: candidate.source_name,
        candidate_record_id: candidate.source_record_id,
        candidate_entity_key: candidate.source_entity_key,
        target_canonical_id: target.canonical_entity_id,
        target_canonical_name: target.canonical_name,
        match_confidence: 0.0,
        decision: 'NO_MATCH',
        strong_identity_matched: false,
        hard_conflict_detected: true,
        signals,
        conflicts,
        thresholds,
        evaluated_at: new Date().toISOString()
      };
    }

    const candNormalizedName = EntityNormalizationEngine.normalizeName(candidate.raw_name, candidate.entity_type);
    const targetNormalizedName = EntityNormalizationEngine.normalizeName(target.canonical_name, target.entity_type);

    const candDomain = EntityNormalizationEngine.normalizeDomain(candidate.domain);
    const targetDomain = EntityNormalizationEngine.normalizeDomain(target.primary_domain || (target as any).metadata?.primary_domain);

    const targetExternalIds = target.external_ids || (target as any).metadata?.external_ids;
    const targetEmailHash = target.email_hash || (target as any).metadata?.email_hash;
    const targetPhoneHash = target.phone_hash || (target as any).metadata?.phone_hash;
    const targetLocation = target.location || (target as any).metadata?.location;
    const targetCompanyContext = target.company_context || (target as any).metadata?.company_context;

    let strongIdentityMatched = false;
    let hardConflictDetected = false;

    // ========================================================================
    // 2. STRONG IDENTITY SIGNALS & HARD CONFLICTS
    // ========================================================================

    // A. External IDs (e.g. CUIT, LinkedIn slug, Crunchbase ID)
    if (candidate.external_ids && targetExternalIds) {
      for (const [key, candVal] of Object.entries(candidate.external_ids)) {
        const targetVal = targetExternalIds[key];
        if (candVal && targetVal) {
          const normCandVal = EntityNormalizationEngine.cleanText(candVal);
          const normTargetVal = EntityNormalizationEngine.cleanText(targetVal);

          if (normCandVal === normTargetVal) {
            strongIdentityMatched = true;
            signals.push({
              signal_name: `EXTERNAL_ID_EXACT_${key.toUpperCase()}`,
              strength: 'STRONG_IDENTITY',
              weight: 0.60,
              score: 1.0,
              contribution: 0.60,
              reason: `Exact match on external identifier '${key}'`
            });
          } else {
            // Authoritative namespace conflict is a true HARD CONFLICT (mutually exclusive identity)
            hardConflictDetected = true;
            conflicts.push({
              conflict_name: `SAME_AUTHORITATIVE_NAMESPACE_EXTERNAL_ID_CONFLICT_${key.toUpperCase()}`,
              penalty: 0.85,
              reason: `Conflicting authoritative external identifier '${key}' ('${normCandVal}' vs '${normTargetVal}')`
            });
          }
        }
      }
    }

    // B. Verified Domain (for COMPANY / ORGANIZATION)
    if (candidate.entity_type === 'COMPANY' || candidate.entity_type === 'ORGANIZATION') {
      if (candDomain && targetDomain) {
        if (candDomain === targetDomain) {
          strongIdentityMatched = true;
          signals.push({
            signal_name: 'VERIFIED_DOMAIN_EXACT',
            strength: 'STRONG_IDENTITY',
            weight: 0.60,
            score: 1.0,
            contribution: 0.60,
            reason: `Exact match on primary domain '${candDomain}'`
          });
        } else {
          // Different domains do NOT prove distinct organizations (companies can own multiple domains).
          // Treated as supporting non-match signal, NOT a hard conflict.
          conflicts.push({
            conflict_name: 'DOMAIN_DIVERGENCE',
            penalty: 0.20,
            reason: `Different primary domains observed ('${candDomain}' vs '${targetDomain}')`
          });
        }
      }
    }

    // C. Email Hash (for PERSON)
    if (candidate.entity_type === 'PERSON') {
      if (candidate.email_hash && targetEmailHash) {
        if (candidate.email_hash === targetEmailHash) {
          strongIdentityMatched = true;
          signals.push({
            signal_name: 'EMAIL_HASH_EXACT',
            strength: 'STRONG_IDENTITY',
            weight: 0.70,
            score: 1.0,
            contribution: 0.70,
            matched_value_hash: candidate.email_hash,
            reason: 'Exact match on canonical email hash'
          });
        } else {
          // Different email hashes do NOT prove different persons (persons can have multiple emails).
          // Absence of positive match signal with modest divergence penalty, NOT a hard conflict.
          conflicts.push({
            conflict_name: 'EMAIL_HASH_DIVERGENCE',
            penalty: 0.15,
            reason: 'Different primary email hashes observed (person may have multiple addresses)'
          });
        }
      }

      // D. Phone Hash (for PERSON)
      if (candidate.phone_hash && targetPhoneHash) {
        if (candidate.phone_hash === targetPhoneHash) {
          strongIdentityMatched = true;
          signals.push({
            signal_name: 'PHONE_HASH_EXACT',
            strength: 'STRONG_IDENTITY',
            weight: 0.60,
            score: 1.0,
            contribution: 0.60,
            matched_value_hash: candidate.phone_hash,
            reason: 'Exact match on canonical phone hash'
          });
        } else {
          conflicts.push({
            conflict_name: 'PHONE_HASH_DIVERGENCE',
            penalty: 0.15,
            reason: 'Different phone hashes observed (person may have multiple numbers)'
          });
        }
      }
    }

    // ========================================================================
    // 3. SUPPORTING SIGNALS
    // ========================================================================

    // A. Name Exact or Similarity
    if (candNormalizedName && targetNormalizedName) {
      if (candNormalizedName === targetNormalizedName) {
        signals.push({
          signal_name: 'NAME_EXACT',
          strength: 'SUPPORTING',
          weight: 0.50,
          score: 1.0,
          contribution: 0.50,
          reason: `Exact match on normalized name '${candNormalizedName}'`
        });
      } else {
        const similarity = EntityNormalizationEngine.calculateSimilarity(candNormalizedName, targetNormalizedName);
        const candTokens = candNormalizedName.split(' ');
        const targetTokens = targetNormalizedName.split(' ');
        const isSubstringOrTokenSubset =
          candNormalizedName.includes(targetNormalizedName) ||
          targetNormalizedName.includes(candNormalizedName) ||
          candTokens.some(t => targetTokens.includes(t) && t.length >= 4);

        if (similarity >= 0.85) {
          signals.push({
            signal_name: 'NAME_HIGH_SIMILARITY',
            strength: 'SUPPORTING',
            weight: 0.55,
            score: similarity,
            contribution: +(0.55 * similarity).toFixed(3),
            reason: `High name similarity (${(similarity * 100).toFixed(1)}%) between '${candNormalizedName}' and '${targetNormalizedName}'`
          });
        } else if (isSubstringOrTokenSubset) {
          signals.push({
            signal_name: 'NAME_TOKEN_SUBSET_MATCH',
            strength: 'SUPPORTING',
            weight: 0.50,
            score: 1.0,
            contribution: 0.50,
            reason: `Shared distinct token between '${candNormalizedName}' and '${targetNormalizedName}'`
          });
        } else if (similarity < 0.45) {
          conflicts.push({
            conflict_name: 'NAME_DIVERGENCE',
            penalty: 0.30,
            reason: `Low name similarity (${(similarity * 100).toFixed(1)}%)`
          });
        }
      }
    }

    // B. Location Match
    const candLoc = EntityNormalizationEngine.normalizeLocation(candidate.location);
    const targetLoc = EntityNormalizationEngine.normalizeLocation(targetLocation);

    if (candLoc && targetLoc) {
      if (candLoc.normalized_label && candLoc.normalized_label === targetLoc.normalized_label) {
        signals.push({
          signal_name: 'LOCATION_EXACT_MATCH',
          strength: 'SUPPORTING',
          weight: 0.20,
          score: 1.0,
          contribution: 0.20,
          reason: `Exact match on hierarchical location label '${candLoc.normalized_label}'`
        });
      } else if (candLoc.country && candLoc.country === targetLoc.country) {
        signals.push({
          signal_name: 'COUNTRY_MATCH',
          strength: 'SUPPORTING',
          weight: 0.10,
          score: 1.0,
          contribution: 0.10,
          reason: `Match on country code '${candLoc.country}'`
        });
      }
    }

    // C. Company Context Match (for Person)
    if (candidate.entity_type === 'PERSON') {
      const candCompany = EntityNormalizationEngine.cleanText(candidate.company_context || '');
      const targetCompany = EntityNormalizationEngine.cleanText(targetCompanyContext || '');

      if (candCompany && targetCompany) {
        if (candCompany === targetCompany) {
          signals.push({
            signal_name: 'COMPANY_CONTEXT_MATCH',
            strength: 'SUPPORTING',
            weight: 0.25,
            score: 1.0,
            contribution: 0.25,
            reason: `Both persons work at same company context '${candCompany}'`
          });
        } else {
          conflicts.push({
            conflict_name: 'COMPANY_CONTEXT_CONFLICT',
            penalty: 0.25,
            reason: `Different company contexts ('${candCompany}' vs '${targetCompany}')`
          });
        }
      }
    }

    // ========================================================================
    // 4. RULE-BASED CONFIDENCE & DECISION POLICY
    // ========================================================================

    const totalPositiveContribution = signals.reduce((acc, s) => acc + s.contribution, 0);
    const totalPenalty = conflicts.reduce((acc, c) => acc + c.penalty, 0);

    let rawScore = Math.max(0.0, totalPositiveContribution - totalPenalty);

    // Apply source confidence weighting if provided
    const sourceConf = candidate.source_confidence !== undefined ? candidate.source_confidence : 1.0;
    rawScore = rawScore * sourceConf;

    // Rule A: Verified Strong Identity exact match + NO hard conflict => AUTO_MATCH (force high confidence >= 0.95)
    if (strongIdentityMatched && !hardConflictDetected && conflicts.length === 0) {
      rawScore = Math.max(0.95, Math.min(1.0, rawScore + 0.35));
    }

    // Rule C: Name similarity ALONE without any strong identity or supporting context => NEVER AUTO_MATCH
    const onlyNameSignal = signals.length === 1 && (signals[0].signal_name === 'NAME_EXACT' || signals[0].signal_name === 'NAME_HIGH_SIMILARITY' || signals[0].signal_name === 'NAME_TOKEN_SUBSET_MATCH');
    if (onlyNameSignal && !strongIdentityMatched) {
      // Cap at 0.70 (REVIEW_REQUIRED or NO_MATCH), never AUTO_MATCH
      rawScore = Math.min(0.70, rawScore);
    }

    // Rule D: Hard conflict detected => NEVER AUTO_MATCH (cap at 0.40 NO_MATCH)
    if (hardConflictDetected) {
      rawScore = Math.min(0.40, rawScore);
    }

    const finalConfidence = +Math.max(0.0, Math.min(1.0, rawScore)).toFixed(3);

    // Decision Logic
    let decision: ResolutionDecision = 'NO_MATCH';
    if (!hardConflictDetected && !onlyNameSignal && strongIdentityMatched && finalConfidence >= thresholds.auto_match_threshold) {
      decision = 'AUTO_MATCH';
    } else if (!hardConflictDetected && finalConfidence >= thresholds.auto_match_threshold && !onlyNameSignal) {
      decision = 'AUTO_MATCH';
    } else if (!hardConflictDetected && finalConfidence >= thresholds.review_required_threshold) {
      decision = 'REVIEW_REQUIRED';
    } else {
      decision = 'NO_MATCH';
    }

    return {
      candidate_source: candidate.source_name,
      candidate_record_id: candidate.source_record_id,
      candidate_entity_key: candidate.source_entity_key,
      target_canonical_id: target.canonical_entity_id,
      target_canonical_name: target.canonical_name,
      match_confidence: finalConfidence,
      decision,
      strong_identity_matched: strongIdentityMatched,
      hard_conflict_detected: hardConflictDetected,
      signals,
      conflicts,
      thresholds,
      evaluated_at: new Date().toISOString()
    };
  }
}
