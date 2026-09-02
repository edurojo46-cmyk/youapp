/**
 * historicalDeepLinker.ts — Conector de Archivos Históricos Profundos para Atlas V3
 */

export class HistoricalDeepLinker {
  canRecoverArchiveGap(query: string): boolean {
    // Si la query involucra grabaciones de archivo histórico de broadcasters
    // o cintas de consola, el deep linker conecta con los feeds de preservación
    return /master cinta|audio consola|archivo historico|radio historica|badia/i.test(query);
  }
}

export const historicalDeepLinker = new HistoricalDeepLinker();
