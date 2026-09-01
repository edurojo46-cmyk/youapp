/**
 * fieldTypes.ts
 *
 * Definiciones de tipos y contratos matemáticos para el YOU FIELD ENGINE.
 * "Internet aporta la energía. YouApp crea el campo."
 */

import type { ContentItem } from '../search/types';
import type { ScheduleBlock, UserSignal } from '../tv/signalTypes';

export type ContentRole =
  | 'foundation'   // Introducción, biografía, marco conceptual
  | 'deep_dive'    // Explicación técnica detallada, mecanismo central
  | 'contrast'     // Debate, posturas opuestas, mitos vs hechos
  | 'example'      // Caso de estudio, aplicación real
  | 'news'         // Actualidad, novedades recientes
  | 'discovery'    // Sorpresa, ángulo lateral, invento o hecho poco conocido
  | 'relief'       // Curiosidad breve, pausa de ritmo
  | 'summary';     // Conclusiones, ideas clave, síntesis

export type FieldPhase = 'discover' | 'deepen' | 'contrast' | 'refresh';

export interface FieldIntent {
  learn: number;        // 0.0 - 1.0
  entertain: number;    // 0.0 - 1.0
  stayInformed: number; // 0.0 - 1.0
  explore: number;      // 0.0 - 1.0
}

export interface FieldContext {
  availableMinutes: number;
  sessionDepth: number;
  device: 'mobile' | 'desktop' | 'tv';
  timeOfDay?: 'morning' | 'afternoon' | 'night';
}

export interface FieldKnowledgeState {
  atlasCoverage: number;
  familiarTopics: string[];
  knownCreators: string[];
  recentEntityIds: string[];
}

export interface FieldDesiredMix {
  relevance: number; // 0.0 - 1.0 (Piso estricto de pertinencia)
  quality: number;   // 0.0 - 1.0 (Piso estricto de calidad)
  novelty: number;   // 0.0 - 1.0 (Contenido nuevo vs establecido)
  diversity: number; // 0.0 - 1.0 (Variedad de creadores/fuentes)
  depth: number;     // 0.0 - 1.0 (Nivel de detalle técnico/académico)
  freshness: number; // 0.0 - 1.0 (Reciente vs evergreen)
}

export interface FieldState {
  query: string;
  intent: FieldIntent;
  context: FieldContext;
  knowledge: FieldKnowledgeState;
  desiredMix: FieldDesiredMix;
  currentPhase: FieldPhase;
  createdAt: number;
}

export interface FieldBlockPlan {
  index: number;
  role: ContentRole;
  phase: FieldPhase;
  concept: string;
  queryOverride: string;
  targetMinutes: number;
  allocatedCandidate?: ContentItem;
}

export interface FieldPlan {
  id: string;
  prompt: string;
  totalTargetMinutes: number;
  fieldState: FieldState;
  blocks: FieldBlockPlan[];
  estimatedProgression: string[];
}

export interface FieldSessionEvent {
  blockId: string;
  role: ContentRole;
  durationSec: number;
  watchSeconds: number;
  watchPercentage: number;
  liked?: boolean;
  saved?: boolean;
  skipped?: boolean;
  timestamp: number;
}

export interface FieldSatisfactionMetrics {
  completionRate: number;
  valueScore: number;
  redundancyRate: number;          // % de bloques con solapamiento conceptual > 70% (objetivo: < 15%)
  knowledgeProgressionRate: number;// Nivel de cumplimiento del arco básico → profundo → contraste (0-100)
  overallSatisfaction: number;     // 0.0 - 100.0
}
