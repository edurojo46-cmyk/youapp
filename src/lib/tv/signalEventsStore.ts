const SIGNAL_EVENTS_KEY = 'youapp_signal_events_v1';

export type SignalEventCategory =
  | 'Deporte'
  | 'Política / Elecciones'
  | 'Cultura / Festival'
  | 'Especial';

export interface SignalEventMeta {
  signalId: string;
  category: SignalEventCategory;
  startsAt: string; // ISO datetime
  endsAt: string;   // ISO datetime
  location?: string;
}

export type SignalEventPhase = 'UPCOMING' | 'LIVE' | 'ARCHIVE';

function readAllEventsMap(): Record<string, SignalEventMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SIGNAL_EVENTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAllEventsMap(map: Record<string, SignalEventMeta>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIGNAL_EVENTS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function readSignalEventMeta(signalId?: string | null): SignalEventMeta | null {
  if (!signalId) return null;
  const all = readAllEventsMap();
  return all[signalId] || null;
}

export function saveSignalEventMeta(meta: SignalEventMeta): void {
  const all = readAllEventsMap();
  all[meta.signalId] = meta;
  writeAllEventsMap(all);
}

export function clearSignalEventMeta(signalId: string): void {
  const all = readAllEventsMap();
  delete all[signalId];
  writeAllEventsMap(all);
}

function formatDelta(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} min`;
}

export function getSignalEventPhase(
  meta: SignalEventMeta,
  nowMs = Date.now()
): { phase: SignalEventPhase; badge: string; detail: string } {
  const start = Date.parse(meta.startsAt);
  const end = Date.parse(meta.endsAt);

  if (!Number.isNaN(start) && nowMs < start) {
    return {
      phase: 'UPCOMING',
      badge: 'PRÓXIMAMENTE',
      detail: `Empieza en ${formatDelta(start - nowMs)}`
    };
  }
  if (!Number.isNaN(end) && nowMs > end) {
    return {
      phase: 'ARCHIVE',
      badge: 'ARCHIVO',
      detail: 'Acontecimiento finalizado · Disponible en archivo'
    };
  }
  return {
    phase: 'LIVE',
    badge: 'EN VIVO',
    detail: !Number.isNaN(end)
      ? `Acontecimiento en curso · Quedan ${formatDelta(end - nowMs)}`
      : 'Acontecimiento en curso'
  };
}

// ============================================================================
// Cobertura en Vivo de Acontecimientos (Marcador + Minuto a Minuto + Comentarios)
// ============================================================================

const SIGNAL_EVENT_COVERAGE_KEY = 'youapp_signal_event_coverage_v1';

export type SignalEventUpdateTag =
  | 'DESTACADO'
  | 'RESULTADO'
  | 'NOTICIA'
  | 'VIDEO'
  | 'AUDIO'
  | 'DATO';

export interface SignalEventScoreboard {
  enabled: boolean;
  mode: 'versus' | 'status';
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  statusLine: string;
  updatedAt: string;
}

export interface SignalEventUpdate {
  id: string;
  timeLabel: string;
  tag: SignalEventUpdateTag;
  text: string;
  sourceName?: string;
  sourceUrl?: string;
  createdAt: string;
}

export interface SignalEventComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likes: number;
}

export interface SignalEventCoverage {
  signalId: string;
  active: boolean;
  title: string;
  subtitle: string;
  category: SignalEventCategory;
  scoreboard: SignalEventScoreboard;
  updates: SignalEventUpdate[];
  comments: SignalEventComment[];
  updatedAt: string;
}

function readAllCoverageMap(): Record<string, SignalEventCoverage> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SIGNAL_EVENT_COVERAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAllCoverageMap(map: Record<string, SignalEventCoverage>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIGNAL_EVENT_COVERAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function nowTimeLabel(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function readEventCoverage(signalId?: string | null): SignalEventCoverage | null {
  if (!signalId) return null;
  const all = readAllCoverageMap();
  return all[signalId] || null;
}

export function saveEventCoverage(coverage: SignalEventCoverage): SignalEventCoverage {
  const all = readAllCoverageMap();
  const next: SignalEventCoverage = {
    ...coverage,
    updatedAt: new Date().toISOString()
  };
  all[coverage.signalId] = next;
  writeAllCoverageMap(all);
  return next;
}

export function activateEventCoverage(
  signalId: string,
  opts: {
    title: string;
    subtitle?: string;
    category: SignalEventCategory;
    mode?: 'versus' | 'status';
    leftLabel?: string;
    rightLabel?: string;
    statusLine?: string;
  }
): SignalEventCoverage {
  const existing = readEventCoverage(signalId);
  const nowIso = new Date().toISOString();
  const mode = opts.mode || (opts.category === 'Deporte' ? 'versus' : 'status');

  const coverage: SignalEventCoverage = {
    signalId,
    active: true,
    title: opts.title.trim() || 'Cobertura en vivo',
    subtitle: opts.subtitle?.trim() || 'Fuentes verificadas, minuto a minuto y comentarios',
    category: opts.category,
    scoreboard: {
      enabled: true,
      mode,
      leftLabel: opts.leftLabel?.trim() || (mode === 'versus' ? 'Local' : 'Estado'),
      leftValue: mode === 'versus' ? '0' : 'EN CURSO',
      rightLabel: opts.rightLabel?.trim() || (mode === 'versus' ? 'Visitante' : ''),
      rightValue: mode === 'versus' ? '0' : '',
      statusLine:
        opts.statusLine?.trim() ||
        (mode === 'versus' ? 'Previa · Por comenzar' : 'Cobertura abierta'),
      updatedAt: nowIso
    },
    updates: existing?.updates?.length
      ? existing.updates
      : [
          {
            id: `ev-upd-${Date.now().toString(36)}`,
            timeLabel: nowTimeLabel(),
            tag: 'DESTACADO',
            text: `Iniciamos la cobertura en vivo: ${opts.title.trim() || 'Acontecimiento'}. Reunimos video, audio, noticias y actualizaciones en un solo lugar.`,
            createdAt: nowIso
          }
        ],
    comments: existing?.comments || [],
    updatedAt: nowIso
  };

  return saveEventCoverage(coverage);
}

export function deactivateEventCoverage(signalId: string): SignalEventCoverage | null {
  const existing = readEventCoverage(signalId);
  if (!existing) return null;
  return saveEventCoverage({ ...existing, active: false });
}

export function updateEventScoreboard(
  signalId: string,
  patch: Partial<SignalEventScoreboard>
): SignalEventCoverage | null {
  const existing = readEventCoverage(signalId);
  if (!existing) return null;
  return saveEventCoverage({
    ...existing,
    scoreboard: {
      ...existing.scoreboard,
      ...patch,
      updatedAt: new Date().toISOString()
    }
  });
}

export function addEventUpdate(
  signalId: string,
  input: {
    tag: SignalEventUpdateTag;
    text: string;
    timeLabel?: string;
    sourceName?: string;
    sourceUrl?: string;
  }
): SignalEventCoverage | null {
  const existing = readEventCoverage(signalId);
  if (!existing || !input.text.trim()) return existing;
  const item: SignalEventUpdate = {
    id: `ev-upd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    timeLabel: (input.timeLabel || '').trim() || nowTimeLabel(),
    tag: input.tag,
    text: input.text.trim(),
    sourceName: input.sourceName?.trim() || undefined,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    createdAt: new Date().toISOString()
  };
  return saveEventCoverage({
    ...existing,
    updates: [item, ...existing.updates].slice(0, 60)
  });
}

export function deleteEventUpdate(
  signalId: string,
  updateId: string
): SignalEventCoverage | null {
  const existing = readEventCoverage(signalId);
  if (!existing) return null;
  return saveEventCoverage({
    ...existing,
    updates: existing.updates.filter((u) => u.id !== updateId)
  });
}

export function addEventComment(
  signalId: string,
  author: string,
  text: string
): SignalEventCoverage | null {
  const existing = readEventCoverage(signalId);
  if (!existing || !text.trim()) return existing;
  const item: SignalEventComment = {
    id: `ev-cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    author: author.trim() || 'Espectador YOUAPP',
    text: text.trim(),
    createdAt: new Date().toISOString(),
    likes: 0
  };
  return saveEventCoverage({
    ...existing,
    comments: [item, ...existing.comments].slice(0, 100)
  });
}

export function likeEventComment(
  signalId: string,
  commentId: string
): SignalEventCoverage | null {
  const existing = readEventCoverage(signalId);
  if (!existing) return null;
  return saveEventCoverage({
    ...existing,
    comments: existing.comments.map((c) =>
      c.id === commentId ? { ...c, likes: c.likes + 1 } : c
    )
  });
}
