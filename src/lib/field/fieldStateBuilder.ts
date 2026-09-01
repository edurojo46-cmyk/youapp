/**
 * fieldStateBuilder.ts
 *
 * Construye el objeto FieldState matemático a partir del prompt, contexto de tiempo y señales de sesión.
 */

import type { FieldState, FieldIntent, FieldDesiredMix, FieldContext, FieldKnowledgeState } from './fieldTypes';

interface BuildFieldStateOptions {
  query: string;
  availableMinutes?: number;
  device?: 'mobile' | 'desktop' | 'tv';
  sessionHistory?: Array<{ topic?: string; creatorId?: string }>;
}

export function buildFieldState(options: BuildFieldStateOptions): FieldState {
  const q = options.query.trim().toLowerCase();
  const availableMinutes = options.availableMinutes || 45;
  const device = options.device || 'desktop';

  // 1. Inferencia de Intención Vectorial
  const intent: FieldIntent = {
    learn: 0.3,
    entertain: 0.3,
    stayInformed: 0.2,
    explore: 0.2
  };

  if (q.includes('entender') || q.includes('aprender') || q.includes('como funciona') || q.includes('explicado') || q.includes('historia') || q.includes('documental') || q.includes('biografia')) {
    intent.learn = 0.85;
    intent.explore = 0.45;
    intent.entertain = 0.2;
    intent.stayInformed = 0.1;
  } else if (q.includes('noticias') || q.includes('hoy') || q.includes('resumen') || q.includes('actualidad') || q.includes('debate')) {
    intent.stayInformed = 0.9;
    intent.learn = 0.5;
    intent.explore = 0.3;
    intent.entertain = 0.1;
  } else if (q.includes('musica') || q.includes('vivo') || q.includes('recital') || q.includes('show') || q.includes('humor') || q.includes('comedia')) {
    intent.entertain = 0.9;
    intent.explore = 0.4;
    intent.learn = 0.1;
    intent.stayInformed = 0.1;
  } else {
    intent.explore = 0.7;
    intent.learn = 0.6;
  }

  // 2. Mezcla Deseada (Desired Mix) de Fuerzas del Campo
  const desiredMix: FieldDesiredMix = {
    relevance: 0.95, // Prioridad absoluta
    quality: 0.90,   // Respeto al Core Q >= 60
    novelty: intent.explore > 0.5 ? 0.6 : 0.35,
    diversity: 0.70, // Variedad de perspectivas y creadores
    depth: intent.learn > 0.7 ? 0.80 : 0.40,
    freshness: intent.stayInformed > 0.7 ? 0.85 : 0.20
  };

  // 3. Contexto
  const context: FieldContext = {
    availableMinutes,
    sessionDepth: 1,
    device,
    timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 20 ? 'afternoon' : 'night'
  };

  // 4. Estado de Conocimiento
  const knowledge: FieldKnowledgeState = {
    atlasCoverage: 0,
    familiarTopics: options.sessionHistory?.map(s => s.topic).filter(Boolean) as string[] || [],
    knownCreators: options.sessionHistory?.map(s => s.creatorId).filter(Boolean) as string[] || [],
    recentEntityIds: []
  };

  return {
    query: options.query,
    intent,
    context,
    knowledge,
    desiredMix,
    currentPhase: 'discover',
    createdAt: Date.now()
  };
}
