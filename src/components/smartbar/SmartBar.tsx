import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useStore } from '../../store/useStore';
import { useSignalStore } from '../../lib/tv/signalStore';
import { useUIStore } from '../../store/useUIStore';
import { getSmartBarCapabilities } from '../../lib/smartbar/capabilities';
import {
  buildWhatsAppShareHref,
  buildYouAppVideoShareUrl,
  getYouAppShareOrigin
} from '../../lib/tv/youappShareHelper';
import type { VideoMoment } from '../../lib/moments/momentTypes';
import './SmartBar.css';
import {
  Sparkles,
  LayoutGrid,
  Heart,
  Radio,
  Plus,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Clock,
  Layers,
  ChevronDown,
  Trash2,
  Share2,
  Forward,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  UserPlus,
  UserCheck
} from 'lucide-react';

export type ShareTarget =
  | { type: 'video'; contentId: string }
  | { type: 'moment'; contentId: string; startSec: number }
  | { type: 'you4'; contentId: string }
  | { type: 'signal'; signalId: string };

export interface SmartBarProps {
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onSeek?: (seconds: number) => void;
  isMosaic?: boolean;
  onToggleMosaic?: () => void;
  moments?: VideoMoment[];
  onSelectMoment?: (moment: VideoMoment, index: number) => void;
  onNextBlock?: () => void;
  onPreviousBlock?: () => void;
  currentIndex?: number;
  totalItems?: number;
  // Modo Barra Inteligente Unificada estilo Apple (3 puntos de color + ❤️ + Suscripción)
  unifiedAppleMode?: boolean;
  isYou4?: boolean;
  onToggleYou4?: () => void;
  isCasting?: boolean;
  onToggleCast?: () => void;
  isLikedExternal?: boolean;
  onToggleLikeExternal?: () => void;
  isSubscribedExternal?: boolean;
  onToggleSubscribeExternal?: () => void;
  subscribeTitle?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isMutedExternal?: boolean;
  onToggleMuteExternal?: () => void;
}

const SAVED_MOMENTS_KEY = 'youapp_saved_moments_v1';

export interface SavedMomentItem {
  id: string;
  contentId: string;
  providerId?: string;
  title: string;
  channelTitle: string;
  startSec: number;
  shareUrl?: string;
  savedAt: string;
}

function readSavedMoments(): SavedMomentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_MOMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedMoments(list: SavedMomentItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_MOMENTS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // ignore storage quota errors
  }
}

export const SmartBar: React.FC<SmartBarProps> = ({
  isPlaying: isPlayingProp,
  onPlayPause: onPlayPauseProp,
  onSeek,
  isMosaic = false,
  onToggleMosaic,
  moments: momentsProp,
  onSelectMoment,
  onNextBlock,
  onPreviousBlock,
  currentIndex: currentIndexProp,
  totalItems: totalItemsProp,
  unifiedAppleMode = false,
  isYou4 = false,
  onToggleYou4,
  isCasting = false,
  onToggleCast,
  isLikedExternal,
  onToggleLikeExternal,
  isSubscribedExternal,
  onToggleSubscribeExternal,
  subscribeTitle,
  isFullscreen = false,
  onToggleFullscreen,
  isMutedExternal,
  onToggleMuteExternal
}) => {
  const navigate = useNavigate();
  const playbackState = usePlayerStore((s) => s.playbackState);
  const storeIsPlaying = playbackState === 'playing';
  const isPlaying = isPlayingProp !== undefined ? isPlayingProp : storeIsPlaying;
  const currentBlock = usePlayerStore((s) => s.currentBlock);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playerApi = usePlayerStore((s) => s.playerApi);
  const isAnalyzingYOU4 = usePlayerStore((s) => s.isAnalyzingYOU4);

  const { saveContent, unsaveContent, isSaved, followCreator, unfollowCreator, isFollowing } = useStore();
  const { activeSignal, insert, currentBlockIndex, next, previous } = useSignalStore();
  const { showToast, openModal } = useUIStore();

  const [showMomentsRow, setShowMomentsRow] = useState(false);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [savedMoments, setSavedMoments] = useState<SavedMomentItem[]>(() => readSavedMoments());
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [hoverScrubSec, setHoverScrubSec] = useState<number | null>(null);
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);

  const effectiveDuration = duration > 0 ? duration : currentBlock?.durationSec || 0;

  // Capítulos / momentos visibles en la Barra Viva (usa los reales o genera 4 puntos clave limpios)
  const visibleMoments = useMemo<VideoMoment[]>(() => {
    if (momentsProp && momentsProp.length > 0) return momentsProp.slice(0, 4);
    if (!currentBlock || effectiveDuration <= 15) return [];
    const labels = ['Inicio clave', 'Desarrollo', 'Punto central', 'Cierre'];
    const ratios = [0.1, 0.35, 0.62, 0.85];
    return ratios.map((ratio, idx) => ({
      id: `bv-m-${idx}-${currentBlock.blockId || currentBlock.providerContentId}`,
      contentKey: currentBlock.providerContentId,
      startSec: Math.floor(effectiveDuration * ratio),
      title: labels[idx],
      summary: labels[idx],
      type: 'key_point',
      confidence: 0.8,
      source: 'fallback'
    }));
  }, [momentsProp, currentBlock, effectiveDuration]);

  if (!currentBlock) return null;

  const schedule = activeSignal?.schedule || [];
  const signalBlock = schedule[currentBlockIndex];
  const totalBlocks = schedule.length;

  const content = signalBlock?.contentItem || {
    id: currentBlock.providerContentId,
    provider: currentBlock.provider as any,
    providerId: currentBlock.providerContentId,
    title: currentBlock.title,
    channelTitle: 'Creador',
    channelId: currentBlock.providerContentId,
    isLive: false,
    thumbnailUrl: ''
  };

  const capabilities = getSmartBarCapabilities(content);
  const saved = isSaved(content.id);
  const following = isFollowing(content.channelId);

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time) || time < 0) return '00:00';
    const totalSecs = Math.floor(time);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onPlayPauseProp) {
      onPlayPauseProp();
    } else if (playerApi) {
      const currentState = usePlayerStore.getState().playbackState;
      const active = currentState === 'playing' || currentState === 'buffering';
      if (active) await playerApi.pause();
      else await playerApi.play();
    }
  };

  const handleToggleMute = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!playerApi) return;
    if (isMuted) await playerApi.unmute();
    else await playerApi.mute();
  };

  const handleSeekTo = async (seconds: number) => {
    if (onSeek) {
      onSeek(seconds);
      return;
    }
    if (playerApi) {
      await playerApi.seek(seconds);
    }
  };

  const handleMomentJump = (moment: VideoMoment, idx: number) => {
    if (onSelectMoment) {
      onSelectMoment(moment, idx);
    } else {
      void handleSeekTo(moment.startSec);
    }
  };

  const handleDeleteSavedMoment = (momentId: string) => {
    const nextList = savedMoments.filter((m) => m.id !== momentId);
    setSavedMoments(nextList);
    writeSavedMoments(nextList);
    showToast('Momento eliminado', 'info');
  };

  const handleCopySavedMoment = async (item: SavedMomentItem) => {
    const url =
      item.shareUrl ||
      `https://www.youtube.com/watch?v=${item.providerId || item.contentId}&t=${Math.floor(item.startSec)}s`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Enlace del momento (${formatTime(item.startSec)}) copiado`, 'success');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShareSavedMomentWhatsApp = (item: SavedMomentItem) => {
    const url = buildYouAppVideoShareUrl({
      videoId: item.providerId || item.contentId,
      startSec: item.startSec,
      title: item.title,
      channelName: item.channelTitle
    });
    window.open(
      buildWhatsAppShareHref(`Mirá este momento (${formatTime(item.startSec)}) de «${item.title}» en YOUAPP`, url),
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handlePlaySavedMoment = (item: SavedMomentItem) => {
    if (
      item.contentId === content.id ||
      (item.providerId && item.providerId === content.providerId)
    ) {
      void handleSeekTo(item.startSec);
      return;
    }
    const url =
      item.shareUrl ||
      `https://www.youtube.com/watch?v=${item.providerId || item.contentId}&t=${Math.floor(item.startSec)}s`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleMosaicClick = () => {
    if (isAnalyzingYOU4) return;
    if (onToggleMosaic) {
      onToggleMosaic();
    } else {
      showToast('Mosaico de 4 momentos no disponible en este reproductor.', 'info');
    }
  };

  const handleSave = () => {
    if (saved) {
      unsaveContent(content.id);
      showToast('Eliminado de Mi Lista', 'info');
    } else {
      saveContent({
        id: content.id,
        type: 'video',
        title: content.title,
        provider: content.provider,
        savedAt: new Date().toISOString()
      });
      showToast('Guardado en Mi Lista', 'success');
    }
  };

  const handleFollow = () => {
    if (following) {
      unfollowCreator(content.channelId);
      showToast('Dejaste de seguir a este creador', 'info');
    } else {
      followCreator({
        creatorId: content.channelId,
        creatorName: content.channelTitle || 'Creador',
        provider: content.provider
      });
      showToast('Ahora seguís a este creador', 'success');
    }
  };

  const handleAddToSignal = () => {
    if (activeSignal) {
      const newBlock = { ...currentBlock, id: `manual-${Date.now()}` } as any;
      insert(newBlock, currentBlockIndex + 1);
      showToast('Sumado a Mi Señal', 'success');
    } else {
      showToast('No hay una señal activa para añadir.', 'error');
    }
  };

  const buildSignalShareUrl = () => {
    const ytId = content.providerId || content.id;
    return buildYouAppVideoShareUrl({
      videoId: ytId,
      startSec: currentTime,
      title: content.title,
      channelName: content.channelTitle || activeSignal?.name
    });
  };

  const handleShareOption = async (option: ShareTarget) => {
    setShowShareMenu(false);

    const ytId = content.providerId || content.id;
    let urlToShare = buildYouAppVideoShareUrl({
      videoId: ytId,
      startSec: 0,
      title: content.title,
      channelName: content.channelTitle
    });
    let shareTitle = content.title;
    let shareText = 'Mirá este video en YOUAPP TV';
    let toastLabel = 'Enlace al inicio de YOUAPP copiado';

    if (option.type === 'moment') {
      urlToShare = buildYouAppVideoShareUrl({
        videoId: ytId,
        startSec: currentTime,
        title: content.title,
        channelName: content.channelTitle
      });
      toastLabel = 'Enlace del momento exacto en YOUAPP copiado';
    } else if (option.type === 'signal') {
      urlToShare = buildSignalShareUrl();
      shareTitle = content.title || activeSignal?.name || 'YOUAPP TV';
      shareText = `Mirá «${shareTitle}» en YOUAPP TV`;
      toastLabel = 'Enlace del video en YOUAPP copiado';
    } else if (option.type === 'you4') {
      urlToShare = `${getYouAppShareOrigin()}/you4`;
      shareTitle = 'YOU4 · 4 Canales en vivo';
      shareText = 'Mirá 4 señales en simultáneo en YOUAPP TV';
      toastLabel = 'Enlace de YOU4 copiado al portapapeles';
    }

    const shareData = { title: shareTitle, text: shareText, url: urlToShare };
    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(urlToShare);
        showToast(toastLabel, 'success');
      }
    } catch (e) {
      console.error('Share failed', e);
    }
  };

  const handleShareSignalWhatsApp = () => {
    setShowShareMenu(false);
    const sigTitle = content.title || activeSignal?.name || 'YOUAPP TV';
    const shareUrl = buildSignalShareUrl();
    window.open(
      buildWhatsAppShareHref(`Mirá «${sigTitle}» en YOUAPP TV`, shareUrl),
      '_blank',
      'noopener,noreferrer'
    );
  };

  const activeMomentIndex = visibleMoments.reduce((bestIdx, m, idx) => {
    if (currentTime >= m.startSec - 2) return idx;
    return bestIdx;
  }, 0);

  const providerLabel =
    content.provider === 'youtube'
      ? 'YouTube'
      : content.provider === 'vimeo'
      ? 'Vimeo'
      : capabilities.ownsPlayerControls
      ? 'Reproductor YOUAPP'
      : content.provider;

  return (
    <div className="bv-root" aria-label="YOUAPP Barra Viva de descubrimiento y señal">
      {/* 1. FILA SUPERIOR: BARRA DE PROGRESO TÁCTIL (Gris + Azul) */}
      {effectiveDuration > 0 && (() => {
        const displaySec = scrubSec !== null ? scrubSec : currentTime;
        const fillPct = Math.min(100, Math.max(0, (displaySec / effectiveDuration) * 100));
        const previewSec = scrubSec !== null ? scrubSec : hoverScrubSec;
        const previewPct =
          previewSec !== null
            ? Math.min(100, Math.max(0, (previewSec / effectiveDuration) * 100))
            : null;

        const secFromClientX = (clientX: number) => {
          const el = scrubTrackRef.current;
          if (!el) return 0;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0) return 0;
          const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
          return Math.round(ratio * effectiveDuration);
        };

        return (
          <div className="bv-scrub-wrap" aria-label="Barra de progreso táctil del video">
            {!unifiedAppleMode && (capabilities.ownsPlayerControls || Boolean(onPlayPauseProp)) && (
              <>
                <button
                  type="button"
                  className="bv-native-ctrl-btn"
                  onClick={handlePlayPause}
                  title={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  type="button"
                  className="bv-native-ctrl-btn"
                  onClick={handleToggleMute}
                  title={isMuted ? 'Activar sonido' : 'Silenciar'}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </>
            )}

            <span className="bv-tl-time">{formatTime(displaySec)}</span>

            <div
              ref={scrubTrackRef}
              role="slider"
              tabIndex={0}
              aria-label="Progreso del video"
              aria-valuemin={0}
              aria-valuemax={Math.floor(effectiveDuration)}
              aria-valuenow={Math.floor(displaySec)}
              className={`bv-scrub-hitarea ${scrubSec !== null ? 'dragging' : ''}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const nextSec = secFromClientX(e.clientX);
                setScrubSec(nextSec);
              }}
              onPointerMove={(e) => {
                const nextSec = secFromClientX(e.clientX);
                if (scrubSec !== null) {
                  setScrubSec(nextSec);
                } else {
                  setHoverScrubSec(nextSec);
                }
              }}
              onPointerUp={(e) => {
                if (scrubSec !== null) {
                  const finalSec = secFromClientX(e.clientX);
                  setScrubSec(null);
                  void handleSeekTo(finalSec);
                }
              }}
              onPointerCancel={() => setScrubSec(null)}
              onPointerLeave={() => {
                if (scrubSec === null) setHoverScrubSec(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  void handleSeekTo(Math.min(effectiveDuration, currentTime + 10));
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  void handleSeekTo(Math.max(0, currentTime - 10));
                }
              }}
            >
              {previewSec !== null && previewPct !== null && (
                <span
                  className="bv-scrub-tooltip"
                  style={{ left: `${previewPct.toFixed(1)}%` }}
                >
                  {formatTime(previewSec)}
                </span>
              )}

              <div className="bv-scrub-rail">
                <div className="bv-scrub-fill" style={{ width: `${fillPct.toFixed(2)}%` }} />
                {visibleMoments.map((m) => {
                  const pct = Math.min(98, Math.max(2, (m.startSec / effectiveDuration) * 100));
                  return (
                    <span
                      key={`tick-${m.id}`}
                      className="bv-scrub-tick"
                      style={{ left: `${pct.toFixed(2)}%` }}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>

              <span
                className="bv-scrub-thumb"
                style={{ left: `${fillPct.toFixed(2)}%` }}
                aria-hidden="true"
              />
            </div>

            <span className="bv-tl-time">{formatTime(effectiveDuration)}</span>
          </div>
        );
      })()}

      {/* 2. FILA COMPACTA ÚNICA: MODO APPLE UNIFICADO (3 PUNTOS + ❤️ + SUSCRIPCIÓN) O ESTÁNDAR */}
      {unifiedAppleMode ? (
        <div className="bv-apple-row" role="toolbar" aria-label="Barra Inteligente YOUAPP">
          {/* Izquierda: 3 puntos estilo Apple (Naranja=Momentos · Azul=YOU4 · Verde=Transmitir) */}
          <div className="bv-apple-dots" aria-label="Funciones rápidas">
            <button
              type="button"
              className={`bv-dot bv-dot--moments ${isMosaic || showMomentsRow ? 'active' : ''}`}
              onClick={() => {
                if (onToggleMosaic) {
                  setShowMomentsRow(false);
                  handleMosaicClick();
                } else {
                  setShowMomentsRow((v) => !v);
                }
              }}
              title={isMosaic ? 'Momentos activo (tocar para volver a 1 pantalla)' : 'Momentos'}
              aria-label="Momentos"
              aria-pressed={isMosaic || showMomentsRow}
            />
            <button
              type="button"
              className={`bv-dot bv-dot--you4 ${isYou4 ? 'active' : ''}`}
              onClick={() => onToggleYou4?.()}
              title={isYou4 ? 'YOU4 activo (volver a 1 pantalla)' : 'YOU4 (4 pantallas)'}
              aria-label="YOU4"
              aria-pressed={isYou4}
            />
            <button
              type="button"
              className={`bv-dot bv-dot--cast ${isCasting ? 'active' : ''}`}
              onClick={() => onToggleCast?.()}
              title={isCasting ? 'Transmitiendo (tocar para opciones)' : 'Transmitir a TV / Chromecast'}
              aria-label="Transmitir"
              aria-pressed={isCasting}
            />
          </div>

          {/* Centro: controles esenciales finos */}
          <div className="bv-apple-center">
            <button
              type="button"
              className="bv-apple-ctrl"
              title="Anterior"
              aria-label="Anterior"
              onClick={() => (onPreviousBlock ? onPreviousBlock() : previous())}
            >
              <SkipBack size={14} />
            </button>
            <button
              type="button"
              className="bv-apple-ctrl bv-apple-ctrl--play"
              title={isPlaying ? 'Pausar' : 'Reproducir'}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              onClick={handlePlayPause}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              className="bv-apple-ctrl"
              title="Siguiente"
              aria-label="Siguiente"
              onClick={() => (onNextBlock ? onNextBlock() : next())}
            >
              <SkipForward size={14} />
            </button>
            {onToggleMuteExternal && (
              <button
                type="button"
                className="bv-apple-ctrl"
                title={isMutedExternal ? 'Activar sonido' : 'Silenciar'}
                aria-label={isMutedExternal ? 'Activar sonido' : 'Silenciar'}
                onClick={onToggleMuteExternal}
              >
                {isMutedExternal ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            )}
            {onToggleFullscreen && (
              <button
                type="button"
                className="bv-apple-ctrl"
                title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                onClick={onToggleFullscreen}
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            )}
          </div>

          {/* Derecha: íconos opcionales + menú discreto ⋯ */}
          <div className="bv-apple-right">
            {onToggleLikeExternal && (
              <button
                type="button"
                className={`bv-apple-ext-icon ${(isLikedExternal ?? saved) ? 'is-liked' : ''}`}
                onClick={onToggleLikeExternal}
                title={(isLikedExternal ?? saved) ? 'Quitar Me gusta' : 'Me gusta'}
                aria-label="Me gusta"
                aria-pressed={Boolean(isLikedExternal ?? saved)}
              >
                <Heart
                  size={16}
                  fill={(isLikedExternal ?? saved) ? '#ff375f' : 'none'}
                  strokeWidth={2.1}
                />
              </button>
            )}
            {onToggleSubscribeExternal && (
              <button
                type="button"
                className={`bv-apple-ext-icon ${(isSubscribedExternal ?? following) ? 'is-subbed' : ''}`}
                onClick={onToggleSubscribeExternal}
                title={
                  subscribeTitle ||
                  ((isSubscribedExternal ?? following) ? 'Suscripto' : 'Suscribirse')
                }
                aria-label={(isSubscribedExternal ?? following) ? 'Suscripto' : 'Suscribirse'}
                aria-pressed={Boolean(isSubscribedExternal ?? following)}
              >
                {(isSubscribedExternal ?? following) ? (
                  <UserCheck size={16} strokeWidth={2.2} />
                ) : (
                  <UserPlus size={16} strokeWidth={2.1} />
                )}
              </button>
            )}
            <button
              type="button"
              className={`bv-apple-ext-icon bv-apple-more ${showMoreMenu ? 'active' : ''}`}
              onClick={() => {
                setShowShareMenu(false);
                setShowMoreMenu((v) => !v);
              }}
              title="Más opciones (Compartir, Resumen IA, Momentos)"
              aria-label="Más opciones"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
        </div>
      ) : (
      <div className="bv-compact-row" role="toolbar" aria-label="Acciones rápidas de Barra Viva">
        <div className="bv-compact-scroll">
          {(() => {
            const hasExternalStepper = Boolean(onNextBlock || onPreviousBlock);
            const effTotal = totalItemsProp ?? totalBlocks;
            const effIndex = currentIndexProp ?? currentBlockIndex;
            if (!hasExternalStepper && effTotal <= 1) return null;
            return (
              <div className="bv-signal-steppers" aria-label="Navegar videos">
                <button
                  type="button"
                  className="bv-step-btn"
                  title="Video anterior"
                  disabled={!hasExternalStepper && effIndex <= 0}
                  onClick={() => (onPreviousBlock ? onPreviousBlock() : previous())}
                >
                  <SkipBack size={13} />
                </button>
                {effTotal > 1 && (
                  <span className="bv-step-counter">
                    {Math.max(1, effIndex + 1)}/{effTotal}
                  </span>
                )}
                <button
                  type="button"
                  className="bv-step-btn"
                  title="Siguiente video"
                  disabled={!hasExternalStepper && effIndex >= effTotal - 1}
                  onClick={() => (onNextBlock ? onNextBlock() : next())}
                >
                  <SkipForward size={13} />
                </button>
              </div>
            );
          })()}

          {!capabilities.ownsPlayerControls && isMuted && (
            <button
              type="button"
              className="bv-pill-btn alert"
              onClick={handleToggleMute}
              title="Activar sonido del video"
            >
              <VolumeX size={13} />
              <span>Voz</span>
            </button>
          )}

          <button
            type="button"
            className={`bv-compact-btn ${isMosaic || showMomentsRow || showSavedDrawer ? 'active' : ''}`}
            onClick={() => {
              if (onToggleMosaic) {
                setShowMomentsRow(false);
                setShowSavedDrawer(false);
                handleMosaicClick();
              } else {
                const nextOpen = !(showMomentsRow || showSavedDrawer);
                setShowMomentsRow(nextOpen);
                setShowSavedDrawer(false);
              }
            }}
            title={
              onToggleMosaic
                ? isMosaic
                  ? 'Volver a 1 pantalla'
                  : 'Ver 4 momentos clave de este video en pantalla dividida'
                : 'Ver capítulos y momentos guardados'
            }
          >
            <Clock size={13} />
            <span>
              {isMosaic
                ? '1 Pantalla'
                : `Momentos${savedMoments.length > 0 ? ` (${savedMoments.length})` : ''}`}
            </span>
          </button>

          {capabilities.share && (
            <button
              type="button"
              className={`bv-compact-btn ${showShareMenu ? 'active' : ''}`}
              onClick={() => {
                setShowMoreMenu(false);
                setShowShareMenu((v) => !v);
              }}
              title="Compartir señal, video o momento"
              aria-label="Compartir"
            >
              <Forward size={15} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`bv-more-btn ${showMoreMenu ? 'active' : ''}`}
          onClick={() => {
            setShowShareMenu(false);
            setShowMoreMenu((v) => !v);
          }}
          title="Más opciones (Mosaico, Resumen, Repetidoras, Seguir)"
          aria-label="Más opciones"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      )}

      {/* 3. PANEL DESPLEGABLE DE CAPÍTULOS Y MOMENTOS (Cerrado por defecto) */}
      {showMomentsRow && (
        <div className="bv-moments-row" role="list" aria-label="Capítulos y momentos de este video">
          {visibleMoments.length > 0 && (
            <div className="bv-moments-track">
              {visibleMoments.map((m, idx) => {
                const isCurrentMoment = idx === activeMomentIndex && currentTime > 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="listitem"
                    className={`bv-moment-chip ${isCurrentMoment ? 'current' : ''}`}
                    onClick={() => handleMomentJump(m, idx)}
                    title={`Ir a ${formatTime(m.startSec)} — ${m.title}`}
                  >
                    <span className="bv-moment-ts">{formatTime(m.startSec)}</span>
                    <span className="bv-moment-title">{m.title}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="bv-moment-actions">
            <button
              type="button"
              className={`bv-saved-toggle-btn ${showSavedDrawer ? 'open' : ''}`}
              onClick={() => setShowSavedDrawer((v) => !v)}
              aria-expanded={showSavedDrawer}
              title="Desplegar momentos guardados"
            >
              <span>Guardados ({savedMoments.length})</span>
              <ChevronDown size={14} className={`bv-chevron ${showSavedDrawer ? 'rotated' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Menú compacto "Más opciones" (•••) */}
      {showMoreMenu && (
        <div className="bv-share-menu bv-more-menu" role="menu" aria-label="Más herramientas">
          <div className="bv-share-head">Más herramientas</div>

          {onToggleMosaic && (
            <button
              type="button"
              className="bv-more-item"
              onClick={() => {
                setShowMoreMenu(false);
                handleMosaicClick();
              }}
            >
              {isAnalyzingYOU4 ? <Sparkles size={14} className="pulse-anim" /> : <LayoutGrid size={14} />}
              <span>{isAnalyzingYOU4 ? 'Analizando momentos…' : isMosaic ? 'Volver a 1 Video' : 'Mosaico (4 momentos)'}</span>
            </button>
          )}

          {capabilities.summary && (
            <button
              type="button"
              className="bv-more-item"
              onClick={() => {
                setShowMoreMenu(false);
                openModal('summary', currentBlock);
              }}
            >
              <Sparkles size={14} />
              <span>Resumen editorial IA</span>
            </button>
          )}

          <button
            type="button"
            className="bv-more-item"
            onClick={() => {
              setShowMoreMenu(false);
              navigate('/repetidoras');
            }}
          >
            <Layers size={14} />
            <span>Explorar Repetidoras</span>
          </button>

          <div className="bv-share-divider" />

          {capabilities.save && (
            <button
              type="button"
              className="bv-more-item"
              onClick={() => {
                setShowMoreMenu(false);
                handleSave();
              }}
            >
              <Heart size={14} fill={saved ? 'currentColor' : 'none'} />
              <span>{saved ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista'}</span>
            </button>
          )}

          {capabilities.addToSignal && (
            <button
              type="button"
              className="bv-more-item"
              onClick={() => {
                setShowMoreMenu(false);
                handleAddToSignal();
              }}
            >
              <Radio size={14} />
              <span>Sumar a Mi Señal</span>
            </button>
          )}

          {capabilities.followCreator && content.channelId && (
            <button
              type="button"
              className="bv-more-item"
              onClick={() => {
                setShowMoreMenu(false);
                handleFollow();
              }}
            >
              {following ? <Check size={14} /> : <Plus size={14} />}
              <span>{following ? 'Siguiendo al creador' : 'Seguir a este creador'}</span>
            </button>
          )}
        </div>
      )}

      {/* 5. REPLEGABLE: MOMENTOS GUARDADOS (ir al instante, copiar enlace, WhatsApp o borrar) */}
      {showSavedDrawer && (
        <div className="bv-saved-drawer" aria-label="Lista de momentos guardados">
          <div className="bv-saved-drawer-head">
            <span>Momentos guardados ({savedMoments.length})</span>
            <span className="bv-saved-drawer-sub">Listos para volver a ver o compartir</span>
          </div>

          {savedMoments.length === 0 ? (
            <div className="bv-saved-empty">
              Todavía no guardaste ningún momento. Tocá <strong>Guardar momento</strong> mientras mirás un video para guardarlo acá y compartirlo.
            </div>
          ) : (
            <div className="bv-saved-list">
              {savedMoments.map((item) => (
                <div key={item.id} className="bv-saved-item">
                  <button
                    type="button"
                    className="bv-saved-play-btn"
                    onClick={() => handlePlaySavedMoment(item)}
                    title={`Ir a ${formatTime(item.startSec)}`}
                  >
                    <Play size={11} fill="currentColor" />
                    <span>{formatTime(item.startSec)}</span>
                  </button>

                  <div className="bv-saved-meta">
                    <strong>{item.title}</strong>
                    <span>{item.channelTitle}</span>
                  </div>

                  <div className="bv-saved-item-actions">
                    <button
                      type="button"
                      className="bv-saved-mini-btn"
                      onClick={() => void handleCopySavedMoment(item)}
                      title="Copiar enlace exacto de este momento"
                    >
                      <Share2 size={12} />
                      <span>Copiar</span>
                    </button>
                    <button
                      type="button"
                      className="bv-saved-mini-btn wa"
                      onClick={() => handleShareSavedMomentWhatsApp(item)}
                      title="Compartir este momento por WhatsApp"
                    >
                      <span>WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      className="bv-saved-del-btn"
                      onClick={() => handleDeleteSavedMoment(item.id)}
                      title="Eliminar momento guardado"
                      aria-label="Eliminar momento guardado"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Menú flotante de Compartir */}
      {showShareMenu && (
        <div className="bv-share-menu">
          <div className="bv-share-head">Compartir desde YOUAPP</div>

          <button
            type="button"
            className="bv-share-primary"
            onClick={() =>
              void handleShareOption({
                type: 'signal',
                signalId: activeSignal?.id || 'justicia-social-signal-1'
              })
            }
          >
            📡 Compartir Mi Señal ({activeSignal?.name || 'Activa'})
          </button>

          <button type="button" className="bv-share-wa" onClick={handleShareSignalWhatsApp}>
            💬 Enviar señal por WhatsApp
          </button>

          <button
            type="button"
            className="bv-share-item"
            onClick={() => void handleShareOption({ type: 'video', contentId: content.id })}
          >
            🎬 Copiar enlace del video completo
          </button>

          <button
            type="button"
            className="bv-share-item"
            onClick={() =>
              void handleShareOption({
                type: 'moment',
                contentId: content.id,
                startSec: currentTime
              })
            }
          >
            ⏱️ Este momento exacto ({formatTime(currentTime)})
          </button>

          <button
            type="button"
            className="bv-share-item"
            onClick={() => void handleShareOption({ type: 'you4', contentId: content.id })}
          >
            📺 Compartir YOU4 (4 Pantallas)
          </button>

          <div className="bv-share-divider" />
          <button
            type="button"
            className="bv-share-origin"
            onClick={() =>
              window.open(
                content.canonicalUrl || `https://www.youtube.com/watch?v=${content.providerId}`,
                '_blank',
                'noopener,noreferrer'
              )
            }
          >
            Abrir fuente original en {providerLabel} ↗
          </button>
        </div>
      )}
    </div>
  );
};
