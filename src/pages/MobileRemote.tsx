import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { 
  Power, Volume2, VolumeX, Tv, Moon, Grid, Image, 
  Send, Sparkles, Coffee, Smile, Film, EyeOff, Radio, ChevronUp, ChevronDown, Check, Cast, ChevronLeft, Search
} from 'lucide-react';


import { supabase } from '../lib/supabase';
import CastModal from '../components/CastModal';
import { RemoteBridge } from '../utils/remoteBridge';
import { VERIFIED_24_7_LIVE_CHANNELS, fetchTopViewedVideosByMood } from '../lib/youtube';

const EMOJIS = ['🔥', '❤️', '👏', '🚀', '🤯', '🍿', '😂', '🎉'];

const MOODS = [
  { id: 'all', label: '📺 Todos' },
  { id: 'focus', label: '☕ Focus' },
  { id: 'relax', label: '🧘 Relax' },
  { id: 'learn', label: '🧠 Aprender' },
  { id: 'humor', label: '😂 Humor' },
  { id: 'cinema', label: '🍿 Cine' },
];

export default function MobileRemote() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
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
  const [pinInput, setPinInput] = useState('');
  const bridgeRef = useRef<RemoteBridge | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [showCastModal, setShowCastModal] = useState(false);
  const [lastAction, setLastAction] = useState<string>('Listo');
  const [chatMessage, setChatMessage] = useState('');
  const [selectedMood, setSelectedMood] = useState('all');
  const [channels, setChannels] = useState<any[]>(VERIFIED_24_7_LIVE_CHANNELS);
  const [channelIdx, setChannelIdx] = useState(0);
  const [syncedChannel, setSyncedChannel] = useState<any>(VERIFIED_24_7_LIVE_CHANNELS[0]);
  const [isCastMuted, setIsCastMuted] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);

  // Helper para enviar nuevo canal a Chromecast si está conectado
  const streamChannelToChromecast = (ch: any) => {
    if (!ch || !window.cast?.framework) return;
    try {
      const context = window.cast.framework.CastContext.getInstance();
      const castSession = context.getCurrentSession();
      if (!castSession || !window.chrome?.cast) return;

      const videoUrl = ch.videoUrl;
      const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
      const rawId = videoUrl.replace('https://www.youtube.com/embed/', '').replace('yt-', '').split('?')[0];

      if (isYouTube && rawId) {
        window.open(`https://www.youtube.com/watch?v=${rawId}`, '_blank');
        return;
      }

      let contentType = 'video/mp4';
      if (videoUrl.includes('.m3u8')) contentType = 'application/x-mpegurl';

      const mediaInfo = new window.chrome.cast.media.MediaInfo(videoUrl, contentType);
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = ch.name || 'YouApp TV';
      mediaInfo.metadata.subtitle = ch.currentVideoTitle || 'En Vivo';
      if (ch.thumbnail) {
        mediaInfo.metadata.images = [{ url: ch.thumbnail }];
      }

      const req = new window.chrome.cast.media.LoadRequest(mediaInfo);
      req.autoplay = true;
      castSession.loadMedia(req);
    } catch (e) {
      console.warn("Error cast to chromecast:", e);
    }
  };

  useEffect(() => {
    if (!activeSessionId) return;

    localStorage.setItem('youapp_remote_last_pin', activeSessionId);
    const bridge = new RemoteBridge(activeSessionId, 'remote');
    bridge.notifyConnected();
    setIsConnected(true);
    bridgeRef.current = bridge;

    bridge.onAction((action, payload) => {
      if (action === 'SYNC_STATE' && payload?.channel) {
        setSyncedChannel(payload.channel);
        if (payload.activeIndex !== undefined) setChannelIdx(payload.activeIndex);
        if (payload.moodId) setSelectedMood(payload.moodId);
      }
    });

    return () => {
      bridge.destroy();
    };
  }, [activeSessionId]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().length >= 4) {
      const pin = pinInput.trim();
      localStorage.setItem('youapp_remote_last_pin', pin);
      setActiveSessionId(pin);
      setShowPinChange(false);
    }
  };


  const sendAction = async (action: string, payload: any = {}) => {
    if (navigator.vibrate) {
      try { navigator.vibrate(40); } catch {}
    }

    setLastAction(action);
    setTimeout(() => setLastAction('Listo'), 1500);

    // 1. Enviar vía WebRTC / Supabase a la TV YouApp
    if (bridgeRef.current) {
      bridgeRef.current.sendAction(action, payload);
    }

    // 2. Controlar Chromecast directamente si está activo
    if (action === 'NEXT_CHANNEL') {
      const nextIdx = (channelIdx + 1) % channels.length;
      setChannelIdx(nextIdx);
      const nextCh = channels[nextIdx];
      setSyncedChannel(nextCh);
      streamChannelToChromecast(nextCh);
    } else if (action === 'PREV_CHANNEL') {
      const prevIdx = (channelIdx - 1 + channels.length) % channels.length;
      setChannelIdx(prevIdx);
      const prevCh = channels[prevIdx];
      setSyncedChannel(prevCh);
      streamChannelToChromecast(prevCh);
    } else if (action === 'SET_CHANNEL_INDEX') {
      const idx = payload?.index || 0;
      if (channels[idx]) {
        setChannelIdx(idx);
        setSyncedChannel(channels[idx]);
        streamChannelToChromecast(channels[idx]);
      }
    } else if (action === 'TOGGLE_MUTE') {
      setIsCastMuted(prev => {
        const next = !prev;
        try {
          const castSession = window.cast?.framework?.CastContext?.getInstance()?.getCurrentSession();
          if (castSession) castSession.setMute(next);
        } catch {}
        return next;
      });
    } else if (action === 'SEARCH_QUERY' && payload?.query) {
      try {
        const results = await fetchTopViewedVideosByMood(payload.query);
        if (results && results.length > 0) {
          setChannels(results);
          setChannelIdx(0);
          setSyncedChannel(results[0]);
          streamChannelToChromecast(results[0]);
        }
      } catch {}
    }
  };


  // Pantalla de Ingreso de PIN
  if (!activeSessionId) {
    return (
      <div className="mobile-remote-viewport pin-login-screen">
        <header className="remote-header">
          <div className="brand">
            <button className="remote-back-btn" onClick={() => navigate('/live')} title="Volver a la App">
              <ChevronLeft size={22} />
            </button>
            <Tv size={20} className="text-accent" />
            <span className="brand-name">YOUAPP REMOTE</span>
          </div>
        </header>

        <div className="pin-card glass-panel">
          <h2>Conectar con tu Televisor</h2>
          <p>Ingresa el código PIN de 4 dígitos que aparece en tu pantalla de TV:</p>

          <form onSubmit={handlePinSubmit} className="pin-form">
            <input
              type="tel"
              maxLength={4}
              placeholder="0000"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              className="pin-input"
              autoFocus
            />

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '12px' }}>
              Vincular Control Remoto
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    sendAction('SEND_CHAT', { text: chatMessage.trim() });
    setChatMessage('');
  };


  return (
    <div className="mobile-remote-viewport">
      {/* Encabezado del Control con Flecha de Volver */}
      <header className="remote-header">
        <div className="brand">
          <button 
            className="remote-back-btn" 
            onClick={() => setActiveSessionId(null)} 
            title="Cambiar de TV / Desconectar"
          >
            <ChevronLeft size={22} />
          </button>
          <Tv size={18} className="text-accent" />
          <span className="brand-name">YOUAPP REMOTE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="cast-header-btn" 
            onClick={() => setShowCastModal(true)} 
            title="Transmitir pantalla a la TV"
          >
            <Cast size={16} />
            <span>Cast</span>
          </button>
          <div className={`connection-status ${isConnected ? 'online' : 'offline'}`}>
            <span className="dot">●</span>
            <span>{isConnected ? 'TV CONECTADA' : 'CONECTANDO...'}</span>
          </div>
        </div>
      </header>


      {/* Pantalla OSD / Monitor de la TV en el Control */}
      <div className="remote-screen-display glass-panel">
        <div className="screen-top">
          <span className="tv-label">SINTONIZANDO EN TELEVISIÓN</span>
          <span className="action-pill">{lastAction}</span>
        </div>
        <div className="screen-info">
          {syncedChannel ? (
            <>
              <h3>{syncedChannel.name}</h3>
              <p>{syncedChannel.currentVideoTitle || syncedChannel.category || 'Transmisión en Vivo'}</p>
            </>
          ) : (
            <>
              <h3>Sesión TV: #{activeSessionId?.slice(-4).toUpperCase()}</h3>
              <p>Toca cualquier botón para controlar la TV en vivo</p>
            </>
          )}
        </div>
      </div>

      {/* Buscador de Canales / En Vivo Directo desde el Celular */}
      <form 
        className="remote-tv-search-bar glass-panel" 
        onSubmit={(e) => {
          e.preventDefault();
          const q = (e.currentTarget.elements.namedItem('tvQuery') as HTMLInputElement)?.value;
          if (q && q.trim()) {
            sendAction('SEARCH_QUERY', { query: q.trim() });
          }
        }}
      >
        <Search size={18} className="text-accent" />
        <input 
          type="text" 
          name="tvQuery" 
          placeholder="Escribir canal para la tele (ej: Carnaval Stream)..." 
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Sintonizar
        </button>
      </form>


      {/* Controles Principales de Navegación y Volumen */}
      <div className="main-controls-cluster">
        {/* Columna Canal (CH) */}
        <div className="rocker-col">
          <span className="col-label">CANAL</span>
          <div className="rocker-btn-group">
            <button className="rocker-btn" onClick={() => sendAction('NEXT_CHANNEL')}>
              <ChevronUp size={28} />
              <span>CH +</span>
            </button>
            <button className="rocker-btn" onClick={() => sendAction('PREV_CHANNEL')}>
              <ChevronDown size={28} />
              <span>CH -</span>
            </button>
          </div>
        </div>

        {/* Botón Central de Encendido, Buscar y Mudo */}
        <div className="center-actions">
          <button className="power-btn" onClick={() => sendAction('TOGGLE_SLEEP')} title="Apagar / Encender TV">
            <Power size={22} />
          </button>
          <button className="search-remote-btn" onClick={() => sendAction('TOGGLE_SEARCH')} title="Buscar Canales en la TV">
            <Search size={18} />
            <span>BUSCAR</span>
          </button>
          <button className="mute-btn" onClick={() => sendAction('TOGGLE_MUTE')} title="Silenciar / Activar Sonido">
            <Volume2 size={18} />
            <span>MUTE</span>
          </button>
        </div>


        {/* Columna Funciones Especiales */}
        <div className="rocker-col">
          <span className="col-label">MODOS</span>
          <div className="rocker-btn-group">
            <button className="mode-quad-btn" onClick={() => sendAction('TOGGLE_QUAD')}>
              <Grid size={22} />
              <span>4 EN 1</span>
            </button>
            <button className="mode-zen-btn" onClick={() => sendAction('TOGGLE_ZEN')}>
              <EyeOff size={20} />
              <span>ZEN</span>
            </button>
          </div>
        </div>
      </div>

      {/* Teclado Numérico Directo */}
      <div className="keypad-section glass-panel">
        <div className="keypad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button key={num} className="num-key" onClick={() => sendAction('SET_CHANNEL_INDEX', { index: num - 1 })}>
              {num}
            </button>
          ))}
          <button className="num-key special" onClick={() => sendAction('TOGGLE_EPG')}>
            GUÍA
          </button>
          <button className="num-key" onClick={() => sendAction('SET_CHANNEL_INDEX', { index: 9 })}>
            0
          </button>
          <button className="num-key special" onClick={() => sendAction('TOGGLE_INFO')}>
            INFO
          </button>
        </div>
      </div>

      {/* Selector de Mood TV */}
      <div className="mood-section">
        <span className="section-title">CATEGORÍAS DE TV (30 MÁS VISTOS)</span>
        <div className="mood-buttons-grid">
          {MOODS.map((m) => (
            <button
              key={m.id}
              className={`mood-btn ${selectedMood === m.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedMood(m.id);
                sendAction('SET_MOOD', { moodId: m.id });
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lanzador de Emojis a la Pantalla de la TV */}
      <div className="emoji-blaster-section glass-panel">
        <span className="section-title">🔥 DISPARAR EMOJIS A LA TELEVISIÓN</span>
        <div className="emojis-row">
          {EMOJIS.map((emoji) => (
            <button key={emoji} className="emoji-blast-btn" onClick={() => sendAction('SEND_EMOJI', { emoji })}>
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Modo Ambiente 4K */}
      <div className="ambient-section">
        <span className="section-title">🖼️ CUADROS VIVOS 4K</span>
        <div className="ambient-grid">
          <button className="amb-btn" onClick={() => sendAction('TOGGLE_AMBIENT')}>
            🔥 Chimenea / Acuario 4K
          </button>
        </div>
      </div>

      {/* Teclado de Chat para la TV */}
      <form className="remote-chat-form glass-panel" onSubmit={handleSendChat}>
        <input
          type="text"
          placeholder="Escribir mensaje en la tele..."
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
        />
        <button type="submit" className="send-chat-btn">
          <Send size={16} />
        </button>
      </form>

      {/* Modal de Transmisión a la TV (Google Cast / Smart TV) */}
      <CastModal
        isOpen={showCastModal}
        onClose={() => setShowCastModal(false)}
        currentChannel={syncedChannel}
        pin={activeSessionId || ''}
      />


      <style>{`
        .cast-header-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(99, 102, 241, 0.2);
          border: 1px solid rgba(99, 102, 241, 0.4);
          color: #a5b4fc;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }

        .cast-header-btn:active {
          background: #6366f1;
          color: white;
        }

        .mobile-remote-viewport {
          min-height: 100vh;
          max-width: 440px;
          margin: 0 auto;
          background: #05070c;
          color: white;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
        }

        .remote-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .remote-back-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
        }

        .remote-back-btn:active {
          transform: scale(0.9);
          background: rgba(99, 102, 241, 0.4);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .brand-name {
          font-weight: 900;
          font-size: 0.9rem;
          letter-spacing: 1px;
          color: #a5b4fc;
        }

        /* PIN Login Screen */
        .pin-login-screen {
          justify-content: center;
          align-items: center;
        }

        .pin-card {
          width: 100%;
          padding: 24px;
          border-radius: 20px;
          text-align: center;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 15px 40px rgba(0,0,0,0.7);
        }

        .pin-card h2 {
          font-size: 1.25rem;
          margin-bottom: 6px;
        }

        .pin-card p {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 20px;
        }

        .pin-input {
          width: 100%;
          padding: 16px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.6);
          border: 2px solid #6366f1;
          color: white;
          font-family: monospace;
          font-size: 2.4rem;
          font-weight: 900;
          text-align: center;
          letter-spacing: 12px;
          outline: none;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.7rem;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 20px;
        }

        .connection-status.online {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .connection-status.offline {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .remote-screen-display {
          background: rgba(15, 17, 26, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 14px;
          padding: 12px 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }

        .screen-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .tv-label {
          font-size: 0.65rem;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 1px;
        }

        .action-pill {
          font-size: 0.65rem;
          font-weight: 800;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.2);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .screen-info h3 {
          margin: 0;
          font-size: 1.1rem;
          color: white;
        }

        .screen-info p {
          margin: 2px 0 0 0;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
        }

        /* Cluster Principal */
        .main-controls-cluster {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          align-items: center;
        }

        .rocker-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .col-label {
          font-size: 0.65rem;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 1px;
        }

        .rocker-btn-group {
          width: 100%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .rocker-btn, .mode-quad-btn, .mode-zen-btn {
          width: 100%;
          padding: 16px 8px;
          background: none;
          border: none;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 0.75rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }

        .rocker-btn:first-child, .mode-quad-btn {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .rocker-btn:active, .mode-quad-btn:active, .mode-zen-btn:active {
          background: rgba(99, 102, 241, 0.4);
          transform: scale(0.95);
        }

        .center-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .power-btn {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.2);
          border: 2px solid #ef4444;
          color: #ef4444;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3);
          transition: transform 0.15s;
        }

        .power-btn:active {
          transform: scale(0.9);
          background: #ef4444;
          color: white;
        }

        .search-remote-btn {
          width: 100%;
          padding: 8px 4px;
          border-radius: 12px;
          background: rgba(99, 102, 241, 0.2);
          border: 1px solid rgba(99, 102, 241, 0.4);
          color: #a5b4fc;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          font-size: 0.65rem;
          font-weight: 800;
          cursor: pointer;
        }

        .search-remote-btn:active {
          background: #6366f1;
          color: white;
          transform: scale(0.95);
        }

        .mute-btn {
          width: 100%;
          padding: 8px 4px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          font-size: 0.65rem;
          font-weight: 800;
          cursor: pointer;
        }

        .mute-btn:active {
          background: #6366f1;
        }

        /* Teclado Numérico */
        .keypad-section {
          background: rgba(15, 17, 26, 0.7);
          border-radius: 16px;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .keypad-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .num-key {
          padding: 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: white;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }

        .num-key.special {
          font-size: 0.75rem;
          color: #a5b4fc;
        }

        .num-key:active {
          background: #6366f1;
          transform: scale(0.92);
        }

        /* Secciones */
        .section-title {
          display: block;
          font-size: 0.65rem;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .mood-buttons-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .mood-btn {
          padding: 10px 6px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.85);
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }

        .mood-btn.active {
          background: #6366f1;
          color: white;
          border-color: #6366f1;
        }

        .mood-btn:active {
          transform: scale(0.95);
        }

        /* Emojis */
        .emojis-row {
          display: flex;
          justify-content: space-between;
          gap: 6px;
        }

        .emoji-blast-btn {
          flex: 1;
          padding: 8px 4px;
          font-size: 1.4rem;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.1s;
        }

        .emoji-blast-btn:active {
          transform: scale(1.3);
          background: rgba(99, 102, 241, 0.3);
        }

        .ambient-grid .amb-btn {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
        }

        .ambient-grid .amb-btn:active {
          background: #6366f1;
        }

        .remote-chat-form {
          display: flex;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 14px;
          background: rgba(15, 17, 26, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .remote-chat-form input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          font-size: 0.85rem;
          outline: none;
        }

        .send-chat-btn {
          background: #6366f1;
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
