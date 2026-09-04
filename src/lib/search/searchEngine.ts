import type { SearchQuery, ContentItem, CandidatePool, CandidateRef, SearchUpdate, SearchPhase } from './types';
import { parseQuery } from './queryEngine';
import { analyzeQuery } from './intentDetector';
import { retrieveInternalCandidates } from './retrievalEngine';
import { externalSearch } from './providers/externalSearch';
import { normalizeItems } from './normalizationEngine';
import { deduplicateItems } from './deduplicationEngine';
import { calculateQualityScore } from './qualityEngine';
import { calculateMediaQualityScore, sortByMediaQuality } from './mediaQualityEngine';
import { calculateBaseRanking } from './rankingEngine';
import { applyPersonalization } from './personalizationEngine';
import { determineQueryComplexity } from './aiRouter';
import { applySemanticScoring, applyAiReranking, generateAiOverview } from './semanticEngine';
import type { AiOverview } from './types';
import { getCandidatePool, saveCandidatePool, getCatalogItems, saveCatalogItems } from './cache/indexedDb';
import { trackSearchEvent } from './telemetry';
import { lookupQueryMemory, saveQueryMemory, markQueryResolvedByAtlas } from './query/queryMemory';
import { applyIntentFit, groupByFormat } from './intentFit';

import type { QueryUnderstanding } from './intentDetector';
import type { IntentType, ResolvedSearchIntent } from './types';
import { autoRegisterChannel } from '../creatorGraph';

export interface ExecuteSearchOptions {
  forceExternal?: boolean;
  bypassCandidatePool?: boolean;
  bypassAtlas?: boolean;
  signal?: AbortSignal;
  onProgress?: (update: SearchUpdate) => void;
  routingMode?: 'static' | 'shadow' | 'dynamic' | 'all';
  trafficClass?: 'organic' | 'benchmark' | 'synthetic';
  utilitySource?: any; // any to avoid circular import if needed, or proper type
  resolvedIntent?: ResolvedSearchIntent;
  queryContext?: {
    source: 'tv_signal' | 'user' | 'unknown';
    parentTopic?: string;
    originalPrompt?: string;
    intentHint?: IntentType;
    needsDocumentary?: boolean;
    entities?: any[];
    resolvedIntent?: ResolvedSearchIntent;
  };
  excludeProviders?: string[];
  forceProviders?: string[];
  readOnlyBenchmark?: boolean; // If true, do not mutate Cache/Atlas or enqueue Discovery AI
  benchmarkStartedAt?: string; // ISO date string to freeze Atlas temporal state
}


export interface SearchExecutionTrace {
  requestId: string;
  latencyMs: number;
  path: 'fast' | 'discovery' | 'radar';
  resolvedIntent?: ResolvedSearchIntent;
  searchEngineReceivedResolvedIntent?: boolean;
  tierDecisionBasis?: 'EXACT_ENTITY_WORK' | 'EXACT_ENTITY_TITLE' | 'ENTITY_TOPIC' | 'GENERIC_QR';
  latencies: {
    parse: number;
    intent: number;
    memory: number;
    atlas: number;
    normalize: number;
    dedup: number;
    relevance: number;
    quality: number;
    rank: number;
    router: number;
    providers: number;
    fastPathEvaluation: number;
    total: number;
  };
  retrievalStats: { // For Final Top20
    atlas: number;
    videoMesh: number;
    vimeo: number;
    dailymotion: number;
    radar: number;
    publisher: number;
    webDiscover: number;
    unknown: number;
    other: number;
  };
  acquisitionStats: { // For Raw Candidates
    atlas: number;
    videoMesh: number;
    vimeo: number;
    dailymotion: number;
    radar: number;
    publisher: number;
    webDiscover: number;
    unknown: number;
    other: number;
  };
  funnel: {
    raw: number;
    dedup: number;
    qualityDrop: number;
    relevanceDrop: number;
    qualified: number;
    final: number;
  };
  providerStatuses?: Record<string, { status: string; results: number }>;
  independenceRate: number;
  routerDecisions?: any[];
}

export async function executeSearch(rawQuery: string, options?: ExecuteSearchOptions): Promise<{ all: ContentItem[], videos: ContentItem[], channels: ContentItem[], newsContext?: ContentItem[], overview?: AiOverview, intentData?: QueryUnderstanding, trace: SearchExecutionTrace }> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const forceExternal = options?.forceExternal || false;

  const latencies = {
    parse: 0, intent: 0, memory: 0, atlas: 0, normalize: 0, dedup: 0,
    relevance: 0, quality: 0, rank: 0, router: 0, providers: 0, fastPathEvaluation: 0, total: 0
  };
  let activePath: 'fast' | 'discovery' | 'radar' | 'discovery_free' = 'discovery';

  if (!rawQuery.trim()) {
    return { all: [], videos: [], channels: [], trace: {} as any };
  }

  let t = Date.now();
  const query = parseQuery(rawQuery);
  query.forceExternal = forceExternal;
  if (options?.resolvedIntent) {
    query.resolvedIntent = options.resolvedIntent;
  }
  if (options?.queryContext) {
    query.context = options.queryContext;
    if (options.queryContext.resolvedIntent && !query.resolvedIntent) {
      query.resolvedIntent = options.queryContext.resolvedIntent;
    }
  }
  latencies.parse = Date.now() - t;

  trackSearchEvent('search_started', { request_id: requestId, query_normalized: query.normalizedQuery });

  t = Date.now();
  const intentData = analyzeQuery(query.rawQuery);
  
  if (options?.queryContext?.intentHint) {
    intentData.primaryIntent = options.queryContext.intentHint;
    intentData.confidence = Math.max(intentData.confidence, 85);
    // You could also add a debug flag or source flag if supported
  }
  
  const intent = intentData.primaryIntent;
  latencies.intent = Date.now() - t;
  
  if (import.meta.env?.DEV) console.log(`🔎 [Query Understanding] "${query.rawQuery}"`, intentData);

  t = Date.now();
  const memoryResult = !forceExternal
    ? await lookupQueryMemory(rawQuery)
    : { found: false, atlasCoverage: 0, shouldUseCachedIds: false };
  latencies.memory = Date.now() - t;

  let pool: CandidatePool | null = null;
  let candidates: ContentItem[] = [];
  
  let rawCandidateCount = 0;
  let dedupCandidateCount = 0;
  let qualityDrop = 0;
  let relevanceDrop = 0;
  let qualifiedCount = 0;
  
  const complexity = determineQueryComplexity(query);
  let overview: AiOverview | undefined = undefined;

  const providerStatuses: Record<string, { status: string; results: number }> = {};
  const routerDecisionsOut = { decisions: [] as any[] };

  const acquisitionStats = { atlas: 0, videoMesh: 0, vimeo: 0, dailymotion: 0, radar: 0, publisher: 0, webDiscover: 0, unknown: 0, other: 0 };
  const updateAcquisitionStats = (items: ContentItem[]) => {
    items.forEach(c => {
      const rs = c.retrievalSource as string;
      if (rs === 'atlas' || rs === 'cache' || rs === 'local') acquisitionStats.atlas++;
      else if (rs === 'video-mesh') acquisitionStats.videoMesh++;
      else if (rs === 'vimeo-api') acquisitionStats.vimeo++;
      else if (rs === 'dailymotion-api') acquisitionStats.dailymotion++;
      else if (rs === 'radar') acquisitionStats.radar++;
      else if (rs === 'publisher') acquisitionStats.publisher++;
      else if (rs === 'web-discover') acquisitionStats.webDiscover++;
      else if (!rs || rs === 'unknown') acquisitionStats.unknown++;
      else acquisitionStats.other++;
    });
  };

  const { exactWorkSearchGate } = await import('./exactWorkSearchGate');

  const incomingResolvedIntent =
    options?.resolvedIntent ||
    options?.queryContext?.resolvedIntent ||
    query.resolvedIntent ||
    query.context?.resolvedIntent;

  let exactWorkDetection: import('./exactWorkSearchGate').ExactWorkDetection;
  let searchEngineReceivedResolvedIntent = false;
  let resolvedIntentSource: 'AUTOCOMPLETE_SELECTION' | 'QUERY_RESOLVER' = 'QUERY_RESOLVER';

  const isIncomingValid = incomingResolvedIntent && (
    (incomingResolvedIntent.baseIntent && incomingResolvedIntent.baseIntent !== 'GENERIC') ||
    (incomingResolvedIntent.type && incomingResolvedIntent.type !== 'GENERIC') ||
    (incomingResolvedIntent.constraints && incomingResolvedIntent.constraints.length > 0)
  );

  if (isIncomingValid) {
    searchEngineReceivedResolvedIntent = true;
    resolvedIntentSource = incomingResolvedIntent.source || 'AUTOCOMPLETE_SELECTION';
    exactWorkDetection = exactWorkSearchGate.fromResolvedIntent(incomingResolvedIntent);
  } else {
    exactWorkDetection = exactWorkSearchGate.detectExactWork(query.rawQuery, intentData);
    resolvedIntentSource = exactWorkDetection.resolvedIntentSource || 'QUERY_RESOLVER';
  }
  
  const resolvedSearchIntent = isIncomingValid ? incomingResolvedIntent! : exactWorkSearchGate.fromResolvedIntent(exactWorkDetection);
  const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(exactWorkDetection, resolvedSearchIntent);
  if (import.meta.env?.DEV) {
    console.log(`\n[Mandatory Intent Gates]`);
    console.log(`Source Type:         ${mandatoryGates.sourceIntentType}`);
    console.log(`EntityRequired:      ${mandatoryGates.entity?.required || false}`);
    if (mandatoryGates.entity) {
      console.log(`Entity:              ${mandatoryGates.entity.canonicalName} (Thresh: ${mandatoryGates.entity.minIdentityFidelity})`);
    }
    console.log(`ObjectRequired:      ${mandatoryGates.object?.required || false}`);
    if (mandatoryGates.object) {
      console.log(`Object:              ${mandatoryGates.object.canonicalValue} (Thresh: ${mandatoryGates.object.minFidelity})`);
    }
    console.log(`Constraints:`);
    mandatoryGates.constraints.forEach(c => {
      console.log(`  ${c.type} = ${c.value} (Thresh: ${c.minFidelity})`);
    });
  }

  const hasAutocompleteResolved = resolvedIntentSource === 'AUTOCOMPLETE_SELECTION';

  let retrievalQuery = query.normalizedQuery;
  if (exactWorkDetection.canonicalEntity || exactWorkDetection.canonicalWork || exactWorkDetection.residualTitle || exactWorkDetection.topic) {
    const parts = [];
    if (exactWorkDetection.canonicalEntity) parts.push(exactWorkDetection.canonicalEntity);
    if (exactWorkDetection.canonicalWork) parts.push(exactWorkDetection.canonicalWork);
    else if (exactWorkDetection.residualTitle) parts.push(exactWorkDetection.residualTitle);
    else if (exactWorkDetection.topic) parts.push(exactWorkDetection.topic);
    
    if (exactWorkDetection.constraints && exactWorkDetection.constraints.length > 0) {
      parts.push(...exactWorkDetection.constraints.map(c => c.canonicalValue));
    }
    if (parts.length > 0) {
      retrievalQuery = parts.join(' ').trim();
    }
  }
  query.retrievalQuery = retrievalQuery;

  if (!forceExternal && !options?.bypassCandidatePool) {
    try {
      pool = await getCandidatePool(query.retrievalQuery);
      if (pool && pool.candidates && pool.candidates.length > 0) {
        // Si es una ExactWork o ExactEntityTitle y el pool en caché tiene menos de 10 candidatos, refrescar desde Atlas físico
        if ((exactWorkDetection.isExactWork || exactWorkDetection.isExactEntityTitle) && pool.candidates.length < 10) {
          pool = null;
        } else {
          const cachedIds = pool.candidates.map(c => c.contentId);
          candidates = await getCatalogItems(cachedIds);
          if (candidates.length > 0) {
            if (import.meta.env?.DEV) console.log(`⚡ [CandidatePool Cache] Loaded ${candidates.length} candidates for "${query.retrievalQuery}"`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Si no había CandidatePool o estaba vacío
  if (!pool || candidates.length === 0 || options?.bypassCandidatePool) {
    t = Date.now();
    if (!options?.bypassAtlas) {
      const retrieval = await retrieveInternalCandidates(query, { signal: options?.signal });
      candidates = retrieval.candidates;
    } else {
      candidates = [];
      if (import.meta.env?.DEV) console.log(`🔍 [Atlas Bypassed] Skipping internal Atlas retrieval for benchmark/test`);
    }
    latencies.atlas = Date.now() - t;
  }

  rawCandidateCount = candidates.length;
  updateAcquisitionStats(candidates);

  // Phase 2: Normalize
  t = Date.now();
  candidates = normalizeItems(candidates);
  latencies.normalize = Date.now() - t;

  // Phase 3: Dedup
  t = Date.now();
  candidates = deduplicateItems(candidates);
  latencies.dedup = Date.now() - t;
  dedupCandidateCount = candidates.length;

  // Phase 4: Cheap Relevance
  t = Date.now();
  candidates = calculateBaseRanking(candidates, query, intentData);
  latencies.relevance = Date.now() - t;

  // Phase 5: Quality & Media Quality
  t = Date.now();
  candidates = calculateQualityScore(candidates);
  candidates = calculateMediaQualityScore(candidates);
  latencies.quality = Date.now() - t;


  // Phase 6: FAST PATH GATE (Graduated 3-Tier Early-Stop Strategy)
  t = Date.now();
  
  const isEntityWithTitle = exactWorkDetection.detectionType === 'EXACT_ENTITY_WORK' || exactWorkDetection.detectionType === 'EXACT_ENTITY_TITLE';
  const isEntityTopic = exactWorkDetection.detectionType === 'ENTITY_TOPIC';
  const hasConstraints = !!(exactWorkDetection.constraints && exactWorkDetection.constraints.length > 0) || !!exactWorkDetection.venue;
  const isEntitySemanticQuery = isEntityWithTitle || exactWorkDetection.isExactWork || isEntityTopic || hasConstraints || !!exactWorkDetection.canonicalEntity;

  let tierDecisionBasis: 'EXACT_ENTITY_WORK' | 'EXACT_ENTITY_TITLE' | 'ENTITY_TOPIC' | 'EXACT_ENTITY_CONSTRAINT' | 'EXACT_ENTITY' | 'GENERIC_QR' = 'GENERIC_QR';
  if (exactWorkDetection.detectionType === 'EXACT_ENTITY_WORK') tierDecisionBasis = 'EXACT_ENTITY_WORK';
  else if (exactWorkDetection.detectionType === 'EXACT_ENTITY_TITLE') tierDecisionBasis = 'EXACT_ENTITY_TITLE';
  else if (exactWorkDetection.detectionType === 'ENTITY_TOPIC') tierDecisionBasis = 'ENTITY_TOPIC';
  else if (hasConstraints) tierDecisionBasis = 'EXACT_ENTITY_CONSTRAINT';
  else if (exactWorkDetection.canonicalEntity) tierDecisionBasis = 'EXACT_ENTITY';

  let poolForFastPath = candidates;
  if (isEntitySemanticQuery) {
    poolForFastPath = exactWorkSearchGate.filterAndDiversifyExactWorkCandidates(candidates, exactWorkDetection, 75);
  }

  const rawPoolCount = poolForFastPath.length;
  const qualityPassedCount = poolForFastPath.filter(c => (c.qualityScore || 0) >= 60).length;
  const relevancePassedCount = poolForFastPath.filter(c => (c.relevanceScore || 0) >= 40).length;
  const qualifiedAtlasCandidates = poolForFastPath.filter(
    c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40
  );

  // Provisional sorting by youScore to check Top 5 guardrail
  const provisionalTop = [...qualifiedAtlasCandidates].sort((a, b) => (b.youScore || 0) - (a.youScore || 0));
  const top5 = provisionalTop.slice(0, 5);
  const top5Consistent = top5.length >= 1 && top5.every(c => (c.relevanceScore || 0) >= 40);

  // ── Graduated Early-Stop Strategy (Mandatory Gates) ──────────────────────────────
  const requiredCoverage = exactWorkSearchGate.getRequiredCoverage(mandatoryGates);
  
  let fullyQualifiedCount = 0;
  let shadowMismatches = 0;

  const effectiveFastPathCandidates = qualifiedAtlasCandidates.filter(c => {
    // OLD LOGIC
    let isOldPassed = false;
    if (hasConstraints) {
      isOldPassed = !!(c.semanticMatch?.isConstraintMatch || c.isConstraintMatch);
    } else if (isEntityTopic) {
      isOldPassed = !!(c.semanticMatch?.isEntityTopic || c.isEntityTopic);
    } else if (isEntityWithTitle) {
      isOldPassed = !!(c.semanticMatch?.isExactEntityWork || c.semanticMatch?.isExactEntityTitle || c.isExactEntityWork || c.isExactEntityTitle);
    } else if (exactWorkDetection.canonicalEntity) {
      isOldPassed = (c.artistFidelityScore || 0) >= 85;
    } else {
      isOldPassed = true;
    }

    // NEW LOGIC
    const gateResult = exactWorkSearchGate.evaluateMandatoryGates(c, mandatoryGates);
    
    if (import.meta.env?.DEV && isOldPassed !== gateResult.passed) {
      shadowMismatches++;
      // console.log(`Shadow Mismatch [${c.title}]: OLD=${isOldPassed}, NEW=${gateResult.passed} (${gateResult.reason || 'none'})`);
    }

    // We fully rely on the NEW LOGIC for the real decision
    if (gateResult.passed) {
      fullyQualifiedCount++;
      return true;
    }
    return false;
  });

  if (import.meta.env?.DEV && shadowMismatches > 0) {
    console.log(`⚠️ [Shadow Evaluation] Found ${shadowMismatches} discrepancies between old logic and new MandatoryIntentGates.`);
  }

  const exactEntityWorkQualified = qualifiedAtlasCandidates.filter(c => c.semanticMatch?.isExactEntityWork || c.isExactEntityWork).length;
  const exactTitleQualified = qualifiedAtlasCandidates.filter(c => c.semanticMatch?.isExactEntityTitle || c.isExactEntityTitle).length;
  const topicQualified = qualifiedAtlasCandidates.filter(c => c.semanticMatch?.isEntityTopic || c.isEntityTopic).length;
  const constraintQualified = qualifiedAtlasCandidates.filter(c => c.semanticMatch?.isConstraintMatch || c.isConstraintMatch).length;
  const genericQualified = candidates.filter(c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40).length;

  const fastPathReady = (fullyQualifiedCount >= requiredCoverage && top5Consistent) && !forceExternal;
  const isStrongFastPath = fastPathReady && fullyQualifiedCount >= 10;
  const isFastPathWithBackgroundHarvest = fastPathReady && fullyQualifiedCount < 10;

  latencies.fastPathEvaluation = Date.now() - t;

  if (isEntitySemanticQuery || import.meta.env?.DEV) {
    console.log(`[EntityTitleResolver Telemetry]`);
    console.log(`  autocompleteResolved:                ${hasAutocompleteResolved}`);
    console.log(`  resolvedIntentSource:                ${resolvedIntentSource}`);
    console.log(`  resolvedEntity:                      ${exactWorkDetection.canonicalEntity || 'none'}`);
    console.log(`  resolvedTitle:                       ${exactWorkDetection.residualTitle || exactWorkDetection.canonicalWork || exactWorkDetection.topic || 'none'}`);
    console.log(`  resolvedWorkId:                      ${exactWorkDetection.workId || 'null'}`);
    console.log(`  provisionalTitleKey:                 ${exactWorkDetection.provisionalTitleKey || 'null'}`);
    console.log(`  searchEngineReceivedResolvedIntent:  ${searchEngineReceivedResolvedIntent}`);
    console.log(`  entity:                              ${exactWorkDetection.canonicalEntity || 'none'}`);
    console.log(`  entityConfidence:                    ${exactWorkDetection.entityConfidence !== undefined ? exactWorkDetection.entityConfidence.toFixed(2) : '0.00'}`);
    console.log(`  residualTitle:                       ${exactWorkDetection.residualTitle || exactWorkDetection.canonicalWork || exactWorkDetection.topic || 'none'}`);
    console.log(`  workId:                              ${exactWorkDetection.workId || 'null'}`);
    console.log(`  workConfidence:                      ${exactWorkDetection.workConfidence !== undefined ? exactWorkDetection.workConfidence.toFixed(2) : '0.00'}`);
    console.log(`  genericQualified:                    ${genericQualified}`);
    console.log(`  exactTitleQualified:                 ${exactTitleQualified}`);
    console.log(`  exactEntityWorkQualified:            ${exactEntityWorkQualified}`);
    console.log(`  topicQualified:                      ${topicQualified}`);
    console.log(`  constraintQualified:                 ${constraintQualified}`);
    console.log(`  venue:                               ${exactWorkDetection.venue || 'none'}`);
    console.log(`  tierDecisionBasis:                   ${tierDecisionBasis}`);
    console.log(`  Tier:                                ${isStrongFastPath ? 1 : (isFastPathWithBackgroundHarvest ? 2 : 3)}`);
  }

  if (fastPathReady) {
    activePath = 'fast';

    if (isFastPathWithBackgroundHarvest && (isEntityWithTitle || exactWorkDetection.isExactWork) && !options?.readOnlyBenchmark) {
      Promise.resolve().then(async () => {
        try {
          const { analyzeAtlasGap, enqueueDiscoveryMission } = await import('../atlasDiscoveryAI');
          const gapRequest = analyzeAtlasGap({
            query: rawQuery,
            atlasResultCount: effectiveFastPathCandidates.length,
            qualityQualifiedCount: effectiveFastPathCandidates.length,
            relevanceQualifiedCount: effectiveFastPathCandidates.length,
            coverageScore: effectiveFastPathCandidates.length / 10,
            qualityScore: 1.0,
            entities: [exactWorkDetection.canonicalEntity || ''],
            works: [exactWorkDetection.canonicalWork || exactWorkDetection.residualTitle || '']
          });
          if (gapRequest && gapRequest.gaps.length > 0) {
            void enqueueDiscoveryMission(gapRequest);
          }
        } catch {}
      });
    }

    if (import.meta.env?.DEV) {
      console.log(`⚡ [Fast Path Tier ${isStrongFastPath ? '1 (Strong)' : '2 (Harvest Backfill)'}] Gate PASSED [Basis: ${tierDecisionBasis}]`);
      console.log(`  Source:             ${pool ? 'CandidatePool' : 'Atlas Physical'}`);
      console.log(`  Raw candidates:     ${rawPoolCount}`);
      console.log(`  Quality passed:     ${qualityPassedCount}`);
      console.log(`  Relevance passed:   ${relevancePassedCount}`);
      console.log(`  Qualified (Exact):  ${effectiveFastPathCandidates.length}`);
      console.log(`  Top5 consistent:    ${top5Consistent}`);
    }
  } else {
    if (import.meta.env?.DEV) {
      console.log(`⚡ [CandidatePool/Atlas Gate Tier 3 (Fallback)]`);
      console.log(`  Source:             ${pool ? 'CandidatePool' : 'Atlas Physical'}`);
      console.log(`  Retrieved:          ${rawPoolCount}`);
      console.log(`  Qualified (Exact):  ${effectiveFastPathCandidates.length}/10 (Dropped: ${rawPoolCount - effectiveFastPathCandidates.length})`);
      console.log(`  Top5 consistent:    ${top5Consistent}`);
      console.log(`⚠️ FAST PATH INSUFFICIENT (<6 exact qualified). Continuing to free discovery / external + Enqueuing Discovery AI background mission...`);
    }

    // TIER 3: Siempre encolar Discovery AI en background para cerrar permanentemente el hueco para futuras búsquedas
    if ((isEntityWithTitle || exactWorkDetection.isExactWork) && !options?.readOnlyBenchmark) {
      Promise.resolve().then(async () => {
        try {
          const { analyzeAtlasGap, enqueueDiscoveryMission } = await import('../atlasDiscoveryAI');
          const gapRequest = analyzeAtlasGap({
            query: rawQuery,
            atlasResultCount: effectiveFastPathCandidates.length,
            qualityQualifiedCount: effectiveFastPathCandidates.length,
            relevanceQualifiedCount: effectiveFastPathCandidates.length,
            coverageScore: effectiveFastPathCandidates.length / 10,
            qualityScore: 1.0,
            entities: [exactWorkDetection.canonicalEntity || ''],
            works: [exactWorkDetection.canonicalWork || exactWorkDetection.residualTitle || '']
          });
          if (gapRequest && gapRequest.gaps.length > 0) {
            void enqueueDiscoveryMission(gapRequest);
          }
        } catch {}
      });
    }

    // ── V1.3.1 EXPLICIT NAME RECOVERY LANE ─────────────────────────────────
    let explicitNameRecoveryPassed = false;
    const isExplicitNameQuery = !exactWorkDetection.canonicalEntity && mandatoryGates.explicitName?.required && mandatoryGates.explicitName.normalizedPhrase;

    if (isExplicitNameQuery) {
      const explicitName = mandatoryGates.explicitName!.normalizedPhrase;
      if (import.meta.env?.DEV) console.log(`🚀 [Explicit Name Recovery] Triggered for: "${explicitName}" (Initial Qualified: ${fullyQualifiedCount})`);
      
      const { supabaseProvider } = await import('./providers/supabaseProvider');
      const { registerProvisionalEntity } = await import('../atlasBootstrap/entityResolverV2');
      
      const deepCandidates = await supabaseProvider.searchExplicitNameDeep(explicitName, { benchmarkStartedAt: query.benchmarkStartedAt });
      
      let externalCandidates: ContentItem[] = [];
      try {
        const explicitQueryObj = { ...query, rawQuery: explicitName, normalizedQuery: explicitName, retrievalQuery: explicitName };
        const controller = new AbortController();
        externalCandidates = await externalSearch.search(explicitQueryObj, [], {
          signal: controller.signal,
          intent: intentData,
          providerStatuses,
          routerDecisionsOut,
          routingMode: options?.routingMode || 'shadow',
          utilitySource: options?.utilitySource,
          excludeProviders: options?.excludeProviders,
          forceProviders: ['dailymotion', 'vimeo', 'archive', 'publisher', 'discover'],
          fallbackOptions: { explicitNameRecovery: true }
        });
      } catch (err) {
        console.error(err);
      }

      let recoveryCandidates = deduplicateItems(normalizeItems([...candidates, ...deepCandidates, ...externalCandidates]));
      recoveryCandidates = calculateBaseRanking(recoveryCandidates, query, intentData);
      recoveryCandidates = calculateQualityScore(recoveryCandidates);
      recoveryCandidates = calculateMediaQualityScore(recoveryCandidates);

      // Evaluar los recuperados con el Gate riguroso
      const strictlyQualifiedRecovery = recoveryCandidates.filter(c => {
         const res = exactWorkSearchGate.evaluateMandatoryGates(c, mandatoryGates);
         return res.passed && (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40;
      });

      if (import.meta.env?.DEV) {
        console.log(`✅ [Explicit Name Recovery] Recovered ${strictlyQualifiedRecovery.length} valid results.`);
      }

      candidates = recoveryCandidates;

      if (strictlyQualifiedRecovery.length >= 8) {
         explicitNameRecoveryPassed = true;
         activePath = 'fast';
         // Registrar provisionalmente la entidad si tuvo éxito la recuperación
         registerProvisionalEntity(explicitName, 'UNKNOWN', 'query/explicit_recovery');
      }
    }

    if (!explicitNameRecoveryPassed) {
      // ── FREE DISCOVERY STAGE (Nivel 0: Publishers, RSS, Sitemaps, Archivos) ──
    const { runFreeDiscoveryStage } = await import('./freeDiscovery/freeDiscoveryStage');
    const freeDiscovery = await runFreeDiscoveryStage(query, candidates, intentData, options);

    candidates = freeDiscovery.candidates;

    if (freeDiscovery.passed && !forceExternal) {
      activePath = 'discovery_free';
    } else {
      activePath = 'discovery';
      if (import.meta.env?.DEV) console.log('🌐 [Discovery Path] Gate failed. Calling external providers via CapabilityRouter.');
      
      t = Date.now();
      const controller = new AbortController();
      let externalCandidates: ContentItem[] = [];
      try {
        // Discovery uses capability router inside externalSearch
        externalCandidates = await externalSearch.search(query, [], {
          signal: controller.signal,
          intent: intentData,
          providerStatuses,
          routerDecisionsOut,
          routingMode: options?.routingMode || 'shadow',
          utilitySource: options?.utilitySource,
          excludeProviders: options?.excludeProviders,
          forceProviders: options?.forceProviders,
          fallbackOptions: { requestId }
        });
      } catch (err) {
        console.error(err);
      }
      latencies.providers = Date.now() - t;

      if (externalCandidates.length > 0) {
        updateAcquisitionStats(externalCandidates);
        rawCandidateCount += externalCandidates.length;

        t = Date.now();
        externalCandidates = normalizeItems(externalCandidates);
        latencies.normalize += (Date.now() - t);
        
        candidates = [...candidates, ...externalCandidates];
        
        t = Date.now();
        candidates = deduplicateItems(candidates);
        latencies.dedup += (Date.now() - t);
        dedupCandidateCount = candidates.length;

        t = Date.now();
        candidates = calculateBaseRanking(candidates, query, intentData);
        latencies.relevance += (Date.now() - t);
        
        t = Date.now();
        candidates = calculateQualityScore(candidates);
        candidates = calculateMediaQualityScore(candidates);
        latencies.quality += (Date.now() - t);
      }


        // ── FASE DE GENERAL FALLBACK (Post-Routing) ─────────────────────────────────
        // Evaluamos si los candidatos cualificados son insuficientes
        const qualifiedCandidates = candidates.filter(c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40);
      
      if (qualifiedCandidates.length < 5 && activePath !== 'discovery_free') {
        if (import.meta.env?.DEV) console.log('⚠️ [Fallback] Insufficient qualified candidates. Triggering fallback providers.');
        
        try {
          const activatedProviders = routerDecisionsOut.decisions.filter(d => d.shouldActivate).map(d => d.provider);
          if (import.meta.env?.DEV) {
            console.log('--- CALLING EXTERNAL SEARCH WITH FALLBACK ---');
            console.log('arg 7:', options?.routingMode || 'shadow');
            console.log('arg 8:', typeof options?.utilitySource);
            console.log('arg 9:', { isFallback: true, activatedProviders });
          }
          let fallbackCandidates = await externalSearch.search(
            query, 
            [], 
            {
              signal: controller.signal, 
              intent: intentData, 
              providerStatuses, 
              routerDecisionsOut, // We overwrite the decisions to record fallback usage
              routingMode: options?.routingMode || 'shadow', 
              utilitySource: options?.utilitySource,
              excludeProviders: [...(options?.excludeProviders || []), ...activatedProviders],
              forceProviders: options?.forceProviders,
              fallbackOptions: { isFallback: true, activatedProviders }
            }
          );

          if (fallbackCandidates.length > 0) {
            updateAcquisitionStats(fallbackCandidates);
            rawCandidateCount += fallbackCandidates.length;

            fallbackCandidates = normalizeItems(fallbackCandidates);
            candidates = [...candidates, ...fallbackCandidates];
            
            candidates = deduplicateItems(candidates);
            dedupCandidateCount = candidates.length;

            candidates = calculateBaseRanking(candidates, query, intentData);
            candidates = calculateQualityScore(candidates);
            candidates = calculateMediaQualityScore(candidates);
          }
        } catch (err) {
          console.error('[Fallback] Error:', err);
        }
      }
    } // Fin de if (!explicitNameRecoveryPassed)
    } // Fin de la rama "else" de fastPathReady
  
    // ── DEV ENVIRONMENT ABSOLUTE FALLBACK (MOCK) ─────────────────────────
    // Política deny-by-default: los mocks solo se permiten si se explicita.
    const allowDevMocks = import.meta.env?.VITE_ALLOW_DEV_MOCKS === "true";

    if (candidates.length === 0 && allowDevMocks) {
      console.warn('⚠️ [Dev Fallback] 0 candidates found. Injecting Mock Data to prevent crash.');
      try {
        const { mockAdapter } = await import('./providers/adapters/mockAdapter');
        let mockCandidates = await mockAdapter.search(query);
        mockCandidates = normalizeItems(mockCandidates);
        mockCandidates = calculateBaseRanking(mockCandidates, query, intentData);
        mockCandidates = calculateQualityScore(mockCandidates);
        mockCandidates = calculateMediaQualityScore(mockCandidates);
        candidates = mockCandidates;
      } catch (err) {
        console.error('Failed to inject mock candidates:', err);
      }
    }
    // ──────────────────────────────────────────────────────────────────────
    
    // Save to Cache (unless readOnlyBenchmark is enabled)
    if (!options?.readOnlyBenchmark) {
      await saveCatalogItems(candidates);
      const refs: CandidateRef[] = candidates.map(c => ({
        contentId: c.id, relevanceScore: c.relevanceScore, qualityScore: c.qualityScore, youScore: c.youScore
      }));
      await saveCandidatePool({
        normalizedQuery: query.retrievalQuery, candidates: refs, queryVersion: 1, qualityVersion: 1, rankingVersion: 1,
        createdAt: Date.now(), expiresAt: Date.now() + 7200000,
      });
      
      // Fire & Forget: Background Creators Registration
      candidates.forEach(c => {
        if (c.channelId && c.channelTitle) {
          autoRegisterChannel(c.channelId, c.channelTitle, c.provider || 'youtube');
        }
      });
    }
  }

  // AI & Final Ranking
  t = Date.now();
  let top20ForRerank = applyPersonalization([...candidates]);
  top20ForRerank = applyIntentFit(top20ForRerank, query, intentData);
  
  // Boost Radar items since they are fetched explicitly for the query
  if (complexity === 'conceptual' || complexity === 'complex') {
    top20ForRerank = await applySemanticScoring(query, top20ForRerank);
  }
  
  top20ForRerank.forEach(c => {
     if (c.retrievalSource === 'radar') {
         c.relevanceScore = Math.max(c.relevanceScore || 0, 50);
     }
  });

  // Enforce Relevance & Exact Work/Title Fidelity Floor (Eligibility Gate)
  const isVerbose = import.meta.env?.VITE_SEARCH_VERBOSE === 'true';
  let filteredForEligibility = top20ForRerank;
  if (isEntitySemanticQuery) {
    filteredForEligibility = exactWorkSearchGate.filterAndDiversifyExactWorkCandidates(top20ForRerank, exactWorkDetection, 75);
  }

  let wrongEntityCount = 0;
  let wrongObjectCount = 0;
  let wrongVenueCount = 0;
  let missingVenueEvidenceCount = 0;
  let qDropCount = 0;
  let rDropCount = 0;

  const qualified = filteredForEligibility.filter(c => {
    const isQual = (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40;
    if (!isQual) {
      if ((c.qualityScore || 0) < 60) qDropCount++;
      else rDropCount++;
      return false;
    }
    
    // NEW LOGIC: Use Mandatory Gates
    const gateResult = exactWorkSearchGate.evaluateMandatoryGates(c, mandatoryGates);
    
    if (!gateResult.passed) {
      if (gateResult.reason === 'wrongEntity') wrongEntityCount++;
      else if (gateResult.reason === 'wrongObject') wrongObjectCount++;
      else if (gateResult.reason === 'constraintViolation') {
        if (gateResult.failedConstraint === 'VENUE') wrongVenueCount++;
        else missingVenueEvidenceCount++; // For lack of better bucket
      }
      return false;
    }
    
    return true;
  });
  
  qualityDrop = qDropCount;
  relevanceDrop = rDropCount + wrongEntityCount + wrongObjectCount + wrongVenueCount + missingVenueEvidenceCount;
  qualifiedCount = qualified.length;

  const entityQualifiedCount = candidates.filter(c => (c.artistFidelityScore || 0) >= 85).length;
  const objectQualifiedCount = candidates.filter(c => (c.workFidelityScore || 0) >= 75 || (c.titleFidelityScore || 0) >= 75).length;
  const constraintQualifiedCount = candidates.filter(c => (c.constraintFidelityScore || 0) >= 75).length;

  // Publisher Separation: articles go to newsContext, they don't consume the 20 slots for audiovisual
  const qualifiedArticles = qualified.filter(c => c.type === 'article');
  const qualifiedAudiovisual = qualified.filter(c => c.type !== 'article');
  
  const newsContext = applyPersonalization(qualifiedArticles).slice(0, 5);
  
  // Media Quality Gate for EXACT_ENTITY_WORK
  let finalAudiovisual = qualifiedAudiovisual;
  if (isEntityWithTitle || exactWorkDetection.isExactWork) {
     finalAudiovisual = sortByMediaQuality(finalAudiovisual, exactWorkDetection);
  } else {
     finalAudiovisual = applyPersonalization(finalAudiovisual);
  }
  
  const personalizedTop20 = finalAudiovisual.slice(0, 20);

  if (import.meta.env?.DEV) {
    console.log(`\n[Search Result Ledger]`);
    console.log(`  Query:                        "${rawQuery}"`);
    console.log(`  ResolvedBaseIntent:           ${exactWorkDetection.baseIntent}`);
    console.log(`  ResolvedEntity:               ${exactWorkDetection.canonicalEntity || 'none'}`);
    console.log(`  ResolvedObject:               ${exactWorkDetection.canonicalWork || exactWorkDetection.residualTitle || 'none'}`);
    console.log(`  ResolvedConstraints:          ${exactWorkDetection.constraints ? JSON.stringify(exactWorkDetection.constraints.map(c => `${c.type}=${c.canonicalValue}`)) : 'none'}`);
    console.log(`  AtlasRaw:                     ${rawCandidateCount}`);
    console.log(`  EntityQualified:              ${entityQualifiedCount}`);
    console.log(`  ObjectQualified:              ${objectQualifiedCount}`);
    console.log(`  ConstraintQualified:          ${constraintQualifiedCount}`);
    console.log(`  FullyQualified:               ${qualified.length}`);
    console.log(`  Returned:                     ${Math.min(qualified.length, 20)}`);
    console.log(`  Top Playable State:           ${personalizedTop20[0]?.playableState || 'none'}`);
    console.log(`  Top Media Quality:            ${personalizedTop20[0]?.mediaQualityScore || 'N/A'}`);
    console.log(`  Drop Reasons:`);
    console.log(`    wrongEntity:                ${wrongEntityCount}`);
    console.log(`    wrongObject:                ${wrongObjectCount}`);
    console.log(`    wrongVenue:                 ${wrongVenueCount}`);
    console.log(`    missingVenueEvidence:       ${missingVenueEvidenceCount}`);
    console.log(`    qualityDrop:                ${qualityDrop}`);
    console.log(`    relevanceDrop:              ${rDropCount}\n`);

    if (personalizedTop20.some(c => (c.qualityScore || 0) < 60 || (c.relevanceScore || 0) < 40)) {
      console.error("SEARCH_ELIGIBILITY_INVARIANT: Final results contain unqualified items.");
    }
  }

  // ── ExactWorkCoverageMemory & Bronze Atlas Auto-Persistence ─────────────
  if (isEntityWithTitle || exactWorkDetection.isExactWork) {
    Promise.resolve().then(async () => {
      try {
        const { ExactWorkCoverageMemory } = await import('./exactWorkCoverageMemory');
        await ExactWorkCoverageMemory.recordSearch({
          detection: exactWorkDetection,
          allQualifiedItems: qualified,
          top10Items: personalizedTop20.slice(0, 10)
        });

        await ExactWorkCoverageMemory.persistBronzeAtlasAssets(
          personalizedTop20,
          exactWorkDetection
        );
      } catch {}
    });
  }

    // ── Expansion Logic: Relationship Gap Filling ───────────────────────────
    let relatedResults: ContentItem[] = [];
    let expansionActivated = false;
    let expansionReason = '';
    let expansionEntity = '';
    
    // Configurable policy (hardcoded defaults for V1)
    const expansionPolicy: import('./types').RelationshipExpansionPolicy = {
      maxHops: 1,
      minRelationshipStrength: 0.60,
      activateOnlyOnGap: true,
      maxExpandedResults: 5,
      preserveExactResultsFirst: true
    };
    
    const isEntityObject = exactWorkDetection.baseIntent === 'ENTITY_OBJECT' || exactWorkDetection.detectionType === 'EXACT_ENTITY_WORK';
    if (isEntityObject && expansionPolicy.activateOnlyOnGap && exactEntityWorkQualified < 6) {
      expansionActivated = true;
      expansionReason = 'exact_entity_work_gap';
      expansionEntity = exactWorkDetection.canonicalEntity || '';
      
      // Filter candidates that are related but were NOT included in the exact set
      let potentialRelated = candidates.filter(c => 
        !qualified.includes(c) && 
        c.semanticMatch?.relatedEntityMatch === true && 
        (c.semanticMatch.relationshipScore || 0) >= (expansionPolicy.minRelationshipStrength * 100) &&
        (c.qualityScore || 0) >= 60
      );
      
      // Must respect exact work fidelity if this is an entity+work query
      potentialRelated = potentialRelated.filter(c => {
        const wf = c.semanticMatch?.workFidelity || (c.workFidelityScore || 0);
        const tf = c.semanticMatch?.titleFidelity || (c.titleFidelityScore || 0);
        return wf >= 75 || tf >= 75;
      });
      
      // Must respect mandatory constraints
      if (hasConstraints) {
        potentialRelated = potentialRelated.filter(c => c.semanticMatch?.isConstraintMatch || c.isConstraintMatch);
      }
      
      // Custom Cascade Sort for Related Results
      potentialRelated.sort((a, b) => {
        // 1. Mandatory Constraints (Already filtered above)
        // 2. Relationship Strength
        const relA = a.semanticMatch?.relationshipScore || 0;
        const relB = b.semanticMatch?.relationshipScore || 0;
        if (Math.abs(relA - relB) > 5) return relB - relA;
        
        // 3. Entity/Work relevance (Relevance Score)
        const revA = a.relevanceScore || 0;
        const revB = b.relevanceScore || 0;
        if (Math.abs(revA - revB) > 10) return revB - revA;
        
        // 4. Playable
        const playA = a.playableState === 'STREAM' ? 1 : 0;
        const playB = b.playableState === 'STREAM' ? 1 : 0;
        if (playA !== playB) return playB - playA;
        
        // 5. WorkSpecificity
        const specA = a.semanticMatch?.workSpecificity || 0;
        const specB = b.semanticMatch?.workSpecificity || 0;
        if (specA !== specB) return specB - specA;
        
        // 6. MediaQuality
        const mqA = a.mediaQualityScore || 0;
        const mqB = b.mediaQualityScore || 0;
        if (Math.abs(mqA - mqB) > 10) return mqB - mqA;
        
        return (b.youScore || 0) - (a.youScore || 0); // 7. Personalization
      });
      
      relatedResults = potentialRelated.slice(0, expansionPolicy.maxExpandedResults);
    }
    // ────────────────────────────────────────────────────────────────────────

  latencies.rank = Date.now() - t;
  latencies.total = Date.now() - startTime;

  if (import.meta.env?.DEV) {
    console.log(`⏱ SEARCH TIMING — Total: ${latencies.total}ms | Path: ${activePath.toUpperCase()}`);
    console.log(`   ├─ Query Intent:    ${latencies.intent || 0}ms`);
    console.log(`   ├─ Atlas / Pool:    ${latencies.atlas || 0}ms`);
    console.log(`   ├─ Normalization:   ${latencies.normalize || 0}ms`);
    console.log(`   ├─ Deduplication:   ${latencies.dedup || 0}ms`);
    console.log(`   ├─ Relevance & Q:   ${(latencies.relevance || 0) + (latencies.quality || 0)}ms`);
    console.log(`   ├─ Ext Providers:   ${latencies.providers || 0}ms`);
    console.log(`   └─ Final Ranking:   ${latencies.rank || 0}ms`);
  }


  const retrievalStats = { atlas: 0, videoMesh: 0, vimeo: 0, dailymotion: 0, radar: 0, publisher: 0, webDiscover: 0, unknown: 0, other: 0 };
  let independentCount = 0;
  let hasUnknown = false;
  
  personalizedTop20.forEach(c => {
    const rs = c.retrievalSource as string;
    if (rs === 'atlas' || rs === 'cache' || rs === 'local') retrievalStats.atlas++;
    else if (rs === 'video-mesh') retrievalStats.videoMesh++;
    else if (rs === 'vimeo-api') retrievalStats.vimeo++;
    else if (rs === 'dailymotion-api') retrievalStats.dailymotion++;
    else if (rs === 'radar') retrievalStats.radar++;
    else if (rs === 'publisher') retrievalStats.publisher++;
    else if (rs === 'web-discover') retrievalStats.webDiscover++;
    else if (!rs || rs === 'unknown') {
      retrievalStats.unknown++;
      hasUnknown = true;
    }
    else retrievalStats.other++;

    if (rs !== 'radar' && rs !== 'unknown' && !!rs) independentCount++;
  });

  const trace: SearchExecutionTrace = {
    requestId,
    latencyMs: latencies.total,
    path: activePath,
    resolvedIntent: exactWorkSearchGate.toResolvedIntent(exactWorkDetection, resolvedIntentSource),
    searchEngineReceivedResolvedIntent,
    tierDecisionBasis,
    latencies,
    retrievalStats,
    acquisitionStats,
    funnel: {
      raw: rawCandidateCount || top20ForRerank.length,
      dedup: dedupCandidateCount || top20ForRerank.length,
      qualityDrop,
      relevanceDrop,
      qualified: qualifiedCount,
      final: personalizedTop20.length
    },
    providerStatuses: typeof providerStatuses !== 'undefined' ? providerStatuses : undefined,
    independenceRate: hasUnknown ? -1 : (personalizedTop20.length > 0 ? Math.round((independentCount / personalizedTop20.length) * 100) : 0),
    routerDecisions: typeof routerDecisionsOut !== 'undefined' ? routerDecisionsOut.decisions : []
  };

  const allWithDebug = personalizedTop20.map(c => ({
    ...c,
    type: c.type || 'video',
    debugOrigin: c.retrievalSource || 'unknown_legacy_path',
    attributionId: crypto.randomUUID()
  }));

  const relatedWithDebug = relatedResults.map(c => ({
    ...c,
    type: c.type || 'video',
    debugOrigin: c.retrievalSource || 'unknown_legacy_path',
    attributionId: crypto.randomUUID()
  }));

  // ── Telemetría DiscoveryEconomy (Consola de Ahorro de Cuota) ───────────────
  if (import.meta.env?.DEV) {
    const isFromIndexedDb = pool !== null;
    const isFromAtlas = acquisitionStats.atlas > 0;
    const isFromPublisher = acquisitionStats.publisher > 0;
    const youtubeResults = (providerStatuses['youtube']?.results) || acquisitionStats.radar || 0;
    const youtubeCalled = (!!providerStatuses['youtube'] || acquisitionStats.radar > 0) && activePath !== 'discovery_free';
    const quotaSearches = (youtubeCalled && youtubeResults > 0) ? 1 : 0;
    const estimatedGoogleUnits = quotaSearches * 100;
    const radarAvoided = activePath === 'fast' || activePath === 'discovery_free';

    // 🎬 [Final Provider Mix] & 🔎 [Discovery Origin]
    const providerMix = { youtube: 0, vimeo: 0, dailymotion: 0, publisher: 0, archive: 0, peertube: 0, other: 0 };
    const discoveryOrigin = { atlas: 0, publisher: 0, vimeo: 0, dailymotion: 0, videoMesh: 0, radar: 0, other: 0 };

    personalizedTop20.forEach(c => {
      const p = (c.provider || '').toLowerCase();
      if (p === 'youtube') providerMix.youtube++;
      else if (p === 'vimeo') providerMix.vimeo++;
      else if (p === 'dailymotion') providerMix.dailymotion++;
      else if (p === 'publisher') providerMix.publisher++;
      else if (p === 'archive') providerMix.archive++;
      else if (p === 'peertube') providerMix.peertube++;
      else providerMix.other++;

      const s = (c.retrievalSource || '').toLowerCase();
      if (s === 'atlas' || s === 'cache' || s === 'local') discoveryOrigin.atlas++;
      else if (s === 'publisher') discoveryOrigin.publisher++;
      else if (s === 'vimeo-api' || s === 'vimeo') discoveryOrigin.vimeo++;
      else if (s === 'dailymotion-api' || s === 'dailymotion') discoveryOrigin.dailymotion++;
      else if (s === 'video-mesh') discoveryOrigin.videoMesh++;
      else if (s === 'radar') discoveryOrigin.radar++;
      else discoveryOrigin.other++;
    });

    console.log(`🎬 [Final Provider Mix] YouTube: ${providerMix.youtube} | Vimeo: ${providerMix.vimeo} | Dailymotion: ${providerMix.dailymotion}${providerMix.publisher ? ` | Publisher: ${providerMix.publisher}` : ''}${providerMix.archive ? ` | Archive: ${providerMix.archive}` : ''}${providerMix.peertube ? ` | PeerTube: ${providerMix.peertube}` : ''}${providerMix.other ? ` | Otros: ${providerMix.other}` : ''}`);
    console.log(`🔎 [Discovery Origin] Atlas: ${discoveryOrigin.atlas} | Publisher: ${discoveryOrigin.publisher} | Vimeo: ${discoveryOrigin.vimeo} | Dailymotion: ${discoveryOrigin.dailymotion}${discoveryOrigin.videoMesh ? ` | VideoMesh: ${discoveryOrigin.videoMesh}` : ''} | Radar: ${discoveryOrigin.radar}${discoveryOrigin.other ? ` | Otros: ${discoveryOrigin.other}` : ''}`);

    if (personalizedTop20.length > 0) {
      console.table(personalizedTop20.map(v => ({
        title: (v.title || '').slice(0, 45),
        provider: v.provider,
        source: v.retrievalSource,
        Q: v.qualityScore,
        R: v.relevanceScore,
        YS: v.youScore
      })));
    }


    console.groupCollapsed(`💰 [DiscoveryEconomy] "${query.rawQuery}" — Path: ${activePath.toUpperCase()} | Radar: ${youtubeCalled && youtubeResults > 0 ? `EXECUTED (1 search ≈ 100 u, +${youtubeResults} absorbed)` : 'SKIPPED (0 u)'}`);
    console.log('Query:', query.rawQuery);
    console.log('🔭 Radar Admission:', {
      qualifiedCount: qualifiedCount,
      resultSufficient: qualifiedCount >= 6,
      decision: youtubeCalled && youtubeResults > 0 ? 'AUTHORIZED' : 'SKIPPED_OR_DENIED',
      quotaUnits: estimatedGoogleUnits,
      blockedBy: activePath === 'fast' ? 'fast_path_gate' : (activePath === 'discovery_free' ? 'free_discovery_stage' : (youtubeCalled && youtubeResults > 0 ? 'none' : 'opportunity_gate_or_sufficiency'))
    });
    console.log('Sources:', {
      ramCache: false,
      indexedDb: isFromIndexedDb,
      atlas: isFromAtlas,
      publisherVideo: isFromPublisher,
      youtubeRadar: youtubeCalled && youtubeResults > 0
    });
    console.log('Candidates:', {
      atlasRetrieved: isFromAtlas ? (acquisitionStats.atlas + (acquisitionStats.videoMesh || 0)) : 0,
      atlasQualified: qualifiedCount,
      eligibilityDropped: (qualityDrop || 0) + (relevanceDrop || 0),
      totalReturned: allWithDebug.length,
      fromAtlasOrLocal: acquisitionStats.atlas + acquisitionStats.videoMesh,
      fromPublishers: acquisitionStats.publisher,
      fromYouTubeRadar: acquisitionStats.radar
    });
    console.log('Radar Execution:', {
      planned: activePath === 'discovery',
      executed: youtubeCalled && youtubeResults > 0,
      quotaSearches: quotaSearches,
      estimatedGoogleUnits: estimatedGoogleUnits,
      absorbedCount: acquisitionStats.radar,
      blockedBy: activePath === 'fast' ? 'fast_path_gate' : (activePath === 'discovery_free' ? 'free_discovery_stage' : (youtubeCalled && youtubeResults > 0 ? 'none' : 'router_or_recency_guard')),
      radarAvoided
    });
    console.groupEnd();

  }


  // Asynchronously save candidate pool to local IndexedDB for near-instant / zero-quota repeats
  if (allWithDebug.length > 0) {
    Promise.resolve().then(async () => {
      try {
        await saveCatalogItems(allWithDebug);
        await saveCandidatePool({
          normalizedQuery: query.retrievalQuery,
          candidates: allWithDebug.map(c => ({ contentId: c.id, youScore: c.youScore || 0 })),
          expiresAt: Date.now() + 6 * 3600 * 1000, // 6h TTL
          createdAt: Date.now()
        });
      } catch {}
    });
  }
  
  // ── Stage 8.4 & 8.5B-3.3: Provider Telemetry Logging & Impressions ──
  Promise.resolve().then(async () => {
    try {
      const { supabase } = await import('../supabase');
      const eventsToInsert = [];
      const impressionsToInsert = [];
      
      // Impressions mapping
      allWithDebug.forEach((c, index) => {
        impressionsToInsert.push({
          id: c.attributionId,
          request_id: requestId,
          content_id: c.id,
          provider: c.provider || 'unknown',
          retrieval_source: c.retrievalSource,
          position: index + 1,
          shown_at: new Date().toISOString()
        });
      });
      
      // Calculate top 5 and top 20 counts per provider for this request
      const top20ProviderCounts: Record<string, number> = {};
      const top5ProviderCounts: Record<string, number> = {};
      
      personalizedTop20.forEach((c, index) => {
        const p = c.provider || 'unknown';
        top20ProviderCounts[p] = (top20ProviderCounts[p] || 0) + 1;
        if (index < 5) {
          top5ProviderCounts[p] = (top5ProviderCounts[p] || 0) + 1;
        }
      });
      
      // If it was Fast Path, we might not have router decisions for external. We log Atlas.
      if (activePath === 'fast') {
        eventsToInsert.push({
          request_id: requestId,
          provider: 'atlas',
          intent: intentData?.primaryIntent,
          topic_cluster: intentData?.entities?.[0] || 'general',
          language: 'es', // default or extracted
          freshness: query.freshness,
          content_format: 'video',
          selection_reason: 'fast_path',
          static_fit: 95,
          dynamic_score: 95,
          was_selected: true,
          was_called: true,
          status: 'success',
          latency_ms: latencies.atlas,
          raw_candidates: rawCandidateCount,
          eligible_candidates: qualifiedCount,
          top20_count: top20ProviderCounts['atlas'] || 0,
          top5_count: top5ProviderCounts['atlas'] || 0,
          created_at: new Date().toISOString()
        });
      } else if (typeof routerDecisionsOut !== 'undefined' && routerDecisionsOut.decisions) {
        for (const decision of routerDecisionsOut.decisions) {
          const providerId = decision.provider;
          const wasSelected = decision.shouldActivate;
          const statusObj = providerStatuses && providerStatuses[providerId];
          const wasCalled = !!statusObj;
          
          eventsToInsert.push({
            request_id: requestId,
            provider: providerId,
            intent: intentData?.primaryIntent,
            topic_cluster: intentData?.entities?.[0] || 'general',
            language: 'es',
            freshness: query.freshness,
            content_format: 'video',
            selection_reason: decision.reason,
            static_fit: decision.staticFit || decision.score,
            dynamic_score: decision.dynamicScore || decision.score,
            learned_utility: decision.learnedUtility || decision.score,
            health_score: decision.healthScore || 100,
            was_selected: wasSelected,
            was_called: wasCalled,
            status: statusObj ? statusObj.status : 'skipped',
            latency_ms: wasCalled ? latencies.providers : 0,
            raw_candidates: statusObj ? statusObj.results : 0,
            eligible_candidates: statusObj ? statusObj.results : 0, // simplified for V1
            top20_count: top20ProviderCounts[providerId] || 0,
            top5_count: top5ProviderCounts[providerId] || 0,
            exploration: decision.exploration || false,
            created_at: new Date().toISOString()
          });
        }
      }

      if (eventsToInsert.length > 0 && options?.trafficClass !== 'benchmark') {
        const { error } = await supabase.from('telemetry_provider_events').insert(eventsToInsert);
        if (error && import.meta.env?.DEV) console.warn('[Telemetry] Failed to save provider events:', error);
      }

      if (impressionsToInsert.length > 0 && options?.trafficClass !== 'benchmark') {
        const { error: attrErr } = await supabase.rpc('log_search_attributions', { p_attributions: impressionsToInsert });
        if (attrErr && import.meta.env?.DEV) console.warn('[Telemetry] Failed to save search impressions:', attrErr);
      }
    } catch (e) {
      if (import.meta.env?.DEV) console.warn('[Telemetry] Exception saving telemetry:', e);
    }
  });

  // Atlas Discovery AI V1 — Zero-Latency Gap Hook
  try {
    const { analyzeAtlasGap, enqueueDiscoveryMission, recordFastPathQuery, recordGapQuery } = await import('../atlasDiscoveryAI');
    const covScore = trace.acquisitionStats.atlas > 0 ? (trace.retrievalStats.atlas / Math.max(1, trace.acquisitionStats.atlas)) : 0;
    const gapRequest = analyzeAtlasGap({
      query: rawQuery,
      atlasResultCount: trace.acquisitionStats.atlas,
      qualityQualifiedCount: trace.funnel.qualified,
      relevanceQualifiedCount: trace.funnel.final,
      coverageScore: covScore,
      qualityScore: 1.0,
      entities: (intentData?.entities || []).map(e => typeof e === 'string' ? e : e.name),
      works: intentData?.requiredConcepts || []
    });

    if (gapRequest.gaps.length > 0 && gapRequest.coverageScore < 0.55) {
      recordGapQuery();
      void enqueueDiscoveryMission(gapRequest);
    } else {
      recordFastPathQuery();
    }
  } catch {
    // Non-blocking
  }

  return {
    all: allWithDebug,
    videos: allWithDebug.filter(c => c.type === 'video'),
    channels: allWithDebug.filter(c => c.type === 'channel' || c.type === 'playlist'),
    relatedResults: relatedWithDebug,
    coverage: {
      exactQualified: exactEntityWorkQualified,
      playableExact: personalizedTop20.filter(c => c.playableState === 'STREAM').length,
      gapDetected: expansionActivated,
      gapType: expansionReason
    },
    expansion: {
      activated: expansionActivated,
      reason: expansionReason,
      sourceEntity: expansionEntity,
      relationsUsed: Array.from(new Set(relatedWithDebug.map(c => c.semanticMatch?.relationshipType).filter(Boolean) as string[]))
    },
    newsContext: newsContext.length > 0 ? newsContext : undefined,
    overview,
    intentData,
    trace
  };
}
