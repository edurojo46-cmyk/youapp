/**
 * fieldFeedback.ts
 *
 * Procesa la retroalimentación de la sesión (watch time, likes, skips) y mueve el campo en tiempo real.
 * "PLAY → OBSERVE → UPDATE FIELD → NEXT CONTENT"
 */

import type { FieldState, FieldSessionEvent } from './fieldTypes';

export function updateFieldStateWithFeedback(currentState: FieldState, event: FieldSessionEvent): FieldState {
  const updated = { ...currentState };
  const mix = { ...updated.desiredMix };
  const knowledge = { ...updated.knowledge };

  // 1. Si el usuario vio > 80% o dio me gusta → Profundizar y registrar familiaridad
  if (event.watchPercentage >= 0.8 || event.liked) {
    mix.depth = Math.min(1.0, mix.depth + 0.1);
    mix.novelty = Math.max(0.1, mix.novelty - 0.05); // Está cómodo con el tema

    if (event.role === 'foundation') {
      updated.currentPhase = 'deepen';
    } else if (event.role === 'deep_dive') {
      updated.currentPhase = 'contrast';
    }
  }

  // 2. Si el usuario saltó rápido (< 20% de reproducción) → Mover campo hacia contraste o alivio
  if (event.skipped || event.watchPercentage < 0.2) {
    mix.diversity = Math.min(1.0, mix.diversity + 0.15); // Necesita otra perspectiva o creador
    mix.depth = Math.max(0.2, mix.depth - 0.15);         // Bajar nivel técnico
    updated.currentPhase = 'refresh';                     // Cambiar de ritmo
  }

  // 3. Si guardó el momento → Señal de alto valor intrínseco
  if (event.saved) {
    mix.quality = Math.min(1.0, mix.quality + 0.05);
  }

  updated.desiredMix = mix;
  updated.knowledge = knowledge;

  return updated;
}
