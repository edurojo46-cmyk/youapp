/**
 * fieldEngine.ts
 *
 * YOU FIELD ENGINE (V1)
 * "Internet aporta la energía. YouApp crea el campo."
 *
 * Incluye:
 * - Block Affinity Gate
 * - Entity Lock (Strict / Medium / Flexible)
 * - Duration Fitness & Budget Tolerance
 * - Field Fit Mathematical Scoring
 */

import type { UserSignal, ScheduleBlock } from '../tv/signalTypes';
import type { ContentItem } from '../search/types';
import { executeSearch } from '../search/searchEngine';
import { buildFieldState } from './fieldStateBuilder';
import { createFieldPlan } from './fieldPlanner';
import type { FieldPlan, FieldBlockPlan, FieldState, BlockEvaluation, PrimaryEntity, ContentRole } from './fieldTypes';

export interface GenerateFieldSignalOptions {
  prompt: string;
  availableMinutes?: number;
  device?: 'mobile' | 'desktop' | 'tv';
  sessionHistory?: Array<{ topic?: string; creatorId?: string }>;
}

export interface FieldGenerationResult {
  signal: UserSignal;
  plan: FieldPlan;
  fieldState: FieldState;
  telemetry: {
    blocksPlanned: number;
    blocksSourced: number;
    uniqueCreators: number;
    sourcesDistribution: Record<string, number>;
    totalDurationSeconds: number;
    totalDurationMinutes: number;
    targetDurationMinutes: number;
    durationDeviationPercentage: number;
    averageCoherenceScore: number;
  };
}

export async function generateFieldSignal(options: GenerateFieldSignalOptions): Promise<FieldGenerationResult> {
  const targetMinutes = options.availableMinutes || 45;
  
  // 1. Construir el Campo
  const fieldState = buildFieldState({
    query: options.prompt,
    availableMinutes: targetMinutes,
    device: options.device || 'desktop',
    sessionHistory: options.sessionHistory
  });

  // 2. Planificar la Secuencia Giratoria de Bloques con Entity Lock
  const fieldPlan = createFieldPlan(options.prompt, fieldState);
  
  const schedule: ScheduleBlock[] = [];
  const allocatedIds = new Set<string>();
  const usedCreators = new Set<string>();
  const sourcesDistribution: Record<string, number> = {};
  const blockEvaluations: BlockEvaluation[] = [];
  let currentOffsetSec = 0;

  const entityPool: ContentItem[] = [];

  // 3. Abastecer cada Bloque evaluando Field Fit
  for (const blockPlan of fieldPlan.blocks) {
    try {
      const searchRes = await executeSearch(blockPlan.queryOverride);
      const candidates = searchRes.all || [];

      // Acumular en el pool de la entidad
      for (const c of candidates) {
        if (!entityPool.some(item => item.id === c.id)) {
          entityPool.push(c);
        }
      }

      // Evaluar todos los candidatos para este bloque específico
      let evaluations = candidates.map(c => evaluateCandidateForBlock(
        c,
        blockPlan,
        fieldPlan.primaryEntity,
        usedCreators
      ));

      // Filtrar candidatos elegibles (que pasaron Entity Lock y Block Affinity)
      let eligible = evaluations.filter(e => e.isEligible);

      // Si no hay elegibles en la búsqueda actual, buscar en el entityPool acumulado
      if (eligible.length === 0 && entityPool.length > 0) {
        const poolEvals = entityPool.map(c => evaluateCandidateForBlock(
          c,
          blockPlan,
          fieldPlan.primaryEntity,
          usedCreators
        ));
        eligible = poolEvals.filter(e => e.isEligible && !allocatedIds.has(e.candidateId));
        if (eligible.length > 0) {
          evaluations = poolEvals;
        }
      }

      // Ordenar por Field Fit Score descendente
      eligible.sort((a, b) => b.fieldFitScore - a.fieldFitScore);

      // Seleccionar el mejor candidato no utilizado
      let selectedEval = eligible.find(e => !allocatedIds.has(e.candidateId)) || null;

      // Fallback: Si ningún candidato pasó el filtro estricto, tomar el de mayor afinidad de entidad
      if (!selectedEval && evaluations.length > 0) {
        const sortedByEntity = [...evaluations].filter(e => e.entityContinuity >= 25).sort((a, b) => b.entityContinuity - a.entityContinuity);
        selectedEval = sortedByEntity.find(e => !allocatedIds.has(e.candidateId)) || sortedByEntity[0] || evaluations[0];
      }

      if (selectedEval) {
        const pool = [...candidates, ...entityPool];
        const selected = pool.find(c => (c.providerContentId || c.id) === selectedEval!.candidateId || c.id === selectedEval!.candidateId) || candidates[0] || entityPool[0];
        
        allocatedIds.add(selected.id);
        if (selected.channelId) usedCreators.add(selected.channelId);
        blockEvaluations.push(selectedEval);

        const sourceName = (selected.retrievalSource as string) || selected.source?.provider || 'atlas';
        sourcesDistribution[sourceName] = (sourcesDistribution[sourceName] || 0) + 1;

        // Limitar duración del bloque para respetar la restricción temporal (máximo 1.15x de targetMinutes)
        const rawDuration = selected.durationSeconds || (blockPlan.targetMinutes * 60);
        const cappedDuration = Math.min(rawDuration, Math.round(blockPlan.targetMinutes * 60 * 1.15));

        const scheduleBlock: ScheduleBlock = {
          id: `field-block-${Date.now()}-${blockPlan.index}`,
          position: blockPlan.index,
          startOffsetSec: currentOffsetSec,
          durationSec: cappedDuration,
          topic: blockPlan.concept,
          role: blockPlan.role as any,
          contentItem: {
            id: selected.providerContentId || selected.id,
            providerId: selected.providerContentId || selected.id,
            type: 'video',
            provider: selected.provider || (selected.source?.provider as any) || 'youtube',
            title: selected.title,
            description: selected.description,
            thumbnailUrl: selected.thumbnail || selected.thumbnailUrl,
            videoUrl: selected.videoUrl || `https://www.youtube.com/watch?v=${selected.providerContentId}`,
            channelName: selected.channelTitle || selected.creatorName || 'Creador',
            channelId: selected.channelId || selected.creatorId || 'channel',
            isLive: selected.isLive || false,
            isVerified: selected.isVerified || true
          }
        };

        schedule.push(scheduleBlock);
        currentOffsetSec += cappedDuration;
        blockPlan.allocatedCandidate = selected;
      }
    } catch (err) {
      console.warn(`[FieldEngine] Error abasteciendo bloque ${blockPlan.index}:`, err);
    }
  }

  // 4. Armar Señal Completa
  const signal: UserSignal = {
    id: `signal-field-${Date.now()}`,
    name: `Señal: ${options.prompt}`,
    prompt: options.prompt,
    visibility: 'private',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    schedule
  };

  const totalMinutesDelivered = Math.round(currentOffsetSec / 60);
  const deviation = Math.abs(totalMinutesDelivered - targetMinutes) / targetMinutes;
  const avgCoherence = blockEvaluations.length > 0 
    ? Math.round(blockEvaluations.reduce((acc, e) => acc + e.fieldFitScore, 0) / blockEvaluations.length)
    : 80;

  return {
    signal,
    plan: fieldPlan,
    fieldState,
    telemetry: {
      blocksPlanned: fieldPlan.blocks.length,
      blocksSourced: schedule.length,
      uniqueCreators: usedCreators.size,
      sourcesDistribution,
      totalDurationSeconds: currentOffsetSec,
      totalDurationMinutes: totalMinutesDelivered,
      targetDurationMinutes: targetMinutes,
      durationDeviationPercentage: Math.round(deviation * 100),
      averageCoherenceScore: avgCoherence
    }
  };
}

/**
 * Evalúa matemáticamente el ajuste de un candidato a un bloque y entidad
 */
export function evaluateCandidateForBlock(
  c: ContentItem,
  b: FieldBlockPlan,
  entity: PrimaryEntity,
  usedCreators: Set<string>
): BlockEvaluation {
  const text = `${c.title || ''} ${c.description || ''} ${c.channelTitle || ''}`.toLowerCase();
  const title = (c.title || '').toLowerCase();

  // 1. Hard Disqualification: Descartar gaming/gameplays irrelevantes para temas históricos/científicos
  if (entity.type === 'person' || entity.type === 'historical_event') {
    if (text.includes('gameplay') || text.includes('videojuegos') || text.includes('gaming') || text.includes('walkthrough')) {
      return {
        candidateId: c.providerContentId || c.id,
        title: c.title,
        blockAffinity: 0,
        entityContinuity: 0,
        roleCompatibility: 0,
        durationFitness: 0,
        fieldFitScore: 0,
        isEligible: false,
        rejectReason: 'gaming_off_topic'
      };
    }
  }

  // 2. Entity Continuity Score (0-100)
  let entityMentions = 0;
  for (const alias of entity.aliases) {
    if (title.includes(alias)) entityMentions += 3;
    else if (text.includes(alias)) entityMentions += 1;
  }
  const entityContinuity = Math.min(100, entityMentions * 25);

  // Entity Lock Enforcement según el rol
  const requiresStrictLock = ['foundation', 'deep_dive', 'contrast', 'summary'].includes(b.role);
  if (requiresStrictLock && entityContinuity < 25) {
    return {
      candidateId: c.providerContentId || c.id,
      title: c.title,
      blockAffinity: 20,
      entityContinuity,
      roleCompatibility: 30,
      durationFitness: 50,
      fieldFitScore: 25,
      isEligible: false,
      rejectReason: 'entity_lock_failed'
    };
  }

  // 3. Block Affinity Score (0-100)
  const conceptWords = b.concept.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let conceptMatches = 0;
  for (const word of conceptWords) {
    if (text.includes(word)) conceptMatches++;
  }
  const blockAffinity = Math.min(100, Math.round((conceptMatches / Math.max(1, conceptWords.length)) * 100));

  // 4. Role Compatibility Score (0-100)
  const roleCompatibility = calculateRoleCompatibility(c, b.role);

  // 5. Duration Fitness Score (0-100)
  const targetSec = b.targetMinutes * 60;
  const durationSec = c.durationSeconds || targetSec;
  let durationFitness = 0;
  if (durationSec <= targetSec * 1.3 && durationSec >= targetSec * 0.4) {
    const diffSec = Math.abs(durationSec - targetSec);
    durationFitness = Math.max(0, Math.min(100, Math.round(100 - (diffSec / targetSec) * 80)));
  } else if (durationSec > targetSec * 1.3) {
    durationFitness = Math.max(0, 30 - Math.round(((durationSec - targetSec * 1.3) / targetSec) * 40));
  } else {
    durationFitness = 40;
  }

  // 6. Diversity Contribution
  const isNewCreator = !usedCreators.has(c.channelId || '');
  const diversityContribution = isNewCreator ? 100 : 40;

  // 7. Field Fit Score Ponderado
  const fieldFitScore = Math.round(
    blockAffinity * 0.30 +
    entityContinuity * 0.25 +
    roleCompatibility * 0.15 +
    durationFitness * 0.15 +
    diversityContribution * 0.10 +
    ((c.qualityScore || 70) / 100) * 0.05
  );

  return {
    candidateId: c.providerContentId || c.id,
    title: c.title,
    blockAffinity,
    entityContinuity,
    roleCompatibility,
    durationFitness,
    fieldFitScore,
    isEligible: fieldFitScore >= 45
  };
}

function calculateRoleCompatibility(c: ContentItem, role: ContentRole): number {
  const text = `${c.title || ''} ${c.description || ''}`.toLowerCase();

  switch (role) {
    case 'foundation':
      if (text.includes('biografia') || text.includes('historia') || text.includes('quien fue') || text.includes('documental')) return 95;
      return 60;
    case 'deep_dive':
      if (text.includes('como funciona') || text.includes('explicacion') || text.includes('tecnica') || text.includes('motor') || text.includes('electricidad')) return 95;
      return 65;
    case 'contrast':
      if (text.includes('vs') || text.includes('debate') || text.includes('edison') || text.includes('guerra') || text.includes('mitos')) return 95;
      return 55;
    case 'example':
      if (text.includes('experimento') || text.includes('aplicacion') || text.includes('construccion') || text.includes('demostracion')) return 90;
      return 60;
    case 'relief':
    case 'discovery':
      if (text.includes('curiosidades') || text.includes('secretos') || text.includes('minutos') || text.includes('resumen')) return 90;
      return 60;
    case 'summary':
      if (text.includes('legado') || text.includes('conclusiones') || text.includes('impacto') || text.includes('resumen')) return 95;
      return 65;
    default:
      return 70;
  }
}
