/**
 * fieldRotation.ts
 *
 * Mecanismo del Campo Giratorio:
 * Produce movimiento alrededor del interés en vez de repetición estática.
 * DESCUBRIR → PROFUNDIZAR → CONTRASTAR → REFRESCAR → DESCUBRIR...
 */

import type { FieldPhase, ContentRole } from './fieldTypes';

export const FIELD_ROTATION_SEQUENCE: FieldPhase[] = [
  'discover',
  'deepen',
  'contrast',
  'refresh'
];

export function getNextPhase(currentPhase: FieldPhase): FieldPhase {
  const idx = FIELD_ROTATION_SEQUENCE.indexOf(currentPhase);
  const nextIdx = (idx + 1) % FIELD_ROTATION_SEQUENCE.length;
  return FIELD_ROTATION_SEQUENCE[nextIdx];
}

export function mapPhaseToRole(phase: FieldPhase, blockIndex: number, totalBlocks: number): ContentRole {
  if (blockIndex === 0) return 'foundation';
  if (blockIndex === totalBlocks - 1 && totalBlocks >= 3) return 'summary';

  switch (phase) {
    case 'discover':
      return blockIndex === 0 ? 'foundation' : 'discovery';
    case 'deepen':
      return blockIndex % 2 === 0 ? 'deep_dive' : 'example';
    case 'contrast':
      return 'contrast';
    case 'refresh':
      return 'relief';
    default:
      return 'deep_dive';
  }
}

export function generateRotationPlan(totalBlocks: number): Array<{ phase: FieldPhase; role: ContentRole }> {
  const plan: Array<{ phase: FieldPhase; role: ContentRole }> = [];

  for (let i = 0; i < totalBlocks; i++) {
    const phase = FIELD_ROTATION_SEQUENCE[i % FIELD_ROTATION_SEQUENCE.length];
    const role = mapPhaseToRole(phase, i, totalBlocks);
    plan.push({ phase, role });
  }

  return plan;
}
