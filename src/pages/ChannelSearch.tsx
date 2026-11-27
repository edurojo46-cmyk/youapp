/**
 * ChannelSearch (/search) — Buscador Rápido de YOUAPP TV (Base Nube 181.730+ videos YouTube · 0 Cuota)
 *
 * - Consulta primero en <150 ms a tu base real `youapp_index` en Supabase (100 % YouTube, 0 cuota).
 * - Solo si encuentra menos de 12 resultados, completa automáticamente con `searchYouTubeVideos`.
 * - Previsualización instantánea arriba sin perder la lista + botones 1-clic `+ Mi Señal` y `+ YOU MUSIC`.
 * - Estética Apple Glass oscuro unificada + barra superior en mayúsculas.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Mic,
  MicOff,
  Loader2,
  Plus,
  Music,
  Radio,
  Tv,
  Film,
  Landmark,
  Flame,
  ArrowLeft,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Cast,
  Volume2,
  VolumeX,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Heart,
  Sparkles,
  Settings2,
  List,
  UserPlus,
  UserCheck,
  EyeOff,
  PictureInPicture2,
  RotateCcw,
  Share2
} from 'lucide-react';
import { fetchYouTubeAutocomplete } from '../lib/search/queryEngine';
import { searchYouTubeVideos } from '../lib/youtubeChannelSearch';
import { supabase } from '../lib/supabase';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { CountrySelectorPill } from '../components/ui/CountrySelectorPill';
import { getActiveCountryProfile } from '../lib/geo/userCountry';
import {
  SOCIAL_GRAPH_CHANGED_EVENT,
  buildYouTubeSubscribeUrl,
  clearHiddenChannelsInGraph,
  fetchYouTubeVideoMeta,
  formatCompactViews,
  formatPublishedDateEs,
  hideChannelInGraph,
  isChannelHiddenInGraph,
  loadSocialGraph,
  unhideChannelInGraph,
  toggleFollowCreatorWithMeta,
  toggleLikeVideoWithMeta,
  type VideoPublicMeta,
  type YouAppSocialGraph
} from '../lib/tv/youappSocialStore';
import { passesCategoryGate } from '../lib/search/categoryGate';
import { SmartBar } from '../components/smartbar/SmartBar';
import { PlayerControlsDrawer } from '../components/player/PlayerControlsDrawer';
import { useLandscapeAutoFullscreen } from '../hooks/useLandscapeAutoFullscreen';
import { MosaicPlayerGrid } from '../components/player/MosaicPlayerGrid';
import { DailymotionOfficialPlayer } from '../components/player/DailymotionOfficialPlayer';
import { setGlobalMiniVideo } from '../components/player/GlobalMiniPlayer';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import {
  canAutoSkip,
  isUnplayableYouTubeError,
  isVideoMarkedUnplayable,
  reportUnplayableYouTubeVideo,
  resetAutoSkip
} from '../lib/player/videoResilience';
import type { ScheduleBlock } from '../lib/tv/signalTypes';
import { usePlayerStore } from '../store/usePlayerStore';
import { useStore, type AlgorithmProfile } from '../store/useStore';
import { getMomentsForVideo } from '../lib/moments/momentEngine';
import type { VideoMoment } from '../lib/moments/momentTypes';
import atlasMusicCatalog from '../data/atlasMusicChannels.json';

const HIST_KEY = 'youapp_chsearch_v4';
const LEARNED_POINTERS_KEY = 'youapp_atlas_learned_pointers_v1';
const SEARCH_RAM_CACHE = new Map<string, { items: SearchVideoItem[]; hasMore: boolean; expires: number }>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

const getHist = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveHist = (q: string) => {
  const h = getHist().filter((x) => x !== q);
  localStorage.setItem(HIST_KEY, JSON.stringify([q, ...h].slice(0, 12)));
};

const readLearnedPointers = (): SearchVideoItem[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNED_POINTERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLearnedPointersLocal = (items: SearchVideoItem[]) => {
  if (items.length === 0) return;
  try {
    const prev = readLearnedPointers();
    const map = new Map<string, SearchVideoItem>();
    for (const it of items) {
      map.set(it.videoId, { ...it, sourceLabel: 'Base ATLAS (0 cuota)' });
    }
    for (const old of prev) {
      if (!map.has(old.videoId)) map.set(old.videoId, old);
    }
    localStorage.setItem(LEARNED_POINTERS_KEY, JSON.stringify(Array.from(map.values()).slice(0, 600)));
  } catch {
    // ignore quota errors
  }
};

async function absorbYouTubePointersToAtlas(
  ytItems: SearchVideoItem[],
  categoryTag: string | null,
  extraTags: string[] = []
): Promise<number> {
  if (ytItems.length === 0) return 0;
  saveLearnedPointersLocal(ytItems);

  try {
    const ids = ytItems.map((i) => i.videoId);
    const { data: existing, error: selErr } = await supabase
      .from('youapp_index')
      .select('video_id')
      .in('video_id', ids);
    if (selErr) return 0;

    const existingSet = new Set((existing || []).map((r: any) => String(r?.video_id || '')));
    const fresh = ytItems.filter((i) => !existingSet.has(i.videoId));
    if (fresh.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const tagsBase = Array.from(
      new Set(['atlas-pointer-compact', 'search-learned', ...(categoryTag ? [categoryTag] : []), ...extraTags])
    );

    const rows = fresh.map((it) => ({
      video_id: it.videoId,
      provider_content_id: it.videoId,
      url: it.watchUrl,
      canonical_url: it.watchUrl,
      embed_url: `https://www.youtube.com/embed/${it.videoId}`,
      title: it.title.slice(0, 240),
      description: `${it.channelName} · Puntero compactado aprendido por ATLAS Search`,
      thumbnail: it.thumbnail,
      thumbnail_url: it.thumbnail,
      provider: 'youtube',
      creator_id: it.channelId || '',
      creator_name: it.channelName.slice(0, 120),
      tags: tagsBase,
      duration_text: it.duration || '',
      duration_seconds: parseDurationToSeconds(it.duration, it.durationSeconds),
      views: parseViewsToNumber(it.views),
      likes: 0,
      language: 'es',
      content_state: 'discovered',
      embeddable: true,
      metadata_completeness: 80,
      metadata_readiness: 85,
      metadata_provenance: 'unknown',
      source_verified: true,
      source: 'atlas',
      content_format: 'longform',
      updated_at: nowIso
    }));

    const { error: insErr } = await supabase.from('youapp_index').insert(rows);
    return insErr ? 0 : fresh.length;
  } catch {
    return 0;
  }
}

type SearchVideoItem = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  thumbnail: string;
  watchUrl: string;
  embedUrl?: string;
  duration?: string;
  durationSeconds?: number;
  views?: number | string;
  publishedAt?: string;
  provider?: 'youtube' | 'dailymotion' | 'vimeo' | 'peertube' | 'archive' | 'odysee' | 'twitch';
  sourceLabel:
    | 'Base ATLAS (0 cuota)'
    | 'Catálogo Musical'
    | 'YouTube'
    | 'Dailymotion'
    | 'Vimeo'
    | 'PeerTube'
    | 'Archive'
    | 'Odysee'
    | 'Twitch';
  tags?: string[];
};

function parseDurationToSeconds(durationText?: string, durationSeconds?: number): number {
  const sec = Number(durationSeconds || 0);
  if (Number.isFinite(sec) && sec > 0) return Math.floor(sec);
  const txt = String(durationText || '').trim();
  if (!txt || txt === '0' || txt === '0:00') return 0;
  const parts = txt.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseViewsToNumber(views?: number | string): number {
  if (typeof views === 'number' && Number.isFinite(views)) return views;
  const raw = String(views || '').toLowerCase().trim();
  if (!raw) return 0;
  const numMatch = raw.replace(/\./g, '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 0;
  const base = Number(numMatch[1]);
  if (!Number.isFinite(base)) return 0;
  if (raw.includes('m')) return Math.round(base * 1_000_000);
  if (raw.includes('k') || raw.includes('mil')) return Math.round(base * 1_000);
  return Math.round(base);
}

function formatDurationLabel(durationText?: string, durationSeconds?: number): string | undefined {
  const txt = String(durationText || '').trim();
  if (txt && txt !== '0' && txt !== '0:00') return txt;
  const sec = Number(durationSeconds || 0);
  if (!Number.isFinite(sec) || sec <= 0) return undefined;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViewsLabel(views?: number | string): string | null {
  if (views === undefined || views === null || views === '') return null;
  if (typeof views === 'string') {
    const cleaned = views.trim();
    if (!cleaned || cleaned === '0') return null;
    if (/[a-zA-Z]/.test(cleaned)) return cleaned.toLowerCase().includes('vista') ? cleaned : `${cleaned} vistas`;
  }
  const n = Number(views);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} M vistas`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')} mil vistas`;
  return `${n.toLocaleString('es-AR')} vistas`;
}

function formatPublishedLabel(raw?: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

type AtlasCatalogChannel = {
  channelId: string;
  name: string;
  artistLabel: string;
  genre: string;
  videos: Array<{
    videoId: string;
    title: string;
    publishedAt?: string;
    thumbnail?: string;
    watchUrl?: string;
  }>;
};

const ATLAS_VERIFIED_MUSIC: AtlasCatalogChannel[] = Array.isArray(atlasMusicCatalog?.channels)
  ? (atlasMusicCatalog.channels as AtlasCatalogChannel[])
  : [];

type UserRegionCode = 'AR' | 'MX' | 'ES' | 'US' | 'LATAM';

function detectUserRegion(): UserRegionCode {
  try {
    const tz = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
    const lang = String(navigator.language || '').toLowerCase();
    if (tz.includes('argentina') || tz.includes('buenos_aires') || tz.includes('cordoba') || tz.includes('mendoza') || tz.includes('salta') || tz.includes('tucuman') || lang === 'es-ar') {
      return 'AR';
    }
    if (tz.includes('mexico') || tz.includes('monterrey') || tz.includes('tijuana') || tz.includes('cancun') || lang === 'es-mx') {
      return 'MX';
    }
    if (tz.includes('madrid') || tz.includes('canary') || lang === 'es-es') {
      return 'ES';
    }
    if (
      tz.includes('new_york') ||
      tz.includes('chicago') ||
      tz.includes('denver') ||
      tz.includes('los_angeles') ||
      tz.includes('phoenix') ||
      lang === 'en-us'
    ) {
      return 'US';
    }
  } catch {
    // fallback below
  }
  return 'LATAM';
}

const REGION_LABELS: Record<UserRegionCode, string> = {
  AR: 'Argentina · LATAM · EEUU',
  MX: 'México · LATAM · EEUU',
  ES: 'España · LATAM · Internacional',
  US: 'EEUU · Internacional · LATAM',
  LATAM: 'LATAM · Argentina · EEUU'
};

function classifyNewsRegion(creatorName: string, language?: string): 'AR' | 'MX' | 'ES' | 'US' | 'LATAM' {
  const n = normText(creatorName);
  if (
    n.includes('todo noticias') ||
    n.includes('la nacion') ||
    n.includes('c5n') ||
    n.includes('cronica') ||
    n.includes('a24') ||
    n.includes('telefe') ||
    n.includes('eltrece') ||
    n.includes('infobae') ||
    n.includes('clarin') ||
    n.includes('ambito') ||
    n.includes('tv publica') ||
    n.includes('perfil')
  ) {
    return 'AR';
  }
  if (n.includes('milenio') || n.includes('azteca') || n.includes('imagen noticias') || n.includes('el universal')) {
    return 'MX';
  }
  if (n.includes('rtve') || n.includes('antena 3') || n.includes('el pais') || n.includes('euronews')) {
    return 'ES';
  }
  if (
    n.includes('associated press') ||
    n.includes('reuters') ||
    n.includes('cnbc') ||
    n.includes('sky news') ||
    n.includes('bbc news') ||
    language === 'en'
  ) {
    return 'US';
  }
  return 'LATAM';
}

function mixNewsByUserRegion(rows: any[], region: UserRegionCode): any[] {
  const byDateDesc = (a: any, b: any) => String(b?.published_at || '').localeCompare(String(a?.published_at || ''));
  const ar: any[] = [];
  const mx: any[] = [];
  const es: any[] = [];
  const latam: any[] = [];
  const us: any[] = [];

  for (const r of rows) {
    const bucket = classifyNewsRegion(String(r?.creator_name || ''), r?.language);
    if (bucket === 'AR') ar.push(r);
    else if (bucket === 'MX') mx.push(r);
    else if (bucket === 'ES') es.push(r);
    else if (bucket === 'US') us.push(r);
    else latam.push(r);
  }
  ar.sort(byDateDesc);
  mx.sort(byDateDesc);
  es.sort(byDateDesc);
  latam.sort(byDateDesc);
  us.sort(byDateDesc);

  // Patrón ponderado según ubicación detectada (ej. en AR: 3 AR + 1 LATAM/ES + 1 EEUU por cada bloque de 5)
  const latamPool = [...latam, ...mx, ...es].sort(byDateDesc);
  const pattern: any[][] =
    region === 'AR'
      ? [ar, ar, ar, latamPool, us]
      : region === 'MX'
        ? [mx, latam, ar, us, es]
        : region === 'ES'
          ? [es, es, latam, ar, us]
          : region === 'US'
            ? [us, us, us, latamPool, ar]
            : [latam, ar, ar, mx, us];

  const cursors = new Map<any[], number>();
  const usedIds = new Set<string>();
  const out: any[] = [];

  const pullNext = (arr: any[]) => {
    let c = cursors.get(arr) || 0;
    while (c < arr.length) {
      const candidate = arr[c++];
      const vid = String(candidate?.video_id || '');
      if (vid && !usedIds.has(vid)) {
        cursors.set(arr, c);
        usedIds.add(vid);
        return candidate;
      }
    }
    cursors.set(arr, c);
    return null;
  };

  let progress = true;
  while (progress && out.length < rows.length) {
    progress = false;
    for (const slot of pattern) {
      const next = pullNext(slot);
      if (next) {
        out.push(next);
        progress = true;
      }
    }
  }
  // Agregar cualquier remanente ordenado por fecha
  for (const r of [...rows].sort(byDateDesc)) {
    const vid = String(r?.video_id || '');
    if (vid && !usedIds.has(vid)) {
      usedIds.add(vid);
      out.push(r);
    }
  }
  return out;
}

const normText = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const QUICK_CATEGORIES = [
  { id: 'todos', label: 'Todos', tag: null },
  { id: 'ia-cursos', label: 'IA & Cursos', tag: 'ia-cursos' },
  { id: 'familia', label: 'Familia', tag: 'familia' },
  { id: 'bienestar', label: 'Bienestar', tag: 'bienestar' },
  { id: 'noticias', label: 'Noticias', tag: 'noticias' },
  { id: 'economia', label: 'Economía', tag: 'economia' },
  { id: 'autos', label: 'Autos', tag: 'autos' },
  { id: 'salud', label: 'Salud', tag: 'salud' },
  { id: 'cine', label: 'Cine', tag: 'cine' },
  { id: 'cocina', label: 'Cocina', tag: 'cocina' },
  { id: 'streaming', label: 'Streaming', tag: 'streaming' },
  { id: 'gaming', label: 'Gaming', tag: 'gaming' },
  { id: 'urbano', label: 'Urbano', tag: 'urbano' },
  { id: 'deportes', label: 'Deportes', tag: 'deportes' },
  { id: 'podcasts', label: 'Podcasts', tag: 'podcasts' },
  { id: 'tech', label: 'Tech', tag: 'tech' },
  { id: 'historia', label: 'Historia', tag: 'historia' },
  { id: 'documentales', label: 'Documentales', tag: 'documentales' },
  { id: 'musica', label: 'Música', tag: 'musica' },
  { id: 'rock', label: 'Rock', tag: 'rock' },
  { id: 'pop', label: 'Pop', tag: 'pop' },
  { id: 'latino', label: 'Latino', tag: 'latino' },
  { id: 'jazz', label: 'Jazz', tag: 'jazz' },
  { id: 'clasica', label: 'Clásica', tag: 'clasica' }
] as const;

const YOUTH_CATEGORY_TAGS = new Set([
  'peliculas-completas',
  'ia-cursos',
  'familia',
  'bienestar',
  'noticias',
  'economia',
  'autos',
  'salud',
  'cine',
  'cocina',
  'streaming',
  'gaming',
  'urbano',
  'deportes',
  'podcasts',
  'tech',
  'pop',
  'latino'
]);

const SUGGESTED_CHIPS = [
  { icon: Music, label: 'Música' },
  { icon: Flame, label: 'Rock' },
  { icon: Film, label: 'Películas completas' },
  { icon: Landmark, label: 'Historia argentina' },
  { icon: Tv, label: 'Documentales' },
  { icon: Radio, label: 'Jazz' }
];

function searchLocalAtlasMusic(query: string, categoryTag: string | null): SearchVideoItem[] {
  const q = normText(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const isPureCategory =
    Boolean(categoryTag) &&
    (q === categoryTag || q === 'musica' || q === 'music' || q === `musica ${categoryTag}`);

  const out: SearchVideoItem[] = [];
  for (const ch of ATLAS_VERIFIED_MUSIC) {
    const chGenre = normText(ch.genre);
    if (categoryTag && categoryTag !== 'musica' && chGenre !== categoryTag) continue;

    const chHaystack = normText(`${ch.name} ${ch.artistLabel} ${ch.genre} musica`);
    const chMatch =
      isPureCategory ||
      chHaystack.includes(q) ||
      (tokens.length > 0 && tokens.every((t) => chHaystack.includes(t)));

    // En vista por género/tendencia, 1 tema principal por artista popular para máxima variedad
    const videosToCheck = isPureCategory ? (ch.videos || []).slice(0, 1) : ch.videos || [];
    for (const vid of videosToCheck) {
      if (!vid?.videoId || !/^[A-Za-z0-9_-]{11}$/.test(vid.videoId)) continue;
      const vidHaystack = normText(`${vid.title} ${ch.name} ${ch.genre}`);
      const vidMatch =
        chMatch ||
        vidHaystack.includes(q) ||
        (tokens.length > 0 && tokens.every((t) => vidHaystack.includes(t)));
      if (!vidMatch) continue;

      out.push({
        videoId: vid.videoId,
        title: vid.title,
        channelName: `${ch.name} · ${ch.genre}`,
        channelId: ch.channelId,
        thumbnail: vid.thumbnail || `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`,
        watchUrl: vid.watchUrl || `https://www.youtube.com/watch?v=${vid.videoId}`,
        publishedAt: vid.publishedAt,
        sourceLabel: 'Catálogo Musical'
      });
      if (out.length >= 50) return out;
    }
  }
  return out;
}

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'en', 'con', 'los', 'las', 'del', 'para', 'por', 'una', 'uno', 'unos', 'unas', 'que', 'the', 'and', 'of', 'full'
]);

const MODIFIER_WORDS = new Set([
  'album', 'albun', 'disco', 'completo', 'completos', 'completa', 'completas',
  'oficial', 'official', 'vivo', 'live', 'hd', '4k', 'video', 'videos', 'canciones',
  'exitos', 'hits', 'espanol', 'subtitulado', 'documental', 'pelicula', 'peliculas', 'resumen'
]);

function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\balbun\b/gi, 'album')
    .replace(/\bphill\b/gi, 'phil')
    .replace(/\busuahia\b/gi, 'ushuaia')
    .replace(/\broling\b/gi, 'rolling')
    .replace(/\bston+e?s?\b/gi, (m) => (/^ston(s|ne|nes)$/i.test(m) ? 'stones' : m))
    .replace(/\bfloid\b/gi, 'floyd')
    .replace(/\b(beatels|bitles)\b/gi, 'beatles')
    .replace(/\bcharli\b/gi, 'charly')
    .replace(/\bspineta\b/gi, 'spinetta')
    .replace(/\bceratti\b/gi, 'cerati')
    .replace(/\bdocumentale\b/gi, 'documentales')
    .replace(/\bhitoria\b/gi, 'historia')
    .replace(/\s+/g, ' ');
}

function scoreSemanticMatch(item: { title: string; channelName: string }, queryNorm: string): number {
  const hay = normText(`${item.title} ${item.channelName}`);
  if (!hay || !queryNorm) return 0;

  let score = 0;
  if (hay.includes(queryNorm)) score += 100;

  const allTokens = queryNorm
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  if (allTokens.length === 0) return score;

  const entityTokens = allTokens.filter((t) => !MODIFIER_WORDS.has(t));
  const coreTokens = entityTokens.length > 0 ? entityTokens : allTokens;

  let coreHits = 0;
  for (const tok of coreTokens) {
    if (hay.includes(tok)) {
      coreHits += 1;
      score += 35;
    } else if (tok.length >= 4 && hay.includes(tok.slice(0, tok.length - 1))) {
      // Tolerancia leve a 1 letra (ej. phill -> phil, albun -> album)
      coreHits += 0.75;
      score += 22;
    }
  }

  // Compuerta semántica: si hay palabras de entidad (ej. "phil", "collins"),
  // exigir que coincidan casi todas las palabras clave (nunca traer otro artista solo por "album")
  const requiredCoreRatio = coreTokens.length >= 2 ? 0.75 : 1;
  if (coreHits / coreTokens.length < requiredCoreRatio) {
    return 0;
  }

  for (const tok of allTokens) {
    if (MODIFIER_WORDS.has(tok) && hay.includes(tok)) {
      score += 15;
    }
  }

  return score;
}

async function searchChannelVideosDirect(
  channelName: string,
  channelId?: string,
  offset: number = 0
): Promise<SearchVideoItem[]> {
  const selectCols =
    'video_id,title,creator_id,creator_name,tags,thumbnail_url,thumbnail,duration_text,duration_seconds,views,published_at';
  const cleanName = channelName.split('·')[0].trim().replace(/[,%()]/g, '');

  let req = supabase
    .from('youapp_index')
    .select(selectCols)
    .eq('provider', 'youtube');

  if (channelId && /^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    req = req.eq('creator_id', channelId);
  } else if (cleanName.length >= 2) {
    req = req.ilike('creator_name', `%${cleanName}%`);
  } else {
    return [];
  }

  const { data, error } = await req
    .order('views', { ascending: false })
    .range(offset, offset + 49);

  if (error || !Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: SearchVideoItem[] = [];
  for (const r of data) {
    const videoId = String(r?.video_id || '').trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    const durLabel = formatDurationLabel(r?.duration_text, r?.duration_seconds);
    out.push({
      videoId,
      title: String(r?.title || 'Video de YouTube'),
      channelName: String(r?.creator_name || cleanName || 'YouTube'),
      channelId: r?.creator_id ? String(r.creator_id) : channelId,
      thumbnail: String(r?.thumbnail_url || r?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      duration: durLabel,
      durationSeconds: parseDurationToSeconds(durLabel, r?.duration_seconds),
      views: typeof r?.views === 'number' && r.views > 0 ? r.views : undefined,
      publishedAt: r?.published_at ? String(r.published_at) : undefined,
      sourceLabel: 'Base ATLAS (0 cuota)',
      tags: Array.isArray(r?.tags) ? r.tags.map(String) : []
    });
  }
  return out;
}

async function searchYouAppIndexDirect(
  query: string,
  categoryTag: string | null,
  offset: number = 0,
  userRegion: UserRegionCode = 'AR'
): Promise<SearchVideoItem[]> {
  const normalized = normalizeSearchQuery(query);
  const clean = normalized.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
  const queryNorm = normText(clean);

  // Detectar si la búsqueda es directamente una categoría (ya sea por botón o escribiéndola en el buscador)
  const inferredCategoryTag =
    categoryTag ??
    (queryNorm === 'todos'
      ? 'todos'
      : queryNorm === 'peliculas completas' || queryNorm === 'pelicula completa' || queryNorm === 'peliculas'
        ? 'peliculas-completas'
        : queryNorm === 'documentales' || queryNorm === 'documental'
          ? 'documentales'
          : queryNorm === 'historia'
            ? 'historia'
            : YOUTH_CATEGORY_TAGS.has(queryNorm) ||
                queryNorm === 'musica' ||
                queryNorm === 'rock' ||
                queryNorm === 'pop' ||
                queryNorm === 'latino' ||
                queryNorm === 'jazz' ||
                queryNorm === 'clasica'
              ? queryNorm
              : null);

  const isPureCategoryBrowse =
    Boolean(inferredCategoryTag) &&
    (!queryNorm ||
      queryNorm === inferredCategoryTag ||
      (inferredCategoryTag === 'peliculas-completas' &&
        (queryNorm === 'peliculas completas' || queryNorm === 'pelicula completa' || queryNorm === 'peliculas')) ||
      (inferredCategoryTag === 'documentales' && queryNorm === 'documental') ||
      queryNorm === `musica ${inferredCategoryTag}` ||
      queryNorm === `${inferredCategoryTag} musica`);

  if (isPureCategoryBrowse && inferredCategoryTag === 'todos') {
    const selectCols =
      'video_id,title,creator_id,creator_name,tags,language,thumbnail_url,thumbnail,duration_text,duration_seconds,views,published_at,embeddable';
    const bucketOffset = Math.floor(offset / 10);
    const [notRes, rockRes, docRes, streamRes, depRes, cineRes, iaRes, histRes, ecoRes, cocRes] = await Promise.all([
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'noticias']).order('published_at', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'rock-curado']).order('views', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'documentales-curados']).order('views', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'streaming']).order('published_at', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'deportes']).order('published_at', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'cine']).order('views', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'ia-cursos']).order('views', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'historia-curada']).order('views', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'economia']).order('published_at', { ascending: false }).range(bucketOffset, bucketOffset + 24),
      supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'cocina']).order('views', { ascending: false }).range(bucketOffset, bucketOffset + 24)
    ]);

    const buckets = [
      mixNewsByUserRegion(Array.isArray(notRes.data) ? notRes.data : [], userRegion),
      Array.isArray(rockRes.data) ? rockRes.data : [],
      Array.isArray(docRes.data) ? docRes.data : [],
      Array.isArray(streamRes.data) ? streamRes.data : [],
      Array.isArray(depRes.data) ? depRes.data : [],
      Array.isArray(cineRes.data) ? cineRes.data : [],
      Array.isArray(iaRes.data) ? iaRes.data : [],
      Array.isArray(histRes.data) ? histRes.data : [],
      Array.isArray(ecoRes.data) ? ecoRes.data : [],
      Array.isArray(cocRes.data) ? cocRes.data : []
    ];

    const seenVideo = new Set<string>();
    const seenCreator = new Set<string>();
    const out: SearchVideoItem[] = [];
    const maxLen = Math.max(...buckets.map((b) => b.length), 0);

    for (let i = 0; i < maxLen && out.length < 50; i += 1) {
      for (const bucket of buckets) {
        if (out.length >= 50) break;
        const r: any = bucket[i];
        if (!r) continue;
        const videoId = String(r?.video_id || '').trim();
        const creatorKey = normText(String(r?.creator_id || r?.creator_name || videoId));
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || seenVideo.has(videoId) || seenCreator.has(creatorKey)) continue;
        seenVideo.add(videoId);
        seenCreator.add(creatorKey);
        out.push({
          videoId,
          title: String(r?.title || 'Video de YouTube'),
          channelName: String(r?.creator_name || 'YouTube'),
          channelId: r?.creator_id ? String(r.creator_id) : undefined,
          thumbnail: String(r?.thumbnail_url || r?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          duration: formatDurationLabel(r?.duration_text, r?.duration_seconds),
          durationSeconds: parseDurationToSeconds(r?.duration_text, r?.duration_seconds),
          views: typeof r?.views === 'number' && r.views > 0 ? r.views : undefined,
          publishedAt: r?.published_at ? String(r.published_at) : undefined,
          sourceLabel: 'Base ATLAS (0 cuota)',
          tags: Array.isArray(r?.tags) ? r.tags.map(String) : []
        });
      }
    }
    return out;
  }

  if (isPureCategoryBrowse && inferredCategoryTag) {
    const selectCols =
      'video_id,title,creator_id,creator_name,tags,language,thumbnail_url,thumbnail,duration_text,duration_seconds,views,published_at,embeddable';
    const isDocCategory = inferredCategoryTag === 'documentales' || inferredCategoryTag === 'historia';
    const isCuratedRock = inferredCategoryTag === 'rock';
    const isYouthCategory = YOUTH_CATEGORY_TAGS.has(inferredCategoryTag);
    const isNewsCategory = inferredCategoryTag === 'noticias';
    const activeCountry = getActiveCountryProfile();

    const matchesActiveCountry = (row: any): boolean => {
      const tags = Array.isArray(row?.tags) ? row.tags : [];
      if (tags.includes(activeCountry.tag)) return true;
      const hay = normText(`${row?.creator_name || ''} ${row?.title || ''}`);
      const kwList = [
        ...activeCountry.countryTerms,
        ...(isNewsCategory ? activeCountry.newsKeywords : []),
        ...(inferredCategoryTag === 'musica' || isCuratedRock ? activeCountry.musicKeywords : []),
        ...(inferredCategoryTag === 'deportes' ? activeCountry.sportsKeywords : [])
      ];
      return kwList.some((kw) => hay.includes(kw));
    };

    const isForeignCountryRow = (row: any): boolean => {
      const tags = Array.isArray(row?.tags) ? row.tags : [];
      const hasAnyCountry = tags.some((t: any) => typeof t === 'string' && t.startsWith('country-'));
      if (hasAnyCountry && !tags.includes(activeCountry.tag)) return true;
      return false;
    };

    const mixByActiveCountry = (rows: any[]): any[] => {
      const local: any[] = [];
      const neutral: any[] = [];
      for (const r of rows) {
        if (matchesActiveCountry(r)) local.push(r);
        else if (!isForeignCountryRow(r)) neutral.push(r);
      }
      if (local.length === 0) return neutral.length > 0 ? neutral : rows;
      // Mezcla 75 % país del usuario (3 locales) + 25 % neutral/global (1), sin mezclar noticias locales de otro país
      const mixed: any[] = [];
      let li = 0;
      let ni = 0;
      while (li < local.length || ni < neutral.length) {
        for (let k = 0; k < 3 && li < local.length; k += 1) mixed.push(local[li++]);
        if (ni < neutral.length) mixed.push(neutral[ni++]);
      }
      return mixed;
    };

    let data: any[] = [];
    if (isYouthCategory) {
      // 1. PRIORIDAD MÁXIMA: videos del país activo (`country-pe`, `country-ar`, etc.) + curados en español (`es-curado`)
      const [countryRes, curatedRes, generalRes] = await Promise.all([
        offset === 0
          ? supabase
              .from('youapp_index')
              .select(selectCols)
              .eq('provider', 'youtube')
              .contains('tags', ['atlas-pointer-compact', activeCountry.tag, inferredCategoryTag])
              .not('published_at', 'is', null)
              .order(isNewsCategory ? 'published_at' : 'views', { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] as any[], error: null }),
        supabase
          .from('youapp_index')
          .select(selectCols)
          .eq('provider', 'youtube')
          .contains('tags', ['atlas-pointer-compact', 'es-curado', inferredCategoryTag])
          .not('published_at', 'is', null)
          .order(isNewsCategory ? 'published_at' : 'views', { ascending: false })
          .range(offset, offset + 139),
        offset > 0
          ? supabase
              .from('youapp_index')
              .select(selectCols)
              .eq('provider', 'youtube')
              .contains('tags', ['atlas-pointer-compact', inferredCategoryTag])
              .not('published_at', 'is', null)
              .order(isNewsCategory ? 'published_at' : 'views', { ascending: false })
              .range(offset, offset + 119)
          : Promise.resolve({ data: [] as any[], error: null })
      ]);

      const countryRows = (Array.isArray(countryRes.data) ? countryRes.data : []).filter((r: any) =>
        passesCategoryGate(r, inferredCategoryTag)
      );
      const curatedRows = (Array.isArray(curatedRes.data) ? curatedRes.data : []).filter((r: any) =>
        passesCategoryGate(r, inferredCategoryTag)
      );
      const generalRows = (Array.isArray(generalRes.data) ? generalRes.data : []).filter((r: any) =>
        passesCategoryGate(r, inferredCategoryTag)
      );

      // Combinar priorizando el país del usuario en TODOS los botones de categoría (60 % local + 40 % regional/global)
      const combinedCurated = [...countryRows, ...curatedRows];
      const orderedCurated =
        isNewsCategory && activeCountry.code === 'AR' && countryRows.length === 0
          ? mixNewsByUserRegion(combinedCurated, userRegion)
          : mixByActiveCountry(combinedCurated);

      data = [...orderedCurated, ...generalRows];

      // Si en página 1 los curados todavía no llegan a 50 videos, completar sin perder los resultados del país activo
      if (offset === 0 && combinedCurated.length < 50) {
        const { data: extraGeneral } = await supabase
          .from('youapp_index')
          .select(selectCols)
          .eq('provider', 'youtube')
          .contains('tags', ['atlas-pointer-compact', inferredCategoryTag])
          .not('published_at', 'is', null)
          .order('published_at', { ascending: false })
          .limit(120);
        if (Array.isArray(extraGeneral)) {
          const cleanExtra = extraGeneral.filter((r: any) => passesCategoryGate(r, inferredCategoryTag));
          data = mixByActiveCountry([...orderedCurated, ...cleanExtra]);
        }
      }
    } else {
      const tagFilter =
        inferredCategoryTag === 'documentales'
          ? ['atlas-pointer-compact', 'documentales-curados']
          : inferredCategoryTag === 'historia'
            ? ['atlas-pointer-compact', 'historia-curada']
            : isCuratedRock
              ? ['atlas-pointer-compact', 'rock-curado']
              : inferredCategoryTag === 'musica'
                ? ['atlas-pointer-compact', 'musica']
                : ['atlas-pointer-compact', inferredCategoryTag];

      const [countryRes, baseRes] = await Promise.all([
        offset === 0
          ? supabase
              .from('youapp_index')
              .select(selectCols)
              .eq('provider', 'youtube')
              .contains('tags', ['atlas-pointer-compact', activeCountry.tag, inferredCategoryTag])
              .not('published_at', 'is', null)
              .order('views', { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] as any[], error: null }),
        supabase
          .from('youapp_index')
          .select(selectCols)
          .eq('provider', 'youtube')
          .contains('tags', tagFilter)
          .not('published_at', 'is', null)
          .order(isCuratedRock ? 'views' : 'published_at', { ascending: false })
          .range(offset, offset + 159)
      ]);

      const fetched = (Array.isArray(baseRes.data) ? baseRes.data : []).filter((r: any) =>
        passesCategoryGate(r, inferredCategoryTag)
      );
      const countryRows = (Array.isArray(countryRes.data) ? countryRes.data : []).filter((r: any) =>
        passesCategoryGate(r, inferredCategoryTag)
      );
      if (baseRes.error && countryRows.length === 0) return [];
      data = mixByActiveCountry([...countryRows, ...fetched]);
    }

    // En Documentales e Historia priorizamos español primero; en Rock intercalamos Rock Nacional e Internacional
    const sortedData = isDocCategory
      ? [...data].sort((a: any, b: any) => {
          const aEs = a?.language === 'es' ? 1 : 0;
          const bEs = b?.language === 'es' ? 1 : 0;
          if (aEs !== bEs) return bEs - aEs;
          const aViews = Number(a?.views || 0);
          const bViews = Number(b?.views || 0);
          if (aViews !== bViews) return bViews - aViews;
          return String(b?.published_at || '').localeCompare(String(a?.published_at || ''));
        })
      : isCuratedRock
        ? (() => {
            const arList = data.filter((r: any) => Array.isArray(r?.tags) && r.tags.includes('rock-nacional'));
            const intlList = data.filter((r: any) => !Array.isArray(r?.tags) || !r.tags.includes('rock-nacional'));
            const byViews = (a: any, b: any) => Number(b?.views || 0) - Number(a?.views || 0);
            arList.sort(byViews);
            intlList.sort(byViews);
            // Intercalar 1 clásico internacional + 1 clásico nacional para máxima riqueza en pantalla
            const mixed: any[] = [];
            const maxLen = Math.max(arList.length, intlList.length);
            for (let i = 0; i < maxLen; i += 1) {
              if (intlList[i]) mixed.push(intlList[i]);
              if (arList[i]) mixed.push(arList[i]);
            }
            return mixed;
          })()
        : data;

    const seenVideo = new Set<string>();
    const creatorCounts = new Map<string, number>();
    // En Noticias y categorías curadas permitimos hasta 3 videos por canal para llenar las 50 tarjetas con fuentes 100 % reales
    const maxPerCreator = isNewsCategory ? 3 : isYouthCategory ? 3 : isDocCategory ? 2 : 1;
    const out: SearchVideoItem[] = [];
    for (const r of sortedData) {
      const videoId = String(r?.video_id || '').trim();
      const creatorKey = normText(String(r?.creator_id || r?.creator_name || videoId));
      if (
        r?.embeddable === false ||
        isVideoMarkedUnplayable(videoId) ||
        !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
        seenVideo.has(videoId)
      ) {
        continue;
      }
      // Máximo 1 video por artista musical (o 2 por canal documental) para máxima variedad
      const used = creatorCounts.get(creatorKey) || 0;
      if (used >= maxPerCreator) continue;
      seenVideo.add(videoId);
      creatorCounts.set(creatorKey, used + 1);
      out.push({
        videoId,
        title: String(r?.title || (isDocCategory ? 'Documental' : 'Video musical')),
        channelName: String(r?.creator_name || 'YouTube'),
        channelId: r?.creator_id ? String(r.creator_id) : undefined,
        thumbnail: String(r?.thumbnail_url || r?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        duration: formatDurationLabel(r?.duration_text, r?.duration_seconds),
        durationSeconds: parseDurationToSeconds(r?.duration_text, r?.duration_seconds),
        views: typeof r?.views === 'number' && r.views > 0 ? r.views : undefined,
        publishedAt: r?.published_at ? String(r.published_at) : undefined,
        sourceLabel: 'Base ATLAS (0 cuota)',
        tags: Array.isArray(r?.tags) ? r.tags.map(String) : []
      });
      if (out.length >= 50) break;
    }
    return out;
  }

  if (!clean) return [];

  const allTokens = queryNorm.split(/\s+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const entityTokens = allTokens.filter((t) => !MODIFIER_WORDS.has(t));
  const coreTokens = entityTokens.length > 0 ? entityTokens : allTokens;

  const runQuery = async (andTokens: string[], limit: number) => {
    let req = supabase
      .from('youapp_index')
      .select('video_id,title,creator_id,creator_name,tags,thumbnail_url,thumbnail,duration_text,duration_seconds,views,published_at,embeddable')
      .eq('provider', 'youtube');

    if (categoryTag) {
      req = req.contains('tags', [categoryTag]);
    }
    // AND estricto por cada palabra clave principal (en título o en nombre del canal)
    for (const tok of andTokens.slice(0, 3)) {
      const safeTok = tok.replace(/[,%()]/g, '');
      if (safeTok.length >= 2) {
        req = req.or(`title.ilike.%${safeTok}%,creator_name.ilike.%${safeTok}%`);
      }
    }

    const { data, error } = await req.range(offset, offset + limit - 1);
    if (error || !Array.isArray(data)) return [];
    return data;
  };

  // 1. Buscar exigiendo todas las palabras clave de entidad (ej. "phil" AND "collins")
  let rows = await runQuery(coreTokens, 65);

  // 2. Si no hubo match por typo en una palabra corta (ej. "phill"), probar con la palabra más distintiva (la más larga)
  if (rows.length < 4 && coreTokens.length >= 2) {
    const longest = [...coreTokens].sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 4) {
      const extra = await runQuery([longest], 65);
      rows = [...rows, ...extra];
    }
  }

  const seen = new Set<string>();
  const scored: Array<{ item: SearchVideoItem; score: number }> = [];
  for (const r of rows) {
    const videoId = String(r?.video_id || '').trim();
    if (
      r?.embeddable === false ||
      isVideoMarkedUnplayable(videoId) ||
      !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
      seen.has(videoId)
    ) {
      continue;
    }
    seen.add(videoId);
    const title = String(r?.title || 'Video de YouTube');
    const channelName = String(r?.creator_name || 'YouTube');
    const score = scoreSemanticMatch({ title, channelName }, queryNorm);
    if (score <= 0) continue; // Descarta resultados que no coinciden semánticamente

    scored.push({
      score,
      item: {
        videoId,
        title,
        channelName,
        channelId: r?.creator_id ? String(r.creator_id) : undefined,
        thumbnail: String(r?.thumbnail_url || r?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        duration: formatDurationLabel(r?.duration_text, r?.duration_seconds),
        durationSeconds: parseDurationToSeconds(r?.duration_text, r?.duration_seconds),
        views: typeof r?.views === 'number' && r.views > 0 ? r.views : undefined,
        publishedAt: r?.published_at ? String(r.published_at) : undefined,
        sourceLabel: 'Base ATLAS (0 cuota)',
        tags: Array.isArray(r?.tags) ? r.tags.map(String) : []
      }
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 50).map((s) => s.item);
}

async function fetchMyAlgorithmFeed(
  profile: AlgorithmProfile | undefined,
  userRegion: UserRegionCode,
  recentQueries: string[],
  likedIds: string[]
): Promise<SearchVideoItem[]> {
  const weights = profile?.weights || {
    afinidad: 75,
    actualidad: 70,
    diversidad: 65,
    nuevosCreadores: 60,
    popularidad: 70
  };
  const activeCountry = getActiveCountryProfile();
  const cacheKey = `algo::${profile?.id || 'default'}::${weights.afinidad}-${weights.actualidad}-${weights.diversidad}-${weights.nuevosCreadores}-${weights.popularidad}::${activeCountry.code}::${recentQueries[0] || ''}`;
  const cached = SEARCH_RAM_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now() && cached.items.length > 0) {
    return cached.items;
  }

  const selectCols =
    'video_id,title,creator_id,creator_name,tags,language,thumbnail_url,thumbnail,duration_text,duration_seconds,views,published_at';

  const lastQuery = (recentQueries[0] || '').trim().replace(/[,%()]/g, ' ').trim();
  const affinityToken =
    lastQuery.length >= 3 && !QUICK_CATEGORIES.some((c) => normText(c.label) === normText(lastQuery))
      ? normText(lastQuery).split(/\s+/).find((t) => t.length >= 4 && !STOP_WORDS.has(t)) || ''
      : '';

  const [countryNewsRes, notRes, rockRes, docRes, streamRes, depRes, cineRes, iaRes, histRes, affRes] = await Promise.all([
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', activeCountry.tag, 'noticias']).order('published_at', { ascending: false }).limit(20),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'noticias']).order('published_at', { ascending: false }).limit(24),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'rock-curado']).order('views', { ascending: false }).limit(24),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'documentales-curados']).order('views', { ascending: false }).limit(24),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'streaming']).order('published_at', { ascending: false }).limit(20),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'deportes']).order('published_at', { ascending: false }).limit(20),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'cine']).order('views', { ascending: false }).limit(20),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'ia-cursos']).order('views', { ascending: false }).limit(20),
    supabase.from('youapp_index').select(selectCols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'historia-curada']).order('views', { ascending: false }).limit(20),
    affinityToken
      ? supabase
          .from('youapp_index')
          .select(selectCols)
          .eq('provider', 'youtube')
          .or(`title.ilike.%${affinityToken}%,creator_name.ilike.%${affinityToken}%`)
          .limit(20)
      : Promise.resolve({ data: [] as any[] })
  ]);

  const excludeForeign = (rows: any[], bucketTag?: string) =>
    rows.filter((r) => {
      if (bucketTag && !passesCategoryGate(r, bucketTag)) return false;
      const tags = Array.isArray(r?.tags) ? r.tags : [];
      const hasOtherCountry = tags.some(
        (t: any) => typeof t === 'string' && t.startsWith('country-') && t !== activeCountry.tag
      );
      return !hasOtherCountry;
    });

  const combinedNews = [
    ...(Array.isArray(countryNewsRes.data) ? countryNewsRes.data.filter((r: any) => passesCategoryGate(r, 'noticias')) : []),
    ...excludeForeign(Array.isArray(notRes.data) ? notRes.data : [], 'noticias')
  ];
  const newsMixed = mixNewsByUserRegion(combinedNews, userRegion);
  const pool: Array<{ row: any; bucket: string; isAffinity?: boolean }> = [
    ...newsMixed.map((row) => ({ row, bucket: 'noticias' })),
    ...(Array.isArray(affRes.data) ? excludeForeign(affRes.data).map((row: any) => ({ row, bucket: 'afinidad', isAffinity: true })) : []),
    ...(Array.isArray(rockRes.data) ? excludeForeign(rockRes.data, 'rock').map((row: any) => ({ row, bucket: 'rock' })) : []),
    ...(Array.isArray(docRes.data) ? excludeForeign(docRes.data, 'documentales').map((row: any) => ({ row, bucket: 'documentales' })) : []),
    ...(Array.isArray(streamRes.data) ? excludeForeign(streamRes.data, 'streaming').map((row: any) => ({ row, bucket: 'streaming' })) : []),
    ...(Array.isArray(depRes.data) ? excludeForeign(depRes.data, 'deportes').map((row: any) => ({ row, bucket: 'deportes' })) : []),
    ...(Array.isArray(cineRes.data) ? excludeForeign(cineRes.data, 'cine').map((row: any) => ({ row, bucket: 'cine' })) : []),
    ...(Array.isArray(iaRes.data) ? excludeForeign(iaRes.data, 'ia-cursos').map((row: any) => ({ row, bucket: 'ia-cursos' })) : []),
    ...(Array.isArray(histRes.data) ? excludeForeign(histRes.data, 'historia').map((row: any) => ({ row, bucket: 'historia' })) : [])
  ];

  const likedSet = new Set(likedIds);
  const nowMs = Date.now();
  const seenVid = new Set<string>();
  const scored: Array<{ row: any; bucket: string; score: number }> = [];

  for (const entry of pool) {
    const r = entry.row;
    const vid = String(r?.video_id || '').trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid) || seenVid.has(vid)) continue;
    seenVid.add(vid);

    const views = Number(r?.views || 0);
    const popNorm = views > 0 ? Math.min(1, Math.log10(views + 10) / 8) : 0.25;
    const pubMs = r?.published_at ? new Date(r.published_at).getTime() : 0;
    const ageDays = pubMs > 0 && !Number.isNaN(pubMs) ? Math.max(0, (nowMs - pubMs) / 86_400_000) : 180;
    const recencyNorm = ageDays <= 2 ? 1 : ageDays <= 14 ? 0.8 : ageDays <= 60 ? 0.5 : 0.2;
    const esBonus = r?.language === 'es' ? 14 : 0;
    const affBoost = (entry.isAffinity ? 1 : 0) + (likedSet.has(vid) ? 0.5 : 0);
    const newsBoost = entry.bucket === 'noticias' ? 0.35 : 0;

    const score =
      affBoost * (weights.afinidad || 60) * 1.15 +
      (recencyNorm + newsBoost) * (weights.actualidad || 60) +
      popNorm * (weights.popularidad || 60) +
      esBonus;

    scored.push({ row: r, bucket: entry.bucket, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Aplicar diversidad: si diversidad >= 50, rotar categorías y limitar 1 video por canal
  const enforceDiversity = (weights.diversidad || 60) >= 45;
  const bucketCounts = new Map<string, number>();
  const creatorSet = new Set<string>();
  const maxPerBucket = enforceDiversity ? 8 : 18;
  const out: SearchVideoItem[] = [];

  for (const s of scored) {
    const r = s.row;
    const vid = String(r.video_id).trim();
    const creatorKey = normText(String(r?.creator_id || r?.creator_name || vid));
    if (creatorSet.has(creatorKey)) continue;
    const bCount = bucketCounts.get(s.bucket) || 0;
    if (bCount >= maxPerBucket) continue;
    creatorSet.add(creatorKey);
    bucketCounts.set(s.bucket, bCount + 1);
    const durLabel = formatDurationLabel(r?.duration_text, r?.duration_seconds);
    out.push({
      videoId: vid,
      title: String(r?.title || 'Video de YouTube'),
      channelName: String(r?.creator_name || 'YouTube'),
      channelId: r?.creator_id ? String(r.creator_id) : undefined,
      thumbnail: String(r?.thumbnail_url || r?.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`),
      watchUrl: `https://www.youtube.com/watch?v=${vid}`,
      duration: durLabel,
      durationSeconds: parseDurationToSeconds(durLabel, r?.duration_seconds),
      views: typeof r?.views === 'number' && r.views > 0 ? r.views : undefined,
      publishedAt: r?.published_at ? String(r.published_at) : undefined,
      sourceLabel: 'Base ATLAS (0 cuota)',
      tags: Array.isArray(r?.tags) ? r.tags.map(String) : []
    });
    if (out.length >= 50) break;
  }

  if (out.length > 0) {
    SEARCH_RAM_CACHE.set(cacheKey, { items: out, hasMore: true, expires: Date.now() + SEARCH_CACHE_TTL_MS });
  }
  return out;
}

const SHORT_VERTICAL_TAGS = new Set([
  'shorts',
  'short',
  'youtube-shorts',
  'yt-shorts',
  'reels',
  'reel',
  'tiktok',
  'vertical',
  '9:16'
]);

function isShortOrVerticalVideo(item: SearchVideoItem): boolean {
  if (Array.isArray(item.tags)) {
    for (const t of item.tags) {
      if (SHORT_VERTICAL_TAGS.has(String(t).toLowerCase().trim())) return true;
    }
  }
  if (/\/shorts\//i.test(item.watchUrl || '')) return true;
  if (/(^|\s)(#shorts?|#reels?|#tiktok)\b|\((short|reel)\)|\[(short|reel)\]/i.test(item.title || '')) {
    return true;
  }
  const sec = item.durationSeconds ?? parseDurationToSeconds(item.duration);
  if (sec > 0 && sec <= 62) return true;
  return false;
}

const VERTICAL_CACHE_KEY = 'youapp_yt_vertical_map_v1';
const verticalOrientationCache = new Map<string, boolean>();

function loadVerticalCache(): Set<string> {
  const out = new Set<string>();
  if (typeof window === 'undefined') return out;
  try {
    const raw = sessionStorage.getItem(VERTICAL_CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, boolean>;
      for (const [k, v] of Object.entries(obj)) {
        verticalOrientationCache.set(k, Boolean(v));
        if (v) out.add(k);
      }
    }
  } catch {
    // ignore
  }
  return out;
}

function saveVerticalCache() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, boolean> = {};
    let count = 0;
    for (const [k, v] of verticalOrientationCache.entries()) {
      obj[k] = v;
      count += 1;
      if (count >= 400) break;
    }
    sessionStorage.setItem(VERTICAL_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

const MULTI_PROV_CACHE = new Map<string, { items: SearchVideoItem[]; expires: number }>();
const MULTI_PROV_TTL_MS = 5 * 60 * 1000;

const EXTERNAL_STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'o', 'un', 'una', 'unos', 'unas',
  'con', 'por', 'para', 'al', 'lo', 'su', 'sus', 'mi', 'mis', 'the', 'of', 'and', 'in', 'to', 'on', 'for', 'with'
]);

/**
 * Filtro semántico estricto para resultados externos (PeerTube, Archive, Odysee, Vimeo):
 * evita coincidencias flojas tipo OR (ej. "Empathic Leon" al buscar "leon gieco").
 * Exige que el título o canal contenga TODOS los términos clave (2-3 palabras) o >= 75% (4+ palabras).
 */
function matchesStrictExternalQuery(title: string, channelName: string, rawQuery: string): boolean {
  const qNorm = normText(rawQuery);
  const allTokens = qNorm.split(/\s+/).filter((t) => t.length >= 2);
  const tokens = allTokens.filter((t) => !EXTERNAL_STOPWORDS.has(t));
  const targetTokens = tokens.length > 0 ? tokens : allTokens;
  if (targetTokens.length === 0) return true;

  const hay = ` ${normText(`${title} ${channelName}`)} `;
  if (targetTokens.length === 1) {
    return hay.includes(targetTokens[0]);
  }
  const matchedCount = targetTokens.filter((t) => hay.includes(t)).length;
  if (targetTokens.length <= 3) {
    return matchedCount === targetTokens.length;
  }
  return matchedCount / targetTokens.length >= 0.75;
}

async function searchDailymotionAndVimeo(rawQuery: string, trendingMode = false): Promise<SearchVideoItem[]> {
  const clean = rawQuery.trim();
  if (!trendingMode && (!clean || normText(clean) === 'todos')) return [];

  const cacheKey = trendingMode ? '__trending__' : normText(clean);
  const cached = MULTI_PROV_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.items;
  }

  // 1. Vimeo (Supabase Edge Function `vimeo-provider`, 100% embebible HD, 0 cuota YouTube)
  const vimeoPromise = (async (): Promise<SearchVideoItem[]> => {
    try {
      const vQuery = trendingMode ? 'short film documentary cinema' : clean;
      if (vQuery.length < 2) return [];
      const sbUrl =
        ((import.meta as any)?.env?.VITE_SUPABASE_URL as string) ||
        'https://jtnurafmngaxdwlzpvxv.supabase.co';
      const sbAnon =
        ((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as string) ||
        'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3200);
      const res = await fetch(`${sbUrl}/functions/v1/vimeo-provider`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: sbAnon,
          Authorization: `Bearer ${sbAnon}`
        },
        body: JSON.stringify({
          query: vQuery,
          limit: 6,
          sort: 'relevant',
          ingest: true
        }),
        signal: controller.signal
      });
      window.clearTimeout(timer);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data?.items)) return [];
      const mapped: SearchVideoItem[] = [];
      for (const r of data.items) {
        const rawId = String(r?.providerContentId || r?.id || '').replace(/^vimeo_/, '').trim();
        if (!rawId) continue;
        const dur = Number(r?.durationSeconds || 0);
        if (dur > 0 && dur <= 62) continue;
        const thumb = String(r?.thumbnailUrl || r?.thumbnail || '');
        if (!thumb) continue;
        mapped.push({
          videoId: `vm_${rawId}`,
          title: String(r?.title || 'Video en Vimeo'),
          channelName: String(r?.creatorName || r?.channelTitle || 'Vimeo'),
          channelId: r?.creatorId ? String(r.creatorId) : undefined,
          thumbnail: thumb,
          watchUrl: String(r?.canonicalUrl || `https://vimeo.com/${rawId}`),
          duration: dur > 0 ? formatDurationLabel('', dur) : undefined,
          durationSeconds: dur > 0 ? dur : undefined,
          views: typeof r?.viewCount === 'number' && r.viewCount > 0 ? r.viewCount : undefined,
          publishedAt: r?.publishedAt ? String(r.publishedAt) : undefined,
          provider: 'vimeo',
          sourceLabel: 'Vimeo',
          tags: ['vimeo']
        });
      }
      return mapped;
    } catch {
      return [];
    }
  })();

  // 2. PeerTube (SepiaSearch API pública oficial, 100% embebible sin anuncios, nsfw=false)
  const peertubePromise = (async (): Promise<SearchVideoItem[]> => {
    try {
      const ptQuery = trendingMode ? 'documentary cinema music science' : clean;
      if (ptQuery.length < 2) return [];
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2800);
      const ptUrl = `https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(ptQuery)}&count=6&nsfw=false&hasHLSFiles=true&sort=${trendingMode ? '-views' : '-match'}`;
      const res = await fetch(ptUrl, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      const mapped: SearchVideoItem[] = [];
      for (const v of list) {
        const uuid = String(v?.uuid || '').trim();
        const rawUrl = String(v?.url || '').trim();
        const embedPath = String(v?.embedPath || '').trim();
        const thumb = String(v?.thumbnailUrl || v?.previewUrl || '').trim();
        const dur = Number(v?.duration || 0);
        if (!uuid || !rawUrl || !embedPath || !thumb) continue;
        if (dur > 0 && dur <= 62) continue;
        let origin = '';
        try {
          origin = new URL(rawUrl).origin;
        } catch {
          continue;
        }
        if (!origin.startsWith('https://')) continue;
        mapped.push({
          videoId: `pt_${uuid}`,
          title: String(v?.name || 'Video en PeerTube'),
          channelName: String(v?.channel?.displayName || v?.account?.displayName || 'PeerTube'),
          thumbnail: thumb,
          watchUrl: rawUrl,
          embedUrl: `${origin}${embedPath}?autoplay=1&title=0&warningTitle=0&p2p=0&peertubeLink=0&api=1`,
          duration: dur > 0 ? formatDurationLabel('', dur) : undefined,
          durationSeconds: dur > 0 ? dur : undefined,
          views: typeof v?.views === 'number' && v.views > 0 ? v.views : undefined,
          publishedAt: v?.publishedAt ? String(v.publishedAt) : undefined,
          provider: 'peertube',
          sourceLabel: 'PeerTube',
          tags: ['peertube']
        });
      }
      return mapped;
    } catch {
      return [];
    }
  })();

  // 3. Internet Archive (archive.org API pública oficial, cine clásico, documentales e historia, 100% embebible)
  const archivePromise = (async (): Promise<SearchVideoItem[]> => {
    try {
      const safeTerm = clean.replace(/["()\\/:]/g, ' ').trim();
      const sfwExclude =
        'AND NOT (title:(sex OR adult OR nude OR erotic OR xxx OR porn) OR subject:(adult OR erotica OR nudity))';
      const qExpr = trendingMode
        ? `mediatype:(movies) AND format:(MPEG4 OR h.264) AND (collection:(feature_films) OR collection:(classic_tv) OR collection:(documentaries)) ${sfwExclude}`
        : `mediatype:(movies) AND format:(MPEG4 OR h.264) AND (${safeTerm}) ${sfwExclude}`;
      if (!trendingMode && safeTerm.length < 2) return [];
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3500);
      const arUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(qExpr)}&fl[]=identifier,title,creator,downloads,publicdate&sort[]=downloads+desc&rows=6&output=json`;
      const res = await fetch(arUrl, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) return [];
      const data = await res.json();
      const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
      const mapped: SearchVideoItem[] = [];
      for (const doc of docs) {
        const id = String(doc?.identifier || '').trim();
        const title = Array.isArray(doc?.title) ? String(doc.title[0] || '') : String(doc?.title || '');
        if (!id || !title) continue;
        if (/\b(sex|nude|nudity|erotic|erotica|xxx|porn|adult)\b/i.test(`${id} ${title}`)) continue;
        const creator = Array.isArray(doc?.creator)
          ? String(doc.creator[0] || 'Internet Archive')
          : String(doc?.creator || 'Internet Archive');
        mapped.push({
          videoId: `ar_${id}`,
          title,
          channelName: creator,
          thumbnail: `https://archive.org/services/img/${encodeURIComponent(id)}`,
          watchUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
          embedUrl: `https://archive.org/embed/${encodeURIComponent(id)}?autoplay=1`,
          views: typeof doc?.downloads === 'number' && doc.downloads > 0 ? doc.downloads : undefined,
          publishedAt: doc?.publicdate ? String(doc.publicdate) : undefined,
          provider: 'archive',
          sourceLabel: 'Archive',
          tags: ['archive']
        });
      }
      return mapped;
    } catch {
      return [];
    }
  })();

  // Nota: Odysee, Dailymotion y Twitch se excluyen de /search:
  // - Odysee: su backend da timeouts >10s y su iframe carga un SPA pesado sin control SmartBar.
  // - Dailymotion: exige Player ID en Dailymotion Studio (sin ID devuelve HTTP 403).
  // - Twitch: solo en vivo y exige parent= exacto.
  // Quedan 4 plataformas rápidas y 100% embebidas in-app: YouTube, Vimeo, PeerTube (HLS) y Internet Archive (SFW).
  const [vmHits, ptHits, arHits] = await Promise.all([
    vimeoPromise,
    peertubePromise,
    archivePromise
  ]);
  const out: SearchVideoItem[] = [];
  const seen = new Set<string>();
  const filterStrict = (list: SearchVideoItem[]) =>
    trendingMode
      ? list
      : list.filter((it) => matchesStrictExternalQuery(it.title, it.channelName, clean));

  const cleanVm = filterStrict(vmHits);
  const cleanPt = filterStrict(ptHits);
  const cleanAr = filterStrict(arHits);
  const maxLen = Math.max(cleanVm.length, cleanPt.length, cleanAr.length);
  for (let i = 0; i < maxLen; i += 1) {
    for (const it of [cleanVm[i], cleanPt[i], cleanAr[i]]) {
      if (it && !seen.has(it.videoId) && it.thumbnail) {
        seen.add(it.videoId);
        out.push(it);
      }
    }
  }
  const finalOut = out.slice(0, 14);
  if (finalOut.length > 0) {
    MULTI_PROV_CACHE.set(cacheKey, { items: finalOut, expires: Date.now() + MULTI_PROV_TTL_MS });
  }
  return finalOut;
}

function interleaveMultiProvider(
  primary: SearchVideoItem[],
  extra: SearchVideoItem[],
  queryNorm = ''
): SearchVideoItem[] {
  if (extra.length === 0) return primary;
  if (primary.length === 0) return extra;
  // Si un resultado de Vimeo o Dailymotion coincide exactamente con lo buscado (ej. "jazz infernal"), ponerlo primero
  const exactExtra: SearchVideoItem[] = [];
  const restExtra: SearchVideoItem[] = [];
  if (queryNorm.length >= 4) {
    for (const it of extra) {
      if (normText(it.title).includes(queryNorm)) exactExtra.push(it);
      else restExtra.push(it);
    }
  } else {
    restExtra.push(...extra);
  }

  const out: SearchVideoItem[] = [...exactExtra];
  let eIdx = 0;
  for (let i = 0; i < primary.length; i += 1) {
    out.push(primary[i]);
    // Primer resultado Dailymotion/Vimeo en el 3er lugar (visible sin hacer scroll) y luego cada 4 videos
    if ((i === 1 || (i > 1 && (i - 1) % 4 === 0)) && eIdx < restExtra.length) {
      out.push(restExtra[eIdx++]);
    }
  }
  while (eIdx < restExtra.length) out.push(restExtra[eIdx++]);
  return out;
}

export default function ChannelSearch() {
  const navigate = useNavigate();
  const { savedAlgorithms, activeAlgorithmId, setActiveAlgorithmId } = useStore();
  const activeAlgo = useMemo(
    () => savedAlgorithms.find((a) => a.id === activeAlgorithmId) || savedAlgorithms[0],
    [savedAlgorithms, activeAlgorithmId]
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const catScrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const previewSentinelRef = useRef<HTMLDivElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const searchRaceRef = useRef(0);

  const [previewIsPlaying, setPreviewIsPlaying] = useState(true);
  const [previewStartSec, setPreviewStartSec] = useState(0);
  const [isPreviewFrameReady, setIsPreviewFrameReady] = useState(false);
  const [isMiniPlayerManual, setIsMiniPlayerManual] = useState(false);
  const [isScrolledPastPlayer, setIsScrolledPastPlayer] = useState(false);
  const [lockedSlotHeight, setLockedSlotHeight] = useState<number>(0);
  const [hiddenToast, setHiddenToast] = useState<{ key: string; name: string } | null>(null);
  const hiddenToastTimerRef = useRef<number | null>(null);
  const [isYou4Mode, setIsYou4Mode] = useState(false);
  const [isMomentsMosaic, setIsMomentsMosaic] = useState(false);
  const [you4AudioSlot, setYou4AudioSlot] = useState(0);
  const [previewMoments, setPreviewMoments] = useState<VideoMoment[]>([]);
  const [castNotice, setCastNotice] = useState<string | null>(null);
  const [playerVolume, setPlayerVolume] = useState(100);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [castCodeInput, setCastCodeInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [likedVideoIds, setLikedVideoIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('youapp_search_likes_v1');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [cardViewMode, setCardViewMode] = useState<'cinema' | 'capsule'>(() => {
    try {
      return localStorage.getItem('youapp_search_card_view_v1') === 'capsule' ? 'capsule' : 'cinema';
    } catch {
      return 'cinema';
    }
  });
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const hoverCardTimerRef = useRef<number | null>(null);
  const you4IframesRef = useRef<(HTMLIFrameElement | null)[]>([]);

  const handleSetCardViewMode = useCallback((mode: 'cinema' | 'capsule') => {
    setCardViewMode(mode);
    try {
      localStorage.setItem('youapp_search_card_view_v1', mode);
    } catch {
      // ignore
    }
  }, []);

  const handleCardHoverStart = useCallback((videoId: string) => {
    if (hoverCardTimerRef.current) window.clearTimeout(hoverCardTimerRef.current);
    hoverCardTimerRef.current = window.setTimeout(() => {
      setHoveredCardId(videoId);
    }, 250);
  }, []);

  const handleCardHoverEnd = useCallback(() => {
    if (hoverCardTimerRef.current) {
      window.clearTimeout(hoverCardTimerRef.current);
      hoverCardTimerRef.current = null;
    }
    setHoveredCardId(null);
  }, []);

  const handlePasteToMiTv = useCallback(
    (item: SearchVideoItem) => {
      navigate(`/mitv?add=${encodeURIComponent(item.watchUrl)}`);
    },
    [navigate]
  );

  const [previewVideo, setPreviewVideo] = useState<SearchVideoItem | null>(null);
  useLandscapeAutoFullscreen(Boolean(previewVideo), setIsFullscreen);

  const sendYtCommand = useCallback(
    (func: string, args: unknown[] = []) => {
      const win = previewIframeRef.current?.contentWindow;
      if (!win) return;
      const prov = previewVideo?.provider || 'youtube';
      try {
        if (prov === 'vimeo') {
          if (func === 'playVideo') win.postMessage(JSON.stringify({ method: 'play' }), '*');
          else if (func === 'pauseVideo') win.postMessage(JSON.stringify({ method: 'pause' }), '*');
          else if (func === 'mute') win.postMessage(JSON.stringify({ method: 'setVolume', value: 0 }), '*');
          else if (func === 'unMute') win.postMessage(JSON.stringify({ method: 'setVolume', value: 1 }), '*');
          else if (func === 'seekTo' && typeof args[0] === 'number') {
            win.postMessage(JSON.stringify({ method: 'setCurrentTime', value: args[0] }), '*');
          }
          return;
        }
        if (prov === 'peertube') {
          const id = Date.now() % 1000000;
          if (func === 'playVideo') win.postMessage({ type: 'peertube', method: 'play', id }, '*');
          else if (func === 'pauseVideo') win.postMessage({ type: 'peertube', method: 'pause', id }, '*');
          else if (func === 'mute') win.postMessage({ type: 'peertube', method: 'setVolume', params: [0], id }, '*');
          else if (func === 'unMute') win.postMessage({ type: 'peertube', method: 'setVolume', params: [1], id }, '*');
          else if (func === 'seekTo' && typeof args[0] === 'number') {
            win.postMessage({ type: 'peertube', method: 'seek', params: [args[0]], id }, '*');
          }
          return;
        }
        win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      } catch {
        // ignore cross-origin postMessage errors
      }
    },
    [previewVideo?.provider]
  );

  const scrollCategories = (dir: 'left' | 'right') => {
    const el = catScrollRef.current;
    if (!el) return;
    const amount = Math.max(240, Math.round(el.clientWidth * 0.65));
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const playVideoInline = useCallback((item: SearchVideoItem) => {
    setIsScrolledPastPlayer(false);
    setPreviewVideo(item);
    setPreviewIsPlaying(true);
    // En celular el reproductor queda fijo arriba pegado a la barra superior, sin moverte de la lista
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    window.setTimeout(() => {
      if (previewSentinelRef.current) {
        const y = previewSentinelRef.current.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 60);
  }, []);

  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('todos');
  const [showDrop, setShowDrop] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);

  const [results, setResults] = useState<SearchVideoItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [sortMode, setSortMode] = useState<'relevance' | 'views' | 'recent'>('relevance');
  const [isAlgoPanelOpen, setIsAlgoPanelOpen] = useState(false);
  const [socialGraph, setSocialGraph] = useState<YouAppSocialGraph>(() => loadSocialGraph());
  const [previewVideoMeta, setPreviewVideoMeta] = useState<VideoPublicMeta | null>(null);
  const [detectedVerticalIds, setDetectedVerticalIds] = useState<Set<string>>(() => loadVerticalCache());

  // Detector oEmbed real (0 cuota) para atrapar Shorts verticales sin tag ni duración (solo YouTube)
  useEffect(() => {
    const toCheck = results
      .filter(
        (it) =>
          (!it.provider || it.provider === 'youtube') &&
          !isShortOrVerticalVideo(it) &&
          !verticalOrientationCache.has(it.videoId)
      )
      .slice(0, 28);
    if (toCheck.length === 0) return;

    let cancelled = false;
    Promise.all(
      toCheck.map(async (it) => {
        try {
          const res = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${it.videoId}`)}&format=json`
          );
          if (!res.ok) return null;
          const data = await res.json();
          const w = Number(data?.width || 0);
          const h = Number(data?.height || 0);
          const isVert = w > 0 && h > 0 && h > w;
          verticalOrientationCache.set(it.videoId, isVert);
          return isVert ? it.videoId : null;
        } catch {
          return null;
        }
      })
    )
      .then((found) => {
        if (cancelled) return;
        saveVerticalCache();
        const newlyVertical = found.filter((id): id is string => Boolean(id));
        if (newlyVertical.length > 0) {
          setDetectedVerticalIds((prev) => {
            const next = new Set(prev);
            for (const id of newlyVertical) next.add(id);
            return next;
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [results]);

  useEffect(() => {
    const onSocialChange = () => setSocialGraph(loadSocialGraph());
    window.addEventListener(SOCIAL_GRAPH_CHANGED_EVENT, onSocialChange);
    return () => window.removeEventListener(SOCIAL_GRAPH_CHANGED_EVENT, onSocialChange);
  }, []);

  useEffect(() => {
    const vid = previewVideo?.videoId;
    if (!vid) {
      setPreviewVideoMeta(null);
      return;
    }
    let cancelled = false;
    setPreviewVideoMeta(null);
    fetchYouTubeVideoMeta(vid)
      .then((meta) => {
        if (!cancelled) setPreviewVideoMeta(meta);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previewVideo?.videoId]);
  const [durationFilter, setDurationFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [activeChannelFilter, setActiveChannelFilter] = useState<{ name: string; channelId?: string } | null>(null);
  const [pageOffset, setPageOffset] = useState<number>(0);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isAlgoFeed, setIsAlgoFeed] = useState(true);
  const [userRegion] = useState<UserRegionCode>(() => detectUserRegion());

  const loadMyAlgorithmFeed = useCallback(
    async (algoOverride?: AlgorithmProfile) => {
      const targetAlgo = algoOverride || activeAlgo;
      const raceId = ++searchRaceRef.current;
      setIsAlgoFeed(true);
      setActiveCategory('todos');
      setActiveChannelFilter(null);
      setCommitted(`Mi Algoritmo · ${targetAlgo?.name || 'Personalizado'}`);
      setStatus('loading');
      try {
        // Dispara Vimeo/PeerTube/Archive en segundo plano SIN bloquear el primer pintado (~200 ms)
        const multiTrendingPromise = searchDailymotionAndVimeo('', true).catch(() => []);
        const items = await fetchMyAlgorithmFeed(targetAlgo, userRegion, getHist(), likedVideoIds);
        if (searchRaceRef.current !== raceId) return;
        setResults(items.slice(0, 56));
        setHasMore(true);
        setPageOffset(50);
        setStatus('done');

        // Hidratación progresiva en segundo plano (sin demorar la pantalla)
        void multiTrendingPromise.then((extra) => {
          if (searchRaceRef.current !== raceId || extra.length === 0) return;
          setResults((prev) => interleaveMultiProvider(prev, extra).slice(0, 56));
        });
      } finally {
        if (searchRaceRef.current === raceId) setStatus('done');
      }
    },
    [activeAlgo, userRegion, likedVideoIds]
  );

  // Al entrar a /search, llenar automáticamente con «Mi Algoritmo» (0 espacio vacío, ~225 ms)
  // Si viene un video compartido (?v=...), abrirlo y reproducirlo directamente en /search
  useEffect(() => {
    void loadMyAlgorithmFeed();
    try {
      const sp = new URLSearchParams(window.location.search);
      const sharedVid = (sp.get('v') || '').trim();
      if (sharedVid) {
        const prov = (sp.get('p') || 'youtube').trim() as SearchVideoItem['provider'];
        const title = (sp.get('title') || 'Video compartido en YOUAPP').trim();
        const ch = (sp.get('ch') || 'YOUAPP TV').trim();
        const embed = (sp.get('embed') || '').trim() || undefined;
        const watch =
          (sp.get('u') || '').trim() ||
          (prov === 'vimeo'
            ? `https://vimeo.com/${sharedVid.replace(/^vm_/, '')}`
            : prov === 'archive'
              ? `https://archive.org/details/${sharedVid.replace(/^ar_/, '')}`
              : `https://www.youtube.com/watch?v=${sharedVid}`);
        const thumb =
          prov === 'youtube' || !prov
            ? `https://i.ytimg.com/vi/${sharedVid}/hqdefault.jpg`
            : prov === 'archive'
              ? `https://archive.org/services/img/${sharedVid.replace(/^ar_/, '')}`
              : '';
        setPreviewVideo({
          videoId: sharedVid,
          title,
          channelName: ch,
          thumbnail: thumb,
          watchUrl: watch,
          embedUrl: embed,
          provider: prov || 'youtube',
          sourceLabel:
            prov === 'vimeo'
              ? 'Vimeo'
              : prov === 'peertube'
                ? 'PeerTube'
                : prov === 'archive'
                  ? 'Archive'
                  : prov === 'odysee'
                    ? 'Odysee'
                    : 'YouTube'
        });
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlgorithmId]);

  // Autocompletar en vivo
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setHints([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const suggestions = await fetchYouTubeAutocomplete(query).catch(() => []);
      if (!active) return;
      setHints(suggestions.slice(0, 7));
    }, 140);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const doSearch = useCallback(
    async (rawQuery: string, categoryOverride?: string) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) return;
      const catId = categoryOverride ?? activeCategory;
      const catObj = QUICK_CATEGORIES.find((c) => c.id === catId);
      const categoryTag = catObj?.tag ?? null;

      setCommitted(trimmed);
      setIsAlgoFeed(false);
      setActiveChannelFilter(null);
      setResults([]);
      setPageOffset(0);
      setHasMore(false);
      setStatus('loading');
      setShowDrop(false);
      if (normText(trimmed) !== 'todos') {
        saveHist(trimmed);
      }
      inputRef.current?.blur();

      const raceId = ++searchRaceRef.current;

      try {
        const normalizedQ = normalizeSearchQuery(trimmed);
        const queryNorm = normText(normalizedQ);
        const activeCountry = getActiveCountryProfile();
        const cacheKey = `${catId}::${queryNorm}::${activeCountry.code}`;
        const cachedEntry = SEARCH_RAM_CACHE.get(cacheKey);
        if (cachedEntry && cachedEntry.expires > Date.now() && cachedEntry.items.length > 0) {
          setResults(cachedEntry.items);
          setHasMore(cachedEntry.hasMore);
          setPageOffset(50);
          setStatus('done');
          return;
        }

        // Coincidencias semánticas en memoria local aprendida (0 ms)
        const learnedLocalHits = readLearnedPointers()
          .map((it) => ({ it, score: scoreSemanticMatch(it, queryNorm) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
          .map((x) => x.it);

        // 1. Búsqueda instantánea semántica 0-cuota en base nube `youapp_index` + catálogo local
        //    Vimeo/PeerTube/Archive corren en paralelo SIN bloquear el primer pintado (< 200 ms)
        let resolvedMultiProv: SearchVideoItem[] = [];
        const multiProvPromise = searchDailymotionAndVimeo(normalizedQ)
          .then((extra) => {
            resolvedMultiProv = extra;
            if (searchRaceRef.current === raceId && extra.length > 0) {
              setResults((prev) => {
                const next = interleaveMultiProvider(prev, extra, queryNorm).slice(0, 56);
                if (next.length > 0) {
                  SEARCH_RAM_CACHE.set(cacheKey, {
                    items: next,
                    hasMore: next.length >= 16,
                    expires: Date.now() + SEARCH_CACHE_TTL_MS
                  });
                }
                return next;
              });
              setStatus('done');
            }
            return extra;
          })
          .catch(() => [] as SearchVideoItem[]);

        const [indexHits, localMusicHits] = await Promise.all([
          searchYouAppIndexDirect(normalizedQ, categoryTag, 0, userRegion).catch(() => []),
          Promise.resolve(searchLocalAtlasMusic(normalizedQ, categoryTag))
        ]);

        if (searchRaceRef.current !== raceId) return;

        const isPureCategoryBrowse =
          Boolean(categoryTag) &&
          (queryNorm === categoryTag || queryNorm === 'musica' || queryNorm === `musica ${categoryTag}`);

        const mergedMap = new Map<string, SearchVideoItem>();
        // Para Rock, Documentales e Historia priorizamos siempre la selección curada de `youapp_index` primero.
        // En otros géneros musicales, priorizamos artistas en tendencia + lanzamientos de la nube.
        const preferCloudCurated =
          (catId === 'todos' && queryNorm === 'todos') ||
          (categoryTag !== null && YOUTH_CATEGORY_TAGS.has(categoryTag)) ||
          YOUTH_CATEGORY_TAGS.has(queryNorm) ||
          categoryTag === 'rock' ||
          categoryTag === 'documentales' ||
          categoryTag === 'historia' ||
          queryNorm === 'rock' ||
          queryNorm === 'documentales' ||
          queryNorm === 'documental' ||
          queryNorm === 'historia';

        const orderedIncoming =
          isPureCategoryBrowse && !preferCloudCurated
            ? [...localMusicHits, ...indexHits]
            : [...indexHits, ...learnedLocalHits, ...localMusicHits];

        for (const item of orderedIncoming) {
          if (!mergedMap.has(item.videoId)) mergedMap.set(item.videoId, item);
        }

        // Mostrar resultados instantáneos de la base ATLAS (~150-250 ms) + multi-plataforma si ya llegó
        let mergedList = interleaveMultiProvider(
          Array.from(mergedMap.values()),
          resolvedMultiProv,
          queryNorm
        ).slice(0, 50);
        if (mergedList.length > 0) {
          setResults(mergedList);
          setStatus('done');
        }

        // 2. Respaldo automático en YouTube:
        //    - En botones de categoría (ej. Streaming, Comedia, Cocina, Podcasts...) si faltan videos del país activo,
        //      busca `<categoría> <país>` a 0 cuota, los pone arriba (60 % país + 40 % global) y los aprende en `youapp_index`.
        //    - En búsquedas libres, si la base tuvo menos de 24 coincidencias, completa en vivo.
        const countryMatchCount = mergedList.filter((it) => {
          if (it.tags?.includes(activeCountry.tag)) return true;
          const hay = normText(`${it.channelName} ${it.title}`);
          return activeCountry.countryTerms.some((kw) => hay.includes(kw));
        }).length;

        const needsCountryCategoryEnrich =
          isPureCategoryBrowse && Boolean(categoryTag) && categoryTag !== 'todos' && countryMatchCount < 10;

        if (needsCountryCategoryEnrich) {
          const ytCountryQuery = `${normalizedQ} ${activeCountry.name}`;
          const ytCountryBatch = await searchYouTubeVideos(ytCountryQuery, 28).catch(() => []);
          if (searchRaceRef.current !== raceId) return;
          const countryAdded: SearchVideoItem[] = [];
          const seenLocal = new Set<string>();
          for (const v of ytCountryBatch) {
            if (!v?.videoId || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId)) continue;
            if (seenLocal.has(v.videoId)) continue;
            seenLocal.add(v.videoId);
            const vAny = v as any;
            const rawDur = vAny.durationText ?? vAny.duration;
            const durLabel = formatDurationLabel(rawDur, vAny.durationSeconds);
            countryAdded.push({
              videoId: v.videoId,
              title: v.title,
              channelName: vAny.channelTitle || vAny.channelName || 'YouTube',
              channelId: vAny.channelId || undefined,
              thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
              watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
              duration: durLabel,
              durationSeconds: parseDurationToSeconds(durLabel, vAny.durationSeconds),
              views: vAny.viewsText ?? vAny.views ?? vAny.viewCount ?? undefined,
              publishedAt: vAny.publishedAt ?? vAny.publishedTimeText ?? undefined,
              sourceLabel: `${activeCountry.flag} ${activeCountry.name}`,
              tags: [activeCountry.tag, ...(categoryTag ? [categoryTag] : [])]
            });
          }
          if (countryAdded.length > 0) {
            // Intercalar 60 % país elegido (3 locales) + 40 % base global (2)
            const baseOther = mergedList.filter((it) => !seenLocal.has(it.videoId));
            const mixedCountry: SearchVideoItem[] = [];
            let ci = 0;
            let bi = 0;
            while ((ci < countryAdded.length || bi < baseOther.length) && mixedCountry.length < 50) {
              for (let k = 0; k < 3 && ci < countryAdded.length && mixedCountry.length < 50; k += 1) {
                mixedCountry.push(countryAdded[ci++]);
              }
              for (let k = 0; k < 2 && bi < baseOther.length && mixedCountry.length < 50; k += 1) {
                mixedCountry.push(baseOther[bi++]);
              }
            }
            mergedList = mixedCountry;
            setResults(mergedList);
            setStatus('done');
            void absorbYouTubePointersToAtlas(countryAdded, categoryTag, [activeCountry.tag]);
          }
        } else if (!isPureCategoryBrowse && mergedList.length < 24) {
          const ytQuery = categoryTag && !normText(normalizedQ).includes(categoryTag)
            ? `${normalizedQ} ${categoryTag}`
            : normalizedQ;

          const mapYtBatch = (batch: any[]): SearchVideoItem[] => {
            const added: SearchVideoItem[] = [];
            for (const v of batch) {
              if (!v?.videoId || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId)) continue;
              if (mergedMap.has(v.videoId)) continue;
              const vAny = v as any;
              const rawDur = vAny.durationText ?? vAny.duration;
              const durLabel = formatDurationLabel(rawDur, vAny.durationSeconds);
              const newItem: SearchVideoItem = {
                videoId: v.videoId,
                title: v.title,
                channelName: vAny.channelTitle || vAny.channelName || 'YouTube',
                channelId: vAny.channelId || undefined,
                thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
                duration: durLabel,
                durationSeconds: parseDurationToSeconds(durLabel, vAny.durationSeconds),
                views: vAny.viewsText ?? vAny.views ?? vAny.viewCount ?? undefined,
                publishedAt: vAny.publishedAt ?? vAny.publishedTimeText ?? undefined,
                sourceLabel: 'YouTube'
              };
              mergedMap.set(v.videoId, newItem);
              added.push(newItem);
            }
            return added;
          };

          const primaryPromise = searchYouTubeVideos(ytQuery, 40).catch(() => []);
          const alt1Promise = searchYouTubeVideos(`${ytQuery} oficial`, 25).catch(() => []);
          const alt2Promise = searchYouTubeVideos(`${ytQuery} en vivo`, 25).catch(() => []);

          // Fase A: mostrar inmediatamente los primeros resultados sin esperar a las variantes
          const ytPrimary = await primaryPromise;
          if (searchRaceRef.current !== raceId) return;
          const addedPrimary = mapYtBatch(ytPrimary);
          mergedList = interleaveMultiProvider(
            Array.from(mergedMap.values()),
            resolvedMultiProv,
            queryNorm
          ).slice(0, 50);
          if (mergedList.length > 0) {
            setResults(mergedList);
            setHasMore(mergedList.length >= 16);
            setStatus('done');
          }
          if (addedPrimary.length > 0) {
            void absorbYouTubePointersToAtlas(addedPrimary, categoryTag);
          }

          // Fase B: completar silenciosamente hasta ~45-50 resultados en segundo plano
          const [ytAlt1, ytAlt2] = await Promise.all([alt1Promise, alt2Promise]);
          if (searchRaceRef.current !== raceId) return;
          const addedAlts = mapYtBatch([...ytAlt1, ...ytAlt2]);
          if (addedAlts.length > 0) {
            mergedList = interleaveMultiProvider(
              Array.from(mergedMap.values()),
              resolvedMultiProv,
              queryNorm
            ).slice(0, 50);
            void absorbYouTubePointersToAtlas(addedAlts, categoryTag);
          }
        }

        if (searchRaceRef.current !== raceId) return;
        // Si ATLAS + YouTube no devolvieron nada (ej. búsqueda exclusiva de Vimeo/PeerTube/Archive), esperar su promesa
        if (mergedList.length === 0) {
          const waitedExtra = await multiProvPromise;
          if (searchRaceRef.current !== raceId) return;
          if (waitedExtra.length > 0) {
            mergedList = interleaveMultiProvider([], waitedExtra, queryNorm).slice(0, 50);
          }
        }
        const canLoadMore = mergedList.length >= 16;
        setResults(mergedList);
        setHasMore(canLoadMore);
        setPageOffset(50);
        if (mergedList.length > 0) {
          SEARCH_RAM_CACHE.set(cacheKey, {
            items: mergedList,
            hasMore: canLoadMore,
            expires: Date.now() + SEARCH_CACHE_TTL_MS
          });
        }
      } finally {
        if (searchRaceRef.current === raceId) {
          setStatus('done');
        }
      }
    },
    [activeCategory, userRegion]
  );

  const openChannelVideos = useCallback(async (channelName: string, channelId?: string) => {
    const cleanName = channelName.split('·')[0].trim();
    if (!cleanName) return;
    const raceId = ++searchRaceRef.current;
    setActiveChannelFilter({ name: cleanName, channelId });
    setIsAlgoFeed(false);
    setCommitted(cleanName);
    setStatus('loading');
    setPageOffset(0);
    setHasMore(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      let channelHits = await searchChannelVideosDirect(cleanName, channelId, 0).catch(() => []);
      if (searchRaceRef.current !== raceId) return;

      if (channelHits.length < 10) {
        const ytFallback = await searchYouTubeVideos(cleanName, 40).catch(() => []);
        if (searchRaceRef.current !== raceId) return;
        const seen = new Set(channelHits.map((x) => x.videoId));
        const newlyLearned: SearchVideoItem[] = [];
        for (const v of ytFallback) {
          if (!v?.videoId || seen.has(v.videoId)) continue;
          const vAny = v as any;
          const durLabel = formatDurationLabel(vAny.durationText ?? vAny.duration, vAny.durationSeconds);
          seen.add(v.videoId);
          const item: SearchVideoItem = {
            videoId: v.videoId,
            title: v.title,
            channelName: vAny.channelTitle || cleanName,
            channelId: vAny.channelId || channelId,
            thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
            duration: durLabel,
            durationSeconds: parseDurationToSeconds(durLabel, vAny.durationSeconds),
            views: vAny.viewsText ?? vAny.views ?? undefined,
            publishedAt: vAny.publishedAt ?? undefined,
            sourceLabel: 'YouTube'
          };
          channelHits.push(item);
          newlyLearned.push(item);
        }
        if (newlyLearned.length > 0) {
          void absorbYouTubePointersToAtlas(newlyLearned, null);
        }
      }

      setResults(channelHits.slice(0, 50));
      setHasMore(channelHits.length >= 30);
      setPageOffset(50);
    } finally {
      if (searchRaceRef.current === raceId) setStatus('done');
    }
  }, []);

  const loadMoreResults = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const catObj = QUICK_CATEGORIES.find((c) => c.id === activeCategory);
      const categoryTag = catObj?.tag ?? null;
      let nextBatch = activeChannelFilter
        ? await searchChannelVideosDirect(activeChannelFilter.name, activeChannelFilter.channelId, pageOffset)
        : await searchYouAppIndexDirect(committed || 'Todos', categoryTag, pageOffset, userRegion);

      // Si no hubo más filas en la nube y es una búsqueda libre, ampliar con variantes de YouTube (0 cuota)
      if (nextBatch.length === 0 && committed && normText(committed) !== 'todos') {
        const suffixes = ['exitos', 'completo', 'recital', 'entrevista', 'hd'];
        const suffix = suffixes[Math.floor((pageOffset - 50) / 50) % suffixes.length];
        const ytExtra = await searchYouTubeVideos(`${committed} ${suffix}`, 30).catch(() => []);
        nextBatch = ytExtra
          .filter((v) => v?.videoId && /^[A-Za-z0-9_-]{11}$/.test(v.videoId))
          .map((v) => {
            const vAny = v as any;
            const durLabel = formatDurationLabel(vAny.durationText ?? vAny.duration, vAny.durationSeconds);
            return {
              videoId: v.videoId,
              title: v.title,
              channelName: vAny.channelTitle || vAny.channelName || 'YouTube',
              channelId: vAny.channelId || undefined,
              thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
              watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
              duration: durLabel,
              durationSeconds: parseDurationToSeconds(durLabel, vAny.durationSeconds),
              views: vAny.viewsText ?? vAny.views ?? undefined,
              publishedAt: vAny.publishedAt ?? undefined,
              sourceLabel: 'YouTube' as const
            };
          });
        if (nextBatch.length > 0) {
          void absorbYouTubePointersToAtlas(nextBatch, categoryTag);
        }
      }

      if (nextBatch.length === 0) {
        setHasMore(false);
        return;
      }

      setResults((prev) => {
        const seen = new Set(prev.map((x) => x.videoId));
        const fresh = nextBatch.filter((x) => !seen.has(x.videoId));
        if (fresh.length === 0) {
          setHasMore(false);
          return prev;
        }
        return [...prev, ...fresh];
      });
      setPageOffset((prev) => prev + 50);
      if (nextBatch.length < 15) setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, activeCategory, activeChannelFilter, committed, pageOffset, userRegion]);

  const filteredResults = useMemo(() => {
    // Excluir videos Shorts / verticales y canales ocultados por el usuario
    let list = results.filter(
      (item) =>
        !isShortOrVerticalVideo(item) &&
        !detectedVerticalIds.has(item.videoId) &&
        !isChannelHiddenInGraph(socialGraph, item.channelName, item.channelId)
    );
    if (durationFilter !== 'all') {
      list = list.filter((item) => {
        const sec = item.durationSeconds ?? parseDurationToSeconds(item.duration);
        if (sec <= 0) return false;
        if (durationFilter === 'short') return sec < 240;
        if (durationFilter === 'medium') return sec >= 240 && sec <= 1200;
        if (durationFilter === 'long') return sec > 1200;
        return true;
      });
    }
    if (sortMode === 'views') {
      return [...list].sort((a, b) => parseViewsToNumber(b.views) - parseViewsToNumber(a.views));
    }
    if (sortMode === 'recent') {
      return [...list].sort((a, b) => {
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
      });
    }
    return list;
  }, [results, durationFilter, sortMode, detectedVerticalIds, socialGraph]);

  // Sincroniza el video activo con el Mini-reproductor Global para que te acompañe al ir a /lecturas u otras secciones
  useEffect(() => {
    setIsPreviewFrameReady(false);
    setPreviewStartSec(0);
    if (!previewVideo) return;
    setGlobalMiniVideo({
      videoId: previewVideo.videoId,
      title: previewVideo.title,
      channelName: previewVideo.channelName,
      provider: previewVideo.provider || 'youtube',
      embedUrl: previewVideo.embedUrl,
      watchUrl: previewVideo.watchUrl,
      originPath: '/search'
    });
  }, [previewVideo]);

  // Mini-reproductor flotante con histéresis (banda muerta de 120px) + altura bloqueada: CERO titileo
  useEffect(() => {
    if (!previewVideo) {
      setIsScrolledPastPlayer(false);
      setIsMiniPlayerManual(false);
      setLockedSlotHeight(0);
      return;
    }

    const measureCard = () => {
      const card = previewRef.current;
      if (card && !card.classList.contains('is-mini-floating') && !card.classList.contains('is-expanded')) {
        const h = Math.round(card.getBoundingClientRect().height);
        if (h > 140) setLockedSlotHeight(h);
      }
    };

    const rafInit = window.requestAnimationFrame(measureCard);
    const appScroller = document.querySelector('.app-layout');
    let ticking = false;

    const checkScroll = () => {
      ticking = false;
      // En celular (<= 768px) usamos experiencia YouTube: el reproductor queda fijo (sticky) arriba mientras scrolleás la lista abajo
      if (window.innerWidth <= 768) {
        setIsScrolledPastPlayer(false);
        return;
      }
      const slot = previewSentinelRef.current;
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      setIsScrolledPastPlayer((wasFloating) => {
        if (!wasFloating) {
          // Solo pasa a flotante cuando TODO el reproductor quedó arriba fuera de pantalla
          if (rect.bottom < 40) {
            measureCard();
            return true;
          }
          return false;
        }
        // Solo vuelve a normal cuando subís claramente hasta ver el bloque (120px de histéresis)
        return rect.bottom < 160;
      });
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(checkScroll);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    appScroller?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measureCard, { passive: true });
    return () => {
      window.cancelAnimationFrame(rafInit);
      window.removeEventListener('scroll', onScroll);
      appScroller?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measureCard);
    };
  }, [previewVideo]);

  const handleHideChannel = useCallback(
    (item: SearchVideoItem) => {
      const channelLabel = item.channelName || 'Este canal';
      setSocialGraph((prev) => {
        const { graph, key } = hideChannelInGraph(prev, item.channelName, item.channelId);
        if (key) {
          setHiddenToast({ key, name: channelLabel });
          if (hiddenToastTimerRef.current) window.clearTimeout(hiddenToastTimerRef.current);
          hiddenToastTimerRef.current = window.setTimeout(() => setHiddenToast(null), 5000);
        }
        return graph;
      });
      if (
        previewVideo &&
        ((item.channelId && previewVideo.channelId === item.channelId) ||
          previewVideo.channelName.trim().toLowerCase() === item.channelName.trim().toLowerCase())
      ) {
        setPreviewVideo(null);
      }
    },
    [previewVideo]
  );

  const isFloatingMini =
    Boolean(previewVideo) &&
    (isMiniPlayerManual || isScrolledPastPlayer) &&
    !isFullscreen &&
    !isYou4Mode &&
    !isMomentsMosaic;

  // Picture-in-Picture REAL del sistema:
  // 1) En APK Android nativo (Capacitor): llama a window.YouAppAndroidPiP.enterPiP() para flotar encima de Infobae/WhatsApp.
  // 2) En Chrome/Edge PC: usa Document PiP vía /pip-frame (flota encima de otras pestañas y programas).
  // 3) En navegador web móvil: activa el mini-reproductor flotante dentro de YOUAPP (ej. /lecturas).
  const handleToggleMiniOrSystemPiP = useCallback(async () => {
    if (!previewVideo) return;
    setIsYou4Mode(false);
    setIsMomentsMosaic(false);

    const androidPiP = (window as any).YouAppAndroidPiP;
    if (androidPiP && typeof androidPiP.enterPiP === 'function') {
      try {
        androidPiP.enterPiP();
        return;
      } catch {
        // fallback
      }
    }

    const docPiP = (window as any).documentPictureInPicture;
    if (docPiP && typeof docPiP.requestWindow === 'function') {
      try {
        if (docPiP.window && !docPiP.window.closed) {
          docPiP.window.close();
          return;
        }
        const pipParams = new URLSearchParams({
          provider: previewVideo.provider || 'youtube',
          id: previewVideo.videoId
        });
        if (previewVideo.embedUrl) pipParams.set('embed', previewVideo.embedUrl);
        // Usar nuestro propio origen HTTPS (/pip-frame) para enviar Referer válido a YouTube (evita Error 153 en about:blank)
        const pipFrameUrl = `${window.location.origin}/pip-frame?${pipParams.toString()}`;

        const pipWin: Window = await docPiP.requestWindow({ width: 420, height: 245 });
        pipWin.document.title = `${previewVideo.title} · YOUAPP`;
        pipWin.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;width:100vw;height:100vh;';
        const ifr = pipWin.document.createElement('iframe');
        ifr.src = pipFrameUrl;
        ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        ifr.allowFullscreen = true;
        ifr.style.cssText = 'border:0;width:100%;height:100%;display:block;';
        pipWin.document.body.appendChild(ifr);
        setCastNotice('Ventana flotante activa: podés cambiar de pestaña o abrir Infobae y sigue visible.');
        window.setTimeout(() => setCastNotice(null), 4000);
        return;
      } catch {
        // fallback a mini-reproductor in-app
      }
    }

    setIsMiniPlayerManual((v) => !v);
    setCastNotice('En celular el mini-reproductor flota dentro de YOUAPP (ej. abrí Infobae en Lecturas). Para apps externas usá Pantalla Dividida de Android.');
    window.setTimeout(() => setCastNotice(null), 5000);
  }, [previewVideo]);

  const handleSharePreviewVideo = useCallback(async () => {
    if (!previewVideo) return;
    const sp = new URLSearchParams();
    sp.set('v', previewVideo.videoId);
    if (previewVideo.provider && previewVideo.provider !== 'youtube') {
      sp.set('p', previewVideo.provider);
    }
    if (previewVideo.title) sp.set('title', previewVideo.title.slice(0, 110));
    if (previewVideo.channelName) sp.set('ch', previewVideo.channelName.slice(0, 60));
    if (previewVideo.embedUrl) sp.set('embed', previewVideo.embedUrl);
    else if (previewVideo.provider && previewVideo.provider !== 'youtube' && previewVideo.watchUrl) {
      sp.set('u', previewVideo.watchUrl);
    }
    const shareUrl = `https://youapptv.com/search?${sp.toString()}`;
    await shareContentUniversal({
      title: `${previewVideo.title} · YOUAPP TV`,
      text: 'YOUAPP TV',
      url: shareUrl,
      thumbnailUrl: previewVideo.thumbnail,
      subtitle: previewVideo.channelName,
      badge: 'YOUAPP TV'
    });
  }, [previewVideo]);

  const hiddenShortsCount = useMemo(
    () =>
      results.filter(
        (item) => isShortOrVerticalVideo(item) || detectedVerticalIds.has(item.videoId)
      ).length,
    [results, detectedVerticalIds]
  );

  const startVoiceSearch = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) {
        setQuery(text);
        void doSearch(text);
      }
    };
    recognition.start();
  };

  const handlePasteToMiSenal = (item: SearchVideoItem) => {
    navigate(`/misenal1?add=${encodeURIComponent(item.watchUrl)}&t=${encodeURIComponent(item.title)}`);
  };

  const handlePasteToYouMusic = (item: SearchVideoItem) => {
    navigate(`/youmusic?add=${encodeURIComponent(item.watchUrl)}&t=${encodeURIComponent(item.title)}`);
  };

  // Sincronizar el video activo con usePlayerStore (con providerContentId + momentos reales + progreso en vivo)
  useEffect(() => {
    if (!previewVideo) return;
    let active = true;
    const initialDur = previewVideo.durationSeconds || parseDurationToSeconds(previewVideo.duration) || 300;

    usePlayerStore.getState().setPlaybackContext({
      currentBlock: {
        blockId: `search-${previewVideo.videoId}`,
        id: previewVideo.videoId,
        provider: 'youtube',
        providerContentId: previewVideo.videoId,
        providerId: previewVideo.videoId,
        title: previewVideo.title,
        channelTitle: previewVideo.channelName,
        thumbnailUrl: previewVideo.thumbnail,
        durationSec: initialDur,
        url: previewVideo.watchUrl
      } as any,
      creator: previewVideo.channelName,
      signalName: 'YOUAPP Buscar',
      isLive: false,
      isPlaying: true,
      isMuted: false,
      playbackState: 'playing',
      currentTime: 0,
      duration: initialDur,
      playerApi: {
        play: async () => {
          sendYtCommand('playVideo');
          setPreviewIsPlaying(true);
          usePlayerStore.getState().setIsPlaying(true);
        },
        pause: async () => {
          sendYtCommand('pauseVideo');
          setPreviewIsPlaying(false);
          usePlayerStore.getState().setIsPlaying(false);
        },
        seek: async (sec: number) => {
          sendYtCommand('seekTo', [Math.max(0, sec), true]);
          usePlayerStore.getState().setProgress(Math.max(0, sec), usePlayerStore.getState().duration || initialDur);
        },
        mute: async () => {
          sendYtCommand('mute');
          usePlayerStore.getState().setIsMuted(true, true);
        },
        unmute: async () => {
          sendYtCommand('unMute');
          usePlayerStore.getState().setIsMuted(false, true);
        },
        getDuration: () => usePlayerStore.getState().duration || initialDur
      }
    });

    // Cargar momentos reales / capítulos del video para la SmartBar
    setPreviewMoments([]);
    void getMomentsForVideo({
      id: previewVideo.videoId,
      provider: 'youtube',
      providerId: previewVideo.videoId,
      title: previewVideo.title,
      channelTitle: previewVideo.channelName,
      channelId: previewVideo.channelId || previewVideo.videoId,
      thumbnailUrl: previewVideo.thumbnail,
      durationSec: initialDur,
      isLive: false
    } as any)
      .then((res: any) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : Array.isArray(res?.moments) ? res.moments : [];
        if (list.length > 0) setPreviewMoments(list);
      })
      .catch(() => {});

    // Escuchar progreso real (currentTime / duration) de YouTube y Vimeo
    let lastRealTickAt = 0;
    const onYtMsg = (ev: MessageEvent) => {
      if (!previewIframeRef.current || ev.source !== previewIframeRef.current.contentWindow) return;
      try {
        const payload = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        // Vimeo Player API events (playProgress / timeupdate / getCurrentTime / getDuration / play / pause / ready)
        if (previewVideo.provider === 'vimeo') {
          if (payload?.event === 'ready') {
            const w = previewIframeRef.current?.contentWindow;
            w?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'playProgress' }), '*');
            w?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*');
            w?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'play' }), '*');
            w?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'pause' }), '*');
            w?.postMessage(JSON.stringify({ method: 'getDuration' }), '*');
          } else if (
            (payload?.event === 'playProgress' || payload?.event === 'timeupdate') &&
            payload?.data
          ) {
            const sec = typeof payload.data.seconds === 'number' ? payload.data.seconds : null;
            const dur = typeof payload.data.duration === 'number' && payload.data.duration > 0 ? payload.data.duration : null;
            if (sec !== null || dur !== null) {
              lastRealTickAt = Date.now();
              const st = usePlayerStore.getState();
              st.setProgress(sec ?? st.currentTime, dur ?? st.duration);
            }
          } else if (payload?.method === 'getCurrentTime' && typeof payload?.value === 'number') {
            lastRealTickAt = Date.now();
            const st = usePlayerStore.getState();
            st.setProgress(payload.value, st.duration || initialDur);
          } else if (payload?.method === 'getDuration' && typeof payload?.value === 'number' && payload.value > 0) {
            const st = usePlayerStore.getState();
            st.setProgress(st.currentTime, payload.value);
          } else if (payload?.event === 'play') {
            setPreviewIsPlaying(true);
            usePlayerStore.getState().setIsPlaying(true);
          } else if (payload?.event === 'pause') {
            setPreviewIsPlaying(false);
            usePlayerStore.getState().setIsPlaying(false);
          }
          return;
        }
        if (payload?.event === 'infoDelivery' && payload?.info) {
          const ct = typeof payload.info.currentTime === 'number' ? payload.info.currentTime : null;
          const dur = typeof payload.info.duration === 'number' && payload.info.duration > 0 ? payload.info.duration : null;
          if (ct !== null || dur !== null) {
            lastRealTickAt = Date.now();
            const st = usePlayerStore.getState();
            st.setProgress(ct ?? st.currentTime, dur ?? st.duration);
          }
          if (typeof payload.info.playerState === 'number') {
            const playing = payload.info.playerState === 1;
            if (playing) resetAutoSkip('ChannelSearch');
            setPreviewIsPlaying(playing);
            usePlayerStore.getState().setIsPlaying(playing);
          }
        } else if (payload?.event === 'onError' && isUnplayableYouTubeError(payload?.info)) {
          const failedId = previewVideo.videoId;
          void reportUnplayableYouTubeVideo(failedId, payload.info, 'ChannelSearch');
          setCastNotice('Video no disponible para insertar · pasando al siguiente…');
          window.setTimeout(() => setCastNotice(null), 3200);
          setResults((prev) => {
            const idx = prev.findIndex((it) => it.videoId === failedId);
            const cleaned = prev.filter((it) => it.videoId !== failedId);
            if (canAutoSkip('ChannelSearch') && cleaned.length > 0) {
              const nextItem = cleaned[idx >= 0 && idx < cleaned.length ? idx : 0];
              window.setTimeout(() => setPreviewVideo(nextItem), 120);
            }
            return cleaned;
          });
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener('message', onYtMsg);

    const pingTimer = window.setInterval(() => {
      try {
        const w = previewIframeRef.current?.contentWindow;
        if (w) {
          if (previewVideo.provider === 'vimeo') {
            w.postMessage(JSON.stringify({ method: 'getCurrentTime' }), '*');
            w.postMessage(JSON.stringify({ method: 'getDuration' }), '*');
          } else if (!previewVideo.provider || previewVideo.provider === 'youtube') {
            w.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
          }
        }
        // Reloj suave de respaldo (1s): solo corre si el iframe no emitió ningún tick real en los últimos 2s
        const st = usePlayerStore.getState();
        if (st.isPlaying && Date.now() - lastRealTickAt > 2000) {
          const dur = st.duration > 0 ? st.duration : initialDur;
          if (dur > 0) {
            st.setProgress(Math.min(dur, st.currentTime + 1), dur);
          }
        }
      } catch {
        // ignore
      }
    }, 1000);

    return () => {
      active = false;
      window.removeEventListener('message', onYtMsg);
      window.clearInterval(pingTimer);
    };
  }, [previewVideo, sendYtCommand]);

  const you4Videos = useMemo(() => {
    if (!previewVideo) return [];
    const idx = filteredResults.findIndex((r) => r.videoId === previewVideo.videoId);
    const pool = idx >= 0
      ? [...filteredResults.slice(idx), ...filteredResults.slice(0, idx)]
      : [previewVideo, ...filteredResults.filter((r) => r.videoId !== previewVideo.videoId)];
    return pool.slice(0, 4);
  }, [previewVideo, filteredResults]);

  const handleCastVideo = useCallback(async () => {
    if (!previewVideo) return;
    const shareUrl = `https://www.youtube.com/watch?v=${previewVideo.videoId}`;
    const winAny = window as any;
    if (winAny.PresentationRequest) {
      try {
        const req = new winAny.PresentationRequest([shareUrl]);
        await req.start();
        setCastNotice('Transmitiendo a tu TV…');
        window.setTimeout(() => setCastNotice(null), 3500);
        return;
      } catch {
        // fallback below if user cancelled or no local receiver found
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore clipboard errors
    }
    setCastNotice('Usá el botón Transmitir de Chrome (⋮ → Enviar) para mandar este reproductor a tu Smart TV · Enlace copiado');
    window.setTimeout(() => setCastNotice(null), 5000);
  }, [previewVideo]);

  const handleVolumeChange = useCallback(
    (nextVol: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(nextVol)));
      setPlayerVolume(clamped);
      if (clamped === 0) {
        setIsPreviewMuted(true);
        sendYtCommand('mute');
        usePlayerStore.getState().setIsMuted(true, true);
      } else {
        setIsPreviewMuted(false);
        sendYtCommand('unMute');
        sendYtCommand('setVolume', [clamped]);
        usePlayerStore.getState().setIsMuted(false, true);
      }
    },
    [sendYtCommand]
  );

  const handleTogglePreviewMute = useCallback(() => {
    if (isPreviewMuted || playerVolume === 0) {
      const target = playerVolume === 0 ? 80 : playerVolume;
      setIsPreviewMuted(false);
      setPlayerVolume(target);
      sendYtCommand('unMute');
      sendYtCommand('setVolume', [target]);
      usePlayerStore.getState().setIsMuted(false, true);
    } else {
      setIsPreviewMuted(true);
      sendYtCommand('mute');
      usePlayerStore.getState().setIsMuted(true, true);
    }
  }, [isPreviewMuted, playerVolume, sendYtCommand]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('mitv-is-fullscreen', next);
        const el = previewRef.current as
          | (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void })
          | null;
        const doc = document as Document & {
          webkitFullscreenElement?: Element | null;
          webkitExitFullscreen?: () => Promise<void> | void;
        };
        try {
          if (next && el && !document.fullscreenElement && !doc.webkitFullscreenElement) {
            if (el.requestFullscreen) {
              void el.requestFullscreen().catch(() => {});
            } else if (el.webkitRequestFullscreen) {
              void el.webkitRequestFullscreen();
            }
          } else if (!next && (document.fullscreenElement || doc.webkitFullscreenElement)) {
            if (document.exitFullscreen) {
              void document.exitFullscreen().catch(() => {});
            } else if (doc.webkitExitFullscreen) {
              void doc.webkitExitFullscreen();
            }
          }
        } catch {
          // fallback CSS 100vw x 100dvh
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('mitv-is-fullscreen');
      }
    };
  }, []);

  const handleToggleLike = useCallback((videoId: string) => {
    setLikedVideoIds((prev) => {
      const next = prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId];
      try {
        localStorage.setItem('youapp_search_likes_v1', JSON.stringify(next.slice(-200)));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const handleSelectYou4Audio = useCallback((slotIdx: number) => {
    setYou4AudioSlot(slotIdx);
    you4IframesRef.current.forEach((iframe, i) => {
      try {
        iframe?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: i === slotIdx ? 'unMute' : 'mute', args: [] }),
          '*'
        );
      } catch {
        // ignore
      }
    });
  }, []);

  const handleTogglePreviewPlay = useCallback(() => {
    if (previewIsPlaying) {
      sendYtCommand('pauseVideo');
      setPreviewIsPlaying(false);
      usePlayerStore.getState().setIsPlaying(false);
    } else {
      sendYtCommand('playVideo');
      setPreviewIsPlaying(true);
      usePlayerStore.getState().setIsPlaying(true);
    }
  }, [previewIsPlaying, sendYtCommand]);

  const handlePreviewSeek = useCallback(
    (sec: number) => {
      const targetSec = Math.max(0, sec);
      sendYtCommand('seekTo', [targetSec, true]);
      const st = usePlayerStore.getState();
      const dur = st.duration > 0 ? st.duration : (previewVideo?.durationSeconds || 300);
      st.setProgress(Math.min(dur, targetSec), dur);
    },
    [sendYtCommand, previewVideo?.durationSeconds]
  );

  const handlePreviewStep = useCallback(
    (delta: 1 | -1) => {
      if (!previewVideo || filteredResults.length < 2) return;
      const idx = filteredResults.findIndex((r) => r.videoId === previewVideo.videoId);
      if (idx < 0) return;
      const nextIdx = (idx + delta + filteredResults.length) % filteredResults.length;
      playVideoInline(filteredResults[nextIdx]);
    },
    [previewVideo, filteredResults, playVideoInline]
  );

  const ambientThumb = previewVideo?.thumbnail || results[0]?.thumbnail || '';

  return (
    <div
      className={`ys-page ${
        previewVideo && !isFullscreen && !isYou4Mode && !isMomentsMosaic ? 'ys-has-mobile-player' : ''
      }`}
    >
      <div
        className="ys-ambient-bg"
        aria-hidden="true"
        style={ambientThumb ? { backgroundImage: `url(${ambientThumb})` } : undefined}
      />
      <div className="ys-ambient-veil" aria-hidden="true" />

      {/* BARRA SUPERIOR UNIFICADA EN MAYÚSCULAS */}
      <header className="ys-topbar">
        <div className="ys-topbar-left">
          <button type="button" className="ys-logo-btn" onClick={() => navigate('/')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="ys-brand-pill">BUSCAR</span>
        </div>

        <nav className="ys-nav">
          <button type="button" className="ys-nav-btn" onClick={() => navigate('/misenal1')}>MI SEÑAL</button>
          <button type="button" className="ys-nav-btn" onClick={() => navigate('/mitv')}>MITV</button>
          <button type="button" className="ys-nav-btn" onClick={() => navigate('/youmusic')}>YOU MUSIC</button>
          <button type="button" className="ys-nav-btn" onClick={() => navigate('/reels')}>REELS</button>
          <button type="button" className="ys-nav-btn" onClick={() => navigate('/lecturas')}>LECTURAS</button>
          <button type="button" className="ys-nav-btn" onClick={() => navigate('/my-lists')}>MIS LISTAS</button>
        </nav>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <CountrySelectorPill
            onChange={() => {
              SEARCH_RAM_CACHE.clear();
              if (isAlgoFeed && !activeChannelFilter) {
                void loadMyAlgorithmFeed(activeAlgo);
              } else if (committed.trim()) {
                void doSearch(committed, activeCategory);
              }
            }}
          />
          <TvUserSessionMenu variant="glass" />
        </div>
      </header>

      <main className="ys-main">
        {/* BUSCADOR CENTRAL */}
        <section className="ys-hero-search">
          <div className="ys-search-wrap">
            <div className="ys-search-bar">
              <Search size={19} className="ys-search-ico" />
              <input
                ref={inputRef}
                className="ys-search-input"
                type="text"
                placeholder="Buscá videos, bandas, películas, documentales o canciones…"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  setShowDrop(val.trim().length > 0);
                }}
                onFocus={() => {
                  if (query.trim().length > 0) setShowDrop(true);
                }}
                onBlur={() => window.setTimeout(() => setShowDrop(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setActiveCategory('todos');
                    void doSearch(query, 'todos');
                  }
                  if (e.key === 'Escape') setShowDrop(false);
                }}
              />
              {query && (
                <button
                  type="button"
                  className="ys-icon-circle"
                  onClick={() => {
                    setQuery('');
                    setActiveChannelFilter(null);
                    setActiveCategory('todos');
                    setHints([]);
                    inputRef.current?.focus();
                  }}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={15} />
                </button>
              )}
              <button
                type="button"
                className={`ys-icon-circle ${isListening ? 'listening' : ''}`}
                onClick={startVoiceSearch}
                title="Buscar por voz"
                aria-label="Buscar por voz"
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                type="button"
                className="ys-search-submit"
                onClick={() => {
                  setActiveCategory('todos');
                  void doSearch(query, 'todos');
                }}
                disabled={status === 'loading'}
              >
                Buscar
              </button>
            </div>

            {showDrop && query.trim().length > 0 && hints.length > 0 && (
              <div className="ys-dropdown">
                {hints.map((h, i) => (
                  <button
                    key={`hint-${i}`}
                    type="button"
                    className="ys-drop-item"
                    onMouseDown={() => {
                      setQuery(h);
                      setActiveCategory('todos');
                      void doSearch(h, 'todos');
                    }}
                  >
                    <Search size={14} />
                    <span>{h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CARRUSEL DE CATEGORÍAS CON FLECHAS */}
          <div className="ys-cat-carousel">
            <button
              type="button"
              className="ys-cat-arrow"
              onClick={() => scrollCategories('left')}
              title="Desplazar categorías a la izquierda"
              aria-label="Categorías anteriores"
            >
              <ChevronLeft size={18} />
            </button>

            <div ref={catScrollRef} className="ys-cat-row" role="tablist" aria-label="Filtrar resultados">
              {QUICK_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === cat.id}
                  className={`ys-cat-chip ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    if (cat.id === 'todos') {
                      setQuery('');
                      void loadMyAlgorithmFeed();
                    } else {
                      setQuery(cat.label);
                      void doSearch(cat.label, cat.id);
                    }
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="ys-cat-arrow"
              onClick={() => scrollCategories('right')}
              title="Desplazar categorías a la derecha"
              aria-label="Siguientes categorías"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* DESPLEGABLE FINO "ALGORITMO" JUSTO ABAJO DEL CARRUSEL */}
          <div className={`ys-algo-accordion ${isAlgoPanelOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="ys-algo-toggle"
              onClick={() => setIsAlgoPanelOpen((v) => !v)}
              aria-expanded={isAlgoPanelOpen}
            >
              <span className="ys-algo-toggle-left">
                <Sparkles size={13} color="#64d2ff" />
                <strong>Algoritmo</strong>
                <span className="ys-algo-toggle-meta">
                  {isAlgoFeed && activeAlgo ? activeAlgo.name : committed}
                  {filteredResults.length > 0 ? ` · ${filteredResults.length}` : ''}
                </span>
              </span>
              <span className="ys-algo-toggle-right">
                {hiddenShortsCount > 0 && (
                  <span
                    role="link"
                    tabIndex={0}
                    className="ys-reels-redirect-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/reels');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate('/reels');
                      }
                    }}
                    title="Los Shorts verticales se muestran en Reels"
                  >
                    <Film size={11} /> Reels ({hiddenShortsCount})
                  </span>
                )}
                <span>{isAlgoPanelOpen ? 'Ocultar' : 'Abrir'}</span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: isAlgoPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.18s ease'
                  }}
                />
              </span>
            </button>

            {isAlgoPanelOpen && (
              <div className="ys-algo-drawer">
                {/* FILA SUPERIOR: Perfiles (si aplica) + Ajustar */}
                <div className="ys-algo-top-row" role="region" aria-label="Ajustar Mi Algoritmo">
                  <div className="ys-algo-profiles">
                    {isAlgoFeed && !activeChannelFilter && savedAlgorithms.map((algo) => (
                      <button
                        key={algo.id}
                        type="button"
                        className={`ys-algo-pill ${activeAlgo?.id === algo.id ? 'active' : ''}`}
                        onClick={() => {
                          setActiveAlgorithmId(algo.id);
                          void loadMyAlgorithmFeed(algo);
                        }}
                        title={algo.description}
                      >
                        {algo.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ys-algo-edit-btn"
                    onClick={() => navigate('/my-algorithm')}
                    title="Ajustar pesos y reglas de Mi Algoritmo"
                  >
                    <Settings2 size={13} /> Ajustar
                  </button>
                </div>

                {/* LAS 3 BARRAS ORDENADAS (1 barra limpia por fila) */}
                {results.length > 0 && (
                  <div className="ys-algo-3bars" aria-label="Ordenar y filtrar resultados">
                    <div className="ys-algo-bar-row">
                      <SlidersHorizontal size={12} className="ys-filter-ico" />
                      {(
                        [
                          { id: 'relevance', label: 'Relevancia' },
                          { id: 'views', label: 'Más vistos' },
                          { id: 'recent', label: 'Más recientes' }
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`ys-filter-pill ${sortMode === opt.id ? 'active' : ''}`}
                          onClick={() => setSortMode(opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="ys-algo-bar-row">
                      {(
                        [
                          { id: 'all', label: 'Todas' },
                          { id: 'short', label: '< 4 min' },
                          { id: 'medium', label: '4–20 min' },
                          { id: 'long', label: '+20 min' }
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`ys-filter-pill ${durationFilter === opt.id ? 'active' : ''}`}
                          onClick={() => setDurationFilter(opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="ys-algo-bar-row" aria-label="Estilo de tarjetas">
                      <button
                        type="button"
                        className={`ys-filter-pill ${cardViewMode === 'cinema' ? 'active' : ''}`}
                        onClick={() => handleSetCardViewMode('cinema')}
                        title="Vista Grilla Cine (portadas limpias)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <LayoutGrid size={12} /> Cine
                      </button>
                      <button
                        type="button"
                        className={`ys-filter-pill ${cardViewMode === 'capsule' ? 'active' : ''}`}
                        onClick={() => handleSetCardViewMode('capsule')}
                        title="Vista Cápsula Editorial (compacta estilo Mi Señal)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <List size={12} /> Cápsula
                      </button>
                      {(socialGraph.hiddenChannelKeys?.length || 0) > 0 && (
                        <button
                          type="button"
                          className="ys-filter-pill"
                          onClick={() => setSocialGraph((prev) => clearHiddenChannelsInGraph(prev))}
                          title="Volver a mostrar todos los canales que ocultaste"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#ff9f0a' }}
                        >
                          <RotateCcw size={11} /> Restaurar {socialGraph.hiddenChannelKeys?.length} ocultos
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* REPRODUCTOR ARRIBA (IDÉNTICO A MITV: 1 PANTALLA / MOMENTOS 4x / YOU4 + MINI-REPRODUCTOR FLOTANTE SIN TITILEO) */}
        {previewVideo && (
          <div
            ref={previewSentinelRef}
            className="ys-preview-slot"
            style={
              isFloatingMini && lockedSlotHeight > 0
                ? { minHeight: `${lockedSlotHeight}px` }
                : undefined
            }
          >
            <section
              ref={previewRef}
              className={`ys-preview-card ${isFullscreen ? 'is-expanded' : ''} ${isFloatingMini ? 'is-mini-floating' : ''}`}
              aria-label="Reproductor fijado arriba"
            >
              {isFloatingMini && (
                <div className="ys-mini-overlay-bar">
                  <span className="ys-mini-title" title={previewVideo.title}>
                    {previewVideo.title}
                  </span>
                  <div className="ys-mini-actions">
                    <button
                      type="button"
                      className="ys-mini-btn"
                      onClick={() => {
                        setIsMiniPlayerManual(false);
                        setIsScrolledPastPlayer(false);
                        previewSentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      title="Expandir reproductor"
                      aria-label="Expandir reproductor"
                    >
                      <Maximize2 size={12} />
                    </button>
                    <button
                      type="button"
                      className="ys-mini-btn"
                      onClick={() => {
                        setIsMiniPlayerManual(false);
                        setIsScrolledPastPlayer(false);
                        setIsYou4Mode(false);
                        setIsMomentsMosaic(false);
                        setPreviewVideo(null);
                        setGlobalMiniVideo(null);
                      }}
                      title="Cerrar mini-reproductor"
                      aria-label="Cerrar mini-reproductor"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}
            {isMomentsMosaic ? (
              (() => {
                const dur = Math.max(
                  60,
                  usePlayerStore.getState().duration ||
                    previewVideo.durationSeconds ||
                    parseDurationToSeconds(previewVideo.duration) ||
                    300
                );
                const labels = ['Inicio clave', 'Desarrollo', 'Punto central', 'Cierre'];
                const ratios = [0.1, 0.35, 0.62, 0.85];
                const quadMoments =
                  previewMoments.length >= 4
                    ? previewMoments.slice(0, 4)
                    : ratios.map((ratio, idx) => ({
                        id: `search-m-${idx}-${previewVideo.videoId}`,
                        contentKey: previewVideo.videoId,
                        startSec: Math.floor(dur * ratio),
                        title: labels[idx],
                        summary: labels[idx],
                        type: 'key_point' as const,
                        confidence: 0.85,
                        source: 'fallback' as const
                      }));
                const mosaicBlock: ScheduleBlock = {
                  id: previewVideo.videoId,
                  position: 0,
                  startOffsetSec: 0,
                  durationSec: dur,
                  topic: previewVideo.title,
                  role: 'explainer',
                  contentItem: {
                    id: previewVideo.videoId,
                    providerId: previewVideo.videoId,
                    type: 'video',
                    provider: 'youtube',
                    title: previewVideo.title,
                    videoUrl: previewVideo.watchUrl,
                    thumbnailUrl: previewVideo.thumbnail,
                    channelName: previewVideo.channelName,
                    channelTitle: previewVideo.channelName
                  } as any
                };
                const isNonYoutube = Boolean(previewVideo.provider && previewVideo.provider !== 'youtube');
                if (isNonYoutube) {
                  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
                  const jumpToMoment = (sec: number) => {
                    setPreviewStartSec(sec);
                    setIsMomentsMosaic(false);
                    const st = usePlayerStore.getState();
                    st.setProgress(sec, st.duration || dur);
                  };
                  return (
                    <div className="ys-you4-grid">
                      {quadMoments.map((m) => {
                        const momentIframeSrc =
                          previewVideo.provider === 'vimeo'
                            ? `https://player.vimeo.com/video/${encodeURIComponent(previewVideo.videoId.replace(/^vm_/, ''))}?autoplay=1&muted=1&dnt=1#t=${m.startSec}s`
                            : previewVideo.provider === 'peertube' && previewVideo.embedUrl
                              ? `${previewVideo.embedUrl}&muted=1&start=${m.startSec}`
                              : previewVideo.provider === 'archive'
                                ? `${previewVideo.embedUrl || `https://archive.org/embed/${encodeURIComponent(previewVideo.videoId.replace(/^ar_/, ''))}?autoplay=1`}&start=${m.startSec}`
                                : null;
                        return (
                          <div
                            key={m.id}
                            className="ys-you4-cell"
                            style={{ cursor: 'pointer' }}
                            onClick={() => jumpToMoment(m.startSec)}
                          >
                            {momentIframeSrc ? (
                              <iframe
                                src={momentIframeSrc}
                                title={m.title}
                                allow="autoplay; fullscreen; picture-in-picture"
                                style={{ pointerEvents: 'none' }}
                              />
                            ) : (
                              <img
                                src={previewVideo.thumbnail}
                                alt={m.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.72 }}
                              />
                            )}
                            <button
                              type="button"
                              className="ys-you4-audio-pill"
                              onClick={(e) => {
                                e.stopPropagation();
                                jumpToMoment(m.startSec);
                              }}
                            >
                              <span>{m.title} · {fmtSec(m.startSec)}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <div className="ys-preview-video-wrap">
                    <MosaicPlayerGrid
                      moments={quadMoments}
                      currentBlock={mosaicBlock}
                      thumbnailFallbackUrl={previewVideo.thumbnail}
                      isPlaying={previewIsPlaying}
                      onSelect={(m) => {
                        setIsMomentsMosaic(false);
                        window.setTimeout(() => handlePreviewSeek(m.startSec), 450);
                      }}
                    />
                  </div>
                );
              })()
            ) : isYou4Mode && you4Videos.length > 1 ? (
              <div className="ys-you4-grid">
                {you4Videos.map((vid, idx) => {
                  const isMutedCell = idx !== you4AudioSlot;
                  const cellSrc =
                    vid.provider === 'vimeo'
                      ? `https://player.vimeo.com/video/${encodeURIComponent(vid.videoId.replace(/^vm_/, ''))}?autoplay=1&muted=${isMutedCell ? 1 : 0}&dnt=1&api=1`
                      : vid.provider === 'peertube' && vid.embedUrl
                        ? `${vid.embedUrl}${isMutedCell ? '&muted=1' : ''}`
                        : vid.provider === 'odysee' && vid.embedUrl
                          ? vid.embedUrl
                          : vid.provider === 'archive'
                            ? vid.embedUrl || `https://archive.org/embed/${encodeURIComponent(vid.videoId.replace(/^ar_/, ''))}?autoplay=1`
                            : `https://www.youtube.com/embed/${vid.videoId}?autoplay=1&mute=${isMutedCell ? 1 : 0}&rel=0&modestbranding=1&enablejsapi=1`;
                  return (
                    <div
                      key={vid.videoId}
                      className={`ys-you4-cell ${you4AudioSlot === idx ? 'active-audio' : ''}`}
                    >
                      <iframe
                        ref={(el) => {
                          you4IframesRef.current[idx] = el;
                        }}
                        src={cellSrc}
                        title={vid.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                      <button
                        type="button"
                        className="ys-you4-audio-pill"
                        onClick={() => handleSelectYou4Audio(idx)}
                        title={you4AudioSlot === idx ? 'Audio activo en esta pantalla' : 'Activar audio aquí'}
                      >
                        {you4AudioSlot === idx ? <Volume2 size={12} /> : <VolumeX size={12} />}
                        <span>{vid.channelName.slice(0, 18)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ys-preview-video-wrap">
                {!isPreviewFrameReady && previewVideo.thumbnail && (
                  <div className="ys-preview-loading-poster" aria-hidden="true">
                    <img src={previewVideo.thumbnail} alt="" />
                    <div className="ys-preview-loading-pill">
                      <Loader2 size={14} className="ys-spin" />
                      <span>Cargando {previewVideo.sourceLabel || 'video'}…</span>
                    </div>
                  </div>
                )}
                {previewVideo.provider === 'dailymotion' ? (
                  <DailymotionOfficialPlayer
                    key={previewVideo.videoId}
                    videoIdOrUrl={previewVideo.watchUrl || previewVideo.videoId.replace(/^dm_/, '')}
                    thumbnailUrl={previewVideo.thumbnail}
                    title={previewVideo.title}
                  />
                ) : previewVideo.provider === 'vimeo' ? (
                  <iframe
                    ref={previewIframeRef}
                    key={`${previewVideo.videoId}-${previewStartSec}`}
                    src={`https://player.vimeo.com/video/${encodeURIComponent(previewVideo.videoId.replace(/^vm_/, ''))}?autoplay=1&dnt=1&api=1${previewStartSec > 0 ? `#t=${previewStartSec}s` : ''}`}
                    title={previewVideo.title}
                    onLoad={() => {
                      setIsPreviewFrameReady(true);
                      const w = previewIframeRef.current?.contentWindow;
                      w?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*');
                      w?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'playProgress' }), '*');
                      w?.postMessage(JSON.stringify({ method: 'getDuration' }), '*');
                    }}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : previewVideo.provider === 'peertube' && previewVideo.embedUrl ? (
                  <iframe
                    ref={previewIframeRef}
                    key={`${previewVideo.videoId}-${previewStartSec}`}
                    src={`${previewVideo.embedUrl}${previewStartSec > 0 ? `&start=${previewStartSec}` : ''}`}
                    title={previewVideo.title}
                    onLoad={() => setIsPreviewFrameReady(true)}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : previewVideo.provider === 'archive' ? (
                  <iframe
                    ref={previewIframeRef}
                    key={`${previewVideo.videoId}-${previewStartSec}`}
                    src={`${
                      previewVideo.embedUrl ||
                      `https://archive.org/embed/${encodeURIComponent(previewVideo.videoId.replace(/^ar_/, ''))}?autoplay=1`
                    }${previewStartSec > 0 ? `&start=${previewStartSec}` : ''}`}
                    title={previewVideo.title}
                    frameBorder="0"
                    referrerPolicy="no-referrer"
                    onLoad={() => setIsPreviewFrameReady(true)}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                  />
                ) : (previewVideo.provider === 'odysee' || previewVideo.provider === 'twitch') && previewVideo.embedUrl ? (
                  <iframe
                    ref={previewIframeRef}
                    key={`${previewVideo.videoId}-${previewStartSec}`}
                    src={`${previewVideo.embedUrl}${previewStartSec > 0 && previewVideo.provider === 'odysee' ? `?t=${previewStartSec}` : ''}`}
                    title={previewVideo.title}
                    onLoad={() => setIsPreviewFrameReady(true)}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <iframe
                    ref={previewIframeRef}
                    key={previewVideo.videoId}
                    src={`https://www.youtube.com/embed/${previewVideo.videoId}?autoplay=1&controls=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://youapptv.com')}`}
                    title={previewVideo.title}
                    onLoad={() => {
                      setIsPreviewFrameReady(true);
                      previewIframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'listening', id: 1 }),
                        '*'
                      );
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
            )}

            {isFullscreen && (
              <button
                type="button"
                className="ys-fs-exit-btn"
                onClick={() => void handleToggleFullscreen()}
                title="Salir de pantalla completa"
                aria-label="Salir de pantalla completa"
              >
                <Minimize2 size={15} />
                <span>Salir</span>
              </button>
            )}

            {castNotice && <div className="ys-cast-toast">{castNotice}</div>}

            {/* ENCABEZADO + SMARTBAR DESPLEGABLES CON BOTÓN BLANCO + PUNTO ROJO ATLAS */}
            <PlayerControlsDrawer
              quickSaveItem={{
                id: previewVideo.videoId,
                videoId: previewVideo.videoId,
                title: previewVideo.title,
                author: previewVideo.channelName,
                thumbnailUrl: previewVideo.thumbnail,
                sourceUrl: previewVideo.watchUrl,
                provider: previewVideo.provider || 'youtube'
              }}
            >
            <div className="ys-preview-bar ys-preview-bar--mitv">
              <div className="ys-preview-top-meta">
                <span className="ys-preview-live-pill">EN PANTALLA</span>
                {(() => {
                  const likeKey = `youtube:${previewVideo.videoId}`;
                  const followKey = previewVideo.channelId
                    ? `ch:${previewVideo.channelId}`
                    : `ch:${previewVideo.channelName}`;
                  const isLiked = socialGraph.likedVideoKeys.includes(likeKey);
                  const likeCount = Number(socialGraph.likeCounts?.[likeKey] ?? (isLiked ? 1 : 0));
                  const isFollowed = socialGraph.followedSignalIds.includes(followKey);
                  const ytSubUrl = buildYouTubeSubscribeUrl({
                    channelId: previewVideo.channelId,
                    sourceUrl: previewVideo.watchUrl
                  });
                  return (
                    <div className="ys-top-social-row">
                      <div className="ys-top-social-icons">
                        <button
                          type="button"
                          className={`ys-top-icon-btn ${likeCount > 0 ? 'has-count' : ''} ${isLiked ? 'is-liked' : ''}`}
                          onClick={() => {
                            handleToggleLike(previewVideo.videoId);
                            setSocialGraph((prev) => {
                              const res = toggleLikeVideoWithMeta(prev, {
                                key: likeKey,
                                title: previewVideo.title,
                                author: previewVideo.channelName,
                                thumbnailUrl: previewVideo.thumbnail,
                                sourceUrl: previewVideo.watchUrl
                              });
                              setCastNotice(
                                res.active
                                  ? `❤️ Me gusta (${res.count}) guardado en Mis Listas.`
                                  : 'Me gusta quitado.'
                              );
                              window.setTimeout(() => setCastNotice(null), 2600);
                              return res.graph;
                            });
                          }}
                          title={isLiked ? `Te gusta (${likeCount})` : 'Me gusta en YOUAPP'}
                          aria-label="Me gusta"
                          aria-pressed={isLiked}
                        >
                          <Heart size={14} fill={isLiked ? '#ff375f' : 'none'} strokeWidth={2.1} />
                          {likeCount > 0 && (
                            <span key={`slc-${likeCount}`} className="ys-like-count">
                              {likeCount}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`ys-top-icon-btn ${isFollowed ? 'is-subbed' : ''}`}
                          onClick={() => {
                            const willSubscribe = !isFollowed;
                            setSocialGraph((prev) =>
                              toggleFollowCreatorWithMeta(prev, {
                                key: followKey,
                                name: previewVideo.channelName,
                                provider: 'youtube',
                                sourceUrl: previewVideo.watchUrl
                              }).graph
                            );
                            if (willSubscribe && ytSubUrl) {
                              window.open(
                                ytSubUrl,
                                'youapp_yt_sub',
                                'width=540,height=660,noopener,noreferrer'
                              );
                              setCastNotice(
                                `Siguiendo a «${previewVideo.channelName}» en YOUAPP · Confirmá también en YouTube.`
                              );
                            } else {
                              setCastNotice(
                                willSubscribe
                                  ? `Siguiendo a «${previewVideo.channelName}» en YOUAPP.`
                                  : `Dejaste de seguir a «${previewVideo.channelName}».`
                              );
                            }
                            window.setTimeout(() => setCastNotice(null), 3000);
                          }}
                          title={isFollowed ? 'Siguiendo' : 'Suscribirse'}
                          aria-label={isFollowed ? 'Siguiendo' : 'Suscribirse'}
                          aria-pressed={isFollowed}
                        >
                          {isFollowed ? (
                            <UserCheck size={15} strokeWidth={2.2} />
                          ) : (
                            <UserPlus size={15} strokeWidth={2.1} />
                          )}
                        </button>
                      </div>

                      <div className="ys-top-right-icons">
                        <button
                          type="button"
                          className="ys-top-icon-btn"
                          onClick={() => void handleSharePreviewVideo()}
                          title="Compartir este video"
                          aria-label="Compartir este video"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          className={`ys-top-icon-btn ${isMiniPlayerManual ? 'is-subbed' : ''}`}
                          onClick={() => void handleToggleMiniOrSystemPiP()}
                          title="Ventana flotante (Picture-in-Picture)"
                          aria-label="Ventana flotante (Picture-in-Picture)"
                        >
                          <PictureInPicture2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="ys-top-icon-btn"
                          onClick={() => void handleToggleFullscreen()}
                          title={isFullscreen ? 'Salir de pantalla completa' : 'Agrandar pantalla'}
                          aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Agrandar pantalla'}
                        >
                          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button
                          type="button"
                          className="ys-top-icon-btn"
                          onClick={() => {
                            setIsYou4Mode(false);
                            setIsMomentsMosaic(false);
                            setIsVolumeOpen(false);
                            setIsCastOpen(false);
                            setPreviewVideo(null);
                            setGlobalMiniVideo(null);
                          }}
                          title="Cerrar reproductor"
                          aria-label="Cerrar reproductor"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="ys-preview-meta">
                <h3>{previewVideo.title}</h3>
                <div className="ys-preview-subline">
                  <button
                    type="button"
                    className="ys-channel-inline-link"
                    onClick={() => void openChannelVideos(previewVideo.channelName, previewVideo.channelId)}
                    title="Ver todos los videos de este canal"
                  >
                    {previewVideo.channelName}
                  </button>
                  {(() => {
                    const fallbackViewsNum = previewVideo.views
                      ? parseViewsToNumber(previewVideo.views)
                      : null;
                    const vLabel = formatCompactViews(
                      previewVideoMeta?.viewCount ??
                        (fallbackViewsNum && fallbackViewsNum > 0 ? fallbackViewsNum : null),
                      previewVideoMeta?.isLive
                    );
                    const dLabel = formatPublishedDateEs(
                      previewVideoMeta?.publishedAt || previewVideo.publishedAt
                    );
                    return (
                      <>
                        {vLabel ? ` · ${vLabel}` : ''}
                        {dLabel ? ` · ${dLabel}` : ''}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* BARRA INTELIGENTE UNIFICADA IDÉNTICA A MITV (Bocina en timeline + 3 puntos Apple + ⏮ ▶ ⏭ + ⋯) */}
            <div className="mitv-smartbar-slot" style={{ position: 'relative' }}>
              {isCastOpen && (
                <div className="mitv-cast-popover" role="dialog" aria-label="Transmitir YOUAPP">
                  <div className="mitv-cast-head">Transmitir a dispositivo</div>
                  <button
                    type="button"
                    className="mitv-ch-option"
                    onClick={() => {
                      setIsCastOpen(false);
                      void handleCastVideo();
                    }}
                  >
                    <Cast size={14} color="#64d2ff" />
                    <span>Buscar TV / Chromecast (Chrome)</span>
                  </button>
                  <div className="mitv-cast-divider" />
                  <form
                    className="mitv-cast-code-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const code = castCodeInput.trim();
                      if (!code) return;
                      setIsCastOpen(false);
                      setCastNotice(`Conectando con TV código ${code}… Abrí /mitv en tu TV en Modo TV para emparejar.`);
                      window.setTimeout(() => setCastNotice(null), 4500);
                    }}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={castCodeInput}
                      onChange={(e) => setCastCodeInput(e.target.value)}
                      placeholder="Código de TV (ej. 4829)"
                      aria-label="Código de TV"
                    />
                    <button type="submit" className="mitv-cast-connect-btn">
                      Conectar
                    </button>
                  </form>
                </div>
              )}

              <SmartBar
                unifiedAppleMode
                isPlaying={previewIsPlaying}
                onPlayPause={handleTogglePreviewPlay}
                onSeek={handlePreviewSeek}
                isMosaic={isMomentsMosaic}
                onToggleMosaic={() => {
                  setIsYou4Mode(false);
                  setIsMomentsMosaic((prev) => {
                    const next = !prev;
                    if (next && !isFullscreen) void handleToggleFullscreen();
                    return next;
                  });
                }}
                isYou4={isYou4Mode}
                onToggleYou4={() => {
                  setIsMomentsMosaic(false);
                  setIsYou4Mode((prev) => {
                    const next = !prev;
                    setYou4AudioSlot(0);
                    if (next && !isFullscreen) void handleToggleFullscreen();
                    return next;
                  });
                }}
                isCasting={isCastOpen}
                onToggleCast={() => setIsCastOpen((v) => !v)}
                isMutedExternal={isPreviewMuted || playerVolume === 0}
                onToggleMuteExternal={handleTogglePreviewMute}
                moments={previewMoments}
                onSelectMoment={(moment) => handlePreviewSeek(moment.startSec)}
                onNextBlock={filteredResults.length > 1 ? () => handlePreviewStep(1) : undefined}
                onPreviousBlock={filteredResults.length > 1 ? () => handlePreviewStep(-1) : undefined}
                currentIndex={Math.max(0, filteredResults.findIndex((r) => r.videoId === previewVideo.videoId))}
                totalItems={filteredResults.length}
              />
            </div>
            </PlayerControlsDrawer>
          </section>
          </div>
        )}

        {hiddenToast && (
          <div className="ys-undo-toast" role="status">
            <span>Canal «{hiddenToast.name}» ocultado de tu feed.</span>
            <button
              type="button"
              className="ys-undo-toast-btn"
              onClick={() => {
                setSocialGraph((prev) => unhideChannelInGraph(prev, hiddenToast.key));
                setHiddenToast(null);
              }}
            >
              <RotateCcw size={12} /> Deshacer
            </button>
          </div>
        )}

        {/* ESTADO CARGANDO */}
        {status === 'loading' && results.length === 0 && (
          <div className="ys-loading">
            <Loader2 size={26} className="ys-spin" />
            <span>Buscando «{committed}»…</span>
          </div>
        )}

        {/* RESULTADOS TIPO YOUTUBE */}
        {status === 'done' && (
          <section className="ys-results-wrap">
            {activeChannelFilter && (
              <div className="ys-channel-banner">
                <button
                  type="button"
                  className="ys-channel-back"
                  onClick={() => {
                    setActiveChannelFilter(null);
                    void doSearch(query || 'Todos', activeCategory);
                  }}
                >
                  <ArrowLeft size={14} /> Volver
                </button>
                <span className="ys-channel-banner-title">
                  Canal: <strong>{activeChannelFilter.name}</strong>
                </span>
              </div>
            )}

            {filteredResults.length === 0 ? (
              <div className="ys-empty">
                <Search size={32} />
                <p>
                  {durationFilter !== 'all' && results.length > 0
                    ? 'No hay videos con esa duración en esta búsqueda. Probá cambiando el filtro a «Todas».'
                    : `No encontramos videos para «${committed}». Probá con otro artista, género o palabra clave.`}
                </p>
              </div>
            ) : (
              <>
                <div className={`ys-grid ${cardViewMode === 'capsule' ? 'mode-capsule' : 'mode-cinema'}`}>
                  {filteredResults.map((item) => {
                    const isPlayingCard = previewVideo?.videoId === item.videoId;
                    const isHoverLive = hoveredCardId === item.videoId && !isPlayingCard;
                    const isLikedCard = likedVideoIds.includes(item.videoId);
                    const viewsTxt = formatViewsLabel(item.views);
                    const pubTxt = formatPublishedLabel(item.publishedAt);
                    const metaExtra = [viewsTxt, pubTxt].filter(Boolean).join(' · ');
                    const chInitial = (item.channelName.trim()[0] || 'Y').toUpperCase();

                    return (
                      <article
                        key={item.videoId}
                        className={`ys-card ${cardViewMode === 'capsule' ? 'is-capsule' : 'is-cinema'} ${isPlayingCard ? 'is-playing' : ''}`}
                        onMouseEnter={() => handleCardHoverStart(item.videoId)}
                        onMouseLeave={handleCardHoverEnd}
                      >
                        <div className="ys-media-shell">
                          <button
                            type="button"
                            className="ys-thumb-btn"
                            onClick={() => playVideoInline(item)}
                            title="Reproducir arriba y seguir explorando abajo"
                          >
                            <img src={item.thumbnail} alt={item.title} loading="lazy" />
                            {isHoverLive && (
                              <iframe
                                className="ys-hover-preview-iframe"
                                src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1`}
                                title={`Vista previa de ${item.title}`}
                                allow="autoplay; encrypted-media"
                                tabIndex={-1}
                              />
                            )}
                            {isPlayingCard && (
                              <span className="ys-live-pill">
                                <span className="ys-live-dot" /> Sonando
                              </span>
                            )}
                            {item.duration && cardViewMode === 'cinema' && (
                              <span className="ys-duration">{item.duration}</span>
                            )}
                          </button>
                        </div>

                        <div className="ys-card-body">
                          {cardViewMode === 'capsule' && (
                            <div className="ys-capsule-top-row">
                              <span className={`ys-capsule-state ${isPlayingCard ? 'live' : ''}`}>
                                {isPlayingCard ? 'Al aire' : 'Disponible'}
                                {item.duration ? ` · ${item.duration}` : ''}
                              </span>
                              <div className="ys-capsule-mini-actions">
                                <button
                                  type="button"
                                  className="ys-dock-btn primary"
                                  onClick={() => handlePasteToMiSenal(item)}
                                  title="Sumar a Mi Señal"
                                >
                                  <Plus size={11} /> Señal
                                </button>
                                <button
                                  type="button"
                                  className="ys-dock-btn"
                                  onClick={() => handlePasteToMiTv(item)}
                                  title="Programar en MiTV"
                                >
                                  <Tv size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="ys-dock-btn"
                                  onClick={() => handlePasteToYouMusic(item)}
                                  title="Sumar a YOU MUSIC"
                                >
                                  <Music size={11} />
                                </button>
                                <button
                                  type="button"
                                  className={`ys-dock-btn ${isLikedCard ? 'liked' : ''}`}
                                  onClick={() => handleToggleLike(item.videoId)}
                                  title="Guardar"
                                  aria-label="Me gusta"
                                >
                                  <Heart size={11} fill={isLikedCard ? '#ff453a' : 'none'} color={isLikedCard ? '#ff453a' : 'currentColor'} />
                                </button>
                              </div>
                            </div>
                          )}

                          <h3
                            className="ys-card-title"
                            onClick={() => playVideoInline(item)}
                          >
                            {item.title
                              .replace(/&#0?39;|&apos;/g, "'")
                              .replace(/&quot;/g, '"')
                              .replace(/&amp;/g, '&')
                              .replace(/&lt;/g, '<')
                              .replace(/&gt;/g, '>')}
                          </h3>

                          <div className="ys-card-origin-row">
                            <span className="ys-ch-avatar" aria-hidden="true">{chInitial}</span>
                            <button
                              type="button"
                              className="ys-card-channel ys-card-channel-btn"
                              onClick={() => void openChannelVideos(item.channelName, item.channelId)}
                              title={`Ver todos los videos de ${item.channelName}`}
                            >
                              {item.channelName}
                            </button>
                            {metaExtra && <span className="ys-card-meta-inline">· {metaExtra}</span>}
                          </div>

                          {cardViewMode === 'cinema' && (
                            <div className="ys-float-dock" onClick={(e) => e.stopPropagation()}>
                              <span
                                className={`ys-dock-platform ys-dock-platform--${item.provider || 'youtube'}`}
                                title={`Plataforma: ${
                                  item.provider === 'vimeo'
                                    ? 'Vimeo'
                                    : item.provider === 'peertube'
                                      ? 'PeerTube'
                                      : item.provider === 'archive'
                                        ? 'Archive'
                                        : item.provider === 'odysee'
                                          ? 'Odysee'
                                          : item.provider === 'twitch'
                                            ? 'Twitch'
                                            : item.provider === 'dailymotion'
                                              ? 'Dailymotion'
                                              : 'YouTube'
                                }`}
                              >
                                <span className="ys-dock-platform-dot" />
                                {item.provider === 'vimeo'
                                  ? 'Vimeo'
                                  : item.provider === 'peertube'
                                    ? 'PeerTube'
                                    : item.provider === 'archive'
                                      ? 'Archive'
                                      : item.provider === 'odysee'
                                        ? 'Odysee'
                                        : item.provider === 'twitch'
                                          ? 'Twitch'
                                          : item.provider === 'dailymotion'
                                            ? 'Dailymotion ↗'
                                            : 'YouTube'}
                              </span>
                              <div className="ys-dock-icons">
                                <button
                                  type="button"
                                  className="ys-dock-icon-btn"
                                  onClick={() => handlePasteToMiSenal(item)}
                                  title="Sumar a Mi Señal"
                                  aria-label="Sumar a Mi Señal"
                                >
                                  <Radio size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="ys-dock-icon-btn"
                                  onClick={() => handlePasteToMiTv(item)}
                                  title="Programar en MiTV"
                                  aria-label="Programar en MiTV"
                                >
                                  <Tv size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="ys-dock-icon-btn"
                                  onClick={() => handlePasteToYouMusic(item)}
                                  title="Sumar a YOU MUSIC"
                                  aria-label="Sumar a YOU MUSIC"
                                >
                                  <Music size={13} />
                                </button>
                                <button
                                  type="button"
                                  className={`ys-dock-icon-btn ${isLikedCard ? 'liked' : ''}`}
                                  onClick={() => handleToggleLike(item.videoId)}
                                  title={isLikedCard ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                                  aria-label="Me gusta"
                                >
                                  <Heart size={13} fill={isLikedCard ? '#ff453a' : 'none'} color={isLikedCard ? '#ff453a' : 'currentColor'} />
                                </button>
                                <button
                                  type="button"
                                  className="ys-dock-icon-btn"
                                  onClick={() => handleHideChannel(item)}
                                  title={`Ocultar canal «${item.channelName}» de mis resultados`}
                                  aria-label={`Ocultar canal ${item.channelName}`}
                                >
                                  <EyeOff size={13} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="ys-load-more-wrap">
                    <button
                      type="button"
                      className="ys-load-more-btn"
                      onClick={() => void loadMoreResults()}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 size={15} className="ys-spin" /> Cargando más…
                        </>
                      ) : (
                        'Ver 50 más'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ESTADO INICIAL: SUGERENCIAS RÁPIDAS */}
        {status === 'idle' && (
          <section className="ys-idle-box">
            <div className="ys-idle-title">Explorá por tema o género</div>
            <div className="ys-suggest-grid">
              {SUGGESTED_CHIPS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="ys-suggest-card"
                  onClick={() => {
                    setQuery(label);
                    void doSearch(label);
                  }}
                >
                  <Icon size={18} color="#64d2ff" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <style>{`
        .ys-page {
          position: relative;
          min-height: 100dvh;
          background: #12151c;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          padding-bottom: 56px;
          overflow-x: clip;
          isolation: isolate;
        }
        .ys-ambient-bg {
          position: fixed;
          inset: -24px;
          z-index: 0;
          background-color: #161a22;
          background-image:
            radial-gradient(ellipse 46% 46% at 22% 18%, rgba(100, 210, 255, 0.28) 0%, transparent 62%),
            radial-gradient(ellipse 46% 44% at 78% 32%, rgba(0, 113, 227, 0.28) 0%, transparent 64%),
            linear-gradient(155deg, #11151d 0%, #1b2230 50%, #11141b 100%);
          background-size: cover;
          background-position: center;
          filter: blur(22px) brightness(0.72);
          transform: scale(1.06) translateZ(0);
          contain: strict;
          pointer-events: none;
        }
        .ys-ambient-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(180deg, rgba(16, 18, 24, 0.36) 0%, rgba(16, 18, 24, 0.62) 100%);
          pointer-events: none;
        }
        .ys-topbar,
        .ys-main {
          position: relative;
          z-index: 2;
        }
        .ys-topbar {
          position: sticky;
          top: 0;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 11px 28px;
          background: rgba(18, 21, 28, 0.72);
          backdrop-filter: saturate(180%) blur(22px);
          -webkit-backdrop-filter: saturate(180%) blur(22px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }
        .ys-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ys-logo-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .ys-brand-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.5);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .ys-nav {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ys-nav-btn {
          background: transparent;
          border: 1px solid transparent;
          color: rgba(245, 245, 247, 0.84);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ys-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(100, 210, 255, 0.42);
          color: #ffffff;
        }

        .ys-main {
          max-width: 1280px;
          margin: 0 auto;
          padding: 26px 24px 0;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .ys-hero-search {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .ys-search-wrap {
          position: relative;
          width: 100%;
          max-width: 720px;
        }
        .ys-search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px 6px 18px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.09);
          border: 1.5px solid rgba(255, 255, 255, 0.24);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 14px 36px rgba(0, 0, 0, 0.3);
        }
        .ys-search-ico {
          color: rgba(245, 245, 247, 0.65);
          flex-shrink: 0;
        }
        .ys-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 15px;
          padding: 8px 4px;
        }
        .ys-search-input::placeholder {
          color: rgba(245, 245, 247, 0.54);
        }
        .ys-icon-circle {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ys-icon-circle:hover {
          background: rgba(255, 255, 255, 0.18);
        }
        .ys-icon-circle.listening {
          background: #ef4444;
          border-color: #fca5a5;
        }
        .ys-search-submit {
          padding: 9px 18px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.6);
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .ys-search-submit:hover {
          background: #0a84ff;
        }
        .ys-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 40;
          background: rgba(20, 24, 34, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 18px;
          padding: 6px;
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ys-drop-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 9px 12px;
          border-radius: 11px;
          border: none;
          background: transparent;
          color: #f5f5f7;
          font-size: 13.5px;
          text-align: left;
          cursor: pointer;
        }
        .ys-drop-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .ys-drop-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ys-drop-row .ys-drop-item {
          flex: 1;
          min-width: 0;
        }
        .ys-drop-remove {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.52);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ys-drop-remove:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        .ys-preview-bar--mitv {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          padding: 10px 12px 6px;
        }
        .ys-preview-top-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .ys-preview-live-pill {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.24);
          color: #64d2ff;
          border: 1px solid rgba(100, 210, 255, 0.36);
          white-space: nowrap;
        }
        .ys-top-social-row {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ys-top-social-icons,
        .ys-top-right-icons {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ys-top-icon-btn {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.12s ease;
        }
        .ys-top-icon-btn.has-count {
          width: auto;
          padding: 0 9px;
          gap: 4px;
        }
        .ys-top-icon-btn.is-liked {
          color: #ff375f;
          background: rgba(255, 55, 95, 0.2);
          border-color: rgba(255, 55, 95, 0.48);
        }
        .ys-top-icon-btn.is-subbed {
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.5);
        }
        .ys-like-count {
          font-size: 11.5px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .ys-preview-subline {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 3px;
        }
        .ys-preview-card.is-expanded {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border-radius: 0 !important;
          border: none !important;
          z-index: 99999 !important;
          background: #000000 !important;
          display: flex;
          flex-direction: column;
        }
        .ys-preview-card.is-expanded .ys-preview-video-wrap,
        .ys-preview-card.is-expanded .ys-you4-grid {
          flex: 1;
          width: 100%;
          height: 100%;
          aspect-ratio: auto !important;
          border-radius: 0 !important;
        }
        .ys-preview-card.is-expanded .ys-preview-bar,
        .ys-preview-card.is-expanded .mitv-smartbar-slot {
          display: none !important;
        }
        .ys-preview-slot {
          width: 100%;
          position: relative;
        }
        @media (max-width: 768px) {
          .ys-has-mobile-player .ys-preview-slot {
            position: fixed;
            top: calc(48px + env(safe-area-inset-top));
            left: 0;
            right: 0;
            width: 100%;
            z-index: 75;
            margin: 0;
            padding: 0;
          }
          .ys-has-mobile-player .ys-preview-card {
            border-radius: 0 0 14px 14px !important;
            border-top: 0 !important;
            border-left: 0 !important;
            border-right: 0 !important;
            background: #0e1118 !important;
            box-shadow: 0 14px 32px rgba(0, 0, 0, 0.78);
          }
          .ys-has-mobile-player .ys-preview-video-wrap,
          .ys-has-mobile-player .ys-preview-video,
          .ys-has-mobile-player .ys-preview-stage {
            border-radius: 0 !important;
          }
          .ys-has-mobile-player .ys-main {
            padding-top: calc(56.25vw + 44px) !important;
            transition: padding-top 0.18s ease;
          }
          .ys-has-mobile-player:has(.yapp-pcd-root.is-open) .ys-main {
            padding-top: calc(56.25vw + 158px) !important;
          }
        }
        .ys-preview-card.is-mini-floating {
          position: fixed !important;
          right: 14px;
          bottom: max(14px, env(safe-area-inset-bottom));
          width: 310px;
          max-width: calc(100vw - 24px);
          z-index: 950;
          border-radius: 14px !important;
          overflow: hidden !important;
          background: rgba(12, 15, 22, 0.96) !important;
          border: 1.5px solid rgba(255, 255, 255, 0.28) !important;
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.72) !important;
        }
        .ys-preview-card.is-mini-floating .ys-preview-video-wrap {
          border-radius: 0 !important;
          aspect-ratio: 16 / 9;
        }
        .ys-preview-card.is-mini-floating .ys-preview-bar,
        .ys-preview-card.is-mini-floating .mitv-smartbar-slot {
          display: none !important;
        }
        .ys-mini-overlay-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 5px 8px;
          background: rgba(8, 10, 16, 0.92);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }
        .ys-mini-title {
          font-size: 11px;
          font-weight: 600;
          color: #f5f5f7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
        }
        .ys-mini-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .ys-mini-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
        }
        .ys-mini-btn:hover {
          background: rgba(255, 255, 255, 0.22);
        }
        .ys-undo-toast {
          position: fixed;
          left: 50%;
          bottom: max(18px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          z-index: 980;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(18, 22, 32, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.24);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.6);
          color: #f5f5f7;
          font-size: 12.5px;
          font-weight: 600;
          max-width: calc(100vw - 24px);
        }
        .ys-undo-toast-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.5);
          background: rgba(0, 113, 227, 0.28);
          color: #93d5ff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .ys-preview-card.is-mini-floating {
            width: 224px;
            right: 10px;
            bottom: max(10px, env(safe-area-inset-bottom));
          }
        }
        .ys-fs-exit-btn {
          position: fixed;
          top: max(12px, env(safe-area-inset-top));
          right: 12px;
          z-index: 100000;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(14, 16, 22, 0.78);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ys-algo-accordion {
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          margin-bottom: 12px;
          overflow: hidden;
        }
        .ys-algo-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 14px;
          background: transparent;
          border: none;
          color: #ffffff;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
        }
        .ys-algo-toggle:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .ys-algo-toggle-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          overflow: hidden;
        }
        .ys-algo-toggle-left strong {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
        }
        .ys-algo-toggle-meta {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.62);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ys-algo-toggle-right {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 600;
          color: #64d2ff;
          flex-shrink: 0;
        }
        .ys-reels-redirect-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(244, 63, 94, 0.2);
          border: 1px solid rgba(251, 113, 133, 0.45);
          color: #fda4af;
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .ys-algo-drawer {
          padding: 10px 12px 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ys-algo-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
        }
        .ys-algo-top-row .ys-algo-profiles {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
          flex: 1;
          min-width: 0;
        }
        .ys-algo-top-row .ys-algo-profiles::-webkit-scrollbar {
          display: none;
        }
        .ys-algo-3bars {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }
        .ys-algo-bar-row {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 6px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow-x: auto;
          scrollbar-width: none;
          flex-wrap: nowrap;
        }
        .ys-algo-bar-row::-webkit-scrollbar {
          display: none;
        }
        .ys-algo-bar-row .ys-filter-pill {
          white-space: nowrap;
          flex-shrink: 0;
          padding: 5px 10px;
          font-size: 11.5px;
        }
        .ys-algo-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(10, 132, 255, 0.14);
          border: 1px solid rgba(100, 210, 255, 0.34);
        }
        .ys-algo-left {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .ys-algo-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(100, 210, 255, 0.2);
          color: #a8e8ff;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }
        .ys-algo-profiles {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .ys-algo-pill {
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.86);
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .ys-algo-pill.active,
        .ys-algo-pill:hover {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .ys-algo-edit-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .ys-algo-edit-btn:hover {
          background: rgba(255, 255, 255, 0.22);
        }

        .ys-channel-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          padding: 10px 14px;
          border-radius: 14px;
          background: rgba(0, 113, 227, 0.16);
          border: 1px solid rgba(100, 210, 255, 0.35);
        }
        .ys-channel-back {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .ys-channel-back:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .ys-channel-banner-title {
          font-size: 13.5px;
          color: rgba(245, 245, 247, 0.88);
        }

        .ys-filter-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .ys-filter-group {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ys-filter-ico {
          margin-left: 7px;
          margin-right: 2px;
          color: rgba(245, 245, 247, 0.6);
        }
        .ys-filter-pill {
          padding: 4px 10px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.78);
          font-size: 11.8px;
          font-weight: 650;
          cursor: pointer;
        }
        .ys-filter-pill.active,
        .ys-filter-pill:hover {
          background: #0071e3;
          color: #ffffff;
        }

        .ys-channel-inline-link {
          padding: 0;
          border: none;
          background: transparent;
          color: #8ee0ff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
          text-align: left;
        }
        .ys-channel-inline-link:hover {
          text-decoration: underline;
        }
        .ys-card-channel-btn {
          padding: 0;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          align-self: flex-start;
          max-width: 100%;
        }
        .ys-card-channel-btn:hover {
          color: #8ee0ff;
          text-decoration: underline;
        }

        .ys-load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 22px;
        }
        .ys-load-more-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 26px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.45);
          background: rgba(0, 113, 227, 0.22);
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .ys-load-more-btn:hover:not(:disabled) {
          background: #0071e3;
        }
        .ys-load-more-btn:disabled {
          opacity: 0.65;
          cursor: default;
        }

        .ys-cat-carousel {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          max-width: 100%;
        }
        .ys-cat-arrow {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ys-cat-arrow:hover {
          background: #0071e3;
          border-color: #64d2ff;
        }
        .ys-cat-row {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 7px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 2px 0;
        }
        .ys-cat-row::-webkit-scrollbar {
          display: none;
        }
        .ys-cat-chip {
          flex-shrink: 0;
          white-space: nowrap;
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.88);
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .ys-cat-chip.active,
        .ys-cat-chip:hover {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }

        /* Reproductor arriba estilo YouTube (flujo normal, no fijo) */
        .ys-preview-card {
          position: relative;
          z-index: 10;
          scroll-margin-top: 72px;
          border-radius: 20px;
          overflow: visible;
          background: rgba(14, 17, 24, 0.94);
          backdrop-filter: saturate(160%) blur(18px);
          -webkit-backdrop-filter: saturate(160%) blur(18px);
          border: 1.5px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 22px 58px rgba(0, 0, 0, 0.52);
        }
        .ys-preview-video-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          max-height: 620px;
          background: #000000;
          border-radius: 18px 18px 0 0;
          overflow: hidden;
        }
        .ys-preview-loading-poster {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #05070c;
        }
        .ys-preview-loading-poster img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.48;
          filter: blur(2px) scale(1.03);
        }
        .ys-preview-loading-pill {
          position: relative;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(12, 16, 24, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #f5f5f7;
          font-size: 12px;
          font-weight: 650;
          backdrop-filter: blur(10px);
        }
        .ys-preview-smartbar {
          padding: 0 12px 10px;
        }
        /* ESTILOS EXACTOS DE LA BARRA DE REPRODUCTOR Y SMARTBAR DE MITV */
        .mitv-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .mitv-pill-btn:hover {
          background: rgba(255, 255, 255, 0.24);
        }
        .mitv-pill-btn.active-like {
          background: rgba(255, 55, 95, 0.24);
          border-color: rgba(255, 100, 130, 0.65);
          color: #ffd6de;
        }
        .mitv-pill-btn.active-follow {
          background: rgba(10, 132, 255, 0.28);
          border-color: rgba(100, 210, 255, 0.62);
          color: #d9f3ff;
        }
        .mitv-ctrl-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .mitv-ctrl-btn:hover,
        .mitv-ctrl-btn.active {
          background: rgba(10, 132, 255, 0.34);
          border-color: rgba(100, 210, 255, 0.72);
        }
        .mitv-popover-anchor {
          position: relative;
          display: inline-flex;
        }
        .mitv-vol-popover {
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(18, 22, 32, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.24);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
        }
        .mitv-vol-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-weight: 700;
        }
        .mitv-vol-slider {
          width: 86px;
          accent-color: #64d2ff;
        }
        .mitv-vol-pct {
          font-size: 11px;
          font-weight: 700;
          color: #c8e9ff;
          min-width: 32px;
          text-align: right;
        }
        .mitv-cast-popover {
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          z-index: 80;
          width: 264px;
          padding: 12px;
          border-radius: 16px;
          background: rgba(18, 22, 32, 0.97);
          border: 1px solid rgba(255, 255, 255, 0.24);
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.62);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mitv-cast-head {
          font-size: 12px;
          font-weight: 750;
          color: #ffffff;
        }
        .mitv-ch-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
        }
        .mitv-ch-option:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .mitv-cast-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.12);
        }
        .mitv-cast-code-form {
          display: flex;
          gap: 6px;
        }
        .mitv-cast-code-form input {
          flex: 1;
          min-width: 0;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
        }
        .mitv-cast-connect-btn {
          padding: 7px 11px;
          border-radius: 10px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .mitv-smartbar-slot {
          padding: 0 14px 14px;
        }
        .mitv-smartbar-slot .bv-root {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 8px 24px rgba(0, 0, 0, 0.18);
          color: #f5f5f7;
        }
        .mitv-smartbar-slot .bv-compact-btn,
        .mitv-smartbar-slot .bv-more-btn,
        .mitv-smartbar-slot .bv-native-ctrl-btn,
        .mitv-smartbar-slot .bv-step-btn,
        .mitv-smartbar-slot .bv-icon-btn,
        .mitv-smartbar-slot .bv-moment-chip,
        .mitv-smartbar-slot .bv-saved-toggle-btn,
        .mitv-smartbar-slot .bv-save-moment-btn,
        .mitv-smartbar-slot .bv-follow-btn {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.24);
          color: #f5f5f7;
        }
        .mitv-smartbar-slot .bv-compact-btn:hover,
        .mitv-smartbar-slot .bv-more-btn:hover,
        .mitv-smartbar-slot .bv-native-ctrl-btn:hover,
        .mitv-smartbar-slot .bv-step-btn:hover:not(:disabled),
        .mitv-smartbar-slot .bv-icon-btn:hover,
        .mitv-smartbar-slot .bv-moment-chip:hover,
        .mitv-smartbar-slot .bv-saved-toggle-btn:hover,
        .mitv-smartbar-slot .bv-save-moment-btn:hover,
        .mitv-smartbar-slot .bv-follow-btn:hover {
          background: rgba(255, 255, 255, 0.24);
          border-color: rgba(255, 255, 255, 0.42);
          color: #ffffff;
        }
        .mitv-smartbar-slot .bv-compact-btn.active,
        .mitv-smartbar-slot .bv-more-btn.active,
        .mitv-smartbar-slot .bv-saved-toggle-btn.open {
          background: rgba(255, 255, 255, 0.92);
          border-color: #ffffff;
          color: #1d1d1f;
        }
        .mitv-smartbar-slot .bv-compact-btn.accent {
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.45);
          color: #d9f3ff;
        }
        .mitv-smartbar-slot .bv-compact-btn.primary {
          background: #0071e3;
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
        .mitv-smartbar-slot .bv-native-scrub-row {
          border-bottom-color: rgba(255, 255, 255, 0.14);
        }
        .mitv-smartbar-slot .bv-mono-time,
        .mitv-smartbar-slot .bv-tl-time,
        .mitv-smartbar-slot .bv-signal-line strong,
        .mitv-smartbar-slot .bv-saved-meta strong,
        .mitv-smartbar-slot .bv-saved-drawer-head {
          color: #ffffff;
        }
        .ys-you4-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #05070a;
          border-radius: 18px 18px 0 0;
          overflow: hidden;
          box-sizing: border-box;
        }
        .ys-you4-cell {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          border-radius: 10px;
          overflow: hidden;
          background: #0d1016;
          border: 2px solid rgba(255, 255, 255, 0.12);
          box-sizing: border-box;
        }
        .ys-you4-cell.active-audio {
          border-color: #64d2ff;
          box-shadow: inset 0 0 0 1px rgba(100, 210, 255, 0.45), 0 0 16px rgba(10, 132, 255, 0.35);
        }
        .ys-you4-cell iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
        .ys-you4-audio-pill {
          position: absolute;
          left: 8px;
          bottom: 8px;
          z-index: 4;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(10, 14, 22, 0.82);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .ys-you4-cell.active-audio .ys-you4-audio-pill {
          background: #0071e3;
          border-color: #64d2ff;
        }
        .ys-cast-toast {
          padding: 7px 14px;
          background: rgba(0, 113, 227, 0.24);
          border-top: 1px solid rgba(100, 210, 255, 0.35);
          color: #d8f3ff;
          font-size: 12px;
          font-weight: 650;
          text-align: center;
        }
        .ys-preview-video-wrap iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        .ys-preview-bar {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          padding: 10px 12px 6px;
        }
        .ys-top-icon-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          flex-shrink: 0;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
        }
        .ys-top-icon-btn:active {
          transform: scale(0.92);
        }
        .ys-top-icon-btn.has-count {
          width: auto;
          padding: 0 9px;
          gap: 4px;
        }
        .ys-top-icon-btn.is-liked {
          color: #ff375f;
          background: rgba(255, 55, 95, 0.22);
          border-color: rgba(255, 55, 95, 0.55);
        }
        .ys-top-icon-btn.is-subbed {
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.26);
          border-color: rgba(100, 210, 255, 0.55);
        }
        body.mitv-is-fullscreen .ymtb-bar,
        body.mitv-is-fullscreen .ys-topbar {
          display: none !important;
        }
        .ys-preview-meta {
          min-width: 0;
          flex: 1;
        }
        .ys-preview-meta h3 {
          margin: 0 0 2px;
          font-size: 14.5px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ys-preview-meta span {
          font-size: 12.5px;
          color: rgba(245, 245, 247, 0.72);
        }
        .ys-preview-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ys-loading,
        .ys-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 46px 20px;
          color: rgba(245, 245, 247, 0.78);
          text-align: center;
        }
        .ys-spin {
          animation: ysSpin 0.9s linear infinite;
          color: #64d2ff;
        }
        @keyframes ysSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .ys-results-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }
        .ys-results-head h2 {
          margin: 0;
          font-size: 18px;
          color: #ffffff;
        }
        .ys-latency-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(100, 210, 255, 0.16);
          border: 1px solid rgba(100, 210, 255, 0.36);
          color: #9ce4ff;
          font-size: 11.5px;
          font-weight: 700;
        }

        .ys-grid.mode-cinema {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 20px 18px;
        }
        .ys-grid.mode-capsule {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
          gap: 12px;
        }
        .ys-card {
          position: relative;
          display: flex;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .ys-card.is-cinema {
          flex-direction: column;
          border-radius: 18px;
          background: transparent;
          border: 1px solid transparent;
          gap: 10px;
        }
        .ys-card.is-cinema:hover {
          transform: translateY(-2px);
        }
        .ys-card.is-cinema.is-playing .ys-media-shell {
          box-shadow: 0 0 0 2px #64d2ff, 0 12px 28px rgba(0, 113, 227, 0.36);
        }

        .ys-card.is-capsule {
          flex-direction: row;
          align-items: center;
          gap: 13px;
          padding: 10px 12px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.065);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .ys-card.is-capsule:hover {
          background: rgba(255, 255, 255, 0.11);
          border-color: rgba(100, 210, 255, 0.45);
        }
        .ys-card.is-capsule.is-playing {
          background: rgba(0, 113, 227, 0.14);
          border-color: #64d2ff;
          box-shadow: 0 8px 24px rgba(0, 113, 227, 0.24);
        }

        .ys-media-shell {
          position: relative;
          border-radius: 18px;
          overflow: hidden;
          background: #0c0e14;
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .ys-card.is-cinema:hover .ys-media-shell {
          border-color: rgba(100, 210, 255, 0.55);
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.38);
        }
        .ys-card.is-capsule .ys-media-shell {
          width: 122px;
          height: 72px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .ys-card.is-capsule.is-playing .ys-media-shell {
          box-shadow: 0 0 0 2.5px #2563eb, 0 0 16px rgba(37, 99, 235, 0.45);
        }

        .ys-thumb-btn {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          padding: 0;
          border: none;
          background: #0c0e14;
          cursor: pointer;
          overflow: hidden;
        }
        .ys-card.is-capsule .ys-thumb-btn {
          height: 100%;
          aspect-ratio: auto;
        }
        .ys-thumb-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.28s ease;
        }
        .ys-card:hover .ys-thumb-btn img {
          transform: scale(1.03);
        }
        .ys-hover-preview-iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          pointer-events: none;
          z-index: 2;
        }
        .ys-live-pill {
          position: absolute;
          left: 8px;
          top: 8px;
          z-index: 4;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.88);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .ys-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #9ce4ff;
        }
        .ys-duration {
          position: absolute;
          right: 8px;
          bottom: 8px;
          z-index: 4;
          padding: 2px 7px;
          border-radius: 7px;
          background: rgba(8, 10, 16, 0.78);
          backdrop-filter: blur(8px);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .ys-provider-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 4;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(10, 14, 24, 0.82);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #64d2ff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }
        .ys-float-dock {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ys-dock-platform {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .ys-dock-platform-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: currentColor;
        }
        .ys-dock-platform--youtube {
          background: rgba(255, 59, 48, 0.16);
          border: 1px solid rgba(255, 69, 58, 0.36);
          color: #ff6961;
        }
        .ys-dock-platform--dailymotion {
          background: rgba(56, 189, 248, 0.16);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: #7dd3fc;
        }
        .ys-dock-platform--vimeo {
          background: rgba(34, 211, 238, 0.16);
          border: 1px solid rgba(34, 211, 238, 0.4);
          color: #67e8f9;
        }
        .ys-dock-platform--peertube {
          background: rgba(251, 146, 60, 0.16);
          border: 1px solid rgba(251, 146, 60, 0.42);
          color: #fdba74;
        }
        .ys-dock-platform--archive {
          background: rgba(250, 204, 21, 0.16);
          border: 1px solid rgba(250, 204, 21, 0.42);
          color: #fde047;
        }
        .ys-dock-platform--odysee {
          background: rgba(168, 85, 247, 0.22);
          border: 1px solid rgba(192, 132, 252, 0.52);
          color: #d8b4fe;
        }
        .ys-dock-platform--twitch {
          background: rgba(16, 185, 129, 0.2);
          border: 1px solid rgba(52, 211, 153, 0.5);
          color: #6ee7b7;
        }
        .ys-dock-icons {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .ys-dock-icon-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.88);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
        }
        .ys-dock-icon-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }
        .ys-dock-icon-btn:active {
          transform: scale(0.92);
        }
        .ys-dock-icon-btn.liked {
          background: rgba(255, 69, 58, 0.2);
          border-color: rgba(255, 69, 58, 0.48);
          color: #ff453a;
        }
        .ys-dock-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 5px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.1);
          color: #f5f5f7;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .ys-dock-btn:hover {
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.36);
        }
        .ys-dock-btn.primary {
          background: #0071e3;
          border-color: rgba(100, 210, 255, 0.55);
          color: #ffffff;
        }
        .ys-dock-btn.primary:hover {
          background: #0a84ff;
        }
        .ys-dock-btn.liked {
          background: rgba(255, 69, 58, 0.18);
          border-color: rgba(255, 69, 58, 0.45);
        }

        .ys-card-body {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
          flex: 1;
        }
        .ys-card.is-cinema .ys-card-body {
          padding: 0 4px 2px;
        }
        .ys-capsule-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ys-capsule-state {
          font-size: 11px;
          font-weight: 700;
          color: rgba(245, 245, 247, 0.65);
          font-variant-numeric: tabular-nums;
        }
        .ys-capsule-state.live {
          color: #64d2ff;
        }
        .ys-capsule-mini-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .ys-card-title {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.32;
          color: #ffffff;
          cursor: pointer;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ys-card-origin-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .ys-ch-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(100, 210, 255, 0.3), rgba(0, 113, 227, 0.45));
          border: 1px solid rgba(255, 255, 255, 0.24);
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ys-card-channel {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.78);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 56%;
        }
        .ys-card-meta-inline {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.56);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 640px) {
          .ys-grid.mode-capsule {
            grid-template-columns: 1fr;
          }
          .ys-card.is-capsule .ys-media-shell {
            width: 108px;
            height: 66px;
          }
        }
          font-weight: 650;
          cursor: pointer;
        }
        .ys-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.18);
        }
        .ys-btn-ghost {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: #c8e9ff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ys-btn-ghost:hover {
          background: rgba(255, 255, 255, 0.16);
        }

        .ys-idle-box {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .ys-idle-title {
          font-size: 13.5px;
          color: rgba(245, 245, 247, 0.72);
          text-align: center;
        }
        .ys-suggest-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
          width: 100%;
          max-width: 780px;
        }
        .ys-suggest-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.07);
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 650;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .ys-suggest-card:hover {
          transform: translateY(-2px);
          border-color: rgba(100, 210, 255, 0.55);
          background: rgba(255, 255, 255, 0.13);
        }

        @media (max-width: 820px) {
          .ys-topbar {
            padding: 10px 14px;
          }
          .ys-nav {
            display: none;
          }
          .ys-main {
            padding: 18px 14px 0;
          }
        }
      `}</style>
    </div>
  );
}
