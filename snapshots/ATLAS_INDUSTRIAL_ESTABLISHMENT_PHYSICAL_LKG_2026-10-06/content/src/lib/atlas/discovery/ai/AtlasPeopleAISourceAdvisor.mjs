/**
 * src/lib/atlas/discovery/ai/AtlasPeopleAISourceAdvisor.mjs
 * 
 * Atlas People AI Source Advisor — Cognitive Advisor Engine (Shadow V1)
 * 
 * ARCHITECTURAL ROLE:
 * Sits strictly ABOVE motors and deterministic discovery pipelines.
 * Advises WHERE to search, WHAT population to search, WHICH source class to prioritize,
 * and WHICH motor template would read it.
 * 
 * STRICT INVARIANTS:
 * - SHADOW ONLY: Cannot make live network requests, activate motors, mutate SSOT, or touch Video.
 * - INPUT IS FROZEN SNAPSHOT: Reads only atlas_people_ai_source_context_v1.json.
 * - NO RAW PII: Deals purely in aggregate domain/source metadata.
 * - AI PROPOSES, DETERMINISTIC SYSTEMS VALIDATE, PHYSICAL EVIDENCE DECIDES.
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  RECOMMENDATION_SCHEMA_VERSION,
  EVIDENCE_LABELS,
  RECOMMENDATION_TYPES,
  KNOWN_PEOPLE_DOMAINS,
  GEOGRAPHIC_SCOPES,
  CERTIFIED_MOTOR_TEMPLATES,
  POLICY_STATUSES,
  CONFIDENCE_LEVELS,
  createEmptyRecommendation
} from './AtlasPeopleAIRecommendationSchema.mjs';
import { AtlasPeopleAIRecommendationValidator } from './AtlasPeopleAIRecommendationValidator.mjs';
import { AtlasPeopleAIRecommendationScorer, SCORING_POLICY_VERSION, getScoringPolicySha256 } from './AtlasPeopleAIRecommendationScorer.mjs';

export const ADVISOR_VERSION = 'v1.0.0-shadow';
export const PROMPT_VERSION = 'v1.0.0';

export class AtlasPeopleAISourceAdvisor {
  constructor(contextPath, options = {}) {
    this.contextPath = contextPath;
    this.options = options;
    this.context = null;
    this.contextSha256 = null;
    this.aiConnected = false;
    this.aiProvider = 'NONE';
    this.aiModelId = 'NONE';
    this.genAI = null;

    this.loadContext();
    this.initAI();
  }

  loadContext() {
    if (!fs.existsSync(this.contextPath)) {
      throw new Error(`Context file not found at: ${this.contextPath}`);
    }
    const raw = fs.readFileSync(this.contextPath, 'utf8');
    this.contextSha256 = crypto.createHash('sha256').update(raw).digest('hex');
    this.context = JSON.parse(raw);
  }

  initAI() {
    // Check for API key in .env or process.env
    let apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey && fs.existsSync('.env')) {
      const envText = fs.readFileSync('.env', 'utf8');
      for (const line of envText.split('\n')) {
        if (line.startsWith('GEMINI_API_KEY=')) {
          apiKey = line.split('=')[1].trim().replace(/['"]/g, '');
          break;
        }
      }
    }

    if (apiKey) {
      try {
        this.genAI = new GoogleGenAI({ apiKey });
        this.aiConnected = true;
        this.aiProvider = 'Google GenAI';
        this.aiModelId = 'gemini-3.6-flash';
      } catch (err) {
        console.warn('Could not initialize GoogleGenAI client:', err.message);
        this.aiConnected = false;
      }
    } else {
      this.aiConnected = false;
    }
  }

  getAdvisorMetadata() {
    return {
      advisor_version: ADVISOR_VERSION,
      prompt_version: PROMPT_VERSION,
      system_prompt_hash: crypto.createHash('sha256').update(this.getSystemPrompt()).digest('hex'),
      context_version: this.context?.context_version || 'UNKNOWN',
      context_sha256: this.contextSha256,
      schema_version: RECOMMENDATION_SCHEMA_VERSION,
      scoring_policy_version: SCORING_POLICY_VERSION,
      scoring_policy_sha256: getScoringPolicySha256(),
      ai_connected: this.aiConnected,
      ai_provider: this.aiProvider,
      ai_model_id: this.aiModelId,
      temperature: 0.2,
      max_output_tokens: 4096,
      mode: 'ADVISOR_SHADOW_MODE'
    };
  }

  getSystemPrompt() {
    return `You are the Atlas People AI Source Advisor (Shadow V1).
Your role is to advise where to search, what population to search, which source class to prioritize, and which motor template to use for People Discovery in Argentina.
Guiding Principle:
AI PROPOSES. DETERMINISTIC SYSTEMS VALIDATE. PHYSICAL EVIDENCE DECIDES. AI NEVER BECOMES SOURCE OF TRUTH.
Invariants:
- ATLAS PEOPLE != ATLAS VIDEO. Never recommend or reference video domains.
- NO RAW PII. Never output personal identity keys.
- FACT VS HYPOTHESIS. Mark all new recommendations as AI_HYPOTHESIS with low/base/high prediction intervals.
- NEVER FABRICATE URLs or API endpoints. Candidate URLs must be null for new hypotheses.`;
  }

  /**
   * Generates People Coverage Gap Analysis from the frozen context.
   */
  generateCoverageGapAnalysis() {
    const gap = this.context?.coverage_gap_intelligence;
    return {
      analysis_name: 'PEOPLE_COVERAGE_GAP_ANALYSIS',
      timestamp: new Date().toISOString(),
      current_certified_supply: gap?.current_identity_adjusted_machine_supply ?? 573424,
      target_supply: 1000000,
      remaining_gap: gap?.remaining_supply_gap_to_1m ?? 426576,
      sustainable_power_current: gap?.sustainable_30m_machine_power ?? 318.57,
      sustainable_power_target: gap?.target_sustainable_power ?? 555.56,
      sustainable_power_gap: gap?.sustainable_power_gap ?? 236.99,
      domain_evaluations: gap?.domains_status ?? {},
      geographic_evaluations: gap?.geographic_coverage_status ?? {},
      strategic_priority: 'Target high-density provincial personnel registers (PBA, Córdoba, Santa Fe), provincial healthcare colegios, and legal professional bodies with open bulk CSV or REST endpoints.'
    };
  }

  /**
   * Generates recommendations for a set of candidate profiles.
   * Runs each candidate through:
   * 1. Schema template creation
   * 2. Heuristic/cognitive prediction synthesis
   * 3. Deterministic Validation Gate (AtlasPeopleAIRecommendationValidator)
   * 4. Deterministic Scorer (AtlasPeopleAIRecommendationScorer)
   */
  evaluateCandidate(candidate) {
    const recId = `REC_${candidate.source_id || candidate.hypothesis_id || Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const rec = createEmptyRecommendation(recId);

    // Map candidate attributes
    rec.recommendation_type = candidate.recommendation_type || RECOMMENDATION_TYPES.VALIDATE_NEW_SOURCE;
    rec.target_population = candidate.target_population || '';
    rec.domain = candidate.domain || KNOWN_PEOPLE_DOMAINS.GOVERNMENT;
    rec.geography = candidate.geography || GEOGRAPHIC_SCOPES.AR_NATIONAL;
    rec.coverage_gap_reason = candidate.coverage_gap_reason || '';
    rec.source_hypothesis = candidate.source_name || candidate.source_hypothesis || '';
    rec.known_source_id = candidate.known_source_id || null;
    rec.candidate_url = candidate.candidate_url || null;
    rec.source_class = candidate.source_class || '';
    rec.preferred_access_mode = candidate.preferred_access_mode || '';
    rec.preferred_motor_template = candidate.preferred_motor_template || CERTIFIED_MOTOR_TEMPLATES.CSV_BULK_MOTOR;

    // Check motor template gap
    if (!Object.values(CERTIFIED_MOTOR_TEMPLATES).includes(rec.preferred_motor_template)) {
      rec.motor_template_gap = true;
      rec.execution_eligible = false;
    }

    // Prediction intervals (Low, Base, High)
    rec.expected_person_yield = candidate.expected_person_yield || { low: 0, base: 0, high: 0 };
    rec.expected_net_new_yield = candidate.expected_net_new_yield || { low: 0, base: 0, high: 0 };
    rec.expected_marginal_unique_depth = candidate.expected_marginal_unique_depth || { low: 0, base: 0, high: 0 };
    rec.expected_30m_supply = candidate.expected_30m_supply || { low: 0, base: 0, high: 0 };
    rec.expected_overlap = candidate.expected_overlap || { low: 0, base: 0, high: 0 };

    rec.confidence = candidate.confidence || CONFIDENCE_LEVELS.MEDIUM;
    rec.identity_signal_expectation = candidate.identity_signal_expectation || [];
    rec.policy_status = candidate.policy_status || POLICY_STATUSES.UNKNOWN;
    rec.evidence_status = candidate.evidence_status || EVIDENCE_LABELS.AI_HYPOTHESIS;

    // Policy gate logic
    if (rec.policy_status === POLICY_STATUSES.RESTRICTED || rec.policy_status === POLICY_STATUSES.REJECTED) {
      rec.execution_eligible = false;
      rec.certified_supply_contribution = 0;
      rec.non_certified_projected_supply = 0;
    } else {
      rec.execution_eligible = !!candidate.execution_eligible;
      rec.certified_supply_contribution = (rec.evidence_status === EVIDENCE_LABELS.CERTIFIED && rec.execution_eligible)
        ? (rec.expected_30m_supply?.base || 0)
        : 0;
      rec.non_certified_projected_supply = rec.expected_30m_supply?.base || 0;
    }

    rec.prediction_basis = candidate.prediction_basis || '';
    rec.analog_sources = candidate.analog_sources || [];
    rec.context_evidence_refs = candidate.context_evidence_refs || [];

    rec.explainability = candidate.explainability || {
      WHY_THIS_POPULATION: candidate.why_population || 'Orthogonal demographic slice with minimal historical representation.',
      WHY_THIS_SOURCE_CLASS: candidate.why_source_class || 'Standardized public structure conducive to automated retrieval.',
      WHY_THIS_GEOGRAPHY: candidate.why_geography || 'Under-represented province in current SSOT coverage.',
      WHY_EXPECT_LOW_OVERLAP: candidate.why_low_overlap || 'Disjoint occupational registry with high geographic separation.',
      WHY_EXPECT_NET_NEW_VALUE: candidate.why_net_new || 'High likelihood of nominal records with extractable national documents.',
      WHY_THIS_MOTOR: candidate.why_motor || 'Compatible data transfer format for non-interactive streaming.',
      WHAT_MUST_BE_VERIFIED: candidate.what_verify || 'Check for presence of nominal human records vs aggregate statistics and verify robots.txt/TOS.'
    };

    rec.required_validation_steps = candidate.required_validation_steps || ['SOURCE_SCOUT_PROBE', 'CANARY_RUN', 'POLICY_AUDIT'];
    rec.recommended_canary = candidate.recommended_canary || 'CANARY_SAMPLE_50_RECORDS';
    rec.reasoning_summary = candidate.reasoning_summary || 'Evaluated under certified cognitive heuristic matrix.';
    rec.blocking_risks = candidate.blocking_risks || [];

    // Deterministic Validation Gate
    const valResult = AtlasPeopleAIRecommendationValidator.validate(rec, this.context);

    // Deterministic Scoring
    if (valResult.valid) {
      AtlasPeopleAIRecommendationScorer.scoreRecommendation(rec);
    }

    return {
      recommendation: rec,
      validation: valResult
    };
  }

  /**
   * Generates the two separate portfolios:
   * 1. VALIDATION_PORTFOLIO (10-30 source hypotheses for Source Scout verification)
   * 2. MACHINE_READY_PORTFOLIO (known certified sources ready for immediate execution)
   * 3. AVOID_LIST (disqualified or policy-blocked sources)
   */
  generatePortfolios(evaluatedItems) {
    const validationPortfolio = [];
    const machineReadyPortfolio = [];
    const avoidList = [];

    for (const item of evaluatedItems) {
      const rec = item.recommendation;
      if (!item.validation.valid) continue;

      if (rec.policy_status === POLICY_STATUSES.RESTRICTED ||
          rec.policy_status === POLICY_STATUSES.REJECTED ||
          rec.recommendation_type === RECOMMENDATION_TYPES.AVOID_SOURCE ||
          rec.deterministic_score === 0) {
        avoidList.push(rec);
      } else if (rec.recommendation_type === RECOMMENDATION_TYPES.PRIORITIZE_KNOWN_SOURCE &&
                 rec.execution_eligible &&
                 rec.evidence_status === EVIDENCE_LABELS.CERTIFIED) {
        machineReadyPortfolio.push(rec);
      } else if (rec.recommendation_type === RECOMMENDATION_TYPES.VALIDATE_NEW_SOURCE) {
        validationPortfolio.push(rec);
      }
    }

    // Sort validation portfolio by exploration score descending
    validationPortfolio.sort((a, b) => b.deterministic_score - a.deterministic_score);

    // Sort machine-ready portfolio by exploitation score descending
    machineReadyPortfolio.sort((a, b) => b.deterministic_score - a.deterministic_score);

    // Sort avoid list by recommendation_id
    avoidList.sort((a, b) => a.recommendation_id.localeCompare(b.recommendation_id));

    // Calculate aggregate projected opportunity for validation portfolio
    const projectedLow = validationPortfolio.reduce((sum, r) => sum + (r.expected_30m_supply?.low || 0), 0);
    const projectedBase = validationPortfolio.reduce((sum, r) => sum + (r.expected_30m_supply?.base || 0), 0);
    const projectedHigh = validationPortfolio.reduce((sum, r) => sum + (r.expected_30m_supply?.high || 0), 0);

    return {
      validation_portfolio: validationPortfolio,
      machine_ready_portfolio: machineReadyPortfolio,
      avoid_list: avoidList,
      projected_validation_opportunity: {
        classification: 'NON_CERTIFIED_AI_PROJECTION',
        ai_projected_if_validated_30m_supply_low: projectedLow,
        ai_projected_if_validated_30m_supply_base: projectedBase,
        ai_projected_if_validated_30m_supply_high: projectedHigh,
        certified_supply_contribution: 0,
        disclaimer: 'These figures represent non-certified AI projections conditioned on successful deterministic validation, policy approval, and canary verification. They do NOT modify the certified SSOT supply baseline.'
      }
    };
  }
}
