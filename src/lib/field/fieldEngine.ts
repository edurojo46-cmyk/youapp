/**
 * fieldEngine.ts
 *
 * YOU FIELD ENGINE (V1)
 * "Internet aporta la energía. YouApp crea el campo."
 *
 * SEARCH encuentra.
 * ATLAS recuerda.
 * BRAIN entiende.
 * FIELD organiza fuerzas.
 * DIRECTOR construye la experiencia.
 * PLAYER la ejecuta.
 * FEEDBACK vuelve a mover el campo.
 */

import type { UserSignal, ScheduleBlock } from '../tv/signalTypes';
import type { ContentItem } from '../search/types';
import { executeSearch } from '../search/searchEngine';
import { buildFieldState } from './fieldStateBuilder';
import { createFieldPlan } from './fieldPlanner';
import type { FieldPlan, FieldBlockPlan, FieldState } from './fieldTypes';

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
  };
}

export async function generateFieldSignal(options: GenerateFieldSignalOptions): Promise<FieldGenerationResult> {
  const t0 = Date.now();
  
  // 1. Construir el Campo
  const fieldState = buildFieldState({
    query: options.prompt,
    availableMinutes: options.availableMinutes || 45,
    device: options.device || 'desktop',
    sessionHistory: options.sessionHistory
  });

  // 2. Planificar la Secuencia Giratoria de Bloques
  const fieldPlan = createFieldPlan(options.prompt, fieldState);
  
  const schedule: ScheduleBlock[] = [];
  const allocatedIds = new Set<string>();
  const usedCreators = new Set<string>();
  const sourcesDistribution: Record<string, number> = {};
  let currentOffsetSec = 0;

  // 3. Abastecer cada Bloque consultando al Search Core (Atlas → Free Discovery → Radar)
  for (const blockPlan of fieldPlan.blocks) {
    try {
      const searchRes = await executeSearch(blockPlan.queryOverride);
      const candidates = searchRes.all || [];

      // Seleccionar el candidato óptimo que cumpla con el rol y evite duplicación
      let selected: ContentItem | null = null;

      // Prioridad 1: Candidato no usado con creador no repetido
      selected = candidates.find(c => !allocatedIds.has(c.id) && !usedCreators.has(c.channelId || '')) || null;

      // Prioridad 2: Candidato no usado aunque el creador ya haya aparecido
      if (!selected) {
        selected = candidates.find(c => !allocatedIds.has(c.id)) || null;
      }

      // Prioridad 3: Primer candidato de la búsqueda
      if (!selected && candidates.length > 0) {
        selected = candidates[0];
      }

      if (selected) {
        allocatedIds.add(selected.id);
        if (selected.channelId) usedCreators.add(selected.channelId);

        const sourceName = (selected.retrievalSource as string) || selected.source?.provider || 'atlas';
        sourcesDistribution[sourceName] = (sourcesDistribution[sourceName] || 0) + 1;

        const duration = selected.durationSeconds || (blockPlan.targetMinutes * 60);

        const scheduleBlock: ScheduleBlock = {
          id: `field-block-${Date.now()}-${blockPlan.index}`,
          position: blockPlan.index,
          startOffsetSec: currentOffsetSec,
          durationSec: duration,
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
        currentOffsetSec += duration;
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

  return {
    signal,
    plan: fieldPlan,
    fieldState,
    telemetry: {
      blocksPlanned: fieldPlan.blocks.length,
      blocksSourced: schedule.length,
      uniqueCreators: usedCreators.size,
      sourcesDistribution,
      totalDurationSeconds: currentOffsetSec
    }
  };
}
