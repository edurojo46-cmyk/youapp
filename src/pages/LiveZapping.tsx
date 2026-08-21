import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { 
  ChevronLeft, Moon, Tv, Star, Volume2, VolumeX, 
  Loader2, Radio, Compass, Sparkles, Coffee, Smile, Film, Sun,
  Image, Info, EyeOff, Layers, Search, Cast, Smartphone, Grid, Maximize, Minimize, Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  fetchTopViewedVideosByMood, 
  fetchChannelTVVideos, 
  fetchReal24_7LiveStreams, 
  VERIFIED_24_7_LIVE_CHANNELS 
} from '../lib/youtube';
import { UNIVERSAL_CATALOG } from '../lib/universalChannels';
import { calculateGlobalChannelSync } from '../utils/tvEngine';
import SleepTimer from '../components/SleepTimer';

import SyncedTVPlayer from '../components/SyncedTVPlayer';
import EPGGuide from '../components/EPGGuide';
import AmbientMode from '../components/AmbientMode';
import ProgramInfoModal from '../components/ProgramInfoModal';
import MultiviewPiP from '../components/MultiviewPiP';
import QuadMultiview from '../components/QuadMultiview';
import RemoteConnectModal from '../components/RemoteConnectModal';
import ChannelSearchModal from '../components/ChannelSearchModal';
import CastModal from '../components/CastModal';


import { RemoteBridge } from '../utils/remoteBridge';

const MOOD_SEARCH_QUERIES: Record<string, string> = {
  focus: 'lofi hip hop radio beats study relaxation',
  relax: 'relaxing 4k nature scenery meditation ocean',
  learn: 'documentales ciencia universo historia cosmos',
  humor: 'funny animals comedy viral risas',
  cinema: 'animation short film festival cortometrajes 4k'
};

const MOODS = [
  { id: 'all', label: '🔴 24/7 En Vivo (Oficiales)' },
  { id: 'live24', label: '📡 Transmisiones 24hs YouTube' },
  { id: 'relax', label: '🧘 Relax & Naturaleza' },
  { id: 'focus', label: '☕ Focus & Lo-Fi' },
  { id: 'learn', label: '🧠 Ciencia & Cosmos' },
  { id: 'humor', label: '😂 Humor & Viral' },
  { id: 'cinema', label: '🍿 Cine & Cortos' },
];

export default function LiveZapping() {
  const navigate = useNavigate();

  const [allChannels, setAllChannels] = useState<any[]>(() => {
    try {
      const rawPayload = localStorage.getItem('youapp_tune_channel_payload');
      if (rawPayload) {
        const payload = JSON.parse(rawPayload);
        if (payload && payload.videoUrl) {
          return [payload, ...VERIFIED_24_7_LIVE_CHANNELS];
        }
      }
      const saved = JSON.parse(localStorage.getItem('youapp_saved_custom_channels') || '[]');
      if (Array.isArray(saved) && saved.length > 0) {
        return [...saved, ...VERIFIED_24_7_LIVE_CHANNELS];
      }
    } catch {}
    return VERIFIED_24_7_LIVE_CHANNELS;
  });
  const [filteredChannels, setFilteredChannels] = useState<any[]>(allChannels);
  const [selectedMood, setSelectedMood] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);


  // Control Remoto Virtual por Código QR y PIN de 4 dígitos (Persistente para evitar desconexiones)
  const [sessionId] = useState(() => {
    try {
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const params = new URLSearchParams(window.location.search || hashQuery);
      const room = params.get('room');
      if (room) {
        localStorage.setItem('youapp_tv_pin', room);
        return room;
      }
      const saved = localStorage.getItem('youapp_tv_pin');
      if (saved) return saved;
      const newPin = '1234';
      localStorage.setItem('youapp_tv_pin', newPin);
      return newPin;
    } catch {
      return '1234';
    }
  });
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const [isPhoneConnected, setIsPhoneConnected] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState<Array<{ id: number; emoji: string; left: number }>>([]);




  // Modales y Modos
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [showEPGModal, setShowEPGModal] = useState(false);
  const [showAmbientModal, setShowAmbientModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPiP, setShowPiP] = useState(false);
  const [showQuadView, setShowQuadView] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isAsleep, setIsAsleep] = useState(false);

  // OSD de televisión
  const [showOSD, setShowOSD] = useState(true);
  const osdTimeoutRef = useRef<any>(null);

  // Pantalla Completa Nativa (oculta barra URL del browser)
  const [isFullscreen, setIsFullscreen] = useState(false);
  // En fullscreen: mostrar UI brevemente al tocar, luego se oculta
  const [showFullscreenUI, setShowFullscreenUI] = useState(false);
  const fullscreenUITimeout = useRef<any>(null);

  const [showPWABanner, setShowPWABanner] = useState(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem('youapp_pwa_dismissed');
    return isMobile && !isStandalone && !dismissed;
  });

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        setIsFullscreen(true);
        setShowFullscreenUI(false); // ocultar UI al entrar en fullscreen
        try { await (screen.orientation as any).lock('landscape'); } catch {}
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
        setShowFullscreenUI(false);
        try { (screen.orientation as any).unlock(); } catch {}
      }
    } catch (e) {
      console.warn('Fullscreen not supported:', e);
    }
  }, []);

  // Mostrar UI brevemente en fullscreen al tocar pantalla
  const triggerFullscreenUI = useCallback(() => {
    if (!isFullscreen) return;
    setShowFullscreenUI(true);
    if (fullscreenUITimeout.current) clearTimeout(fullscreenUITimeout.current);
    fullscreenUITimeout.current = setTimeout(() => {
      setShowFullscreenUI(false);
    }, 3000);
  }, [isFullscreen]);

  useEffect(() => {
    const onFSChange = () => {
      const inFS = !!document.fullscreenElement;
      setIsFullscreen(inFS);
      if (!inFS) setShowFullscreenUI(false);
    };
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  // Favoritos
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('youapp_favorites') || '[]');
    } catch {
      return [];
    }
  });

  const currentChannel = filteredChannels[activeIndex] || filteredChannels[0];
  const isFav = favorites.includes(currentChannel?.id);

  // Sincronización Global 24/7 (Epoch UTC)
  const syncOffset = useMemo(() => {
    if (currentChannel?.isLive) return 0; // Transmisiones en vivo van en directo natural
    const cycleDuration = currentChannel?.durationSeconds || 600;
    const epochSec = Math.floor(Date.now() / 1000);
    const hash = (currentChannel?.id || '').split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
    return (epochSec + hash) % cycleDuration;
  }, [currentChannel?.id, currentChannel?.durationSeconds, currentChannel?.isLive]);


  const handleVideoEnded = useCallback(() => {
    setActiveIndex(prev => (prev < filteredChannels.length - 1 ? prev + 1 : 0));
    setShowOSD(true);
  }, [filteredChannels.length]);


  const bridgeRef = useRef<RemoteBridge | null>(null);

  const channelsRef = useRef(filteredChannels);
  channelsRef.current = filteredChannels;

  // Escuchar órdenes del Control Remoto Móvil en Tiempo Real mediante RemoteBridge
  useEffect(() => {
    console.log('[TV LiveZapping] Initializing persistent RemoteBridge for PIN:', sessionId);
    const bridge = new RemoteBridge(sessionId, 'tv');
    bridgeRef.current = bridge;

    bridge.onConnected(() => {
      setIsPhoneConnected(true);
      triggerFloatingEmoji('📱');
      const current = channelsRef.current[activeIndex] || channelsRef.current[0];
      if (current) {
        bridge.sendAction('SYNC_STATE', {
          activeIndex,
          channel: current,
          moodId: selectedMood,
          totalChannels: channelsRef.current.length,
          isQuadOpen: showQuadView
        });
      }
    });

    bridge.onAction((action, payload) => {
      console.log('[TV LiveZapping] Action received from remote:', action, payload);
      if (action === 'NEXT_CHANNEL') {
        setActiveIndex(prev => (prev < channelsRef.current.length - 1 ? prev + 1 : 0));
        triggerOSD();
      } else if (action === 'PREV_CHANNEL') {
        setActiveIndex(prev => (prev > 0 ? prev - 1 : channelsRef.current.length - 1));
        triggerOSD();
      } else if (action === 'SET_CHANNEL_INDEX') {
        if (payload?.index !== undefined && payload.index < channelsRef.current.length) {
          setActiveIndex(payload.index);
          triggerOSD();
        }
      } else if (action === 'SET_MOOD') {
        if (payload?.moodId) handleMoodSelect(payload.moodId);
      } else if (action === 'TOGGLE_QUAD') {
        console.log('[TV LiveZapping] TOGGLE_QUAD received! Toggling QuadMultiview mode.');
        setShowQuadView(prev => !prev);
      } else if (action === 'TOGGLE_SEARCH') {
        setShowSearchModal(prev => !prev);
      } else if (action === 'TOGGLE_AMBIENT') {
        setShowAmbientModal(prev => !prev);
      } else if (action === 'TOGGLE_ZEN') {
        setIsZenMode(prev => !prev);
      } else if (action === 'TOGGLE_SLEEP') {
        setIsAsleep(prev => !prev);
      } else if (action === 'TOGGLE_MUTE') {
        setIsMuted(prev => !prev);
      } else if (action === 'UNMUTE') {
        setIsMuted(false);
      } else if (action === 'SEARCH_QUERY') {
        if (payload?.query) {
          handleCustomYouTubeSearch(payload.query);
        }
      } else if (action === 'TOGGLE_EPG') {
        setShowEPGModal(prev => !prev);
      } else if (action === 'TOGGLE_INFO') {
        setShowInfoModal(prev => !prev);
      } else if (action === 'SEND_EMOJI') {
        triggerFloatingEmoji(payload?.emoji || '🔥');
      }
    });

    return () => {
      console.log('[TV LiveZapping] Cleaning up RemoteBridge');
      bridge.destroy();
    };
  }, [sessionId]);

  // Transmitir cambio de canal en milisegundos a todos los celulares conectados
  useEffect(() => {
    if (bridgeRef.current && isPhoneConnected && currentChannel) {
      bridgeRef.current.sendAction('SYNC_STATE', {
        activeIndex,
        channel: currentChannel,
        moodId: selectedMood,
        totalChannels: filteredChannels.length,
        isQuadOpen: showQuadView
      });
    }
  }, [activeIndex, currentChannel, selectedMood, isPhoneConnected, filteredChannels.length, showQuadView]);


  const triggerFloatingEmoji = (emoji: string) => {

    const newEmoji = {
      id: Date.now() + Math.random(),
      emoji,
      left: Math.random() * 80 + 10 // 10% a 90%
    };
    setFlyingEmojis(prev => [...prev.slice(-15), newEmoji]);
    setTimeout(() => {
      setFlyingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
    }, 3000);
  };

  useEffect(() => {
    // Limpiar caché temporal vieja pero preservando canales guardados por el usuario y favoritos
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('youapp_live_') || k.startsWith('youapp_mood_') || k.startsWith('youapp_yt_search_'))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
    fetchLiveChannels();
  }, []);

  const fetchLiveChannels = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('channels')
        .select(`
          id,
          name,
          slug,
          category,
          programming (
            id,
            videos (*)
          )
        `)
        .limit(20);

      const userFormatted = (data || []).map((ch: any) => {
        const progs = ch.programming || [];
        if (progs.length === 0) return null;

        // Calcular qué video de la programación del canal está al aire en este segundo UTC
        const nowSec = Math.floor(Date.now() / 1000);
        const defaultDur = 300; // 5 minutos si no especifica
        const totalDuration = progs.length * defaultDur;
        const cycleSec = nowSec % totalDuration;
        const activeProgIdx = Math.floor(cycleSec / defaultDur) % progs.length;
        const offsetSec = cycleSec % defaultDur;

        const currentProg = progs[activeProgIdx] || progs[0];
        const video = currentProg?.videos;
        if (!video) return null;

        const rawId = (video.id || '').replace('yt-', '').replace('https://www.youtube.com/embed/', '');

        return {
          ...ch,
          viewerCount: Math.floor(Math.random() * 800) + 120,
          videoUrl: `https://www.youtube.com/embed/${rawId}`,
          currentVideoTitle: video.title || ch.name || 'Transmisión en vivo 24/7',
          initialOffset: offsetSec,
          programmingList: progs
        };
      }).filter((ch: any) => ch !== null && ch.videoUrl !== null);


      const real24Live = await fetchReal24_7LiveStreams('live 24/7 stream radio');
      const topRelax = await fetchTopViewedVideosByMood(MOOD_SEARCH_QUERIES.relax, 15);
      const topFocus = await fetchTopViewedVideosByMood(MOOD_SEARCH_QUERIES.focus, 15);

      // Cargar canales personalizados guardados por el usuario
      let userCustomChannels: any[] = [];
      try {
        const saved = JSON.parse(localStorage.getItem('youapp_saved_custom_channels') || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
          userCustomChannels = saved;
        }
      } catch (e) {}

      // Deduplicar canales por videoUrl o ID para asegurar que cada canal sea 100% único
      const rawChannels = [...userCustomChannels, ...UNIVERSAL_CATALOG, ...VERIFIED_24_7_LIVE_CHANNELS, ...userFormatted];
      if (Array.isArray(real24Live) && real24Live.length > 0 && real24Live !== VERIFIED_24_7_LIVE_CHANNELS) {
        rawChannels.push(...real24Live);
      }
      if (Array.isArray(topRelax) && topRelax.length > 0 && topRelax !== VERIFIED_24_7_LIVE_CHANNELS) {
        rawChannels.push(...topRelax);
      }
      if (Array.isArray(topFocus) && topFocus.length > 0 && topFocus !== VERIFIED_24_7_LIVE_CHANNELS) {
        rawChannels.push(...topFocus);
      }

      const seenUrls = new Set<string>();
      const uniqueChannels = rawChannels.filter(ch => {
        if (!ch || !ch.videoUrl) return false;
        if (seenUrls.has(ch.videoUrl)) return false;
        seenUrls.add(ch.videoUrl);
        return true;
      }).map((ch, idx) => ({
        ...ch,
        id: ch.id || `channel-${idx + 1}`
      }));

      const finalChannels = uniqueChannels.length > 0 ? uniqueChannels : VERIFIED_24_7_LIVE_CHANNELS;
      setAllChannels(finalChannels);
      setFilteredChannels(finalChannels);

      // Sintonizar automáticamente el canal seleccionado si venimos de la búsqueda o de la Home
      let targetPayload: any = null;
      try {
        const rawP = localStorage.getItem('youapp_tune_channel_payload');
        if (rawP) targetPayload = JSON.parse(rawP);
      } catch {}
      const targetChannelId = localStorage.getItem('youapp_active_channel_id');

      let channelsWithTarget = finalChannels;

      if (targetPayload && targetPayload.videoUrl) {
        const foundIdx = channelsWithTarget.findIndex(
          c => c.id === targetPayload.id || c.channelId === targetPayload.channelId || c.videoUrl === targetPayload.videoUrl || (targetPayload.name && c.name && c.name.toLowerCase() === targetPayload.name.toLowerCase())
        );

        if (foundIdx !== -1) {
          setActiveIndex(foundIdx);
        } else {
          channelsWithTarget = [targetPayload, ...channelsWithTarget];
          setAllChannels(channelsWithTarget);
          setFilteredChannels(channelsWithTarget);
          setActiveIndex(0);
        }
        localStorage.removeItem('youapp_tune_channel_payload');
        localStorage.removeItem('youapp_active_channel_id');
      } else if (targetChannelId) {
        const foundIdx = channelsWithTarget.findIndex(
          c => c.id === targetChannelId || c.channelId === targetChannelId || c.id === `custom-yt-${targetChannelId}`
        );
        if (foundIdx !== -1) {
          setActiveIndex(foundIdx);
        }
        localStorage.removeItem('youapp_active_channel_id');
      }
    } catch (e) {
      console.error(e);
      setAllChannels(VERIFIED_24_7_LIVE_CHANNELS);
      setFilteredChannels(VERIFIED_24_7_LIVE_CHANNELS);
    } finally {
      setLoading(false);
    }
  };

  // Filtrado por Mood (Obtiene los 30 más vistos en tiempo real de YouTube)
  const handleMoodSelect = async (moodId: string) => {
    setSelectedMood(moodId);
    setActiveIndex(0);

    if (moodId === 'all') {
      setFilteredChannels(allChannels.length > 0 ? allChannels : VERIFIED_24_7_LIVE_CHANNELS);
      triggerOSD();
      return;
    }

    if (moodId === 'live24') {
      setIsMoodLoading(true);
      try {
        const liveStreams = await fetchReal24_7LiveStreams('live streaming 24/7');
        setFilteredChannels([...VERIFIED_24_7_LIVE_CHANNELS, ...liveStreams]);
      } catch (err) {
        setFilteredChannels(VERIFIED_24_7_LIVE_CHANNELS);
      } finally {
        setIsMoodLoading(false);
        triggerOSD();
      }
      return;
    }

    setIsMoodLoading(true);
    try {
      const query = MOOD_SEARCH_QUERIES[moodId] || 'popular videos';
      const top30Videos = await fetchTopViewedVideosByMood(query, 30);

      if (top30Videos && top30Videos.length > 0) {
        setFilteredChannels(top30Videos);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsMoodLoading(false);
      triggerOSD();
    }
  };


  const triggerOSD = () => {
    setShowOSD(true);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => {
      setShowOSD(false);
    }, 3500);
    // En fullscreen: también mostrar barra de acciones brevemente
    triggerFullscreenUI();
  };

  // Atajos de Teclado (Control Remoto)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isAsleep) {
      setIsAsleep(false);
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : filteredChannels.length - 1));
      triggerOSD();
    } else if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredChannels.length - 1 ? prev + 1 : 0));
      triggerOSD();
    } else if (e.key === '/' || e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      setShowSearchModal(prev => !prev);
    } else if (e.key === 'g' || e.key === 'G') {
      setShowEPGModal(prev => !prev);
    } else if (e.key === 'm' || e.key === 'M') {
      setShowSleepModal(prev => !prev);
    } else if (e.key === 'a' || e.key === 'A') {
      setShowAmbientModal(prev => !prev);
    } else if (e.key === 'i' || e.key === 'I') {
      setShowInfoModal(prev => !prev);
    } else if (e.key === 'z' || e.key === 'Z') {
      setIsZenMode(prev => !prev);
    } else if (e.key === 'p' || e.key === 'P') {
      setShowPiP(prev => !prev);
    } else if (e.key === '4') {
      setShowQuadView(prev => !prev);
    } else if (/^[1-9]$/.test(e.key)) {
      const targetIndex = parseInt(e.key, 10) - 1;
      if (targetIndex < filteredChannels.length) {
        setActiveIndex(targetIndex);
        triggerOSD();
      }
    }
  }, [filteredChannels, isAsleep]);

  // Agregar nuevo canal de YouTube a la grilla activa y sintonizarlo
  const handleAddChannelToGrid = (newChannel: any) => {
    if (!newChannel || !newChannel.videoUrl) return;

    // Verificar si ya existe en la grilla
    const existingIdx = allChannels.findIndex(
      c => c.videoUrl === newChannel.videoUrl || c.id === newChannel.id || (c.name.toLowerCase() === newChannel.name.toLowerCase() && c.currentVideoTitle === newChannel.currentVideoTitle)
    );

    if (existingIdx !== -1) {
      setActiveIndex(existingIdx);
      triggerOSD();
      return;
    }

    const formatted = {
      ...newChannel,
      id: newChannel.id || `custom-ch-${Date.now()}`,
      viewerCount: newChannel.viewerCount || Math.floor(Math.random() * 4000) + 1200,
      category: newChannel.category || '🔴 Canal YouTube',
      isLive: newChannel.isLive !== undefined ? newChannel.isLive : true,
      durationSeconds: newChannel.durationSeconds || 600
    };

    // Agregar al inicio de la lista de canales
    const updatedAll = [formatted, ...allChannels];
    const updatedFiltered = [formatted, ...filteredChannels];

    setAllChannels(updatedAll);
    setFilteredChannels(updatedFiltered);
    setActiveIndex(0);
    triggerOSD();

    // Guardar en localStorage para persistencia permanente
    try {
      const saved = JSON.parse(localStorage.getItem('youapp_saved_custom_channels') || '[]');
      const newSaved = [formatted, ...saved.filter((c: any) => c.videoUrl !== formatted.videoUrl)];
      localStorage.setItem('youapp_saved_custom_channels', JSON.stringify(newSaved.slice(0, 50)));
    } catch (e) {
      console.warn("Error saving custom channel:", e);
    }
  };

  const handleCustomYouTubeSearch = async (query: string) => {
    setIsMoodLoading(true);
    try {
      const videos = await fetchTopViewedVideosByMood(query, 15);
      if (videos.length > 0) {
        // En vez de reemplazar todos los canales, agregamos los encontrados
        videos.forEach((v: any) => handleAddChannelToGrid(v));
      }
    } catch (err) {
      console.error("Error searching YouTube:", err);
    } finally {
      setIsMoodLoading(false);
    }
  };

  const handleSelectRealYouTubeChannel = async (channelId: string, channelTitle: string) => {
    setIsMoodLoading(true);
    try {
      const videos = await fetchChannelTVVideos(channelId, channelTitle);
      if (videos.length > 0) {
        // Agregar el canal a la grilla y sintonizar
        handleAddChannelToGrid(videos[0]);
      }
    } catch (err) {
      console.error("Error loading real YouTube channel station:", err);
    } finally {
      setIsMoodLoading(false);
    }
  };



  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleFavorite = (channelId: string) => {
    const next = favorites.includes(channelId)
      ? favorites.filter(id => id !== channelId)
      : [...favorites, channelId];
    setFavorites(next);
    localStorage.setItem('youapp_favorites', JSON.stringify(next));
  };

  if (loading) {
    return (
      <div className="zapping-loading">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p style={{ marginTop: '16px', color: 'rgba(255,255,255,0.7)' }}>Cargando grilla de televisión en vivo...</p>
      </div>
    );
  }

  // Pantalla de Reposo / Dormir (Sleep Mode)
  if (isAsleep) {
    return (
      <div className="sleep-screen" onClick={() => setIsAsleep(false)}>
        <Moon size={64} className="sleep-moon-icon" />
        <h1>Modo Reposo Activado</h1>
        <p>El televisor se ha apagado para tu descanso.</p>
        <span className="wake-hint">Toca la pantalla o presiona cualquier tecla para encender</span>
      </div>
    );
  }

  if (filteredChannels.length === 0) {
    return (
      <div className="zapping-loading">
        <h2>No hay canales disponibles en esta categoría.</h2>
        <button className="btn btn-primary" onClick={() => setSelectedMood('all')} style={{ marginTop: '20px' }}>
          Ver Todos los Canales
        </button>
      </div>
    );
  }

  return (

    <div className="live-zapping-viewport" onClick={triggerOSD}>
      {/* Reproductor de TV Sincronizado 24/7 */}
      <SyncedTVPlayer
        key={currentChannel.id || currentChannel.videoUrl}
        url={currentChannel.videoUrl}
        isMuted={isMuted}
        onUnmute={() => setIsMuted(false)}
        onVideoEnded={handleVideoEnded}
        targetOffsetSeconds={syncOffset}
        channelName={currentChannel.name}
        hideLiveBadge={isFullscreen && !showFullscreenUI}
      />








      {/* Botón de Sonido Flotante */}
      {isMuted && (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsMuted(false); }} 
          className="zapping-unmute-btn"
        >
          <VolumeX size={18} />
          <span>Activar Sonido</span>
        </button>
      )}

      {/* Botón de Pantalla Completa Nativa (oculta barra URL en móvil) */}
      {!isZenMode && (
        <button
          className="fullscreen-native-btn"
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa (oculta barra URL)'}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      )}

      {/* Banner PWA: Instalar app para experiencia sin barra URL */}
      {showPWABanner && !isZenMode && (
        <div className="pwa-install-banner" onClick={(e) => e.stopPropagation()}>
          <Download size={16} />
          <span>📱 <strong>Instalá YouApp</strong> en tu pantalla de inicio para verla sin barra de URL</span>
          <button 
            className="pwa-dismiss-btn"
            onClick={() => {
              setShowPWABanner(false);
              localStorage.setItem('youapp_pwa_dismissed', '1');
            }}
          >✕</button>
        </div>
      )}

      {/* Selector de Mood TV (Barra Superior de Acciones) - se oculta en fullscreen */}
      {!isZenMode && (!isFullscreen || showFullscreenUI) && (
        <div className="mood-bar glass-panel" onClick={(e) => e.stopPropagation()}>
          <button className="back-circle-btn" onClick={() => navigate('/')}>
            <ChevronLeft size={20} />
          </button>

          <div className="mood-scroll">
            {MOODS.map(m => (
              <button
                key={m.id}
                className={`mood-pill ${selectedMood === m.id ? 'active' : ''}`}
                onClick={() => handleMoodSelect(m.id)}
              >
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="quick-actions">
            <button 
              className="icon-action-btn cast-action-btn" 
              onClick={() => setShowCastModal(true)} 
              title="Transmitir a la TV (Google Cast / Chromecast / Smart TV)"
              style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(99, 102, 241, 0.35))', borderColor: '#60a5fa' }}
            >
              <Cast size={18} color="#93c5fd" />
            </button>
            <button 
              className="icon-action-btn" 
              onClick={() => setShowRemoteModal(true)} 
              title="Control Remoto por Celular (QR)"
              style={{ background: isPhoneConnected ? 'rgba(34, 197, 94, 0.25)' : 'rgba(99, 102, 241, 0.25)', borderColor: isPhoneConnected ? '#4ade80' : '#6366f1' }}
            >
              <Smartphone size={18} color={isPhoneConnected ? '#4ade80' : '#a5b4fc'} />
            </button>
            <button 
              className={`icon-action-btn ${showQuadView ? 'active' : ''}`} 
              onClick={() => setShowQuadView(prev => !prev)} 
              title="Modo 4 Pantallas Simultáneas (Tecla 4)"
              style={{ 
                background: showQuadView ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'rgba(99, 102, 241, 0.25)', 
                borderColor: showQuadView ? '#ec4899' : '#6366f1',
                padding: '4px 10px',
                width: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Grid size={18} color="#ffffff" />
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'white' }}>4 EN 1</span>
            </button>
            <button 
              className="icon-action-btn search-trigger-btn" 
              onClick={() => setShowSearchModal(true)} 
              title="Buscar Canales (F o /)"
            >
              <Search size={18} />
            </button>
            <button 
              className="icon-action-btn" 
              onClick={() => setShowInfoModal(true)} 
              title="Ficha & Resumen IA (I)"
            >
              <Info size={18} />
            </button>

            <button 
              className="icon-action-btn" 
              onClick={() => setShowAmbientModal(true)} 
              title="Modo Ambiente / Cuadro 4K (A)"
            >
              <Image size={18} />
            </button>
            <button 
              className="icon-action-btn" 
              onClick={() => setShowPiP(prev => !prev)} 
              title="Multiview 2º Canal (P)"
            >
              <Layers size={18} />
            </button>
            <button 
              className="icon-action-btn" 
              onClick={() => setShowEPGModal(true)} 
              title="Guía de Canales (G)"
            >
              <Tv size={18} />
            </button>
            <button 
              className="icon-action-btn" 
              onClick={() => setShowSleepModal(true)} 
              title="Sleep Timer (M)"
            >
              <Moon size={18} />
            </button>
            <button 
              className="icon-action-btn" 
              onClick={() => setIsZenMode(true)} 
              title="Modo Zen / Cine (Z)"
            >
              <EyeOff size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Ráfaga de Emojis que vuelan por la TV desde el Control Remoto */}
      <div className="flying-emojis-container">
        {flyingEmojis.map((item) => (
          <div key={item.id} className="floating-tv-emoji" style={{ left: `${item.left}%` }}>
            {item.emoji}
          </div>
        ))}
      </div>

      {/* Indicador de Modo Zen */}
      {isZenMode && (
        <button 
          className="exit-zen-btn glass-panel" 
          onClick={() => setIsZenMode(false)}
          title="Salir de Modo Zen (Z)"
        >
          <span>🧘 Modo Zen Activo (Toca para ver menú)</span>
        </button>
      )}

      {/* OSD Televisivo (On Screen Display) al cambiar de canal */}
      {!isZenMode && (
        <div className={`channel-osd glass-panel ${showOSD ? 'visible' : 'hidden'}`}>
          <div className="osd-left">
            <span className="osd-ch-number">CH {String(activeIndex + 1).padStart(2, '0')}</span>
            <div className="osd-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2>{currentChannel.name}</h2>
                <span className="osd-live-tag">● EN VIVO</span>
                <span className="osd-cat">{currentChannel.category || 'General'}</span>
              </div>
              <p className="osd-program" dangerouslySetInnerHTML={{ __html: currentChannel.currentVideoTitle }}></p>
            </div>
          </div>

          <div className="osd-right">
            <button 
              className={`fav-btn ${isFav ? 'active' : ''}`} 
              onClick={(e) => { e.stopPropagation(); toggleFavorite(currentChannel.id); }}
              title="Marcar como canal favorito"
            >
              <Star size={20} fill={isFav ? '#fbbf24' : 'none'} color={isFav ? '#fbbf24' : 'white'} />
            </button>
          </div>
        </div>
      )}

      {/* Controles de Zapping en Pantalla (para Celulares / Touch / Smart View) */}
      {!isZenMode && (
        <div className="touch-zapping-controls" onClick={(e) => e.stopPropagation()}>
          <button 
            className="zap-nav-btn"
            onClick={() => {
              setActiveIndex(prev => (prev > 0 ? prev - 1 : filteredChannels.length - 1));
              triggerOSD();
            }}
            title="Canal Anterior (↑)"
          >
            ◀ Anterior
          </button>
          
          <button 
            className="zap-counter-badge"
            onClick={() => setShowEPGModal(true)}
            title="Abrir Guía Completa de Canales"
            style={{ cursor: 'pointer' }}
          >
            CH {activeIndex + 1} / {filteredChannels.length}
          </button>

          <button 
            className="zap-nav-btn"
            onClick={() => {
              setActiveIndex(prev => (prev < filteredChannels.length - 1 ? prev + 1 : 0));
              triggerOSD();
            }}
            title="Canal Siguiente (↓)"
          >
            Siguiente ▶
          </button>
        </div>
      )}

      {/* Modales y Modos Especiales */}
      <CastModal
        isOpen={showCastModal}
        onClose={() => setShowCastModal(false)}
        currentChannel={currentChannel}
        pin={sessionId}
      />

      <ChannelSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        channels={filteredChannels}
        onSelectChannel={(idx) => {
          setActiveIndex(idx);
          triggerOSD();
        }}
        onAddChannel={handleAddChannelToGrid}
        onSelectRealYouTubeChannel={handleSelectRealYouTubeChannel}
      />



      <RemoteConnectModal
        sessionId={sessionId}
        isOpen={showRemoteModal}
        onClose={() => setShowRemoteModal(false)}
        isPhoneConnected={isPhoneConnected}
      />


      <QuadMultiview 
        channels={filteredChannels}
        isOpen={showQuadView}
        onClose={() => setShowQuadView(false)}
        onSelectMainChannel={(idx) => {
          setActiveIndex(idx);
          triggerOSD();
        }}
      />

      <AmbientMode 
        isOpen={showAmbientModal} 
        onClose={() => setShowAmbientModal(false)} 
      />

      <ProgramInfoModal 
        channel={currentChannel}
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />

      <MultiviewPiP 
        isOpen={showPiP}
        channel={filteredChannels[(activeIndex + 1) % filteredChannels.length]}
        onClose={() => setShowPiP(false)}
        onSwapWithMain={() => {
          setActiveIndex(prev => (prev + 1) % filteredChannels.length);
          triggerOSD();
        }}
      />

      <SleepTimer 
        isOpen={showSleepModal} 
        onClose={() => setShowSleepModal(false)} 
        onSleepTriggered={() => setIsAsleep(true)} 
      />

      <EPGGuide 
        channels={filteredChannels}
        currentChannelIndex={activeIndex}
        isOpen={showEPGModal}
        onClose={() => setShowEPGModal(false)}
        onSelectChannel={(idx) => {
          setActiveIndex(idx);
          triggerOSD();
        }}
      />

      <style>{`
        .live-zapping-viewport {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          background: #000;
          color: white;
        }

        /* Botón de Pantalla Completa Nativa */
        .fullscreen-native-btn {
          position: absolute;
          top: 70px;
          left: 20px;
          z-index: 60;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(15, 17, 26, 0.85);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        }

        .fullscreen-native-btn:hover,
        .fullscreen-native-btn:active {
          background: #6366f1;
          transform: scale(1.1);
        }

        /* Banner de instalación PWA */
        .pwa-install-banner {
          position: absolute;
          bottom: 80px;
          left: 12px;
          right: 12px;
          z-index: 70;
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(99, 102, 241, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(165, 180, 252, 0.4);
          border-radius: 14px;
          padding: 10px 14px;
          font-size: 0.82rem;
          color: white;
          box-shadow: 0 4px 24px rgba(99, 102, 241, 0.5);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .pwa-install-banner span {
          flex: 1;
          line-height: 1.3;
        }

        .pwa-dismiss-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }


        .zapping-loading, .no-signal-screen {
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0b0d14;
          color: white;
          text-align: center;
          padding: 20px;
        }

        .sleep-screen {
          height: 100%;
          width: 100%;
          background: #05070c;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.8);
          text-align: center;
          cursor: pointer;
          animation: fadeIn 1s;
        }

        .sleep-moon-icon {
          color: #6366f1;
          margin-bottom: 20px;
          animation: pulse 3s infinite;
        }

        .wake-hint {
          margin-top: 30px;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
          letter-spacing: 1px;
        }

        .zapping-iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: 0;
          outline: none;
          background: #000;
          pointer-events: auto;
        }


        .zapping-unmute-btn {
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #6366f1;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 25px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.6);
        }

        /* Emojis Flotantes en la TV desde el Móvil */
        .flying-emojis-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 80;
          overflow: hidden;
        }

        .floating-tv-emoji {
          position: absolute;
          bottom: 20px;
          font-size: 3.5rem;
          animation: floatUp 3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          filter: drop-shadow(0 4px 15px rgba(0, 0, 0, 0.8));
        }

        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(0.6);
          }
          50% {
            opacity: 1;
            transform: translateY(-40vh) scale(1.2);
          }
          100% {
            opacity: 0;
            transform: translateY(-80vh) scale(1.5);
          }
        }

        .exit-zen-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 60;
          background: rgba(15, 17, 26, 0.7);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.8);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, opacity 0.3s;
          opacity: 0.6;
        }

        .exit-zen-btn:hover {
          opacity: 1;
          background: rgba(99, 102, 241, 0.4);
        }

        .mood-bar {
          position: absolute;
          top: 15px;
          left: 15px;
          right: 15px;
          z-index: 60;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 14px;
          border-radius: 40px;
          background: rgba(15, 17, 26, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .back-circle-btn {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: white;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        .mood-scroll {
          flex: 1;
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .mood-scroll::-webkit-scrollbar {
          display: none;
        }

        .mood-pill {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mood-pill.active {
          background: #6366f1;
          color: white;
          border-color: #6366f1;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.4);
        }

        .quick-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .icon-action-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .icon-action-btn:hover {
          background: #6366f1;
        }

        /* OSD Banner */
        .channel-osd {
          position: absolute;
          bottom: 20px;
          left: 20px;
          right: 20px;
          z-index: 55;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 24px;
          border-radius: 16px;
          background: rgba(15, 17, 26, 0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }

        .channel-osd.hidden {
          opacity: 0;
          transform: translateY(20px);
          pointer-events: none;
        }

        .channel-osd.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .osd-left {
          display: flex;
          align-items: center;
          gap: 18px;
          max-width: 80%;
        }

        .osd-ch-number {
          font-family: monospace;
          font-size: 1.8rem;
          font-weight: 900;
          color: #a5b4fc;
          letter-spacing: 1px;
        }

        .osd-meta h2 {
          font-size: 1.2rem;
          margin: 0;
        }

        .osd-live-tag {
          font-size: 0.65rem;
          font-weight: 800;
          color: #ef4444;
        }

        .osd-cat {
          font-size: 0.7rem;
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.6);
        }

        .osd-program {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.75);
          margin: 4px 0 0 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .fav-btn {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .touch-zapping-controls {
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 999;
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .zap-counter-badge {
          font-family: monospace;
          font-size: 0.8rem;
          font-weight: 800;
          color: #a5b4fc;
          background: rgba(15, 17, 26, 0.9);
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .zap-nav-btn {
          background: rgba(15, 17, 26, 0.9);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: white;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          touch-action: manipulation;
        }

        .zap-nav-btn:active, .zap-nav-btn:hover {
          background: #6366f1;
          transform: scale(1.08);
        }


        @media (max-width: 768px) {
          .channel-osd {
            left: 10px;
            right: 10px;
            bottom: 10px;
            padding: 8px 12px;
          }
          .osd-ch-number {
            font-size: 1.1rem;
            padding-right: 10px;
          }
          .channel-osd h2 {
            font-size: 0.85rem;
          }
          .osd-program {
            font-size: 0.7rem;
            max-width: 65vw;
          }
        }

        /* Modo Horizontal en Celulares (Landscape Mobile) */
        @media (orientation: landscape) and (max-height: 550px) {
          .mood-bar {
            top: 6px;
            left: 10px;
            right: 10px;
            padding: 3px 8px;
            gap: 6px;
            background: rgba(15, 17, 26, 0.75);
          }

          .mood-pill {
            padding: 3px 10px;
            font-size: 0.7rem;
          }

          .icon-action-btn, .back-circle-btn {
            width: 26px;
            height: 26px;
          }

          .icon-action-btn svg, .back-circle-btn svg {
            width: 14px;
            height: 14px;
          }

          .touch-zapping-controls {
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            gap: 4px;
            z-index: 999;
          }

          .zap-nav-btn {
            padding: 6px 10px;
            font-size: 0.7rem;
            border-radius: 8px;
          }

          .zap-counter-badge {
            font-size: 0.65rem;
            padding: 2px 6px;
          }

          .channel-osd {
            left: 8px;
            right: 8px;
            bottom: 6px;
            padding: 5px 10px;
          }

          .osd-ch-number {
            font-size: 1rem;
            padding-right: 8px;
          }

          .channel-osd h2 {
            font-size: 0.8rem;
          }

          .osd-program {
            font-size: 0.65rem;
            max-width: 60vw;
          }

          .fav-btn {
            width: 30px;
            height: 30px;
          }

          .exit-zen-btn {
            top: 8px;
            right: 8px;
            padding: 4px 10px;
            font-size: 0.7rem;
          }
        }
      `}</style>
    </div>

  );
}
