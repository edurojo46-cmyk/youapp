import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Tv,
  Play,
  Search,
  Radio,
  Music,
  Film,
  Bookmark,
  BookOpen,
  Trash2,
  Share2,
  ChevronDown,
  Users,
  Link2,
  RefreshCw,
  Globe,
  ExternalLink,
  Star
} from 'lucide-react';
import { type UniversalChannel } from '../lib/universalChannels';
import { useStore } from '../store/useStore';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import {
  loadYouReelsWorkspace,
  saveYouReelsWorkspace,
  type YouReelsWorkspace
} from '../lib/tv/youReelsStore';
import {
  SOCIAL_GRAPH_CHANGED_EVENT,
  loadSocialGraph,
  toggleFollowCreatorWithMeta,
  updateFollowedCreatorPlatforms,
  type CreatorPlatformLinks,
  type YouAppSocialGraph
} from '../lib/tv/youappSocialStore';
import {
  fetchFollowedCreatorsFeed,
  type FollowedFeedItem
} from '../lib/tv/subscriptionsFeedService';
import {
  loadYouMusicWorkspace,
  saveYouMusicWorkspace,
  type YouMusicWorkspace
} from '../lib/tv/youMusicPlaylistStore';
import {
  loadLecturasWorkspace,
  saveLecturasWorkspace,
  type LecturasWorkspace
} from '../lib/tv/youLecturasStore';
import {
  loadMiTvWorkspace,
  saveMiTvWorkspace,
  OFFICIAL_LIVE_TV_CHANNEL_ID,
  type MiTvWorkspace
} from '../lib/tv/miTvStore';
import { useSignalStore } from '../lib/tv/signalStore';
import { listSwitchableSignals, type UserSignalSummary } from '../lib/tv/associationsService';
import { loadCloudBranding } from '../lib/tv/signalPersistence';
import {
  CompleteSignalShareCard,
  type CompleteSignalVisualData
} from '../components/tv/CompleteSignalShareCard';
import { AtlasBuildSignalBox } from '../components/tv/AtlasBuildSignalBox';
import {
  FAVORITE_SIGNALS_CHANGED_EVENT,
  SIGNALS_100_CATALOG,
  SIGNALS_100_THEMES,
  findSignal100ById,
  loadFavoriteSignalIds,
  toggleFavoriteSignalId,
  type Signal100ThemeId
} from '../lib/tv/signals100Catalog';
import { findCuratedSignalById } from '../lib/tv/curatedSignalsCatalog';
import { supabase } from '../lib/supabase';

type SignalBrandingEntry = {
  avatarDataUrl?: string;
  coverDataUrl?: string;
};

type VaultFilter = 'all' | 'videos' | 'music' | 'reels' | 'lecturas' | 'senales' | 'siguiendo';

interface VaultEntry {
  id: string;
  kind: 'video' | 'mitv' | 'music' | 'reel' | 'lectura';
  badge: string;
  title: string;
  subtitle: string;
  thumb: string;
  timestamp: number;
  shareUrl: string;
  onOpen: () => void;
  onDelete: () => void;
}

function readLocalSignalBranding(): Record<string, SignalBrandingEntry> {
  try {
    const raw = localStorage.getItem('youapp_signal_branding_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function MyLists() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<VaultFilter>('all');
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedChannels, setSavedChannels] = useState<UniversalChannel[]>([]);
  const [userSignals, setUserSignals] = useState<UserSignalSummary[]>([]);
  const [signalBranding, setSignalBranding] = useState<Record<string, SignalBrandingEntry>>(() =>
    readLocalSignalBranding()
  );

  const { savedContent, unsaveContent } = useStore();
  const activeSignal = useSignalStore((s) => s.activeSignal);
  const savedSignalsById = useSignalStore((s) => s.savedSignalsById);
  const [autoSignalThumbs, setAutoSignalThumbs] = useState<Record<string, string>>({});

  const [reelsWorkspace, setReelsWorkspace] = useState<YouReelsWorkspace>(() => loadYouReelsWorkspace());
  const [musicWorkspace, setMusicWorkspace] = useState<YouMusicWorkspace>(() => loadYouMusicWorkspace());
  const [lecturasWorkspace, setLecturasWorkspace] = useState<LecturasWorkspace>(() => loadLecturasWorkspace());
  const [mitvWorkspace, setMitvWorkspace] = useState<MiTvWorkspace>(() => loadMiTvWorkspace());
  const [socialGraph, setSocialGraph] = useState<YouAppSocialGraph>(() => loadSocialGraph());

  useEffect(() => {
    const onSocialChange = () => setSocialGraph(loadSocialGraph());
    window.addEventListener(SOCIAL_GRAPH_CHANGED_EVENT, onSocialChange);
    return () => window.removeEventListener(SOCIAL_GRAPH_CHANGED_EVENT, onSocialChange);
  }, []);

  const followedCreators = useMemo(
    () => socialGraph.followedCreatorsMeta || [],
    [socialGraph.followedCreatorsMeta]
  );

  const [followedFeed, setFollowedFeed] = useState<FollowedFeedItem[]>([]);
  const [followedFeedLoading, setFollowedFeedLoading] = useState(false);
  const [followedFeedNonce, setFollowedFeedNonce] = useState(0);
  const [editingPlatformsKey, setEditingPlatformsKey] = useState<string | null>(null);
  const [platformsDraft, setPlatformsDraft] = useState<CreatorPlatformLinks>({});
  const [signal100Theme, setSignal100Theme] = useState<'all' | 'favorites' | Signal100ThemeId>('all');
  const [signal100Query, setSignal100Query] = useState('');
  const [favoriteSignalIds, setFavoriteSignalIds] = useState<string[]>(() => loadFavoriteSignalIds());

  useEffect(() => {
    const syncFavs = () => setFavoriteSignalIds(loadFavoriteSignalIds());
    window.addEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
    return () => window.removeEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
  }, []);

  const filtered100Signals = useMemo(() => {
    const q = signal100Query.trim().toLowerCase();
    return SIGNALS_100_CATALOG.filter((s) => {
      if (signal100Theme === 'favorites' && !favoriteSignalIds.includes(s.id)) return false;
      if (signal100Theme !== 'all' && signal100Theme !== 'favorites' && s.theme !== signal100Theme) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.videos.some((v) => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q))
      );
    });
  }, [signal100Theme, signal100Query, favoriteSignalIds]);

  useEffect(() => {
    if (filter !== 'siguiendo' || followedCreators.length === 0) {
      if (followedCreators.length === 0) setFollowedFeed([]);
      return;
    }
    let cancelled = false;
    setFollowedFeedLoading(true);
    fetchFollowedCreatorsFeed(followedCreators, 28)
      .then((items) => {
        if (!cancelled) setFollowedFeed(items);
      })
      .catch(() => {
        if (!cancelled) setFollowedFeed([]);
      })
      .finally(() => {
        if (!cancelled) setFollowedFeedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, followedCreators, followedFeedNonce]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('youapp_saved_custom_channels');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSavedChannels(parsed);
      }
    } catch {
      // ignore storage errors
    }

    let active = true;
    void listSwitchableSignals()
      .then((list) => {
        if (active && Array.isArray(list)) setUserSignals(list);
      })
      .catch(() => {});

    void loadCloudBranding()
      .then((cloudMap) => {
        if (!active || !cloudMap || Object.keys(cloudMap).length === 0) return;
        setSignalBranding((prev) => ({ ...cloudMap, ...prev }));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Resolver miniaturas reales (US$ 0) para señales propias que no tienen portada subida manualmente
  const getLocalSignalThumb = (sig: UserSignalSummary): string => {
    const branding = signalBranding[sig.id] || signalBranding[sig.clientSignalId] || {};
    if (branding.coverDataUrl) return branding.coverDataUrl;
    if (branding.avatarDataUrl) return branding.avatarDataUrl;

    const stored =
      savedSignalsById?.[sig.id] ||
      savedSignalsById?.[sig.clientSignalId] ||
      (activeSignal && (activeSignal.id === sig.id || activeSignal.id === sig.clientSignalId)
        ? activeSignal
        : null);
    const firstItem = stored?.schedule?.[0]?.contentItem as
      | { thumbnailUrl?: string; thumbnail?: string; providerId?: string; id?: string }
      | undefined;
    if (firstItem?.thumbnailUrl) return firstItem.thumbnailUrl;
    if (firstItem?.thumbnail) return firstItem.thumbnail;
    const ytId = firstItem?.providerId || firstItem?.id || '';
    if (/^[A-Za-z0-9_-]{11}$/.test(ytId)) {
      return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    }

    const curated = findCuratedSignalById(sig.id) || findCuratedSignalById(sig.name);
    if (curated?.coverVideoId) {
      return `https://i.ytimg.com/vi/${curated.coverVideoId}/hqdefault.jpg`;
    }
    const cat100 = findSignal100ById(sig.id) || findSignal100ById(sig.name);
    if (cat100?.coverVideoId) {
      return `https://i.ytimg.com/vi/${cat100.coverVideoId}/hqdefault.jpg`;
    }
    return '';
  };

  useEffect(() => {
    if (userSignals.length === 0) return;
    const missing = userSignals.filter((s) => !getLocalSignalThumb(s) && !autoSignalThumbs[s.id]);
    if (missing.length === 0) return;

    let cancelled = false;
    const fetchThumbs = async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        missing.slice(0, 20).map(async (sig) => {
          const rawSeed = `${sig.name || ''} ${sig.mainTopic || ''} ${sig.prompt || ''}`
            .replace(/[,%()✦·•]/g, ' ')
            .replace(/\b(mi|senal|señal|canal|tv|youapp|de|la|el|los|las|y|en|para)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const keyword = rawSeed.split(' ').filter((w) => w.length >= 3).slice(0, 2).join(' ') || sig.name;
          if (!keyword || keyword.length < 2) return;
          try {
            const { data } = await supabase
              .from('youapp_index')
              .select('video_id,thumbnail_url')
              .eq('provider', 'youtube')
              .or(`title.ilike.%${keyword}%,creator_name.ilike.%${keyword}%`)
              .limit(3);
            const first = Array.isArray(data) ? data.find((r) => r?.video_id) : null;
            if (first?.video_id) {
              const vid = String(first.video_id).trim();
              next[sig.id] =
                String(first.thumbnail_url || '') || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
            }
          } catch {
            // silent
          }
        })
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setAutoSignalThumbs((prev) => ({ ...prev, ...next }));
      }
    };
    void fetchThumbs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSignals, savedSignalsById, signalBranding]);

  const handlePlayChannel = (channel: UniversalChannel) => {
    localStorage.setItem('youapp_tune_channel_payload', JSON.stringify(channel));
    localStorage.setItem('youapp_active_channel_id', channel.id);
    navigate('/live');
  };

  // BÓVEDA UNIFICADA: Todo lo que guardaste en YOUAPP (sin Me gusta ni Momentos)
  const allVaultEntries = useMemo<VaultEntry[]>(() => {
    const out: VaultEntry[] = [];

    // 1. Videos guardados desde Buscar / Mi Señal
    for (const item of savedContent) {
      const ytId = item.providerId || item.id;
      const shareUrl = `https://www.youtube.com/watch?v=${ytId}`;
      out.push({
        id: `vid-${item.id}`,
        kind: 'video',
        badge: 'Video',
        title: item.title || 'Video guardado',
        subtitle: item.channelTitle || 'YouTube',
        thumb:
          item.thumbnail ||
          (/^[A-Za-z0-9_-]{11}$/.test(ytId) ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ''),
        timestamp: Date.parse((item as any).savedAt || (item as any).publishedAt || '') || 0,
        shareUrl,
        onOpen: () => navigate(`/search?v=${encodeURIComponent(ytId)}`),
        onDelete: () => unsaveContent(item.id)
      });
    }

    // 2. Videos guardados en grillas propias de MiTV (excluye TV en vivo oficial precargada)
    for (const ch of mitvWorkspace.channels || []) {
      if (ch.id === OFFICIAL_LIVE_TV_CHANNEL_ID) continue;
      for (const it of ch.items || []) {
        const ytId =
          (it.liveVideoId && /^[A-Za-z0-9_-]{11}$/.test(it.liveVideoId) && it.liveVideoId) ||
          (it.providerId && /^[A-Za-z0-9_-]{11}$/.test(it.providerId) && it.providerId) ||
          '';
        const thumb = it.thumbnailUrl || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
        const url = it.sourceUrl || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : '');
        out.push({
          id: `mitv-${ch.id}-${it.id}`,
          kind: 'mitv',
          badge: 'MiTV',
          title: it.title || ch.name || 'MiTV',
          subtitle: ch.name || 'MiTV',
          thumb,
          timestamp: Date.parse((it as any).addedAt || '') || 0,
          shareUrl: url || `${window.location.origin}/mitv`,
          onOpen: () =>
            url
              ? navigate(`/mitv?add=${encodeURIComponent(url)}&t=${encodeURIComponent(it.title || '')}`)
              : navigate('/mitv'),
          onDelete: () => {
            setMitvWorkspace((prev) =>
              saveMiTvWorkspace({
                ...prev,
                channels: prev.channels.map((c) =>
                  c.id === ch.id ? { ...c, items: c.items.filter((x) => x.id !== it.id) } : c
                )
              })
            );
          }
        });
      }
    }

    // 3. Canciones / listas guardadas en YOU MUSIC
    for (const pl of musicWorkspace.playlists || []) {
      for (const it of pl.items || []) {
        const thumb =
          it.thumbnailUrl || (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '');
        const url = it.sourceUrl || (it.videoId ? `https://www.youtube.com/watch?v=${it.videoId}` : '');
        out.push({
          id: `mus-${pl.id}-${it.id}`,
          kind: 'music',
          badge: 'Música',
          title: it.title || it.author || 'Música',
          subtitle: `${it.author || 'YouMusic'} · ${pl.name}`,
          thumb,
          timestamp: Date.parse(it.addedAt || '') || 0,
          shareUrl: url || `${window.location.origin}/youmusic`,
          onOpen: () =>
            it.videoId
              ? navigate(`/youmusic?v=${encodeURIComponent(it.videoId)}&t=${encodeURIComponent(it.title || '')}`)
              : navigate('/youmusic'),
          onDelete: () => {
            setMusicWorkspace((prev) =>
              saveYouMusicWorkspace({
                ...prev,
                playlists: prev.playlists.map((p) =>
                  p.id === pl.id ? { ...p, items: p.items.filter((x) => x.id !== it.id) } : p
                )
              })
            );
          }
        });
      }
    }

    // 4. Reels guardados en colecciones
    for (const col of reelsWorkspace.collections || []) {
      for (const it of col.items || []) {
        const anyIt = it as any;
        const ytId =
          anyIt.providerId && /^[A-Za-z0-9_-]{11}$/.test(anyIt.providerId) ? anyIt.providerId : '';
        const thumb =
          anyIt.thumbnailUrl ||
          anyIt.thumbnail ||
          (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
        out.push({
          id: `reel-${col.id}-${it.id}`,
          kind: 'reel',
          badge: 'Reel',
          title: it.title || 'Reel guardado',
          subtitle: col.name || 'Colección Reels',
          thumb,
          timestamp: Date.parse(anyIt.addedAt || '') || 0,
          shareUrl: anyIt.sourceUrl || `${window.location.origin}/reels`,
          onOpen: () => navigate('/reels'),
          onDelete: () => {
            setReelsWorkspace((prev) =>
              saveYouReelsWorkspace({
                ...prev,
                collections: prev.collections.map((c) =>
                  c.id === col.id ? { ...c, items: c.items.filter((x) => x.id !== it.id) } : c
                )
              })
            );
          }
        });
      }
    }

    // 5. Notas guardadas en Lecturas
    for (const it of lecturasWorkspace.items || []) {
      out.push({
        id: `lec-${it.id}`,
        kind: 'lectura',
        badge: 'Lectura',
        title: it.title || it.sourceName || it.domain,
        subtitle: `${it.sourceName || it.domain} · ${it.topic}`,
        thumb: it.thumbnailUrl || it.faviconUrl || '',
        timestamp: Date.parse(it.addedAt || it.publishedAt || '') || 0,
        shareUrl: it.url,
        onOpen: () =>
          navigate(`/lecturas?add=${encodeURIComponent(it.url)}&t=${encodeURIComponent(it.title)}`),
        onDelete: () => {
          setLecturasWorkspace((prev) =>
            saveLecturasWorkspace({
              ...prev,
              items: prev.items.filter((x) => x.id !== it.id)
            })
          );
        }
      });
    }

    return out.sort((a, b) => b.timestamp - a.timestamp);
  }, [savedContent, mitvWorkspace, musicWorkspace, reelsWorkspace, lecturasWorkspace, navigate, unsaveContent]);

  const counts = useMemo(() => {
    let videos = 0;
    let music = 0;
    let reels = 0;
    let lecturas = 0;
    for (const e of allVaultEntries) {
      if (e.kind === 'video' || e.kind === 'mitv') videos++;
      else if (e.kind === 'music') music++;
      else if (e.kind === 'reel') reels++;
      else if (e.kind === 'lectura') lecturas++;
    }
    return {
      all: allVaultEntries.length,
      videos,
      music,
      reels,
      lecturas,
      senales: userSignals.length + savedChannels.length,
      siguiendo: followedCreators.length
    };
  }, [allVaultEntries, userSignals.length, savedChannels.length, followedCreators.length]);

  const visibleEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allVaultEntries.filter((e) => {
      if (filter === 'videos' && e.kind !== 'video' && e.kind !== 'mitv') return false;
      if (filter === 'music' && e.kind !== 'music') return false;
      if (filter === 'reels' && e.kind !== 'reel') return false;
      if (filter === 'lecturas' && e.kind !== 'lectura') return false;
      if (q && !`${e.title} ${e.subtitle} ${e.badge}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allVaultEntries, filter, searchQuery]);

  const completeSignalVisualData = useMemo<CompleteSignalVisualData>(() => {
    const primarySignalId = activeSignal?.id || userSignals[0]?.id || 'justicia-social-signal-1';
    const primarySignalName = activeSignal?.name || userSignals[0]?.name || 'Mi Señal YOUAPP';
    const primaryBranding = signalBranding[primarySignalId] || {};

    const channelThumbs: Array<{ title: string; thumb: string }> = [];
    const seenThumbs = new Set<string>();
    const pushChannelThumb = (title: string, thumb?: string) => {
      const clean = String(thumb || '').trim();
      if (!clean || seenThumbs.has(clean)) return;
      seenThumbs.add(clean);
      channelThumbs.push({ title, thumb: clean });
    };

    for (const sig of userSignals) {
      const b = signalBranding[sig.id];
      pushChannelThumb(sig.name, b?.coverDataUrl || b?.avatarDataUrl);
    }
    for (const ch of savedChannels) {
      const chAny = ch as any;
      pushChannelThumb(ch.name, chAny.coverUrl || chAny.thumbnail || ch.logo);
    }

    const mitvThumbs = allVaultEntries
      .filter((e) => e.kind === 'mitv' && e.thumb)
      .map((e) => ({ title: e.title, thumb: e.thumb }));
    const musicThumbs = allVaultEntries
      .filter((e) => e.kind === 'music' && e.thumb)
      .map((e) => ({ title: e.title, thumb: e.thumb }));
    const lecturas = lecturasWorkspace.items.map((it) => ({
      title: it.title || it.sourceName || it.domain,
      source: it.sourceName || it.domain || 'Lectura',
      thumb: it.thumbnailUrl || it.faviconUrl || ''
    }));
    const reelsAndSavedThumbs = allVaultEntries
      .filter((e) => (e.kind === 'reel' || e.kind === 'video') && e.thumb)
      .map((e) => ({ title: e.title, thumb: e.thumb }));

    return {
      signalId: primarySignalId,
      signalName: primarySignalName,
      avatarUrl: primaryBranding.avatarDataUrl,
      heroCoverUrl: primaryBranding.coverDataUrl || channelThumbs[0]?.thumb,
      channelThumbs,
      mitvThumbs,
      mitvChannelsCount: (mitvWorkspace.channels || []).length,
      mitvItemsCount: mitvThumbs.length,
      musicThumbs,
      musicCount: counts.music,
      lecturas,
      lecturasCount: counts.lecturas,
      reelsAndSavedThumbs,
      reelsAndSavedCount: counts.reels + savedContent.length,
      signalsCount: Math.max(userSignals.length, savedChannels.length, activeSignal ? 1 : 0)
    };
  }, [
    activeSignal,
    userSignals,
    signalBranding,
    savedChannels,
    allVaultEntries,
    lecturasWorkspace.items,
    mitvWorkspace.channels,
    counts,
    savedContent.length
  ]);

  const filterChips: Array<{ id: VaultFilter; label: string; count: number }> = [
    { id: 'all', label: 'Todo', count: counts.all },
    { id: 'videos', label: 'Videos', count: counts.videos },
    { id: 'music', label: 'Música', count: counts.music },
    { id: 'reels', label: 'Reels', count: counts.reels },
    { id: 'lecturas', label: 'Lecturas', count: counts.lecturas },
    { id: 'senales', label: 'Señales', count: counts.senales + SIGNALS_100_CATALOG.length },
    { id: 'siguiendo', label: 'Siguiendo', count: counts.siguiendo }
  ];

  return (
    <div className="ml-page">
      <div className="ml-stage-bg" aria-hidden="true" />
      <div className="ml-stage-veil" aria-hidden="true" />

      <header className="ml-topbar">
        <div className="ml-topbar-left">
          <button type="button" className="ml-logo-btn" onClick={() => navigate('/')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="ml-brand-pill">MI LISTA</span>
        </div>

        <nav className="ml-nav">
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/senales')}>SEÑALES</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/mitv')}>MITV</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/youmusic')}>YOU MUSIC</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/reels')}>REELS</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/lecturas')}>LECTURAS</button>
          <button type="button" className="ml-nav-btn active" onClick={() => navigate('/my-lists')}>MIS LISTAS</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/perfil')}>MI PERFIL</button>
          <button
            type="button"
            className="ml-nav-btn"
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

      <main className="ml-main">
        {/* 1. BARRA SUPERIOR DESPLEGABLE SUTIL (Buscar · Compartir Señal · Nueva Señal) */}
        <section className={`ml-tools-drawer ${isToolsOpen ? 'is-open' : ''}`} aria-label="Herramientas de Mi Lista">
          <button
            type="button"
            className="ml-tools-toggle"
            onClick={() => setIsToolsOpen((v) => !v)}
            aria-expanded={isToolsOpen}
          >
            <span className="ml-tools-toggle-left">
              <Bookmark size={14} color="#64d2ff" />
              <strong>Mi Lista</strong>
              <span className="ml-tools-sub">
                · {counts.all} guardados · Buscar · Compartir señal
              </span>
            </span>
            <ChevronDown
              size={15}
              style={{
                transition: 'transform 0.18s ease',
                transform: isToolsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                opacity: 0.78
              }}
            />
          </button>

          {isToolsOpen && (
            <div className="ml-tools-body">
              <div className="ml-tools-row">
                <div className="ml-search-box">
                  <Search size={14} color="rgba(245,245,247,0.58)" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar en tus videos, música, reels y lecturas…"
                    aria-label="Buscar en Mi Lista"
                  />
                </div>
                <button type="button" className="ml-cta-btn" onClick={() => navigate('/create-signal')}>
                  <Plus size={14} />
                  <span>Nueva señal</span>
                </button>
              </div>
              <CompleteSignalShareCard data={completeSignalVisualData} />
            </div>
          )}
        </section>

        {/* 2. CARRUSEL HORIZONTAL DE 1 FILA */}
        <div className="ml-filter-carousel" role="tablist" aria-label="Filtrar Mi Lista">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={filter === chip.id}
              className={`ml-filter-chip ${filter === chip.id ? 'active' : ''}`}
              onClick={() => setFilter(chip.id)}
            >
              <span>{chip.label}</span>
              {chip.count > 0 && <span className="ml-chip-count">{chip.count}</span>}
            </button>
          ))}
        </div>

        {/* 3. CONTENIDO UNIFICADO */}
        {filter === 'senales' ? (
          <section className="ml-vault-section">
            <div style={{ marginBottom: 14 }}>
              <AtlasBuildSignalBox compact />
            </div>

            {(userSignals.length > 0 || savedChannels.length > 0) && (
              <div className="ml-feed-block" style={{ marginBottom: 16 }}>
                <div className="ml-section-subhead">
                  <div>
                    <strong>Tus señales propias ({userSignals.length + savedChannels.length})</strong>
                    <span>Señales creadas o guardadas en tu cuenta</span>
                  </div>
                </div>
                <div className="ml-signals-grid">
                  {userSignals.map((sig) => {
                    const coverSrc = getLocalSignalThumb(sig) || autoSignalThumbs[sig.id] || '';
                    return (
                      <button
                        key={sig.id}
                        type="button"
                        className={`ml-signal-card ${coverSrc ? 'has-cover' : ''}`}
                        onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
                      >
                        {coverSrc ? (
                          <div className="ml-signal-cover">
                            <img src={coverSrc} alt={sig.name} loading="lazy" />
                            <div className="ml-signal-scrim" />
                            <span
                              style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: 'rgba(10, 14, 22, 0.76)',
                                border: '1px solid rgba(100, 210, 255, 0.48)',
                                color: '#ffffff',
                                fontSize: 10,
                                fontWeight: 700,
                                backdropFilter: 'blur(6px)'
                              }}
                            >
                              <Radio size={11} color="#64d2ff" />
                              <span>Señal</span>
                            </span>
                            <div className="ml-signal-footer">
                              <div className="ml-row-info">
                                <strong>{sig.name}</strong>
                                <span>Mi Señal</span>
                              </div>
                              <span className="ml-play-circle">
                                <Play size={13} fill="#fff" color="#fff" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="ml-signal-plain">
                            <div className="ml-icon-box blue"><Radio size={18} /></div>
                            <div className="ml-row-info">
                              <strong>{sig.name}</strong>
                              <span>Mi Señal</span>
                            </div>
                            <span className="ml-play-circle">
                              <Play size={13} fill="#fff" color="#fff" />
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {savedChannels.map((channel) => {
                    const chAny = channel as any;
                    const branding = signalBranding[channel.id] || {};
                    const coverSrc =
                      branding.coverDataUrl ||
                      branding.avatarDataUrl ||
                      chAny.coverUrl ||
                      chAny.thumbnail ||
                      channel.logo ||
                      '';
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={`ml-signal-card ${coverSrc ? 'has-cover' : ''}`}
                        onClick={() => handlePlayChannel(channel)}
                      >
                        {coverSrc ? (
                          <div className="ml-signal-cover">
                            <img src={coverSrc} alt={channel.name} loading="lazy" />
                            <div className="ml-signal-scrim" />
                            <span
                              style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: 'rgba(10, 14, 22, 0.76)',
                                border: '1px solid rgba(100, 210, 255, 0.48)',
                                color: '#ffffff',
                                fontSize: 10,
                                fontWeight: 700,
                                backdropFilter: 'blur(6px)'
                              }}
                            >
                              <Radio size={11} color="#64d2ff" />
                              <span>Señal</span>
                            </span>
                            <div className="ml-signal-footer">
                              <div className="ml-row-info">
                                <strong>{channel.name}</strong>
                                <span>Señal personalizada</span>
                              </div>
                              <span className="ml-play-circle">
                                <Play size={13} fill="#fff" color="#fff" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="ml-signal-plain">
                            <div className="ml-icon-box purple"><Tv size={18} /></div>
                            <div className="ml-row-info">
                              <strong>{channel.name}</strong>
                              <span>Señal personalizada</span>
                            </div>
                            <span className="ml-play-circle">
                              <Play size={13} fill="#fff" color="#fff" />
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CATÁLOGO DE 100 SEÑALES TEMÁTICAS (3 TEMÁTICAS COMPLEMENTARIAS · 10 VIDEOS CADA UNA) */}
            <div className="ml-feed-block">
              <div className="ml-section-subhead">
                <div>
                  <strong>100 Señales Temáticas ({filtered100Signals.length})</strong>
                  <span>3 temáticas complementarias · 10 videos reales en cada señal · tocá para sintonizar</span>
                </div>
              </div>

              <div className="ml-filter-carousel" role="tablist" aria-label="Temáticas de señales">
                <button
                  type="button"
                  role="tab"
                  aria-selected={signal100Theme === 'all'}
                  className={`ml-filter-chip ${signal100Theme === 'all' ? 'active' : ''}`}
                  onClick={() => setSignal100Theme('all')}
                >
                  <span>Todas</span>
                  <span className="ml-chip-count">{SIGNALS_100_CATALOG.length}</span>
                </button>
                {favoriteSignalIds.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={signal100Theme === 'favorites'}
                    className={`ml-filter-chip ${signal100Theme === 'favorites' ? 'active' : ''}`}
                    onClick={() => setSignal100Theme('favorites')}
                  >
                    <Star size={11} fill="#fbbf24" color="#fbbf24" />
                    <span>Favoritas</span>
                    <span className="ml-chip-count">{favoriteSignalIds.length}</span>
                  </button>
                )}
                {SIGNALS_100_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={signal100Theme === t.id}
                    className={`ml-filter-chip ${signal100Theme === t.id ? 'active' : ''}`}
                    onClick={() => setSignal100Theme(t.id)}
                  >
                    <span>{t.shortLabel}</span>
                    <span className="ml-chip-count">{t.count}</span>
                  </button>
                ))}
              </div>

              <div className="ml-search-box" style={{ marginBottom: 4 }}>
                <Search size={14} color="rgba(245,245,247,0.58)" />
                <input
                  type="text"
                  value={signal100Query}
                  onChange={(e) => setSignal100Query(e.target.value)}
                  placeholder="Buscar entre las 100 señales (ej. Roma, Rock Nacional, Fútbol, Cocina…)"
                  aria-label="Buscar señales temáticas"
                />
              </div>

              <div className="ml-signals-grid">
                {filtered100Signals.map((sig) => {
                  const coverSrc = sig.coverVideoId
                    ? `https://i.ytimg.com/vi/${sig.coverVideoId}/hqdefault.jpg`
                    : '';
                  const themeLabel =
                    sig.theme === 'cultura'
                      ? 'Cultura & Saber'
                      : sig.theme === 'musica'
                        ? 'Música & Escena'
                        : 'Deportes & Mundo';
                  const isFav = favoriteSignalIds.includes(sig.id);
                  return (
                    <div
                      key={sig.id}
                      role="button"
                      tabIndex={0}
                      className="ml-signal-card has-cover"
                      onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`);
                        }
                      }}
                      title={`${sig.title} · ${sig.subtitle}`}
                    >
                      <div className="ml-signal-cover">
                        {coverSrc && (
                          <img src={coverSrc} alt={sig.title} loading="lazy" referrerPolicy="no-referrer" />
                        )}
                        <div className="ml-signal-scrim" />
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'rgba(10, 14, 22, 0.76)',
                            border: `1px solid ${sig.accent}`,
                            color: '#ffffff',
                            fontSize: 10,
                            fontWeight: 700,
                            backdropFilter: 'blur(6px)'
                          }}
                        >
                          <Radio size={11} color="#64d2ff" />
                          <span>{themeLabel}</span>
                        </span>
                        <div
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            zIndex: 3
                          }}
                        >
                          <button
                            type="button"
                            aria-label={`Compartir señal ${sig.title}`}
                            title="Compartir esta señal"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/misenal1?signal=${encodeURIComponent(sig.id)}&sharedSignal=1`;
                              void shareContentUniversal({
                                title: `${sig.title} · Señal en YOUAPP`,
                                text: sig.subtitle,
                                url,
                                thumbnailUrl: coverSrc,
                                subtitle: `${sig.videos.length} videos · YOUAPP TV`,
                                badge: 'MI SEÑAL EN YOUAPP'
                              });
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: '1px solid rgba(255, 255, 255, 0.28)',
                              background: 'rgba(10, 14, 22, 0.74)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <Share2 size={12} color="#ffffff" />
                          </button>
                          <button
                            type="button"
                            aria-label={isFav ? `Quitar ${sig.title} de favoritas` : `Fijar ${sig.title} en favoritas`}
                            title={isFav ? 'Quitar de favoritas' : 'Fijar en favoritas'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavoriteSignalIds(toggleFavoriteSignalId(sig.id).ids);
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: isFav
                                ? '1px solid rgba(251, 191, 36, 0.7)'
                                : '1px solid rgba(255, 255, 255, 0.28)',
                              background: isFav ? 'rgba(251, 191, 36, 0.24)' : 'rgba(10, 14, 22, 0.74)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <Star size={12} fill={isFav ? '#fbbf24' : 'none'} color={isFav ? '#fbbf24' : '#ffffff'} />
                          </button>
                        </div>
                        <div className="ml-signal-footer">
                          <div className="ml-row-info">
                            <strong>{sig.title}</strong>
                            <span>{sig.subtitle}</span>
                          </div>
                          <span className="ml-play-circle">
                            <Play size={13} fill="#fff" color="#fff" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : filter === 'siguiendo' ? (
          <section className="ml-vault-section">
            {followedCreators.length === 0 ? (
              <div className="ml-empty-card">
                <Users size={28} color="#64d2ff" />
                <strong>Todavía no seguís creadores</strong>
                <p>Cuando sigas un canal en Buscar, sus novedades y enlaces multiplataforma van a aparecer acá.</p>
                <button type="button" className="ml-cta-btn" onClick={() => navigate('/search')}>
                  <Search size={14} /> Explorar en Buscar
                </button>
              </div>
            ) : (
              <div className="ml-following-wrap">
                {/* 1. FEED UNIFICADO "NOVEDADES DE LOS QUE SIGO" (US$ 0) */}
                <div className="ml-feed-block">
                  <div className="ml-section-subhead">
                    <div>
                      <strong>Novedades de los que sigo</strong>
                      <span>
                        {followedFeedLoading
                          ? 'Buscando últimos videos…'
                          : `${followedFeed.length} ${followedFeed.length === 1 ? 'video' : 'videos'} recientes (US$ 0)`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ml-mini-pill"
                      onClick={() => setFollowedFeedNonce((n) => n + 1)}
                      disabled={followedFeedLoading}
                      title="Actualizar novedades"
                    >
                      <RefreshCw size={12} className={followedFeedLoading ? 'ml-spin' : ''} />
                      <span>Actualizar</span>
                    </button>
                  </div>

                  {followedFeed.length === 0 && !followedFeedLoading ? (
                    <div className="ml-empty-card" style={{ padding: '18px 14px' }}>
                      <strong>Sin novedades indexadas todavía</strong>
                      <p>Tocá un creador abajo para buscar sus videos en vivo o vinculá su canal de PeerTube.</p>
                    </div>
                  ) : (
                    <div className="ml-vault-list">
                      {followedFeed.map((item) => (
                        <article key={item.id} className="ml-vault-row">
                          <button
                            type="button"
                            className="ml-thumb-wrap"
                            onClick={() => navigate(`/mitv?add=${encodeURIComponent(item.sourceUrl)}`)}
                            aria-label={`Ver ${item.title}`}
                          >
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="ml-thumb-fallback">
                                <Tv size={16} />
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            className="ml-row-click"
                            onClick={() => navigate(`/mitv?add=${encodeURIComponent(item.sourceUrl)}`)}
                          >
                            <div className="ml-meta-line">
                              <span className="ml-kind-badge is-video">
                                {item.provider === 'peertube' ? 'PeerTube' : 'YouTube'}
                              </span>
                              <span className="ml-subtitle-inline">{item.creatorName}</span>
                            </div>
                            <strong>{item.title}</strong>
                          </button>

                          <div className="ml-row-actions">
                            <button
                              type="button"
                              className="ml-icon-action play"
                              title="Reproducir en MiTV"
                              onClick={() => navigate(`/mitv?add=${encodeURIComponent(item.sourceUrl)}`)}
                            >
                              <Play size={14} fill="currentColor" />
                            </button>
                            <button
                              type="button"
                              className="ml-icon-action"
                              title="Compartir"
                              onClick={() =>
                                void shareContentUniversal({
                                  title: item.title,
                                  text: `${item.title} · ${item.creatorName}`,
                                  url: item.sourceUrl,
                                  thumbnailUrl: item.thumbnailUrl
                                })
                              }
                            >
                              <Share2 size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. CREADORES SEGUIDOS + IDENTIDAD MULTIPLATAFORMA */}
                <div className="ml-feed-block">
                  <div className="ml-section-subhead">
                    <div>
                      <strong>Creadores seguidos ({followedCreators.length})</strong>
                      <span>Unificá YouTube, PeerTube, Radio y Web en una sola ficha por creador</span>
                    </div>
                  </div>
                  <div className="ml-vault-list">
                    {followedCreators.map((creator) => {
                      const links = creator.linkedPlatforms || {};
                      const isEditing = editingPlatformsKey === creator.key;
                      const linkedCount = [links.youtube, links.peertube, links.radioUrl, links.website].filter(Boolean).length;
                      return (
                        <div key={creator.key} className="ml-creator-card">
                          <div className="ml-vault-row" style={{ border: 0, background: 'transparent', padding: '8px 10px' }}>
                            <div className="ml-icon-box blue"><Radio size={18} /></div>
                            <button
                              type="button"
                              className="ml-row-click"
                              onClick={() => navigate(`/search?q=${encodeURIComponent(creator.name)}`)}
                            >
                              <strong>{creator.name}</strong>
                              <span>
                                {linkedCount > 0
                                  ? `${linkedCount} ${linkedCount === 1 ? 'fuente vinculada' : 'fuentes vinculadas'} · Tocar para ver videos`
                                  : 'Ver videos y novedades en Buscar'}
                              </span>
                            </button>
                            <div className="ml-row-actions">
                              <button
                                type="button"
                                className="ml-icon-action"
                                title="Vincular plataformas del creador (YouTube, PeerTube, Radio, Web)"
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingPlatformsKey(null);
                                  } else {
                                    setEditingPlatformsKey(creator.key);
                                    setPlatformsDraft({
                                      youtube: links.youtube || creator.sourceUrl || '',
                                      peertube: links.peertube || '',
                                      radioUrl: links.radioUrl || '',
                                      website: links.website || ''
                                    });
                                  }
                                }}
                              >
                                <Link2 size={14} />
                              </button>
                              <button
                                type="button"
                                className="ml-icon-action danger"
                                title="Dejar de seguir"
                                onClick={() =>
                                  setSocialGraph((prev) => toggleFollowCreatorWithMeta(prev, creator).graph)
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {linkedCount > 0 && !isEditing && (
                            <div className="ml-creator-links-bar">
                              {links.youtube && (
                                <a href={links.youtube} target="_blank" rel="noopener noreferrer" className="ml-platform-pill">
                                  <Tv size={11} /> YouTube <ExternalLink size={10} />
                                </a>
                              )}
                              {links.peertube && (
                                <a href={links.peertube} target="_blank" rel="noopener noreferrer" className="ml-platform-pill">
                                  <Film size={11} /> PeerTube <ExternalLink size={10} />
                                </a>
                              )}
                              {links.radioUrl && (
                                <a href={links.radioUrl} target="_blank" rel="noopener noreferrer" className="ml-platform-pill">
                                  <Radio size={11} /> Radio <ExternalLink size={10} />
                                </a>
                              )}
                              {links.website && (
                                <a href={links.website} target="_blank" rel="noopener noreferrer" className="ml-platform-pill">
                                  <Globe size={11} /> Web <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          )}

                          {isEditing && (
                            <form
                              className="ml-creator-links-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                setSocialGraph((prev) =>
                                  updateFollowedCreatorPlatforms(prev, creator.key, platformsDraft)
                                );
                                setEditingPlatformsKey(null);
                                setFollowedFeedNonce((n) => n + 1);
                              }}
                            >
                              <input
                                type="url"
                                value={platformsDraft.youtube || ''}
                                onChange={(e) => setPlatformsDraft((p) => ({ ...p, youtube: e.target.value }))}
                                placeholder="YouTube (https://youtube.com/@canal)"
                              />
                              <input
                                type="url"
                                value={platformsDraft.peertube || ''}
                                onChange={(e) => setPlatformsDraft((p) => ({ ...p, peertube: e.target.value }))}
                                placeholder="PeerTube (https://instancia/c/canal — trae novedades automáticas)"
                              />
                              <input
                                type="url"
                                value={platformsDraft.radioUrl || ''}
                                onChange={(e) => setPlatformsDraft((p) => ({ ...p, radioUrl: e.target.value }))}
                                placeholder="Radio / Stream en vivo (https://...)"
                              />
                              <input
                                type="url"
                                value={platformsDraft.website || ''}
                                onChange={(e) => setPlatformsDraft((p) => ({ ...p, website: e.target.value }))}
                                placeholder="Sitio oficial (https://...)"
                              />
                              <div className="ml-creator-form-actions">
                                <button type="submit" className="ml-cta-btn" style={{ padding: '6px 14px', fontSize: 12 }}>
                                  Guardar identidad
                                </button>
                                <button
                                  type="button"
                                  className="ml-ghost-btn"
                                  style={{ padding: '6px 12px', fontSize: 12 }}
                                  onClick={() => setEditingPlatformsKey(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="ml-vault-section">
            {visibleEntries.length === 0 ? (
              <div className="ml-empty-card">
                <Bookmark size={28} color="#64d2ff" />
                <strong>Tu Lista está lista para guardar</strong>
                <p>
                  Todo lo que guardes en Buscar, MiTV, YouMusic, Reels o Lecturas aparece acá ordenado y listo para abrir en 1 toque.
                </p>
                <div className="ml-empty-actions">
                  <button type="button" className="ml-cta-btn" onClick={() => navigate('/search')}>
                    <Search size={14} /> Buscar videos
                  </button>
                  <button type="button" className="ml-ghost-btn" onClick={() => navigate('/lecturas')}>
                    <BookOpen size={14} /> Ir a Lecturas
                  </button>
                </div>
              </div>
            ) : (
              <div className="ml-vault-list">
                {visibleEntries.map((entry) => (
                  <article key={entry.id} className="ml-vault-row">
                    <button
                      type="button"
                      className="ml-thumb-wrap"
                      onClick={entry.onOpen}
                      aria-label={`Abrir ${entry.title}`}
                    >
                      {entry.thumb ? (
                        <img
                          src={entry.thumb}
                          alt={entry.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="ml-thumb-fallback">
                          {entry.kind === 'music' ? (
                            <Music size={16} />
                          ) : entry.kind === 'reel' ? (
                            <Film size={16} />
                          ) : entry.kind === 'lectura' ? (
                            <BookOpen size={16} />
                          ) : (
                            <Tv size={16} />
                          )}
                        </span>
                      )}
                    </button>

                    <button type="button" className="ml-row-click" onClick={entry.onOpen}>
                      <div className="ml-meta-line">
                        <span className={`ml-kind-badge is-${entry.kind}`}>{entry.badge}</span>
                        <span className="ml-subtitle-inline">{entry.subtitle}</span>
                      </div>
                      <strong>{entry.title}</strong>
                    </button>

                    <div className="ml-row-actions">
                      <button
                        type="button"
                        className="ml-icon-action play"
                        title="Abrir"
                        onClick={entry.onOpen}
                      >
                        {entry.kind === 'lectura' ? (
                          <BookOpen size={14} />
                        ) : (
                          <Play size={14} fill="currentColor" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="ml-icon-action"
                        title="Compartir"
                        onClick={() =>
                          void shareContentUniversal({
                            title: entry.title,
                            text: `${entry.title} · YOUAPP`,
                            url: entry.shareUrl
                          })
                        }
                      >
                        <Share2 size={14} />
                      </button>
                      <button
                        type="button"
                        className="ml-icon-action danger"
                        title="Quitar de Mi Lista"
                        onClick={entry.onDelete}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <style>{`
        .ml-page {
          position: relative;
          min-height: 100dvh;
          background-color: #12151c;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          padding-bottom: 64px;
          overflow-x: clip;
          isolation: isolate;
        }
        .ml-stage-bg {
          position: fixed;
          inset: -16px;
          z-index: 0;
          background-color: #18140d;
          background-image: url('/my-lists-autumn-lake-bg.png');
          background-size: cover;
          background-position: center;
          filter: blur(10px) brightness(0.82) contrast(1.06);
          transform: scale(1.04) translateZ(0);
          pointer-events: none;
        }
        .ml-stage-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            rgba(18, 14, 8, 0.18) 0%,
            rgba(16, 14, 10, 0.14) 50%,
            rgba(12, 10, 8, 0.38) 100%
          );
          pointer-events: none;
        }
        .ml-topbar,
        .ml-main {
          position: relative;
          z-index: 2;
        }
        .ml-topbar {
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
          border-bottom: 1px solid rgba(255, 255, 255, 0.18);
        }
        .ml-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .ml-logo-btn {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }
        .ml-brand-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .ml-nav {
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 6px;
          min-width: 0;
        }
        .ml-nav-btn {
          background: transparent;
          border: 1px solid transparent;
          color: rgba(245, 245, 247, 0.84);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ml-nav-btn:hover,
        .ml-nav-btn.active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(100, 210, 255, 0.45);
          color: #ffffff;
        }

        .ml-main {
          max-width: 980px;
          margin: 0 auto;
          padding: 14px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* BARRA DESPLEGABLE GLASEADA ARRIBA */
        .ml-tools-drawer {
          position: relative;
          border-radius: 18px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.16) 0%,
            rgba(255, 255, 255, 0.06) 55%,
            rgba(255, 255, 255, 0.11) 100%
          );
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.45),
            0 12px 32px rgba(0, 0, 0, 0.24);
          backdrop-filter: blur(22px) saturate(150%);
          -webkit-backdrop-filter: blur(22px) saturate(150%);
          overflow: hidden;
        }
        .ml-tools-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 14px;
          background: transparent;
          border: 0;
          color: rgba(245, 245, 247, 0.94);
          font-size: 12.5px;
          cursor: pointer;
        }
        .ml-tools-toggle:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .ml-tools-toggle-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .ml-tools-sub {
          font-size: 11.5px;
          color: rgba(235, 240, 255, 0.56);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ml-tools-body {
          padding: 10px 12px 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ml-tools-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ml-search-box {
          flex: 1 1 220px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.34);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ml-search-box input {
          flex: 1;
          min-width: 0;
          border: 0;
          background: transparent;
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .ml-search-box input::placeholder {
          color: rgba(245, 245, 247, 0.48);
        }
        .ml-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.55);
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .ml-cta-btn:hover {
          background: #0a84ff;
        }
        .ml-ghost-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }

        /* CARRUSEL 1 FILA */
        .ml-filter-carousel {
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
        .ml-filter-carousel::-webkit-scrollbar {
          display: none;
        }
        .ml-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          white-space: nowrap;
          padding: 7px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.26);
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.32);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12.5px;
          font-weight: 680;
          cursor: pointer;
        }
        .ml-filter-chip.active {
          background: rgba(0, 113, 227, 0.85);
          border-color: rgba(140, 220, 255, 0.75);
          color: #ffffff;
          box-shadow: 0 6px 18px rgba(0, 113, 227, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.45);
        }
        .ml-chip-count {
          font-size: 11px;
          font-weight: 750;
          opacity: 0.82;
        }

        /* CONTENEDOR GLASEADO LIQUID GLASS */
        .ml-vault-section {
          position: relative;
          border-radius: 24px;
          padding: 16px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.14) 0%,
            rgba(255, 255, 255, 0.05) 55%,
            rgba(255, 255, 255, 0.1) 100%
          );
          backdrop-filter: blur(24px) saturate(150%);
          -webkit-backdrop-filter: blur(24px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.48),
            0 16px 40px rgba(0, 0, 0, 0.28);
          overflow: hidden;
        }
        .ml-vault-section::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.5px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.85) 0%,
            rgba(255, 255, 255, 0.28) 22%,
            rgba(255, 255, 255, 0.1) 50%,
            rgba(255, 255, 255, 0.28) 78%,
            rgba(255, 255, 255, 0.85) 100%
          );
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .ml-vault-section > * {
          position: relative;
          z-index: 1;
        }

        /* LISTA BÓVEDA UNIFICADA */
        .ml-vault-list {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .ml-vault-row {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 12px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
          transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
        }
        .ml-vault-row:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(140, 220, 255, 0.52);
          transform: translateY(-1px);
        }
        .ml-thumb-wrap {
          width: 78px;
          height: 54px;
          border-radius: 10px;
          overflow: hidden;
          border: 0;
          padding: 0;
          background: rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ml-thumb-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ml-thumb-fallback {
          color: rgba(245, 245, 247, 0.65);
        }
        .ml-row-click {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: 0;
          padding: 0;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .ml-row-click strong {
          font-size: 13.5px;
          font-weight: 680;
          color: #ffffff;
          line-height: 1.28;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ml-row-click > span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.65);
        }
        .ml-meta-line {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .ml-kind-badge {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.03em;
          padding: 2px 7px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .ml-kind-badge.is-video { background: rgba(239, 68, 68, 0.22); color: #fca5a5; }
        .ml-kind-badge.is-mitv { background: rgba(6, 182, 212, 0.22); color: #67e8f9; }
        .ml-kind-badge.is-music { background: rgba(139, 92, 246, 0.25); color: #d8b4fe; }
        .ml-kind-badge.is-reel { background: rgba(236, 72, 153, 0.24); color: #f9a8d4; }
        .ml-kind-badge.is-lectura { background: rgba(10, 132, 255, 0.24); color: #7dd3fc; }
        .ml-subtitle-inline {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.62);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ml-row-actions {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }
        .ml-icon-action {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ml-icon-action.play {
          background: #0071e3;
          border-color: rgba(100, 210, 255, 0.55);
        }
        .ml-icon-action:hover {
          background: #0a84ff;
          border-color: #64d2ff;
        }
        .ml-icon-action.danger:hover {
          background: rgba(239, 68, 68, 0.42);
          border-color: rgba(252, 165, 165, 0.7);
        }

        /* SEÑALES */
        .ml-signals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 10px;
        }
        .ml-signal-card {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.09);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
          color: #ffffff;
          padding: 0;
          overflow: hidden;
          cursor: pointer;
          text-align: left;
        }
        .ml-signal-cover {
          position: relative;
          width: 100%;
          height: 112px;
          display: flex;
          align-items: flex-end;
        }
        .ml-signal-cover > img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ml-signal-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(8, 10, 14, 0.12) 0%, rgba(8, 10, 14, 0.86) 100%);
        }
        .ml-signal-footer,
        .ml-signal-plain {
          position: relative;
          z-index: 1;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
        }
        .ml-icon-box {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ml-icon-box.blue { background: rgba(0, 113, 227, 0.25); color: #7dd3fc; }
        .ml-icon-box.purple { background: rgba(139, 92, 246, 0.25); color: #c4b5fd; }
        .ml-row-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ml-row-info strong {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ml-row-info span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }
        .ml-play-circle {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: #0071e3;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .ml-empty-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 34px 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.18);
          text-align: center;
        }
        .ml-empty-card strong {
          font-size: 15px;
          color: #ffffff;
        }
        .ml-empty-card p {
          margin: 0;
          max-width: 380px;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.72);
        }
        .ml-empty-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 4px;
        }

        .ml-following-wrap {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ml-feed-block {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .ml-section-subhead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 2px;
        }
        .ml-section-subhead strong {
          display: block;
          font-size: 14px;
          font-weight: 750;
          color: #ffffff;
        }
        .ml-section-subhead span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.7);
        }
        .ml-mini-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
          white-space: nowrap;
        }
        .ml-spin {
          animation: mlSpin 0.9s linear infinite;
        }
        @keyframes mlSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .ml-creator-card {
          border-radius: 14px;
          background: rgba(24, 28, 38, 0.52);
          border: 1px solid rgba(255, 255, 255, 0.16);
          overflow: hidden;
        }
        .ml-creator-links-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 0 10px 9px;
        }
        .ml-platform-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 999px;
          background: rgba(100, 210, 255, 0.14);
          border: 1px solid rgba(100, 210, 255, 0.35);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 650;
          text-decoration: none;
        }
        .ml-creator-links-form {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 8px 10px 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ml-creator-links-form input {
          width: 100%;
          box-sizing: border-box;
          padding: 7px 11px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(10, 14, 22, 0.55);
          color: #ffffff;
          font-size: 12px;
          outline: none;
        }
        .ml-creator-links-form input:focus {
          border-color: #64d2ff;
        }
        .ml-creator-form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        @media (max-width: 960px) {
          .ml-topbar {
            padding: 10px 14px;
          }
          .ml-nav {
            display: none;
          }
        }
        @media (max-width: 640px) {
          .ml-main {
            padding: 10px 12px 0;
          }
          .ml-thumb-wrap {
            width: 68px;
            height: 50px;
          }
          .ml-vault-row {
            gap: 9px;
            padding: 8px 9px;
          }
          .ml-icon-action {
            width: 30px;
            height: 30px;
          }
        }
      `}</style>
    </div>
  );
}
