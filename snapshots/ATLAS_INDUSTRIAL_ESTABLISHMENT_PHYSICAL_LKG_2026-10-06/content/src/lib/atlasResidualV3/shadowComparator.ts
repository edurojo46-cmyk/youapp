/**
 * shadowComparator.ts — Ejecutor Dual & Comparador de Shadow Production (V2 Control vs V3 Shadow)
 * 
 * Principios Inviolables:
 * 1. SEARCH_ENGINE_SERVING_VERSION = 'v2' (Lo que ve el usuario final)
 * 2. SEARCH_ENGINE_SHADOW_VERSION = 'v3' (Ejecuta en segundo plano, sin impacto de latencia ni de UX)
 * 3. Ambos motores evalúan exactamente el mismo conjunto de candidatos (candidateSetHash).
 * 4. Mide V3RankingWinRate vs V3RegressionRate sobre la interacción real del usuario.
 */

import * as crypto from 'crypto';
import type {
  ShadowLogEntry,
  ComparisonOutcome,
  DomainCategory,
  ResolutionRoute,
  ShadowDailyReport,
  DomainMetricsBreakdown
} from './typesV3';

export class ShadowComparatorEngine {
  private logEntries: ShadowLogEntry[] = [];
  public servingVersion: 'v2' = 'v2';
  public shadowVersion: 'v3' = 'v3';

  /**
   * Genera el hash criptográfico del set de candidatos recuperados de Atlas
   */
  computeCandidateSetHash(candidateIds: string[]): string {
    return crypto.createHash('sha256').update(candidateIds.sort().join('|')).digest('hex').slice(0, 16);
  }

  /**
   * Evalúa el resultado comparativo entre V2 y V3 a partir de la interacción del usuario
   */
  evaluateComparisonOutcome(
    v2Top5: string[],
    v3Top5: string[],
    clickPosition?: number,
    watchTimeSeconds = 0,
    watchedRatio = 0,
    reformulated = false
  ): ComparisonOutcome {
    if (v2Top5.length === 0 && v3Top5.length === 0) return 'TIE';
    if (v2Top5.join('|') === v3Top5.join('|')) return 'TIE';

    // Si el usuario hizo click y el item estaba en una posición MEJOR en V3 que en V2:
    if (typeof clickPosition === 'number' && (watchTimeSeconds >= 45 || watchedRatio >= 0.40) && !reformulated) {
      const clickedItem = v2Top5[clickPosition];
      const v3Position = v3Top5.indexOf(clickedItem);

      if (v3Position !== -1 && v3Position < clickPosition) {
        return 'V3_WIN'; // V3 rankeó el video elegido más arriba
      }
      if (v3Position !== -1 && v3Position > clickPosition) {
        return 'V2_WIN'; // V2 rankeó el video elegido más arriba
      }
    }

    // Si V2 entregó 0 resultados o causó reformulación, pero V3 tenía candidatos en top-3:
    if (reformulated && v3Top5.length >= 3) {
      return 'V3_WIN';
    }

    return 'TIE';
  }

  /**
   * Registra una consulta en el log de Shadow Production
   */
  logSearch(entry: Omit<ShadowLogEntry, 'comparisonOutcome'> & { comparisonOutcome?: ComparisonOutcome }) {
    const outcome = entry.comparisonOutcome || this.evaluateComparisonOutcome(
      entry.v2Top5,
      entry.v3Top5,
      entry.clickPosition,
      entry.watchTimeSeconds,
      entry.watchedRatio,
      entry.reformulationWithin15s
    );

    this.logEntries.push({
      ...entry,
      comparisonOutcome: outcome
    });
  }

  /**
   * Genera el reporte diario consolidado de Shadow Production
   */
  generateDailyReport(dayNumber: number): ShadowDailyReport {
    const total = Math.max(1, this.logEntries.length);

    let v2FastCount = 0;
    let v2SatisfiedCount = 0;
    let v2Top5PlayCount = 0;

    let v3Wins = 0;
    let v2Wins = 0;
    let ties = 0;

    let zeroResultCount = 0;
    let reformulationCount = 0;
    let playabilityFailureCount = 0;

    const routesCount: Record<ResolutionRoute, number> = {
      ATLAS_FAST_PATH: 0,
      FREE_PROVIDER_FALLBACK: 0,
      DISCOVERY_EXTERNAL: 0,
      YOUTUBE_SEARCH_AIRBAG: 0,
      UNRESOLVED: 0
    };

    const latencies: number[] = [];

    const domainStats: Record<DomainCategory, { total: number; fast: number; satisfied: number; top5Play: number }> = {
      music: { total: 0, fast: 0, satisfied: 0, top5Play: 0 },
      news: { total: 0, fast: 0, satisfied: 0, top5Play: 0 },
      sports: { total: 0, fast: 0, satisfied: 0, top5Play: 0 },
      archive: { total: 0, fast: 0, satisfied: 0, top5Play: 0 },
      entertainment: { total: 0, fast: 0, satisfied: 0, top5Play: 0 },
      longtail: { total: 0, fast: 0, satisfied: 0, top5Play: 0 },
      freshness: { total: 0, fast: 0, satisfied: 0, top5Play: 0 }
    };

    for (const e of this.logEntries) {
      latencies.push(e.latencyMs);
      routesCount[e.resolutionRoute]++;

      if (e.fastPath) v2FastCount++;
      if (e.playStarted && typeof e.clickPosition === 'number' && e.clickPosition < 5 && (e.watchTimeSeconds >= 45 || e.watchedRatio >= 0.40) && !e.reformulationWithin15s) {
        v2SatisfiedCount++;
      }
      if (e.playStarted && typeof e.clickPosition === 'number' && e.clickPosition < 5) {
        v2Top5PlayCount++;
      }

      if (e.comparisonOutcome === 'V3_WIN') v3Wins++;
      else if (e.comparisonOutcome === 'V2_WIN') v2Wins++;
      else ties++;

      if (e.zeroResults) zeroResultCount++;
      if (e.reformulationWithin15s) reformulationCount++;
      if (e.playabilityFailure) playabilityFailureCount++;

      // Segmentación por dominio
      const d = domainStats[e.domain] || domainStats.music;
      d.total++;
      if (e.fastPath) d.fast++;
      if (e.playStarted && typeof e.clickPosition === 'number' && e.clickPosition < 5) d.top5Play++;
      if (e.playStarted && !e.reformulationWithin15s && (e.watchTimeSeconds >= 45 || e.watchedRatio >= 0.40)) d.satisfied++;
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 28;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 62;

    const v3WinRate = +(v3Wins / total * 100).toFixed(1);
    const v3RegRate = +(v2Wins / total * 100).toFixed(1);
    const tieRate = +(ties / total * 100).toFixed(1);

    const v2FastRate = +(v2FastCount / total * 100).toFixed(1);
    // V3 Projected Fast Path agrega las conversiones de V3 Wins a los Fast Paths de V2
    const v3ProjectedFast = Math.min(96.0, +(v2FastRate + (v3Wins - v2Wins) / total * 100).toFixed(1));

    const domainBreakdown: DomainMetricsBreakdown[] = Object.entries(domainStats).map(([dom, st]) => ({
      domain: dom as DomainCategory,
      totalQueries: st.total,
      fastPathRate: st.total > 0 ? +(st.fast / st.total * 100).toFixed(1) : 0,
      satisfactionRate: st.total > 0 ? +(st.satisfied / st.total * 100).toFixed(1) : 0,
      successfulPlayAtTop5: st.total > 0 ? +(st.top5Play / st.total * 100).toFixed(1) : 0
    }));

    // Decision Gate: V3 Win Rate > 3x Regression Rate & Total >= 10.000 & P95 < 150ms
    const isCanaryReady = total >= 10000 &&
                          v3WinRate >= 3 * v3RegRate &&
                          v2FastRate >= 91.0 &&
                          p95 <= 150 &&
                          (routesCount.YOUTUBE_SEARCH_AIRBAG / total) < 0.01;

    return {
      dayNumber,
      totalQueries: total,
      v2FastPath: v2FastRate,
      v2SearchSatisfaction: +(v2SatisfiedCount / total * 100).toFixed(1),
      v2SuccessfulPlayTop5: +(v2Top5PlayCount / total * 100).toFixed(1),
      v3ProjectedFastPath: v3ProjectedFast,
      v3RankingWinRate: v3WinRate,
      v3RankingRegressionRate: v3RegRate,
      tieRate,
      zeroResultRate: +(zeroResultCount / total * 100).toFixed(1),
      reformulationRate: +(reformulationCount / total * 100).toFixed(1),
      playabilityFailureRate: +(playabilityFailureCount / total * 100).toFixed(1),
      independenceBreakdown: {
        atlas: +(routesCount.ATLAS_FAST_PATH / total * 100).toFixed(1),
        freeProvider: +(routesCount.FREE_PROVIDER_FALLBACK / total * 100).toFixed(1),
        discovery: +(routesCount.DISCOVERY_EXTERNAL / total * 100).toFixed(1),
        ytSearch: +(routesCount.YOUTUBE_SEARCH_AIRBAG / total * 100).toFixed(1),
        unresolved: +(routesCount.UNRESOLVED / total * 100).toFixed(1)
      },
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
      domainBreakdown,
      canaryDecision: isCanaryReady ? 'GO_CANARY_10' : 'HOLD_SHADOW',
      canaryReadinessScore: Math.min(100, Math.round((v3WinRate / Math.max(1, v3RegRate)) * 25))
    };
  }

  getEntriesCount(): number {
    return this.logEntries.length;
  }

  reset() {
    this.logEntries = [];
  }
}

export const shadowComparator = new ShadowComparatorEngine();
