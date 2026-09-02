/**
 * epistemicTypes.ts
 *
 * Definiciones para YOU FIELD ENGINE V1.1 — Epistemic Guard.
 * Permite auditar y comunicar la naturaleza del conocimiento sin sesgos punitivos.
 * "El Epistemic Guard clasifica y contextualiza; no decide por sí solo qué es verdad ni reemplaza Quality/Relevance."
 */

export type EpistemicNature =
  | 'documented'     // Hechos comprobables, fuentes primarias, papers, historia documentada
  | 'interpretive'   // Análisis crítico, lecturas de autor, biografías contextualizadas
  | 'controversial'  // Debate abierto entre posturas fundamentadas (p. ej. Tesla vs Edison)
  | 'speculative'    // Hipótesis no comprobadas, modelos teóricos de borde, mitos
  | 'unknown';       // Evidencia insuficiente para clasificar con rigor

export type EpistemicRigorProfile =
  | 'open'           // Libre: no altera la composición epistemológica
  | 'balanced'       // Equilibrado (default): base documental sólida con espacio para debate e hipótesis
  | 'documentary'    // Documental: prioriza hechos y fuentes comprobables
  | 'exploratory';   // Exploratorio: incluye más interpretaciones, controversias y nuevas hipótesis

export interface EpistemicAssessment {
  nature: EpistemicNature;
  secondaryNature?: EpistemicNature;
  confidenceScore: number;       // 1 a 5 (●●●●○)
  confidenceNormalized: number;  // 0.0 - 1.0
  confidenceLabel: 'Baja' | 'Media' | 'Alta' | 'Muy alta' | 'Indeterminada';
  glyph: string;                 // '✓' | '◐' | '⇄' | '◇' | '?'
  label: string;                 // 'DOCUMENTADO' | 'INTERPRETATIVO' | 'CONTROVERTIDO' | 'ESPECULATIVO' | 'SIN DETERMINAR'
  shortDescription: string;
  rationale: string;
  entityName: string;
  roleName?: string;
  hasRealSources: boolean;
  sourcesCount: number;
  sourcesSample: string[];
  criteriaMatched: string[];
  sourceProvenance?: string;
}

export interface EpistemicDistribution {
  documentedPct: number;
  interpretivePct: number;
  controversialPct: number;
  speculativePct: number;
  unknownPct: number;
  balanceRating: 'ALTO ✓' | 'EQUILIBRADO Y SÓLIDO ✓' | 'EXPLORATORIO' | 'DOCUMENTAL ESTRICTO' | 'SESGADO' | 'INDETERMINADO';
  balanceDescription: string;
}
