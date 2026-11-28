// ============================================================================
// ATLAS SIGNAL BUILDER (US$ 0 · 0 Cuota API)
// - A partir de cualquier tema escrito por el usuario, busca videos reales
//   embebibles en Supabase `youapp_index` y complementa con búsqueda pública
//   (`searchYouTubeVideos`) si hace falta.
// - Ordena 10 videos en secuencia editorial (Apertura -> Contexto -> Desarrollo
//   -> Profundidad -> Cierre) y conserva un pool de reserva para intercambiar
//   cualquier bloque en 1 toque.
// ============================================================================

import { supabase } from '../supabase';
import { searchYouTubeVideos } from '../youtubeChannelSearch';
import type { CustomSignal, ScheduleBlock } from './signalTypes';

export type AtlasSignalStyle = 'documental' | 'dinamico' | 'musica';

export interface AtlasDraftVideo {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationSec: number;
  role: 'opening' | 'context' | 'explainer' | 'deep_dive' | 'close';
}

export interface AtlasDraftSignal {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  style: AtlasSignalStyle;
  coverVideoId: string;
  videos: AtlasDraftVideo[];
  reservePool: AtlasDraftVideo[];
}

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
  'en',
  'con',
  'para',
  'por',
  'sobre',
  'mi',
  'tu',
  'su',
  'que',
  'como',
  'mas',
  'muy',
  'senal',
  'señal',
  'canal',
  'videos',
  'video'
]);

const EDITORIAL_ROLES: Array<'opening' | 'context' | 'explainer' | 'deep_dive' | 'close'> = [
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

export const EDITORIAL_ROLE_LABELS: Record<AtlasDraftVideo['role'], string> = {
  opening: 'Apertura',
  context: 'Contexto',
  explainer: 'Desarrollo',
  deep_dive: 'Profundidad',
  close: 'Cierre'
};

function sanitizeTerm(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[,%()✦·•"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(topic: string): string[] {
  const clean = sanitizeTerm(topic)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const words = clean
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 4);
}

function titleCaseTopic(raw: string): string {
  const cleaned = sanitizeTerm(raw);
  if (!cleaned) return 'Mi Señal Temática';
  return cleaned
    .split(/\s+/)
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && STOPWORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function isCleanCandidate(videoId?: string, title?: string): boolean {
  const vid = String(videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) return false;
  const t = String(title || '').trim();
  if (t.length < 4) return false;
  if (/#shorts?\b|\bshorts\b/i.test(t)) return false;
  return true;
}

function parseDurationString(raw?: string | number | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 30) {
    return Math.min(7200, Math.round(raw));
  }
  if (typeof raw === 'string' && raw.includes(':')) {
    const parts = raw.split(':').map((n) => Number(n));
    if (parts.every((n) => Number.isFinite(n))) {
      if (parts.length === 2) return Math.max(60, parts[0] * 60 + parts[1]);
      if (parts.length === 3) return Math.max(60, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
  }
  return 480;
}

async function queryYouAppIndex(term: string, limit = 24): Promise<AtlasDraftVideo[]> {
  const clean = sanitizeTerm(term);
  if (clean.length < 2) return [];
  try {
    const { data, error } = await supabase
      .from('youapp_index')
      .select('video_id,title,creator_name,thumbnail_url,duration_seconds,embeddable')
      .eq('provider', 'youtube')
      .or(`title.ilike.%${clean}%,creator_name.ilike.%${clean}%`)
      .limit(limit);

    if (error || !Array.isArray(data)) return [];

    return data
      .filter((r) => r?.embeddable !== false && isCleanCandidate(r?.video_id, r?.title))
      .map((r) => {
        const vid = String(r.video_id).trim();
        return {
          videoId: vid,
          title: String(r.title).trim().slice(0, 115),
          channelName: String(r.creator_name || 'YouTube').trim().slice(0, 60),
          thumbnailUrl:
            String(r.thumbnail_url || '') || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          durationSec: parseDurationString(r.duration_seconds),
          role: 'explainer' as const
        };
      });
  } catch {
    return [];
  }
}

export async function buildAtlasDraftSignal(opts: {
  topic: string;
  style: AtlasSignalStyle;
  count?: number;
  onProgress?: (stepIndex: number, label: string) => void;
}): Promise<AtlasDraftSignal | null> {
  const cleanTopic = sanitizeTerm(opts.topic);
  if (cleanTopic.length < 2) return null;

  const targetCount = opts.count ?? 10;
  const keywords = extractKeywords(cleanTopic);

  opts.onProgress?.(0, `Buscando videos reales sobre «${cleanTopic}» en ATLAS…`);

  const pool: AtlasDraftVideo[] = [];
  const seen = new Set<string>();
  const pushUnique = (items: AtlasDraftVideo[]) => {
    for (const it of items) {
      if (seen.has(it.videoId)) continue;
      seen.add(it.videoId);
      pool.push(it);
    }
  };

  // 1. Consulta exacta en `youapp_index` (US$ 0)
  const styleSuffix =
    opts.style === 'musica' ? 'musica' : opts.style === 'documental' ? 'documental' : '';
  const searchTerms = [
    cleanTopic,
    ...(styleSuffix ? [`${cleanTopic} ${styleSuffix}`] : []),
    ...keywords.slice(0, 2)
  ];

  const batches = await Promise.all(searchTerms.map((t) => queryYouAppIndex(t, 20)));
  for (const b of batches) pushUnique(b);

  // 2. Si faltan videos para llegar a 10 + reserva, completar con búsqueda pública YouTube (0 cuota)
  if (pool.length < targetCount + 4) {
    opts.onProgress?.(1, 'Ampliando fuentes verificadas para completar tu programación…');
    try {
      const ytQuery = styleSuffix ? `${cleanTopic} ${styleSuffix}` : cleanTopic;
      const webItems = await searchYouTubeVideos(ytQuery, 18);
      pushUnique(
        webItems
          .filter((v) => isCleanCandidate(v.videoId, v.title))
          .map((v) => ({
            videoId: v.videoId,
            title: String(v.title || 'Video').trim().slice(0, 115),
            channelName: String(v.channelName || 'YouTube').trim().slice(0, 60),
            thumbnailUrl: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            durationSec: parseDurationString(v.duration),
            role: 'explainer' as const
          }))
      );
    } catch {
      // silent fallback
    }
  }

  if (pool.length === 0) return null;

  opts.onProgress?.(2, 'Ordenando grilla editorial (Apertura → Desarrollo → Cierre)…');

  // 3. Reordenar según estilo elegido
  const sorted = [...pool].sort((a, b) => {
    if (opts.style === 'dinamico') return a.durationSec - b.durationSec;
    if (opts.style === 'documental') return b.durationSec - a.durationSec;
    return 0;
  });

  // 4. Armar los 10 bloques con roles editoriales y guardar reserva para el botón "Cambiar"
  const picked = sorted.slice(0, targetCount).map((v, idx) => ({
    ...v,
    role: EDITORIAL_ROLES[idx % EDITORIAL_ROLES.length]
  }));
  const reservePool = sorted.slice(targetCount, targetCount + 20);

  const formattedTopic = titleCaseTopic(cleanTopic);
  const styleSubtitle =
    opts.style === 'musica'
      ? `Sesión musical y escenas en vivo de ${formattedTopic}, curada por ATLAS.`
      : opts.style === 'dinamico'
        ? `Programación ágil y directa sobre ${formattedTopic}, armada al instante por ATLAS.`
        : `Documentales, análisis y miradas en profundidad sobre ${formattedTopic}, curada por ATLAS.`;

  const slug = cleanTopic
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);

  return {
    id: `atlas-custom-${slug || 'senal'}-${Date.now().toString(36)}`,
    title: formattedTopic,
    subtitle: styleSubtitle,
    topic: cleanTopic,
    style: opts.style,
    coverVideoId: picked[0].videoId,
    videos: picked,
    reservePool
  };
}

export function convertAtlasDraftToCustomSignal(
  draft: AtlasDraftSignal,
  customTitle?: string
): CustomSignal {
  const nowIso = new Date().toISOString();
  const finalTitle = (customTitle || draft.title).trim() || draft.title;
  let offset = 0;

  const schedule: ScheduleBlock[] = draft.videos.map((v, idx) => {
    const dur = Math.max(60, v.durationSec || 420);
    const block: ScheduleBlock = {
      id: `${draft.id}-blk-${idx + 1}`,
      position: idx,
      startOffsetSec: offset,
      durationSec: dur,
      topic: `${finalTitle} · ${EDITORIAL_ROLE_LABELS[v.role]}`,
      role: v.role,
      contentItem: {
        id: v.videoId,
        providerId: v.videoId,
        type: 'video',
        provider: 'youtube',
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        thumbnail: v.thumbnailUrl,
        videoUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
        channelName: v.channelName,
        channelTitle: v.channelName,
        channelId: `yt-${v.videoId}`,
        durationSec: dur,
        isLive: false,
        isVerified: true
      } as any
    };
    offset += dur;
    return block;
  });

  return {
    id: draft.id,
    name: finalTitle,
    seedVersion: 5,
    prompt: draft.subtitle,
    visibility: 'public',
    created_at: nowIso,
    updated_at: nowIso,
    schedule
  } as unknown as CustomSignal;
}
