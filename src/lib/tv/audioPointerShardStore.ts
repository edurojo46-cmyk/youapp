// ============================================================================
// ATLAS AudioPointerShard v1 — Índice de Punteros Musicales Particionado
// Diseñado para escalar de cientos a 1.000.000 de punteros (~60-100 MB gzip)
// sin almacenar archivos MP3 pesados ni tocar disco C: (Cloud-First US$0).
// ============================================================================

import {
  pickCoverColor,
  searchAudiusTracks,
  searchOpenverseAudio,
  searchRadioBrowserStations,
  searchWikimediaCommonsAudio,
  type YouMusicLicense,
  type YouMusicProvider,
  type YouMusicTrack
} from './youMusicStore';

export type AudioShardIndexKind = 'music_audio' | 'music_video';

const YOUTUBE_METADATA_TTL_SEC = 30 * 24 * 60 * 60; // Política oficial Google: <= 30 días

export function getPointerIndexKind(provider: YouMusicProvider): AudioShardIndexKind {
  return provider === 'youtube_official' ? 'music_video' : 'music_audio';
}

const AUDIO_SHARD_STORAGE_KEY = 'youapp_audio_pointer_shards_v1';
const AUDIO_SHARD_IDB_NAME = 'youapp_audio_pointer_shards_idb_v1';
const AUDIO_SHARD_IDB_STORE = 'manifests';
const AUDIO_SHARD_IDB_KEY = 'main';

function openShardIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(AUDIO_SHARD_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AUDIO_SHARD_IDB_STORE)) {
          db.createObjectStore(AUDIO_SHARD_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadAudioPointerManifestAsync(): Promise<AudioPointerShardManifest> {
  const db = await openShardIdb();
  if (db) {
    try {
      const stored = await new Promise<AudioPointerShardManifest | null>((resolve) => {
        const tx = db.transaction(AUDIO_SHARD_IDB_STORE, 'readonly');
        const req = tx.objectStore(AUDIO_SHARD_IDB_STORE).get(AUDIO_SHARD_IDB_KEY);
        req.onsuccess = () => resolve((req.result as AudioPointerShardManifest) || null);
        req.onerror = () => resolve(null);
      });
      if (stored && stored.shards) {
        const merged = emptyShards();
        for (const key of ALL_AUDIO_SHARD_KEYS) {
          if (Array.isArray(stored.shards[key])) {
            merged[key] = stored.shards[key];
          }
        }
        return {
          version: 'audio-pointer-shard-v1',
          updatedAt: stored.updatedAt || new Date().toISOString(),
          shards: merged
        };
      }
    } catch {
      // fallback a localStorage
    }
  }
  return loadAudioPointerManifest();
}

async function persistManifestToIdb(manifest: AudioPointerShardManifest): Promise<void> {
  const db = await openShardIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(AUDIO_SHARD_IDB_STORE, 'readwrite');
      tx.objectStore(AUDIO_SHARD_IDB_STORE).put(manifest, AUDIO_SHARD_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export type AudioShardKey =
  | 'folklore'
  | 'tango'
  | 'rock'
  | 'jazz'
  | 'clasica'
  | 'indie'
  | 'electronica'
  | 'radio'
  | 'otros';

/** Registro compacto de puntero musical (~190-260 bytes JSON, ~65-95 bytes gzip) */
export interface AudioPointerRecord {
  id: string;
  t: string; // title
  a: string; // artist
  g: AudioShardKey; // shard partition key
  gl: string; // genre label visible
  p: YouMusicProvider;
  l: YouMusicLicense;
  u: string; // source/stream URI (https://... o supabase://bucket/path)
  e?: string; // official embed URL
  o?: string; // artist origin URL
  alb?: 1; // 1 si es álbum/playlist
  ok: 1 | 0; // health flag
  ts: number; // unix epoch sec
}

export interface AudioPointerShardManifest {
  version: 'audio-pointer-shard-v1';
  updatedAt: string;
  shards: Record<AudioShardKey, AudioPointerRecord[]>;
}

export interface AudioShardStats {
  totalPointers: number;
  musicAudioCount: number;
  musicVideoCount: number;
  activeShards: number;
  rawBytes: number;
  estimatedGzipBytes: number;
  avgBytesPerPointer: number;
  projected1MGzipMB: number;
  countsByShard: Record<AudioShardKey, number>;
}

export const ALL_AUDIO_SHARD_KEYS: AudioShardKey[] = [
  'folklore',
  'tango',
  'rock',
  'jazz',
  'clasica',
  'indie',
  'electronica',
  'radio',
  'otros'
];

export const SHARD_LABELS: Record<AudioShardKey, string> = {
  folklore: 'Folklore',
  tango: 'Tango',
  rock: 'Rock',
  jazz: 'Jazz',
  clasica: 'Clásica',
  indie: 'Indie / Acústico',
  electronica: 'Electrónica / Lo-Fi',
  radio: 'Radios en vivo',
  otros: 'Otros'
};

function emptyShards(): Record<AudioShardKey, AudioPointerRecord[]> {
  return {
    folklore: [],
    tango: [],
    rock: [],
    jazz: [],
    clasica: [],
    indie: [],
    electronica: [],
    radio: [],
    otros: []
  };
}

export function normalizeAudioShardKey(genre?: string, provider?: YouMusicProvider): AudioShardKey {
  const g = (genre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (g.includes('folklore') || g.includes('folk') || g.includes('zamba') || g.includes('chacarera')) {
    return 'folklore';
  }
  if (g.includes('tango') || g.includes('milonga')) return 'tango';
  if (g.includes('rock') || g.includes('punk') || g.includes('metal')) return 'rock';
  if (g.includes('jazz') || g.includes('blues') || g.includes('soul')) return 'jazz';
  if (g.includes('clasic') || g.includes('classic') || g.includes('piano') || g.includes('orquesta')) {
    return 'clasica';
  }
  if (g.includes('electr') || g.includes('lofi') || g.includes('lo-fi') || g.includes('ambient') || g.includes('house')) {
    return 'electronica';
  }
  if (g.includes('indie') || g.includes('acustic') || g.includes('acoustic') || g.includes('cantautor')) {
    return 'indie';
  }
  if (provider === 'radio' || g.includes('radio')) return 'radio';
  return 'otros';
}

function stablePointerHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function trackToAudioPointer(track: YouMusicTrack): AudioPointerRecord {
  const shardKey = normalizeAudioShardKey(track.genre, track.provider);
  return {
    id: `${track.provider}:${stablePointerHash(track.sourceUrl)}`,
    t: track.title,
    a: track.artist,
    g: shardKey,
    gl: track.genre || SHARD_LABELS[shardKey],
    p: track.provider,
    l: track.license,
    u: track.sourceUrl,
    ...(track.embedUrl ? { e: track.embedUrl } : {}),
    ...(track.originUrl && track.originUrl !== track.sourceUrl ? { o: track.originUrl } : {}),
    ...(track.isAlbum ? { alb: 1 } : {}),
    ok: 1,
    ts: Math.floor(Date.now() / 1000)
  };
}

export function audioPointerToTrack(ptr: AudioPointerRecord): YouMusicTrack {
  const fixedEmbed = ptr.e
    ? ptr.e.replace(/(archive\.org\/embed\/[^?&]+)&playlist=1/i, '$1?playlist=1')
    : undefined;
  return {
    id: ptr.id,
    title: ptr.t,
    artist: ptr.a,
    genre: ptr.gl || SHARD_LABELS[ptr.g],
    provider: ptr.p,
    license: ptr.l,
    isAlbum: ptr.alb === 1,
    sourceUrl: ptr.u,
    embedUrl: fixedEmbed,
    originUrl: ptr.o || ptr.u,
    coverColor: pickCoverColor(`${ptr.a}-${ptr.t}`),
    artistAuthorized: true,
    isFavorite: false,
    plays: 0,
    addedAt: new Date(ptr.ts * 1000).toISOString()
  };
}

export function loadAudioPointerManifest(): AudioPointerShardManifest {
  if (typeof window === 'undefined') {
    return {
      version: 'audio-pointer-shard-v1',
      updatedAt: new Date().toISOString(),
      shards: emptyShards()
    };
  }
  try {
    const raw = localStorage.getItem(AUDIO_SHARD_STORAGE_KEY);
    if (!raw) {
      return {
        version: 'audio-pointer-shard-v1',
        updatedAt: new Date().toISOString(),
        shards: emptyShards()
      };
    }
    const parsed = JSON.parse(raw);
    const merged = emptyShards();
    for (const key of ALL_AUDIO_SHARD_KEYS) {
      if (Array.isArray(parsed?.shards?.[key])) {
        merged[key] = parsed.shards[key];
      }
    }
    return {
      version: 'audio-pointer-shard-v1',
      updatedAt: parsed?.updatedAt || new Date().toISOString(),
      shards: merged
    };
  } catch {
    return {
      version: 'audio-pointer-shard-v1',
      updatedAt: new Date().toISOString(),
      shards: emptyShards()
    };
  }
}

function saveAudioPointerManifest(manifest: AudioPointerShardManifest): AudioPointerShardManifest {
  const next: AudioPointerShardManifest = {
    ...manifest,
    updatedAt: new Date().toISOString()
  };
  void persistManifestToIdb(next);
  if (typeof window !== 'undefined') {
    try {
      // Mantiene una copia liviana en localStorage solo si cabe cómodo (< 1.500 punteros);
      // cuando crece a miles/decenas de miles vive completo en IndexedDB sin límite de 5MB.
      const total = ALL_AUDIO_SHARD_KEYS.reduce(
        (acc, k) => acc + (next.shards[k]?.length || 0),
        0
      );
      if (total <= 1500) {
        localStorage.setItem(AUDIO_SHARD_STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // IndexedDB ya guardó el manifiesto completo
    }
  }
  return next;
}

export function mergeTracksIntoManifest(
  base: AudioPointerShardManifest,
  tracks: YouMusicTrack[]
): AudioPointerShardManifest {
  const nextShards = emptyShards();
  const seen = new Set<string>();

  for (const key of ALL_AUDIO_SHARD_KEYS) {
    nextShards[key] = [...(base.shards[key] || [])];
    for (const p of nextShards[key]) seen.add(p.id);
  }

  for (const tr of tracks) {
    if (!tr?.sourceUrl) continue;
    const ptr = trackToAudioPointer(tr);
    if (seen.has(ptr.id)) continue;
    seen.add(ptr.id);
    nextShards[ptr.g].unshift(ptr);
  }

  return saveAudioPointerManifest({
    ...base,
    shards: nextShards
  });
}

export function upsertTracksIntoAudioShards(tracks: YouMusicTrack[]): AudioPointerShardManifest {
  const manifest = loadAudioPointerManifest();
  return mergeTracksIntoManifest(manifest, tracks);
}

export function computeAudioShardStats(manifest: AudioPointerShardManifest): AudioShardStats {
  const countsByShard = {} as Record<AudioShardKey, number>;
  let totalPointers = 0;
  let musicAudioCount = 0;
  let musicVideoCount = 0;
  let activeShards = 0;

  for (const key of ALL_AUDIO_SHARD_KEYS) {
    const list = manifest.shards[key] || [];
    const len = list.length;
    countsByShard[key] = len;
    totalPointers += len;
    if (len > 0) activeShards += 1;
    for (const p of list) {
      if (getPointerIndexKind(p.p) === 'music_video') musicVideoCount += 1;
      else musicAudioCount += 1;
    }
  }

  const rawJson = JSON.stringify(manifest.shards);
  const rawBytes = new TextEncoder().encode(rawJson).length;
  // Compresión gzip típica en JSON de punteros repetitivos (~32% del tamaño crudo)
  const estimatedGzipBytes = Math.round(rawBytes * 0.32);
  const avgBytesPerPointer = totalPointers > 0 ? Math.round(rawBytes / totalPointers) : 220;
  const projected1MGzipMB = Number(
    (((avgBytesPerPointer * 0.32) * 1_000_000) / (1024 * 1024)).toFixed(1)
  );

  return {
    totalPointers,
    musicAudioCount,
    musicVideoCount,
    activeShards,
    rawBytes,
    estimatedGzipBytes,
    avgBytesPerPointer,
    projected1MGzipMB,
    countsByShard
  };
}

export function queryAudioPointerShards(
  manifest: AudioPointerShardManifest,
  query: string,
  shardFilter: AudioShardKey | 'all' = 'all',
  indexFilter: AudioShardIndexKind | 'all' = 'music_audio'
): { results: YouMusicTrack[]; elapsedMs: number; scannedShards: number } {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nowSec = Math.floor(Date.now() / 1000);
  const q = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const keysToScan: AudioShardKey[] =
    shardFilter === 'all' ? ALL_AUDIO_SHARD_KEYS : [shardFilter];

  const matched: YouMusicTrack[] = [];
  for (const key of keysToScan) {
    const list = manifest.shards[key] || [];
    for (const ptr of list) {
      if (ptr.ok === 0) continue;
      const kind = getPointerIndexKind(ptr.p);
      if (indexFilter !== 'all' && kind !== indexFilter) continue;
      // Política YouTube: metadatos de video se vencen a los 30 días
      if (kind === 'music_video' && nowSec - (ptr.ts || 0) > YOUTUBE_METADATA_TTL_SEC) {
        continue;
      }
      if (!q) {
        matched.push(audioPointerToTrack(ptr));
      } else {
        const hay = `${ptr.t} ${ptr.a} ${ptr.gl} ${ptr.p}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (hay.includes(q)) {
          matched.push(audioPointerToTrack(ptr));
        }
      }
      if (matched.length >= 60) break;
    }
    if (matched.length >= 60) break;
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    results: matched,
    elapsedMs: Number(Math.max(0.1, t1 - t0).toFixed(2)),
    scannedShards: keysToScan.length
  };
}

/** Cosecha punteros reales verificados en vivo (Audius 0 anuncios + Radio Browser) sin guardar MP3 */
export async function harvestLiveAudioPointerBatch(): Promise<{
  manifest: AudioPointerShardManifest;
  addedCount: number;
}> {
  const before = computeAudioShardStats(loadAudioPointerManifest()).totalPointers;
  const queries = ['folklore', 'tango', 'rock', 'jazz', 'classical', 'acoustic'];

  const tasks: Promise<YouMusicTrack[]>[] = [
    ...queries.map((q) => searchAudiusTracks(q)),
    searchRadioBrowserStations('folklore', 'AR'),
    searchRadioBrowserStations('tango', 'AR'),
    searchRadioBrowserStations('rock', 'AR'),
    searchRadioBrowserStations('jazz', '')
  ];

  const settled = await Promise.allSettled(tasks);
  const collected: YouMusicTrack[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      collected.push(...res.value);
    }
  }

  const manifest = upsertTracksIntoAudioShards(collected);
  const after = computeAudioShardStats(manifest).totalPointers;
  return {
    manifest,
    addedCount: Math.max(0, after - before)
  };
}

/** Busca álbumes/conciertos libres en Internet Archive (API pública sin clave, 0 anuncios) */
export async function fetchInternetArchiveAudioBatch(
  topic: string,
  rows = 50
): Promise<YouMusicTrack[]> {
  const q = `mediatype:(audio) AND (${topic}) AND NOT collection:(librivoxaudio)`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
    q
  )}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=subject&sort[]=downloads+desc&rows=${rows}&page=1&output=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const docs: any[] = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    return docs
      .filter((d) => typeof d?.identifier === 'string' && d.identifier.length > 2)
      .map((d) => {
        const id = String(d.identifier);
        const title = Array.isArray(d.title)
          ? String(d.title[0] || id)
          : String(d.title || id);
        const artist = Array.isArray(d.creator)
          ? String(d.creator[0] || 'Internet Archive')
          : String(d.creator || 'Internet Archive');
        return {
          id: `arch-${id}`,
          title: title.slice(0, 120),
          artist: artist.slice(0, 80),
          genre: topic,
          provider: 'archive' as const,
          license: 'ARCHIVE_ORG_OFFICIAL' as const,
          isAlbum: true,
          sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
          embedUrl: `https://archive.org/embed/${encodeURIComponent(id)}?playlist=1`,
          originUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
          coverColor: pickCoverColor(`${artist}-${title}`),
          artistAuthorized: true,
          isFavorite: false,
          plays: 0,
          addedAt: new Date().toISOString()
        };
      });
  } catch {
    return [];
  }
}

/** Busca lotes grandes en Audius (hasta 50 temas por género, 0 anuncios) */
async function fetchAudiusBulkBatch(query: string, limit = 50): Promise<YouMusicTrack[]> {
  const url =
    query === '__trending__'
      ? `https://discoveryprovider.audius.co/v1/tracks/trending?limit=${limit}&app_name=YOUAPP_MUSIC`
      : `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(
          query
        )}&limit=${limit}&app_name=YOUAPP_MUSIC`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const payload = await res.json();
    const list: any[] = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .filter((item) => item?.id && item?.title)
      .map((item) => {
        const trackId = String(item.id);
        const title = String(item.title);
        const artist = String(item.user?.name || item.user?.handle || 'Artista Audius');
        const genre = String(item.genre || (query === '__trending__' ? 'Indie' : query));
        const permalink = item.permalink ? `https://audius.co${item.permalink}` : 'https://audius.co';
        return {
          id: `aud-${trackId}`,
          title,
          artist,
          genre,
          provider: 'audius' as const,
          license: 'AUDIUS_OFFICIAL' as const,
          sourceUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(
            trackId
          )}/stream?app_name=YOUAPP_MUSIC`,
          originUrl: permalink,
          coverColor: pickCoverColor(`${artist}-${title}`),
          artistAuthorized: true,
          isFavorite: false,
          plays: 0,
          addedAt: new Date().toISOString()
        };
      });
  } catch {
    return [];
  }
}

/** Busca lotes grandes de radios HTTPS verificadas en Radio Browser */
async function fetchRadioBrowserBulkBatch(
  countryCode: string,
  limit = 200
): Promise<YouMusicTrack[]> {
  const hosts = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info'
  ];
  const params = new URLSearchParams({
    limit: String(limit),
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    ...(countryCode ? { countrycode: countryCode } : {})
  });

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/json/stations/search?${params.toString()}`);
      if (!res.ok) continue;
      const rows: any[] = await res.json();
      if (!Array.isArray(rows)) continue;
      return rows
        .filter((r) => typeof r?.url_resolved === 'string' && /^https:\/\//i.test(r.url_resolved))
        .map((r) => {
          const name = String(r.name || 'Radio en vivo').trim();
          const country = String(r.country || countryCode || 'Internacional').trim();
          const tags = String(r.tags || 'Radio Musical')
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(' · ');
          return {
            id: `rb-${r.stationuuid || stablePointerHash(r.url_resolved)}`,
            title: name,
            artist: country,
            genre: tags || 'Radio Musical',
            provider: 'radio' as const,
            license: 'RADIO_LIVE' as const,
            sourceUrl: r.url_resolved,
            originUrl: r.homepage || r.url_resolved,
            coverColor: pickCoverColor(`${country}-${name}`),
            artistAuthorized: true,
            isFavorite: false,
            plays: 0,
            addedAt: new Date().toISOString()
          };
        });
    } catch {
      // probar siguiente mirror
    }
  }
  return [];
}

export interface MassiveHarvestProgress {
  stepLabel: string;
  doneSteps: number;
  totalSteps: number;
  totalPointers: number;
}

/**
 * Cosecha masiva de punteros reales y gratuitos (US$0) desde:
 * 1) Audius (canciones completas sin publicidad)
 * 2) Internet Archive (álbumes y conciertos libres)
 * 3) Radio Browser (radios musicales HTTPS de Argentina, LatAm, España y el mundo)
 */
export async function harvestMassiveAudioPointerCatalog(
  currentManifest: AudioPointerShardManifest,
  onProgress?: (p: MassiveHarvestProgress) => void,
  shouldStop?: () => boolean
): Promise<{ manifest: AudioPointerShardManifest; addedCount: number }> {
  const startTotal = computeAudioShardStats(currentManifest).totalPointers;
  let working = currentManifest;

  const jobs: Array<{ label: string; run: () => Promise<YouMusicTrack[]> }> = [
    // Onda 1: Audius (canciones completas sin anuncios)
    { label: 'Audius · Tendencias globales', run: () => fetchAudiusBulkBatch('__trending__', 80) },
    { label: 'Audius · Folklore y Acústico', run: () => fetchAudiusBulkBatch('folklore', 50) },
    { label: 'Audius · Tango y Milonga', run: () => fetchAudiusBulkBatch('tango', 50) },
    { label: 'Audius · Rock y Alternativo', run: () => fetchAudiusBulkBatch('rock', 50) },
    { label: 'Audius · Jazz y Blues', run: () => fetchAudiusBulkBatch('jazz', 50) },
    { label: 'Audius · Clásica y Piano', run: () => fetchAudiusBulkBatch('classical', 50) },
    { label: 'Audius · Guitarra y Cantautor', run: () => fetchAudiusBulkBatch('acoustic', 50) },
    { label: 'Audius · Latina / Cumbia / Salsa', run: () => fetchAudiusBulkBatch('latin', 50) },
    { label: 'Audius · Lo-Fi y Chill', run: () => fetchAudiusBulkBatch('lofi', 50) },
    { label: 'Audius · Electrónica y Ambient', run: () => fetchAudiusBulkBatch('electronic', 50) },
    { label: 'Audius · Soul / Funk / Bossa', run: () => fetchAudiusBulkBatch('soul', 50) },
    { label: 'Audius · Instrumental / Cine', run: () => fetchAudiusBulkBatch('instrumental', 50) },
    // Onda 2: Internet Archive (álbumes completos 100% libres sin anuncios)
    { label: 'Internet Archive · Álbumes de Tango', run: () => fetchInternetArchiveAudioBatch('tango', 60) },
    { label: 'Internet Archive · Álbumes de Folklore', run: () => fetchInternetArchiveAudioBatch('folklore', 60) },
    { label: 'Internet Archive · Música Clásica', run: () => fetchInternetArchiveAudioBatch('classical piano orchestra', 60) },
    { label: 'Internet Archive · Jazz Histórico', run: () => fetchInternetArchiveAudioBatch('jazz', 60) },
    { label: 'Internet Archive · Rock y Blues', run: () => fetchInternetArchiveAudioBatch('rock blues', 60) },
    { label: 'Internet Archive · Guitarra Acústica', run: () => fetchInternetArchiveAudioBatch('acoustic guitar', 60) },
    // Onda 3: Radio Browser (radios verificadas HTTPS)
    { label: 'Radio Browser · Radios de Argentina', run: () => fetchRadioBrowserBulkBatch('AR', 250) },
    { label: 'Radio Browser · Uruguay y Chile', run: () => fetchRadioBrowserBulkBatch('UY', 120) },
    { label: 'Radio Browser · España y México', run: () => fetchRadioBrowserBulkBatch('ES', 150) },
    { label: 'Radio Browser · Top Mundial', run: () => fetchRadioBrowserBulkBatch('', 300) }
  ];

  // Ejecuta de a 3 en paralelo para máxima velocidad sin saturar
  let done = 0;
  for (let i = 0; i < jobs.length; i += 3) {
    if (shouldStop?.()) break;
    const slice = jobs.slice(i, i + 3);
    const results = await Promise.allSettled(slice.map((j) => j.run()));
    const batchTracks: YouMusicTrack[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        batchTracks.push(...r.value);
      }
    }
    working = mergeTracksIntoManifest(working, batchTracks);
    done += slice.length;
    onProgress?.({
      stepLabel: slice[slice.length - 1].label,
      doneSteps: done,
      totalSteps: jobs.length,
      totalPointers: computeAudioShardStats(working).totalPointers
    });
  }

  const endTotal = computeAudioShardStats(working).totalPointers;
  return {
    manifest: working,
    addedCount: Math.max(0, endTotal - startTotal)
  };
}

/**
 * Busca un artista/tema puntual en vivo 100 % sin API de YouTube:
 * Openverse CC + Wikimedia Commons + Internet Archive + Audius + Radio Browser (US$0).
 */
export async function harvestPointersForCustomQuery(
  currentManifest: AudioPointerShardManifest,
  rawQuery: string
): Promise<{
  manifest: AudioPointerShardManifest;
  addedCount: number;
  foundCount: number;
}> {
  const q = rawQuery.trim();
  if (!q) {
    return { manifest: currentManifest, addedCount: 0, foundCount: 0 };
  }
  const before = computeAudioShardStats(currentManifest).totalPointers;

  const tasks: Promise<YouMusicTrack[]>[] = [
    searchOpenverseAudio(q, 15),
    searchWikimediaCommonsAudio(q, 12),
    fetchInternetArchiveAudioBatch(q, 20),
    fetchAudiusBulkBatch(q, 18),
    searchRadioBrowserStations(q, '')
  ];

  const settled = await Promise.allSettled(tasks);

  const found: YouMusicTrack[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      found.push(...r.value);
    }
  }

  const nextManifest = mergeTracksIntoManifest(currentManifest, found);
  const after = computeAudioShardStats(nextManifest).totalPointers;
  return {
    manifest: nextManifest,
    addedCount: Math.max(0, after - before),
    foundCount: found.length
  };
}
