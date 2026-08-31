/**
 * searchTestRunner.ts — YouApp Search Test 1.0
 *
 * Corre N queries contra el motor real y mide:
 *   - Top20 Success Rate
 *   - 0-Result Rate
 *   - Atlas Independence Rate (% de queries sin usar YouTube Radar)
 *   - Provider Diversity
 *   - Avg Query Latency
 *   - Avg YouScore
 *   - Avg Metadata Completeness
 *   - Duplicate Rate
 *   - CapabilityRouter activation log
 */

import { executeSearch } from './searchEngine';

// ── 500 Queries de prueba ─────────────────────────────────────────────────────

export const TEST_QUERIES: { query: string; category: string; expectedIntent: string }[] = [
  { query: 'messi', category: 'deporte', expectedIntent: 'ENTITY' },
  { query: 'dólar hoy argentina', category: 'noticias', expectedIntent: 'NEWS' },
  { query: 'openai noticias recientes', category: 'noticias', expectedIntent: 'NEWS' },
  { query: 'elecciones estados unidos 2024', category: 'noticias', expectedIntent: 'NEWS' },
  { query: 'oscar 2024', category: 'entretenimiento', expectedIntent: 'GENERAL' },
  { query: 'olimpiadas paris 2024', category: 'deporte', expectedIntent: 'GENERAL' },
  { query: 'macroeconomia global analisis', category: 'noticias', expectedIntent: 'NEWS' },
  { query: 'derechos humanos noticias', category: 'noticias', expectedIntent: 'NEWS' },
  { query: 'taylor swift', category: 'musica', expectedIntent: 'ENTITY' },
  { query: 'mundial 2026', category: 'deporte', expectedIntent: 'GENERAL' },
];

// ── Métricas ──────────────────────────────────────────────────────────────────

export interface QueryResult {
  query: string;
  category: string;
  expectedIntent: string;
  detectedIntent?: string;
  temporalIntent?: string;
  resultCount: number; // raw result count
  latencyMs: number;
  topProviders: string[];
  usedYoutubeRadar: boolean;
  avgYouScore: number;
  avgMetadataCompleteness: number;
  duplicateRate: number;
  success: boolean;
  
  // New Stage 8.5A Metrics
  qualifiedCandidates: number;
  qualityTop20Coverage: number;
  eligibilityRate: number;
  relevantAt5: number;
  
  // Añadido para volcado de trace detallado
  funnel?: any;
  top5?: any[];
  newsContext?: any[];

  error?: string;
}

export interface TestSummary {
  totalQueries: number;
  completedQueries: number;
  successRate: number;           // % con ≥1 resultado final
  avgQualityTop20Coverage: number;
  avgEligibilityRate: number;
  avgRelevantAt5: number;
  
  top20SuccessRate: number;      // legacy % con ≥20 resultados
  zeroResultRate: number;        // % con 0 resultados finales
  independenceRate: number;      // % que NO usó YouTube Radar
  avgLatencyMs: number;
  avgYouScore: number;
  avgMetadataCompleteness: number;
  avgResultCount: number;
  providerDistribution: Record<string, number>;
  categoryBreakdown: Record<string, { success: number; total: number; avgResults: number }>;
  failedQueries: string[];
}

// ── Runner ────────────────────────────────────────────────────────────────────

export type TestProgressCallback = (
  current: number,
  total: number,
  lastResult: QueryResult,
  partialSummary: TestSummary
) => void;

export async function runSearchTest(
  queries: string[],
  onProgress: (current: number, total: number, lastResult: QueryResult, partialSummary: TestSummary) => void,
  signal?: AbortSignal,
  concurrency = 2,
  routingMode: 'static' | 'shadow' | 'dynamic' = 'shadow'
): Promise<{ results: QueryResult[], summary: TestSummary }> {
  const results: QueryResult[] = [];

  // Procesar en lotes de `concurrency` para balancear velocidad y carga
  for (let i = 0; i < queries.length; i += concurrency) {
    if (signal?.aborted) break;

    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(q => runSingleQuery(q, routingMode, signal))
    );

    results.push(...batchResults);

    if (onProgress) {
      const summary = buildSummary(results, queries.length);
      onProgress(results.length, queries.length, batchResults[batchResults.length - 1], summary);
    }

    // Pequeña pausa entre lotes para no saturar
    if (i + concurrency < queries.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { results, summary: buildSummary(results, queries.length) };
}

async function runSingleQuery(
  q: typeof TEST_QUERIES[0],
  routingMode: 'static' | 'shadow' | 'dynamic',
  signal?: AbortSignal
): Promise<QueryResult> {
  const startTime = Date.now();
  try {
    const searchRes = await executeSearch(q.query, {
      signal,
      allowFastPath: false,
      routingMode
    });
    const { all, intentData } = searchRes;
    const latencyMs = Date.now() - startTime;

    const providers = [...new Set(all.map(c => (c as any).provider || 'unknown'))];
    const usedRadar = providers.includes('youtube') || all.some(c => (c as any).source === 'radar');

    // Detectar duplicados por título similar
    const titles = all.map(c => c.title?.toLowerCase().slice(0, 40) || '');
    const uniqueTitles = new Set(titles);
    const duplicateRate = titles.length > 0
      ? Math.round(((titles.length - uniqueTitles.size) / titles.length) * 100)
      : 0;

    const avgYouScore = all.length > 0
      ? Math.round(all.reduce((s, c) => s + ((c as any).youScore || 0), 0) / all.length)
      : 0;

    const avgMeta = all.length > 0
      ? Math.round(all.reduce((s, c) => s + ((c as any).metadataCompleteness || 50), 0) / all.length)
      : 0;

    // Stage 8.5A Metrics
    const funnel = searchRes.trace.funnel;
    const qualifiedCandidates = funnel.qualified;
    const dedupedCandidates = funnel.dedup > 0 ? funnel.dedup : 1;
    const eligibilityRate = Math.round((qualifiedCandidates / dedupedCandidates) * 100);
    const qualityTop20Coverage = Math.round((Math.min(funnel.final, 20) / 20) * 100);
    const relevantAt5 = searchRes.videos.slice(0, 5).filter(c => (c.relevanceScore || 0) >= 55).length;

    return {
      query: q.query,
      category: q.category,
      expectedIntent: q.expectedIntent,
      detectedIntent: intentData?.primaryIntent,
      temporalIntent: intentData?.temporal?.intent,
      resultCount: all.length,
      latencyMs,
      topProviders: providers.slice(0, 5),
      usedYoutubeRadar: usedRadar,
      avgYouScore,
      avgMetadataCompleteness: avgMeta,
      duplicateRate,
      success: all.length > 0,
      qualifiedCandidates,
      qualityTop20Coverage,
      eligibilityRate,
      relevantAt5,
      funnel,
      top5: searchRes.videos.slice(0, 5),
      newsContext: searchRes.newsContext
    };
  } catch (err: any) {
    return {
      query: q.query,
      category: q.category,
      expectedIntent: q.expectedIntent,
      detectedIntent: 'UNKNOWN',
      temporalIntent: 'UNKNOWN',
      resultCount: 0,
      latencyMs: Date.now() - startTime,
      topProviders: [],
      usedYoutubeRadar: false,
      avgYouScore: 0,
      avgMetadataCompleteness: 0,
      duplicateRate: 0,
      success: false,
      qualifiedCandidates: 0,
      qualityTop20Coverage: 0,
      eligibilityRate: 0,
      relevantAt5: 0,
      error: err.message,
    };
  }
}

function buildSummary(results: QueryResult[], totalQueries: number): TestSummary {
  if (results.length === 0) {
    return {
      totalQueries, completedQueries: 0,
      successRate: 0, top20SuccessRate: 0, zeroResultRate: 0,
      independenceRate: 0, avgLatencyMs: 0, avgYouScore: 0,
      avgMetadataCompleteness: 0, avgResultCount: 0,
      providerDistribution: {}, categoryBreakdown: {}, failedQueries: []
    };
  }

  const successful = results.filter(r => r.success);
  const zeroResult = results.filter(r => r.resultCount === 0);
  const top20 = results.filter(r => r.resultCount >= 20);
  const independent = results.filter(r => !r.usedYoutubeRadar);

  // Provider distribution
  const providerDist: Record<string, number> = {};
  results.forEach(r => {
    r.topProviders.forEach(p => {
      providerDist[p] = (providerDist[p] || 0) + 1;
    });
  });

  // Category breakdown
  const catBreakdown: Record<string, { success: number; total: number; avgResults: number }> = {};
  results.forEach(r => {
    if (!catBreakdown[r.category]) catBreakdown[r.category] = { success: 0, total: 0, avgResults: 0 };
    catBreakdown[r.category].total++;
    if (r.success) catBreakdown[r.category].success++;
    catBreakdown[r.category].avgResults = Math.round(
      (catBreakdown[r.category].avgResults * (catBreakdown[r.category].total - 1) + r.resultCount) /
      catBreakdown[r.category].total
    );
  });

  return {
    totalQueries,
    completedQueries: results.length,
    successRate: Math.round((successful.length / results.length) * 100),
    avgQualityTop20Coverage: Math.round(results.reduce((s, r) => s + r.qualityTop20Coverage, 0) / results.length),
    avgEligibilityRate: Math.round(results.reduce((s, r) => s + r.eligibilityRate, 0) / results.length),
    avgRelevantAt5: Number((results.reduce((s, r) => s + r.relevantAt5, 0) / results.length).toFixed(1)),
    
    top20SuccessRate: Math.round((top20.length / results.length) * 100),
    zeroResultRate: Math.round((zeroResult.length / results.length) * 100),
    independenceRate: Math.round((independent.length / results.length) * 100),
    avgLatencyMs: Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length),
    avgYouScore: Math.round(results.reduce((s, r) => s + r.avgYouScore, 0) / results.length),
    avgMetadataCompleteness: Math.round(results.reduce((s, r) => s + r.avgMetadataCompleteness, 0) / results.length),
    avgResultCount: Math.round(results.reduce((s, r) => s + r.resultCount, 0) / results.length),
    providerDistribution: providerDist,
    categoryBreakdown: catBreakdown,
    failedQueries: zeroResult.map(r => r.query),
  };
}
