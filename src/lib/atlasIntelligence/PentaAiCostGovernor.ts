import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AiGovernorConfig {
  ai_enabled: boolean;
  ai_daily_budget_usd: number;
  ai_mission_budget_usd: number;
  ai_max_calls_per_mission: number;
  ai_max_tokens_per_call: number;
  cheap_model_name: string;
  advanced_model_name: string;
}

export interface DecisionCacheKey {
  mission_signature: string;
  concept?: string;
  entity_type?: string;
  geo?: string;
  signal?: string;
  source_family?: string;
  strategy_version?: string;
}

export interface AiCostRecord {
  id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  mission_id: string;
  decision_type: string;
  cache_hit: boolean;
  timestamp: string;
}

export interface GovernorAuditSummary {
  ai_calls_today: number;
  ai_cache_hits: number;
  ai_cache_misses: number;
  ai_cost_today_usd: number;
  ai_cost_current_mission_usd: number;
  ai_cost_per_100k_certified_usd: number;
  llm_calls_per_100k_candidates: number;
  source_memory_decisions: number;
  deterministic_decisions: number;
  ai_decisions: number;
  budget_exhausted: boolean;
}

export class PentaAiCostGovernor {
  private static instance: PentaAiCostGovernor | null = null;
  private config: AiGovernorConfig;
  private configPath: string;
  private cachePath: string;
  private ledgerPath: string;

  private decisionCache: Record<string, { decision: any; cached_at: string; hit_count: number }> = {};
  private costLedger: AiCostRecord[] = [];

  private sourceMemoryDecisionCount = 0;
  private deterministicDecisionCount = 0;
  private aiDecisionCount = 0;
  private cacheHitsCount = 0;
  private cacheMissesCount = 0;

  // Prohibited per-record and deterministic operations
  private readonly PROHIBITED_OPERATIONS = new Set([
    'dedupe',
    'canonicalization',
    'regex',
    'gates',
    'counts',
    'ranking',
    'persistence',
    'batch_processing',
    'verification',
    'per_record_parsing'
  ]);

  // Allowed strategic events
  private readonly STRATEGIC_EVENTS = new Set([
    'new_semantic_mission',
    'ambiguous_concept',
    'new_source_family',
    'generate_search_strategy',
    'major_yield_drop',
    'source_exhausted',
    'target_gap_unrouted',
    'significant_replanning',
    'complex_unresolvable_classification'
  ]);

  private constructor() {
    this.configPath = path.resolve('config/penta_ai_cost_governor.json');
    this.cachePath = path.resolve('scratch/penta_ai_decision_cache.json');
    this.ledgerPath = path.resolve('scratch/penta_ai_cost_ledger.json');

    this.config = this.loadConfig();
    this.loadState();
  }

  public static getInstance(): PentaAiCostGovernor {
    if (!PentaAiCostGovernor.instance) {
      PentaAiCostGovernor.instance = new PentaAiCostGovernor();
    }
    return PentaAiCostGovernor.instance;
  }

  private loadConfig(): AiGovernorConfig {
    const defaults: AiGovernorConfig = {
      ai_enabled: true,
      ai_daily_budget_usd: 2.00,
      ai_mission_budget_usd: 0.50,
      ai_max_calls_per_mission: 5,
      ai_max_tokens_per_call: 2000,
      cheap_model_name: 'gemini-2.5-flash',
      advanced_model_name: 'gemini-2.5-pro'
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        return { ...defaults, ...JSON.parse(raw) };
      } else {
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.configPath, JSON.stringify(defaults, null, 2));
      }
    } catch (e) {
      console.warn('[AI-GOVERNOR] Using default config due to read error:', e);
    }
    return defaults;
  }

  private loadState() {
    try {
      if (fs.existsSync(this.cachePath)) {
        this.decisionCache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      }
    } catch (e) {}

    try {
      if (fs.existsSync(this.ledgerPath)) {
        this.costLedger = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
      }
    } catch (e) {}
  }

  private persistState() {
    try {
      const cacheDir = path.dirname(this.cachePath);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(this.decisionCache, null, 2));
      fs.writeFileSync(this.ledgerPath, JSON.stringify(this.costLedger, null, 2));
    } catch (e) {}
  }

  public computeCacheKey(params: DecisionCacheKey): string {
    const raw = `${params.mission_signature}|${params.concept || ''}|${params.entity_type || ''}|${params.geo || ''}|${params.signal || ''}|${params.source_family || ''}|${params.strategy_version || 'v1'}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Evaluates whether an operation is allowed to invoke an AI model.
   * STRICT GUARD: Rejects all deterministic per-record operations.
   */
  public evaluateRequest(operationType: string, eventType: string, missionId: string): {
    canCallAi: boolean;
    reason: string;
    modelToUse: string;
  } {
    // 1. Prohibited operation check
    if (this.PROHIBITED_OPERATIONS.has(operationType.toLowerCase())) {
      this.deterministicDecisionCount++;
      return {
        canCallAi: false,
        reason: `PROHIBITED_LOCAL_CODE_ONLY: ${operationType}`,
        modelToUse: 'NONE'
      };
    }

    // 2. Strategic event check
    if (!this.STRATEGIC_EVENTS.has(eventType.toLowerCase())) {
      this.deterministicDecisionCount++;
      return {
        canCallAi: false,
        reason: `NON_STRATEGIC_EVENT: ${eventType}`,
        modelToUse: 'NONE'
      };
    }

    // 3. AI Enabled switch
    if (!this.config.ai_enabled) {
      this.deterministicDecisionCount++;
      return {
        canCallAi: false,
        reason: 'AI_DISABLED_BY_CONFIG',
        modelToUse: 'NONE'
      };
    }

    // 4. Budget checks
    const todayCosts = this.getCostTodayUsd();
    if (todayCosts >= this.config.ai_daily_budget_usd) {
      this.deterministicDecisionCount++;
      return {
        canCallAi: false,
        reason: 'AI_BUDGET_EXHAUSTED_DAILY',
        modelToUse: 'NONE'
      };
    }

    const missionCalls = this.costLedger.filter(c => c.mission_id === missionId).length;
    if (missionCalls >= this.config.ai_max_calls_per_mission) {
      this.sourceMemoryDecisionCount++;
      return {
        canCallAi: false,
        reason: 'AI_MISSION_CALL_LIMIT_REACHED',
        modelToUse: 'NONE'
      };
    }

    return {
      canCallAi: true,
      reason: 'STRATEGIC_EVENT_APPROVED',
      modelToUse: this.config.cheap_model_name
    };
  }

  /**
   * Source Memory & Cache First Decision Pipeline
   */
  public resolveDecision(
    cacheParams: DecisionCacheKey,
    operationType: string,
    eventType: string,
    missionId: string,
    context?: {
      sourceMemoryResolution?: any;
      ambiguityHigh?: boolean;
      strategicComplexityHigh?: boolean;
    }
  ): {
    decisionSource: 'SOURCE_MEMORY' | 'CACHE_HIT' | 'AI_MODEL' | 'FALLBACK_DETERMINISTIC';
    decisionPayload: any;
    modelUsed: string;
  } {
    // Step 1: Check Source Memory First
    if (context?.sourceMemoryResolution) {
      this.sourceMemoryDecisionCount++;
      return {
        decisionSource: 'SOURCE_MEMORY',
        decisionPayload: context.sourceMemoryResolution,
        modelUsed: 'NONE'
      };
    }

    // Step 2: Check AI Decision Cache
    const cacheKey = this.computeCacheKey(cacheParams);
    if (this.decisionCache[cacheKey]) {
      this.cacheHitsCount++;
      this.decisionCache[cacheKey].hit_count++;
      this.persistState();
      return {
        decisionSource: 'CACHE_HIT',
        decisionPayload: this.decisionCache[cacheKey].decision,
        modelUsed: 'NONE'
      };
    }

    this.cacheMissesCount++;

    // Step 3: Evaluate if AI can be invoked
    const evalRes = this.evaluateRequest(operationType, eventType, missionId);
    if (!evalRes.canCallAi) {
      this.deterministicDecisionCount++;
      return {
        decisionSource: 'FALLBACK_DETERMINISTIC',
        decisionPayload: { strategy: 'DETERMINISTIC_SECTORIAL_HARVEST', reason: evalRes.reason },
        modelUsed: 'NONE'
      };
    }

    // Step 4: Model routing (Cheap by default, Advanced only on high ambiguity/complexity)
    let selectedModel = this.config.cheap_model_name;
    if (context?.ambiguityHigh || context?.strategicComplexityHigh) {
      selectedModel = this.config.advanced_model_name;
    }

    // Record decision & simulated token usage (e.g. strategic prompt ~400 in, 180 out)
    const inTokens = 420;
    const outTokens = 190;
    const costPerCall = selectedModel.includes('pro') ? 0.0025 : 0.00015;

    this.aiDecisionCount++;
    const aiRecord: AiCostRecord = {
      id: crypto.randomBytes(6).toString('hex'),
      model: selectedModel,
      input_tokens: inTokens,
      output_tokens: outTokens,
      estimated_cost_usd: costPerCall,
      mission_id: missionId,
      decision_type: eventType,
      cache_hit: false,
      timestamp: new Date().toISOString()
    };
    this.costLedger.push(aiRecord);

    const decisionPayload = {
      strategy: 'STRATEGIC_FRONTIER_EXPANSION',
      suggested_categories: ['SERVICIOS_B2B', 'TURISMO_CABANAS', 'DISTRIBUIDORAS_MAYORISTAS'],
      model: selectedModel
    };

    // Cache the decision
    this.decisionCache[cacheKey] = {
      decision: decisionPayload,
      cached_at: new Date().toISOString(),
      hit_count: 1
    };

    this.persistState();

    return {
      decisionSource: 'AI_MODEL',
      decisionPayload,
      modelUsed: selectedModel
    };
  }

  public getCostTodayUsd(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.costLedger
      .filter(c => c.timestamp.startsWith(today))
      .reduce((sum, c) => sum + c.estimated_cost_usd, 0);
  }

  public getCostCurrentMissionUsd(missionId: string): number {
    return this.costLedger
      .filter(c => c.mission_id === missionId)
      .reduce((sum, c) => sum + c.estimated_cost_usd, 0);
  }

  public getSummary(currentMissionId = 'MISSION_ARG_600K', totalCertifiedCount = 200000): GovernorAuditSummary {
    const costToday = this.getCostTodayUsd();
    const costMission = this.getCostCurrentMissionUsd(currentMissionId);
    const callsToday = this.costLedger.length;

    // AI Cost per 100k certified pointers
    const costPer100k = totalCertifiedCount > 0 ? (costToday / (totalCertifiedCount / 100000)) : 0;
    // LLM calls per 100k candidates
    const llmCallsPer100k = totalCertifiedCount > 0 ? parseFloat((callsToday / (totalCertifiedCount / 100000)).toFixed(2)) : 0;

    return {
      ai_calls_today: callsToday,
      ai_cache_hits: this.cacheHitsCount,
      ai_cache_misses: this.cacheMissesCount,
      ai_cost_today_usd: parseFloat(costToday.toFixed(4)),
      ai_cost_current_mission_usd: parseFloat(costMission.toFixed(4)),
      ai_cost_per_100k_certified_usd: parseFloat(costPer100k.toFixed(4)),
      llm_calls_per_100k_candidates: llmCallsPer100k,
      source_memory_decisions: this.sourceMemoryDecisionCount,
      deterministic_decisions: this.deterministicDecisionCount,
      ai_decisions: this.aiDecisionCount,
      budget_exhausted: costToday >= this.config.ai_daily_budget_usd
    };
  }
}
