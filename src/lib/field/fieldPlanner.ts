/**
 * fieldPlanner.ts
 *
 * Convierte una intención o prompt del usuario en un Plan de Campo con roles de contenido,
 * progresión temática y tiempos objetivos por bloque.
 */

import type { FieldPlan, FieldBlockPlan, FieldState, ContentRole } from './fieldTypes';
import { generateRotationPlan } from './fieldRotation';

export function createFieldPlan(prompt: string, state: FieldState): FieldPlan {
  const totalMinutes = state.context.availableMinutes || 45;
  const cleanPrompt = prompt.replace(/^quiero (entender|aprender|ver|saber sobre)\s+/i, '').trim();

  // Calcular número óptimo de bloques (bloques de entre 6 y 15 minutos)
  let blockCount = Math.max(3, Math.min(7, Math.round(totalMinutes / 10)));
  const avgBlockMinutes = Math.round(totalMinutes / blockCount);

  const rotation = generateRotationPlan(blockCount);
  const blocks: FieldBlockPlan[] = [];

  for (let i = 0; i < blockCount; i++) {
    const { phase, role } = rotation[i];
    const { concept, queryOverride } = deriveConceptForRole(cleanPrompt, role, i, blockCount);

    blocks.push({
      index: i,
      role,
      phase,
      concept,
      queryOverride,
      targetMinutes: avgBlockMinutes
    });
  }

  return {
    id: `field-plan-${Date.now()}`,
    prompt,
    totalTargetMinutes: totalMinutes,
    fieldState: state,
    blocks,
    estimatedProgression: blocks.map(b => `[${b.role.toUpperCase()}] ${b.concept}`)
  };
}

function deriveConceptForRole(
  baseTopic: string,
  role: ContentRole,
  index: number,
  total: number
): { concept: string; queryOverride: string } {
  switch (role) {
    case 'foundation':
      return {
        concept: `${baseTopic}: Introducción y contexto histórico`,
        queryOverride: `${baseTopic} introduccion historia documental`
      };
    case 'deep_dive':
      return {
        concept: `${baseTopic}: Explicación detallada y funcionamiento`,
        queryOverride: `${baseTopic} como funciona explicacion completa tecnica`
      };
    case 'contrast':
      return {
        concept: `${baseTopic}: Perspectivas opuestas, debate y mitos`,
        queryOverride: `${baseTopic} debate mitos vs realidad controversia`
      };
    case 'example':
      return {
        concept: `${baseTopic}: Aplicaciones reales y casos prácticos`,
        queryOverride: `${baseTopic} casos reales aplicaciones practicas`
      };
    case 'discovery':
      return {
        concept: `${baseTopic}: Datos curiosos y aspectos menos conocidos`,
        queryOverride: `${baseTopic} datos curiosos secretos no conocidos`
      };
    case 'relief':
      return {
        concept: `${baseTopic}: Breve cápsula de interés`,
        queryOverride: `${baseTopic} en 3 minutos resumen rapido`
      };
    case 'summary':
      return {
        concept: `${baseTopic}: Conclusiones e impacto clave`,
        queryOverride: `${baseTopic} conclusiones legado resumen final`
      };
    default:
      return {
        concept: `${baseTopic}: Bloque temático ${index + 1}`,
        queryOverride: `${baseTopic} capitulo ${index + 1}`
      };
  }
}
