import catalogJson from '../../data/youapp100SignalsCatalog.json';
import type { CustomSignal, ScheduleBlock } from './signalTypes';

export type Signal100ThemeId = 'cultura' | 'musica' | 'mundo';

export interface Signal100Video {
  id: string;
  title: string;
  channel: string;
  durationSec: number;
}

export interface Signal100Definition {
  id: string;
  theme: Signal100ThemeId;
  title: string;
  subtitle: string;
  accent: string;
  coverVideoId: string;
  videos: Signal100Video[];
}

export interface Signal100ThemeInfo {
  id: Signal100ThemeId;
  label: string;
  shortLabel: string;
  count: number;
}

const rawSignals = Array.isArray((catalogJson as { signals?: unknown[] })?.signals)
  ? ((catalogJson as { signals: Signal100Definition[] }).signals)
  : [];

export const SIGNALS_100_CATALOG: Signal100Definition[] = rawSignals;

export const SIGNALS_100_THEMES: Signal100ThemeInfo[] = [
  {
    id: 'cultura',
    label: 'Cultura, Historia y Saber',
    shortLabel: 'Cultura & Saber',
    count: rawSignals.filter((s) => s.theme === 'cultura').length
  },
  {
    id: 'musica',
    label: 'Música, Conciertos y Escena',
    shortLabel: 'Música & Escena',
    count: rawSignals.filter((s) => s.theme === 'musica').length
  },
  {
    id: 'mundo',
    label: 'Deportes, Actualidad y Vida Real',
    shortLabel: 'Deportes & Mundo',
    count: rawSignals.filter((s) => s.theme === 'mundo').length
  }
];

export function findSignal100ById(idOrTitle?: string | null): Signal100Definition | null {
  const key = String(idOrTitle || '').trim().toLowerCase();
  if (!key) return null;
  return (
    SIGNALS_100_CATALOG.find(
      (s) => s.id.toLowerCase() === key || s.title.toLowerCase() === key
    ) || null
  );
}

export function buildCustomSignalFrom100(sig: Signal100Definition): CustomSignal {
  const nowIso = new Date().toISOString();
  let offset = 0;
  const roles: Array<'opening' | 'context' | 'explainer' | 'deep_dive' | 'close'> = [
    'opening',
    'context',
    'explainer',
    'deep_dive',
    'explainer',
    'context',
    'deep_dive',
    'explainer',
    'context',
    'close'
  ];

  const schedule: ScheduleBlock[] = sig.videos.map((v, idx) => {
    const dur = Math.max(60, Number(v.durationSec) || 420);
    const thumb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
    const block: ScheduleBlock = {
      id: `${sig.id}-blk-${idx + 1}`,
      position: idx,
      startOffsetSec: offset,
      durationSec: dur,
      topic: `${sig.title} · #${idx + 1}`,
      role: roles[idx % roles.length],
      contentItem: {
        id: v.id,
        providerId: v.id,
        type: 'video',
        provider: 'youtube',
        title: v.title,
        thumbnailUrl: thumb,
        thumbnail: thumb,
        videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
        channelName: v.channel,
        channelTitle: v.channel,
        channelId: `yt-${v.id}`,
        durationSec: dur,
        isLive: false,
        isVerified: true
      } as any
    };
    offset += dur;
    return block;
  });

  return {
    id: sig.id,
    name: sig.title,
    seedVersion: 5,
    prompt: sig.subtitle,
    visibility: 'public',
    created_at: nowIso,
    updated_at: nowIso,
    schedule
  } as unknown as CustomSignal;
}

// ============================================================================
// SEÑALES FAVORITAS (fijar en 1 toque arriba de todo · localStorage US$ 0)
// ============================================================================

const FAVORITE_SIGNALS_KEY = 'youapp_favorite_signals_v1';
export const FAVORITE_SIGNALS_CHANGED_EVENT = 'youapp:favorite-signals-changed';

export function loadFavoriteSignalIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITE_SIGNALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function toggleFavoriteSignalId(signalId: string): { ids: string[]; active: boolean } {
  const cleanId = String(signalId || '').trim();
  if (!cleanId) return { ids: loadFavoriteSignalIds(), active: false };
  const prev = loadFavoriteSignalIds();
  const exists = prev.includes(cleanId);
  const next = exists ? prev.filter((id) => id !== cleanId) : [cleanId, ...prev].slice(0, 60);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FAVORITE_SIGNALS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(FAVORITE_SIGNALS_CHANGED_EVENT));
    } catch {
      // ignore quota
    }
  }
  return { ids: next, active: !exists };
}
