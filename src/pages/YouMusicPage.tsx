import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Cast,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  ListMusic,
  Maximize2,
  Minimize2,
  Moon,
  Music,
  Pause,
  Pencil,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  Smartphone,
  Sparkles,
  Trash2,
  Tv,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { SmartBar } from '../components/smartbar/SmartBar';
import { PlayerControlsDrawer } from '../components/player/PlayerControlsDrawer';
import { useLandscapeAutoFullscreen } from '../hooks/useLandscapeAutoFullscreen';
import { MosaicPlayerGrid } from '../components/player/MosaicPlayerGrid';
import {
  YouMusicAlarmController,
  loadYouMusicAlarm,
  type YouMusicAlarmConfig
} from '../components/music/YouMusicAlarmModal';
import { usePlayerStore } from '../store/usePlayerStore';
import {
  SOCIAL_GRAPH_CHANGED_EVENT,
  buildYouTubeSubscribeUrl,
  fetchYouTubeVideoMeta,
  formatCompactViews,
  formatPublishedDateEs,
  loadSocialGraph,
  toggleFollowCreatorWithMeta,
  toggleLikeVideoWithMeta,
  type VideoPublicMeta,
  type YouAppSocialGraph
} from '../lib/tv/youappSocialStore';
import type { VideoMoment } from '../lib/moments/momentsTypes';
import { useSignalStore } from '../lib/tv/signalStore';
import { persistSignal } from '../lib/tv/signalPersistence';
import { supabase } from '../lib/supabase';
import type { ScheduleBlock } from '../lib/tv/signalTypes';
import {
  buildPlaylistShareUrl,
  buildSingleSongShareUrl,
  loadYouMusicWorkspace,
  loadYouMusicWorkspaceFromCloud,
  resolveYouTubePointer,
  saveYouMusicWorkspace,
  type YouMusicPlaylist,
  type YouMusicPointerItem,
  type YouMusicWorkspace
} from '../lib/tv/youMusicPlaylistStore';
import atlasMusicCatalog from '../data/atlasMusicChannels.json';
import { STARTER_AUDIO_PRESETS } from '../lib/tv/signalMediaSourcesStore';

type AtlasMusicVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  watchUrl: string;
};

type AtlasMusicChannel = {
  channelId: string;
  name: string;
  artistLabel: string;
  genre: string;
  channelUrl: string;
  thumbnail: string;
  wikidataQid: string;
  verifiedVia: string;
  verifiedAt: string;
  videos: AtlasMusicVideo[];
};

const ATLAS_MUSIC_CHANNELS: AtlasMusicChannel[] = Array.isArray(atlasMusicCatalog?.channels)
  ? (atlasMusicCatalog.channels as AtlasMusicChannel[])
  : [];
const ATLAS_GENRES = ['Todos', 'Rock', 'Pop', 'Jazz', 'Latino', 'Clásica'] as const;

export default function YouMusicPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setSignal = useSignalStore((s) => s.setSignal);

  const [workspace, setWorkspace] = useState<YouMusicWorkspace>(() => loadYouMusicWorkspace());
  const [urlInput, setUrlInput] = useState('');
  const [customSongName, setCustomSongName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeRadioUrl, setActiveRadioUrl] = useState<string | null>(null);
  const liveRadioAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleLiveRadio = (streamUrl: string, label: string) => {
    const audio = liveRadioAudioRef.current;
    if (!audio) return;
    if (activeRadioUrl === streamUrl) {
      audio.pause();
      setActiveRadioUrl(null);
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'paused';
        } catch {
          // ignore
        }
      }
      return;
    }
    audio.src = streamUrl;
    audio
      .play()
      .then(() => {
        setActiveRadioUrl(streamUrl);
        setToast(`📻 Escuchando en vivo: ${label} (sigue sonando con pantalla apagada)`);
        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: label,
              artist: 'YOU MUSIC · Radio en vivo',
              album: 'YOUAPP TV'
            });
            navigator.mediaSession.playbackState = 'playing';
            navigator.mediaSession.setActionHandler('play', () => {
              void audio.play();
            });
            navigator.mediaSession.setActionHandler('pause', () => {
              audio.pause();
              setActiveRadioUrl(null);
            });
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        setToast(`No se pudo conectar el stream de ${label}.`);
      });
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isRenamingPlaylist, setIsRenamingPlaylist] = useState(false);
  const [renamePlaylistDraft, setRenamePlaylistDraft] = useState('');
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [editingSongDraft, setEditingSongDraft] = useState('');
  const [atlasGenreFilter, setAtlasGenreFilter] = useState<string>('Todos');
  const [atlasSearchQuery, setAtlasSearchQuery] = useState('');
  const [atlasVisibleCount, setAtlasVisibleCount] = useState(24);
  const [playlistVisibleCount, setPlaylistVisibleCount] = useState(50);

  // Catálogo en vivo desde Supabase `youapp_index` (los 10.000 canales / 46.423+ videos 100% YouTube)
  const [cloudAtlasChannels, setCloudAtlasChannels] = useState<AtlasMusicChannel[]>([]);
  const [cloudAtlasTotalVideos, setCloudAtlasTotalVideos] = useState<number>(0);
  const [cloudAtlasLoading, setCloudAtlasLoading] = useState<boolean>(false);
  const [cloudAtlasHasMore, setCloudAtlasHasMore] = useState<boolean>(false);
  const cloudAtlasOffsetRef = useRef<number>(0);

  const mapRowsToAtlasChannels = useCallback((rows: any[], baseChannels: AtlasMusicChannel[] = []): AtlasMusicChannel[] => {
    const byChannel = new Map<string, AtlasMusicChannel>();
    for (const ch of baseChannels) {
      byChannel.set(ch.channelId, { ...ch, videos: [...ch.videos] });
    }
    const genreLabelMap: Record<string, string> = {
      rock: 'Rock',
      pop: 'Pop',
      jazz: 'Jazz',
      latino: 'Latino',
      clasica: 'Clásica'
    };
    for (const r of rows) {
      const vidId = String(r?.video_id || '').trim();
      const chId = String(r?.creator_id || r?.creator_name || vidId).trim();
      if (!vidId || !chId) continue;
      const tags: string[] = Array.isArray(r?.tags) ? r.tags.map((t: unknown) => String(t).toLowerCase()) : [];
      const detectedGenreKey = tags.find((t) => t in genreLabelMap) || 'pop';
      const genre = genreLabelMap[detectedGenreKey] || 'Música';
      const thumb = String(r?.thumbnail_url || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`);
      const watchUrl = `https://www.youtube.com/watch?v=${vidId}`;
      const videoObj: AtlasMusicVideo = {
        videoId: vidId,
        title: String(r?.title || 'Video musical'),
        publishedAt: String(r?.published_at || ''),
        thumbnail: thumb,
        watchUrl
      };
      const existing = byChannel.get(chId);
      if (existing) {
        if (existing.videos.length < 3 && !existing.videos.some((v) => v.videoId === vidId)) {
          existing.videos.push(videoObj);
        }
      } else {
        byChannel.set(chId, {
          channelId: chId,
          name: String(r?.creator_name || 'Canal Musical'),
          artistLabel: String(r?.creator_name || 'Canal Musical'),
          genre,
          channelUrl: chId.startsWith('UC')
            ? `https://www.youtube.com/channel/${chId}`
            : watchUrl,
          thumbnail: thumb,
          wikidataQid: '',
          verifiedVia: 'supabase:youapp_index',
          verifiedAt: String(r?.published_at || ''),
          videos: [videoObj]
        });
      }
    }
    return Array.from(byChannel.values());
  }, []);

  const fetchCloudAtlasPage = useCallback(
    async (opts: { reset: boolean; genre: string; search: string }) => {
      const PAGE_ROWS = 60;
      const from = opts.reset ? 0 : cloudAtlasOffsetRef.current;
      const to = from + PAGE_ROWS - 1;
      setCloudAtlasLoading(true);
      try {
        const tagFilters = ['atlas-pointer-compact'];
        if (opts.genre !== 'Todos') {
          const gNorm = opts.genre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
          tagFilters.push(gNorm);
        } else {
          tagFilters.push('rock-curado');
        }
        // Sin `count: 'exact'` ni sort sin índice en `updated_at` (evita HTTP 500 timeout en tabla >1M filas)
        let q = supabase
          .from('youapp_index')
          .select('video_id,title,creator_id,creator_name,tags,thumbnail_url,published_at')
          .eq('provider', 'youtube')
          .contains('tags', tagFilters);

        const cleanSearch = opts.search.trim().replace(/[,%()]/g, ' ').trim();
        if (cleanSearch) {
          q = q.or(`creator_name.ilike.%${cleanSearch}%,title.ilike.%${cleanSearch}%`);
        }

        const { data, error } = await q.range(from, to);
        if (error || !Array.isArray(data)) {
          return;
        }
        cloudAtlasOffsetRef.current = from + data.length;
        setCloudAtlasTotalVideos((prev) => Math.max(prev, from + data.length));
        setCloudAtlasHasMore(data.length >= PAGE_ROWS);
        setCloudAtlasChannels((prev) => mapRowsToAtlasChannels(data, opts.reset ? [] : prev));
      } finally {
        setCloudAtlasLoading(false);
      }
    },
    [mapRowsToAtlasChannels]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCloudAtlasPage({ reset: true, genre: atlasGenreFilter, search: atlasSearchQuery });
    }, atlasSearchQuery.trim() ? 260 : 0);
    return () => window.clearTimeout(timer);
  }, [atlasGenreFilter, atlasSearchQuery, fetchCloudAtlasPage]);

  const filteredAtlasChannels = useMemo(() => {
    if (cloudAtlasChannels.length > 0 || cloudAtlasTotalVideos > 0) {
      return cloudAtlasChannels;
    }
    const base =
      atlasGenreFilter === 'Todos'
        ? ATLAS_MUSIC_CHANNELS
        : ATLAS_MUSIC_CHANNELS.filter((ch) => ch.genre === atlasGenreFilter);
    const q = atlasSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.artistLabel.toLowerCase().includes(q) ||
        ch.genre.toLowerCase().includes(q) ||
        ch.videos.some((v) => v.title.toLowerCase().includes(q))
    );
  }, [cloudAtlasChannels, cloudAtlasTotalVideos, atlasGenreFilter, atlasSearchQuery]);

  const visibleAtlasChannels = useMemo(
    () =>
      cloudAtlasChannels.length > 0
        ? filteredAtlasChannels
        : filteredAtlasChannels.slice(0, atlasVisibleCount),
    [cloudAtlasChannels.length, filteredAtlasChannels, atlasVisibleCount]
  );

  const handlePlayAtlasMusicVideo = useCallback(
    (video: AtlasMusicVideo, channelName: string) => {
      const currentWs = loadYouMusicWorkspace();
      let targetIndex = 0;
      const incoming: YouMusicPointerItem = {
        id: `atlas-${video.videoId}`,
        videoId: video.videoId,
        title: video.title,
        author: channelName,
        thumbnailUrl: video.thumbnail,
        sourceUrl: video.watchUrl,
        addedAt: new Date().toISOString()
      };
      const nextWs: YouMusicWorkspace = {
        ...currentWs,
        playlists: currentWs.playlists.map((pl) => {
          if (pl.id !== currentWs.activePlaylistId) return pl;
          const idx = pl.items.findIndex((x) => x.videoId === video.videoId);
          if (idx >= 0) {
            targetIndex = idx;
            return pl;
          }
          targetIndex = pl.items.length;
          return {
            ...pl,
            items: [...pl.items, incoming],
            updatedAt: new Date().toISOString()
          };
        })
      };
      setSharedPlaylist(null);
      setWorkspace(saveYouMusicWorkspace(nextWs));
      setCurrentIndex(targetIndex);
      setToast(`Reproduciendo en tu Señal Musical: «${video.title}»`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const handleAddAtlasChannelToMusicSignal = useCallback((ch: AtlasMusicChannel) => {
    const currentWs = loadYouMusicWorkspace();
    let addedCount = 0;
    let targetPlaylistName = 'Señal Musical';
    const nextWs: YouMusicWorkspace = {
      ...currentWs,
      playlists: currentWs.playlists.map((pl) => {
        if (pl.id !== currentWs.activePlaylistId) return pl;
        targetPlaylistName = pl.name;
        const existingIds = new Set(pl.items.map((x) => x.videoId));
        const newItems: YouMusicPointerItem[] = [];
        for (const vid of ch.videos.slice(0, 3)) {
          if (existingIds.has(vid.videoId)) continue;
          existingIds.add(vid.videoId);
          newItems.push({
            id: `atlas-${vid.videoId}`,
            videoId: vid.videoId,
            title: vid.title,
            author: ch.name,
            thumbnailUrl: vid.thumbnail,
            sourceUrl: vid.watchUrl,
            addedAt: new Date().toISOString()
          });
        }
        addedCount = newItems.length;
        if (newItems.length === 0) return pl;
        return {
          ...pl,
          items: [...pl.items, ...newItems],
          updatedAt: new Date().toISOString()
        };
      })
    };
    setSharedPlaylist(null);
    setWorkspace(saveYouMusicWorkspace(nextWs));
    setToast(
      addedCount > 0
        ? `Sumado «${ch.name}» (${addedCount} temas) a tu Señal Musical «${targetPlaylistName}».`
        : `Los temas de «${ch.name}» ya estaban en tu Señal Musical «${targetPlaylistName}».`
    );
  }, []);

  const handleAddSingleAtlasVideoToMusicSignal = useCallback(
    (video: AtlasMusicVideo, channelName: string) => {
      const currentWs = loadYouMusicWorkspace();
      let alreadyExists = false;
      let targetPlaylistName = 'Señal Musical';
      const nextWs: YouMusicWorkspace = {
        ...currentWs,
        playlists: currentWs.playlists.map((pl) => {
          if (pl.id !== currentWs.activePlaylistId) return pl;
          targetPlaylistName = pl.name;
          if (pl.items.some((x) => x.videoId === video.videoId)) {
            alreadyExists = true;
            return pl;
          }
          return {
            ...pl,
            items: [
              ...pl.items,
              {
                id: `atlas-${video.videoId}`,
                videoId: video.videoId,
                title: video.title,
                author: channelName,
                thumbnailUrl: video.thumbnail,
                sourceUrl: video.watchUrl,
                addedAt: new Date().toISOString()
              }
            ],
            updatedAt: new Date().toISOString()
          };
        })
      };
      setSharedPlaylist(null);
      setWorkspace(saveYouMusicWorkspace(nextWs));
      setToast(
        alreadyExists
          ? `«${video.title}» ya estaba en tu Señal Musical «${targetPlaylistName}».`
          : `Sumado a tu Señal Musical «${targetPlaylistName}»: ${video.title}`
      );
    },
    []
  );

  const handleAddAllFilteredAtlasToMusicSignal = useCallback(() => {
    if (filteredAtlasChannels.length === 0) return;
    const currentWs = loadYouMusicWorkspace();
    let addedCount = 0;
    let targetPlaylistName = 'Señal Musical';
    // Si son más de 50 canales (ej. los 1.000), sumamos el tema principal de cada canal para mantener la lista ágil y variada;
    // si son 50 o menos, sumamos los 3 temas de cada canal.
    const perChannelCap = filteredAtlasChannels.length > 50 ? 1 : 3;
    const nowIso = new Date().toISOString();

    const nextWs: YouMusicWorkspace = {
      ...currentWs,
      playlists: currentWs.playlists.map((pl) => {
        if (pl.id !== currentWs.activePlaylistId) return pl;
        targetPlaylistName = pl.name;
        const existingIds = new Set(pl.items.map((x) => x.videoId));
        const newItems: YouMusicPointerItem[] = [];
        for (const ch of filteredAtlasChannels) {
          for (const vid of ch.videos.slice(0, perChannelCap)) {
            if (existingIds.has(vid.videoId)) continue;
            existingIds.add(vid.videoId);
            newItems.push({
              id: `atlas-${vid.videoId}`,
              videoId: vid.videoId,
              title: vid.title,
              author: ch.name,
              thumbnailUrl: vid.thumbnail,
              sourceUrl: vid.watchUrl,
              addedAt: nowIso
            });
          }
        }
        addedCount = newItems.length;
        if (newItems.length === 0) return pl;
        return {
          ...pl,
          items: [...pl.items, ...newItems],
          updatedAt: nowIso
        };
      })
    };

    setSharedPlaylist(null);
    setWorkspace(saveYouMusicWorkspace(nextWs));
    setToast(
      addedCount > 0
        ? `¡Sumados ${addedCount} temas (${filteredAtlasChannels.length} canales${atlasGenreFilter !== 'Todos' ? ` de ${atlasGenreFilter}` : ''}) a tu Señal Musical «${targetPlaylistName}»!`
        : `Todos esos canales ya estaban en tu Señal Musical «${targetPlaylistName}».`
    );
  }, [filteredAtlasChannels, atlasGenreFilter]);

  // Playlist compartida por URL (?pl=Nombre&ids=id1,id2... o ?v=id)
  const [sharedPlaylist, setSharedPlaylist] = useState<YouMusicPlaylist | null>(null);
  const musicBookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  const handledMusicAddRef = useRef<string | null>(null);

  // Bookmarklet "+ Music" para PC (1 clic desde YouTube / YouTube Music)
  useEffect(() => {
    const el = musicBookmarkletRef.current;
    if (!el || typeof window === 'undefined') return;
    const origin = window.location.origin;
    el.setAttribute(
      'href',
      `javascript:(function(){var u=location.href;window.open('${origin}/youmusic?add='+encodeURIComponent(u),'youapp_music');})();`
    );
  }, []);

  // MODO CORRER V1 — Screen Wake Lock (mantener pantalla encendida sin alterar el reproductor YouTube)
  const isWakeLockSupported =
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof (navigator as Navigator & { wakeLock?: { request?: unknown } }).wakeLock?.request ===
      'function';
  const [runModeEnabled, setRunModeEnabled] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockNotice, setWakeLockNotice] = useState<string | null>(null);
  const wakeLockSentinelRef = useRef<{
    release: () => Promise<void>;
    addEventListener?: (type: string, listener: () => void) => void;
  } | null>(null);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockSentinelRef.current;
    wakeLockSentinelRef.current = null;
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        // Ignorar si el navegador ya lo liberó
      }
    }
    setWakeLockActive(false);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!isWakeLockSupported) {
      setWakeLockActive(false);
      setWakeLockNotice(
        'Tu navegador no permite bloquear el apagado automático. Mantené la app visible mientras escuchás.'
      );
      return;
    }
    try {
      const nav = navigator as Navigator & {
        wakeLock: {
          request: (type: 'screen') => Promise<{
            release: () => Promise<void>;
            addEventListener?: (type: string, listener: () => void) => void;
          }>;
        };
      };
      const sentinel = await nav.wakeLock.request('screen');
      wakeLockSentinelRef.current = sentinel;
      setWakeLockActive(true);
      setWakeLockNotice(null);
      sentinel.addEventListener?.('release', () => {
        if (wakeLockSentinelRef.current === sentinel) {
          wakeLockSentinelRef.current = null;
        }
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
      setWakeLockNotice(
        'El sistema no permitió mantener la pantalla activa (puede deberse a ahorro de batería o permisos).'
      );
    }
  }, [isWakeLockSupported]);

  useEffect(() => {
    if (!runModeEnabled) {
      void releaseWakeLock();
      setWakeLockNotice(null);
      return;
    }

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [runModeEnabled, requestWakeLock, releaseWakeLock]);

  const handleToggleRunMode = () => {
    if (!isWakeLockSupported && !runModeEnabled) {
      setWakeLockNotice(
        'Este navegador no es compatible con mantener la pantalla activa (requiere Chrome Android o Safari 16.4+ en HTTPS).'
      );
      return;
    }
    setRunModeEnabled((prev) => {
      const next = !prev;
      setToast(
        next
          ? 'Modo Correr activado: mantendremos la pantalla encendida.'
          : 'Modo Correr desactivado.'
      );
      return next;
    });
  };

  // Sincronización con Supabase (nube) al abrir
  useEffect(() => {
    loadYouMusicWorkspaceFromCloud()
      .then((merged) => {
        if (merged) setWorkspace(merged);
      })
      .catch(() => {});
  }, []);

  // Recepción automática /youmusic?add=<URL> (desde botón "+ Music" en PC o Compartir en Android)
  useEffect(() => {
    const addUrl = searchParams.get('add')?.trim();
    if (!addUrl || handledMusicAddRef.current === addUrl) return;
    handledMusicAddRef.current = addUrl;

    let cancelled = false;
    setIsAdding(true);
    setErrorMsg(null);
    resolveYouTubePointer(addUrl)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(res.error);
          setSearchParams({}, { replace: true });
          return;
        }
        const customT = searchParams.get('t')?.trim();
        const incoming: YouMusicPointerItem = customT ? { ...res.item, title: customT } : res.item;
        const currentWs = loadYouMusicWorkspace();
        let targetIndex = 0;
        let exists = false;
        const nextWs: YouMusicWorkspace = {
          ...currentWs,
          playlists: currentWs.playlists.map((pl) => {
            if (pl.id !== currentWs.activePlaylistId) return pl;
            const idx = pl.items.findIndex((x) => x.videoId === incoming.videoId);
            if (idx >= 0) {
              targetIndex = idx;
              exists = true;
              return pl;
            }
            targetIndex = pl.items.length;
            return {
              ...pl,
              items: [...pl.items, incoming],
              updatedAt: new Date().toISOString()
            };
          })
        };
        setSharedPlaylist(null);
        setWorkspace(saveYouMusicWorkspace(nextWs));
        setCurrentIndex(targetIndex);
        setSearchParams({}, { replace: true });
        setToast(
          exists
            ? `«${incoming.title}» ya estaba en tu playlist.`
            : `Reproduciendo en YOU MUSIC: «${incoming.title}»`
        );
      })
      .finally(() => {
        if (!cancelled) setIsAdding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  // Soporte de enlaces compartidos (?v=... o ?pl=...&ids=...)
  useEffect(() => {
    const singleVid = searchParams.get('v')?.trim();
    const idsParam = searchParams.get('ids')?.trim();
    const plName = searchParams.get('pl')?.trim() || 'Playlist compartida';

    if (singleVid && /^[A-Za-z0-9_-]{11}$/.test(singleVid)) {
      const item: YouMusicPointerItem = {
        id: `shared-${singleVid}`,
        videoId: singleVid,
        title: searchParams.get('t')?.trim() || `Canción compartida (${singleVid})`,
        author: searchParams.get('a')?.trim() || 'YouTube Oficial',
        thumbnailUrl: `https://i.ytimg.com/vi/${singleVid}/hqdefault.jpg`,
        sourceUrl: `https://www.youtube.com/watch?v=${singleVid}`,
        addedAt: new Date().toISOString()
      };
      setSharedPlaylist({
        id: `shared-v-${singleVid}`,
        name: 'Canción compartida',
        items: [item],
        updatedAt: new Date().toISOString()
      });
      setCurrentIndex(0);
      return;
    }

    if (idsParam) {
      const validIds = idsParam
        .split(',')
        .map((x) => x.trim())
        .filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x))
        .slice(0, 30);
      if (validIds.length > 0) {
        let cancelled = false;
        Promise.all(validIds.map((id) => resolveYouTubePointer(id)))
          .then((resolved) => {
            if (cancelled) return;
            const items = resolved
              .filter((r): r is { ok: true; item: YouMusicPointerItem } => r.ok)
              .map((r) => r.item);
            if (items.length > 0) {
              setSharedPlaylist({
                id: `shared-pl-${Date.now().toString(36)}`,
                name: plName,
                items,
                updatedAt: new Date().toISOString()
              });
              setCurrentIndex(0);
            }
          })
          .catch(() => {});
        return () => {
          cancelled = true;
        };
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const activeOwnPlaylist = useMemo(
    () =>
      workspace.playlists.find((p) => p.id === workspace.activePlaylistId) ||
      workspace.playlists[0],
    [workspace]
  );

  const displayedPlaylist = sharedPlaylist || activeOwnPlaylist;
  const rawItems = useMemo(
    () => displayedPlaylist?.items || [],
    [displayedPlaylist?.items]
  );
  const fallbackCatalogItems = useMemo<YouMusicPointerItem[]>(() => {
    const out: YouMusicPointerItem[] = [];
    for (const ch of ATLAS_MUSIC_CHANNELS) {
      for (const v of ch.videos) {
        if (!v?.videoId) continue;
        out.push({
          id: `ym-fallback-${v.videoId}`,
          videoId: v.videoId,
          title: v.title,
          author: ch.artistLabel || ch.name,
          thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          sourceUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          addedAt: new Date(0).toISOString()
        });
        if (out.length >= 12) return out;
      }
    }
    return out;
  }, []);
  const items = rawItems.length > 0 ? rawItems : fallbackCatalogItems;
  const safeIndex = items.length > 0 ? Math.min(currentIndex, items.length - 1) : 0;
  const currentItem = items[safeIndex] || null;

  const savedMusicalSignalPlaylists = useMemo(
    () => workspace.playlists.filter((p) => p.savedInMusicalSignal),
    [workspace.playlists]
  );

  const syncPlaylistAsSignal = (pl: YouMusicPlaylist) => {
    if (!pl.items.length) return;
    const signalId = `signal-mi-senal-musical-${pl.id.replace(/^pl-/, '')}`;
    const schedule: ScheduleBlock[] = pl.items.map((it, idx) => ({
      id: `${signalId}-blk-${idx}`,
      position: idx,
      startOffsetSec: idx * 240,
      durationSec: 240,
      topic: `Mi Señal Musical · ${pl.name}`,
      role: 'explainer',
      contentItem: {
        id: it.videoId,
        providerId: it.videoId,
        type: 'video',
        provider: 'youtube',
        title: it.title,
        thumbnailUrl: it.thumbnailUrl,
        thumbnail: it.thumbnailUrl,
        videoUrl: it.sourceUrl,
        channelName: it.author,
        channelTitle: it.author,
        channelId: `yt-${it.videoId}`,
        isLive: false,
        isVerified: true
      } as any
    }));
    const musicalSignal: any = {
      id: signalId,
      name: `Mi Señal Musical · ${pl.name}`,
      seedVersion: 5,
      prompt: `Playlist musical guardada desde YOU MUSIC · ${pl.name}`,
      visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      schedule
    };
    setSignal(musicalSignal, { saveToOwn: true });
    void persistSignal(musicalSignal);
  };

  const handleSaveToMiSenalMusical = () => {
    if (!activeOwnPlaylist) return;
    if (activeOwnPlaylist.items.length === 0) {
      setToast('Agregá al menos una canción antes de guardarla en Mi Señal Musical.');
      return;
    }
    const updatedPl: YouMusicPlaylist = {
      ...activeOwnPlaylist,
      savedInMusicalSignal: true,
      updatedAt: new Date().toISOString()
    };
    updateWorkspace((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id === activeOwnPlaylist.id ? updatedPl : pl
      )
    }));
    syncPlaylistAsSignal(updatedPl);
    setToast(`«${updatedPl.name}» guardada en «Mi Señal Musical» (y disponible en Mi Señal).`);
  };

  const handleRemoveFromMiSenalMusical = (plId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id === plId ? { ...pl, savedInMusicalSignal: false } : pl
      )
    }));
    setToast('Quitada de Mi Señal Musical.');
  };

  const [playerVolume, setPlayerVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const playerIframeRef = useRef<HTMLIFrameElement | null>(null);

  const postYouTubeCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = playerIframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com');
    } catch {
      // Ignorar si el iframe todavía no terminó de montar
    }
  }, []);

  const handleVolumeChange = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVol)));
    setPlayerVolume(clamped);
    if (clamped === 0) {
      setIsMuted(true);
      postYouTubeCommand('mute');
      postYouTubeCommand('setVolume', [0]);
    } else {
      setIsMuted(false);
      postYouTubeCommand('unMute');
      postYouTubeCommand('setVolume', [clamped]);
    }
  };

  const handleToggleMute = () => {
    if (isMuted || playerVolume === 0) {
      const restored = playerVolume > 0 ? playerVolume : 80;
      setIsMuted(false);
      setPlayerVolume(restored);
      postYouTubeCommand('unMute');
      postYouTubeCommand('setVolume', [restored]);
    } else {
      setIsMuted(true);
      postYouTubeCommand('mute');
    }
  };

  // URL oficial de YouTube IFrame Player: SIEMPRE pone currentItem.videoId primero
  // para que reproduzca exactamente la canción seleccionada y luego siga con el resto
  const youtubeEmbedSrc = useMemo(() => {
    if (!currentItem) return '';
    const isYtId = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id);
    if (currentItem.videoId.startsWith('vm_')) {
      return `https://player.vimeo.com/video/${encodeURIComponent(currentItem.videoId.replace(/^vm_/, ''))}?autoplay=1&dnt=1&api=1`;
    }
    if (currentItem.videoId.startsWith('ar_')) {
      return `https://archive.org/embed/${encodeURIComponent(currentItem.videoId.replace(/^ar_/, ''))}?autoplay=1`;
    }
    const remainingIds = [
      ...items.slice(safeIndex + 1).map((i) => i.videoId),
      ...items.slice(0, safeIndex).map((i) => i.videoId)
    ]
      .filter((id) => id !== currentItem.videoId && isYtId(id))
      .slice(0, 24);

    const params = new URLSearchParams({
      autoplay: '1',
      controls: '0',
      iv_load_policy: '3',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      enablejsapi: '1'
    });
    if (
      typeof window !== 'undefined' &&
      window.location?.origin &&
      (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
    ) {
      params.set('origin', window.location.origin);
    }
    if (remainingIds.length > 0 && isYtId(currentItem.videoId)) {
      params.set('playlist', [currentItem.videoId, ...remainingIds].join(','));
    }
    return `https://www.youtube.com/embed/${encodeURIComponent(
      currentItem.videoId
    )}?${params.toString().replace(/%2C/gi, ',')}`;
  }, [currentItem, items, safeIndex]);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMusicalSignalOpen, setIsMusicalSignalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useLandscapeAutoFullscreen(true, setIsFullscreen);
  const [isMomentsMosaic, setIsMomentsMosaic] = useState(false);
  const [isYou4Mode, setIsYou4Mode] = useState(false);
  const [you4AudioSlot, setYou4AudioSlot] = useState(0);
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [isAlarmOpen, setIsAlarmOpen] = useState(false);
  const [isOledListenMode, setIsOledListenMode] = useState(false);
  const [alarmState, setAlarmState] = useState<YouMusicAlarmConfig>(() => loadYouMusicAlarm());

  const handleToggleOledListenMode = () => {
    setIsOledListenMode((prev) => {
      const next = !prev;
      if (next) {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
      return next;
    });
  };
  const [castCodeInput, setCastCodeInput] = useState('');
  const [socialGraph, setSocialGraph] = useState<YouAppSocialGraph>(() => loadSocialGraph());
  const [currentVideoMeta, setCurrentVideoMeta] = useState<VideoPublicMeta | null>(null);
  const playerCardRef = useRef<HTMLElement | null>(null);
  const you4IframesRef = useRef<(HTMLIFrameElement | null)[]>([]);

  useEffect(() => {
    const syncGraph = () => setSocialGraph(loadSocialGraph());
    window.addEventListener(SOCIAL_GRAPH_CHANGED_EVENT, syncGraph);
    return () => window.removeEventListener(SOCIAL_GRAPH_CHANGED_EVENT, syncGraph);
  }, []);

  useEffect(() => {
    setIsPlaying(true);
    const vid = currentItem?.videoId;
    if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid)) {
      setCurrentVideoMeta(null);
      return;
    }
    let cancelled = false;
    setCurrentVideoMeta(null);
    fetchYouTubeVideoMeta(vid)
      .then((m) => {
        if (!cancelled) setCurrentVideoMeta(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentItem?.videoId, safeIndex]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('mitv-is-fullscreen', isFullscreen);
    return () => {
      document.body.classList.remove('mitv-is-fullscreen');
    };
  }, [isFullscreen]);

  const handleToggleFullscreen = useCallback(() => {
    const el = playerCardRef.current as any;
    const doc = document as any;
    const nextFs = !isFullscreen;
    setIsFullscreen(nextFs);
    if (nextFs) {
      if (el?.requestFullscreen) {
        void Promise.resolve(el.requestFullscreen()).catch(() => {});
      } else if (el?.webkitRequestFullscreen) {
        try {
          el.webkitRequestFullscreen();
        } catch {
          // ignore
        }
      }
    } else if (doc.fullscreenElement && doc.exitFullscreen) {
      void Promise.resolve(doc.exitFullscreen()).catch(() => {});
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      try {
        doc.webkitExitFullscreen();
      } catch {
        // ignore
      }
    }
  }, [isFullscreen]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      postYouTubeCommand(next ? 'playVideo' : 'pauseVideo');
      usePlayerStore.getState().setIsPlaying(next);
      return next;
    });
  }, [postYouTubeCommand]);

  const handleSeekMusic = useCallback(
    (sec: number) => {
      const targetSec = Math.max(0, sec);
      postYouTubeCommand('seekTo', [targetSec, true]);
      const st = usePlayerStore.getState();
      const dur = st.duration > 0 ? st.duration : 240;
      st.setProgress(Math.min(dur, targetSec), dur);
    },
    [postYouTubeCommand]
  );

  const handleSelectYou4Audio = useCallback((slotIdx: number) => {
    setYou4AudioSlot(slotIdx);
    you4IframesRef.current.forEach((ifr, idx) => {
      try {
        ifr?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: idx === slotIdx ? 'unMute' : 'mute', args: [] }),
          '*'
        );
      } catch {
        // ignore
      }
    });
  }, []);

  const you4Items = useMemo(() => {
    if (items.length === 0) return [];
    const rotated = [...items.slice(safeIndex), ...items.slice(0, safeIndex)];
    return rotated.slice(0, 4);
  }, [items, safeIndex]);

  // Sincronizar YOU MUSIC con usePlayerStore + escucha real de progreso YouTube para la SmartBar
  useEffect(() => {
    if (!currentItem) return;
    const initialDur = 240;
    usePlayerStore.getState().setPlaybackContext({
      currentBlock: {
        blockId: `ym-${currentItem.videoId}`,
        id: currentItem.videoId,
        provider: 'youtube',
        providerContentId: currentItem.videoId,
        providerId: currentItem.videoId,
        title: currentItem.title,
        channelTitle: currentItem.author,
        thumbnailUrl: currentItem.thumbnailUrl,
        durationSec: initialDur,
        url: currentItem.sourceUrl
      } as any,
      creator: currentItem.author,
      signalName: 'YOU MUSIC',
      isLive: false,
      isPlaying: true,
      isMuted,
      playbackState: 'playing',
      currentTime: 0,
      duration: initialDur,
      playerApi: {
        play: async () => {
          postYouTubeCommand('playVideo');
          setIsPlaying(true);
          usePlayerStore.getState().setIsPlaying(true);
        },
        pause: async () => {
          postYouTubeCommand('pauseVideo');
          setIsPlaying(false);
          usePlayerStore.getState().setIsPlaying(false);
        },
        seek: async (sec: number) => handleSeekMusic(sec),
        mute: async () => {
          postYouTubeCommand('mute');
          setIsMuted(true);
          usePlayerStore.getState().setIsMuted(true, true);
        },
        unmute: async () => {
          postYouTubeCommand('unMute');
          setIsMuted(false);
          usePlayerStore.getState().setIsMuted(false, true);
        },
        getDuration: () => usePlayerStore.getState().duration || initialDur
      }
    });

    let lastRealTickAt = 0;
    const onYtMsg = (ev: MessageEvent) => {
      if (!playerIframeRef.current || ev.source !== playerIframeRef.current.contentWindow) return;
      try {
        const payload = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (payload?.event === 'infoDelivery' && payload?.info) {
          const ct = typeof payload.info.currentTime === 'number' ? payload.info.currentTime : null;
          const dur = typeof payload.info.duration === 'number' && payload.info.duration > 0 ? payload.info.duration : null;
          if (ct !== null || dur !== null) {
            lastRealTickAt = Date.now();
            const st = usePlayerStore.getState();
            st.setProgress(ct ?? st.currentTime, dur ?? st.duration);
          }
          if (typeof payload.info.playerState === 'number') {
            const playingNow = payload.info.playerState === 1;
            setIsPlaying(playingNow);
            usePlayerStore.getState().setIsPlaying(playingNow);
          }
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onYtMsg);
    const ping = window.setInterval(() => {
      try {
        playerIframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
          '*'
        );
        const st = usePlayerStore.getState();
        if (st.isPlaying && Date.now() - lastRealTickAt > 2000) {
          const dur = st.duration > 0 ? st.duration : initialDur;
          if (dur > 0) st.setProgress(Math.min(dur, st.currentTime + 1), dur);
        }
      } catch {
        // ignore
      }
    }, 1000);
    return () => {
      window.removeEventListener('message', onYtMsg);
      window.clearInterval(ping);
    };
  }, [currentItem, isMuted, postYouTubeCommand, handleSeekMusic]);

  const handleToggleMusicPiP = useCallback(async () => {
    if (!currentItem) return;
    const androidBridge = (window as any).YouAppAndroidPiP;
    if (androidBridge && typeof androidBridge.enterPiP === 'function') {
      androidBridge.enterPiP();
      return;
    }
    const docPiP = (window as any).documentPictureInPicture;
    if (docPiP && typeof docPiP.requestWindow === 'function') {
      try {
        if (docPiP.window && !docPiP.window.closed) {
          docPiP.window.close();
          return;
        }
        const pipParams = new URLSearchParams({ provider: 'youtube', id: currentItem.videoId });
        const pipWin: Window = await docPiP.requestWindow({ width: 420, height: 245 });
        pipWin.document.title = `${currentItem.title} · YOU MUSIC`;
        pipWin.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;width:100vw;height:100vh;';
        const ifr = pipWin.document.createElement('iframe');
        ifr.src = `${window.location.origin}/pip-frame?${pipParams.toString()}`;
        ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        ifr.allowFullscreen = true;
        ifr.style.cssText = 'border:0;width:100%;height:100%;display:block;';
        pipWin.document.body.appendChild(ifr);
        return;
      } catch {
        // ignore
      }
    }
    setToast('En el APK Android o en PC (Chrome/Edge) activa la ventana flotante del sistema.');
  }, [currentItem]);

  const updateWorkspace = (updater: (prev: YouMusicWorkspace) => YouMusicWorkspace) => {
    setWorkspace((prev) => saveYouMusicWorkspace(updater(prev)));
  };

  const handleAddYouTubeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isAdding) return;
    setErrorMsg(null);
    setIsAdding(true);

    try {
      const res = await resolveYouTubePointer(urlInput);
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }

      const newItem: YouMusicPointerItem = customSongName.trim()
        ? { ...res.item, title: customSongName.trim() }
        : res.item;
      if (sharedPlaylist) {
        setSharedPlaylist(null);
        setSearchParams({}, { replace: true });
      }

      let targetIndex = 0;
      updateWorkspace((prev) => {
        const nextPlaylists = prev.playlists.map((pl) => {
          if (pl.id !== prev.activePlaylistId) return pl;
          const existingIdx = pl.items.findIndex((x) => x.videoId === newItem.videoId);
          if (existingIdx >= 0) {
            targetIndex = existingIdx;
            return pl;
          }
          targetIndex = pl.items.length;
          return {
            ...pl,
            items: [...pl.items, newItem],
            updatedAt: new Date().toISOString()
          };
        });
        return { ...prev, playlists: nextPlaylists };
      });

      setCurrentIndex(targetIndex);
      setUrlInput('');
      setCustomSongName('');
      setToast(`Puntero guardado: «${newItem.title}»`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveItem = (videoId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id !== prev.activePlaylistId
          ? pl
          : {
              ...pl,
              items: pl.items.filter((it) => it.videoId !== videoId),
              updatedAt: new Date().toISOString()
            }
      )
    }));
  };

  const handleMoveItem = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= items.length) return;
    updateWorkspace((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== prev.activePlaylistId) return pl;
        const copy = [...pl.items];
        const [moved] = copy.splice(index, 1);
        copy.splice(nextIdx, 0, moved);
        return { ...pl, items: copy, updatedAt: new Date().toISOString() };
      })
    }));
    if (safeIndex === index) setCurrentIndex(nextIdx);
    else if (safeIndex === nextIdx) setCurrentIndex(index);
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newPlaylistName.trim();
    if (!cleaned) return;
    const newId = `pl-${Date.now().toString(36)}`;
    updateWorkspace((prev) => ({
      activePlaylistId: newId,
      playlists: [
        ...prev.playlists,
        {
          id: newId,
          name: cleaned,
          items: [],
          updatedAt: new Date().toISOString()
        }
      ]
    }));
    setSharedPlaylist(null);
    setSearchParams({}, { replace: true });
    setCurrentIndex(0);
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
    setToast(`Playlist «${cleaned}» creada.`);
  };

  const handleRenamePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = renamePlaylistDraft.trim();
    if (!cleaned || !activeOwnPlaylist) {
      setIsRenamingPlaylist(false);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id === prev.activePlaylistId
          ? { ...pl, name: cleaned, updatedAt: new Date().toISOString() }
          : pl
      )
    }));
    setIsRenamingPlaylist(false);
    setToast(`Playlist renombrada a «${cleaned}».`);
  };

  const handleRenameSong = (e: React.FormEvent, itemId: string) => {
    e.preventDefault();
    const cleaned = editingSongDraft.trim();
    if (!cleaned) {
      setEditingSongId(null);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) =>
        pl.id !== prev.activePlaylistId
          ? pl
          : {
              ...pl,
              items: pl.items.map((it) => (it.id === itemId ? { ...it, title: cleaned } : it)),
              updatedAt: new Date().toISOString()
            }
      )
    }));
    setEditingSongId(null);
    setToast(`Nombre actualizado a «${cleaned}».`);
  };

  const handleDeleteActivePlaylist = () => {
    if (!activeOwnPlaylist || workspace.playlists.length <= 1) return;
    const removedName = activeOwnPlaylist.name;
    updateWorkspace((prev) => {
      const remaining = prev.playlists.filter((p) => p.id !== prev.activePlaylistId);
      return {
        playlists: remaining,
        activePlaylistId: remaining[0]?.id || prev.activePlaylistId
      };
    });
    setCurrentIndex(0);
    setToast(`Playlist «${removedName}» eliminada.`);
  };

  const handleSaveSharedPlaylist = () => {
    if (!sharedPlaylist) return;
    const savedId = `pl-${Date.now().toString(36)}`;
    updateWorkspace((prev) => ({
      activePlaylistId: savedId,
      playlists: [
        ...prev.playlists,
        {
          ...sharedPlaylist,
          id: savedId,
          updatedAt: new Date().toISOString()
        }
      ]
    }));
    setSharedPlaylist(null);
    setSearchParams({}, { replace: true });
    setToast(`«${sharedPlaylist.name}» guardada en tus playlists.`);
  };

  const handleShare = async (kind: 'song' | 'playlist') => {
    if (kind === 'song' && currentItem) {
      const url = buildSingleSongShareUrl(currentItem);
      await shareContentUniversal({
        title: `${currentItem.title} · Tu señal musical`,
        text: 'Tu señal musical',
        url,
        thumbnailUrl: currentItem.thumbnailUrl,
        subtitle: currentItem.author,
        badge: 'TU SEÑAL MUSICAL'
      });
      return;
    }

    if (kind === 'playlist' && displayedPlaylist && displayedPlaylist.items.length > 0) {
      const url = buildPlaylistShareUrl(displayedPlaylist);
      await shareContentUniversal({
        title: `${displayedPlaylist.name} · Tu señal musical`,
        text: 'Tu señal musical',
        url,
        thumbnailUrl: displayedPlaylist.items[0]?.thumbnailUrl,
        subtitle: `${displayedPlaylist.items.length} canciones`,
        badge: 'TU SEÑAL MUSICAL'
      });
    }
  };

  const ambientThumbUrl =
    currentItem?.thumbnailUrl || savedMusicalSignalPlaylists[0]?.items[0]?.thumbnailUrl || '';

  return (
    <div className="ymv1-page">
      {/* Fondo atmosférico difuminado estilo cristal Apple */}
      <div
        className="ymv1-ambient-bg"
        aria-hidden="true"
        style={ambientThumbUrl ? { backgroundImage: `url(${ambientThumbUrl})` } : undefined}
      />
      <div className="ymv1-ambient-veil" aria-hidden="true" />

      {/* Cabecera minimalista Apple Glass */}
      <header className="ymv1-header">
        <div className="ymv1-header-left">
          <button
            type="button"
            className="ymv1-logo-btn"
            onClick={() => navigate('/misenal1')}
            title="Volver a Mi Señal"
          >
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="ymv1-pill-brand">YOU MUSIC</span>
        </div>

        <nav className="ymv1-nav">
          <button type="button" className="ymv1-nav-btn" onClick={() => navigate('/misenal1')}>
            MI SEÑAL
          </button>
          <button type="button" className="ymv1-nav-btn" onClick={() => navigate('/mitv')}>
            MITV
          </button>
          <button type="button" className="ymv1-nav-btn" onClick={() => navigate('/reels')}>
            REELS
          </button>
          <button type="button" className="ymv1-nav-btn" onClick={() => navigate('/lecturas')}>
            LECTURAS
          </button>
          <button type="button" className="ymv1-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button
            type="button"
            className="ymv1-nav-btn"
            onClick={() => navigate('/search')}
            title="Buscar en YOUAPP"
            aria-label="Buscar"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px' }}
          >
            <Search size={16} />
          </button>
        </nav>

        <TvUserSessionMenu variant="glass" />
      </header>

      <main className="ymv1-main">
        {toast && (
          <div className="ymv1-toast" role="status">
            <Check size={14} />
            <span>{toast}</span>
          </div>
        )}

        {sharedPlaylist && (
          <div className="ymv1-shared-bar">
            <span>
              <Sparkles size={14} color="#0071e3" />
              <strong>{sharedPlaylist.name}</strong> ({sharedPlaylist.items.length}{' '}
              {sharedPlaylist.items.length === 1 ? 'canción' : 'canciones'})
            </span>
            <div className="ymv1-shared-actions">
              <button
                type="button"
                className="ymv1-btn-primary"
                onClick={handleSaveSharedPlaylist}
              >
                <Plus size={14} /> Guardar en mis playlists
              </button>
              <button
                type="button"
                className="ymv1-btn-secondary"
                onClick={() => {
                  setSharedPlaylist(null);
                  setSearchParams({}, { replace: true });
                  setCurrentIndex(0);
                }}
              >
                Volver a mi playlist
              </button>
            </div>
          </div>
        )}

        <audio ref={liveRadioAudioRef} preload="none" style={{ display: 'none' }} />

        {/* RADIOS FM/AM EN VIVO (rescatadas de YouDial · 1 fila deslizable) */}
        <section className="ymv1-radios-strip" aria-label="Radios en vivo">
          <span className="ymv1-radios-label">
            <Radio size={13} color="#34d399" />
            <span>Radios</span>
          </span>
          {STARTER_AUDIO_PRESETS.map((r) => {
            const isPlayingThis = activeRadioUrl === r.streamUrl;
            return (
              <button
                key={r.streamUrl}
                type="button"
                className={`ymv1-radio-chip ${isPlayingThis ? 'is-live' : ''}`}
                onClick={() => handleToggleLiveRadio(r.streamUrl, r.author)}
              >
                <span className="ymv1-radio-dot" />
                <span>{r.author}</span>
                <span className="ymv1-radio-state">{isPlayingThis ? '⏹' : '▶'}</span>
              </button>
            );
          })}
        </section>

        {/* 0. BARRA SUTIL DESPLEGABLE ARRIBA: MI SEÑAL MUSICAL (igual que MiTV) */}
        <section
          className={`ymv1-ms-collapsible ${isMusicalSignalOpen ? 'is-open' : ''}`}
          aria-label="Mi Señal Musical"
        >
          <button
            type="button"
            className="ymv1-ms-toggle"
            onClick={() => setIsMusicalSignalOpen((v) => !v)}
            aria-expanded={isMusicalSignalOpen}
          >
            <span className="ymv1-ms-toggle-left">
              <Radio size={13} color="#64d2ff" />
              <strong>Mi Señal Musical</strong>
              <span className="ymv1-ms-toggle-count">
                · Sumar URL · Modo Correr{runModeEnabled ? ' (ON)' : ''} · {savedMusicalSignalPlaylists.length}
              </span>
            </span>
            <ChevronDown
              size={15}
              style={{
                transition: 'transform 0.18s ease',
                transform: isMusicalSignalOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                opacity: 0.75
              }}
            />
          </button>

          {isMusicalSignalOpen && (
            <div className="ymv1-ms-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              {/* Sumar canción por URL */}
              <div className="ymv1-add-card" aria-label="Agregar canción desde YouTube" style={{ margin: 0 }}>
                <form className="ymv1-add-form" onSubmit={handleAddYouTubeUrl}>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="+ Pegá una URL de YouTube (Queen, Soda Stereo, León Gieco, Beatles…)"
                    aria-label="Pegar enlace de YouTube"
                  />
                  <button type="submit" className="ymv1-add-submit" disabled={isAdding}>
                    <Plus size={14} />
                    <span>{isAdding ? 'Sumando…' : 'Sumar'}</span>
                  </button>
                  <a
                    ref={musicBookmarkletRef}
                    href="#music-bookmarklet"
                    className="ymv1-bookmarklet-pill"
                    onClick={(e) => {
                      e.preventDefault();
                      setToast(
                        'Arrastrá «+ Music» a tu barra de marcadores para sumar canciones en 1 clic desde YouTube.'
                      );
                    }}
                    title="Arrastrá este botón a tu barra de marcadores para sumar canciones desde YouTube en 1 clic"
                  >
                    <Plus size={12} /> Music
                  </a>
                </form>
                {errorMsg && <div className="ymv1-error">{errorMsg}</div>}
              </div>

              {/* Modo Correr (Screen Wake Lock) */}
              <div className="ymv1-run-card" aria-label="Modo Correr" style={{ margin: 0 }}>
                <div className="ymv1-run-info">
                  <span className={`ymv1-run-icon ${wakeLockActive ? 'active' : ''}`}>
                    <Smartphone size={16} />
                  </span>
                  <div className="ymv1-run-text">
                    <div className="ymv1-run-title-row">
                      <strong>Modo Correr · Mantener pantalla encendida</strong>
                      <span className="ymv1-run-tag">V1</span>
                    </div>
                    <span>
                      {wakeLockNotice
                        ? wakeLockNotice
                        : wakeLockActive
                          ? 'Pantalla activa mientras YOU MUSIC siga visible · Puede aumentar el consumo de batería.'
                          : 'Evita el bloqueo automático cuando es compatible · Puede aumentar el consumo de batería.'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className={`ymv1-run-toggle ${runModeEnabled ? 'active' : ''}`}
                  onClick={handleToggleRunMode}
                  aria-pressed={runModeEnabled}
                  title={
                    runModeEnabled
                      ? 'Desactivar Modo Correr'
                      : 'Activar Modo Correr para mantener la pantalla encendida'
                  }
                >
                  <span className="ymv1-run-dot" />
                  <span>{runModeEnabled ? (wakeLockActive ? 'Activado' : 'En espera') : 'Activar'}</span>
                </button>
              </div>

              {savedMusicalSignalPlaylists.length === 0 ? (
                <div className="ymv1-empty" style={{ padding: '14px 12px' }}>
                  <Radio size={20} color="#0071e3" />
                  <strong>Todavía no guardaste ninguna señal musical.</strong>
                  <span>
                    Armá tu playlist abajo y tocá <strong>Guardar en Mi Señal Musical</strong>.
                  </span>
                </div>
              ) : (
                <div className="ymv1-ms-grid">
                  {savedMusicalSignalPlaylists.map((pl) => {
                    const coverThumb = pl.items[0]?.thumbnailUrl;
                    const signalId = `signal-mi-senal-musical-${pl.id.replace(/^pl-/, '')}`;
                    return (
                      <div key={pl.id} className="ymv1-ms-item">
                        <div
                          className="ymv1-ms-cover"
                          style={coverThumb ? { backgroundImage: `url(${coverThumb})` } : undefined}
                          onClick={() => {
                            setSharedPlaylist(null);
                            setSearchParams({}, { replace: true });
                            updateWorkspace((prev) => ({ ...prev, activePlaylistId: pl.id }));
                            setCurrentIndex(0);
                            setIsMusicalSignalOpen(false);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSharedPlaylist(null);
                              updateWorkspace((prev) => ({ ...prev, activePlaylistId: pl.id }));
                              setCurrentIndex(0);
                              setIsMusicalSignalOpen(false);
                            }
                          }}
                        >
                          <span className="ymv1-ms-play-chip">
                            <Play size={13} fill="#ffffff" color="#ffffff" /> Escuchar
                          </span>
                        </div>
                        <div className="ymv1-ms-body">
                          <strong>{pl.name}</strong>
                          <span>
                            {pl.items.length} {pl.items.length === 1 ? 'canción' : 'canciones'}
                          </span>
                          <div className="ymv1-ms-actions">
                            <button
                              type="button"
                              className="ymv1-pill-btn"
                              onClick={() => {
                                syncPlaylistAsSignal(pl);
                                navigate(`/misenal1?signal=${encodeURIComponent(signalId)}`);
                              }}
                              title="Abrir esta señal musical en Mi Señal"
                            >
                              <Tv size={12} /> Abrir en Mi Señal
                            </button>
                            <button
                              type="button"
                              className="ymv1-icon-btn"
                              onClick={() => handleRemoveFromMiSenalMusical(pl.id)}
                              title="Quitar de Mi Señal Musical"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 1. ARRIBA DE TODO: REPRODUCTOR IDÉNTICO A MITV (1 PANTALLA / MOMENTOS 4x / YOU4 + BARRA APPLE 3 PUNTOS) */}
        {currentItem && (
          <section
            ref={playerCardRef}
            className={`ymv1-player-card ${isFullscreen ? 'is-expanded' : ''} ${
              isOledListenMode ? 'is-oled-listen' : ''
            }`}
          >
            {isOledListenMode && (
              <div className="ymv1-oled-top">
                <span className="ymv1-oled-status">
                  <span className={`ymv1-oled-dot ${wakeLockActive ? 'is-live' : ''}`} />
                  {wakeLockActive ? 'Modo OLED · Pantalla activa' : 'Modo OLED · Ahorro de batería'}
                </span>
                <button
                  type="button"
                  className="ymv1-oled-exit"
                  onClick={handleToggleOledListenMode}
                >
                  <X size={14} /> Salir
                </button>
              </div>
            )}
            {isMomentsMosaic ? (
              (() => {
                const dur = Math.max(60, usePlayerStore.getState().duration || 240);
                const labels = ['Inicio clave', 'Desarrollo', 'Punto central', 'Cierre'];
                const ratios = [0.1, 0.35, 0.62, 0.85];
                const quadMoments: VideoMoment[] = ratios.map((ratio, idx) => ({
                  id: `ym-m-${idx}-${currentItem.videoId}`,
                  contentKey: currentItem.videoId,
                  startSec: Math.floor(dur * ratio),
                  title: labels[idx],
                  summary: labels[idx],
                  type: 'key_point',
                  confidence: 0.85,
                  source: 'fallback'
                }));
                const mosaicBlock: ScheduleBlock = {
                  id: currentItem.videoId,
                  position: 0,
                  startOffsetSec: 0,
                  durationSec: dur,
                  topic: currentItem.title,
                  role: 'explainer',
                  contentItem: {
                    id: currentItem.videoId,
                    providerId: currentItem.videoId,
                    type: 'video',
                    provider: 'youtube',
                    title: currentItem.title,
                    videoUrl: currentItem.sourceUrl,
                    thumbnailUrl: currentItem.thumbnailUrl,
                    channelName: currentItem.author,
                    channelTitle: currentItem.author
                  } as any
                };
                return (
                  <div className="ymv1-video-wrap">
                    <MosaicPlayerGrid
                      moments={quadMoments}
                      currentBlock={mosaicBlock}
                      thumbnailFallbackUrl={currentItem.thumbnailUrl}
                      isPlaying={isPlaying}
                      onSelect={(m) => {
                        setIsMomentsMosaic(false);
                        window.setTimeout(() => handleSeekMusic(m.startSec), 450);
                      }}
                    />
                  </div>
                );
              })()
            ) : isYou4Mode && you4Items.length > 1 ? (
              <div className="ymv1-you4-grid">
                {you4Items.map((vid, idx) => (
                  <div
                    key={vid.videoId}
                    className={`ymv1-you4-cell ${you4AudioSlot === idx ? 'active-audio' : ''}`}
                  >
                    <iframe
                      ref={(el) => {
                        you4IframesRef.current[idx] = el;
                      }}
                      src={`https://www.youtube.com/embed/${vid.videoId}?autoplay=1&mute=${idx === you4AudioSlot ? 0 : 1}&controls=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                      title={vid.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                    <button
                      type="button"
                      className="ymv1-you4-audio-pill"
                      onClick={() => handleSelectYou4Audio(idx)}
                      title={you4AudioSlot === idx ? 'Audio activo' : 'Activar audio aquí'}
                    >
                      {you4AudioSlot === idx ? <Volume2 size={12} /> : <VolumeX size={12} />}
                      <span>{vid.title.slice(0, 18)}</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ymv1-video-wrap">
                <iframe
                  ref={playerIframeRef}
                  key={`${displayedPlaylist?.id || 'pl'}-${currentItem.videoId}-${safeIndex}`}
                  title={`YouTube · ${currentItem.title}`}
                  src={youtubeEmbedSrc}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  onLoad={() => {
                    playerIframeRef.current?.contentWindow?.postMessage(
                      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                      '*'
                    );
                    window.setTimeout(() => {
                      if (isMuted || playerVolume === 0) {
                        postYouTubeCommand('mute');
                      } else {
                        postYouTubeCommand('unMute');
                        postYouTubeCommand('setVolume', [playerVolume]);
                      }
                    }, 450);
                  }}
                />
              </div>
            )}

            {isFullscreen && (
              <button
                type="button"
                className="ymv1-fs-exit-btn"
                onClick={handleToggleFullscreen}
                title="Salir de pantalla completa"
                aria-label="Salir de pantalla completa"
              >
                <Minimize2 size={15} />
                <span>Salir</span>
              </button>
            )}

            {/* ENCABEZADO + SMARTBAR DESPLEGABLES CON BOTÓN BLANCO + PUNTO ROJO ATLAS */}
            <PlayerControlsDrawer
              quickSaveItem={{
                id: currentItem.id || currentItem.videoId,
                videoId: currentItem.videoId,
                title: currentItem.title,
                author: currentItem.author,
                thumbnailUrl: currentItem.thumbnailUrl,
                sourceUrl: currentItem.sourceUrl,
                provider: 'youtube',
                sourceHint: 'music'
              }}
            >
            <div className="ymv1-now-bar ymv1-now-bar--mitv">
              {(() => {
                const likeKey = `youtube:${currentItem.videoId}`;
                const followKey = `ch:${currentItem.author}`;
                const isLiked = socialGraph.likedVideoKeys.includes(likeKey);
                const likeCount = Number(socialGraph.likeCounts?.[likeKey] ?? (isLiked ? 1 : 0));
                const isFollowed = socialGraph.followedSignalIds.includes(followKey);
                const ytSubUrl = buildYouTubeSubscribeUrl({ sourceUrl: currentItem.sourceUrl });
                const vLabel = formatCompactViews(currentVideoMeta?.viewCount ?? null, currentVideoMeta?.isLive);
                const dLabel = formatPublishedDateEs(currentVideoMeta?.publishedAt || undefined);
                return (
                  <>
                    <div className="ymv1-top-meta-row">
                      <span className="ymv1-live-pill">EN PANTALLA</span>
                      <div className="ymv1-top-left-icons">
                        <button
                          type="button"
                          className={`ymv1-top-icon-btn ${likeCount > 0 ? 'has-count' : ''} ${isLiked ? 'is-liked' : ''}`}
                          onClick={() => {
                            setSocialGraph((prev) => {
                              const res = toggleLikeVideoWithMeta(prev, {
                                key: likeKey,
                                title: currentItem.title,
                                author: currentItem.author,
                                thumbnailUrl: currentItem.thumbnailUrl,
                                sourceUrl: currentItem.sourceUrl
                              });
                              setToast(
                                res.active
                                  ? `❤️ Me gusta (${res.count}) guardado en Mis Listas.`
                                  : 'Me gusta quitado.'
                              );
                              return res.graph;
                            });
                          }}
                          title={isLiked ? `Te gusta (${likeCount})` : 'Me gusta en YOUAPP'}
                          aria-label="Me gusta"
                        >
                          <Heart size={14} fill={isLiked ? '#ff375f' : 'none'} strokeWidth={2.1} />
                          {likeCount > 0 && <span className="ymv1-like-count">{likeCount}</span>}
                        </button>
                        <button
                          type="button"
                          className={`ymv1-top-icon-btn ${isFollowed ? 'is-subbed' : ''}`}
                          onClick={() => {
                            const willSub = !isFollowed;
                            setSocialGraph((prev) =>
                              toggleFollowCreatorWithMeta(prev, {
                                key: followKey,
                                name: currentItem.author,
                                provider: 'youtube',
                                sourceUrl: currentItem.sourceUrl
                              }).graph
                            );
                            if (willSub && ytSubUrl) {
                              window.open(ytSubUrl, 'youapp_yt_sub', 'width=540,height=660,noopener,noreferrer');
                              setToast(`Siguiendo a «${currentItem.author}» en YOUAPP.`);
                            } else {
                              setToast(willSub ? `Siguiendo a «${currentItem.author}».` : `Dejaste de seguir a «${currentItem.author}».`);
                            }
                          }}
                          title={isFollowed ? 'Siguiendo' : 'Suscribirse'}
                          aria-label={isFollowed ? 'Siguiendo' : 'Suscribirse'}
                        >
                          {isFollowed ? <UserCheck size={15} strokeWidth={2.2} /> : <UserPlus size={15} strokeWidth={2.1} />}
                        </button>
                      </div>

                      <div className="ymv1-top-right-icons">
                        <button
                          type="button"
                          className={`ymv1-top-icon-btn ${isOledListenMode ? 'is-subbed' : ''}`}
                          onClick={handleToggleOledListenMode}
                          title="Modo OLED (pantalla negra de bajo consumo mientras escuchás)"
                          aria-label="Modo OLED ahorro de pantalla"
                        >
                          <Moon size={14} />
                        </button>
                        <button
                          type="button"
                          className={`ymv1-top-icon-btn ${alarmState.enabled ? 'is-subbed' : ''}`}
                          onClick={() => setIsAlarmOpen(true)}
                          title={
                            alarmState.enabled
                              ? `Despertador activo (${alarmState.time})`
                              : 'Despertador musical'
                          }
                          aria-label="Despertador musical"
                          style={
                            alarmState.enabled
                              ? {
                                  width: 'auto',
                                  padding: '0 8px',
                                  gap: 4,
                                  color: '#fcd34d',
                                  borderColor: 'rgba(245, 158, 11, 0.55)',
                                  background: 'rgba(245, 158, 11, 0.16)'
                                }
                              : undefined
                          }
                        >
                          <AlarmClock size={14} />
                          {alarmState.enabled && (
                            <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {alarmState.time}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="ymv1-top-icon-btn"
                          onClick={() => void handleShare('song')}
                          title="Compartir esta canción"
                          aria-label="Compartir esta canción"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="ymv1-top-icon-btn"
                          onClick={() => void handleToggleMusicPiP()}
                          title="Ventana flotante (Picture-in-Picture)"
                          aria-label="Ventana flotante (Picture-in-Picture)"
                        >
                          <PictureInPicture2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="ymv1-top-icon-btn"
                          onClick={handleToggleFullscreen}
                          title={isFullscreen ? 'Salir de pantalla completa' : 'Agrandar pantalla'}
                          aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Agrandar pantalla'}
                        >
                          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="ymv1-now-meta">
                      <strong>{currentItem.title}</strong>
                      <span>
                        {currentItem.author}
                        {vLabel ? ` · ${vLabel}` : ''}
                        {dLabel ? ` · ${dLabel}` : ''}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* BARRA INTELIGENTE UNIFICADA IDÉNTICA A MITV (Bocina en timeline + 3 puntos Apple + ⏮ ▶ ⏭ + ⋯) */}
            <div className="ymv1-smartbar-slot" style={{ position: 'relative' }}>
              {isCastOpen && (
                <div className="ymv1-cast-popover" role="dialog" aria-label="Transmitir YOU MUSIC">
                  <div className="ymv1-cast-head">Transmitir a dispositivo</div>
                  <button
                    type="button"
                    className="ymv1-cast-opt"
                    onClick={() => {
                      setIsCastOpen(false);
                      void handleShare('song');
                    }}
                  >
                    <Cast size={14} color="#64d2ff" />
                    <span>Enviar / Compartir a TV o dispositivo</span>
                  </button>
                  <form
                    className="ymv1-cast-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!castCodeInput.trim()) return;
                      setIsCastOpen(false);
                      setToast(`Conectando con TV código ${castCodeInput.trim()}…`);
                    }}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={castCodeInput}
                      onChange={(e) => setCastCodeInput(e.target.value)}
                      placeholder="Código de TV (ej. 4829)"
                    />
                    <button type="submit">Conectar</button>
                  </form>
                </div>
              )}

              <SmartBar
                unifiedAppleMode
                isPlaying={isPlaying}
                onPlayPause={handleTogglePlay}
                onSeek={handleSeekMusic}
                isMosaic={isMomentsMosaic}
                onToggleMosaic={() => {
                  setIsYou4Mode(false);
                  setIsMomentsMosaic((prev) => {
                    const next = !prev;
                    if (next && !isFullscreen) handleToggleFullscreen();
                    return next;
                  });
                }}
                isYou4={isYou4Mode}
                onToggleYou4={() => {
                  setIsMomentsMosaic(false);
                  setIsYou4Mode((prev) => {
                    const next = !prev;
                    setYou4AudioSlot(0);
                    if (next && !isFullscreen) handleToggleFullscreen();
                    return next;
                  });
                }}
                isCasting={isCastOpen}
                onToggleCast={() => setIsCastOpen((v) => !v)}
                isMutedExternal={isMuted || playerVolume === 0}
                onToggleMuteExternal={handleToggleMute}
                onNextBlock={items.length > 1 ? () => setCurrentIndex((prev) => (prev + 1) % items.length) : undefined}
                onPreviousBlock={items.length > 1 ? () => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length) : undefined}
                currentIndex={safeIndex}
                totalItems={items.length}
              />
            </div>
            </PlayerControlsDrawer>

            {isOledListenMode && (
              <div className="ymv1-oled-bottom">
                <div className="ymv1-oled-track">
                  <strong>{currentItem.title}</strong>
                  <span>{currentItem.author}</span>
                </div>
                <div className="ymv1-oled-controls">
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="ymv1-oled-ctrl-btn"
                      onClick={() => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)}
                      aria-label="Anterior"
                    >
                      <SkipBack size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ymv1-oled-ctrl-btn is-main"
                    onClick={handleTogglePlay}
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="ymv1-oled-ctrl-btn"
                      onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
                      aria-label="Siguiente"
                    >
                      <SkipForward size={18} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 3. SELECTOR DE PLAYLISTS + MI PLAYLIST */}
        <section className="ymv1-playlist-card">
          <div className="ymv1-pl-top">
            <div className="ymv1-pl-tabs" role="tablist" aria-label="Mis playlists">
              {workspace.playlists.map((pl) => {
                const isSelected = !sharedPlaylist && pl.id === activeOwnPlaylist?.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    className={`ymv1-pl-tab ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSharedPlaylist(null);
                      setSearchParams({}, { replace: true });
                      updateWorkspace((prev) => ({ ...prev, activePlaylistId: pl.id }));
                      setCurrentIndex(0);
                    }}
                  >
                    <ListMusic size={13} />
                    <span>{pl.name}</span>
                    <em>{pl.items.length}</em>
                  </button>
                );
              })}

              <button
                type="button"
                className="ymv1-pl-new-btn"
                onClick={() => setIsCreatingPlaylist((v) => !v)}
              >
                <Plus size={13} /> Nueva lista
              </button>
            </div>

            {items.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {!sharedPlaylist && (
                  <button
                    type="button"
                    className="ymv1-icon-btn"
                    onClick={handleSaveToMiSenalMusical}
                    title={
                      activeOwnPlaylist?.savedInMusicalSignal
                        ? 'Actualizar en Mi Señal Musical'
                        : 'Guardar en Mi Señal Musical'
                    }
                    aria-label={
                      activeOwnPlaylist?.savedInMusicalSignal
                        ? 'Actualizar en Mi Señal Musical'
                        : 'Guardar en Mi Señal Musical'
                    }
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '999px',
                      color: '#ffffff'
                    }}
                  >
                    <Bookmark
                      size={15}
                      fill={activeOwnPlaylist?.savedInMusicalSignal ? '#ffffff' : 'none'}
                      strokeWidth={2.1}
                    />
                  </button>
                )}
                <button
                  type="button"
                  className="ymv1-icon-btn"
                  onClick={() => void handleShare('playlist')}
                  title="Compartir playlist"
                  aria-label="Compartir playlist"
                  style={{ width: 32, height: 32, borderRadius: '999px' }}
                >
                  <Share2 size={14} />
                </button>
              </div>
            )}
          </div>

          {isCreatingPlaylist && (
            <form className="ymv1-new-pl-form" onSubmit={handleCreatePlaylist}>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Nombre de tu playlist (ej. Rock Nacional, Folklore, Clásicos…)"
                autoFocus
              />
              <button type="submit" className="ymv1-btn-primary">
                Crear
              </button>
            </form>
          )}

          <div className="ymv1-pl-header">
            {isRenamingPlaylist && !sharedPlaylist ? (
              <form className="ymv1-inline-rename" onSubmit={handleRenamePlaylist}>
                <input
                  type="text"
                  value={renamePlaylistDraft}
                  onChange={(e) => setRenamePlaylistDraft(e.target.value)}
                  placeholder="Nombre de la playlist…"
                  autoFocus
                />
                <button type="submit" className="ymv1-icon-btn" title="Guardar nombre">
                  <Check size={15} color="#0071e3" />
                </button>
                <button
                  type="button"
                  className="ymv1-icon-btn"
                  onClick={() => setIsRenamingPlaylist(false)}
                  title="Cancelar"
                >
                  <X size={15} />
                </button>
              </form>
            ) : (
              <div className="ymv1-pl-title-wrap">
                <h2
                  onClick={() => {
                    if (sharedPlaylist) return;
                    setRenamePlaylistDraft(displayedPlaylist?.name || 'Mi playlist');
                    setIsRenamingPlaylist(true);
                  }}
                  style={{ cursor: sharedPlaylist ? 'default' : 'pointer' }}
                  title={sharedPlaylist ? undefined : 'Clic para cambiar el nombre de la playlist'}
                >
                  {displayedPlaylist?.name || 'Mi playlist'}
                </h2>
                {!sharedPlaylist && (
                  <>
                    <button
                      type="button"
                      className="ymv1-icon-btn"
                      onClick={() => {
                        setRenamePlaylistDraft(displayedPlaylist?.name || 'Mi playlist');
                        setIsRenamingPlaylist(true);
                      }}
                      title="Cambiar nombre de la playlist"
                    >
                      <Pencil size={13} />
                    </button>
                    {workspace.playlists.length > 1 && (
                      <button
                        type="button"
                        className="ymv1-icon-btn"
                        onClick={handleDeleteActivePlaylist}
                        title="Eliminar esta playlist"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            <span>
              {items.length} {items.length === 1 ? 'canción' : 'canciones'}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="ymv1-empty">
              <Music size={28} color="#86868b" />
              <strong>Tu lista aparecerá acá cuando pegues el primer enlace.</strong>
              <span>
                Buscá cualquier canción en YouTube, copiá la URL y pegala arriba para empezar a
                escuchar.
              </span>
            </div>
          ) : (
            <div className="ymv1-list">
              {items.slice(0, playlistVisibleCount).map((item, idx) => {
                const isPlayingRow = idx === safeIndex;
                return (
                  <div
                    key={item.id}
                    className={`ymv1-row ${isPlayingRow ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      className="ymv1-thumb-btn"
                      onClick={() => setCurrentIndex(idx)}
                      aria-label={`Reproducir ${item.title}`}
                    >
                      <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                      <span className="ymv1-thumb-play">
                        <Play size={13} fill="#ffffff" color="#ffffff" />
                      </span>
                    </button>

                    {editingSongId === item.id && !sharedPlaylist ? (
                      <form
                        className="ymv1-inline-rename"
                        style={{ flex: 1 }}
                        onSubmit={(e) => handleRenameSong(e, item.id)}
                      >
                        <input
                          type="text"
                          value={editingSongDraft}
                          onChange={(e) => setEditingSongDraft(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="ymv1-icon-btn" title="Guardar nombre">
                          <Check size={14} color="#0071e3" />
                        </button>
                        <button
                          type="button"
                          className="ymv1-icon-btn"
                          onClick={() => setEditingSongId(null)}
                          title="Cancelar"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <div
                        className="ymv1-row-meta"
                        onClick={() => setCurrentIndex(idx)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setCurrentIndex(idx);
                          }
                        }}
                      >
                        <strong>{item.title}</strong>
                        <span>
                          {item.author} · {isPlayingRow ? 'Reproduciendo ahora' : `#${idx + 1}`}
                        </span>
                      </div>
                    )}

                    {!sharedPlaylist && (
                      <div className="ymv1-row-actions">
                        <button
                          type="button"
                          className="ymv1-icon-btn"
                          onClick={() => {
                            setEditingSongId(item.id);
                            setEditingSongDraft(item.title);
                          }}
                          title="Cambiar nombre de la canción"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="ymv1-icon-btn"
                          disabled={idx === 0}
                          onClick={() => handleMoveItem(idx, -1)}
                          title="Subir"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="ymv1-icon-btn"
                          disabled={idx === items.length - 1}
                          onClick={() => handleMoveItem(idx, 1)}
                          title="Bajar"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="ymv1-icon-btn"
                          onClick={() => handleRemoveItem(item.videoId)}
                          title="Quitar de la playlist"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length > playlistVisibleCount && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                  <button
                    type="button"
                    className="ymv1-atlas-genre-chip active"
                    onClick={() => setPlaylistVisibleCount((n) => n + 50)}
                  >
                    Ver 50 más ({Math.min(playlistVisibleCount, items.length)} de {items.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* CATÁLOGO AUTOMÁTICO ATLAS — CANALES MUSICALES EN VIVO DESDE SUPABASE `youapp_index` */}
        {(ATLAS_MUSIC_CHANNELS.length > 0 || cloudAtlasChannels.length > 0) && (
          <section className="ymv1-atlas-section" aria-label="Canales musicales descubiertos por ATLAS">
            <div className="ymv1-atlas-head">
              <div>
                <div className="ymv1-atlas-eyebrow">
                  <Sparkles size={12} /> CATÁLOGO MUSICAL YOUAPP
                </div>
                <h2>Canales musicales</h2>
                <p>
                  Explorá artistas por género y sumalos a tu <strong>Señal Musical</strong> en un toque.
                </p>
              </div>
              <div className="ymv1-atlas-genres" role="tablist" aria-label="Filtrar por género musical">
                <input
                  type="search"
                  value={atlasSearchQuery}
                  onChange={(e) => {
                    setAtlasSearchQuery(e.target.value);
                    setAtlasVisibleCount(24);
                  }}
                  placeholder="Filtrar artista o banda…"
                  aria-label="Filtrar canales musicales"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontSize: 12,
                    minWidth: 170,
                    outline: 'none'
                  }}
                />
                {ATLAS_GENRES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={atlasGenreFilter === g}
                    className={`ymv1-atlas-genre-chip ${atlasGenreFilter === g ? 'active' : ''}`}
                    onClick={() => {
                      setAtlasGenreFilter(g);
                      setAtlasVisibleCount(24);
                    }}
                  >
                    {g}
                  </button>
                ))}
                <button
                  type="button"
                  className="ymv1-atlas-genre-chip active"
                  onClick={handleAddAllFilteredAtlasToMusicSignal}
                  title={`Sumar los ${filteredAtlasChannels.length} canales visibles a tu Señal Musical activa`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <Plus size={13} /> Sumar todos ({filteredAtlasChannels.length})
                </button>
              </div>
            </div>

            <div className="ymv1-atlas-grid">
              {visibleAtlasChannels.map((ch) => (
                <article key={ch.channelId} className="ymv1-atlas-card">
                  <div className="ymv1-atlas-card-top">
                    <img src={ch.thumbnail} alt={ch.name} className="ymv1-atlas-cover" loading="lazy" />
                    <div className="ymv1-atlas-card-title">
                      <span className="ymv1-atlas-badge">{ch.genre}</span>
                      <h3>{ch.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <a
                          href={ch.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ymv1-atlas-ext"
                          title="Abrir canal oficial en YouTube"
                        >
                          Canal oficial <ExternalLink size={11} />
                        </a>
                        <button
                          type="button"
                          className="ymv1-atlas-vid-add"
                          onClick={() => handleAddAtlasChannelToMusicSignal(ch)}
                          title="Sumar los 3 temas de este canal a tu Señal Musical activa"
                        >
                          <Plus size={11} /> Sumar canal
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="ymv1-atlas-videos">
                    {ch.videos.slice(0, 3).map((vid) => (
                      <div key={vid.videoId} className="ymv1-atlas-vid-row">
                        <button
                          type="button"
                          className="ymv1-atlas-vid-play"
                          onClick={() => handlePlayAtlasMusicVideo(vid, ch.name)}
                          title={`Escuchar «${vid.title}» en YOU MUSIC`}
                        >
                          <Play size={12} fill="currentColor" />
                          <span>{vid.title}</span>
                        </button>
                        <button
                          type="button"
                          className="ymv1-atlas-vid-add"
                          onClick={() => handleAddSingleAtlasVideoToMusicSignal(vid, ch.name)}
                          title="Sumar este tema a tu Señal Musical activa"
                        >
                          <Plus size={12} /> Señal Musical
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {(cloudAtlasHasMore || (cloudAtlasChannels.length === 0 && filteredAtlasChannels.length > atlasVisibleCount)) && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                <button
                  type="button"
                  disabled={cloudAtlasLoading}
                  className="ymv1-atlas-genre-chip active"
                  onClick={() => {
                    if (cloudAtlasChannels.length > 0) {
                      void fetchCloudAtlasPage({
                        reset: false,
                        genre: atlasGenreFilter,
                        search: atlasSearchQuery
                      });
                    } else {
                      setAtlasVisibleCount((n) => n + 24);
                    }
                  }}
                >
                  {cloudAtlasLoading
                    ? 'Cargando más artistas…'
                    : cloudAtlasChannels.length > 0
                    ? `Ver más artistas (${visibleAtlasChannels.length})`
                    : `Ver más artistas (${visibleAtlasChannels.length} de ${filteredAtlasChannels.length})`}
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <YouMusicAlarmController
        isOpen={isAlarmOpen}
        onClose={() => setIsAlarmOpen(false)}
        currentTrack={
          currentItem
            ? {
                videoId: currentItem.videoId,
                title: currentItem.title,
                author: currentItem.author,
                thumbnailUrl: currentItem.thumbnailUrl
              }
            : null
        }
        queueTracks={items.map((it) => ({
          videoId: it.videoId,
          title: it.title,
          author: it.author,
          thumbnailUrl: it.thumbnailUrl
        }))}
        wakeLockActive={wakeLockActive}
        onRequestWakeLock={requestWakeLock}
        onReleaseWakeLock={releaseWakeLock}
        onPauseForSleep={() => {
          setIsPlaying(false);
          postYouTubeCommand('pauseVideo');
        }}
        onTriggerPlayTrack={(track) => {
          const idx = items.findIndex((it) => it.videoId === track.videoId);
          if (idx >= 0) {
            setCurrentIndex(idx);
          } else {
            setSharedPlaylist({
              id: `alarm-${track.videoId}`,
              name: 'Despertador YouMusic',
              items: [
                {
                  id: `alarm-item-${track.videoId}`,
                  videoId: track.videoId,
                  title: track.title,
                  author: track.author,
                  thumbnailUrl: `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
                  sourceUrl: `https://www.youtube.com/watch?v=${track.videoId}`,
                  addedAt: new Date().toISOString()
                }
              ],
              updatedAt: new Date().toISOString()
            });
            setCurrentIndex(0);
          }
          setIsPlaying(true);
          window.setTimeout(() => {
            postYouTubeCommand('unMute');
            postYouTubeCommand('playVideo');
          }, 350);
        }}
        onSetVolume={handleVolumeChange}
        onAlarmStateChange={setAlarmState}
        onToast={setToast}
      />

      <style>{`
        .ymv1-page {
          position: relative;
          min-height: 100dvh;
          background: #14161a;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          padding-bottom: 56px;
          overflow-x: hidden;
          isolation: isolate;
        }
        .ymv1-atlas-section {
          margin-top: 28px;
          padding: 20px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ymv1-atlas-head {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: flex-end;
          gap: 14px;
        }
        .ymv1-atlas-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #64d2ff;
          margin-bottom: 4px;
        }
        .ymv1-atlas-head h2 {
          margin: 0 0 4px;
          font-size: 20px;
          color: #ffffff;
        }
        .ymv1-atlas-head p {
          margin: 0;
          font-size: 12.8px;
          color: rgba(245, 245, 247, 0.72);
          max-width: 640px;
        }
        .ymv1-atlas-genres {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ymv1-atlas-genre-chip {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.85);
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ymv1-atlas-genre-chip.active,
        .ymv1-atlas-genre-chip:hover {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .ymv1-atlas-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
        }
        .ymv1-atlas-card {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ymv1-atlas-card-top {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .ymv1-atlas-cover {
          width: 78px;
          height: 52px;
          border-radius: 10px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .ymv1-atlas-card-title {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ymv1-atlas-badge {
          align-self: flex-start;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(100, 210, 255, 0.18);
          color: #8ee0ff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .ymv1-atlas-card-title h3 {
          margin: 0;
          font-size: 14.5px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymv1-atlas-ext {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
          text-decoration: none;
        }
        .ymv1-atlas-ext:hover {
          color: #64d2ff;
        }
        .ymv1-atlas-videos {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ymv1-atlas-vid-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ymv1-atlas-vid-play {
          flex: 1;
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #f5f5f7;
          font-size: 12px;
          text-align: left;
          cursor: pointer;
        }
        .ymv1-atlas-vid-play:hover {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(100, 210, 255, 0.45);
        }
        .ymv1-atlas-vid-play span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymv1-atlas-vid-add {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 6px 9px;
          border-radius: 10px;
          border: 1px solid rgba(100, 210, 255, 0.42);
          background: rgba(0, 113, 227, 0.25);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
        }
        .ymv1-atlas-vid-add:hover {
          background: #0071e3;
          color: #ffffff;
        }
        .ymv1-ambient-bg {
          position: fixed;
          inset: -24px;
          z-index: 0;
          background-color: #1c1e24;
          background-image:
            radial-gradient(ellipse 42% 46% at 24% 20%, rgba(214, 224, 238, 0.52) 0%, transparent 62%),
            radial-gradient(ellipse 44% 46% at 76% 32%, rgba(92, 134, 184, 0.44) 0%, transparent 64%),
            radial-gradient(ellipse 50% 42% at 50% 88%, rgba(164, 174, 188, 0.42) 0%, transparent 65%),
            linear-gradient(155deg, #161920 0%, #232a36 48%, #15181e 100%);
          background-size: cover;
          background-position: center;
          filter: blur(22px) brightness(0.76);
          transform: scale(1.06) translateZ(0);
          contain: strict;
          pointer-events: none;
        }
        .ymv1-ambient-veil {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: linear-gradient(
            180deg,
            rgba(18, 20, 24, 0.36) 0%,
            rgba(22, 24, 28, 0.24) 48%,
            rgba(14, 16, 20, 0.46) 100%
          );
          pointer-events: none;
        }
        .ymv1-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 22px;
          background: rgba(24, 26, 30, 0.42);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ymv1-header-left, .ymv1-nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ymv1-logo-btn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
        }
        .ymv1-pill-brand {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.28);
          padding: 3px 9px;
          border-radius: 999px;
        }
        .ymv1-nav-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ymv1-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .ymv1-main {
          position: relative;
          z-index: 1;
          max-width: 820px;
          margin: 0 auto;
          padding: 22px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .ymv1-toast {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(28, 28, 30, 0.78);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 600;
          align-self: flex-start;
        }
        .ymv1-shared-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px 16px;
          border-radius: 18px;
          background: rgba(10, 132, 255, 0.18);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(100, 210, 255, 0.34);
          font-size: 13px;
          color: #f5f5f7;
        }
        .ymv1-shared-bar span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ymv1-shared-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        /* Paneles translúcidos Apple Glass sobre fondo atmosférico difuminado */
        .ymv1-add-card, .ymv1-player-card, .ymv1-playlist-card, .ymv1-musical-signal-card, .ymv1-run-card {
          position: relative;
          color: #f5f5f7;
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.16) 0%,
            rgba(255, 255, 255, 0.10) 100%
          );
          backdrop-filter: blur(28px) saturate(165%);
          -webkit-backdrop-filter: blur(28px) saturate(165%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 22px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.26),
            0 12px 32px rgba(0, 0, 0, 0.22);
        }
        .ymv1-run-card {
          padding: 13px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ymv1-run-info {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
          flex: 1;
        }
        .ymv1-run-icon {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.24);
          color: #f5f5f7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ymv1-run-icon.active {
          background: rgba(48, 209, 88, 0.22);
          border-color: rgba(48, 209, 88, 0.58);
          color: #30d158;
        }
        .ymv1-run-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .ymv1-run-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .ymv1-run-title-row strong {
          font-size: 14px;
          font-weight: 650;
          color: #ffffff;
        }
        .ymv1-run-tag {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.2);
          border: 1px solid rgba(100, 210, 255, 0.34);
          padding: 1px 7px;
          border-radius: 999px;
        }
        .ymv1-run-text > span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.76);
        }
        .ymv1-run-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 15px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .ymv1-run-toggle:hover {
          background: rgba(255, 255, 255, 0.22);
        }
        .ymv1-run-toggle.active {
          background: rgba(48, 209, 88, 0.24);
          border-color: rgba(48, 209, 88, 0.65);
          color: #d7ffe1;
        }
        .ymv1-run-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.55);
        }
        .ymv1-run-toggle.active .ymv1-run-dot {
          background: #30d158;
          box-shadow: 0 0 8px rgba(48, 209, 88, 0.9);
        }
        .ymv1-add-card {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ymv1-add-form {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
        }
        .ymv1-add-form input {
          flex: 1;
          min-width: 0;
          padding: 6px 12px;
          border-radius: 999px;
          border: none;
          background: transparent;
          font-size: 13px;
          color: #f5f5f7;
          outline: none;
        }
        .ymv1-add-form input::placeholder {
          color: rgba(245, 245, 247, 0.56);
        }
        .ymv1-add-form input:focus {
          background: rgba(255, 255, 255, 0.08);
        }
        .ymv1-add-submit {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .ymv1-add-submit:hover:not(:disabled) {
          background: #0071e3;
          border-color: #0a84ff;
        }
        .ymv1-new-pl-form input {
          flex: 1;
          min-width: 220px;
          padding: 11px 16px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
          font-size: 14px;
          color: #1d1d1f;
          outline: none;
        }
        .ymv1-new-pl-form input:focus {
          background: #ffffff;
          border-color: #0a84ff;
          box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.28);
        }
        .ymv1-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: #0071e3;
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 6px 18px rgba(0, 113, 227, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.24);
        }
        .ymv1-btn-primary:hover:not(:disabled) {
          background: #0a84ff;
        }
        .ymv1-bookmarklet-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 11px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.26);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          cursor: grab;
          white-space: nowrap;
        }
        .ymv1-bookmarklet-pill:hover {
          background: #0071e3;
        }
        .ymv1-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.26);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .ymv1-error {
          padding: 9px 12px;
          border-radius: 12px;
          background: rgba(255, 69, 58, 0.2);
          border: 1px solid rgba(255, 69, 58, 0.4);
          color: #ffd3d0;
          font-size: 12.5px;
          font-weight: 600;
        }
        .ymv1-ms-collapsible {
          border-radius: 14px;
          background: rgba(16, 20, 30, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          overflow: hidden;
        }
        .ymv1-ms-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 14px;
          background: transparent;
          border: 0;
          color: rgba(245, 245, 247, 0.9);
          font-size: 12.5px;
          cursor: pointer;
        }
        .ymv1-ms-toggle:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .ymv1-ms-toggle-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .ymv1-ms-toggle-count {
          font-size: 11.5px;
          color: rgba(235, 240, 255, 0.58);
          font-weight: 500;
        }
        .ymv1-ms-panel {
          padding: 0 12px 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ymv1-player-card {
          overflow: visible;
          position: relative;
        }
        .ymv1-player-card.is-expanded {
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
        .ymv1-player-card.is-expanded .ymv1-video-wrap,
        .ymv1-player-card.is-expanded .ymv1-you4-grid {
          flex: 1;
          width: 100%;
          height: 100%;
          aspect-ratio: auto !important;
          border-radius: 0 !important;
        }
        .ymv1-player-card.is-expanded .ymv1-now-bar,
        .ymv1-player-card.is-expanded .ymv1-smartbar-slot {
          display: none !important;
        }
        .ymv1-player-card.is-oled-listen {
          position: fixed !important;
          inset: 0 !important;
          z-index: 12500 !important;
          margin: 0 !important;
          border-radius: 0 !important;
          border: none !important;
          background: #000000 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: max(18px, env(safe-area-inset-top)) 18px max(26px, env(safe-area-inset-bottom)) !important;
        }
        .ymv1-player-card.is-oled-listen .yapp-pcd-root {
          display: none !important;
        }
        .ymv1-player-card.is-oled-listen .ymv1-video-wrap {
          width: min(100%, 380px) !important;
          min-height: 214px !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          opacity: 0.42 !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          transition: opacity 0.2s ease;
        }
        .ymv1-player-card.is-oled-listen .ymv1-video-wrap:active {
          opacity: 0.9 !important;
        }
        .ymv1-oled-top {
          width: 100%;
          max-width: 440px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ymv1-oled-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          color: rgba(226, 232, 240, 0.55);
        }
        .ymv1-oled-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #64748b;
        }
        .ymv1-oled-dot.is-live {
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }
        .ymv1-oled-exit {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(248, 250, 252, 0.78);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ymv1-oled-bottom {
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
        }
        .ymv1-oled-track {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 100%;
        }
        .ymv1-oled-track strong {
          font-size: 15px;
          font-weight: 700;
          color: rgba(248, 250, 252, 0.72);
        }
        .ymv1-oled-track span {
          font-size: 12.5px;
          color: rgba(148, 163, 184, 0.6);
        }
        .ymv1-oled-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
        }
        .ymv1-oled-ctrl-btn {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(248, 250, 252, 0.78);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ymv1-oled-ctrl-btn.is-main {
          width: 56px;
          height: 56px;
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
        .ymv1-fs-exit-btn {
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
        .ymv1-video-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
          border-radius: 18px 18px 0 0;
          overflow: hidden;
        }
        .ymv1-you4-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 2px;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
          border-radius: 18px 18px 0 0;
          overflow: hidden;
        }
        .ymv1-you4-cell {
          position: relative;
          width: 100%;
          height: 100%;
          background: #05070c;
          overflow: hidden;
        }
        .ymv1-you4-cell iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        .ymv1-you4-cell.active-audio {
          outline: 2px solid #0a84ff;
          outline-offset: -2px;
        }
        .ymv1-you4-audio-pill {
          position: absolute;
          left: 8px;
          bottom: 8px;
          z-index: 4;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(10, 14, 22, 0.82);
          color: #ffffff;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
        }
        .ymv1-now-bar--mitv {
          flex-direction: column;
          align-items: stretch !important;
          gap: 8px !important;
          padding: 12px 14px 8px !important;
        }
        .ymv1-top-meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .ymv1-live-pill {
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.22);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #93d5ff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .ymv1-top-left-icons,
        .ymv1-top-right-icons {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ymv1-top-right-icons {
          margin-left: auto;
        }
        .ymv1-top-icon-btn {
          min-width: 28px;
          height: 28px;
          padding: 0 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #f5f5f7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
          font-size: 11.5px;
          font-weight: 700;
        }
        .ymv1-top-icon-btn.is-liked {
          background: rgba(255, 55, 95, 0.22);
          border-color: rgba(255, 100, 130, 0.6);
          color: #ff6b8b;
        }
        .ymv1-top-icon-btn.is-subbed {
          background: rgba(10, 132, 255, 0.28);
          border-color: rgba(100, 210, 255, 0.62);
          color: #93d5ff;
        }
        .ymv1-smartbar-slot {
          padding: 0 12px 12px;
        }
        /* Adaptación Apple Glass oscuro idéntica a MiTV */
        .ymv1-smartbar-slot .bv-root {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 8px 24px rgba(0, 0, 0, 0.18);
          color: #f5f5f7;
        }
        .ymv1-smartbar-slot .bv-compact-btn,
        .ymv1-smartbar-slot .bv-more-btn,
        .ymv1-smartbar-slot .bv-native-ctrl-btn,
        .ymv1-smartbar-slot .bv-step-btn,
        .ymv1-smartbar-slot .bv-icon-btn,
        .ymv1-smartbar-slot .bv-moment-chip,
        .ymv1-smartbar-slot .bv-saved-toggle-btn,
        .ymv1-smartbar-slot .bv-save-moment-btn,
        .ymv1-smartbar-slot .bv-follow-btn {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.24);
          color: #f5f5f7;
        }
        .ymv1-smartbar-slot .bv-compact-btn:hover,
        .ymv1-smartbar-slot .bv-more-btn:hover,
        .ymv1-smartbar-slot .bv-native-ctrl-btn:hover,
        .ymv1-smartbar-slot .bv-step-btn:hover:not(:disabled),
        .ymv1-smartbar-slot .bv-icon-btn:hover,
        .ymv1-smartbar-slot .bv-moment-chip:hover,
        .ymv1-smartbar-slot .bv-saved-toggle-btn:hover,
        .ymv1-smartbar-slot .bv-save-moment-btn:hover,
        .ymv1-smartbar-slot .bv-follow-btn:hover {
          background: rgba(255, 255, 255, 0.24);
          border-color: rgba(255, 255, 255, 0.42);
          color: #ffffff;
        }
        .ymv1-smartbar-slot .bv-compact-btn.active,
        .ymv1-smartbar-slot .bv-more-btn.active,
        .ymv1-smartbar-slot .bv-saved-toggle-btn.open {
          background: rgba(255, 255, 255, 0.92);
          border-color: #ffffff;
          color: #1d1d1f;
        }
        .ymv1-smartbar-slot .bv-compact-btn.primary {
          background: #0071e3;
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
        .ymv1-smartbar-slot .bv-native-scrub-row {
          border-bottom-color: rgba(255, 255, 255, 0.14);
        }
        .ymv1-smartbar-slot .bv-mono-time,
        .ymv1-smartbar-slot .bv-tl-time,
        .ymv1-smartbar-slot .bv-signal-line strong,
        .ymv1-smartbar-slot .bv-saved-meta strong,
        .ymv1-smartbar-slot .bv-saved-drawer-head {
          color: #ffffff;
        }
        .ymv1-smartbar-slot .bv-mono-time.muted,
        .ymv1-smartbar-slot .bv-signal-sub,
        .ymv1-smartbar-slot .bv-saved-meta span,
        .ymv1-smartbar-slot .bv-saved-drawer-sub,
        .ymv1-smartbar-slot .bv-saved-empty,
        .ymv1-smartbar-slot .bv-share-head,
        .ymv1-smartbar-slot .bv-share-origin {
          color: rgba(245, 245, 247, 0.74);
        }
        .ymv1-smartbar-slot .bv-share-menu,
        .ymv1-smartbar-slot .bv-saved-drawer {
          background: rgba(22, 24, 30, 0.86);
          backdrop-filter: blur(26px) saturate(180%);
          -webkit-backdrop-filter: blur(26px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
          color: #f5f5f7;
        }
        .ymv1-smartbar-slot .bv-more-item,
        .ymv1-smartbar-slot .bv-share-item {
          color: #f5f5f7;
        }
        .ymv1-smartbar-slot .bv-more-item:hover,
        .ymv1-smartbar-slot .bv-share-item:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #64d2ff;
        }
        .ymv1-smartbar-slot .bv-share-divider {
          background: rgba(255, 255, 255, 0.14);
        }
        .ymv1-smartbar-slot .bv-saved-item {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.16);
        }
        .ymv1-smartbar-slot .bv-signal-hairline {
          background: rgba(255, 255, 255, 0.16);
        }
        .ymv1-cast-popover {
          position: absolute;
          left: 12px;
          bottom: calc(100% + 8px);
          z-index: 90;
          width: 260px;
          padding: 12px;
          border-radius: 16px;
          background: rgba(16, 20, 30, 0.97);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ymv1-cast-head {
          font-size: 12px;
          font-weight: 700;
          color: rgba(245, 245, 247, 0.78);
        }
        .ymv1-cast-opt {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ymv1-cast-form {
          display: flex;
          gap: 6px;
        }
        .ymv1-cast-form input {
          flex: 1;
          min-width: 0;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
        }
        .ymv1-cast-form button {
          padding: 6px 10px;
          border-radius: 8px;
          border: 0;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ymv1-video-wrap iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        .ymv1-now-bar {
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ymv1-now-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ymv1-now-meta strong {
          font-size: 15px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymv1-now-meta span {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
        }
        .ymv1-now-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ymv1-ctrl-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.36);
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ymv1-ctrl-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .ymv1-vol-control {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px 4px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }
        .ymv1-vol-icon-btn, .ymv1-vol-step-btn {
          border: none;
          background: transparent;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
        }
        .ymv1-vol-icon-btn:hover, .ymv1-vol-step-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .ymv1-vol-slider {
          width: 72px;
          accent-color: #0a84ff;
          cursor: pointer;
        }
        .ymv1-vol-pct {
          font-size: 11px;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.85);
          min-width: 30px;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .ymv1-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.38);
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }
        .ymv1-pill-btn:hover {
          background: rgba(255, 255, 255, 0.28);
        }
        .ymv1-playlist-card {
          padding: 16px 20px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ymv1-pl-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ymv1-pl-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ymv1-pl-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.88);
          font-size: 12.5px;
          font-weight: 620;
          cursor: pointer;
        }
        .ymv1-pl-tab.active {
          background: rgba(255, 255, 255, 0.92);
          color: #1d1d1f;
          border-color: #ffffff;
        }
        .ymv1-pl-tab em {
          font-style: normal;
          opacity: 0.75;
          font-size: 11px;
        }
        .ymv1-pl-new-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px dashed rgba(255, 255, 255, 0.55);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .ymv1-new-pl-form {
          display: flex;
          gap: 8px;
        }
        .ymv1-pl-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-top: 4px;
        }
        .ymv1-pl-title-wrap {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        .ymv1-inline-rename {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .ymv1-inline-rename input {
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid #0071e3;
          background: #ffffff;
          font-size: 14px;
          font-weight: 600;
          color: #1d1d1f;
          outline: none;
          min-width: 180px;
          flex: 1;
        }
        .ymv1-pl-header h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 720;
          color: #ffffff;
        }
        .ymv1-pl-header span {
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 600;
        }
        .ymv1-empty {
          padding: 36px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: rgba(255, 255, 255, 0.8);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.34);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }
        .ymv1-empty strong {
          color: #ffffff;
          font-size: 14px;
        }
        .ymv1-empty span {
          font-size: 12.5px;
          max-width: 420px;
        }
        .ymv1-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .ymv1-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .ymv1-row.active {
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.52);
        }
        .ymv1-thumb-btn {
          position: relative;
          width: 68px;
          height: 44px;
          border-radius: 9px;
          border: none;
          padding: 0;
          overflow: hidden;
          background: #000;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ymv1-thumb-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ymv1-thumb-play {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ymv1-row-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          cursor: pointer;
        }
        .ymv1-row-meta strong {
          font-size: 13.5px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymv1-row-meta span {
          font-size: 11.5px;
          color: rgba(255, 255, 255, 0.76);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymv1-row-actions {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .ymv1-icon-btn {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.82);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ymv1-icon-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }
        .ymv1-icon-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .ymv1-musical-signal-card {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .ymv1-ms-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ymv1-ms-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ymv1-ms-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.07em;
          color: #64d2ff;
        }
        .ymv1-ms-title h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 680;
          color: #ffffff;
        }
        .ymv1-ms-count {
          font-size: 12px;
          font-weight: 600;
          color: #f5f5f7;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.22);
          padding: 4px 10px;
          border-radius: 999px;
        }
        .ymv1-ms-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 12px;
        }
        .ymv1-ms-item {
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.11);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 8px 20px rgba(0, 0, 0, 0.16);
          display: flex;
          flex-direction: column;
        }
        .ymv1-ms-cover {
          height: 112px;
          background: linear-gradient(135deg, #1d1d1f 0%, #0071e3 100%);
          background-size: cover;
          background-position: center;
          position: relative;
          display: flex;
          align-items: flex-end;
          padding: 10px;
          cursor: pointer;
        }
        .ymv1-ms-play-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.72);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 650;
        }
        .ymv1-ms-body {
          padding: 11px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ymv1-ms-body strong {
          font-size: 14px;
          color: #ffffff;
        }
        .ymv1-ms-body span {
          font-size: 11.5px;
          color: rgba(255, 255, 255, 0.78);
        }
        .ymv1-ms-actions {
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .ymv1-radios-strip {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 7px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
          padding: 2px 0;
        }
        .ymv1-radios-strip::-webkit-scrollbar {
          display: none;
        }
        .ymv1-radios-label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          font-weight: 750;
          color: rgba(245, 245, 247, 0.78);
          flex-shrink: 0;
          padding-right: 2px;
        }
        .ymv1-radio-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          white-space: nowrap;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(16, 20, 30, 0.72);
          color: rgba(245, 245, 247, 0.9);
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .ymv1-radio-chip.is-live {
          background: rgba(22, 163, 74, 0.28);
          border-color: rgba(52, 211, 153, 0.7);
          color: #ffffff;
        }
        .ymv1-radio-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #34d399;
        }
        .ymv1-radio-state {
          font-size: 10px;
          opacity: 0.8;
        }
        @media (max-width: 680px) {
          .ymv1-nav {
            display: none;
          }
          .ymv1-add-form {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
