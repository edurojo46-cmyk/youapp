/**
 * fieldPlanner.ts
 *
 * Convierte una intención o prompt del usuario en un Plan de Campo con roles de contenido,
 * progresión temática y tiempos objetivos por bloque.
 */

import type { FieldPlan, FieldBlockPlan, FieldState, ContentRole, PrimaryEntity } from './fieldTypes';
import { generateRotationPlan } from './fieldRotation';

export function extractPrimaryEntity(prompt: string): PrimaryEntity {
  let clean = prompt
    .replace(/^quiero (entender|aprender|ver|saber sobre|conocer)\s+/i, '')
    .replace(/^(a|sobre|de|el|la|un|una)\s+/i, '')
    .replace(/\s+en\s+\d+\s+(minutos|horas|min|hs?)$/i, '')
    .trim();

  const words = clean.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const aliases = [clean.toLowerCase(), ...words];

  return {
    canonicalName: clean,
    aliases: Array.from(new Set(aliases)),
    type: 'person'
  };
}

export function createFieldPlan(prompt: string, state: FieldState): FieldPlan {
  const totalMinutes = state.context.availableMinutes || 45;
  const primaryEntity = extractPrimaryEntity(prompt);
  const cleanTopic = primaryEntity.canonicalName;

  // Calcular número óptimo de bloques (bloques de entre 6 y 15 minutos)
  let blockCount = Math.max(3, Math.min(7, Math.round(totalMinutes / 10)));
  const avgBlockMinutes = Math.round(totalMinutes / blockCount);

  const rotation = generateRotationPlan(blockCount);
  const blocks: FieldBlockPlan[] = [];

  for (let i = 0; i < blockCount; i++) {
    const { phase, role } = rotation[i];
    const { concept, queryOverride } = deriveConceptForRole(cleanTopic, role, i, blockCount);

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
    primaryEntity,
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
        concept: `${baseTopic}: Introducción y biografía histórica`,
        queryOverride: `${baseTopic} biografia documental historia`
      };
    case 'deep_dive':
      return {
        concept: `${baseTopic}: Explicación técnica y funcionamiento`,
        queryOverride: `${baseTopic} como funciona inventos electricidad motor explicacion`
      };
    case 'contrast':
      return {
        concept: `${baseTopic}: Debate, guerra de las corrientes y mitos`,
        queryOverride: `${baseTopic} edison guerra de las corrientes mitos vs realidad`
      };
    case 'example':
      return {
        concept: `${baseTopic}: Aplicaciones reales y experimentos`,
        queryOverride: `${baseTopic} experimentos aplicaciones reales tecnologia`
      };
    case 'discovery':
      return {
        concept: `${baseTopic}: Aspectos y secretos menos conocidos`,
        queryOverride: `${baseTopic} inventos secretos desconocidos datos curiosos`
      };
    case 'relief':
      return {
        concept: `${baseTopic}: Cápsula breve de interés`,
        queryOverride: `${baseTopic} resumen en 5 minutos`
      };
    case 'summary':
      return {
        concept: `${baseTopic}: Conclusiones y legado en el mundo actual`,
        queryOverride: `${baseTopic} legado impacto mundo moderno resumen`
      };
    default:
      return {
        concept: `${baseTopic}: Bloque temático ${index + 1}`,
        queryOverride: `${baseTopic} capitulo ${index + 1}`
      };
  }
}
