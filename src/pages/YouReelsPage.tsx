import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Heart,
  LayoutGrid,
  Maximize2,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Search,
  Sparkles,
  RotateCcw,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { FacebookSdkVideoPlayer } from '../components/player/FacebookSdkVideoPlayer';
import { XOfficialTweetEmbed } from '../components/player/XOfficialTweetEmbed';
import { useSignalStore } from '../lib/tv/signalStore';
import { persistSignal } from '../lib/tv/signalPersistence';
import { supabase } from '../lib/supabase';
import type { ScheduleBlock } from '../lib/tv/signalTypes';
import {
  loadYouReelsFromCloud,
  loadYouReelsWorkspace,
  resolveReelPointer,
  saveYouReelsWorkspace,
  type ReelItem,
  type YouReelsWorkspace
} from '../lib/tv/youReelsStore';
import {
  loadSocialGraph,
  loadSocialGraphFromCloud,
  saveSocialGraph,
  toggleInList,
  type YouAppSocialGraph
} from '../lib/tv/youappSocialStore';

const PROVIDER_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube Short',
  facebook: 'Facebook',
  x: 'X',
  twitch: 'Twitch',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  direct: 'Video'
};

const SHORTS_TOPICS = [
  { id: 'all', label: 'Para vos', tag: null },
  { id: 'noticias', label: 'Noticias', tag: 'noticias' },
  { id: 'deportes', label: 'Deportes', tag: 'deportes' },
  { id: 'streaming', label: 'Streaming', tag: 'streaming' },
  { id: 'musica', label: 'Música', tag: 'musica' },
  { id: 'documentales', label: 'Documentales', tag: 'documentales' },
  { id: 'cocina', label: 'Cocina', tag: 'cocina' },
  { id: 'tech', label: 'Tech', tag: 'tech' }
] as const;

export default function YouReelsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setSignal = useSignalStore((s) => s.setSignal);

  const [workspace, setWorkspace] = useState<YouReelsWorkspace>(() => loadYouReelsWorkspace());
  const [feedMode, setFeedMode] = useState<'discover' | 'collections'>(() =>
    searchParams.get('add') ? 'collections' : 'discover'
  );
  const [shortsTopic, setShortsTopic] = useState<string>('all');
  const [discoverShorts, setDiscoverShorts] = useState<ReelItem[]>([]);
  const [discoverTotalCount, setDiscoverTotalCount] = useState<number>(0);
  const [discoverOffset, setDiscoverOffset] = useState<number>(0);
  const [loadingShorts, setLoadingShorts] = useState<boolean>(false);
  const [socialGraph, setSocialGraph] = useState<YouAppSocialGraph>(() => loadSocialGraph());
  const [urlInput, setUrlInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [orientationOverride, setOrientationOverride] = useState<'auto' | 'vertical' | 'horizontal'>(
    'auto'
  );
  const [isColMenuOpen, setIsColMenuOpen] = useState(false);
  const [isCreatingCol, setIsCreatingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [isRenamingCol, setIsRenamingCol] = useState(false);
  const [renameColDraft, setRenameColDraft] = useState('');
  const [isYou4Mode, setIsYou4Mode] = useState(false);
  const [you4AudioSlot, setYou4AudioSlot] = useState(0);
  const [you4Offset, setYou4Offset] = useState(0);
  const [singleReplayKey, setSingleReplayKey] = useState(0);
  const [you4ReplayKeys, setYou4ReplayKeys] = useState<number[]>([0, 0, 0, 0]);
  const [you4AllPlaying, setYou4AllPlaying] = useState(false);
  const [you4PlayAllTick, setYou4PlayAllTick] = useState(0);
  const [you4PauseAllTick, setYou4PauseAllTick] = useState(0);

  const colMenuRef = useRef<HTMLDivElement | null>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  const handledAddRef = useRef<string | null>(null);
  const you4IframesRef = useRef<(HTMLIFrameElement | null)[]>([]);
  const you4VideosRef = useRef<(HTMLVideoElement | null)[]>([]);

  const handleSelectYou4Audio = useCallback((slotIdx: number) => {
    setYou4AudioSlot(slotIdx);
    for (let i = 0; i < 4; i++) {
      const iframe = you4IframesRef.current[i];
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: i === slotIdx ? 'unMute' : 'mute', args: [] }),
            '*'
          );
          if (i === slotIdx) {
            iframe.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
              '*'
            );
            iframe.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
          }
        } catch {
          // ignore
        }
      }
      const vid = you4VideosRef.current[i];
      if (vid) {
        vid.muted = i !== slotIdx;
        if (i === slotIdx) void vid.play().catch(() => {});
      }
    }
  }, []);

  const handleTogglePlayAllYou4 = useCallback(() => {
    setYou4AllPlaying((prev) => {
      const shouldPlay = !prev;
      for (let i = 0; i < 4; i++) {
        const iframe = you4IframesRef.current[i];
        if (iframe?.contentWindow) {
          try {
            if (shouldPlay) {
              iframe.contentWindow.postMessage(
                JSON.stringify({
                  event: 'command',
                  func: i === you4AudioSlot ? 'unMute' : 'mute',
                  args: []
                }),
                '*'
              );
              if (i === you4AudioSlot) {
                iframe.contentWindow.postMessage(
                  JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
                  '*'
                );
              }
              iframe.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                '*'
              );
            } else {
              iframe.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
                '*'
              );
            }
          } catch {
            // ignore
          }
        }
        const vid = you4VideosRef.current[i];
        if (vid) {
          if (shouldPlay) {
            vid.muted = i !== you4AudioSlot;
            void vid.play().catch(() => {});
          } else {
            vid.pause();
          }
        }
      }
      if (shouldPlay) setYou4PlayAllTick((t) => t + 1);
      else setYou4PauseAllTick((t) => t + 1);
      return shouldPlay;
    });
  }, [you4AudioSlot]);

  const fetchDiscoverShortsBatch = useCallback(
    async (topicId: string, offset: number, append: boolean) => {
      setLoadingShorts(true);
      const topicObj = SHORTS_TOPICS.find((t) => t.id === topicId);
      const tagFilter = topicObj?.tag
        ? ['atlas-pointer-compact', 'shorts', topicObj.tag]
        : ['atlas-pointer-compact', 'shorts'];

      try {
        const { data, count } = await supabase
          .from('youapp_index')
          .select('video_id,title,creator_name,thumbnail_url,thumbnail,views,published_at,language', {
            count: 'exact'
          })
          .eq('provider', 'youtube')
          .contains('tags', tagFilter)
          .order('published_at', { ascending: false })
          .range(offset, offset + 149);

        if (typeof count === 'number') setDiscoverTotalCount(count);
        if (!Array.isArray(data)) return;

        // Español primero + variedad por canal (máx 4 por tanda)
        const sorted = [...data].sort((a: any, b: any) => {
          const aEs = a?.language === 'es' ? 1 : 0;
          const bEs = b?.language === 'es' ? 1 : 0;
          if (aEs !== bEs) return bEs - aEs;
          return Number(b?.views || 0) - Number(a?.views || 0);
        });

        const creatorCount = new Map<string, number>();
        const mapped: ReelItem[] = [];
        for (const r of sorted) {
          const vid = String(r?.video_id || '').trim();
          if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
          const creator = String(r?.creator_name || 'YouTube');
          const cKey = creator.toLowerCase();
          const used = creatorCount.get(cKey) || 0;
          if (used >= 4) continue;
          creatorCount.set(cKey, used + 1);
          mapped.push({
            id: `short-${vid}`,
            provider: 'youtube',
            providerId: vid,
            title: String(r?.title || 'YouTube Short'),
            author: creator,
            sourceUrl: `https://www.youtube.com/shorts/${vid}`,
            embedUrl: `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
            thumbnailUrl: String(r?.thumbnail_url || r?.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`),
            addedAt: String(r?.published_at || new Date().toISOString())
          });
        }

        if (append) {
          setDiscoverShorts((prev) => {
            const seen = new Set(prev.map((p) => p.providerId));
            return [...prev, ...mapped.filter((m) => !seen.has(m.providerId))];
          });
        } else {
          setDiscoverShorts(mapped);
          setCurrentIndex(0);
        }
        setDiscoverOffset(offset + 150);
      } finally {
        setLoadingShorts(false);
      }
    },
    []
  );

  // Cargar feed real de YouTube Shorts desde youapp_index (0 cuota API)
  useEffect(() => {
    if (feedMode !== 'discover') return;
    void fetchDiscoverShortsBatch(shortsTopic, 0, false);
  }, [feedMode, shortsTopic, fetchDiscoverShortsBatch]);

  // Carga infinita automática cuando el usuario se acerca al final del lote actual
  useEffect(() => {
    if (feedMode !== 'discover' || loadingShorts) return;
    if (discoverShorts.length === 0) return;
    if (discoverOffset >= discoverTotalCount && discoverTotalCount > 0) return;
    if (currentIndex >= discoverShorts.length - 8) {
      void fetchDiscoverShortsBatch(shortsTopic, discoverOffset, true);
    }
  }, [
    feedMode,
    loadingShorts,
    currentIndex,
    discoverShorts.length,
    discoverOffset,
    discoverTotalCount,
    shortsTopic,
    fetchDiscoverShortsBatch
  ]);

  const activeCollection = useMemo(
    () =>
      workspace.collections.find((c) => c.id === workspace.activeCollectionId) ||
      workspace.collections[0],
    [workspace]
  );
  const items = useMemo(
    () => (feedMode === 'discover' ? discoverShorts : activeCollection?.items || []),
    [feedMode, discoverShorts, activeCollection?.items]
  );
  const safeIndex = items.length > 0 ? Math.min(currentIndex, items.length - 1) : 0;
  const currentItem = items[safeIndex] || null;

  // Detecta automáticamente si el video es horizontal (ej. Facebook /videos o /watch) o vertical (Reels/TikTok/Shorts)
  const isHorizontalMode = useMemo(() => {
    if (orientationOverride === 'horizontal') return true;
    if (orientationOverride === 'vertical') return false;
    if (!currentItem) return false;
    if (currentItem.provider === 'facebook') {
      return !/\/reel\//i.test(currentItem.sourceUrl);
    }
    if (currentItem.provider === 'twitch' || currentItem.provider === 'vimeo' || currentItem.provider === 'dailymotion') {
      return true;
    }
    if (currentItem.provider === 'youtube') {
      return !/\/shorts\//i.test(currentItem.sourceUrl) && currentItem.title.length > 0 && false;
    }
    return false;
  }, [currentItem, orientationOverride]);

  useEffect(() => {
    setOrientationOverride('auto');
  }, [currentItem?.id]);

  const updateWorkspace = (updater: (prev: YouReelsWorkspace) => YouReelsWorkspace) => {
    setWorkspace((prev) => saveYouReelsWorkspace(updater(prev)));
  };

  // Bookmarklet "+ Reels" para PC (1 clic desde Instagram / TikTok / X / YouTube Shorts)
  // Si estás en el feed (sin URL directa del video), detecta automáticamente el video/post visible en el centro de la pantalla
  useEffect(() => {
    const el = bookmarkletRef.current;
    if (!el || typeof window === 'undefined') return;
    const origin = window.location.origin;
    const script =
      `javascript:(function(){var u=location.href,cy=innerHeight/2;` +
      `function pick(sel){var best=null,bd=1e9;document.querySelectorAll(sel).forEach(function(a){` +
      `var r=a.getBoundingClientRect();if(r.width>0&&r.height>0){var d=Math.abs((r.top+r.bottom)/2-cy);if(d<bd){bd=d;best=a.href;}}});return best;}` +
      `if(/(x\\.com|twitter\\.com)/i.test(u)&&!/\\/status\\/\\d+/i.test(u)){var x=pick('a[href*="/status/"]');if(x)u=x;}` +
      `else if(/instagram\\.com/i.test(u)&&!/\\/(reel|reels|p|tv)\\//i.test(u)){var ig=pick('a[href*="/reel/"],a[href*="/p/"]');if(ig)u=ig;}` +
      `else if(/tiktok\\.com/i.test(u)&&!/\\/(video|photo)\\/\\d+/i.test(u)){` +
      `var tt=pick('a[href*="/video/"],a[href*="/photo/"]');` +
      `if(!tt){var bv=null,bvd=1e9;document.querySelectorAll('video').forEach(function(v){` +
      `var r=v.getBoundingClientRect();if(r.width>50&&r.height>50){var d=Math.abs((r.top+r.bottom)/2-cy);if(d<bvd){bvd=d;bv=v;}}});` +
      `var n=bv;while(n&&!tt){var m=(n.id||'').match(/(\\d{18,20})/);if(m){tt='https://www.tiktok.com/video/'+m[1];break;}n=n.parentElement;}}` +
      `if(tt)u=tt;}` +
      `window.open('${origin}/reels?add='+encodeURIComponent(u),'youapp_reels');})();`;
    el.setAttribute('href', script);
  }, []);

  useEffect(() => {
    loadYouReelsFromCloud()
      .then((merged) => {
        if (merged) setWorkspace(merged);
      })
      .catch(() => {});
    loadSocialGraphFromCloud()
      .then((merged) => {
        if (merged) setSocialGraph(merged);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isColMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setIsColMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isColMenuOpen]);

  // Navegación vertical rápida con flechas Arriba / Abajo
  useEffect(() => {
    if (items.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length]);

  // Recepción automática /reels?add=<URL> (desde Android Share o botón "+ Reels")
  useEffect(() => {
    const addUrl = searchParams.get('add')?.trim();
    if (!addUrl || handledAddRef.current === addUrl) return;
    handledAddRef.current = addUrl;

    let cancelled = false;
    setIsAdding(true);
    setErrorMsg(null);
    resolveReelPointer(addUrl)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(`${res.error} (Recibido: ${addUrl.slice(0, 90)})`);
          setSearchParams({}, { replace: true });
          return;
        }
        const customT = searchParams.get('t')?.trim();
        const incoming: ReelItem = customT ? { ...res.item, title: customT } : res.item;
        const currentWs = loadYouReelsWorkspace();
        let targetIndex = 0;
        let exists = false;
        const nextWs: YouReelsWorkspace = {
          ...currentWs,
          collections: currentWs.collections.map((col) => {
            if (col.id !== currentWs.activeCollectionId) return col;
            const idx = col.items.findIndex(
              (x) => x.provider === incoming.provider && x.providerId === incoming.providerId
            );
            if (idx >= 0) {
              targetIndex = idx;
              exists = true;
              return col;
            }
            targetIndex = col.items.length;
            return {
              ...col,
              items: [...col.items, incoming],
              updatedAt: new Date().toISOString()
            };
          })
        };
        setWorkspace(saveYouReelsWorkspace(nextWs));
        setCurrentIndex(targetIndex);
        setSearchParams({}, { replace: true });
        setToast(exists ? 'Ese Reel ya estaba en tu lista.' : `Reproduciendo: «${incoming.title}»`);
      })
      .finally(() => {
        if (!cancelled) setIsAdding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isAdding) return;
    setErrorMsg(null);
    setIsAdding(true);
    try {
      const res = await resolveReelPointer(urlInput);
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      const currentWs = loadYouReelsWorkspace();
      let targetIndex = 0;
      const nextWs: YouReelsWorkspace = {
        ...currentWs,
        collections: currentWs.collections.map((col) => {
          if (col.id !== currentWs.activeCollectionId) return col;
          const idx = col.items.findIndex(
            (x) => x.provider === res.item.provider && x.providerId === res.item.providerId
          );
          if (idx >= 0) {
            targetIndex = idx;
            return col;
          }
          targetIndex = col.items.length;
          return {
            ...col,
            items: [...col.items, res.item],
            updatedAt: new Date().toISOString()
          };
        })
      };
      setWorkspace(saveYouReelsWorkspace(nextWs));
      setCurrentIndex(targetIndex);
      setUrlInput('');
      setToast(`Reproduciendo: «${res.item.title}»`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newColName.trim();
    if (!cleaned) return;
    const newId = `reels-${Date.now().toString(36)}`;
    updateWorkspace((prev) => ({
      activeCollectionId: newId,
      collections: [
        ...prev.collections,
        { id: newId, name: cleaned, items: [], updatedAt: new Date().toISOString() }
      ]
    }));
    setCurrentIndex(0);
    setNewColName('');
    setIsCreatingCol(false);
    setToast(`Lista «${cleaned}» creada.`);
  };

  const handleRenameCollection = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = renameColDraft.trim();
    if (!cleaned) {
      setIsRenamingCol(false);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      collections: prev.collections.map((c) =>
        c.id === prev.activeCollectionId ? { ...c, name: cleaned, updatedAt: new Date().toISOString() } : c
      )
    }));
    setIsRenamingCol(false);
    setToast(`Renombrada a «${cleaned}».`);
  };

  const handleDeleteCollection = () => {
    if (workspace.collections.length <= 1 || !activeCollection) return;
    const removed = activeCollection.name;
    updateWorkspace((prev) => {
      const remaining = prev.collections.filter((c) => c.id !== prev.activeCollectionId);
      return {
        collections: remaining,
        activeCollectionId: remaining[0]?.id || prev.activeCollectionId
      };
    });
    setCurrentIndex(0);
    setToast(`Lista «${removed}» eliminada.`);
  };

  const handleRemoveItem = (itemId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      collections: prev.collections.map((c) =>
        c.id !== prev.activeCollectionId
          ? c
          : { ...c, items: c.items.filter((i) => i.id !== itemId), updatedAt: new Date().toISOString() }
      )
    }));
  };

  const handleSendToMiSenalRedes = (focusItem?: ReelItem) => {
    const col = activeCollection;
    if (!col || col.items.length === 0) {
      setToast('Agregá al menos un Reel antes de enviarlo a Mi Señal Redes.');
      return;
    }
    const orderedItems = focusItem
      ? [focusItem, ...col.items.filter((it) => it.id !== focusItem.id)]
      : col.items;
    const signalId = `signal-mi-senal-redes-${col.id.replace(/^reels-/, '')}`;
    const schedule: ScheduleBlock[] = orderedItems.map((it, idx) => ({
      id: `${signalId}-blk-${idx}`,
      position: idx,
      startOffsetSec: idx * 90,
      durationSec: 90,
      topic: `Mi Señal Redes · ${PROVIDER_LABELS[it.provider] || it.provider}`,
      role: idx === 0 ? 'opening' : 'explainer',
      contentItem: {
        id: it.providerId,
        providerId: it.providerId,
        type: 'video',
        provider: it.provider === 'direct' ? 'mp4' : it.provider,
        title: it.title,
        thumbnailUrl: it.thumbnailUrl,
        thumbnail: it.thumbnailUrl,
        videoUrl: it.sourceUrl,
        originUrl: it.sourceUrl,
        channelName: it.author,
        channelTitle: it.author,
        channelId: `redes-${it.providerId}`,
        isLive: false,
        isVerified: true
      } as any
    }));
    const redesSignal: any = {
      id: signalId,
      name: `Mi Señal Redes · ${col.name}`,
      seedVersion: 5,
      prompt: `Colección de Reels creada en YOUAPP · ${col.name}`,
      visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      schedule
    };
    setSignal(redesSignal, { saveToOwn: true });
    void persistSignal(redesSignal);
    setToast(`«Mi Señal Redes · ${col.name}» guardada y abierta en Mi Señal.`);
    navigate(`/misenal1?signal=${encodeURIComponent(signalId)}`);
  };

  const handleShareCurrent = async () => {
    if (!currentItem) return;
    const url = `${window.location.origin}/reels?add=${encodeURIComponent(currentItem.sourceUrl)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: currentItem.title, url });
        return;
      }
    } catch {
      // fallback
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setToast('Enlace del Reel copiado.');
  };

  // Completa automáticamente miniaturas faltantes en Reels ya guardados (TikTok, Instagram, Facebook, X)
  const enrichedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missing = items.filter(
      (it) => !it.thumbnailUrl && !enrichedIdsRef.current.has(it.id) && it.sourceUrl
    );
    if (missing.length === 0) return;

    let cancelled = false;
    missing.slice(0, 8).forEach((it) => {
      enrichedIdsRef.current.add(it.id);
      if (it.provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(it.providerId)) {
        const ytThumb = `https://i.ytimg.com/vi/${it.providerId}/hqdefault.jpg`;
        updateWorkspace((prev) => ({
          ...prev,
          collections: prev.collections.map((c) => ({
            ...c,
            items: c.items.map((x) => (x.id === it.id ? { ...x, thumbnailUrl: ytThumb } : x))
          }))
        }));
        return;
      }
      fetch(`/api/mitv/social-meta?url=${encodeURIComponent(it.sourceUrl)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((meta) => {
          if (cancelled || !meta?.thumbnailUrl) return;
          updateWorkspace((prev) => ({
            ...prev,
            collections: prev.collections.map((c) => ({
              ...c,
              items: c.items.map((x) =>
                x.id === it.id
                  ? {
                      ...x,
                      thumbnailUrl: meta.thumbnailUrl,
                      title:
                        meta.title &&
                        (x.title.startsWith('Reel de ') ||
                          x.title.startsWith('Video de ') ||
                          x.title.startsWith('Publicación de '))
                          ? meta.title
                          : x.title
                    }
                  : x
              )
            }))
          }));
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const ambientThumb =
    currentItem?.thumbnailUrl || items.find((i) => i.thumbnailUrl)?.thumbnailUrl || '';

  const ambientDynamicStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (ambientThumb) {
      return { backgroundImage: `url(${ambientThumb})` };
    }
    const prov = currentItem?.provider;
    if (prov === 'instagram') {
      return {
        backgroundImage:
          'radial-gradient(ellipse 46% 48% at 22% 24%, rgba(251, 146, 60, 0.52) 0%, transparent 62%), radial-gradient(ellipse 48% 50% at 78% 36%, rgba(236, 72, 153, 0.48) 0%, transparent 64%), radial-gradient(ellipse 44% 42% at 50% 88%, rgba(168, 85, 247, 0.42) 0%, transparent 65%), linear-gradient(155deg, #1a1520 0%, #2a1929 48%, #15141c 100%)'
      };
    }
    if (prov === 'tiktok') {
      return {
        backgroundImage:
          'radial-gradient(ellipse 46% 48% at 22% 24%, rgba(34, 211, 238, 0.46) 0%, transparent 62%), radial-gradient(ellipse 48% 50% at 78% 68%, rgba(244, 63, 94, 0.46) 0%, transparent 64%), linear-gradient(155deg, #111820 0%, #1c1926 50%, #14141a 100%)'
      };
    }
    if (prov === 'facebook') {
      return {
        backgroundImage:
          'radial-gradient(ellipse 48% 48% at 24% 22%, rgba(56, 189, 248, 0.48) 0%, transparent 62%), radial-gradient(ellipse 48% 48% at 78% 72%, rgba(37, 99, 235, 0.48) 0%, transparent 64%), linear-gradient(155deg, #121826 0%, #1b2842 50%, #121620 100%)'
      };
    }
    return undefined;
  }, [ambientThumb, currentItem?.provider]);

  return (
    <div className="yr-page">
      <div
        className="yr-ambient-bg"
        aria-hidden="true"
        style={ambientDynamicStyle}
      />
      <div className="yr-ambient-veil" aria-hidden="true" />

      <header className="yr-header">
        <div className="yr-header-left">
          <button type="button" className="yr-logo-btn" onClick={() => navigate('/misenal1')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="yr-pill-brand">REELS</span>
        </div>

        <nav className="yr-nav">
          <button type="button" className="yr-nav-btn" onClick={() => navigate('/misenal1')}>
            MI SEÑAL
          </button>
          <button type="button" className="yr-nav-btn" onClick={() => navigate('/mitv')}>
            MITV
          </button>
          <button type="button" className="yr-nav-btn" onClick={() => navigate('/youmusic')}>
            YOU MUSIC
          </button>
          <button type="button" className="yr-nav-btn" onClick={() => navigate('/lecturas')}>
            LECTURAS
          </button>
          <button type="button" className="yr-nav-btn" onClick={() => navigate('/dial')}>
            YOU DIAL
          </button>
          <button type="button" className="yr-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button
            type="button"
            className="yr-nav-btn"
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

      <main className={`yr-main ${isYou4Mode ? 'is-you4' : ''}`}>
        {toast && (
          <div className="yr-toast" role="status">
            <Check size={14} />
            <span>{toast}</span>
          </div>
        )}

        {/* 1. CABECERA DE FEED SHORTS / COLECCIONES */}
        <section className="yr-card yr-top-card">
          <div className="yr-mode-bar">
            <div className="yr-mode-tabs" role="tablist" aria-label="Modo de Reels">
              <button
                type="button"
                role="tab"
                aria-selected={feedMode === 'discover'}
                className={`yr-mode-tab ${feedMode === 'discover' ? 'active' : ''}`}
                onClick={() => {
                  setFeedMode('discover');
                  setCurrentIndex(0);
                }}
              >
                <Sparkles size={13} /> Descubrir Shorts{' '}
                {(discoverTotalCount || discoverShorts.length) > 0
                  ? `(${(discoverTotalCount || discoverShorts.length).toLocaleString('es-AR')})`
                  : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={feedMode === 'collections'}
                className={`yr-mode-tab ${feedMode === 'collections' ? 'active' : ''}`}
                onClick={() => {
                  setFeedMode('collections');
                  setCurrentIndex(0);
                }}
              >
                <Film size={13} /> Mis Colecciones ({activeCollection?.items.length || 0})
              </button>
            </div>

            {feedMode === 'discover' && currentItem && (
              <button
                type="button"
                className="yr-save-short-btn"
                onClick={() => {
                  updateWorkspace((prev) => ({
                    ...prev,
                    collections: prev.collections.map((col) => {
                      if (col.id !== activeCollection?.id) return col;
                      if (col.items.some((it) => it.providerId === currentItem.providerId)) return col;
                      return { ...col, items: [currentItem, ...col.items] };
                    })
                  }));
                  setToast(`Guardado en «${activeCollection?.name || 'Mis Reels'}»`);
                }}
              >
                <Plus size={13} /> Guardar en mi colección
              </button>
            )}
          </div>

          {feedMode === 'discover' && (
            <div className="yr-topic-row" role="tablist" aria-label="Temas de Shorts">
              {SHORTS_TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={shortsTopic === t.id}
                  className={`yr-topic-pill ${shortsTopic === t.id ? 'active' : ''}`}
                  onClick={() => setShortsTopic(t.id)}
                >
                  {t.label}
                </button>
              ))}
              {loadingShorts && <span className="yr-topic-loading">Cargando…</span>}
            </div>
          )}

          <div className="yr-top-row">
            <div className="yr-col-dropdown" ref={colMenuRef}>
              {isRenamingCol ? (
                <form className="yr-inline-form" onSubmit={handleRenameCollection}>
                  <input
                    type="text"
                    value={renameColDraft}
                    onChange={(e) => setRenameColDraft(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="yr-icon-btn" title="Guardar">
                    <Check size={14} color="#64d2ff" />
                  </button>
                  <button
                    type="button"
                    className="yr-icon-btn"
                    onClick={() => setIsRenamingCol(false)}
                    title="Cancelar"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <div className="yr-col-controls">
                  <button
                    type="button"
                    className="yr-col-trigger"
                    onClick={() => setIsColMenuOpen((v) => !v)}
                  >
                    <Film size={14} color="#64d2ff" />
                    <span>{activeCollection?.name || 'Mis Reels'}</span>
                    <em>{items.length}</em>
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="yr-icon-btn"
                    onClick={() => {
                      setRenameColDraft(activeCollection?.name || 'Mis Reels');
                      setIsRenamingCol(true);
                    }}
                    title="Renombrar lista"
                  >
                    <Pencil size={13} />
                  </button>
                  {workspace.collections.length > 1 && (
                    <button
                      type="button"
                      className="yr-icon-btn"
                      onClick={handleDeleteCollection}
                      title="Eliminar lista"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}

              {isColMenuOpen && (
                <div className="yr-col-menu" role="listbox">
                  {workspace.collections.map((col) => {
                    const selected = col.id === activeCollection?.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        className={`yr-col-opt ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          updateWorkspace((prev) => ({ ...prev, activeCollectionId: col.id }));
                          setCurrentIndex(0);
                          setIsColMenuOpen(false);
                        }}
                      >
                        <span>{col.name}</span>
                        <span>
                          <em>{col.items.length}</em>
                          {selected && <Check size={13} color="#64d2ff" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`yr-you4-btn ${isYou4Mode ? 'active' : ''}`}
                disabled={items.length === 0}
                onClick={() => {
                  setIsYou4Mode((prev) => {
                    const next = !prev;
                    if (next) {
                      setYou4AudioSlot(0);
                      setYou4Offset(0);
                    }
                    return next;
                  });
                }}
                title={isYou4Mode ? 'Volver a 1 Reel' : 'YOU4: ver 4 Reels en simultáneo'}
                aria-pressed={isYou4Mode}
              >
                <LayoutGrid size={13} />
                <span>{isYou4Mode ? 'Salir YOU4' : 'YOU4'}</span>
              </button>

              <button
                type="button"
                className="yr-pill-btn"
                onClick={() => setIsCreatingCol((v) => !v)}
              >
                <Plus size={13} /> Nueva lista
              </button>
            </div>
          </div>

          {isCreatingCol && (
            <form className="yr-new-col-form" onSubmit={handleCreateCollection}>
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Nombre de la lista (ej. Recetas, Humor, Deportes…)"
                autoFocus
              />
              <button type="submit" className="yr-btn-primary">
                Crear
              </button>
            </form>
          )}
        </section>

        {/* 2. BARRA DISIMULADA PARA PEGAR URL + BOTÓN ARRASTRABLE + REELS */}
        <section className="yr-add-bar" aria-label="Sumar Reel por URL">
          <form className="yr-add-form" onSubmit={handleAddUrl}>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="+ Pegá URL de Instagram Reel, TikTok, YouTube Short, Facebook o X…"
              aria-label="Pegar enlace de Reel"
            />
            <button type="submit" className="yr-add-submit" disabled={isAdding}>
              <Plus size={14} />
              <span>{isAdding ? 'Sumando…' : 'Sumar'}</span>
            </button>
            <a
              ref={bookmarkletRef}
              href="#reels-bookmarklet"
              className="yr-bookmarklet"
              onClick={(e) => {
                e.preventDefault();
                setToast('Arrastrá «+ Reels» a tu barra de marcadores para guardar Reels en 1 clic.');
              }}
              title="Arrastrá a tu barra de marcadores para enviar Reels desde Instagram, TikTok o YouTube en 1 clic"
            >
              <Plus size={12} /> Reels
            </a>
          </form>
          {errorMsg && <div className="yr-error">{errorMsg}</div>}
        </section>

        {/* 3. ESCENARIO FLEXIBLE 9:16 (VERTICAL) / 16:9 (HORIZONTAL) o YOU4 (4 REELS) */}
        {currentItem ? (
          isYou4Mode ? (() => {
            const pool: { item: ReelItem; itemIdx: number | null }[] = [];
            const seen = new Set<string>();
            const total = items.length;
            for (let step = 0; step < total; step++) {
              const idx = (safeIndex + you4Offset + step) % total;
              const it = items[idx];
              if (!it) continue;
              const key = `${it.provider}:${it.providerId || it.sourceUrl}`;
              if (seen.has(key)) continue;
              seen.add(key);
              pool.push({ item: it, itemIdx: idx });
              if (pool.length >= 4) break;
            }
            if (pool.length < 4) {
              for (const col of workspace.collections) {
                if (col.id === activeCollection?.id) continue;
                for (const it of col.items) {
                  const key = `${it.provider}:${it.providerId || it.sourceUrl}`;
                  if (seen.has(key)) continue;
                  seen.add(key);
                  pool.push({ item: it, itemIdx: null });
                  if (pool.length >= 4) break;
                }
                if (pool.length >= 4) break;
              }
            }
            const quadReels = pool.slice(0, 4);
            const ytOrigin =
              typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

            return (
              <section className="yr-you4-shell" aria-label="YOU4 · 4 Reels en simultáneo">
                <div className="yr-you4-bar">
                  <span className="yr-you4-badge">
                    <LayoutGrid size={13} color="#64d2ff" />
                    <strong>YOU4 Reels</strong> · {quadReels.length} pantallas simultáneas
                  </span>
                  <div className="yr-you4-bar-actions">
                    {items.length > 4 && (
                      <>
                        <button
                          type="button"
                          className="yr-pill-btn"
                          onClick={() =>
                            setYou4Offset((p) => (p - 4 + Math.max(4, items.length)) % items.length)
                          }
                        >
                          <ChevronUp size={14} /> Anteriores 4
                        </button>
                        <button
                          type="button"
                          className="yr-pill-btn"
                          onClick={() => setYou4Offset((p) => (p + 4) % items.length)}
                        >
                          <ChevronDown size={14} /> Siguientes 4
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="yr-you4-btn active"
                      onClick={() => setIsYou4Mode(false)}
                    >
                      Volver a 1 Reel
                    </button>
                  </div>
                </div>

                <div className="yr-you4-grid-wrap">
                  <button
                    type="button"
                    className={`yr-you4-center-btn ${you4AllPlaying ? 'playing' : ''}`}
                    onClick={handleTogglePlayAllYou4}
                    title={
                      you4AllPlaying
                        ? 'Pausar las 4 pantallas'
                        : 'Activar y reproducir las 4 pantallas a la vez'
                    }
                    aria-label={you4AllPlaying ? 'Pausar las 4 pantallas' : 'Activar las 4 pantallas'}
                  >
                    {you4AllPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
                    <span>{you4AllPlaying ? 'Pausar 4' : 'Activar 4'}</span>
                  </button>

                  <div className="yr-you4-grid">
                  {quadReels.map((slot, slotIdx) => {
                    const isAudioActive = you4AudioSlot === slotIdx;
                    const it = slot.item;
                    return (
                      <div
                        key={`${it.id}-${slotIdx}-${you4ReplayKeys[slotIdx] || 0}`}
                        className={`yr-card yr-you4-tile ${isAudioActive ? 'audio-active' : ''}`}
                        onClick={() => handleSelectYou4Audio(slotIdx)}
                      >
                        <div className="yr-you4-viewport">
                          {it.provider === 'youtube' && (
                            <iframe
                              ref={(el) => {
                                you4IframesRef.current[slotIdx] = el;
                              }}
                              title={`YOU4 · ${it.title}`}
                              src={`https://www.youtube.com/embed/${encodeURIComponent(it.providerId)}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&loop=1&playlist=${encodeURIComponent(it.providerId)}&enablejsapi=1${ytOrigin ? `&origin=${ytOrigin}` : ''}`}
                              onLoad={(e) => {
                                try {
                                  e.currentTarget.contentWindow?.postMessage(
                                    JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                                    '*'
                                  );
                                  if (slotIdx === 0) {
                                    e.currentTarget.contentWindow?.postMessage(
                                      JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
                                      '*'
                                    );
                                  }
                                } catch {
                                  // ignore
                                }
                              }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          )}
                          {it.provider === 'tiktok' && (
                            <iframe
                              title={`YOU4 · ${it.title}`}
                              src={`https://www.tiktok.com/player/v1/${encodeURIComponent(it.providerId)}?embed_from=oembed&music_info=1&description=1&autoplay=1&muted=1`}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                              allowFullScreen
                            />
                          )}
                          {it.provider === 'instagram' && (
                            <iframe
                              title={`YOU4 · ${it.title}`}
                              src={`https://www.instagram.com/${it.providerId}/embed/`}
                              allow="autoplay; encrypted-media; fullscreen"
                              allowFullScreen
                            />
                          )}
                          {it.provider === 'facebook' && (
                            <FacebookSdkVideoPlayer
                              url={it.sourceUrl}
                              title={`YOU4 · ${it.title}`}
                              width={280}
                              muted={!isAudioActive}
                              autoplay
                              playTrigger={you4PlayAllTick}
                              pauseTrigger={you4PauseAllTick}
                            />
                          )}
                          {it.provider === 'x' && (
                            <XOfficialTweetEmbed tweetId={it.providerId} sourceUrl={it.sourceUrl} />
                          )}
                          {it.provider === 'direct' && (
                            <video
                              ref={(el) => {
                                you4VideosRef.current[slotIdx] = el;
                              }}
                              src={it.sourceUrl}
                              autoPlay
                              loop
                              playsInline
                              muted={!isAudioActive}
                            />
                          )}

                          <div className="yr-you4-top-bar">
                            <span className="yr-you4-prov">
                              {slotIdx + 1} · {PROVIDER_LABELS[it.provider] || 'Reel'}
                            </span>
                            <div className="yr-you4-tile-actions">
                              {(it.provider === 'youtube' ||
                                it.provider === 'direct' ||
                                it.provider === 'facebook') && (
                                <button
                                  type="button"
                                  className={`yr-you4-chip ${isAudioActive ? 'active' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectYou4Audio(slotIdx);
                                  }}
                                  title={isAudioActive ? 'Audio activo' : 'Escuchar este Reel'}
                                >
                                  {isAudioActive ? <Volume2 size={11} /> : <VolumeX size={11} />}
                                  <span>{isAudioActive ? 'Audio' : 'Mudo'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="yr-you4-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setYou4ReplayKeys((prev) =>
                                    prev.map((v, i) => (i === slotIdx ? v + 1 : v))
                                  );
                                }}
                                title="Repetir este Reel sin salir de YOUAPP"
                                aria-label="Repetir este Reel"
                              >
                                <RotateCcw size={11} />
                              </button>
                              <button
                                type="button"
                                className="yr-you4-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (slot.itemIdx !== null) {
                                    setCurrentIndex(slot.itemIdx);
                                  }
                                  setIsYou4Mode(false);
                                }}
                                title="Ver este Reel en grande"
                                aria-label="Ver este Reel en grande"
                              >
                                <Maximize2 size={11} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="yr-you4-meta">
                          <strong>{it.title}</strong>
                          <span>{it.author}</span>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </section>
            );
          })() : (
          <section className={`yr-stage-wrap ${isHorizontalMode ? 'is-horizontal' : ''}`}>
            <div className={`yr-card yr-reel-frame ${isHorizontalMode ? 'is-horizontal' : ''}`}>
              <div
                key={`vp-${currentItem.id}-${safeIndex}-${singleReplayKey}`}
                className={`yr-reel-viewport ${isHorizontalMode ? 'is-horizontal' : ''}`}
              >
                {currentItem.provider === 'youtube' && (
                  <iframe
                    key={`yt-${currentItem.providerId}-${safeIndex}`}
                    title={currentItem.title}
                    src={`https://www.youtube.com/embed/${encodeURIComponent(currentItem.providerId)}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&loop=1&playlist=${encodeURIComponent(currentItem.providerId)}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
                {currentItem.provider === 'tiktok' && (
                  <iframe
                    key={`tt-${currentItem.providerId}-${safeIndex}`}
                    title={currentItem.title}
                    src={`https://www.tiktok.com/player/v1/${encodeURIComponent(currentItem.providerId)}?embed_from=oembed&music_info=1&description=1&autoplay=1&muted=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                )}
                {currentItem.provider === 'instagram' && (
                  <iframe
                    key={`ig-${currentItem.providerId}-${safeIndex}`}
                    title={currentItem.title}
                    src={`https://www.instagram.com/${currentItem.providerId}/embed/`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                  />
                )}
                {currentItem.provider === 'facebook' && (
                  <FacebookSdkVideoPlayer
                    key={`fb-${currentItem.id}-${safeIndex}-${isHorizontalMode ? 'h' : 'v'}`}
                    url={currentItem.sourceUrl}
                    title={currentItem.title}
                    width={isHorizontalMode ? 640 : 360}
                    muted={true}
                    autoplay
                  />
                )}
                {currentItem.provider === 'x' && (
                  <XOfficialTweetEmbed
                    key={`x-${currentItem.providerId}-${safeIndex}`}
                    tweetId={currentItem.providerId}
                    sourceUrl={currentItem.sourceUrl}
                  />
                )}
                {currentItem.provider === 'direct' && (
                  <video src={currentItem.sourceUrl} controls autoPlay muted loop playsInline />
                )}
              </div>

              <div className="yr-reel-footer">
                <div className="yr-reel-meta">
                  <span className="yr-provider-pill">
                    {PROVIDER_LABELS[currentItem.provider] || 'Reel'} · {safeIndex + 1}/{items.length}
                  </span>
                  <strong>{currentItem.title}</strong>
                  <span>{currentItem.author}</span>
                </div>
              </div>
            </div>

            {/* Riel lateral de acciones rápidas (estilo Reels vertical) */}
            <div className="yr-side-rail">
              <button
                type="button"
                className="yr-rail-btn"
                disabled={items.length <= 1}
                onClick={() => setCurrentIndex((p) => (p - 1 + items.length) % items.length)}
                title="Reel anterior (↑)"
              >
                <ChevronUp size={20} />
              </button>
              <button
                type="button"
                className="yr-rail-btn"
                disabled={items.length <= 1}
                onClick={() => setCurrentIndex((p) => (p + 1) % items.length)}
                title="Siguiente Reel (↓)"
              >
                <ChevronDown size={20} />
              </button>

              {(() => {
                const likeKey = `${currentItem.provider}:${currentItem.providerId}`;
                const liked = socialGraph.likedVideoKeys.includes(likeKey);
                return (
                  <button
                    type="button"
                    className={`yr-rail-btn ${liked ? 'liked' : ''}`}
                    onClick={() =>
                      setSocialGraph((prev) => {
                        const { next } = toggleInList(prev.likedVideoKeys, likeKey);
                        return saveSocialGraph({ ...prev, likedVideoKeys: next });
                      })
                    }
                    title="Me gusta en YOUAPP"
                  >
                    <Heart size={18} fill={liked ? '#ff375f' : 'none'} />
                  </button>
                );
              })()}

              <button
                type="button"
                className="yr-rail-btn"
                onClick={() =>
                  setOrientationOverride(isHorizontalMode ? 'vertical' : 'horizontal')
                }
                title={
                  isHorizontalMode
                    ? 'Cambiar a formato vertical (9:16)'
                    : 'Cambiar a formato horizontal (16:9)'
                }
                style={{ fontSize: '10.5px', fontWeight: 700 }}
              >
                {isHorizontalMode ? '9:16' : '16:9'}
              </button>

              <button
                type="button"
                className="yr-rail-btn mitv"
                onClick={() => handleSendToMiSenalRedes(currentItem)}
                title="Enviar a Mi Señal como Mi Señal Redes"
              >
                <Radio size={17} />
                <span>Mi Señal Redes</span>
              </button>

              <button
                type="button"
                className="yr-rail-btn"
                onClick={() => setSingleReplayKey((k) => k + 1)}
                title="Repetir este Reel sin salir de YOUAPP"
                aria-label="Repetir Reel"
              >
                <RotateCcw size={17} />
              </button>

              <button
                type="button"
                className="yr-rail-btn"
                onClick={() => void handleShareCurrent()}
                title="Compartir Reel"
              >
                <Share2 size={17} />
              </button>

              <a
                href={currentItem.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="yr-rail-btn"
                title="Abrir en la red original"
              >
                <ExternalLink size={17} />
              </a>
            </div>
          </section>
          )
        ) : (
          <section className="yr-card yr-empty">
            <Film size={32} color="#64d2ff" />
            <strong>Tu espacio vertical de Reels está listo.</strong>
            <span>
              Pegá arriba cualquier enlace de Instagram Reels, TikTok, YouTube Shorts, Facebook o X
              — o arrastrá el botón <strong>+ Reels</strong> a tus marcadores.
            </span>
          </section>
        )}

        {/* 4. LISTA COMPACTA DE REELS GUARDADOS */}
        {items.length > 0 && (
          <section className="yr-card yr-list-card">
            <div className="yr-list-head">
              <h2>{activeCollection?.name || 'Mis Reels'}</h2>
              <span>{items.length} {items.length === 1 ? 'reel' : 'reels'}</span>
            </div>
            <div className="yr-list">
              {items.map((item, idx) => (
                <div key={item.id} className={`yr-row ${idx === safeIndex ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="yr-row-main"
                    onClick={() => setCurrentIndex(idx)}
                  >
                    <span className={`yr-row-thumb prov-${item.provider}`}>
                      {item.thumbnailUrl ? (
                        <>
                          <img src={item.thumbnailUrl} alt={item.title} referrerPolicy="no-referrer" />
                          <span className="yr-row-thumb-play">
                            <Play size={11} fill="#ffffff" color="#ffffff" />
                          </span>
                        </>
                      ) : (
                        <Play size={15} fill="#ffffff" color="#ffffff" />
                      )}
                    </span>
                    <span className="yr-row-text">
                      <strong>{item.title}</strong>
                      <span>
                        {PROVIDER_LABELS[item.provider] || item.provider} · {item.author}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="yr-icon-btn"
                    onClick={() => handleSendToMiSenalRedes(item)}
                    title="Enviar a Mi Señal Redes"
                  >
                    <Radio size={14} />
                  </button>
                  <button
                    type="button"
                    className="yr-icon-btn"
                    onClick={() => handleRemoveItem(item.id)}
                    title="Quitar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <style>{`
        .yr-page {
          position: relative;
          min-height: 100dvh;
          background: #14161a;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Geist', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          padding-bottom: 56px;
          overflow-x: hidden;
          isolation: isolate;
        }
        .yr-ambient-bg {
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
        .yr-ambient-veil {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: linear-gradient(
            180deg,
            rgba(18, 20, 24, 0.34) 0%,
            rgba(22, 24, 28, 0.22) 48%,
            rgba(14, 16, 20, 0.46) 100%
          );
          pointer-events: none;
        }
        .yr-header {
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
        .yr-header-left, .yr-nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .yr-logo-btn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
        }
        .yr-pill-brand {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.28);
          padding: 3px 10px;
          border-radius: 999px;
        }
        .yr-nav-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
        }
        .yr-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .yr-main {
          position: relative;
          z-index: 1;
          max-width: 720px;
          margin: 0 auto;
          padding: 18px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .yr-toast {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(28, 28, 30, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 600;
          align-self: flex-start;
        }
        .yr-card {
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.16) 0%,
            rgba(255, 255, 255, 0.10) 100%
          );
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 22px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.26),
            0 12px 32px rgba(0, 0, 0, 0.22);
        }
        .yr-top-card {
          padding: 12px 16px;
          position: relative;
          z-index: 30;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yr-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .yr-col-dropdown {
          position: relative;
        }
        .yr-col-controls, .yr-inline-form {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .yr-col-trigger {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .yr-col-trigger em {
          font-style: normal;
          font-size: 11px;
          opacity: 0.72;
        }
        .yr-col-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          min-width: 210px;
          z-index: 80;
          padding: 6px;
          border-radius: 16px;
          background: rgba(20, 22, 28, 0.94);
          backdrop-filter: blur(26px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .yr-col-opt {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: #f5f5f7;
          font-size: 13px;
          cursor: pointer;
        }
        .yr-col-opt:hover { background: rgba(255, 255, 255, 0.12); }
        .yr-col-opt.selected { background: rgba(10, 132, 255, 0.24); }
        .yr-col-opt em { font-style: normal; font-size: 11px; opacity: 0.65; margin-right: 6px; }
        .yr-new-col-form, .yr-inline-form {
          display: flex;
          gap: 8px;
        }
        .yr-new-col-form input, .yr-inline-form input {
          flex: 1;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.9);
          color: #1d1d1f;
          font-size: 13px;
          outline: none;
        }
        .yr-btn-primary {
          padding: 8px 16px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .yr-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px dashed rgba(255, 255, 255, 0.42);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .yr-add-bar {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .yr-add-form {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .yr-add-form input {
          flex: 1;
          min-width: 0;
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: #f5f5f7;
          font-size: 13px;
          outline: none;
        }
        .yr-add-form input::placeholder {
          color: rgba(245, 245, 247, 0.55);
        }
        .yr-add-submit {
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
        }
        .yr-add-submit:hover { background: #0071e3; }
        .yr-bookmarklet {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 11px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          cursor: grab;
          white-space: nowrap;
        }
        .yr-error {
          padding: 7px 12px;
          border-radius: 12px;
          background: rgba(255, 69, 58, 0.2);
          color: #ffd3d0;
          font-size: 12px;
          font-weight: 600;
        }
        .yr-stage-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
        }
        .yr-reel-frame {
          width: 100%;
          max-width: 380px;
          overflow: hidden;
          transition: max-width 0.2s ease;
        }
        .yr-reel-frame.is-horizontal {
          max-width: 640px;
        }
        .yr-reel-viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          max-height: 74dvh;
          background: #000000;
        }
        .yr-reel-viewport.is-horizontal {
          aspect-ratio: 16 / 9;
          max-height: 62dvh;
        }
        .yr-reel-viewport iframe, .yr-reel-viewport video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        .yr-reel-footer {
          padding: 12px 14px;
        }
        .yr-reel-meta {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .yr-provider-pill {
          font-size: 10.5px;
          font-weight: 700;
          color: #64d2ff;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .yr-reel-meta strong {
          font-size: 14px;
          color: #ffffff;
        }
        .yr-reel-meta > span:last-child {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }
        .yr-side-rail {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .yr-rail-btn {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.26);
          background: rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(20px);
          color: #ffffff;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          cursor: pointer;
          text-decoration: none;
        }
        .yr-rail-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.25);
        }
        .yr-rail-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .yr-rail-btn.liked {
          background: rgba(255, 55, 95, 0.28);
          border-color: rgba(255, 100, 130, 0.65);
        }
        .yr-rail-btn.mitv {
          width: auto;
          padding: 0 12px;
          font-size: 11px;
          font-weight: 700;
          background: rgba(10, 132, 255, 0.28);
          border-color: rgba(100, 210, 255, 0.55);
        }
        .yr-empty {
          padding: 44px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: rgba(245, 245, 247, 0.8);
        }
        .yr-empty strong { color: #ffffff; font-size: 15px; }
        .yr-empty span { font-size: 13px; max-width: 420px; }
        .yr-list-card {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yr-list-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .yr-list-head h2 { margin: 0; font-size: 15px; color: #ffffff; }
        .yr-list-head span { font-size: 12px; color: rgba(245, 245, 247, 0.7); }
        .yr-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .yr-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .yr-row.active {
          background: rgba(10, 132, 255, 0.22);
          border-color: rgba(100, 210, 255, 0.5);
        }
        .yr-row-main {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          cursor: pointer;
          padding: 0;
        }
        .yr-row-thumb {
          position: relative;
          width: 46px;
          height: 62px;
          border-radius: 10px;
          overflow: hidden;
          background: linear-gradient(135deg, #1e293b, #0f172a);
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .yr-row-thumb.prov-instagram {
          background: linear-gradient(135deg, #f97316, #ec4899, #8b5cf6);
        }
        .yr-row-thumb.prov-tiktok {
          background: linear-gradient(135deg, #06b6d4, #111827, #f43f5e);
        }
        .yr-row-thumb.prov-facebook {
          background: linear-gradient(135deg, #1877f2, #0f172a);
        }
        .yr-row-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .yr-row-thumb-play {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .yr-row-text {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .yr-row-text strong {
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yr-row-text span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.72);
        }
        .yr-icon-btn {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.8);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .yr-icon-btn:hover { background: rgba(255, 255, 255, 0.16); color: #ffffff; }
        @media (max-width: 640px) {
          .yr-nav { display: none; }
          .yr-stage-wrap { flex-direction: column; }
          .yr-side-rail { flex-direction: row; flex-wrap: wrap; justify-content: center; }
          .yr-add-bar { border-radius: 16px; }
          .yr-add-form { flex-wrap: wrap; }
        }

        /* --- YOU4 en Reels (4 Reels verticales simultáneos) --- */
        .yr-main.is-you4 {
          max-width: 1220px;
        }
        .yr-you4-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.45);
          background: rgba(10, 132, 255, 0.22);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .yr-you4-btn:hover:not(:disabled) {
          background: rgba(10, 132, 255, 0.42);
        }
        .yr-you4-btn.active {
          background: #0071e3;
          border-color: #64d2ff;
          box-shadow: 0 0 14px rgba(10, 132, 255, 0.55);
        }
        .yr-you4-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .yr-you4-shell {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .yr-you4-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .yr-you4-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.85);
        }
        .yr-you4-badge strong {
          color: #ffffff;
        }
        .yr-you4-bar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .yr-you4-grid-wrap {
          position: relative;
        }
        .yr-you4-center-btn {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 25;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          width: 78px;
          height: 78px;
          border-radius: 999px;
          border: 2px solid rgba(100, 210, 255, 0.85);
          background: rgba(0, 113, 227, 0.88);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.02em;
          cursor: pointer;
          box-shadow:
            0 12px 34px rgba(0, 0, 0, 0.58),
            0 0 24px rgba(10, 132, 255, 0.55);
          transition: transform 0.16s ease, background 0.16s ease, opacity 0.2s ease;
        }
        .yr-you4-center-btn:hover {
          transform: translate(-50%, -50%) scale(1.07);
          background: #0a84ff;
        }
        .yr-you4-center-btn.playing {
          background: rgba(18, 22, 30, 0.72);
          border-color: rgba(255, 255, 255, 0.42);
          opacity: 0.78;
        }
        .yr-you4-center-btn.playing:hover {
          opacity: 1;
          background: rgba(0, 113, 227, 0.9);
          border-color: #64d2ff;
        }
        .yr-you4-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .yr-you4-tile {
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 2px solid rgba(255, 255, 255, 0.18);
          cursor: pointer;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .yr-you4-tile.audio-active {
          border-color: #64d2ff;
          box-shadow: 0 0 22px rgba(10, 132, 255, 0.42);
        }
        .yr-you4-viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          background: #000000;
          overflow: hidden;
        }
        .yr-you4-viewport iframe,
        .yr-you4-viewport video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          object-fit: cover;
        }
        .yr-you4-top-bar {
          position: absolute;
          top: 8px;
          left: 8px;
          right: 8px;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          pointer-events: none;
        }
        .yr-you4-prov {
          max-width: 56%;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(14, 16, 22, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yr-you4-tile-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          pointer-events: auto;
        }
        .yr-you4-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(14, 16, 22, 0.8);
          color: rgba(245, 245, 247, 0.9);
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }
        .yr-you4-chip.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .yr-you4-meta {
          padding: 9px 11px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .yr-you4-meta strong {
          font-size: 12px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yr-you4-meta span {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.7);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yr-mode-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .yr-mode-tabs {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .yr-mode-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.78);
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .yr-mode-tab.active,
        .yr-mode-tab:hover {
          background: #0071e3;
          color: #ffffff;
        }
        .yr-save-short-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.45);
          background: rgba(10, 132, 255, 0.22);
          color: #d9f3ff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .yr-save-short-btn:hover {
          background: #0071e3;
          color: #ffffff;
        }
        .yr-topic-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-bottom: 10px;
        }
        .yr-topic-pill {
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(245, 245, 247, 0.84);
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .yr-topic-pill.active,
        .yr-topic-pill:hover {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .yr-topic-loading {
          font-size: 11.5px;
          color: #8ee0ff;
          margin-left: 6px;
        }
        @media (max-width: 1024px) {
          .yr-you4-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
