// ============================================================================
// YOU MUSIC V1 — Punteros de YouTube en Playlists Personales (0 Cuota API)
// - No descarga MP4 ni extrae MP3: guarda únicamente el puntero (videoId + URL).
// - Resuelve título y canal mediante YouTube oEmbed público (0 unidades de API).
// - Reproduce mediante el reproductor oficial visible de YouTube (IFrame API).
// ============================================================================

import { supabase } from '../supabase';

const STORAGE_KEY = 'youapp_youmusic_playlists_v1';

export interface YouMusicPointerItem {
  id: string;
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  sourceUrl: string;
  addedAt: string;
}

export interface YouMusicPlaylist {
  id: string;
  name: string;
  items: YouMusicPointerItem[];
  savedInMusicalSignal?: boolean;
  updatedAt: string;
}

export interface YouMusicWorkspace {
  playlists: YouMusicPlaylist[];
  activePlaylistId: string;
}

const DEFAULT_PLAYLIST_ID = 'pl-mi-playlist';

function defaultWorkspace(): YouMusicWorkspace {
  return {
    activePlaylistId: DEFAULT_PLAYLIST_ID,
    playlists: [
      {
        id: DEFAULT_PLAYLIST_ID,
        name: 'Mi playlist',
        items: [],
        updatedAt: new Date().toISOString()
      }
    ]
  };
}

/** Extrae el ID de 11 caracteres de cualquier URL de YouTube o YouTube Music */
export function extractYouTubeVideoId(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtu\.be\/|(?:music\.|www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i
  );
  return match?.[1] || null;
}

/** Resuelve título y autor vía oEmbed público de YouTube (0 cuota de Data API v3) */
export async function resolveYouTubePointer(
  rawUrl: string
): Promise<{ ok: true; item: YouMusicPointerItem } | { ok: false; error: string }> {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    return {
      ok: false,
      error: 'Pegá un enlace válido de YouTube (por ejemplo https://www.youtube.com/watch?v=... o https://youtu.be/...).'
    };
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let title = `Canción de YouTube (${videoId})`;
  let author = 'YouTube Oficial';

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { signal: controller.signal }
    );
    window.clearTimeout(timer);
    if (res.ok) {
      const meta = await res.json();
      if (typeof meta?.title === 'string' && meta.title.trim()) {
        title = meta.title.trim();
      }
      if (typeof meta?.author_name === 'string' && meta.author_name.trim()) {
        author = meta.author_name.trim();
      }
    }
  } catch {
    // Fallback silencioso si falla oEmbed: igual guardamos el puntero válido
  }

  return {
    ok: true,
    item: {
      id: `ytp-${videoId}-${Date.now().toString(36)}`,
      videoId,
      title,
      author,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      sourceUrl: watchUrl,
      addedAt: new Date().toISOString()
    }
  };
}

function sanitizePointerItem(raw: unknown): YouMusicPointerItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const videoId = typeof obj.videoId === 'string' ? obj.videoId.trim() : '';
  if (!videoId) return null;
  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id : `ytp-${videoId}`,
    videoId,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title : `Canción (${videoId})`,
    author: typeof obj.author === 'string' && obj.author.trim() ? obj.author : 'YouTube Oficial',
    thumbnailUrl:
      typeof obj.thumbnailUrl === 'string' && obj.thumbnailUrl.trim()
        ? obj.thumbnailUrl
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    sourceUrl:
      typeof obj.sourceUrl === 'string' && obj.sourceUrl.trim()
        ? obj.sourceUrl
        : `https://www.youtube.com/watch?v=${videoId}`,
    addedAt: typeof obj.addedAt === 'string' && obj.addedAt ? obj.addedAt : new Date().toISOString()
  };
}

function sanitizePlaylist(raw: unknown): YouMusicPlaylist | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '';
  if (!id) return null;
  const items = Array.isArray(obj.items)
    ? obj.items.map(sanitizePointerItem).filter((it): it is YouMusicPointerItem => Boolean(it))
    : [];
  return {
    id,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Mi playlist',
    items,
    savedInMusicalSignal: Boolean(obj.savedInMusicalSignal),
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : new Date().toISOString()
  };
}

export function loadYouMusicWorkspace(): YouMusicWorkspace {
  if (typeof window === 'undefined') return defaultWorkspace();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw);
    const sanitized = Array.isArray(parsed?.playlists)
      ? parsed.playlists.map(sanitizePlaylist).filter((p: YouMusicPlaylist | null): p is YouMusicPlaylist => Boolean(p))
      : [];
    const playlists: YouMusicPlaylist[] =
      sanitized.length > 0 ? sanitized : defaultWorkspace().playlists;
    const activePlaylistId =
      typeof parsed?.activePlaylistId === 'string' &&
      playlists.some((p) => p.id === parsed.activePlaylistId)
        ? parsed.activePlaylistId
        : playlists[0].id;
    return { playlists, activePlaylistId };
  } catch {
    return defaultWorkspace();
  }
}

export function saveYouMusicWorkspace(ws: YouMusicWorkspace): YouMusicWorkspace {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
    } catch {
      // ignore quota errors
    }
  }
  void syncYouMusicWorkspaceToCloud(ws);
  return ws;
}

/** Sincroniza punteros de playlists con Supabase auth metadata (sin alterar tablas ni RLS) */
async function syncYouMusicWorkspaceToCloud(ws: YouMusicWorkspace): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    // Guardamos solo punteros compactos (máximo 150 canciones en metadata)
    const compact = ws.playlists.slice(0, 12).map((pl) => ({
      id: pl.id,
      name: pl.name,
      savedInMusicalSignal: Boolean(pl.savedInMusicalSignal),
      updatedAt: pl.updatedAt,
      items: pl.items.slice(0, 50).map((it) => ({
        id: it.id,
        videoId: it.videoId,
        title: it.title.slice(0, 100),
        author: it.author.slice(0, 60),
        thumbnailUrl: it.thumbnailUrl,
        sourceUrl: it.sourceUrl,
        addedAt: it.addedAt
      }))
    }));
    await supabase.auth.updateUser({
      data: { youapp_music_playlists_v1: compact }
    });
  } catch {
    // fallback silencioso a localStorage
  }
}

export async function loadYouMusicWorkspaceFromCloud(): Promise<YouMusicWorkspace | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous) return null;
    const cloudPlaylists = (user.user_metadata as any)?.youapp_music_playlists_v1;
    if (!Array.isArray(cloudPlaylists) || cloudPlaylists.length === 0) return null;

    const local = loadYouMusicWorkspace();
    const byId = new Map<string, YouMusicPlaylist>();
    for (const pl of local.playlists) byId.set(pl.id, pl);
    for (const rawPl of cloudPlaylists) {
      const cpl = sanitizePlaylist(rawPl);
      if (!cpl) continue;
      const existing = byId.get(cpl.id);
      const cloudTs = Date.parse(cpl.updatedAt || '') || 0;
      const localTs = Date.parse(existing?.updatedAt || '') || 0;
      if (!existing || (cpl.items.length > 0 && cloudTs > localTs)) {
        byId.set(cpl.id, cpl);
      }
    }
    const merged: YouMusicWorkspace = {
      playlists: Array.from(byId.values()),
      activePlaylistId: local.activePlaylistId
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
    return merged;
  } catch {
    return null;
  }
}

export function buildPlaylistShareUrl(playlist: YouMusicPlaylist): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://youapp.tv';
  const ids = playlist.items
    .map((i) => i.videoId)
    .filter(Boolean)
    .slice(0, 30)
    .join(',');
  const params = new URLSearchParams();
  params.set('pl', playlist.name);
  if (ids) params.set('ids', ids);
  return `${origin}/youmusic?${params.toString()}`;
}

export function buildSingleSongShareUrl(item: YouMusicPointerItem): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://youapp.tv';
  const params = new URLSearchParams();
  params.set('v', item.videoId);
  params.set('t', item.title);
  params.set('a', item.author);
  return `${origin}/youmusic?${params.toString()}`;
}
