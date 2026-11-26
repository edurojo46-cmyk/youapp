import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Cast,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Film,
  Heart,
  Maximize2,
  Minimize2,
  Pencil,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  Search,
  Share2,
  SkipBack,
  SkipForward,
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
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { DailymotionOfficialPlayer } from '../components/player/DailymotionOfficialPlayer';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import { MosaicPlayerGrid } from '../components/player/MosaicPlayerGrid';
import { XOfficialTweetEmbed } from '../components/player/XOfficialTweetEmbed';
import { SmartBar } from '../components/smartbar/SmartBar';
import RemoteConnectModal from '../components/RemoteConnectModal';
import { RemoteBridge } from '../utils/remoteBridge';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSignalStore } from '../lib/tv/signalStore';
import { persistSignal } from '../lib/tv/signalPersistence';
import type { ScheduleBlock } from '../lib/tv/signalTypes';
import {
  canAutoSkip,
  isUnplayableYouTubeError,
  reportUnplayableYouTubeVideo,
  resetAutoSkip
} from '../lib/player/videoResilience';
import { openWhatsAppMiTvShare } from '../lib/tv/youappShareHelper';
import {
  buildMiTvShareUrl,
  loadMiTvWorkspace,
  loadMiTvWorkspaceFromCloud,
  OFFICIAL_LIVE_TV_CHANNEL,
  resolveMiTvPointer,
  saveMiTvWorkspace,
  type MiTvChannel,
  type MiTvItem,
  type MiTvLiveCategory,
  type MiTvWorkspace
} from '../lib/tv/miTvStore';
import {
  buildYouTubeSubscribeUrl,
  fetchYouTubeVideoMeta,
  formatCompactViews,
  formatPublishedDateEs,
  loadSocialGraph,
  loadSocialGraphFromCloud,
  toggleFollowCreatorWithMeta,
  toggleLikeVideoWithMeta,
  type VideoPublicMeta,
  type YouAppSocialGraph
} from '../lib/tv/youappSocialStore';

export default function ProgramarTV() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setSignal = useSignalStore((s) => s.setSignal);

  const [workspace, setWorkspace] = useState<MiTvWorkspace>(() => loadMiTvWorkspace());
  const [urlInput, setUrlInput] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isViewingOfficialLive, setIsViewingOfficialLive] = useState(false);
  const [liveCategoryFilter, setLiveCategoryFilter] = useState<'Todos' | MiTvLiveCategory>('Todos');
  const [resolvedLiveIds, setResolvedLiveIds] = useState<Record<string, string | null>>({});
  const [resolvingLiveChannelId, setResolvingLiveChannelId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'pending'>('all');
  const [socialGraph, setSocialGraph] = useState<YouAppSocialGraph>(() => loadSocialGraph());
  const [currentVideoMeta, setCurrentVideoMeta] = useState<VideoPublicMeta | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [isChannelsPanelOpen, setIsChannelsPanelOpen] = useState(false);
  const channelMenuRef = useRef<HTMLDivElement | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [isRenamingChannel, setIsRenamingChannel] = useState(false);
  const [renameChannelDraft, setRenameChannelDraft] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemDraft, setEditingItemDraft] = useState('');
  const [sharedChannel, setSharedChannel] = useState<MiTvChannel | null>(null);

  // Control de volumen, pantalla completa y transmitir
  const [playerVolume, setPlayerVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // YOUAPP Cast propio (igual al sistema de código de TV de YouTube, 100% dentro de YOUAPP)
  const [myTvCode] = useState<string>(() => {
    try {
      const existing = sessionStorage.getItem('youapp_mitv_code_v1');
      if (existing && /^\d{4}$/.test(existing)) return existing;
      const generated = String(Math.floor(1000 + Math.random() * 9000));
      sessionStorage.setItem('youapp_mitv_code_v1', generated);
      return generated;
    } catch {
      return '4829';
    }
  });
  const [isReceivingCast] = useState(false);
  const [isRemoteQrOpen, setIsRemoteQrOpen] = useState(false);
  const [isRemotePhoneConnected, setIsRemotePhoneConnected] = useState(false);
  const [castTargetCodeInput, setCastTargetCodeInput] = useState('');
  const [connectedCastCode, setConnectedCastCode] = useState<string | null>(null);
  const [castIncomingItem, setCastIncomingItem] = useState<MiTvItem | null>(null);
  const [isYou4Mode, setIsYou4Mode] = useState(false);
  const [isMomentsMosaic, setIsMomentsMosaic] = useState(false);
  const [you4AudioSlot, setYou4AudioSlot] = useState(0);
  const [you4Offset, setYou4Offset] = useState(0);
  const you4AudioSlotRef = useRef<number>(0);
  you4AudioSlotRef.current = you4AudioSlot;
  const you4IframesRef = useRef<(HTMLIFrameElement | null)[]>([]);
  const you4VideosRef = useRef<(HTMLVideoElement | null)[]>([]);
  const you4ProgressRef = useRef<{ currentTime: number; duration: number; playing: boolean }[]>([
    { currentTime: 0, duration: 0, playing: true },
    { currentTime: 0, duration: 0, playing: true },
    { currentTime: 0, duration: 0, playing: true },
    { currentTime: 0, duration: 0, playing: true }
  ]);
  const castSenderBridgeRef = useRef<RemoteBridge | null>(null);

  // Escucha los eventos de tiempo/duración de los 4 iframes de YouTube en modo YOU4
  // y sincroniza la SmartBar con la pantalla que está desmutada (you4AudioSlot)
  useEffect(() => {
    if (!isYou4Mode) return;

    const requestListening = () => {
      for (let i = 0; i < 4; i++) {
        const win = you4IframesRef.current[i]?.contentWindow;
        if (!win) continue;
        try {
          win.postMessage(JSON.stringify({ event: 'listening', id: i, channel: 'widget' }), '*');
        } catch {
          // ignore
        }
      }
    };

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string' || !ev.data.startsWith('{')) return;
      let parsed: any;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!parsed || parsed.event !== 'infoDelivery' || !parsed.info) return;
      const slotIdx = you4IframesRef.current.findIndex((f) => f && f.contentWindow === ev.source);
      if (slotIdx < 0 || slotIdx > 3) return;

      const cur = you4ProgressRef.current[slotIdx] || { currentTime: 0, duration: 0, playing: true };
      const ct = typeof parsed.info.currentTime === 'number' ? parsed.info.currentTime : cur.currentTime;
      const dur =
        typeof parsed.info.duration === 'number' && parsed.info.duration > 0
          ? parsed.info.duration
          : cur.duration;
      const playing =
        typeof parsed.info.playerState === 'number'
          ? parsed.info.playerState === 1 || parsed.info.playerState === 3
          : cur.playing;

      you4ProgressRef.current[slotIdx] = { currentTime: ct, duration: dur, playing };

      if (slotIdx === you4AudioSlotRef.current) {
        progressRef.current = { currentTime: ct, duration: dur > 0 ? dur : 240 };
        usePlayerStore.getState().setProgress(ct, dur > 0 ? dur : 240);
        if (typeof parsed.info.playerState === 'number') {
          const isNowPlaying = parsed.info.playerState !== 2;
          setIsPlaying(isNowPlaying);
          usePlayerStore.getState().setPlaybackState(isNowPlaying ? 'playing' : 'paused');
        }
      }
    };

    window.addEventListener('message', onMessage);
    const t1 = window.setTimeout(requestListening, 600);
    const t2 = window.setTimeout(requestListening, 1800);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isYou4Mode, you4Offset]);

  const handleSelectYou4Audio = useCallback((slotIdx: number) => {
    setYou4AudioSlot(slotIdx);
    you4AudioSlotRef.current = slotIdx;
    const vidEl = you4VideosRef.current[slotIdx];
    if (vidEl && Number.isFinite(vidEl.duration) && vidEl.duration > 0) {
      progressRef.current = { currentTime: vidEl.currentTime || 0, duration: vidEl.duration };
      usePlayerStore.getState().setProgress(vidEl.currentTime || 0, vidEl.duration);
      setIsPlaying(!vidEl.paused);
      usePlayerStore.getState().setPlaybackState(vidEl.paused ? 'paused' : 'playing');
    } else {
      const snap = you4ProgressRef.current[slotIdx];
      if (snap) {
        const dur = snap.duration > 0 ? snap.duration : 240;
        progressRef.current = { currentTime: snap.currentTime, duration: dur };
        usePlayerStore.getState().setProgress(snap.currentTime, dur);
        setIsPlaying(snap.playing);
        usePlayerStore.getState().setPlaybackState(snap.playing ? 'playing' : 'paused');
      }
    }
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
  const castReceiverBridgeRef = useRef<RemoteBridge | null>(null);
  const playerCardRef = useRef<HTMLElement | null>(null);
  const volumeBoxRef = useRef<HTMLDivElement | null>(null);
  const castBoxRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const directVideoRef = useRef<HTMLVideoElement | null>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  const handledAddParamRef = useRef<string | null>(null);
  const progressRef = useRef<{ currentTime: number; duration: number }>({
    currentTime: 0,
    duration: 0
  });

  // Configura el bookmarklet "+ Mi TV" de forma segura (sin warning de javascript: en JSX)
  useEffect(() => {
    const el = bookmarkletRef.current;
    if (!el || typeof window === 'undefined') return;
    const origin = window.location.origin;
    const script = `javascript:(function(){var u=location.href;window.open('${origin}/mitv?add='+encodeURIComponent(u),'youapp_mitv');})();`;
    el.setAttribute('href', script);
  }, []);

  useEffect(() => {
    if (!isChannelMenuOpen && !isVolumeOpen && !isCastOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isChannelMenuOpen && channelMenuRef.current && !channelMenuRef.current.contains(target)) {
        setIsChannelMenuOpen(false);
      }
      if (isVolumeOpen && volumeBoxRef.current && !volumeBoxRef.current.contains(target)) {
        setIsVolumeOpen(false);
      }
      if (isCastOpen && castBoxRef.current && !castBoxRef.current.contains(target)) {
        setIsCastOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isChannelMenuOpen, isVolumeOpen, isCastOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('mitv-is-fullscreen', isFullscreen);

    const el = playerCardRef.current as
      | (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (isFullscreen) {
      if (el && !document.fullscreenElement && !doc.webkitFullscreenElement) {
        try {
          if (el.requestFullscreen) {
            void el.requestFullscreen().catch(() => {});
          } else if (el.webkitRequestFullscreen) {
            void el.webkitRequestFullscreen();
          }
        } catch {
          // fallback CSS 100vw x 100dvh
        }
      }
    } else if (document.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) {
          void document.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          void doc.webkitExitFullscreen();
        }
      } catch {
        // ignore
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    const onFsChange = () => {
      const nativeActive = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
      if (!nativeActive && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('mitv-is-fullscreen');
      }
    };
  }, []);

  const handleToggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (typeof document === 'undefined') return;
    const el = playerCardRef.current as
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
  };

  // Receptor YOUAPP Remote / Cast SIEMPRE activo en MiTV (con el PIN de 4 dígitos de esta pantalla)
  useEffect(() => {
    if (!myTvCode) return;
    const bridge = new RemoteBridge(myTvCode, 'tv');
    castReceiverBridgeRef.current = bridge;

    bridge.onConnected(() => {
      setIsRemotePhoneConnected(true);
      setToast(`📱 Control remoto vinculado a tu MiTV (PIN #${myTvCode}).`);
    });

    bridge.onAction((action, payload) => {
      if (action === 'MITV_PLAY_ITEM' && payload?.item) {
        setCastIncomingItem(payload.item as MiTvItem);
        setToast(`Transmitiendo en esta pantalla: «${payload.item.title || 'Video'}»`);
      } else if (action === 'MITV_VOLUME' && typeof payload?.volume === 'number') {
        handleVolumeChange(payload.volume);
      } else if (action === 'MITV_PLAY_PAUSE' || action === 'TOGGLE_PLAY') {
        handleSmartPlayPause();
      } else if (action === 'NEXT_CHANNEL') {
        setCastIncomingItem(null);
        if (itemsCountRef.current > 1) {
          setCurrentIndex((prev) => (prev + 1) % itemsCountRef.current);
        }
      } else if (action === 'PREV_CHANNEL') {
        setCastIncomingItem(null);
        if (itemsCountRef.current > 1) {
          setCurrentIndex((prev) => (prev - 1 + itemsCountRef.current) % itemsCountRef.current);
        }
      } else if (action === 'SET_CHANNEL_INDEX' && typeof payload?.index === 'number') {
        setCastIncomingItem(null);
        if (itemsCountRef.current > 0) {
          setCurrentIndex(Math.max(0, Math.min(itemsCountRef.current - 1, payload.index)));
        }
      } else if (action === 'SEEK_BACK' || action === 'SEEK_FORWARD') {
        const delta = (action === 'SEEK_BACK' ? -1 : 1) * Number(payload?.seconds || 10);
        const target = Math.max(0, (progressRef.current.currentTime || 0) + delta);
        try {
          ytPlayerRef.current?.seekTo?.(target, true);
        } catch {
          // ignore
        }
        if (directVideoRef.current) {
          directVideoRef.current.currentTime = target;
        }
      } else if (action === 'VOLUME_UP' || action === 'VOLUME_DOWN') {
        const step = action === 'VOLUME_UP' ? 15 : -15;
        const curVol = volumeStateRef.current.volume;
        handleVolumeChange(Math.max(0, Math.min(100, curVol + step)));
      } else if (action === 'TOGGLE_MUTE') {
        if (volumeStateRef.current.muted || volumeStateRef.current.volume === 0) {
          handleVolumeChange(Math.max(40, volumeStateRef.current.volume || 80));
        } else {
          handleVolumeChange(0);
        }
      } else if (action === 'TOGGLE_QUAD') {
        setIsMomentsMosaic(false);
        setIsYou4Mode((v) => {
          const next = !v;
          setIsFullscreen(next);
          return next;
        });
      } else if (action === 'TOGGLE_ZEN') {
        handleToggleFullscreen();
      } else if (action === 'SEND_CHAT' && payload?.text) {
        setToast(`💬 ${String(payload.text).slice(0, 90)}`);
      } else if (action === 'SEND_EMOJI' && payload?.emoji) {
        setToast(`${String(payload.emoji)} Reacción enviada desde tu celular`);
      }
    });

    return () => {
      bridge.destroy();
      if (castReceiverBridgeRef.current === bridge) {
        castReceiverBridgeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTvCode]);

  // Limpia emisor YOUAPP Cast al desmontar
  useEffect(() => {
    return () => {
      castSenderBridgeRef.current?.destroy();
      castSenderBridgeRef.current = null;
    };
  }, []);

  const handleConnectCastCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = castTargetCodeInput.replace(/\D/g, '').slice(0, 6);
    if (code.length < 4) {
      setToast('Ingresá el código de 4 dígitos que aparece en la otra pantalla.');
      return;
    }
    castSenderBridgeRef.current?.destroy();
    const bridge = new RemoteBridge(code, 'remote');
    castSenderBridgeRef.current = bridge;
    setConnectedCastCode(code);
    setIsCastOpen(false);
    setToast(`Transmitiendo a TV ${code}.`);
    if (currentItem) {
      window.setTimeout(() => {
        bridge.sendAction('MITV_PLAY_ITEM', { item: currentItem });
      }, 650);
    }
  };

  const handleDisconnectCast = () => {
    castSenderBridgeRef.current?.destroy();
    castSenderBridgeRef.current = null;
    setConnectedCastCode(null);
    setToast('Transmisión finalizada.');
  };

  const isChromePresentationSupported =
    typeof window !== 'undefined' && 'PresentationRequest' in window;

  const handleChromeNativeCast = async () => {
    if (!isChromePresentationSupported) {
      setToast('El selector nativo requiere Google Chrome o Edge.');
      return;
    }
    setIsCastOpen(false);
    try {
      const PresentationReq = (window as unknown as {
        PresentationRequest: new (urls: string[]) => { start: () => Promise<unknown> };
      }).PresentationRequest;
      const targetUrl =
        typeof window !== 'undefined' ? window.location.href : 'https://youapp.tv/mitv';
      const request = new PresentationReq([targetUrl]);
      await request.start();
      setToast('Conectado al dispositivo desde Chrome.');
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // El usuario cerró el selector de dispositivos
        return;
      }
      if (name === 'NotFoundError') {
        setToast('No se encontraron Chromecast o Smart TVs disponibles en tu Wi-Fi.');
        return;
      }
      setToast('Usá el menú de Chrome (⋮ → Transmitir) o vinculá con el código de 4 dígitos.');
    }
  };

  const handleCastClick = async () => {
    const vidEl = directVideoRef.current as
      | (HTMLVideoElement & {
          remote?: { prompt?: () => Promise<void> };
          webkitShowPlaybackTargetPicker?: () => void;
        })
      | null;
    if (vidEl?.remote?.prompt) {
      try {
        await vidEl.remote.prompt();
        return;
      } catch {
        // fallback al menú de transmisión
      }
    }
    if (typeof vidEl?.webkitShowPlaybackTargetPicker === 'function') {
      try {
        vidEl.webkitShowPlaybackTargetPicker();
        return;
      } catch {
        // fallback al menú de transmisión
      }
    }
    setIsVolumeOpen(false);
    setIsCastOpen((v) => !v);
  };

  // Sincronización con Supabase al abrir
  useEffect(() => {
    loadMiTvWorkspaceFromCloud()
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

  // Soporte de grilla compartida por URL (?ch=Nombre&ids=id1,id2...)
  useEffect(() => {
    const idsParam = searchParams.get('ids')?.trim();
    const chName = searchParams.get('ch')?.trim() || 'MiTV compartida';
    if (!idsParam) return;
    const validIds = idsParam
      .split(',')
      .map((x) => x.trim())
      .filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x))
      .slice(0, 25);
    if (validIds.length === 0) return;

    let cancelled = false;
    Promise.all(validIds.map((id) => resolveMiTvPointer(id, 'Ahora')))
      .then((resolved) => {
        if (cancelled) return;
        const items = resolved
          .filter((r): r is { ok: true; item: MiTvItem } => r.ok)
          .map((r) => r.item);
        if (items.length > 0) {
          setSharedChannel({
            id: `shared-mitv-${Date.now().toString(36)}`,
            name: chName,
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
  }, [searchParams]);

  // Recepción automática de enlace compartido (?add=<URL>) desde Android Share o botón "+ Mi TV"
  useEffect(() => {
    const addUrl = searchParams.get('add')?.trim();
    if (!addUrl || handledAddParamRef.current === addUrl) return;
    handledAddParamRef.current = addUrl;

    let cancelled = false;
    setIsAdding(true);
    setErrorMsg(null);
    resolveMiTvPointer(addUrl, 'Ahora')
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(res.error);
          setSearchParams({}, { replace: true });
          return;
        }
        const customT = searchParams.get('t')?.trim();
        const incoming: MiTvItem = customT ? { ...res.item, title: customT } : res.item;

        let targetIndex = 0;
        let alreadyExists = false;
        setWorkspace((prev) => {
          const nextWs: MiTvWorkspace = {
            ...prev,
            channels: prev.channels.map((ch) => {
              if (ch.id !== prev.activeChannelId) return ch;
              const existingIdx = ch.items.findIndex(
                (x) => x.provider === incoming.provider && x.providerId === incoming.providerId
              );
              if (existingIdx >= 0) {
                targetIndex = existingIdx;
                alreadyExists = true;
                return ch;
              }
              targetIndex = ch.items.length;
              return {
                ...ch,
                items: [...ch.items, incoming],
                updatedAt: new Date().toISOString()
              };
            })
          };
          return saveMiTvWorkspace(nextWs);
        });

        setSharedChannel(null);
        setCurrentIndex(targetIndex);
        setSearchParams({}, { replace: true });
        setToast(
          alreadyExists
            ? `«${incoming.title}» ya estaba en tu canal de MiTV.`
            : `Agregado a MiTV: «${incoming.title}»`
        );
      })
      .finally(() => {
        if (!cancelled) setIsAdding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const activeOwnChannel = useMemo(
    () =>
      workspace.channels.find((c) => c.id === workspace.activeChannelId) ||
      workspace.channels[0],
    [workspace]
  );

  const displayedChannel = sharedChannel
    ? sharedChannel
    : isViewingOfficialLive
      ? OFFICIAL_LIVE_TV_CHANNEL
      : activeOwnChannel;
  const isReadOnlyChannel = Boolean(sharedChannel || isViewingOfficialLive);
  const items = useMemo(() => displayedChannel?.items || [], [displayedChannel?.items]);
  const safeIndex = items.length > 0 ? Math.min(currentIndex, items.length - 1) : 0;
  const currentItem = castIncomingItem || items[safeIndex] || null;
  const nextItem = items.length > 1 ? items[(safeIndex + 1) % items.length] : null;

  // Al cambiar de video o de canal en MiTV, libera cualquier video transmitido por remoto
  useEffect(() => {
    setCastIncomingItem(null);
  }, [currentIndex, displayedChannel?.id]);

  // Cuando estás transmitiendo a otra TV YOUAPP, cada cambio de video/canal se envía al instante
  useEffect(() => {
    if (!connectedCastCode || !castSenderBridgeRef.current || !currentItem) return;
    castSenderBridgeRef.current.sendAction('MITV_PLAY_ITEM', { item: currentItem });
  }, [connectedCastCode, currentItem]);

  // Sincroniza el título actual de MiTV hacia el celular (YOU Remote)
  useEffect(() => {
    if (!castReceiverBridgeRef.current || !currentItem) return;
    castReceiverBridgeRef.current.sendAction('SYNC_STATE', {
      channel: {
        id: currentItem.id,
        name: displayedChannel?.name || 'MiTV',
        currentVideoTitle: currentItem.title,
        category: currentItem.slot || 'MiTV',
        thumbnail: currentItem.thumbnailUrl,
        videoUrl: currentItem.sourceUrl
      },
      activeIndex: currentIndex,
      totalChannels: items.length,
      isQuadOpen: isYou4Mode
    });
  }, [currentItem, displayedChannel?.name, currentIndex, items.length, isYou4Mode]);

  const visibleGridItems = useMemo(() => {
    return items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (isViewingOfficialLive) {
          return liveCategoryFilter === 'Todos' || item.liveCategory === liveCategoryFilter;
        }
        return filterMode === 'pending' ? !item.watched : true;
      });
  }, [items, filterMode, isViewingOfficialLive, liveCategoryFilter]);

  const ensureYouTubeApi = useCallback((): Promise<void> => {
    if (typeof window !== 'undefined' && (window as any).YT?.Player) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const check = window.setInterval(() => {
        if ((window as any).YT?.Player) {
          window.clearInterval(check);
          resolve();
        }
      }, 60);
      if (!document.getElementById('youtube-api-script')) {
        const s = document.createElement('script');
        s.id = 'youtube-api-script';
        s.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(s);
      }
      const prevReady = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === 'function') prevReady();
        window.clearInterval(check);
        resolve();
      };
    });
  }, []);

  // Resuelve dinámicamente el videoId en vivo actual para canales youtube_live (0 cuota API)
  useEffect(() => {
    if (!currentItem || currentItem.provider !== 'youtube_live') return;
    const chId = currentItem.providerId;
    if (Object.prototype.hasOwnProperty.call(resolvedLiveIds, chId)) return;

    let cancelled = false;
    setResolvingLiveChannelId(chId);
    fetch(`/api/mitv/resolve-live?channel=${encodeURIComponent(chId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const vid =
          typeof data?.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(data.videoId)
            ? data.videoId
            : null;
        setResolvedLiveIds((prev) => ({ ...prev, [chId]: vid }));
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedLiveIds((prev) => ({ ...prev, [chId]: currentItem.liveVideoId || null }));
        }
      })
      .finally(() => {
        if (!cancelled) setResolvingLiveChannelId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentItem, resolvedLiveIds]);

  const activeLiveVideoId = useMemo(() => {
    if (!currentItem || currentItem.provider !== 'youtube_live') return null;
    const chId = currentItem.providerId;
    if (Object.prototype.hasOwnProperty.call(resolvedLiveIds, chId)) {
      return resolvedLiveIds[chId] || currentItem.liveVideoId || null;
    }
    return currentItem.liveVideoId || null;
  }, [currentItem, resolvedLiveIds]);

  // Carga vistas reales y fecha de publicación del video actual (0 cuota API)
  useEffect(() => {
    const vid =
      currentItem?.provider === 'youtube'
        ? currentItem.providerId
        : currentItem?.provider === 'youtube_live'
          ? activeLiveVideoId
          : null;
    if (!vid) {
      setCurrentVideoMeta(null);
      return;
    }
    let cancelled = false;
    setCurrentVideoMeta(null);
    fetchYouTubeVideoMeta(vid)
      .then((meta) => {
        if (!cancelled) setCurrentVideoMeta(meta);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentItem?.provider, currentItem?.providerId, activeLiveVideoId]);

  const activeYouTubeVideoId = useMemo(() => {
    if (!currentItem) return null;
    if (currentItem.provider === 'youtube') return currentItem.providerId;
    if (currentItem.provider === 'youtube_live') return activeLiveVideoId;
    return null;
  }, [currentItem, activeLiveVideoId]);

  const itemsCountRef = useRef(items.length);
  itemsCountRef.current = items.length;
  const userExplicitlyMutedRef = useRef(false);
  const volumeStateRef = useRef({ volume: playerVolume, muted: isMuted });
  volumeStateRef.current = { volume: playerVolume, muted: isMuted };

  // Inicializa el reproductor oficial YT.Player (control 100% real de Play/Pausa, Volumen, Seek y avance continuo)
  useEffect(() => {
    if (
      isYou4Mode ||
      isMomentsMosaic ||
      (currentItem?.provider !== 'youtube' && currentItem?.provider !== 'youtube_live') ||
      !activeYouTubeVideoId ||
      !ytHostRef.current
    ) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let progressTimer: number | null = null;

    void ensureYouTubeApi().then(() => {
      if (cancelled || !ytHostRef.current) return;
      const YT = (window as any).YT;
      if (!YT?.Player) return;

      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }

      ytHostRef.current.replaceChildren();
      const mountEl = document.createElement('div');
      mountEl.style.width = '100%';
      mountEl.style.height = '100%';
      ytHostRef.current.appendChild(mountEl);

      const player = new YT.Player(mountEl, {
        width: '100%',
        height: '100%',
        videoId: activeYouTubeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          iv_load_policy: 3,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined
        },
        events: {
          onReady: (ev: any) => {
            if (cancelled) return;
            const p = ev.target;
            ytPlayerRef.current = p;
            const { volume } = volumeStateRef.current;
            const shouldBeMuted = userExplicitlyMutedRef.current || volume === 0;
            try {
              if (shouldBeMuted) {
                p.mute();
                setIsMuted(true);
              } else {
                p.unMute();
                p.setVolume(volume > 0 ? volume : 100);
                setIsMuted(false);
              }
              p.playVideo();
              // Solo si Chrome bloquea autoplay inicial antes del primer clic, reintenta silenciado
              // sin marcar mute permanente para los cambios de canal siguientes
              window.setTimeout(() => {
                if (cancelled || ytPlayerRef.current !== p) return;
                try {
                  const st = p.getPlayerState?.();
                  if (st === -1 || st === 5) {
                    p.mute();
                    setIsMuted(true);
                    p.playVideo();
                  }
                } catch {
                  // ignore
                }
              }, 1500);
            } catch {
              // ignore
            }
            progressTimer = window.setInterval(() => {
              try {
                const ct = Number(p.getCurrentTime?.() || 0);
                const dur = Number(p.getDuration?.() || 0);
                if (Number.isFinite(ct) && Number.isFinite(dur)) {
                  progressRef.current = {
                    currentTime: Math.max(0, ct),
                    duration: dur > 0 ? dur : progressRef.current.duration
                  };
                  usePlayerStore
                    .getState()
                    .setProgress(progressRef.current.currentTime, progressRef.current.duration);
                }
              } catch {
                // ignore
              }
            }, 500);
          },
          onStateChange: (ev: any) => {
            if (cancelled) return;
            const st = ev.data;
            if (st === 1) {
              resetAutoSkip('ProgramarTV');
              setIsPlaying(true);
              usePlayerStore.getState().setPlaybackState('playing');
            } else if (st === 2) {
              setIsPlaying(false);
              usePlayerStore.getState().setPlaybackState('paused');
            } else if (st === 3) {
              usePlayerStore.getState().setPlaybackState('buffering');
            } else if (st === 0) {
              setIsPlaying(false);
              usePlayerStore.getState().setPlaybackState('ended');
              if (itemsCountRef.current > 1) {
                setCurrentIndex((prev) => (prev + 1) % itemsCountRef.current);
              }
            }
          },
          onError: (ev: any) => {
            if (cancelled) return;
            if (isUnplayableYouTubeError(ev?.data)) {
              void reportUnplayableYouTubeVideo(activeYouTubeVideoId, ev.data, 'ProgramarTV');
              if (itemsCountRef.current > 1 && canAutoSkip('ProgramarTV')) {
                setCurrentIndex((prev) => (prev + 1) % itemsCountRef.current);
              }
            }
          }
        }
      });
      ytPlayerRef.current = player;
    });

    return () => {
      cancelled = true;
      if (progressTimer !== null) window.clearInterval(progressTimer);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
    };
  }, [isYou4Mode, isMomentsMosaic, currentItem?.id, currentItem?.provider, activeYouTubeVideoId, ensureYouTubeApi]);

  // Sincroniza el video actual con usePlayerStore para que SmartBar (barra inteligente)
  // mantenga visible la barra de tiempo, título, canal, compartir y momentos en MiTV
  useEffect(() => {
    progressRef.current = { currentTime: 0, duration: 0 };
    usePlayerStore.getState().setProgress(0, 0);

    if (!currentItem) {
      usePlayerStore.getState().setCurrentBlock(null);
      usePlayerStore.getState().setPlaybackState('idle');
      return;
    }
    setIsPlaying(true);
    usePlayerStore.getState().setPlaybackState('playing');
    const resolvedId =
      currentItem.provider === 'youtube_live'
        ? activeLiveVideoId || currentItem.providerId
        : currentItem.providerId;
    usePlayerStore.getState().setCurrentBlock({
      blockId: currentItem.id,
      provider:
        currentItem.provider === 'direct'
          ? 'html5'
          : currentItem.provider === 'youtube_live'
            ? 'youtube'
            : currentItem.provider,
      providerContentId: resolvedId,
      mediaUrl: currentItem.sourceUrl,
      title: currentItem.title,
      channelTitle: currentItem.author,
      thumbnailUrl: currentItem.thumbnailUrl,
      durationSec: 240,
      autoplay: true,
      muted: false
    } as any);
  }, [currentItem, activeLiveVideoId]);

  const handleSmartPlayPause = useCallback(() => {
    if (isMomentsMosaic) {
      const next = !isPlaying;
      setIsPlaying(next);
      usePlayerStore.getState().setPlaybackState(next ? 'playing' : 'paused');
      return;
    }
    if (isYou4Mode) {
      const slotIdx = you4AudioSlotRef.current;
      const next = !isPlaying;
      setIsPlaying(next);
      usePlayerStore.getState().setPlaybackState(next ? 'playing' : 'paused');
      const iframe = you4IframesRef.current[slotIdx];
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: next ? 'playVideo' : 'pauseVideo', args: [] }),
            '*'
          );
        } catch {
          // ignore
        }
      }
      const vid = you4VideosRef.current[slotIdx];
      if (vid) {
        if (next) void vid.play().catch(() => {});
        else vid.pause();
      }
      return;
    }
    const isYt = currentItem?.provider === 'youtube' || currentItem?.provider === 'youtube_live';
    if (isYt && ytPlayerRef.current) {
      const p = ytPlayerRef.current;
      try {
        const ytState = typeof p.getPlayerState === 'function' ? p.getPlayerState() : null;
        const shouldPlay = ytState !== null ? ytState !== 1 : !isPlaying;
        setIsPlaying(shouldPlay);
        usePlayerStore.getState().setPlaybackState(shouldPlay ? 'playing' : 'paused');
        if (shouldPlay) {
          if (!volumeStateRef.current.muted && volumeStateRef.current.volume > 0) {
            p.unMute?.();
            p.setVolume?.(volumeStateRef.current.volume);
          }
          p.playVideo?.();
          // Respaldo: si el navegador bloquea play con sonido desde barra externa, reintenta silenciado
          window.setTimeout(() => {
            if (ytPlayerRef.current !== p) return;
            try {
              const st = p.getPlayerState?.();
              if (st !== 1 && st !== 3) {
                p.mute?.();
                setIsMuted(true);
                p.playVideo?.();
              }
            } catch {
              // ignore
            }
          }, 350);
        } else {
          p.pauseVideo?.();
        }
        return;
      } catch {
        // fallback debajo
      }
    }

    const next = !isPlaying;
    setIsPlaying(next);
    usePlayerStore.getState().setPlaybackState(next ? 'playing' : 'paused');
    if (directVideoRef.current) {
      if (next) void directVideoRef.current.play().catch(() => {});
      else directVideoRef.current.pause();
    }
  }, [isMomentsMosaic, isYou4Mode, isPlaying, currentItem?.provider]);

  const handleSmartSeek = useCallback(
    (seconds: number) => {
      const safeSec = Math.max(0, seconds);
      if (isYou4Mode) {
        const slotIdx = you4AudioSlotRef.current;
        const cur = you4ProgressRef.current[slotIdx] || { currentTime: 0, duration: 240, playing: true };
        const dur = cur.duration > 0 ? cur.duration : 240;
        you4ProgressRef.current[slotIdx] = { ...cur, currentTime: safeSec };
        progressRef.current = { currentTime: safeSec, duration: dur };
        usePlayerStore.getState().setProgress(safeSec, dur);
        const iframe = you4IframesRef.current[slotIdx];
        if (iframe?.contentWindow) {
          try {
            iframe.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [safeSec, true] }),
              '*'
            );
          } catch {
            // ignore
          }
        }
        const vid = you4VideosRef.current[slotIdx];
        if (vid) vid.currentTime = safeSec;
        return;
      }
      progressRef.current.currentTime = safeSec;
      usePlayerStore.getState().setProgress(safeSec, progressRef.current.duration);
      if (directVideoRef.current) {
        directVideoRef.current.currentTime = safeSec;
      } else if (
        (currentItem?.provider === 'youtube' || currentItem?.provider === 'youtube_live') &&
        ytPlayerRef.current
      ) {
        try {
          ytPlayerRef.current.seekTo?.(safeSec, true);
        } catch {
          // ignore
        }
      }
    },
    [isYou4Mode, currentItem?.provider]
  );

  // Registra playerApi en usePlayerStore para que todos los botones de SmartBar respondan
  useEffect(() => {
    const isYt = currentItem?.provider === 'youtube' || currentItem?.provider === 'youtube_live';
    usePlayerStore.getState().setPlayerApi({
      play: async () => {
        setIsPlaying(true);
        usePlayerStore.getState().setPlaybackState('playing');
        if (directVideoRef.current) await directVideoRef.current.play().catch(() => {});
        else if (isYt) ytPlayerRef.current?.playVideo?.();
      },
      pause: async () => {
        setIsPlaying(false);
        usePlayerStore.getState().setPlaybackState('paused');
        if (directVideoRef.current) directVideoRef.current.pause();
        else if (isYt) ytPlayerRef.current?.pauseVideo?.();
      },
      seek: async (sec: number) => {
        handleSmartSeek(sec);
      },
      mute: async () => {
        setIsMuted(true);
        usePlayerStore.getState().setIsMuted(true);
        if (directVideoRef.current) directVideoRef.current.muted = true;
        else if (isYt) ytPlayerRef.current?.mute?.();
      },
      unmute: async () => {
        setIsMuted(false);
        usePlayerStore.getState().setIsMuted(false, true);
        if (directVideoRef.current) directVideoRef.current.muted = false;
        else if (isYt) ytPlayerRef.current?.unMute?.();
      },
      getDuration: () => progressRef.current.duration
    });
    return () => {
      usePlayerStore.getState().setPlayerApi(null);
    };
  }, [currentItem?.provider, handleSmartSeek]);

  const applyVolumeToPlayer = useCallback((vol: number, muted: boolean) => {
    if (directVideoRef.current) {
      directVideoRef.current.muted = muted || vol === 0;
      directVideoRef.current.volume = Math.max(0, Math.min(1, vol / 100));
    }
    if (ytPlayerRef.current) {
      try {
        if (muted || vol === 0) {
          ytPlayerRef.current.mute?.();
          ytPlayerRef.current.setVolume?.(0);
        } else {
          ytPlayerRef.current.unMute?.();
          ytPlayerRef.current.setVolume?.(vol);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleVolumeChange = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVol)));
    setPlayerVolume(clamped);
    const nextMuted = clamped === 0;
    userExplicitlyMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    applyVolumeToPlayer(clamped, nextMuted);
  };

  const handleToggleMute = () => {
    if (isMuted || playerVolume === 0) {
      const restored = playerVolume > 0 ? playerVolume : 80;
      userExplicitlyMutedRef.current = false;
      setIsMuted(false);
      setPlayerVolume(restored);
      applyVolumeToPlayer(restored, false);
    } else {
      userExplicitlyMutedRef.current = true;
      setIsMuted(true);
      applyVolumeToPlayer(playerVolume, true);
    }
  };

  const handleAddOfficialLiveToMyChannel = (liveItem: MiTvItem) => {
    let added = false;
    updateWorkspace((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) => {
        if (ch.id !== prev.activeChannelId) return ch;
        const exists = ch.items.some(
          (x) => x.provider === liveItem.provider && x.providerId === liveItem.providerId
        );
        if (exists) return ch;
        added = true;
        return {
          ...ch,
          items: [
            ...ch.items,
            {
              ...liveItem,
              id: `mitv-live-${liveItem.providerId}-${Date.now().toString(36)}`,
              addedAt: new Date().toISOString()
            }
          ],
          updatedAt: new Date().toISOString()
        };
      })
    }));
    setToast(
      added
        ? `«${liveItem.title}» sumado a «${activeOwnChannel?.name || 'tu canal'}».`
        : `«${liveItem.title}» ya estaba en «${activeOwnChannel?.name || 'tu canal'}».`
    );
  };

  const updateWorkspace = (updater: (prev: MiTvWorkspace) => MiTvWorkspace) => {
    setWorkspace((prev) => saveMiTvWorkspace(updater(prev)));
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isAdding) return;
    setErrorMsg(null);
    setIsAdding(true);

    try {
      const res = await resolveMiTvPointer(urlInput, 'Ahora');
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }

      const newItem: MiTvItem = customTitle.trim()
        ? { ...res.item, title: customTitle.trim() }
        : res.item;

      if (sharedChannel) {
        setSharedChannel(null);
        setSearchParams({}, { replace: true });
      }

      let targetIndex = 0;
      updateWorkspace((prev) => ({
        ...prev,
        channels: prev.channels.map((ch) => {
          if (ch.id !== prev.activeChannelId) return ch;
          const existingIdx = ch.items.findIndex(
            (x) => x.provider === newItem.provider && x.providerId === newItem.providerId
          );
          if (existingIdx >= 0) {
            targetIndex = existingIdx;
            return ch;
          }
          targetIndex = ch.items.length;
          return {
            ...ch,
            items: [...ch.items, newItem],
            updatedAt: new Date().toISOString()
          };
        })
      }));

      setCurrentIndex(targetIndex);
      setUrlInput('');
      setCustomTitle('');
      setToast(`Programado en MiTV: «${newItem.title}»`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleWatched = (itemId: string, advanceIfCurrent = false) => {
    updateWorkspace((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id !== prev.activeChannelId
          ? ch
          : {
              ...ch,
              items: ch.items.map((it) =>
                it.id === itemId ? { ...it, watched: !it.watched } : it
              ),
              updatedAt: new Date().toISOString()
            }
      )
    }));
    if (advanceIfCurrent && items.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id !== prev.activeChannelId
          ? ch
          : {
              ...ch,
              items: ch.items.filter((it) => it.id !== itemId),
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
      channels: prev.channels.map((ch) => {
        if (ch.id !== prev.activeChannelId) return ch;
        const copy = [...ch.items];
        const [moved] = copy.splice(index, 1);
        copy.splice(nextIdx, 0, moved);
        return { ...ch, items: copy, updatedAt: new Date().toISOString() };
      })
    }));
    if (safeIndex === index) setCurrentIndex(nextIdx);
    else if (safeIndex === nextIdx) setCurrentIndex(index);
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newChannelName.trim();
    if (!cleaned) return;
    const newId = `mitv-${Date.now().toString(36)}`;
    updateWorkspace((prev) => ({
      activeChannelId: newId,
      channels: [
        ...prev.channels,
        {
          id: newId,
          name: cleaned,
          items: [],
          updatedAt: new Date().toISOString()
        }
      ]
    }));
    setSharedChannel(null);
    setSearchParams({}, { replace: true });
    setCurrentIndex(0);
    setNewChannelName('');
    setIsCreatingChannel(false);
    setToast(`Canal MiTV «${cleaned}» creado.`);
  };

  const handleRenameChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = renameChannelDraft.trim();
    if (!cleaned || !activeOwnChannel) {
      setIsRenamingChannel(false);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id === prev.activeChannelId
          ? { ...ch, name: cleaned, updatedAt: new Date().toISOString() }
          : ch
      )
    }));
    setIsRenamingChannel(false);
    setToast(`Renombrado a «${cleaned}».`);
  };

  const handleRenameItem = (e: React.FormEvent, itemId: string) => {
    e.preventDefault();
    const cleaned = editingItemDraft.trim();
    if (!cleaned) {
      setEditingItemId(null);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id !== prev.activeChannelId
          ? ch
          : {
              ...ch,
              items: ch.items.map((it) => (it.id === itemId ? { ...it, title: cleaned } : it)),
              updatedAt: new Date().toISOString()
            }
      )
    }));
    setEditingItemId(null);
    setToast(`Título actualizado a «${cleaned}».`);
  };

  const handleDeleteActiveChannel = () => {
    if (!activeOwnChannel || workspace.channels.length <= 1) return;
    const removedName = activeOwnChannel.name;
    updateWorkspace((prev) => {
      const remaining = prev.channels.filter((c) => c.id !== prev.activeChannelId);
      return {
        channels: remaining,
        activeChannelId: remaining[0]?.id || prev.activeChannelId
      };
    });
    setCurrentIndex(0);
    setToast(`Canal «${removedName}» eliminado.`);
  };

  const handlePublishToMySignal = () => {
    if (!activeOwnChannel || activeOwnChannel.items.length === 0) {
      setToast('Agregá al menos un video antes de enviarlo a Mi Señal.');
      return;
    }
    const signalId = `signal-mitv-${activeOwnChannel.id.replace(/^mitv-/, '')}`;
    const schedule: ScheduleBlock[] = activeOwnChannel.items.map((it, idx) => ({
      id: `${signalId}-blk-${idx}`,
      position: idx,
      startOffsetSec: idx * 300,
      durationSec: 300,
      topic: `MiTV · ${it.slot}`,
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
        channelName: it.author,
        channelTitle: it.author,
        channelId: `mitv-${it.providerId}`,
        isLive: it.slot === 'En vivo',
        isVerified: true
      } as any
    }));
    const signal: any = {
      id: signalId,
      name: `MiTV · ${activeOwnChannel.name}`,
      seedVersion: 5,
      prompt: `Grilla programada en MiTV · ${activeOwnChannel.name}`,
      visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      schedule
    };
    setSignal(signal, { saveToOwn: true });
    void persistSignal(signal);
    updateWorkspace((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id === activeOwnChannel.id ? { ...ch, publishedToMySignal: true } : ch
      )
    }));
    setToast(`«${activeOwnChannel.name}» enviada a Mi Señal.`);
    navigate(`/misenal1?signal=${encodeURIComponent(signalId)}`);
  };

  const handleSaveSharedChannel = () => {
    if (!sharedChannel) return;
    const savedId = `mitv-${Date.now().toString(36)}`;
    updateWorkspace((prev) => ({
      activeChannelId: savedId,
      channels: [
        ...prev.channels,
        {
          ...sharedChannel,
          id: savedId,
          updatedAt: new Date().toISOString()
        }
      ]
    }));
    setSharedChannel(null);
    setSearchParams({}, { replace: true });
    setToast(`«${sharedChannel.name}» guardada en tus canales de MiTV.`);
  };

  const handleShareChannel = async () => {
    if (!displayedChannel || displayedChannel.items.length === 0) return;
    const url = buildMiTvShareUrl(displayedChannel);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: `${displayedChannel.name} · MiTV`,
          text: `Mirá mi programación «${displayedChannel.name}» en YOUAPP MiTV`,
          url
        });
        return;
      }
    } catch {
      // fallback portapapeles
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setToast(`Enlace de «${displayedChannel.name}» copiado al portapapeles.`);
  };

  const ambientThumbUrl =
    currentItem?.thumbnailUrl ||
    items.find((i) => i.thumbnailUrl)?.thumbnailUrl ||
    '';

  const pendingCount = items.filter((i) => !i.watched).length;

  return (
    <div className="mitv-page">
      {/* Fondo atmosférico difuminado estilo Apple Glass */}
      <div
        className="mitv-ambient-bg"
        aria-hidden="true"
        style={ambientThumbUrl ? { backgroundImage: `url(${ambientThumbUrl})` } : undefined}
      />
      <div className="mitv-ambient-veil" aria-hidden="true" />

      {/* Cabecera minimalista */}
      <header className="mitv-header">
        <div className="mitv-header-left">
          <button
            type="button"
            className="mitv-logo-btn"
            onClick={() => navigate('/misenal1')}
            title="Volver a Mi Señal"
          >
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="mitv-pill-brand">MITV</span>
        </div>

        <nav className="mitv-nav">
          <button type="button" className="mitv-nav-btn" onClick={() => navigate('/misenal1')}>
            MI SEÑAL
          </button>
          <button type="button" className="mitv-nav-btn" onClick={() => navigate('/youmusic')}>
            YOU MUSIC
          </button>
          <button type="button" className="mitv-nav-btn" onClick={() => navigate('/reels')}>
            REELS
          </button>
          <button type="button" className="mitv-nav-btn" onClick={() => navigate('/lecturas')}>
            LECTURAS
          </button>
          <button type="button" className="mitv-nav-btn" onClick={() => navigate('/dial')}>
            YOU DIAL
          </button>
          <button type="button" className="mitv-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button
            type="button"
            className="mitv-nav-btn"
            onClick={() => setIsRemoteQrOpen(true)}
            title={`Mostrar código QR y PIN #${myTvCode} para controlar esta MiTV desde tu celular`}
          >
            REMOTE #{myTvCode}
          </button>
          <button
            type="button"
            className="mitv-nav-btn"
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

      <main className="mitv-main">
        {toast && (
          <div className="mitv-toast" role="status">
            <Check size={14} />
            <span>{toast}</span>
          </div>
        )}

        {sharedChannel && (
          <div className="mitv-shared-bar">
            <span>
              <Sparkles size={14} color="#64d2ff" />
              <strong>{sharedChannel.name}</strong> ({sharedChannel.items.length}{' '}
              {sharedChannel.items.length === 1 ? 'video' : 'videos'})
            </span>
            <div className="mitv-shared-actions">
              <button type="button" className="mitv-btn-primary" onClick={handleSaveSharedChannel}>
                <Plus size={14} /> Guardar en MiTV
              </button>
              <button
                type="button"
                className="mitv-pill-btn"
                onClick={() => {
                  setSharedChannel(null);
                  setSearchParams({}, { replace: true });
                  setCurrentIndex(0);
                }}
              >
                Volver a mi canal
              </button>
            </div>
          </div>
        )}

        {/* 1. MIS CANALES DE MiTV (BARRA FINA, DISIMULADA Y DESPLEGABLE) */}
        <section
          className={`mitv-card mitv-channels-card ${isChannelsPanelOpen ? 'is-open' : 'is-collapsed'}`}
          aria-label="Mis canales de MiTV"
        >
          <button
            type="button"
            className="mitv-channels-toggle"
            onClick={() => setIsChannelsPanelOpen((v) => !v)}
            aria-expanded={isChannelsPanelOpen}
          >
            <span className="mitv-channels-toggle-left">
              {isViewingOfficialLive && !sharedChannel ? (
                <span className="mitv-live-dot" />
              ) : (
                <Tv size={13} style={{ opacity: 0.75, flexShrink: 0 }} />
              )}
              <strong className="mitv-channels-toggle-name">
                {displayedChannel?.name || 'MiTV'}
              </strong>
              <span className="mitv-channels-toggle-count">{items.length}</span>
              <span className="mitv-channels-toggle-hint">· Programá lo que querés ver hoy</span>
            </span>
            <span className="mitv-channels-toggle-right">
              <span>{isChannelsPanelOpen ? 'Ocultar' : 'Canales'}</span>
              <ChevronDown
                size={14}
                style={{
                  transform: isChannelsPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.18s ease'
                }}
              />
            </span>
          </button>

          {isChannelsPanelOpen && (
            <div className="mitv-channels-collapsible">
              <div className="mitv-ch-top">
                <div className="mitv-ch-title">
                  <span className="mitv-badge">
                    <Tv size={11} /> MI TELEVISOR PERSONAL
                  </span>
                </div>

                <div className="mitv-ch-actions">
                  {!sharedChannel && items.length > 0 && (
                    <button
                      type="button"
                      className="mitv-btn-primary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      onClick={handlePublishToMySignal}
                      title="Llevar esta grilla al aire en Mi Señal"
                    >
                      <Radio size={13} />
                      <span>Enviar a Mi Señal</span>
                    </button>
                  )}
                  {items.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="mitv-pill-btn"
                        style={{ borderColor: 'rgba(37, 211, 102, 0.45)', color: '#9bf5bd' }}
                        onClick={() => {
                          if (!displayedChannel) return;
                          openWhatsAppMiTvShare({
                            channelName: displayedChannel.name,
                            shareUrl: buildMiTvShareUrl(displayedChannel),
                            itemCount: displayedChannel.items.length
                          });
                          setToast(`Abriendo WhatsApp para compartir «${displayedChannel.name}»…`);
                        }}
                        title="Compartir este canal directamente por WhatsApp (se abre sin registro)"
                      >
                        <Share2 size={13} color="#25D366" /> WhatsApp
                      </button>
                      <button
                        type="button"
                        className="mitv-pill-btn"
                        onClick={() => void handleShareChannel()}
                      >
                        <Share2 size={13} /> Compartir
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mitv-tabs" role="tablist" aria-label="Canales de MiTV">
                <button
                  type="button"
                  className={`mitv-tab mitv-tab-live ${!sharedChannel && isViewingOfficialLive ? 'active' : ''}`}
                  onClick={() => {
                    setSharedChannel(null);
                    setSearchParams({}, { replace: true });
                    setIsViewingOfficialLive(true);
                    setIsChannelMenuOpen(false);
                    setCurrentIndex(0);
                  }}
                >
                  <span className="mitv-live-dot" />
                  <span>TV en Vivo</span>
                  <em>{OFFICIAL_LIVE_TV_CHANNEL.items.length}</em>
                </button>

                <div className="mitv-ch-dropdown" ref={channelMenuRef}>
                  <button
                    type="button"
                    className={`mitv-tab mitv-ch-trigger ${!sharedChannel && !isViewingOfficialLive ? 'active' : ''}`}
                    onClick={() => setIsChannelMenuOpen((v) => !v)}
                    aria-expanded={isChannelMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <Tv size={13} />
                    <span>{activeOwnChannel?.name || 'Mis canales'}</span>
                    <em>{activeOwnChannel?.items.length ?? 0}</em>
                    <ChevronDown
                      size={14}
                      style={{
                        transform: isChannelMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.16s ease'
                      }}
                    />
                  </button>

                  {isChannelMenuOpen && (
                    <div className="mitv-ch-menu" role="listbox" aria-label="Mis canales de MiTV">
                      <div className="mitv-ch-menu-head">
                        Mis canales ({workspace.channels.length})
                      </div>
                      {workspace.channels.map((ch) => {
                        const isSelected =
                          !sharedChannel && !isViewingOfficialLive && ch.id === activeOwnChannel?.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`mitv-ch-option ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setSharedChannel(null);
                              setIsViewingOfficialLive(false);
                              setSearchParams({}, { replace: true });
                              updateWorkspace((prev) => ({ ...prev, activeChannelId: ch.id }));
                              setCurrentIndex(0);
                              setIsChannelMenuOpen(false);
                            }}
                          >
                            <span className="mitv-ch-option-name">
                              <Tv size={13} />
                              <span>{ch.name}</span>
                            </span>
                            <span className="mitv-ch-option-right">
                              <em>{ch.items.length}</em>
                              {isSelected && <Check size={13} color="#64d2ff" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="mitv-tab-new"
                  onClick={() => {
                    setIsChannelMenuOpen(false);
                    setIsCreatingChannel((v) => !v);
                  }}
                >
                  <Plus size={13} /> Nuevo canal
                </button>
              </div>

              {isCreatingChannel && (
                <form className="mitv-new-form" onSubmit={handleCreateChannel}>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="Nombre del canal (ej. Noticias Mañana, Documentales, Cine…)"
                    autoFocus
                  />
                  <button type="submit" className="mitv-btn-primary">
                    Crear
                  </button>
                </form>
              )}
            </div>
          )}
        </section>

        {/* 2. REPRODUCTOR MiTV (MULTIFUENTE CONTINUO) */}
        {currentItem && (
          <section
            ref={playerCardRef}
            className={`mitv-card mitv-player-card ${isFullscreen ? 'is-expanded' : ''}`}
          >
            <div className="mitv-video-wrap">
              {isMomentsMosaic && currentItem ? (() => {
                const dur = progressRef.current.duration > 30 ? progressRef.current.duration : 240;
                const ratios = [0.08, 0.32, 0.58, 0.82];
                const labels = ['Inicio / Clave 1', 'Desarrollo / Clave 2', 'Punto central / Clave 3', 'Cierre / Clave 4'];
                const quadMoments = ratios.map((r, i) => ({
                  id: `mitv-mom-${currentItem.id}-${i}`,
                  startSec: Math.floor(dur * r),
                  title: labels[i],
                  summary: currentItem.title,
                  type: 'key_point' as const,
                  confidence: 0.9,
                  source: 'fallback' as const
                }));
                const mosaicBlock: ScheduleBlock = {
                  id: currentItem.id,
                  position: safeIndex,
                  startOffsetSec: 0,
                  durationSec: dur,
                  topic: currentItem.title,
                  role: 'explainer',
                  contentItem: {
                    id: activeYouTubeVideoId || currentItem.providerId,
                    providerId: activeYouTubeVideoId || currentItem.providerId,
                    type: 'video',
                    provider: currentItem.provider === 'direct' ? 'local' : 'youtube',
                    title: currentItem.title,
                    videoUrl: currentItem.sourceUrl,
                    thumbnailUrl: currentItem.thumbnailUrl,
                    channelName: currentItem.author,
                    channelTitle: currentItem.author
                  } as any
                };
                return (
                  <MosaicPlayerGrid
                    moments={quadMoments}
                    currentBlock={mosaicBlock}
                    thumbnailFallbackUrl={currentItem.thumbnailUrl}
                    isPlaying={isPlaying}
                    onSelect={(m) => {
                      setIsMomentsMosaic(false);
                      window.setTimeout(() => handleSmartSeek(m.startSec), 450);
                    }}
                  />
                );
              })() : isYou4Mode ? (() => {
                // Construye 4 pantallas reales con los videos/canales de MiTV (completando con TV en vivo oficial si hay < 4)
                const pool: { item: MiTvItem; itemIdx: number | null; ytVid: string | null }[] = [];
                const seen = new Set<string>();
                const total = items.length;
                for (let step = 0; step < total; step++) {
                  const idx = (safeIndex + you4Offset + step) % total;
                  const it = items[idx];
                  if (!it) continue;
                  const ytVid =
                    it.provider === 'youtube'
                      ? it.providerId
                      : it.provider === 'youtube_live'
                        ? resolvedLiveIds[it.providerId] || it.liveVideoId || null
                        : null;
                  const isPlayable = Boolean(ytVid) || it.provider === 'direct';
                  if (!isPlayable) continue;
                  const key = ytVid || it.sourceUrl;
                  if (seen.has(key)) continue;
                  seen.add(key);
                  pool.push({ item: it, itemIdx: idx, ytVid });
                  if (pool.length >= 4) break;
                }
                if (pool.length < 4) {
                  for (const liveIt of OFFICIAL_LIVE_TV_CHANNEL.items) {
                    const ytVid = resolvedLiveIds[liveIt.providerId] || liveIt.liveVideoId || null;
                    if (!ytVid || seen.has(ytVid)) continue;
                    seen.add(ytVid);
                    pool.push({ item: liveIt, itemIdx: null, ytVid });
                    if (pool.length >= 4) break;
                  }
                }
                const quadSlots = pool.slice(0, 4);
                const ytOrigin =
                  typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

                return (
                  <div className="mitv-you4-grid" aria-label="YOU4 · 4 pantallas simultáneas en MiTV">
                    {quadSlots.map((slot, slotIdx) => {
                      const isAudioActive = you4AudioSlot === slotIdx;
                      return (
                        <div
                          key={`${slot.item.id}-${slotIdx}`}
                          className={`mitv-you4-tile ${isAudioActive ? 'audio-active' : ''}`}
                          onClick={() => handleSelectYou4Audio(slotIdx)}
                        >
                          {slot.item.provider === 'direct' ? (
                            <video
                              ref={(el) => {
                                you4VideosRef.current[slotIdx] = el;
                              }}
                              src={slot.item.sourceUrl}
                              autoPlay
                              loop
                              playsInline
                              muted={!isAudioActive}
                              onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                const dur = Number.isFinite(v.duration) ? v.duration : 0;
                                you4ProgressRef.current[slotIdx] = {
                                  currentTime: v.currentTime || 0,
                                  duration: dur,
                                  playing: !v.paused
                                };
                                if (slotIdx === you4AudioSlotRef.current && dur > 0) {
                                  progressRef.current = { currentTime: v.currentTime || 0, duration: dur };
                                  usePlayerStore.getState().setProgress(v.currentTime || 0, dur);
                                }
                              }}
                              className="mitv-you4-media"
                            />
                          ) : (
                            <iframe
                              ref={(el) => {
                                you4IframesRef.current[slotIdx] = el;
                              }}
                              title={`YOU4 · ${slot.item.title}`}
                              src={`https://www.youtube.com/embed/${encodeURIComponent(slot.ytVid || '')}?autoplay=1&mute=${slotIdx === 0 ? 0 : 1}&controls=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${ytOrigin ? `&origin=${ytOrigin}` : ''}`}
                              onLoad={(e) => {
                                try {
                                  e.currentTarget.contentWindow?.postMessage(
                                    JSON.stringify({ event: 'listening', id: slotIdx, channel: 'widget' }),
                                    '*'
                                  );
                                } catch {
                                  // ignore
                                }
                              }}
                              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                              allowFullScreen
                              className="mitv-you4-media"
                            />
                          )}

                          <div className="mitv-you4-top-bar">
                            <span className="mitv-you4-ch-badge">
                              {slotIdx + 1} · {slot.item.author || slot.item.title}
                            </span>
                            <div className="mitv-you4-tile-actions">
                              <button
                                type="button"
                                className={`mitv-you4-chip ${isAudioActive ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectYou4Audio(slotIdx);
                                }}
                                title={isAudioActive ? 'Audio activo' : 'Escuchar esta pantalla'}
                              >
                                {isAudioActive ? <Volume2 size={11} /> : <VolumeX size={11} />}
                                <span>{isAudioActive ? 'Audio' : 'Mudo'}</span>
                              </button>
                              <button
                                type="button"
                                className="mitv-you4-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (slot.itemIdx !== null) {
                                    setCurrentIndex(slot.itemIdx);
                                  }
                                  setIsYou4Mode(false);
                                }}
                                title="Ver esta pantalla en grande"
                                aria-label="Ver esta pantalla en grande"
                              >
                                <Maximize2 size={11} />
                              </button>
                            </div>
                          </div>

                          <div className="mitv-you4-bottom-bar">
                            <span className="mitv-you4-title">{slot.item.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
              <>
              {(currentItem.provider === 'youtube' || currentItem.provider === 'youtube_live') &&
                (activeYouTubeVideoId ? (
                  <div
                    ref={ytHostRef}
                    className="mitv-yt-host"
                    aria-label={`Reproductor YouTube · ${currentItem.title}`}
                  />
                ) : (
                  <div className="mitv-live-offline">
                    <Radio size={28} color="#64d2ff" />
                    <strong>
                      {resolvingLiveChannelId === currentItem.providerId
                        ? `Buscando transmisión en vivo de ${currentItem.author}…`
                        : `${currentItem.author} no tiene un vivo abierto en este momento`}
                    </strong>
                    <span>
                      Los canales de aire y streams transmiten según su grilla horaria. Podés abrir
                      el canal oficial o pasar al siguiente canal 24/7.
                    </span>
                    <div className="mitv-live-offline-actions">
                      <a
                        href={currentItem.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mitv-btn-primary"
                      >
                        <ExternalLink size={14} /> Abrir canal en YouTube
                      </a>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="mitv-pill-btn"
                          onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
                        >
                          Siguiente canal →
                        </button>
                      )}
                    </div>
                  </div>
                ))}

              {currentItem.provider === 'vimeo' && (
                <iframe
                  key={`${displayedChannel?.id || 'ch'}-vm-${currentItem.providerId}-${safeIndex}`}
                  title={`Vimeo · ${currentItem.title}`}
                  src={`https://player.vimeo.com/video/${encodeURIComponent(currentItem.providerId)}?autoplay=1`}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )}

              {currentItem.provider === 'dailymotion' && (
                <DailymotionOfficialPlayer
                  videoId={currentItem.providerId}
                  title={currentItem.title}
                  thumbnailUrl={currentItem.thumbnailUrl}
                  autoplay
                />
              )}

              {currentItem.provider === 'tiktok' && (
                <div className="mitv-social-embed-stage">
                  <iframe
                    key={`${displayedChannel?.id || 'ch'}-tt-${currentItem.providerId}-${safeIndex}`}
                    title={`TikTok · ${currentItem.title}`}
                    src={`https://www.tiktok.com/player/v1/${encodeURIComponent(currentItem.providerId)}?embed_from=oembed&music_info=1&description=1&autoplay=1&muted=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                    className="mitv-vertical-iframe"
                  />
                </div>
              )}

              {currentItem.provider === 'instagram' && (
                <div className="mitv-social-embed-stage">
                  <iframe
                    key={`${displayedChannel?.id || 'ch'}-ig-${currentItem.providerId}-${safeIndex}`}
                    title={`Instagram · ${currentItem.title}`}
                    src={`https://www.instagram.com/${currentItem.providerId}/embed/`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="mitv-vertical-iframe"
                  />
                </div>
              )}

              {currentItem.provider === 'facebook' &&
                (/\/reel\//i.test(currentItem.sourceUrl) ? (
                  <div className="mitv-social-embed-stage">
                    <iframe
                      key={`${displayedChannel?.id || 'ch'}-fb-r-${currentItem.id}-${safeIndex}`}
                      title={`Facebook Reel · ${currentItem.title}`}
                      src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(currentItem.sourceUrl)}&show_text=false&autoplay=true&width=340`}
                      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                      className="mitv-vertical-iframe"
                    />
                  </div>
                ) : (
                  <iframe
                    key={`${displayedChannel?.id || 'ch'}-fb-${currentItem.id}-${safeIndex}`}
                    title={`Facebook · ${currentItem.title}`}
                    src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(currentItem.sourceUrl)}&show_text=false&autoplay=true&width=720`}
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                  />
                ))}

              {currentItem.provider === 'twitch' && (
                <iframe
                  key={`${displayedChannel?.id || 'ch'}-tw-${currentItem.providerId}-${safeIndex}`}
                  title={`Twitch · ${currentItem.title}`}
                  src={
                    currentItem.providerId.startsWith('video:')
                      ? `https://player.twitch.tv/?video=${encodeURIComponent(currentItem.providerId.slice(6))}&parent=${encodeURIComponent(typeof window !== 'undefined' ? window.location.hostname : 'localhost')}&autoplay=true`
                      : `https://player.twitch.tv/?channel=${encodeURIComponent(currentItem.providerId.replace(/^channel:/, ''))}&parent=${encodeURIComponent(typeof window !== 'undefined' ? window.location.hostname : 'localhost')}&autoplay=true`
                  }
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              )}

              {currentItem.provider === 'x' && (
                <XOfficialTweetEmbed
                  key={`${displayedChannel?.id || 'ch'}-x-${currentItem.providerId}-${safeIndex}`}
                  tweetId={currentItem.providerId}
                  sourceUrl={currentItem.sourceUrl}
                />
              )}

              {currentItem.provider === 'direct' && (
                <video
                  ref={directVideoRef}
                  key={`${displayedChannel?.id || 'ch'}-mp4-${currentItem.id}`}
                  src={currentItem.sourceUrl}
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    progressRef.current = {
                      currentTime: v.currentTime || 0,
                      duration: Number.isFinite(v.duration) ? v.duration : 0
                    };
                    usePlayerStore
                      .getState()
                      .setProgress(progressRef.current.currentTime, progressRef.current.duration);
                  }}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    progressRef.current = {
                      currentTime: v.currentTime || 0,
                      duration: Number.isFinite(v.duration) ? v.duration : progressRef.current.duration
                    };
                    usePlayerStore
                      .getState()
                      .setProgress(progressRef.current.currentTime, progressRef.current.duration);
                  }}
                  onPlay={() => {
                    setIsPlaying(true);
                    usePlayerStore.getState().setPlaybackState('playing');
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    usePlayerStore.getState().setPlaybackState('paused');
                  }}
                  onEnded={() => {
                    if (items.length > 1) {
                      setCurrentIndex((prev) => (prev + 1) % items.length);
                    }
                  }}
                />
              )}
              </>
              )}

              {isFullscreen && (
                <button
                  type="button"
                  className="mitv-fs-exit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFullscreen();
                  }}
                  title="Salir de pantalla completa"
                  aria-label="Salir de pantalla completa"
                >
                  <Minimize2 size={15} />
                  <span>Salir</span>
                </button>
              )}
            </div>

            <div className="mitv-now-bar">
              <div className="mitv-now-meta">
                <div className="mitv-now-top-meta">
                  <span className="mitv-live-pill">EN PANTALLA</span>
                  {(() => {
                    const likeKey = `${currentItem.provider}:${currentItem.providerId}`;
                    const followKey =
                      currentItem.provider === 'youtube_live'
                        ? `ch:${currentItem.providerId}`
                        : `mitv:${displayedChannel?.id || 'default'}`;
                    const isLiked = socialGraph.likedVideoKeys.includes(likeKey);
                    const likeCount = Number(
                      socialGraph.likeCounts?.[likeKey] ?? (isLiked ? 1 : 0)
                    );
                    const isFollowed = socialGraph.followedSignalIds.includes(followKey);
                    const ytSubUrl =
                      currentItem.provider === 'youtube' || currentItem.provider === 'youtube_live'
                        ? buildYouTubeSubscribeUrl({
                            channelId:
                              currentItem.provider === 'youtube_live'
                                ? currentItem.providerId
                                : undefined,
                            sourceUrl: currentItem.sourceUrl
                          })
                        : null;
                    return (
                      <div className="mitv-top-social-row">
                        <div className="mitv-top-social-icons">
                          <button
                            type="button"
                            className={`mitv-top-icon-btn ${likeCount > 0 ? 'has-count' : ''} ${isLiked ? 'is-liked' : ''}`}
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
                            aria-pressed={isLiked}
                          >
                            <Heart size={14} fill={isLiked ? '#ff375f' : 'none'} strokeWidth={2.1} />
                            {likeCount > 0 && (
                              <span key={`lc-${likeCount}`} className="mitv-like-count">
                                {likeCount}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`mitv-top-icon-btn ${isFollowed ? 'is-subbed' : ''}`}
                            onClick={() => {
                              const willSubscribe = !isFollowed;
                              setSocialGraph((prev) => {
                                const res = toggleFollowCreatorWithMeta(prev, {
                                  key: followKey,
                                  name: currentItem.author || displayedChannel?.name || 'Creador',
                                  provider: currentItem.provider,
                                  sourceUrl: currentItem.sourceUrl
                                });
                                return res.graph;
                              });
                              if (willSubscribe && ytSubUrl) {
                                window.open(
                                  ytSubUrl,
                                  'youapp_yt_sub',
                                  'width=540,height=660,noopener,noreferrer'
                                );
                                setToast(
                                  `Siguiendo a «${currentItem.author}» en YOUAPP · Confirmá también en YouTube.`
                                );
                              } else {
                                setToast(
                                  willSubscribe
                                    ? `Siguiendo a «${currentItem.author}» en YOUAPP.`
                                    : `Dejaste de seguir a «${currentItem.author}».`
                                );
                              }
                            }}
                            title={
                              ytSubUrl
                                ? 'Suscribirse en YOUAPP y YouTube'
                                : isFollowed
                                  ? 'Siguiendo'
                                  : 'Suscribirse'
                            }
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

                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                          <button
                            type="button"
                            className="mitv-top-icon-btn"
                            onClick={async () => {
                              const targetWatchUrl =
                                currentItem.sourceUrl ||
                                (currentItem.provider === 'youtube' && currentItem.providerId
                                  ? `https://www.youtube.com/watch?v=${currentItem.providerId}`
                                  : '');
                              const shareUrl = targetWatchUrl
                                ? `https://youapptv.com/mitv?add=${encodeURIComponent(targetWatchUrl)}`
                                : 'https://youapptv.com/mitv';
                              await shareContentUniversal({
                                title: `${currentItem.title} · YOUAPP TV`,
                                text: `Mirá «${currentItem.title}» en MiTV (YOUAPP)`,
                                url: shareUrl
                              });
                            }}
                            title="Compartir este video"
                            aria-label="Compartir este video"
                          >
                            <Share2 size={14} />
                          </button>
                          <button
                            type="button"
                            className="mitv-top-icon-btn"
                            onClick={async () => {
                              const androidBridge = (window as any).YouAppAndroidPiP;
                              if (androidBridge && typeof androidBridge.enterPiP === 'function') {
                                androidBridge.enterPiP();
                                return;
                              }
                              const docPiP = (window as any).documentPictureInPicture;
                              if (docPiP && typeof docPiP.requestWindow === 'function' && currentItem.providerId) {
                                try {
                                  if (docPiP.window && !docPiP.window.closed) {
                                    docPiP.window.close();
                                    return;
                                  }
                                  const pipParams = new URLSearchParams({
                                    provider: currentItem.provider || 'youtube',
                                    id: currentItem.providerId
                                  });
                                  const pipWin: Window = await docPiP.requestWindow({ width: 420, height: 245 });
                                  pipWin.document.title = `${currentItem.title} · YOUAPP`;
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
                              setCastNotice('En el APK Android o en PC (Chrome/Edge) activa la ventana flotante del sistema.');
                              window.setTimeout(() => setCastNotice(null), 3200);
                            }}
                            title="Ventana flotante (Picture-in-Picture)"
                            aria-label="Ventana flotante (Picture-in-Picture)"
                          >
                            <PictureInPicture2 size={14} />
                          </button>
                          <button
                            type="button"
                            className="mitv-top-icon-btn mitv-top-fs-btn"
                            onClick={() => void handleToggleFullscreen()}
                            title={isFullscreen ? 'Salir de pantalla completa' : 'Agrandar pantalla'}
                            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Agrandar pantalla'}
                          >
                            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <strong>{currentItem.title}</strong>
                <span>
                  {currentItem.author}
                  {(() => {
                    const viewsLabel = formatCompactViews(
                      currentVideoMeta?.viewCount,
                      currentVideoMeta?.isLive || currentItem.provider === 'youtube_live'
                    );
                    const dateLabel = formatPublishedDateEs(
                      currentVideoMeta?.publishedAt || currentItem.addedAt
                    );
                    return (
                      <>
                        {viewsLabel ? ` · ${viewsLabel}` : ''}
                        {dateLabel ? ` · ${dateLabel}` : ''}
                      </>
                    );
                  })()}
                </span>
              </div>

              {(currentItem.provider === 'youtube_live' ||
                currentItem.provider === 'tiktok' ||
                currentItem.provider === 'instagram' ||
                currentItem.provider === 'facebook' ||
                currentItem.provider === 'twitch' ||
                currentItem.provider === 'x') && (
                <a
                  href={currentItem.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mitv-pill-btn"
                  style={{ flexShrink: 0 }}
                  title="Abrir publicación o transmisión original"
                >
                  <ExternalLink size={12} />{' '}
                  {currentItem.provider === 'youtube_live' ? 'Vivo' : 'Original'}
                </a>
              )}
            </div>

            {/* BARRA INTELIGENTE UNIFICADA ESTILO APPLE (3 puntos: 🟠 Momentos · 🔵 YOU4 · 🟢 Transmitir + ❤️ + Suscripción) */}
            <div className="mitv-smartbar-slot" style={{ position: 'relative' }} ref={castBoxRef}>
              {isCastOpen && (
                <div className="mitv-cast-popover" role="dialog" aria-label="Transmitir YOUAPP">
                  <div className="mitv-cast-head">Transmitir / Control Remoto</div>

                  <button
                    type="button"
                    className="mitv-ch-option"
                    onClick={() => {
                      setIsCastOpen(false);
                      setIsRemoteQrOpen(true);
                    }}
                  >
                    <span className="mitv-ch-option-name">
                      <Tv size={14} color="#30d158" />
                      <span>Mostrar QR / PIN #{myTvCode} (Celular)</span>
                    </span>
                  </button>

                  {isChromePresentationSupported && (
                    <>
                      <div className="mitv-cast-divider" />
                      <button
                        type="button"
                        className="mitv-ch-option"
                        onClick={() => void handleChromeNativeCast()}
                      >
                        <span className="mitv-ch-option-name">
                          <Cast size={14} color="#64d2ff" />
                          <span>Buscar TV / Chromecast (Chrome)</span>
                        </span>
                      </button>
                    </>
                  )}

                  <div className="mitv-cast-divider" />

                  {connectedCastCode ? (
                    <div className="mitv-cast-connected">
                      <span>
                        Transmitiendo a <strong>TV {connectedCastCode}</strong>
                      </span>
                      <button
                        type="button"
                        className="mitv-cast-stop-btn"
                        onClick={handleDisconnectCast}
                      >
                        Desconectar
                      </button>
                    </div>
                  ) : (
                    <form className="mitv-cast-code-form" onSubmit={handleConnectCastCode}>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={castTargetCodeInput}
                        onChange={(e) => setCastTargetCodeInput(e.target.value)}
                        placeholder="Código de TV (ej. 4829)"
                        aria-label="Código de TV"
                      />
                      <button type="submit" className="mitv-cast-connect-btn">
                        Conectar
                      </button>
                    </form>
                  )}
                </div>
              )}

              <SmartBar
                unifiedAppleMode
                isPlaying={isPlaying}
                onPlayPause={handleSmartPlayPause}
                onSeek={handleSmartSeek}
                isMosaic={isMomentsMosaic}
                onToggleMosaic={() => {
                  setIsYou4Mode(false);
                  setIsMomentsMosaic((prev) => {
                    const next = !prev;
                    setIsFullscreen(next);
                    return next;
                  });
                }}
                isYou4={isYou4Mode}
                onToggleYou4={() => {
                  setIsMomentsMosaic(false);
                  setIsYou4Mode((prev) => {
                    const next = !prev;
                    if (next) {
                      setYou4AudioSlot(0);
                      setYou4Offset(0);
                    }
                    setIsFullscreen(next);
                    return next;
                  });
                }}
                isCasting={Boolean(isCastOpen || connectedCastCode || isReceivingCast)}
                onToggleCast={() => void handleCastClick()}
                isMutedExternal={isMuted || playerVolume === 0}
                onToggleMuteExternal={handleToggleMute}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => void handleToggleFullscreen()}
                onNextBlock={
                  items.length > 1
                    ? () => {
                        if (isYou4Mode) {
                          setYou4Offset((prev) => (prev + 4) % Math.max(1, items.length));
                        } else {
                          setCurrentIndex((prev) => (prev + 1) % items.length);
                        }
                      }
                    : undefined
                }
                onPreviousBlock={
                  items.length > 1
                    ? () => {
                        if (isYou4Mode) {
                          setYou4Offset(
                            (prev) =>
                              (prev - 4 + Math.max(4, items.length)) %
                              Math.max(1, items.length)
                          );
                        } else {
                          setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
                        }
                      }
                    : undefined
                }
              />
            </div>
          </section>
        )}

        {/* 3. BARRA DISIMULADA: SUMAR VIDEO POR URL */}
        <section className="mitv-add-card" aria-label="Agregar video por URL">
          <form className="mitv-add-form" onSubmit={handleAddUrl}>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="+ Pegá una URL (YouTube, TikTok, Instagram, Facebook, Twitch, X, Vimeo o MP4)…"
              aria-label="Pegar URL del video"
            />
            <button type="submit" className="mitv-add-submit" disabled={isAdding}>
              <Plus size={14} />
              <span>{isAdding ? 'Sumando…' : 'Sumar'}</span>
            </button>
            <a
              ref={bookmarkletRef}
              href="#mitv-bookmarklet"
              className="mitv-bookmarklet-pill"
              onClick={(e) => {
                e.preventDefault();
                setToast('Arrastrá «+ Mi TV» a tu barra de marcadores para enviar videos en 1 clic desde YouTube.');
              }}
              title="Arrastrá este botón a tu barra de marcadores para sumar videos desde YouTube en 1 clic"
            >
              <Plus size={12} /> Mi TV
            </a>
          </form>

          {errorMsg && <div className="mitv-error">{errorMsg}</div>}
        </section>

        {/* 4. GRILLA DE PROGRAMACIÓN */}
        <section id="mitv-grid" className="mitv-card mitv-grid-card">
          <div className="mitv-grid-header">
            {isRenamingChannel && !isReadOnlyChannel ? (
              <form className="mitv-inline-rename" onSubmit={handleRenameChannel}>
                <input
                  type="text"
                  value={renameChannelDraft}
                  onChange={(e) => setRenameChannelDraft(e.target.value)}
                  placeholder="Nombre del canal…"
                  autoFocus
                />
                <button type="submit" className="mitv-icon-btn" title="Guardar nombre">
                  <Check size={15} color="#64d2ff" />
                </button>
                <button
                  type="button"
                  className="mitv-icon-btn"
                  onClick={() => setIsRenamingChannel(false)}
                  title="Cancelar"
                >
                  <X size={15} />
                </button>
              </form>
            ) : (
              <div className="mitv-grid-title-wrap">
                <h2
                  onClick={() => {
                    if (isReadOnlyChannel) return;
                    setRenameChannelDraft(displayedChannel?.name || 'Para ver hoy');
                    setIsRenamingChannel(true);
                  }}
                  style={{ cursor: isReadOnlyChannel ? 'default' : 'pointer' }}
                  title={isReadOnlyChannel ? undefined : 'Clic para renombrar este canal'}
                >
                  {displayedChannel?.name || 'Para ver hoy'}
                </h2>
                {!isReadOnlyChannel && (
                  <>
                    <button
                      type="button"
                      className="mitv-icon-btn"
                      onClick={() => {
                        setRenameChannelDraft(displayedChannel?.name || 'Para ver hoy');
                        setIsRenamingChannel(true);
                      }}
                      title="Renombrar canal"
                    >
                      <Pencil size={13} />
                    </button>
                    {workspace.channels.length > 1 && (
                      <button
                        type="button"
                        className="mitv-icon-btn"
                        onClick={handleDeleteActiveChannel}
                        title="Eliminar canal"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mitv-grid-filters">
              {isViewingOfficialLive ? (
                (
                  ['Todos', 'TV de Aire', 'Cable & Noticias', 'Internacional', 'Streams en Vivo'] as const
                ).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`mitv-filter-btn ${liveCategoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setLiveCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    className={`mitv-filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    Todos ({items.length})
                  </button>
                  <button
                    type="button"
                    className={`mitv-filter-btn ${filterMode === 'pending' ? 'active' : ''}`}
                    onClick={() => setFilterMode('pending')}
                  >
                    Pendientes ({pendingCount})
                  </button>
                </>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="mitv-empty">
              <Film size={28} color="#64d2ff" />
              <strong>Tu televisor personal está listo.</strong>
              <span>
                Pegá arriba cualquier enlace de YouTube, Vimeo, Twitch, PeerTube, Odysee, Archive o MP4 para armar tu
                propia programación sin algoritmos.
              </span>
            </div>
          ) : visibleGridItems.length === 0 ? (
            <div className="mitv-empty">
              <CheckCircle2 size={28} color="#30d158" />
              <strong>¡Ya viste toda tu programación!</strong>
              <span>Tocá «Todos» para repasar lo que viste o pegá un nuevo enlace arriba.</span>
            </div>
          ) : (
            <div className="mitv-list">
              {visibleGridItems.map(({ item, idx }) => {
                const isPlayingRow = idx === safeIndex;
                const isUpNext = items.length > 1 && idx === (safeIndex + 1) % items.length;
                return (
                  <div
                    key={item.id}
                    className={`mitv-row ${isPlayingRow ? 'active' : ''} ${item.watched ? 'watched' : ''}`}
                  >
                    <button
                      type="button"
                      className="mitv-thumb-btn"
                      onClick={() => {
                        setCastIncomingItem(null);
                        setCurrentIndex(idx);
                      }}
                      aria-label={`Ver ${item.title}`}
                    >
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.title} />
                      ) : (
                        <span className="mitv-thumb-fallback">
                          <Film size={16} color="#ffffff" />
                        </span>
                      )}
                      <span className="mitv-thumb-play">
                        <Play size={13} fill="#ffffff" color="#ffffff" />
                      </span>
                    </button>

                    {editingItemId === item.id && !sharedChannel ? (
                      <form
                        className="mitv-inline-rename"
                        style={{ flex: 1 }}
                        onSubmit={(e) => handleRenameItem(e, item.id)}
                      >
                        <input
                          type="text"
                          value={editingItemDraft}
                          onChange={(e) => setEditingItemDraft(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="mitv-icon-btn" title="Guardar título">
                          <Check size={14} color="#64d2ff" />
                        </button>
                        <button
                          type="button"
                          className="mitv-icon-btn"
                          onClick={() => setEditingItemId(null)}
                          title="Cancelar"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <div
                        className="mitv-row-meta"
                        onClick={() => {
                          setCastIncomingItem(null);
                          setCurrentIndex(idx);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setCastIncomingItem(null);
                            setCurrentIndex(idx);
                          }
                        }}
                      >
                        <div className="mitv-row-badges">
                          {isPlayingRow && <span className="mitv-live-pill">EN PANTALLA</span>}
                          {!isPlayingRow && isUpNext && (
                            <span className="mitv-next-pill">A CONTINUACIÓN</span>
                          )}
                        </div>
                        <strong>{item.title}</strong>
                        <span>
                          {item.author} · #{idx + 1}
                        </span>
                      </div>
                    )}

                    {isViewingOfficialLive ? (
                      <div className="mitv-row-actions">
                        <button
                          type="button"
                          className="mitv-pill-btn"
                          onClick={() => handleAddOfficialLiveToMyChannel(item)}
                          title={`Sumar ${item.title} a Mi TV`}
                        >
                          <Plus size={12} /> Mi TV
                        </button>
                      </div>
                    ) : (
                      !sharedChannel && (
                        <div className="mitv-row-actions">
                          <button
                            type="button"
                            className="mitv-icon-btn"
                            onClick={() => handleToggleWatched(item.id)}
                            title={item.watched ? 'Marcar como pendiente' : 'Marcar como visto'}
                          >
                            {item.watched ? (
                              <CheckCircle2 size={15} color="#30d158" />
                            ) : (
                              <Circle size={15} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="mitv-icon-btn"
                            onClick={() => {
                              setEditingItemId(item.id);
                              setEditingItemDraft(item.title);
                            }}
                            title="Renombrar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="mitv-icon-btn"
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(idx, -1)}
                            title="Subir"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="mitv-icon-btn"
                            disabled={idx === items.length - 1}
                            onClick={() => handleMoveItem(idx, 1)}
                            title="Bajar"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="mitv-icon-btn"
                            onClick={() => handleRemoveItem(item.id)}
                            title="Quitar de la programación"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* BARRA CONTROL REMOTO INFERIOR (SOLO CELULAR · ZONA DEL PULGAR) */}
      {currentItem && items.length > 0 && (
        <nav className="mitv-mobile-remote" aria-label="Control remoto de canales">
          <button
            type="button"
            className="mitv-remote-btn"
            disabled={items.length <= 1}
            onClick={() => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)}
            aria-label="Canal anterior"
          >
            <SkipBack size={18} />
          </button>

          <button
            type="button"
            className="mitv-remote-center"
            onClick={() => {
              document.getElementById('mitv-grid')?.scrollIntoView({ behavior: 'smooth' });
            }}
            title="Ir a la grilla de canales"
          >
            <strong>{currentItem.title}</strong>
            <span>
              {displayedChannel?.name} · {safeIndex + 1} / {items.length}
            </span>
          </button>

          <button
            type="button"
            className="mitv-remote-btn"
            disabled={items.length <= 1}
            onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
            aria-label="Canal siguiente"
          >
            <SkipForward size={18} />
          </button>
        </nav>
      )}

      <RemoteConnectModal
        sessionId={myTvCode}
        isOpen={isRemoteQrOpen}
        onClose={() => setIsRemoteQrOpen(false)}
        isPhoneConnected={isRemotePhoneConnected}
      />

      <style>{`
        .mitv-page {
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
        .mitv-ambient-bg {
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
        .mitv-ambient-veil {
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
        .mitv-header {
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
        .mitv-header-left, .mitv-nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mitv-logo-btn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
        }
        .mitv-pill-brand {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.28);
          padding: 3px 10px;
          border-radius: 999px;
        }
        .mitv-nav-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
        }
        .mitv-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .mitv-main {
          position: relative;
          z-index: 1;
          max-width: 860px;
          margin: 0 auto;
          padding: 22px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .mitv-toast {
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
        .mitv-shared-bar {
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
        }
        .mitv-shared-bar span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .mitv-shared-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .mitv-card {
          position: relative;
          color: #f5f5f7;
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
        .mitv-channels-card {
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          z-index: 30;
          overflow: visible;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
        }
        .mitv-channels-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 14px;
          background: transparent;
          border: none;
          color: rgba(245, 245, 247, 0.88);
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          border-radius: 14px;
        }
        .mitv-channels-toggle:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .mitv-channels-toggle-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          overflow: hidden;
        }
        .mitv-channels-toggle-name {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
        }
        .mitv-channels-toggle-count {
          font-size: 11px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.82);
        }
        .mitv-channels-toggle-hint {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.52);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-channels-toggle-right {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          font-weight: 600;
          color: rgba(100, 210, 255, 0.9);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mitv-channels-collapsible {
          padding: 10px 14px 14px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (max-width: 640px) {
          .mitv-channels-toggle-hint {
            display: none;
          }
          .mitv-channels-toggle {
            padding: 7px 12px;
          }
        }
        .mitv-ch-dropdown {
          position: relative;
        }
        .mitv-ch-trigger {
          padding-right: 10px;
        }
        .mitv-ch-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          min-width: 230px;
          max-width: 300px;
          max-height: 280px;
          overflow-y: auto;
          z-index: 80;
          padding: 6px;
          border-radius: 16px;
          background: rgba(20, 22, 28, 0.92);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.48);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .mitv-ch-menu-head {
          padding: 5px 9px 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: rgba(245, 245, 247, 0.62);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 3px;
        }
        .mitv-ch-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: #f5f5f7;
          font-size: 13px;
          font-weight: 550;
          cursor: pointer;
          text-align: left;
        }
        .mitv-ch-option:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .mitv-ch-option.selected {
          background: rgba(10, 132, 255, 0.24);
          color: #ffffff;
        }
        .mitv-ch-option-name {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .mitv-ch-option-name span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-ch-option-right {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .mitv-ch-option-right em {
          font-style: normal;
          font-size: 11px;
          color: rgba(245, 245, 247, 0.65);
        }
        .mitv-ch-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .mitv-ch-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mitv-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.07em;
          color: #64d2ff;
        }
        .mitv-ch-title h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 680;
          letter-spacing: -0.02em;
          color: #ffffff;
        }
        .mitv-ch-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .mitv-tabs {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .mitv-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.26);
          background: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.88);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .mitv-tab.active {
          background: rgba(255, 255, 255, 0.92);
          color: #1d1d1f;
          border-color: #ffffff;
        }
        .mitv-tab-live {
          border-color: rgba(255, 69, 58, 0.48);
          background: rgba(255, 69, 58, 0.16);
        }
        .mitv-tab-live.active {
          background: #ff3b30;
          color: #ffffff;
          border-color: #ff6961;
        }
        .mitv-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #ff453a;
          box-shadow: 0 0 8px rgba(255, 69, 58, 0.95);
        }
        .mitv-tab-live.active .mitv-live-dot {
          background: #ffffff;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.9);
        }
        .mitv-tab em {
          font-style: normal;
          opacity: 0.72;
          font-size: 11px;
        }
        .mitv-tab-new {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px dashed rgba(255, 255, 255, 0.45);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .mitv-new-form, .mitv-add-form {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .mitv-new-form input, .mitv-add-form input {
          flex: 1;
          min-width: 220px;
          padding: 11px 16px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          color: #1d1d1f;
          outline: none;
        }
        .mitv-new-form input:focus, .mitv-add-form input:focus {
          background: #ffffff;
          border-color: #0a84ff;
          box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.28);
        }
        .mitv-btn-primary {
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
        .mitv-btn-primary:hover:not(:disabled) {
          background: #0a84ff;
        }
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
        }
        .mitv-pill-btn:hover {
          background: rgba(255, 255, 255, 0.24);
        }
        .mitv-pill-btn.active-green {
          background: rgba(48, 209, 88, 0.22);
          border-color: rgba(48, 209, 88, 0.62);
          color: #d7ffe1;
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
        .mitv-yt-sub-link {
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.78);
          text-decoration: none;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
        }
        .mitv-yt-sub-link:hover {
          background: rgba(255, 59, 48, 0.26);
          border-color: rgba(255, 105, 97, 0.6);
          color: #ffffff;
        }
        .mitv-top-social-row {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .mitv-top-social-icons {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .mitv-top-fs-btn {
          margin-left: auto;
        }
        .mitv-top-icon-btn {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.88);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
        }
        .mitv-top-icon-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .mitv-top-icon-btn:active {
          transform: scale(0.92);
        }
        .mitv-top-icon-btn.has-count {
          width: auto;
          padding: 0 9px;
          gap: 4px;
        }
        .mitv-like-count {
          font-size: 11.5px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          animation: mitvLikePop 0.24s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes mitvLikePop {
          0% { transform: scale(0.6); opacity: 0.4; }
          60% { transform: scale(1.22); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .mitv-top-icon-btn.is-liked {
          color: #ff375f;
          background: rgba(255, 55, 95, 0.2);
          border-color: rgba(255, 55, 95, 0.48);
        }
        .mitv-top-icon-btn.is-subbed {
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.5);
        }
        .mitv-player-card {
          overflow: visible;
        }
        body.mitv-is-fullscreen .ymtb-bar,
        body.mitv-is-fullscreen .mitv-header {
          display: none !important;
        }
        .mitv-player-card.is-expanded {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 99999 !important;
          border-radius: 0 !important;
          border: none !important;
          background: #000000 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          display: flex;
          flex-direction: column;
        }
        .mitv-player-card.is-expanded .mitv-video-wrap {
          flex: 1;
          width: 100%;
          height: 100%;
          min-height: 0;
          aspect-ratio: auto !important;
          border-radius: 0 !important;
        }
        .mitv-player-card.is-expanded .mitv-now-bar,
        .mitv-player-card.is-expanded .mitv-smartbar-slot {
          display: none !important;
        }
        .mitv-video-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
          border-radius: 22px 22px 0 0;
          overflow: hidden;
        }
        .mitv-smartbar-slot {
          padding: 0 14px 14px;
        }
        /* Adaptación Apple Glass glaseado para SmartBar dentro de MiTV */
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
        .mitv-smartbar-slot .bv-compact-btn.accent:hover {
          background: rgba(10, 132, 255, 0.36);
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
        .mitv-smartbar-slot .bv-mono-time.muted,
        .mitv-smartbar-slot .bv-signal-sub,
        .mitv-smartbar-slot .bv-saved-meta span,
        .mitv-smartbar-slot .bv-saved-drawer-sub,
        .mitv-smartbar-slot .bv-saved-empty,
        .mitv-smartbar-slot .bv-share-head,
        .mitv-smartbar-slot .bv-share-origin {
          color: rgba(245, 245, 247, 0.74);
        }
        .mitv-smartbar-slot .bv-share-menu,
        .mitv-smartbar-slot .bv-saved-drawer {
          background: rgba(22, 24, 30, 0.86);
          backdrop-filter: blur(26px) saturate(180%);
          -webkit-backdrop-filter: blur(26px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
          color: #f5f5f7;
        }
        .mitv-smartbar-slot .bv-more-item,
        .mitv-smartbar-slot .bv-share-item {
          color: #f5f5f7;
        }
        .mitv-smartbar-slot .bv-more-item:hover,
        .mitv-smartbar-slot .bv-share-item:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #64d2ff;
        }
        .mitv-smartbar-slot .bv-share-divider {
          background: rgba(255, 255, 255, 0.14);
        }
        .mitv-smartbar-slot .bv-saved-item {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.16);
        }
        .mitv-smartbar-slot .bv-signal-hairline {
          background: rgba(255, 255, 255, 0.16);
        }
        .mitv-video-wrap iframe, .mitv-video-wrap video, .mitv-yt-host {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        .mitv-social-embed-stage {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 35%, rgba(28, 34, 48, 0.92), #050608 100%);
          overflow: hidden;
        }
        .mitv-video-wrap iframe.mitv-vertical-iframe {
          position: relative;
          inset: auto;
          width: 340px;
          max-width: 100%;
          height: 100%;
          border: 0;
          background: #000000;
        }
        .mitv-video-wrap iframe.mitv-tweet-iframe {
          position: relative;
          inset: auto;
          width: 520px;
          max-width: 96%;
          height: 100%;
          border: 0;
          background: transparent;
        }
        .mitv-fs-exit-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 2147483647;
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(18, 20, 26, 0.72);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        }
        .mitv-fs-exit-btn:hover {
          background: rgba(10, 132, 255, 0.85);
        }
        .mitv-live-offline {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 10px;
          padding: 24px;
          background: radial-gradient(circle at 50% 35%, rgba(28, 36, 52, 0.92), rgba(12, 14, 18, 0.98));
          color: #f5f5f7;
        }
        .mitv-live-offline strong {
          font-size: 16px;
          color: #ffffff;
        }
        .mitv-live-offline span {
          font-size: 13px;
          color: rgba(245, 245, 247, 0.76);
          max-width: 460px;
        }
        .mitv-live-offline-actions {
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .mitv-now-bar {
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .mitv-now-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .mitv-now-top-meta {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mitv-live-pill {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.32);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #d9f3ff;
        }
        .mitv-next-pill {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.85);
        }
        .mitv-slot-pill {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(245, 245, 247, 0.88);
        }
        .mitv-now-meta strong {
          font-size: 15px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-now-meta > span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.76);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-now-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .mitv-ctrl-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .mitv-ctrl-btn:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }
        .mitv-ctrl-btn.active {
          background: rgba(10, 132, 255, 0.32);
          border-color: rgba(100, 210, 255, 0.65);
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
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px 5px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(20, 22, 28, 0.92);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
          color: #ffffff;
        }
        .mitv-cast-popover {
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          z-index: 80;
          width: 248px;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(20, 22, 28, 0.94);
          backdrop-filter: blur(26px) saturate(180%);
          -webkit-backdrop-filter: blur(26px) saturate(180%);
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.5);
          color: #f5f5f7;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mitv-cast-head {
          padding: 4px 8px 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64d2ff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .mitv-cast-code-form {
          display: flex;
          gap: 6px;
          padding: 6px 4px 2px;
        }
        .mitv-cast-code-form input {
          flex: 1;
          min-width: 0;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 12.5px;
          outline: none;
        }
        .mitv-cast-code-form input::placeholder {
          color: rgba(245, 245, 247, 0.55);
        }
        .mitv-cast-connect-btn {
          padding: 7px 11px;
          border-radius: 10px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          white-space: nowrap;
        }
        .mitv-cast-connect-btn:hover {
          background: #0a84ff;
        }
        .mitv-cast-connected {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 6px 4px;
          font-size: 12px;
          color: #d9f3ff;
        }
        .mitv-cast-stop-btn {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 69, 58, 0.55);
          background: rgba(255, 69, 58, 0.22);
          color: #ffd3d0;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .mitv-cast-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.12);
          margin: 4px 2px;
        }
        .mitv-cast-mycode {
          margin: 2px 4px 4px;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(10, 132, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.38);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.85);
        }
        .mitv-cast-mycode strong {
          font-size: 18px;
          letter-spacing: 0.16em;
          color: #ffffff;
        }
        .mitv-vol-btn {
          border: none;
          background: transparent;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
        }
        .mitv-vol-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .mitv-vol-slider {
          width: 58px;
          accent-color: #0a84ff;
          cursor: pointer;
        }
        .mitv-vol-pct {
          font-size: 11px;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.85);
          min-width: 28px;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .mitv-add-card {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .mitv-add-form {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
        }
        .mitv-add-form input {
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
        .mitv-add-form input::placeholder {
          color: rgba(245, 245, 247, 0.56);
        }
        .mitv-add-form input:focus {
          background: rgba(255, 255, 255, 0.08);
          box-shadow: none;
        }
        .mitv-add-submit {
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
        .mitv-add-submit:hover:not(:disabled) {
          background: #0071e3;
          border-color: #0a84ff;
        }
        .mitv-add-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .mitv-add-head h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 660;
          color: #ffffff;
        }
        .mitv-slot-picker {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          color: rgba(245, 245, 247, 0.78);
        }
        .mitv-slot-chip {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.86);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .mitv-slot-chip.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .mitv-error {
          padding: 9px 12px;
          border-radius: 12px;
          background: rgba(255, 69, 58, 0.2);
          border: 1px solid rgba(255, 69, 58, 0.42);
          color: #ffd3d0;
          font-size: 12.5px;
          font-weight: 600;
        }
        .mitv-quick-send {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding-top: 4px;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.78);
        }
        .mitv-quick-send strong {
          color: #ffffff;
        }
        .mitv-bookmarklet-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 12px;
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
        .mitv-bookmarklet-pill:hover {
          background: #0071e3;
        }
        .mitv-grid-card {
          padding: 16px 20px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mitv-grid-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .mitv-grid-title-wrap, .mitv-inline-rename {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }
        .mitv-grid-title-wrap h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 680;
          color: #ffffff;
        }
        .mitv-inline-rename input {
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid #0a84ff;
          background: #ffffff;
          font-size: 14px;
          font-weight: 600;
          color: #1d1d1f;
          outline: none;
          min-width: 180px;
          flex: 1;
        }
        .mitv-grid-filters {
          display: inline-flex;
          gap: 6px;
        }
        .mitv-filter-btn {
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.8);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .mitv-filter-btn.active {
          background: rgba(255, 255, 255, 0.9);
          color: #1d1d1f;
          border-color: #ffffff;
        }
        .mitv-empty {
          padding: 36px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: rgba(245, 245, 247, 0.8);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .mitv-empty strong {
          color: #ffffff;
          font-size: 14.5px;
        }
        .mitv-empty span {
          font-size: 12.5px;
          max-width: 440px;
        }
        .mitv-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mitv-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .mitv-row.active {
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.52);
        }
        .mitv-row.watched {
          opacity: 0.62;
        }
        .mitv-thumb-btn {
          position: relative;
          width: 78px;
          height: 48px;
          border-radius: 9px;
          border: none;
          padding: 0;
          overflow: hidden;
          background: #000;
          cursor: pointer;
          flex-shrink: 0;
        }
        .mitv-thumb-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .mitv-thumb-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1e293b, #0f172a);
        }
        .mitv-thumb-play {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.26);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mitv-row-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          cursor: pointer;
        }
        .mitv-row-badges {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 1px;
        }
        .mitv-row-meta strong {
          font-size: 13.5px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-row-meta > span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.74);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-row-actions {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .mitv-icon-btn {
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
        .mitv-icon-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }
        .mitv-icon-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .mitv-mobile-remote {
          display: none;
        }
        @media (max-width: 768px) {
          .mitv-page {
            padding-bottom: 24px;
          }
          .mitv-main {
            padding: 6px 8px 20px;
            gap: 8px;
          }
          .mitv-card {
            border-radius: 14px;
          }
          .mitv-video-wrap {
            border-radius: 14px 14px 0 0;
          }
          .mitv-player-bar {
            padding: 8px 10px;
            gap: 8px;
            flex-direction: column;
            align-items: stretch;
          }
          .mitv-now-title {
            font-size: 13.5px;
            line-height: 1.28;
          }
          .mitv-now-sub {
            font-size: 11px;
            gap: 5px;
          }
          .mitv-controls {
            width: 100%;
            justify-content: space-between;
            gap: 5px;
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;
            padding-bottom: 1px;
          }
          .mitv-controls::-webkit-scrollbar {
            display: none;
          }
          .mitv-ctrl-btn {
            width: 30px;
            height: 30px;
            flex-shrink: 0;
          }
          .mitv-ctrl-btn.primary {
            width: 34px;
            height: 34px;
          }
          .mitv-ctrl-pill-you4 {
            height: 28px;
            padding: 0 8px;
            font-size: 10.5px;
            flex-shrink: 0;
          }
          .mitv-smartbar-slot {
            padding: 0 8px 8px;
          }
          .mitv-add-card {
            padding: 6px 8px;
            border-radius: 12px;
          }
          .mitv-add-form {
            flex-wrap: nowrap;
            gap: 6px;
          }
          .mitv-add-form input {
            padding: 7px 10px;
            font-size: 12px;
            min-width: 0;
          }
          .mitv-add-submit {
            padding: 7px 11px;
            font-size: 11.5px;
          }
          .mitv-grid-card {
            padding: 10px;
            gap: 8px;
          }
          .mitv-grid-head h2 {
            font-size: 14px;
          }
          .mitv-row {
            padding: 6px 7px;
            gap: 8px;
            border-radius: 12px;
          }
          .mitv-row-thumb {
            width: 84px;
            height: 48px;
            border-radius: 8px;
          }
          .mitv-row-meta strong {
            font-size: 12.5px;
          }
          .mitv-row-meta > span {
            font-size: 10.5px;
          }
          .mitv-icon-btn {
            width: 26px;
            height: 26px;
          }
          .mitv-pill-btn {
            padding: 5px 9px;
            font-size: 11px;
          }
          /* Ocultamos el control flotante duplicado para que no choque con MobileBottomBar */
          .mitv-mobile-remote {
            display: none !important;
          }
        }
        @media (max-width: 680px) {
          .mitv-nav {
            display: none;
          }
        }

        /* --- YOU4 integrado dentro del mismo reproductor de MiTV (4 pantallas) --- */
        .mitv-ctrl-pill-you4 {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 34px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .mitv-ctrl-pill-you4:hover {
          background: rgba(255, 255, 255, 0.24);
          border-color: rgba(255, 255, 255, 0.48);
        }
        .mitv-ctrl-pill-you4.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
          box-shadow: 0 0 14px rgba(10, 132, 255, 0.55);
        }
        .mitv-you4-grid {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          background: #05070a;
          box-sizing: border-box;
        }
        .mitv-you4-tile {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 10px;
          overflow: hidden;
          background: #0d1016;
          border: 2px solid rgba(255, 255, 255, 0.12);
          box-sizing: border-box;
          cursor: pointer;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .mitv-you4-tile.audio-active {
          border-color: #64d2ff;
          box-shadow: inset 0 0 0 1px rgba(100, 210, 255, 0.45), 0 0 16px rgba(10, 132, 255, 0.35);
        }
        .mitv-you4-media {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          object-fit: cover;
          display: block;
        }
        .mitv-you4-top-bar {
          position: absolute;
          top: 6px;
          left: 6px;
          right: 6px;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          pointer-events: none;
        }
        .mitv-you4-ch-badge {
          max-width: 60%;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(14, 16, 22, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mitv-you4-tile-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          pointer-events: auto;
        }
        .mitv-you4-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(14, 16, 22, 0.78);
          color: rgba(245, 245, 247, 0.88);
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }
        .mitv-you4-chip:hover {
          background: rgba(255, 255, 255, 0.22);
          color: #ffffff;
        }
        .mitv-you4-chip.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .mitv-you4-bottom-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 3;
          padding: 16px 8px 6px;
          background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.82) 100%);
          pointer-events: none;
        }
        .mitv-you4-title {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.94);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
