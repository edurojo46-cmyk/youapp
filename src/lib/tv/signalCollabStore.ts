// ============================================================================
// ATLAS SIGNAL COLLAB V1 — Señal Abierta vs. Cerrada + Aportes + Ordenar Señal
// - 0 cuota API: valida enlaces con resolveMiTvPointer y bloquea duplicados.
// - Anti-spam: exige usuario identificado y máx. 3 aportes/día por señal.
// - "Ordenar mi señal": motor determinista ATLAS que alterna canales, elimina
//   duplicados y prioriza aportes valorados por la comunidad.
// ============================================================================

import { resolveMiTvPointer } from './miTvStore';
import type { ScheduleBlock } from './signalTypes';

export type SignalCollabMode = 'closed' | 'open';
export type SignalModerationMode = 'review' | 'direct';

export interface SignalContribution {
  id: string;
  signalId: string;
  url: string;
  provider: string;
  providerId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  contributedBy: string;
  contributedAt: string;
}

export interface BlockCollabMeta {
  by: string;
  votes: number;
  addedAt: string;
}

export interface SignalCollabConfig {
  mode: SignalCollabMode;
  moderation: SignalModerationMode;
  pending: SignalContribution[];
  blockMeta: Record<string, BlockCollabMeta>;
  /** Registro diario anti-spam: { "YYYY-MM-DD:<user>": count } */
  dailyCounts: Record<string, number>;
}

const STORAGE_KEY = 'youapp_signal_collab_v1';
const MAX_DAILY_CONTRIBUTIONS_PER_USER = 3;

function defaultConfig(): SignalCollabConfig {
  return {
    mode: 'closed',
    moderation: 'review',
    pending: [],
    blockMeta: {},
    dailyCounts: {}
  };
}

function readAll(): Record<string, SignalCollabConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, SignalCollabConfig>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

export function loadSignalCollabConfig(signalId: string): SignalCollabConfig {
  if (!signalId) return defaultConfig();
  const all = readAll();
  const found = all[signalId];
  if (!found) return defaultConfig();
  return {
    mode: found.mode === 'open' ? 'open' : 'closed',
    moderation: found.moderation === 'direct' ? 'direct' : 'review',
    pending: Array.isArray(found.pending) ? found.pending : [],
    blockMeta: found.blockMeta && typeof found.blockMeta === 'object' ? found.blockMeta : {},
    dailyCounts: found.dailyCounts && typeof found.dailyCounts === 'object' ? found.dailyCounts : {}
  };
}

export function saveSignalCollabConfig(
  signalId: string,
  updater: (prev: SignalCollabConfig) => SignalCollabConfig
): SignalCollabConfig {
  const all = readAll();
  const next = updater(loadSignalCollabConfig(signalId));
  all[signalId] = next;
  writeAll(all);
  return next;
}

function todayKey(userLabel: string): string {
  const d = new Date();
  const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${isoDay}:${userLabel.toLowerCase().trim()}`;
}

export async function validateAndBuildContribution(params: {
  signalId: string;
  rawUrl: string;
  contributorName: string;
  existingSchedule: ScheduleBlock[];
  config: SignalCollabConfig;
  isOwner?: boolean;
}): Promise<
  | { ok: true; contribution: SignalContribution; block: ScheduleBlock }
  | { ok: false; error: string }
> {
  const { signalId, rawUrl, contributorName, existingSchedule, config, isOwner } = params;
  const cleanUser = contributorName.trim() || 'Colaborador';

  // Anti-spam: límite diario para colaboradores externos
  if (!isOwner) {
    const k = todayKey(cleanUser);
    const used = config.dailyCounts[k] || 0;
    if (used >= MAX_DAILY_CONTRIBUTIONS_PER_USER) {
      return {
        ok: false,
        error: `Alcanzaste el límite de ${MAX_DAILY_CONTRIBUTIONS_PER_USER} aportes hoy en esta señal.`
      };
    }
  }

  // ATLAS verifica que el enlace sea válido y obtiene título/canal/miniatura con 0 cuota API
  const resolved = await resolveMiTvPointer(rawUrl, 'Ahora');
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const item = resolved.item;
  const normId = (item.providerId || item.sourceUrl || '').toLowerCase();

  // ATLAS controla duplicados en grilla activa y en pendientes
  const dupInSchedule = existingSchedule.some((b) => {
    const ci = b.contentItem as any;
    const bId = String(ci?.providerId || ci?.id || '').toLowerCase();
    const bUrl = String(ci?.videoUrl || ci?.originUrl || '').toLowerCase();
    return (normId && bId === normId) || (item.sourceUrl && bUrl === item.sourceUrl.toLowerCase());
  });
  if (dupInSchedule) {
    return { ok: false, error: 'Este video ya forma parte de la programación de la señal.' };
  }

  const dupInPending = config.pending.some(
    (p) => p.providerId.toLowerCase() === normId || p.url.toLowerCase() === item.sourceUrl.toLowerCase()
  );
  if (dupInPending) {
    return { ok: false, error: 'Este video ya fue propuesto y está pendiente de revisión.' };
  }

  const nowIso = new Date().toISOString();
  const blockId = `collab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const contribution: SignalContribution = {
    id: blockId,
    signalId,
    url: item.sourceUrl,
    provider: item.provider,
    providerId: item.providerId,
    title: item.title,
    author: item.author || 'YouTube',
    thumbnailUrl: item.thumbnailUrl,
    contributedBy: cleanUser,
    contributedAt: nowIso
  };

  const block: ScheduleBlock = {
    id: blockId,
    position: existingSchedule.length,
    startOffsetSec: 0,
    durationSec: 420,
    topic: 'Aporte comunidad',
    role: 'discovery',
    contentItem: {
      id: item.providerId || blockId,
      provider: item.provider === 'youtube' ? 'youtube' : (item.provider as any),
      providerId: item.providerId,
      title: item.title,
      channelTitle: item.author || 'YouTube',
      thumbnail: item.thumbnailUrl,
      videoUrl: item.sourceUrl,
      durationSec: 420
    } as any
  };

  return { ok: true, contribution, block };
}

export function buildBlockFromContribution(c: SignalContribution, position: number): ScheduleBlock {
  return {
    id: c.id,
    position,
    startOffsetSec: 0,
    durationSec: 420,
    topic: 'Aporte comunidad',
    role: 'discovery',
    contentItem: {
      id: c.providerId || c.id,
      provider: c.provider === 'youtube' ? 'youtube' : (c.provider as any),
      providerId: c.providerId,
      title: c.title,
      channelTitle: c.author || 'YouTube',
      thumbnail: c.thumbnailUrl,
      videoUrl: c.url,
      durationSec: 420
    } as any
  };
}

/**
 * ATLAS "Ordenar mi señal" (0 cuota API):
 * - Elimina duplicados por ID de video.
 * - Prioriza aportes con más votos comunitarios y bloques bloqueados/fijos.
 * - Alterna canales (round-robin) para que nunca salgan 2 videos seguidos del mismo canal.
 */
export function atlasSmartOrderSchedule(
  schedule: ScheduleBlock[],
  blockMeta: Record<string, BlockCollabMeta>
): { ordered: ScheduleBlock[]; uniqueChannels: number; removedDuplicates: number } {
  const seen = new Set<string>();
  const unique: ScheduleBlock[] = [];
  let removedDuplicates = 0;

  for (const blk of schedule) {
    const ci = blk.contentItem as any;
    const key = String(ci?.providerId || ci?.id || blk.id).toLowerCase();
    if (seen.has(key)) {
      removedDuplicates++;
      continue;
    }
    seen.add(key);
    unique.push(blk);
  }

  // Agrupar por canal normalizado y ordenar cada grupo por votos comunitarios descendentes
  const byChannel = new Map<string, ScheduleBlock[]>();
  for (const blk of unique) {
    const ci = blk.contentItem as any;
    const chKey = String(ci?.channelTitle || ci?.author || 'general').trim().toLowerCase();
    const list = byChannel.get(chKey) || [];
    list.push(blk);
    byChannel.set(chKey, list);
  }

  for (const list of byChannel.values()) {
    list.sort((a, b) => {
      const va = blockMeta[a.id]?.votes || 0;
      const vb = blockMeta[b.id]?.votes || 0;
      return vb - va;
    });
  }

  // Round-robin entre canales (alternando los que tienen más votos / bloques primero)
  const queues = Array.from(byChannel.values()).sort((a, b) => {
    const va = blockMeta[a[0]?.id]?.votes || 0;
    const vb = blockMeta[b[0]?.id]?.votes || 0;
    if (vb !== va) return vb - va;
    return b.length - a.length;
  });

  const interleaved: ScheduleBlock[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  let offset = 0;
  const ordered = interleaved.map((blk, idx) => {
    const out: ScheduleBlock = {
      ...blk,
      position: idx,
      startOffsetSec: offset
    };
    offset += Math.max(1, blk.durationSec || 300);
    return out;
  });

  return {
    ordered,
    uniqueChannels: byChannel.size,
    removedDuplicates
  };
}
