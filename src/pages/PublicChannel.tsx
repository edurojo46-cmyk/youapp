import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Share2, MessageSquare, Volume2, VolumeX, Radio, Calendar, 
  ExternalLink, Coffee, Heart, ShoppingBag, Check, Loader2, ArrowLeft 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateCurrentLiveProgram, type TVProgramItem, type SyncState } from '../utils/tvEngine';
import LiveChat from '../components/LiveChat';
import EmojiReactions from '../components/EmojiReactions';
import EmailGateModal from '../components/EmailGateModal';

export default function PublicChannel() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();

  const [channel, setChannel] = useState<any>(null);
  const [programming, setProgramming] = useState<TVProgramItem[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isEmailUnlocked, setIsEmailUnlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Carga inicial del canal y su programación
  useEffect(() => {
    const fetchChannelData = async () => {
      if (!idOrSlug) return;
      setLoading(true);
      setErrorMsg(null);

      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
        let channelData = null;

        if (isUUID) {
          const { data } = await supabase.from('channels').select('*').eq('id', idOrSlug).maybeSingle();
          channelData = data;
        }

        if (!channelData) {
          const { data } = await supabase.from('channels').select('*').eq('slug', idOrSlug).maybeSingle();
          channelData = data;
        }

        if (!channelData) {
          setErrorMsg("Canal no encontrado o el enlace es incorrecto.");
          setLoading(false);
          return;
        }

        setChannel(channelData);

        // Cargar programación del canal
        const { data: progData, error: progErr } = await supabase
          .from('programming')
          .select('*, videos(*)')
          .eq('channel_id', channelData.id)
          .order('created_at', { ascending: false });

        if (progErr || !progData || progData.length === 0) {
          setErrorMsg("Este canal aún no tiene videos programados.");
        } else {
          setProgramming(progData as TVProgramItem[]);
          const liveSync = calculateCurrentLiveProgram(progData as TVProgramItem[], channelData.is_24_7 !== false);
          setSyncState(liveSync);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "Error al cargar el canal");
      } finally {
        setLoading(false);
      }
    };

    fetchChannelData();
  }, [idOrSlug]);

  // Recalcular sincronización y avanzar automáticamente cuando termina el video actual
  useEffect(() => {
    if (programming.length === 0 || !channel || !syncState) return;

    // Calcular cuánto tiempo le queda al video actual
    const currentDurSec = syncState.currentProgram.videos?.duration
      ? (syncState.currentProgram.videos.duration.split(':').length === 3
          ? Number(syncState.currentProgram.videos.duration.split(':')[0]) * 3600 + Number(syncState.currentProgram.videos.duration.split(':')[1]) * 60 + Number(syncState.currentProgram.videos.duration.split(':')[2])
          : Number(syncState.currentProgram.videos.duration.split(':')[0]) * 60 + Number(syncState.currentProgram.videos.duration.split(':')[1]))
      : 300;

    const remainingSec = Math.max(1, currentDurSec - syncState.offsetSeconds);

    const timer = setTimeout(() => {
      const liveSync = calculateCurrentLiveProgram(programming, channel.is_24_7 !== false);
      setSyncState(liveSync);
    }, remainingSec * 1000);

    return () => clearTimeout(timer);
  }, [programming, channel, syncState?.currentProgram?.id]);

  const handleShare = async () => {
    const shareData = {
      title: `${channel?.name || 'Canal de TV'} - YouApp 24/7`,
      text: `¡Mira la transmisión en vivo 24/7 de ${channel?.name || 'este canal'} en YouApp!`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // Fallback a clipboard si el usuario cancela o falla
      }
    }

    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const getIconForLink = (title: string, icon?: string) => {
    const t = (title + ' ' + (icon || '')).toLowerCase();
    if (t.includes('cafe') || t.includes('coffee') || t.includes('cafecito')) return <Coffee size={14} />;
    if (t.includes('patreon') || t.includes('donar') || t.includes('apoyo')) return <Heart size={14} />;
    if (t.includes('tienda') || t.includes('merch') || t.includes('shop')) return <ShoppingBag size={14} />;
    return <ExternalLink size={14} />;
  };

  if (loading) {
    return (
      <div className="center-screen">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p style={{ marginTop: '16px', color: 'rgba(255,255,255,0.7)' }}>Sintonizando canal en vivo...</p>
      </div>
    );
  }

  if (errorMsg || !channel || !syncState) {
    return (
      <div className="center-screen">
        <h2>📺 {channel?.name || "Canal de TV"}</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>{errorMsg || "Transmisión no disponible"}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '20px' }}>
          <ArrowLeft size={18} style={{ marginRight: '8px' }} /> Ir a YouApp
        </button>
      </div>
    );
  }

  const currentVideo = syncState.currentProgram.videos;
  const rawVideoId = currentVideo.id.replace('yt-', '');

  const handleSelectProgram = (selectedItem: TVProgramItem) => {
    const selectedIdx = programming.findIndex(p => p.id === selectedItem.id);
    const nextItem = programming[(selectedIdx + 1) % programming.length];

    setSyncState({
      currentProgram: selectedItem,
      offsetSeconds: 0,
      nextProgram: nextItem,
      totalCycleSeconds: syncState?.totalCycleSeconds || 300
    });
    setShowSchedule(false);
  };

  return (
    <div className="public-channel-container">
      {/* Reproductor de Video en Vivo Sincronizado */}
      <div className="tv-viewport">
        <iframe
          key={`${rawVideoId}_${syncState.offsetSeconds}_${syncState.currentProgram.id}`}
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${rawVideoId}?autoplay=1&mute=${isMuted ? 1 : 0}&start=${syncState.offsetSeconds}&controls=1`}
          title={currentVideo.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="tv-iframe"
        />

        {/* Botón de Sonido Flotante si está silenciado */}
        {isMuted && (
          <button 
            onClick={() => setIsMuted(false)} 
            className="unmute-floating-btn"
          >
            <VolumeX size={20} />
            <span>Toca para activar sonido</span>
          </button>
        )}
      </div>

      {/* Banner de Monetización / CTA del Creador */}
      {channel.banner_cta && (
        <div className="creator-cta-banner glass-panel">
          <span>📢 {channel.banner_cta}</span>
        </div>
      )}

      {/* Barra de Control y Branding Superior */}
      <header className="channel-topbar glass-panel">
        <div className="brand-group">
          <button className="back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <div className="channel-meta">
            <div className="live-tag">
              <Radio size={12} className="pulse-icon" />
              <span>EN VIVO 24/7</span>
            </div>
            <h2>{channel.name}</h2>
          </div>
        </div>

        <div className="action-group">
          {/* Botones de Monetización del Creador */}
          {channel.custom_links && channel.custom_links.length > 0 && (
            <div className="creator-links">
              {channel.custom_links.map((link: any, idx: number) => (
                <a 
                  key={idx} 
                  href={link.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="creator-link-pill"
                >
                  {getIconForLink(link.title, link.icon)}
                  <span>{link.title}</span>
                </a>
              ))}
            </div>
          )}

          <button 
            className={`btn-icon-glass ${showSchedule ? 'active' : ''}`} 
            onClick={() => setShowSchedule(!showSchedule)}
            title="Ver Grilla de Programación"
          >
            <Calendar size={18} />
          </button>

          <button 
            className={`btn-icon-glass ${showChat ? 'active' : ''}`} 
            onClick={() => setShowChat(!showChat)}
            title="Chat en Vivo"
          >
            <MessageSquare size={18} />
          </button>

          <button 
            className="btn-icon-glass share-btn" 
            onClick={handleShare}
            title="Compartir Canal"
          >
            {copiedLink ? <Check size={18} color="#10b981" /> : <Share2 size={18} />}
            {copiedLink && <span className="toast-copied">¡Copiado!</span>}
          </button>
        </div>
      </header>

      {/* Información del Video Actual en Vivo (Inferior) */}
      <footer className="channel-bottom-info glass-panel">
        <div className="now-playing">
          <span className="playing-label">ESTÁS VIENDO:</span>
          <h3 dangerouslySetInnerHTML={{ __html: currentVideo.title }}></h3>
          <p>{currentVideo.author} • Duración aprox: {currentVideo.duration || '5:00'}</p>
        </div>

        {syncState.nextProgram && (
          <div className="up-next">
            <span className="next-label">A CONTINUACIÓN:</span>
            <p className="next-title" dangerouslySetInnerHTML={{ __html: syncState.nextProgram.videos?.title || '' }}></p>
          </div>
        )}
      </footer>

      {/* Modal / Panel de Grilla de Programación */}
      {showSchedule && (
        <div className="schedule-drawer glass-panel">
          <div className="drawer-header">
            <h4>📺 Programación Completa de {channel.name}</h4>
            <button className="close-btn" onClick={() => setShowSchedule(false)}>✕</button>
          </div>
          <div className="schedule-list">
            {programming.map((item, idx) => (
              <div 
                key={item.id} 
                className={`schedule-card ${item.id === syncState.currentProgram.id ? 'is-live' : ''}`}
                onClick={() => handleSelectProgram(item)}
                style={{ cursor: 'pointer', transition: 'background 0.2s, transform 0.15s' }}
                title="Hacer clic para sintonizar este video ahora"
              >
                <span className="card-idx">{idx + 1}</span>
                <img src={item.videos.thumbnail} alt="" className="card-thumb" />
                <div className="card-info">
                  <h5 dangerouslySetInnerHTML={{ __html: item.videos.title }}></h5>
                  <p>{item.videos.author} • {item.videos.duration || '5:00'}</p>
                </div>
                {item.id === syncState.currentProgram.id ? (
                  <span className="badge-live-now">EN VIVO</span>
                ) : (
                  <span className="tune-btn-hint">▶ Sintonizar</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reacciones Emoji Flotantes en Tiempo Real */}
      <EmojiReactions channelId={channel.id} />

      {/* Modal de Captura de Email si el canal lo requiere */}
      {channel.require_email_gate && !isEmailUnlocked && (
        <EmailGateModal 
          channelId={channel.id} 
          channelName={channel.name} 
          onUnlocked={() => setIsEmailUnlocked(true)} 
        />
      )}

      {/* Chat en Vivo Component */}
      <LiveChat 
        channelId={channel.id} 
        channelName={channel.name} 
        isOpen={showChat} 
        onClose={() => setShowChat(false)} 
      />

      <style>{`
        .public-channel-container {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: #000;
          color: white;
        }

        .center-screen {
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0b0d14;
          color: white;
          padding: 20px;
          text-align: center;
        }

        .tv-viewport {
          position: absolute;
          inset: 0;
          z-index: 1;
        }

        .tv-iframe {
          width: 100%;
          height: 100%;
          border: none;
          pointer-events: auto;
        }

        .unmute-floating-btn {
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 30;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #6366f1;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 30px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          box-shadow: 0 4px 25px rgba(99, 102, 241, 0.6);
          transition: transform 0.2s, background 0.2s;
        }

        .unmute-floating-btn:hover {
          transform: translateX(-50%) scale(1.05);
          background: #4f46e5;
        }

        .creator-cta-banner {
          position: absolute;
          top: 65px;
          left: 20px;
          right: 20px;
          z-index: 25;
          padding: 8px 16px;
          border-radius: 10px;
          background: linear-gradient(90deg, rgba(99, 102, 241, 0.8), rgba(236, 72, 153, 0.8));
          color: white;
          font-weight: 600;
          font-size: 0.85rem;
          text-align: center;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
          animation: pulseBanner 3s infinite alternate;
        }

        @keyframes pulseBanner {
          from { opacity: 0.9; }
          to { opacity: 1; transform: scale(1.005); }
        }

        .channel-topbar {
          position: absolute;
          top: 15px;
          left: 15px;
          right: 15px;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          border-radius: 14px;
          background: rgba(15, 17, 26, 0.75);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .brand-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .back-btn {
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
        }

        .channel-meta h2 {
          font-size: 1.1rem;
          margin: 0;
          font-weight: 700;
        }

        .live-tag {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.65rem;
          font-weight: 800;
          color: #ef4444;
        }

        .pulse-icon {
          animation: pulseLive 1.5s infinite;
        }

        @keyframes pulseLive {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }

        .action-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .creator-links {
          display: flex;
          gap: 6px;
        }

        .creator-link-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          background: rgba(255, 255, 255, 0.12);
          color: white;
          text-decoration: none;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 20px;
          transition: background 0.2s, transform 0.2s;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .creator-link-pill:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: translateY(-2px);
        }

        .btn-icon-glass {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          transition: background 0.2s;
        }

        .btn-icon-glass.active, .btn-icon-glass:hover {
          background: #6366f1;
          border-color: #6366f1;
        }

        .toast-copied {
          position: absolute;
          top: 42px;
          right: 0;
          background: #10b981;
          color: white;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          white-space: nowrap;
        }

        .channel-bottom-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          min-height: 58px;
          background: linear-gradient(to top, rgba(11, 13, 20, 0.98) 0%, rgba(15, 17, 26, 0.92) 100%);
          backdrop-filter: blur(18px);
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 -6px 25px rgba(0, 0, 0, 0.7);
        }

        .now-playing {
          display: flex;
          align-items: center;
          gap: 12px;
          max-width: 80%;
          overflow: hidden;
        }

        .playing-label {
          font-size: 0.65rem;
          font-weight: 800;
          color: #6366f1;
          letter-spacing: 1px;
          background: rgba(99, 102, 241, 0.15);
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .now-playing h3 {
          font-size: 0.9rem;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: white;
        }

        .now-playing p {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0;
          white-space: nowrap;
        }

        .up-next {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          color: #a5b4fc;
          font-weight: 600;
          white-space: nowrap;
        }

        .schedule-drawer {
          position: absolute;
          top: 75px;
          right: 15px;
          width: 360px;
          max-height: calc(100vh - 170px);
          z-index: 45;
          border-radius: 16px;
          background: rgba(15, 17, 26, 0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .drawer-header h4 {
          margin: 0;
          font-size: 0.95rem;
        }

        .close-btn {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 1rem;
        }

        .schedule-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .schedule-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid transparent;
        }

        .schedule-card.is-live {
          background: rgba(99, 102, 241, 0.2);
          border-color: #6366f1;
        }

        .card-idx {
          font-size: 0.8rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
          width: 16px;
        }

        .card-thumb {
          width: 60px;
          height: 34px;
          border-radius: 4px;
          object-fit: cover;
        }

        .card-info {
          flex: 1;
          overflow: hidden;
        }

        .card-info h5 {
          margin: 0;
          font-size: 0.8rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-info p {
          margin: 2px 0 0 0;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .schedule-card:hover {
          background: rgba(255, 255, 255, 0.12);
          transform: translateX(4px);
        }

        .tune-btn-hint {
          font-size: 0.7rem;
          font-weight: 700;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.2);
          padding: 4px 8px;
          border-radius: 6px;
          white-space: nowrap;
        }

        .badge-live-now {
          font-size: 0.6rem;
          font-weight: 800;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.15);
          padding: 2px 6px;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .creator-links {
            display: none;
          }
          .schedule-drawer {
            left: 15px;
            right: 15px;
            width: auto;
          }
          .up-next {
            display: none;
          }
          .now-playing {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
