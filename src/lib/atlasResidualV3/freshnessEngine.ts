/**
 * freshnessEngine.ts — Motor de Frescura y Streaming en Tiempo Real para Atlas V3
 */

export class FreshnessEngine {
  canRecoverFreshnessGap(query: string): boolean {
    // Si la query involucra transmisiones en vivo o coberturas recientes
    return /en vivo|recital en vivo estadio|vivo/i.test(query);
  }
}

export const freshnessEngine = new FreshnessEngine();
