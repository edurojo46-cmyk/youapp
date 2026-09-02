import type { SearchQuery, ContentItem, CandidatePool, CandidateRef, SearchUpdate, SearchPhase } from './types';
import { parseQuery } from './queryEngine';
import { analyzeQuery } from './intentDetector';
import { retrieveInternalCandidates } from './retrievalEngine';
import { externalSearch } from './providers/externalSearch';
import { normalizeItems } from './normalizationEngine';
import { deduplicateItems } from './deduplicationEngine';
import { calculateQualityScore } from './qualityEngine';
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
import type { IntentType } from './types';
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
  queryContext?: {
    source: 'tv_signal' | 'user' | 'unknown';
    parentTopic?: string;
    originalPrompt?: string;
    intentHint?: IntentType;
    needsDocumentary?: boolean;
    entities?: any[];
  };
  excludeProviders?: string[];
  forceProviders?: string[];
}


export interface SearchExecutionTrace {
  requestId: string;
  latencyMs: number;
  path: 'fast' | 'discovery' | 'radar';
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
  let activePath: 'fast' | 'discovery' | 'radar' = 'discovery';

  if (!rawQuery.trim()) {
    return { all: [], videos: [], channels: [], trace: {} as any };
  }

  let t = Date.now();
  const query = parseQuery(rawQuery);
  query.forceExternal = forceExternal;
  if (options?.queryContext) {
    query.context = options.queryContext;
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
  const exactWorkDetection = exactWorkSearchGate.detectExactWork(query.rawQuery, intentData);

  if (!forceExternal && !options?.bypassCandidatePool) {
    try {
      pool = await getCandidatePool(query.normalizedQuery);
      if (pool && pool.candidates && pool.candidates.length > 0) {
        // Si es una ExactWork y el pool en caché tiene menos de 10 candidatos, refrescar desde Atlas físico
        if (exactWorkDetection.isExactWork && pool.candidates.length < 10) {
          pool = null;
        } else {
          const cachedIds = pool.candidates.map(c => c.contentId);
          candidates = await getCatalogItems(cachedIds);
          if (candidates.length > 0) {
            if (import.meta.env?.DEV) console.log(`⚡ [CandidatePool Cache] Loaded ${candidates.length} candidates for "${query.normalizedQuery}"`);
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

  // Phase 5: Quality
  t = Date.now();
  candidates = calculateQualityScore(candidates);
  latencies.quality = Date.now() - t;

  // Phase 6: FAST PATH GATE (Graduated 3-Tier Early-Stop Strategy)
  t = Date.now();
  
  let poolForFastPath = candidates;
  if (exactWorkDetection.isExactWork) {
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

  // ── Graduated 3-Tier Early-Stop Strategy ──────────────────────────────
  // Cuando la query especifica Artista + Obra (ej. "calle 13 la perla", "soda stereo de musica ligera"),
  // los tiers deben basarse estrictamente en entityWorkQualifiedCount (artista original + obra),
  // NUNCA en covers o tributos que sólo coinciden con la obra.
  const hasSpecificArtist = !!exactWorkDetection.canonicalEntity;
  const effectiveFastPathCandidates = hasSpecificArtist
    ? qualifiedAtlasCandidates.filter(c => (c as any).isExactEntityWork === true)
    : qualifiedAtlasCandidates;

  // Tier 1: >= 10 Entity+Work calificados -> STRONG FAST PATH (0ms externo)
  // Tier 2: 6 - 9 Entity+Work calificados -> FAST PATH (Inmediato + Background Harvest)
  // Tier 3: < 6 Entity+Work calificados  -> HYBRID DISCOVERY (Externo + Background Discovery AI)
  const isStrongFastPath = effectiveFastPathCandidates.length >= 10 && top5Consistent;
  const isFastPathWithBackgroundHarvest = effectiveFastPathCandidates.length >= 6 && effectiveFastPathCandidates.length < 10 && top5Consistent;
  const fastPathReady = (isStrongFastPath || isFastPathWithBackgroundHarvest) && !forceExternal;

  latencies.fastPathEvaluation = Date.now() - t;

  if (fastPathReady) {
    activePath = 'fast';

    if (isFastPathWithBackgroundHarvest) {
      // 6-9 resultados de artista+obra: responder de inmediato al usuario y lanzar misión en background
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
            works: [exactWorkDetection.canonicalWork || '']
          });
          if (gapRequest && gapRequest.gaps.length > 0) {
            void enqueueDiscoveryMission(gapRequest);
          }
        } catch {}
      });
    }

    if (import.meta.env?.DEV) {
      console.log(`⚡ [Fast Path Tier ${isStrongFastPath ? '1 (Strong)' : '2 (Harvest Backfill)'}] Gate PASSED ${exactWorkDetection.isExactWork ? `[ExactWork: ${exactWorkDetection.canonicalWork}]` : ''}`);
      console.log(`  Source:             ${pool ? 'CandidatePool' : 'Atlas Physical'}`);
      console.log(`  Raw candidates:     ${rawPoolCount}`);
      console.log(`  Quality passed:     ${qualityPassedCount}`);
      console.log(`  Relevance passed:   ${relevancePassedCount}`);
      console.log(`  Qualified (Q60/R40):${qualifiedAtlasCandidates.length}`);
      console.log(`  Top5 consistent:    ${top5Consistent}`);
    }
  } else {
    if (import.meta.env?.DEV) {
      console.log(`⚡ [CandidatePool/Atlas Gate Tier 3 (Fallback)]`);
      console.log(`  Source:             ${pool ? 'CandidatePool' : 'Atlas Physical'}`);
      console.log(`  Retrieved:          ${rawPoolCount}`);
      console.log(`  Qualified:          ${qualifiedAtlasCandidates.length}/10 (Dropped: ${rawPoolCount - qualifiedAtlasCandidates.length})`);
      console.log(`  Top5 consistent:    ${top5Consistent}`);
      console.log(`⚠️ FAST PATH INSUFFICIENT (<6 qualified). Continuing to free discovery / external + Enqueuing Discovery AI background mission...`);
    }

    // TIER 3: Siempre encolar Discovery AI en background para cerrar permanentemente el hueco para futuras búsquedas
    if (exactWorkDetection.isExactWork) {
      Promise.resolve().then(async () => {
        try {
          const { analyzeAtlasGap, enqueueDiscoveryMission } = await import('../atlasDiscoveryAI');
          const gapRequest = analyzeAtlasGap({
            query: rawQuery,
            atlasResultCount: qualifiedAtlasCandidates.length,
            qualityQualifiedCount: qualifiedAtlasCandidates.length,
            relevanceQualifiedCount: qualifiedAtlasCandidates.length,
            coverageScore: qualifiedAtlasCandidates.length / 10,
            qualityScore: 1.0,
            entities: [exactWorkDetection.canonicalEntity || ''],
            works: [exactWorkDetection.canonicalWork || '']
          });
          if (gapRequest && gapRequest.gaps.length > 0) {
            void enqueueDiscoveryMission(gapRequest);
          }
        } catch {}
      });
    }

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
          }
        } catch (err) {
          console.error('[Fallback] Error:', err);
        }
      }
    }
  
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
        candidates = mockCandidates;
      } catch (err) {
        console.error('Failed to inject mock candidates:', err);
      }
    }
    // ──────────────────────────────────────────────────────────────────────
    
    // Save to Cache
    await saveCatalogItems(candidates);
    const refs: CandidateRef[] = candidates.map(c => ({
      contentId: c.id, relevanceScore: c.relevanceScore, qualityScore: c.qualityScore, youScore: c.youScore
    }));
    await saveCandidatePool({
      normalizedQuery: query.normalizedQuery, candidates: refs, queryVersion: 1, qualityVersion: 1, rankingVersion: 1,
      createdAt: Date.now(), expiresAt: Date.now() + 7200000,
    });
    
    // Fire & Forget: Background Creators Registration
    candidates.forEach(c => {
      if (c.channelId && c.channelTitle) {
        autoRegisterChannel(c.channelId, c.channelTitle, c.provider || 'youtube');
      }
    });
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

  // Enforce Relevance & Exact Work Fidelity Floor (Eligibility Gate)
  const isVerbose = import.meta.env?.VITE_SEARCH_VERBOSE === 'true';
  let filteredForEligibility = top20ForRerank;
  if (exactWorkDetection.isExactWork) {
    filteredForEligibility = exactWorkSearchGate.filterAndDiversifyExactWorkCandidates(top20ForRerank, exactWorkDetection, 75);
  }

  const qualified = filteredForEligibility.filter(c => {
    const isQual = (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40;
    if (!isQual && isVerbose && import.meta.env?.DEV) {
      console.log(`[Eligibility Drop] ${c.title} - Q:${c.qualityScore} R:${c.relevanceScore}`);
    }
    return isQual;
  });
  
  qualityDrop = top20ForRerank.length - top20ForRerank.filter(c => (c.qualityScore || 0) >= 60).length;
  relevanceDrop = top20ForRerank.filter(c => (c.qualityScore || 0) >= 60).length - qualified.length;
  qualifiedCount = qualified.length;

  if (import.meta.env?.DEV && top20ForRerank.length > qualified.length) {
    console.log(`📉 [Eligibility Summary] Evaluados: ${top20ForRerank.length} | Calificados: ${qualified.length} | Descartados: ${top20ForRerank.length - qualified.length} (Q-Drop: ${qualityDrop}, R-Drop: ${relevanceDrop})`);
  }
  
  // Publisher Separation: articles go to newsContext, they don't consume the 20 slots for audiovisual
  const qualifiedArticles = qualified.filter(c => c.type === 'article');
  const qualifiedAudiovisual = qualified.filter(c => c.type !== 'article');
  
  const newsContext = applyPersonalization(qualifiedArticles).slice(0, 5);
  const personalizedTop20 = applyPersonalization(qualifiedAudiovisual).slice(0, 20);
  
  if (import.meta.env?.DEV) {
    if (personalizedTop20.some(c => (c.qualityScore || 0) < 60 || (c.relevanceScore || 0) < 40)) {
      console.error("SEARCH_ELIGIBILITY_INVARIANT: Final results contain unqualified items.");
    }
  }

  // ── ExactWorkCoverageMemory & Bronze Atlas Auto-Persistence ─────────────
  if (exactWorkDetection.isExactWork) {
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

        const { HarvestDedupeIndex } = await import('../atlasHarvester/harvestDedupeIndex');
        await HarvestDedupeIndex.incrementalRefresh();
      } catch {}
    });
  }

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
          normalizedQuery: query.normalizedQuery,
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
      entities: intentData?.entities,
      works: intentData?.concepts
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
    newsContext: newsContext.length > 0 ? newsContext : undefined,
    overview,
    intentData,
    trace
  };
}
