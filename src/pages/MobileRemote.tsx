import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Cast,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  EyeOff,
  Grid,
  List,
  Pause,
  Play,
  Power,
  RotateCcw,
  RotateCw,
  Send,
  Sparkles,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import CastModal from '../components/CastModal';
import { RemoteBridge, resolveAccountTvPin } from '../utils/remoteBridge';
import { VERIFIED_24_7_LIVE_CHANNELS, fetchTopViewedVideosByMood } from '../lib/youtube';
import {
  loadMiTvWorkspace,
  resolveMiTvPointer,
  extractYouTubeId,
  type MiTvItem
} from '../lib/tv/miTvStore';
import { useStore } from '../store/useStore';

const QUICK_EMOJIS = ['🔥', '❤️', '👏', '😂', '🍿', '🚀'];

export default function MobileRemote() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const params = new URLSearchParams(window.location.search || hashQuery);
      const room = params.get('room');
      if (room) return room;
      if (routeSessionId) return routeSessionId;
      return localStorage.getItem('youapp_remote_last_pin') || '1234';
    } catch {
      return routeSessionId || '1234';
    }
  });

  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState(activeSessionId);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  const [lastAction, setLastAction] = useState<string>('Listo');
  const [isTvConnected, setIsTvConnected] = useState(false);
  const [castBanner, setCastBanner] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isQuadActive, setIsQuadActive] = useState(false);
  const [isZenActive, setIsZenActive] = useState(false);
  const [tvQuery, setTvQuery] = useState('');
  const [isCastingUrl, setIsCastingUrl] = useState(false);
  const [castSearchResults, setCastSearchResults] = useState<MiTvItem[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  const savedContent = useStore((s) => s.savedContent);

  const [channels, setChannels] = useState<any[]>(() => {
    const mitv = loadMiTvWorkspace();
    const fromMiTv = (mitv.channels || []).flatMap((ch) =>
      (ch.items || []).map((it) => ({
        id: it.id,
        name: ch.name,
        currentVideoTitle: it.title,
        category: it.slot || 'MiTV',
        thumbnail: it.thumbnailUrl,
        videoUrl: it.sourceUrl,
        mitvItem: it
      }))
    );
    return [...fromMiTv, ...VERIFIED_24_7_LIVE_CHANNELS];
  });
  const [channelIdx, setChannelIdx] = useState(0);
  const [syncedChannel, setSyncedChannel] = useState<any>(() => channels[0] || VERIFIED_24_7_LIVE_CHANNELS[0]);

  const bridgeRef = useRef<RemoteBridge | null>(null);
  const actionTimerRef = useRef<number | null>(null);

  // Auto-vinculación estilo YouTube/Spotify: si estás logueado en ambos dispositivos, usa el mismo PIN personal automáticamente
  useEffect(() => {
    const hasExplicit =
      Boolean(routeSessionId) ||
      Boolean(new URLSearchParams(window.location.search).get('room'));
    if (hasExplicit) return;
    let active = true;
    void resolveAccountTvPin().then((accountPin) => {
      if (!active || !accountPin) return;
      setActiveSessionId(accountPin);
      setPinDraft(accountPin);
    });
    return () => {
      active = false;
    };
  }, [routeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    try {
      localStorage.setItem('youapp_remote_last_pin', activeSessionId);
    } catch {
      // ignore
    }

    const bridge = new RemoteBridge(activeSessionId, 'remote');
    setIsTvConnected(false);
    bridge.notifyConnected();
    bridgeRef.current = bridge;

    bridge.onConnected(() => {
      setIsTvConnected(true);
    });

    bridge.onAction((action, payload) => {
      if (action === 'SYNC_STATE' && payload?.channel) {
        setIsTvConnected(true);
        setSyncedChannel(payload.channel);
        if (payload.activeIndex !== undefined) setChannelIdx(payload.activeIndex);
        if (payload.isQuadOpen !== undefined) setIsQuadActive(Boolean(payload.isQuadOpen));
      }
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        bridge.notifyConnected();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      bridge.destroy();
    };
  }, [activeSessionId]);

  const flashAction = (label: string) => {
    setLastAction(label);
    if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    actionTimerRef.current = window.setTimeout(() => setLastAction('Listo'), 1500);
  };

  const sendAction = async (action: string, payload: any = {}) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(25);
      } catch {
        // ignore
      }
    }

    const labels: Record<string, string> = {
      TOGGLE_PLAY: isPlaying ? 'Pausa' : 'Play',
      NEXT_CHANNEL: 'Siguiente',
      PREV_CHANNEL: 'Anterior',
      SEEK_BACK: '-10 s',
      SEEK_FORWARD: '+10 s',
      VOLUME_UP: 'Vol +',
      VOLUME_DOWN: 'Vol -',
      TOGGLE_MUTE: isMuted ? 'Sonido' : 'Silencio',
      TOGGLE_QUAD: 'YOU4',
      TOGGLE_ZEN: 'Modo Cine',
      TOGGLE_SLEEP: 'Reposo',
      SEARCH_QUERY: 'Buscando…',
      SEND_EMOJI: payload?.emoji || 'Reacción',
      SEND_CHAT: 'Enviado'
    };
    flashAction(labels[action] || action);

    if (bridgeRef.current) {
      bridgeRef.current.sendAction(action, payload);
    }

    const total = Math.max(1, channels.length);
    const loadDirectIntoChromecast = (ch: any) => {
      const url = String(ch?.videoUrl || '');
      if (!/\.(mp4|m3u8|webm)(\?|$)/i.test(url)) return;
      try {
        const castSession = (window as any).cast?.framework?.CastContext?.getInstance?.()?.getCurrentSession?.();
        const chromeCast = (window as any).chrome?.cast;
        if (!castSession || !chromeCast) return;
        const ct = url.includes('.m3u8')
          ? 'application/x-mpegurl'
          : url.includes('.webm')
            ? 'video/webm'
            : 'video/mp4';
        const info = new chromeCast.media.MediaInfo(url, ct);
        info.metadata = new chromeCast.media.GenericMediaMetadata();
        info.metadata.title = ch.name || 'YOUAPP TV';
        info.metadata.subtitle = ch.currentVideoTitle || 'En vivo';
        const req = new chromeCast.media.LoadRequest(info);
        req.autoplay = true;
        castSession.loadMedia(req);
      } catch {
        // ignore
      }
    };

    if (action === 'TOGGLE_PLAY') {
      setIsPlaying((p) => !p);
    } else if (action === 'NEXT_CHANNEL') {
      const next = (channelIdx + 1) % total;
      setChannelIdx(next);
      if (channels[next]) {
        setSyncedChannel(channels[next]);
        loadDirectIntoChromecast(channels[next]);
      }
    } else if (action === 'PREV_CHANNEL') {
      const prev = (channelIdx - 1 + total) % total;
      setChannelIdx(prev);
      if (channels[prev]) {
        setSyncedChannel(channels[prev]);
        loadDirectIntoChromecast(channels[prev]);
      }
    } else if (action === 'SET_CHANNEL_INDEX') {
      const idx = Math.max(0, Math.min(total - 1, Number(payload?.index || 0)));
      setChannelIdx(idx);
      if (channels[idx]) {
        setSyncedChannel(channels[idx]);
        loadDirectIntoChromecast(channels[idx]);
      }
    } else if (action === 'TOGGLE_MUTE') {
      setIsMuted((m) => !m);
    } else if (action === 'TOGGLE_QUAD') {
      setIsQuadActive((q) => !q);
    } else if (action === 'TOGGLE_ZEN') {
      setIsZenActive((z) => !z);
    } else if (action === 'SEARCH_QUERY' && payload?.query) {
      try {
        const res = await fetchTopViewedVideosByMood(payload.query);
        if (Array.isArray(res) && res.length > 0) {
          setChannels(res);
          setChannelIdx(0);
          setSyncedChannel(res[0]);
        }
      } catch {
        // ignore
      }
    }
  };

  const castItemToTv = (item: MiTvItem) => {
    if (bridgeRef.current) {
      bridgeRef.current.sendAction('MITV_PLAY_ITEM', { item });
    }
    setSyncedChannel({
      name: item.author || 'YOUAPP TV',
      currentVideoTitle: item.title,
      thumbnail: item.thumbnailUrl,
      videoUrl: item.sourceUrl
    });
    setIsPlaying(true);
    flashAction(`📺 Transmitiendo`);
    setCastBanner(
      isTvConnected
        ? `📺 Transmitiendo «${item.title.slice(0, 38)}» en TV #${activeSessionId}`
        : `📡 Enviado al PIN #${activeSessionId} (abrí /mitv en tu TV/PC con ese PIN)`
    );
    window.setTimeout(() => setCastBanner(null), 3600);
  };

  const handleCastInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = tvQuery.trim();
    if (!raw || isCastingUrl) return;

    const looksLikeUrl =
      /^https?:\/\//i.test(raw) ||
      /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|odysee\.com|\.mp4|\.m3u8)/i.test(raw);

    setIsCastingUrl(true);
    try {
      if (looksLikeUrl) {
        const resolved = await resolveMiTvPointer(raw, 'Ahora');
        if (resolved.ok) {
          castItemToTv(resolved.item);
          setCastSearchResults([]);
          setTvQuery('');
        } else {
          flashAction(resolved.error.slice(0, 32));
        }
        return;
      }

      // Búsqueda para elegir y transmitir a la TV
      flashAction('Buscando videos…');
      const found = await fetchTopViewedVideosByMood(raw);
      const mapped: MiTvItem[] = (Array.isArray(found) ? found : [])
        .slice(0, 6)
        .map((ch: any, idx: number): MiTvItem | null => {
          const ytId =
            ch?.youtubeVideoId ||
            ch?.videoId ||
            extractYouTubeId(ch?.videoUrl || ch?.sourceUrl || '') ||
            '';
          if (!ytId) return null;
          return {
            id: `remote-cast-${ytId}-${idx}`,
            provider: 'youtube',
            providerId: ytId,
            title: ch?.currentVideoTitle || ch?.title || ch?.name || raw,
            author: ch?.name || ch?.channelTitle || 'YouTube',
            thumbnailUrl: ch?.thumbnail || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
            slot: 'Ahora',
            watched: false,
            addedAt: new Date().toISOString()
          };
        })
        .filter((x): x is MiTvItem => Boolean(x));

      if (mapped.length > 0) {
        setCastSearchResults(mapped);
        flashAction(`${mapped.length} videos listos`);
      } else {
        void sendAction('SEARCH_QUERY', { query: raw });
        setTvQuery('');
      }
    } catch {
      void sendAction('SEARCH_QUERY', { query: raw });
    } finally {
      setIsCastingUrl(false);
    }
  };

  const handleQuickCastCurrent = () => {
    if (!isTvConnected) {
      // Si todavía no hay una TV/PC vinculada a este PIN, abre el modal de Transmitir / Chromecast / QR
      setShowCastModal(true);
      return;
    }
    const ch = syncedChannel || channels[channelIdx];
    if (ch?.mitvItem) {
      castItemToTv(ch.mitvItem as MiTvItem);
      return;
    }
    const ytId =
      ch?.youtubeVideoId ||
      ch?.videoId ||
      extractYouTubeId(ch?.videoUrl || ch?.sourceUrl || '') ||
      '';
    if (ytId) {
      castItemToTv({
        id: `quick-cast-${ytId}`,
        provider: 'youtube',
        providerId: ytId,
        title: ch?.currentVideoTitle || ch?.title || ch?.name || 'Video YOUAPP',
        author: ch?.name || 'YOUAPP TV',
        thumbnailUrl: ch?.thumbnail || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
        slot: 'Ahora',
        watched: false,
        addedAt: new Date().toISOString()
      });
      return;
    }
    setShowCastModal(true);
  };

  const handleCommitPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pinDraft.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length >= 4) {
      setActiveSessionId(cleaned);
      setEditingPin(false);
      flashAction(`PIN #${cleaned}`);
    }
  };

  const handleCopyRemoteLink = async () => {
    const url = `${window.location.origin}/remote/${encodeURIComponent(activeSessionId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      flashAction('Enlace copiado');
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      flashAction(url);
    }
  };

  return (
    <div className="yr-page">
      <div className="yr-bg" aria-hidden="true" />

      <div className="yr-device-shell">
        {/* CABECERA MINIMALISTA */}
        <header className="yr-header">
          <button
            type="button"
            className="yr-icon-btn"
            onClick={() => navigate('/mitv')}
            title="Volver a MiTV"
            aria-label="Volver"
          >
            <ChevronLeft size={19} />
          </button>

          <div className="yr-brand">
            <Tv size={15} color="#64d2ff" />
            <span>YOU REMOTE</span>
          </div>

          <div className="yr-head-right">
            <button
              type="button"
              className="yr-pin-pill"
              onClick={() => {
                setPinDraft(activeSessionId);
                setEditingPin((v) => !v);
              }}
              title="Cambiar PIN de vinculación TV"
            >
              <span
                className="yr-live-dot"
                style={{ background: isTvConnected ? '#34d399' : '#f59e0b' }}
              />
              PIN #{activeSessionId}
            </button>
            <button
              type="button"
              className="yr-icon-btn"
              onClick={() => void handleCopyRemoteLink()}
              title="Copiar enlace para abrir el control en tu celular"
              aria-label="Copiar enlace"
            >
              {copiedLink ? <Check size={15} color="#34d399" /> : <Copy size={15} />}
            </button>
            <button
              type="button"
              className="yr-icon-btn yr-cast-primary-btn"
              onClick={handleQuickCastCurrent}
              title="Transmitir este video a la TV vinculada"
              aria-label="Transmitir video ahora"
            >
              <Cast size={15} />
            </button>
          </div>
        </header>

        {/* EDITOR RÁPIDO DE PIN */}
        {editingPin && (
          <form className="yr-pin-editor" onSubmit={handleCommitPin}>
            <input
              type="tel"
              maxLength={6}
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN de 4 dígitos"
              autoFocus
            />
            <button type="submit" className="yr-btn-primary">
              Vincular
            </button>
          </form>
        )}

        {/* VISOR "AHORA EN TU TV" */}
        {castBanner && (
          <div className="yr-cast-banner" role="status">
            <span>{castBanner}</span>
            <button type="button" onClick={() => setShowCastModal(true)}>
              Chromecast / QR
            </button>
          </div>
        )}
        <section className="yr-display">
          <div className="yr-display-top">
            <span className="yr-display-kicker">EN TU TELEVISOR</span>
            <span className="yr-action-pill">{lastAction}</span>
          </div>
          <h2 className="yr-display-title">
            {syncedChannel?.currentVideoTitle || syncedChannel?.name || `Sesión #${activeSessionId}`}
          </h2>
          <p className="yr-display-sub">
            CH {String(channelIdx + 1).padStart(2, '0')} · {syncedChannel?.name || 'YOUAPP TV'}
            {isQuadActive ? ' · YOU4 activo' : ''}
          </p>
        </section>

        {/* RUEDA TÁCTIL ESTILO APPLE TV SIRI REMOTE */}
        <section className="yr-wheel-wrap" aria-label="Control direccional y reproducción">
          <div className="yr-wheel">
            <button
              type="button"
              className="yr-dir yr-dir-up"
              onClick={() => void sendAction('NEXT_CHANNEL')}
              title="Canal siguiente"
              aria-label="Canal siguiente"
            >
              <ChevronUp size={24} />
              <span>CH +</span>
            </button>

            <button
              type="button"
              className="yr-dir yr-dir-down"
              onClick={() => void sendAction('PREV_CHANNEL')}
              title="Canal anterior"
              aria-label="Canal anterior"
            >
              <span>CH -</span>
              <ChevronDown size={24} />
            </button>

            <button
              type="button"
              className="yr-dir yr-dir-left"
              onClick={() => void sendAction('SEEK_BACK', { seconds: 10 })}
              title="Retroceder 10 segundos"
              aria-label="Retroceder 10 segundos"
            >
              <RotateCcw size={18} />
              <span>10s</span>
            </button>

            <button
              type="button"
              className="yr-dir yr-dir-right"
              onClick={() => void sendAction('SEEK_FORWARD', { seconds: 10 })}
              title="Adelantar 10 segundos"
              aria-label="Adelantar 10 segundos"
            >
              <RotateCw size={18} />
              <span>10s</span>
            </button>

            <button
              type="button"
              className="yr-center-play"
              onClick={() => void sendAction('TOGGLE_PLAY')}
              title={isPlaying ? 'Pausar' : 'Reproducir'}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <Pause size={28} fill="#ffffff" color="#ffffff" />
              ) : (
                <Play size={28} fill="#ffffff" color="#ffffff" style={{ marginLeft: 3 }} />
              )}
            </button>
          </div>
        </section>

        {/* FILA DE VOLUMEN + MODOS */}
        <section className="yr-controls-row">
          <div className="yr-vol-group" role="group" aria-label="Volumen">
            <button
              type="button"
              className="yr-ctrl-pill"
              onClick={() => void sendAction('VOLUME_DOWN')}
              title="Bajar volumen"
              aria-label="Bajar volumen"
            >
              <Volume1 size={17} />
            </button>
            <button
              type="button"
              className={`yr-ctrl-pill ${isMuted ? 'active' : ''}`}
              onClick={() => void sendAction('TOGGLE_MUTE')}
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
              aria-label="Silenciar"
            >
              {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button
              type="button"
              className="yr-ctrl-pill"
              onClick={() => void sendAction('VOLUME_UP')}
              title="Subir volumen"
              aria-label="Subir volumen"
            >
              <Volume2 size={18} />
              <span className="yr-plus">+</span>
            </button>
          </div>

          <div className="yr-mode-group">
            <button
              type="button"
              className={`yr-mode-btn ${isQuadActive ? 'active' : ''}`}
              onClick={() => void sendAction('TOGGLE_QUAD')}
              title="YOU4: 4 pantallas simultáneas"
            >
              <Grid size={15} />
              <span>YOU4</span>
            </button>
            <button
              type="button"
              className={`yr-mode-btn ${isZenActive ? 'active' : ''}`}
              onClick={() => void sendAction('TOGGLE_ZEN')}
              title="Modo Cine / Zen"
            >
              <EyeOff size={15} />
              <span>Cine</span>
            </button>
            <button
              type="button"
              className="yr-mode-btn"
              onClick={() => setShowGuide(true)}
              title="Guía de canales"
            >
              <List size={15} />
              <span>Guía</span>
            </button>
            <button
              type="button"
              className="yr-mode-btn danger"
              onClick={() => void sendAction('TOGGLE_SLEEP')}
              title="Reposo TV"
              aria-label="Reposo TV"
            >
              <Power size={15} />
            </button>
          </div>
        </section>

        {/* TRANSMITIR VIDEO DIRECTO A LA TELE (URL o Búsqueda) */}
        <form className="yr-search-bar" onSubmit={(e) => void handleCastInputSubmit(e)}>
          <Cast size={16} color="#64d2ff" />
          <input
            type="text"
            value={tvQuery}
            onChange={(e) => setTvQuery(e.target.value)}
            placeholder="Pegá una URL o buscá un video para transmitir…"
          />
          <button type="submit" className="yr-btn-primary" disabled={isCastingUrl || !tvQuery.trim()}>
            {isCastingUrl ? '…' : 'Transmitir'}
          </button>
        </form>

        {castSearchResults.length > 0 && (
          <section className="yr-cast-results" aria-label="Videos para transmitir">
            <div className="yr-cast-results-head">
              <span>Tocá un video para transmitir a la TV</span>
              <button
                type="button"
                className="yr-cast-clear"
                onClick={() => setCastSearchResults([])}
                aria-label="Cerrar resultados"
              >
                <X size={13} />
              </button>
            </div>
            <div className="yr-cast-results-list">
              {castSearchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="yr-cast-result-row"
                  onClick={() => {
                    castItemToTv(item);
                    setCastSearchResults([]);
                    setTvQuery('');
                  }}
                >
                  {item.thumbnailUrl && (
                    <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                  )}
                  <div className="yr-guide-info">
                    <strong>{item.title}</strong>
                    <span>{item.author || 'YouTube'}</span>
                  </div>
                  <span className="yr-cast-send-badge">
                    <Cast size={13} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* EXTRAS OPCIONALES (REACCIONES Y MENSAJE A PANTALLA) */}
        <button
          type="button"
          className="yr-extras-toggle"
          onClick={() => setShowExtras((v) => !v)}
        >
          <Sparkles size={13} />
          <span>{showExtras ? 'Ocultar reacciones y chat' : 'Reacciones y mensaje en pantalla'}</span>
          <ChevronRight
            size={14}
            style={{
              transform: showExtras ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.16s ease'
            }}
          />
        </button>

        {showExtras && (
          <div className="yr-extras-box">
            <div className="yr-emojis">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className="yr-emoji-btn"
                  onClick={() => void sendAction('SEND_EMOJI', { emoji: em })}
                >
                  {em}
                </button>
              ))}
            </div>
            <form
              className="yr-chat-bar"
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatMessage.trim()) return;
                void sendAction('SEND_CHAT', { text: chatMessage.trim() });
                setChatMessage('');
              }}
            >
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Mostrar mensaje en la tele…"
              />
              <button type="submit" className="yr-icon-btn" aria-label="Enviar mensaje">
                <Send size={15} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* MODAL GUÍA DE CANALES */}
      {showGuide && (
        <div className="yr-modal-backdrop" onClick={() => setShowGuide(false)}>
          <div className="yr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="yr-modal-head">
              <h3>Guía de canales ({channels.length})</h3>
              <button type="button" className="yr-icon-btn" onClick={() => setShowGuide(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="yr-guide-list">
              {savedContent.map((sc) => {
                const ytId = sc.providerId || sc.id;
                const item: MiTvItem = {
                  id: `saved-${sc.id}`,
                  provider: 'youtube',
                  providerId: ytId,
                  title: sc.title || 'Video guardado',
                  author: sc.channelTitle || 'Mi Lista',
                  thumbnailUrl:
                    sc.thumbnail ||
                    (/^[A-Za-z0-9_-]{11}$/.test(ytId) ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ''),
                  sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
                  slot: 'Ahora',
                  watched: false,
                  addedAt: new Date().toISOString()
                };
                return (
                  <button
                    key={`saved-${sc.id}`}
                    type="button"
                    className="yr-guide-item"
                    onClick={() => {
                      castItemToTv(item);
                      setShowGuide(false);
                    }}
                  >
                    <span className="yr-guide-num">★</span>
                    <div className="yr-guide-info">
                      <strong>{item.title}</strong>
                      <span>Mi Lista · {item.author}</span>
                    </div>
                  </button>
                );
              })}
              {channels.map((ch, idx) => (
                <button
                  key={`${ch.id || idx}-${idx}`}
                  type="button"
                  className={`yr-guide-item ${idx === channelIdx ? 'active' : ''}`}
                  onClick={() => {
                    if (ch.mitvItem) {
                      castItemToTv(ch.mitvItem as MiTvItem);
                    } else {
                      const ytId =
                        ch.youtubeVideoId ||
                        ch.videoId ||
                        extractYouTubeId(ch.videoUrl || ch.sourceUrl || '') ||
                        '';
                      if (ytId) {
                        castItemToTv({
                          id: `ch-${ch.id || idx}`,
                          provider: 'youtube',
                          providerId: ytId,
                          title: ch.currentVideoTitle || ch.name || 'Canal',
                          author: ch.name || 'YOUAPP TV',
                          thumbnailUrl: ch.thumbnail || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
                          sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
                          slot: 'Ahora',
                          watched: false,
                          addedAt: new Date().toISOString()
                        });
                      } else {
                        void sendAction('SET_CHANNEL_INDEX', { index: idx });
                      }
                    }
                    setChannelIdx(idx);
                    setShowGuide(false);
                  }}
                >
                  <span className="yr-guide-num">{String(idx + 1).padStart(2, '0')}</span>
                  <div className="yr-guide-info">
                    <strong>{ch.currentVideoTitle || ch.name}</strong>
                    <span>{ch.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCastModal && (
        <CastModal
          isOpen={showCastModal}
          onClose={() => setShowCastModal(false)}
          currentChannel={syncedChannel}
          pin={activeSessionId}
        />
      )}

      <style>{`
        .yr-page {
          position: relative;
          min-height: 100dvh;
          background: #0b0e16;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px 14px 32px;
          overflow-x: clip;
          isolation: isolate;
        }
        .yr-bg {
          position: fixed;
          inset: -20px;
          z-index: 0;
          background:
            radial-gradient(520px circle at 20% 15%, rgba(56, 189, 248, 0.2), transparent 58%),
            radial-gradient(520px circle at 85% 80%, rgba(99, 102, 241, 0.18), transparent 58%),
            linear-gradient(160deg, #0b0e16 0%, #141926 55%, #0c1018 100%);
          pointer-events: none;
        }
        .yr-device-shell {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 410px;
          border-radius: 34px;
          padding: 18px 18px 20px;
          background: rgba(255, 255, 255, 0.065);
          backdrop-filter: blur(26px) saturate(160%);
          -webkit-backdrop-filter: blur(26px) saturate(160%);
          box-shadow: 0 28px 64px rgba(0, 0, 0, 0.55);
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .yr-device-shell::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.8px;
          background:
            radial-gradient(200px circle at 0% 0%, rgba(255,255,255,0.85), transparent 56%),
            radial-gradient(180px circle at 100% 0%, rgba(125,211,252,0.65), transparent 56%),
            radial-gradient(200px circle at 100% 100%, rgba(255,255,255,0.55), transparent 56%),
            linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .yr-device-shell > * { position: relative; z-index: 1; }

        .yr-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .yr-brand {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #ffffff;
        }
        .yr-head-right {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .yr-icon-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .yr-icon-btn:hover { background: rgba(255, 255, 255, 0.18); }

        .yr-pin-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.4);
          background: rgba(100, 210, 255, 0.14);
          color: #d9f3ff;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
        }
        .yr-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 8px #34d399;
        }
        .yr-pin-editor {
          display: flex;
          gap: 8px;
          padding: 8px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .yr-pin-editor input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.14em;
          padding: 4px 8px;
          outline: none;
        }

        .yr-display {
          padding: 13px 15px;
          border-radius: 18px;
          background: rgba(8, 12, 20, 0.48);
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .yr-display-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .yr-display-kicker {
          font-size: 9.5px;
          font-weight: 750;
          letter-spacing: 0.12em;
          color: #7dd3fc;
        }
        .yr-action-pill {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          color: #e5f3ff;
        }
        .yr-display-title {
          margin: 0;
          font-size: 14.5px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yr-display-sub {
          margin: 0;
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* RUEDA TÁCTIL APPLE TV */
        .yr-wheel-wrap {
          display: flex;
          justify-content: center;
          padding: 4px 0;
        }
        .yr-wheel {
          position: relative;
          width: 224px;
          height: 224px;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.14), rgba(14, 18, 28, 0.72));
          border: 1.5px solid rgba(255, 255, 255, 0.22);
          box-shadow: inset 0 2px 18px rgba(255, 255, 255, 0.08), 0 18px 36px rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .yr-dir {
          position: absolute;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.85);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.04em;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 16px;
          transition: color 0.14s ease, background 0.14s ease, transform 0.12s ease;
        }
        .yr-dir:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }
        .yr-dir:active { transform: scale(0.93); }
        .yr-dir-up { top: 8px; left: 50%; transform: translateX(-50%); }
        .yr-dir-down { bottom: 8px; left: 50%; transform: translateX(-50%); }
        .yr-dir-left { left: 8px; top: 50%; transform: translateY(-50%); }
        .yr-dir-right { right: 8px; top: 50%; transform: translateY(-50%); }
        .yr-dir-up:active { transform: translateX(-50%) scale(0.93); }
        .yr-dir-down:active { transform: translateX(-50%) scale(0.93); }
        .yr-dir-left:active { transform: translateY(-50%) scale(0.93); }
        .yr-dir-right:active { transform: translateY(-50%) scale(0.93); }

        .yr-center-play {
          width: 82px;
          height: 82px;
          border-radius: 50%;
          border: 1.5px solid rgba(125, 211, 252, 0.65);
          background: linear-gradient(145deg, #0a84ff, #005bb5);
          box-shadow: 0 10px 26px rgba(0, 113, 227, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.15s ease;
        }
        .yr-center-play:active {
          transform: scale(0.94);
        }

        .yr-controls-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yr-vol-group {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }
        .yr-ctrl-pill {
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          cursor: pointer;
          font-weight: 700;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .yr-ctrl-pill:hover { background: rgba(255, 255, 255, 0.16); }
        .yr-ctrl-pill.active {
          background: rgba(255, 69, 58, 0.22);
          border-color: rgba(255, 69, 58, 0.55);
          color: #ff9a94;
        }
        .yr-plus { font-size: 13px; font-weight: 800; }

        .yr-mode-group {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 8px;
        }
        .yr-mode-btn {
          height: 40px;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(245, 245, 247, 0.9);
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .yr-mode-btn:hover { background: rgba(255, 255, 255, 0.15); }
        .yr-mode-btn.active {
          background: rgba(0, 113, 227, 0.28);
          border-color: rgba(100, 210, 255, 0.65);
          color: #ffffff;
        }
        .yr-mode-btn.danger:hover {
          background: rgba(255, 69, 58, 0.22);
          border-color: rgba(255, 69, 58, 0.5);
          color: #ff9a94;
        }

        .yr-search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 6px 6px 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .yr-search-bar input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .yr-search-bar input::placeholder { color: rgba(245, 245, 247, 0.5); }
        .yr-btn-primary {
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .yr-extras-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(245, 245, 247, 0.72);
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .yr-extras-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.24);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .yr-emojis {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 6px;
        }
        .yr-emoji-btn {
          height: 38px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          font-size: 18px;
          cursor: pointer;
        }
        .yr-chat-bar {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .yr-chat-bar input {
          flex: 1;
          min-width: 0;
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12.5px;
          outline: none;
        }

        .yr-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .yr-modal {
          width: 100%;
          max-width: 400px;
          max-height: 76dvh;
          border-radius: 24px;
          padding: 16px;
          background: rgba(18, 22, 32, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .yr-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .yr-modal-head h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 750;
          color: #ffffff;
        }
        .yr-guide-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow-y: auto;
        }
        .yr-guide-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 11px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
        }
        .yr-guide-item.active {
          background: rgba(0, 113, 227, 0.24);
          border-color: rgba(100, 210, 255, 0.6);
        }
        .yr-guide-num {
          font-size: 11px;
          font-weight: 800;
          color: #64d2ff;
          font-variant-numeric: tabular-nums;
        }
        .yr-guide-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .yr-guide-info strong {
          font-size: 12.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yr-guide-info span {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.65);
        }
        .yr-cast-results {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px;
          border-radius: 18px;
          background: rgba(16, 20, 32, 0.88);
          border: 1px solid rgba(100, 210, 255, 0.34);
        }
        .yr-cast-results-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 700;
          color: #64d2ff;
        }
        .yr-cast-clear {
          border: 0;
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .yr-cast-results-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 240px;
          overflow-y: auto;
        }
        .yr-cast-result-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 6px 8px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
        }
        .yr-cast-result-row:hover {
          background: rgba(0, 113, 227, 0.25);
          border-color: rgba(100, 210, 255, 0.55);
        }
        .yr-cast-result-row img {
          width: 58px;
          height: 38px;
          border-radius: 7px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .yr-cast-send-badge {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #0071e3;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-left: auto;
        }
        .yr-cast-primary-btn {
          background: rgba(0, 113, 227, 0.34) !important;
          border-color: rgba(100, 210, 255, 0.65) !important;
          color: #d8f3ff !important;
        }
        .yr-cast-primary-btn:hover {
          background: #0071e3 !important;
          color: #ffffff !important;
        }
        .yr-cast-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 14px;
          background: rgba(0, 113, 227, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
        }
        .yr-cast-banner button {
          flex-shrink: 0;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
