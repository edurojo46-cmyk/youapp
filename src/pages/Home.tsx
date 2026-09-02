import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Tv, Grid, Radio, Plus, Play, Brain, BarChart2, Bookmark,
  SplitSquareHorizontal, Film, GraduationCap, List, PlaySquare, Star, User, Calendar, Mic, Settings,
  SkipBack, Pause, SkipForward, Maximize, Bell, Sparkles, ChevronRight, ChevronLeft, MonitorPlay, Video, Music, Heart, Clock
} from 'lucide-react';
import { YOUTUBE_VIDEO_POOLS } from '../lib/youtube';
import { UNIVERSAL_CATALOG } from '../lib/universalChannels';
import { useStore } from '../store/useStore';

const HUD_ITEMS = [
  { id: 'agrandar', icon: Maximize, label: 'Agrandar', route: '/programartv' },
  { id: 'buscar', icon: Search, label: 'Buscar', route: '/search' },
  { id: 'misenal', icon: Bookmark, label: 'Mi Señal', route: '/create-signal' },
  { id: 'programacion', icon: Calendar, label: 'Programación', route: '/program' },
  { id: 'envivo', icon: Radio, label: 'En Vivo', route: '/live' },
  { id: 'algoritmo', icon: Brain, label: 'Mi Algoritmo', route: '/my-algorithm' },
  { id: 'remote', icon: Tv, label: 'You Remote', route: '/remote' },
  { id: 'listas', icon: List, label: 'Listas', route: '/my-lists' },
  { id: 'momentos', icon: Clock, label: 'Momentos', route: '/moments' },
  { id: 'favoritos', icon: Heart, label: 'Favoritos', route: '/favorites' },
];

function HomeIcon(props: any) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useStore();
  
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const mediaRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.8;
      scrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Video properties for Nature theme
  const audioSource = ""; // Eliminado para evitar 403 y conflictos de AbortError cruzado
  const videoSource = "https://assets.mixkit.co/videos/preview/mixkit-beautiful-mountain-landscape-with-a-river-4235-large.mp4"; // Bright Mountain Video

  const handlePlay = () => {
    setIsPlaying(true);
    if (audioSource && mediaRef.current) {
      mediaRef.current.play().catch(e => console.warn("Audio autoplay blocked:", e));
    }
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      const p = (mediaRef.current.currentTime / mediaRef.current.duration) * 100;
      setProgress(isNaN(p) ? 0 : p);
    }
  };

  return (
    <div className="home-layout">
      {/* ── TOP NAV ── */}
      <nav className="home-navbar">
        <div className="logo-area">
          <span className="logo-you">Y O U</span>
          <span className="logo-app">A P P</span>
          <span className="logo-tv">T V</span>
        </div>
        
        <div className="nav-links">
          <button className="nav-link active" onClick={() => navigate('/')}>Inicio</button>
          <button className="nav-link" onClick={() => navigate('/search')}>Explorar</button>
          <button className="nav-link" onClick={() => navigate('/live')}>En Vivo</button>
          <button className="nav-link" onClick={() => navigate('/my-algorithm')}>Mi Señal</button>
        </div>

        <div className="user-area">
          <button className="icon-btn">
            <Bell size={20} />
          </button>
          {(user as any)?.avatar_url ? (
            <img src={(user as any).avatar_url} alt="Profile" className="avatar" />
          ) : (
            <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&q=80" alt="Profile" className="avatar" />
          )}
        </div>
      </nav>

      {/* ── SEARCH BAR ── */}
      <div className="home-search-container">
        <div className="search-input-wrapper">
          <Search size={20} className="search-icon" />
          <input 
            type="text" 
            placeholder="¿Qué querés ver hoy?" 
            className="search-input"
          />
          <button className="btn-ai-search" onClick={() => navigate('/search')}>
            <Sparkles size={16} /> Buscar con IA
          </button>
        </div>
      </div>

      {/* ── MAIN MIDDLE SECTION ── */}
      <div className="home-middle-section">
        
        <div className="left-welcome" style={{ visibility: 'hidden' }}>
          {/* Espaciador para mantener el aro centrado */}
        </div>

        {/* ── DIAL (ARO) ── */}
        <div className="center-dial">
          <div className="dial-wrapper">
            
            {/* El Aro Físico (10 segmentos) */}
            <div className="dial-physical-ring">
              {Array.from({ length: 10 }).map((_, i) => {
                // 10 segmentos = 36 grados cada uno
                // Desfasamos la mitad (18 grados) para que el ícono quede en el centro del segmento
                const angleDeg = -90 + 18 + (i * 36);
                return (
                  <div 
                    key={`spoke-${i}`} 
                    className="dial-spoke"
                    style={{ transform: `rotate(${angleDeg}deg)` }}
                  />
                );
              })}
            </div>

            {/* Anillo de Íconos y Textos */}
            <div className="dial-ring">
              {HUD_ITEMS.map((item, index) => {
                // 10 items -> 36 grados cada uno
                const angleDeg = -90 + (index * 36);
                const angleRad = (angleDeg * Math.PI) / 180;
                
                // Radio exacto del centro del borde físico
                const ringRadius = 315;
                const x = Math.cos(angleRad) * ringRadius;
                const y = Math.sin(angleRad) * ringRadius;

                // Adjust rotation for text so it faces up or reads nicely
                // For simplicity, we just keep icons upright
                return (
                  <div 
                    key={item.id}
                    className="dial-segment-icon"
                    style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
                  >
                    <button 
                      className={`dial-icon-btn ${hoveredItem === item.id || item.id === 'inicio' ? 'active' : ''}`}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={() => navigate(item.route)}
                    >
                      <item.icon size={28} strokeWidth={1.5} className="ring-icon" />
                      <span className="ring-label">{item.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Center Orb (Video Player) */}
            <div className="dial-center-orb">
              <svg className="circular-progress-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="49" className="progress-bg" />
                <circle 
                  cx="50" cy="50" r="49" 
                  className="progress-value" 
                  style={{ strokeDashoffset: 307.8 - (307.8 * progress) / 100 }} 
                />
              </svg>
              
              <div className="orb-bg">
                <iframe 
                  className="orb-bg-video"
                  src="https://www.youtube.com/embed/BHACKCNDMW8?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=BHACKCNDMW8"
                  allow="autoplay; encrypted-media"
                  style={{ width: '150%', height: '150%', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', border: 'none' }}
                />
                <audio 
                  ref={mediaRef}
                  src={audioSource}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />
                
                <div className={`orb-overlay ${isPlaying ? 'playing' : ''}`}>
                  {!isPlaying ? (
                    <button className="orb-play-btn" onClick={handlePlay}>
                      <Play size={40} fill="currentColor" />
                    </button>
                  ) : (
                    <button className="orb-play-btn hidden" onClick={() => {
                      mediaRef.current?.pause();
                      setIsPlaying(false);
                    }}>
                      <Pause size={40} fill="currentColor" />
                    </button>
                  )}
                  
                  <div className="orb-info-bottom">
                    <h3>Naturaleza Relajante</h3>
                    <p>En Vivo · Sonidos Ambientales</p>
                    <div className="progress-times">
                      <span>{Math.floor((mediaRef.current?.currentTime || 0) / 60)}:{(Math.floor(mediaRef.current?.currentTime || 0) % 60).toString().padStart(2, '0')}</span>
                      <span>{Math.floor((mediaRef.current?.duration || 0) / 60) || 0}:{(Math.floor(mediaRef.current?.duration || 0) % 60 || 0).toString().padStart(2, '0')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="right-card-area">
           <div className="floating-ia-card">
              <div className="card-header">
                <Sparkles size={20} className="text-blue" /> 
                <div className="card-titles">
                   <h4>IA</h4>
                   <span>Tu asistente inteligente</span>
                </div>
              </div>
              <p>Descubrí contenido<br/>hecho para vos.</p>
              <ChevronRight size={20} className="card-chevron" />
           </div>
        </div>

      </div>

      {/* ── BOTTOM GRID SECTION ── */}
      <div className="home-bottom-grid">
        {/* Col 1 */}
        <div className="grid-col col-segui-viendo">
          <div className="section-header">
            <h3>Seguí viendo</h3>
            <ChevronRight size={16} className="text-gray" />
          </div>
          {(() => {
            const vid = YOUTUBE_VIDEO_POOLS.ciencia[1] || YOUTUBE_VIDEO_POOLS.musica[4];
            return (
              <div 
                className="video-card-unified" 
                onClick={() => navigate(`/ai-summary/yt-${vid.id}`)}
              >
                <div className="img-wrapper">
                  <img src={`https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`} alt={vid.title} />
                  <span className="time-badge">{vid.duration}</span>
                </div>
                <div className="card-info">
                  <h4>{vid.title}</h4>
                  <p>{vid.author} · {vid.time}</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Col 2 */}
        <div className="grid-col col-tu-programacion">
          <div className="section-header">
            <h3>Tu programación</h3>
            <ChevronRight size={16} className="text-gray" />
          </div>
          <div className="program-list-card">
            {UNIVERSAL_CATALOG.slice(0, 3).map((ch, idx) => (
              <div 
                key={ch.id} 
                className={`program-item ${idx === 0 ? 'active' : ''}`}
                onClick={() => navigate(`/ai-summary/yt-${ch.videoId || ch.id}`)}
                style={{ cursor: 'pointer' }}
              >
                 {idx === 0 && <div className="active-indicator"></div>}
                 <span className="prog-time">{idx === 0 ? 'AHORA' : `${21 + idx}:00`}</span>
                 <div className="prog-info">
                   <h4 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{ch.currentVideoTitle || ch.name}</h4>
                   <p>{ch.name}</p>
                 </div>
              </div>
            ))}
          </div>
        </div>

        {/* Col 3 */}
        <div className="grid-col col-explorar">
          <div className="section-header">
            <h3>Explorar</h3>
            <ChevronRight size={16} className="text-gray" />
          </div>
          <div className="explore-list">
             <button className="explore-btn" onClick={() => navigate('/search')}><Film size={18} className="text-gray"/> <span>Películas</span> <ChevronRight size={16} className="arrow"/></button>
             <button className="explore-btn" onClick={() => navigate('/search')}><MonitorPlay size={18} className="text-gray"/> <span>Series</span> <ChevronRight size={16} className="arrow"/></button>
             <button className="explore-btn" onClick={() => navigate('/search')}><Video size={18} className="text-gray"/> <span>Documentales</span> <ChevronRight size={16} className="arrow"/></button>
             <button className="explore-btn" onClick={() => navigate('/search')}><Music size={18} className="text-gray"/> <span>Música</span> <ChevronRight size={16} className="arrow"/></button>
          </div>
        </div>

        {/* Col 4 */}
        <div className="grid-col col-recomendado">
          <div className="section-header">
            <h3>Recomendado para vos</h3>
            <div className="carousel-controls" style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => scroll('left')} 
                style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
              >
                <ChevronLeft size={16} className="text-gray" />
              </button>
              <button 
                onClick={() => scroll('right')}
                style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
              >
                <ChevronRight size={16} className="text-gray" />
              </button>
            </div>
          </div>
          <div className="horizontal-scroll" ref={scrollRef} style={{ scrollBehavior: 'smooth' }}>
            {Object.values(YOUTUBE_VIDEO_POOLS).flat().slice(0, 15).map((vid, i) => (
              <div 
                key={`${vid.id}-${i}`} 
                className="video-card-unified"
                onClick={() => navigate(`/ai-summary/yt-${vid.id}`)}
                style={{ minWidth: '180px' }}
              >
                 <div className="img-wrapper">
                   <img src={`https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`} alt={vid.title} />
                   <span className="time-badge">{vid.duration}</span>
                 </div>
                 <div className="card-info">
                    <h4>{vid.title}</h4>
                    <p>{vid.author}</p>
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        /* NEUMORPHIC / SKEUOMORPHIC LIGHT THEME */
        .home-layout {
          min-height: 100vh;
          background: #e2e8f0; /* Subtle light gray-blue background */
          background: radial-gradient(circle at 50% -20%, #f1f5f9, #cbd5e1);
          color: #1e293b;
          display: flex;
          flex-direction: column;
          font-family: 'Outfit', system-ui, sans-serif;
          overflow-x: hidden;
          padding-bottom: 40px;
        }

        /* ── NAVBAR ── */
        .home-navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 48px;
        }

        .logo-area {
          display: flex;
          gap: 6px;
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: 4px;
        }
        .logo-tv { color: #3b82f6; }

        .nav-links {
          display: flex;
          gap: 32px;
        }
        .nav-link {
          background: none;
          border: none;
          color: #64748b;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          padding-bottom: 8px;
        }
        .nav-link.active {
          color: #0f172a;
          font-weight: 600;
        }
        .nav-link.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 10%;
          width: 80%;
          height: 3px;
          background: #3b82f6;
          border-radius: 3px;
        }

        .user-area {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .icon-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
        }
        .avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }

        /* ── SEARCH BAR ── */
        .home-search-container {
          display: flex;
          justify-content: center;
          margin-top: 10px;
          margin-bottom: 20px;
        }
        .search-input-wrapper {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border-radius: 99px;
          padding: 6px 6px 6px 20px;
          width: 600px;
          box-shadow: 
            inset 0 2px 4px rgba(0,0,0,0.02),
            0 4px 10px rgba(0,0,0,0.05),
            0 0 0 1px rgba(255,255,255,0.7);
        }
        .search-icon { color: #94a3b8; }
        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          padding: 0 16px;
          font-size: 1rem;
          color: #334155;
          outline: none;
        }
        .search-input::placeholder { color: #94a3b8; }
        
        .btn-ai-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          border-radius: 99px;
          padding: 10px 20px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-ai-search:hover {
          background: #dbeafe;
        }

        /* ── MIDDLE SECTION ── */
        .home-middle-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 60px;
          margin-top: 20px;
          position: relative;
        }

        .left-welcome {
          flex: 1;
          max-width: 300px;
          z-index: 10;
        }
        .left-welcome h2 {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1.1;
          color: #334155;
          margin-bottom: 16px;
        }
        .left-welcome p {
          font-size: 1.1rem;
          color: #64748b;
          line-height: 1.4;
          margin-bottom: 24px;
        }
        .btn-outline-ai {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 12px 24px;
          border-radius: 99px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          transition: all 0.2s;
        }
        .btn-outline-ai:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.08);
        }
        .text-blue { color: #3b82f6; }

        /* ── CENTER DIAL (SKEUOMORPHIC RING) ── */
        .center-dial {
          flex: 2;
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }

        .dial-wrapper {
          position: relative;
          width: 680px;
          height: 680px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0; /* Evitar que se comprima y se vuelva ovalado */
        }

        /* The Metallic Outer Ring */
        .dial-physical-ring {
          position: absolute;
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 50px solid #f8fafc;
          box-shadow: 
            inset 0 4px 10px rgba(0,0,0,0.05), /* Inner shadow */
            inset 0 -4px 10px rgba(255,255,255,1), /* Inner highlight */
            0 20px 40px rgba(0,0,0,0.1), /* Outer drop shadow */
            0 0 0 1px rgba(255,255,255,0.8), /* Outer crisp edge */
            inset 0 0 0 1px rgba(226,232,240,0.8); /* Inner crisp edge */
          background: linear-gradient(135deg, #ffffff, #e2e8f0); /* Metallic gradient */
          z-index: 1;
        }

        /* The dividers for the 10 segments */
        .dial-spoke {
          position: absolute;
          top: -50px; left: calc(50% - 1px);
          width: 2px; height: 50px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(0,0,0,0.05));
          transform-origin: center 340px; /* 680/2 */
          z-index: 2;
        }

        /* The icons placed on the ring */
        .dial-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          z-index: 5;
          pointer-events: none;
        }

        .dial-segment-icon {
          position: absolute;
          transform: translate(-50%, -50%);
          pointer-events: auto;
        }

        .dial-icon-btn {
          background: transparent;
          border: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }
        .dial-icon-btn .ring-icon {
          color: #475569;
          transition: color 0.2s;
        }
        .dial-icon-btn .ring-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #64748b;
          opacity: 0.8;
          white-space: nowrap;
        }
        
        .dial-icon-btn.active .ring-icon,
        .dial-icon-btn:hover .ring-icon {
          color: #3b82f6; /* Blue accent */
        }
        .dial-icon-btn.active .ring-label,
        .dial-icon-btn:hover .ring-label {
          color: #3b82f6;
          opacity: 1;
        }
        .dial-icon-btn.active {
          position: relative;
        }
        /* Top blue dash for active "Inicio" like in mockup */
        .dial-icon-btn.active::before {
          content: '';
          position: absolute;
          top: -15px;
          width: 20px;
          height: 4px;
          background: #3b82f6;
          border-radius: 4px;
        }

        /* Center Video Player (Orb) */
        .dial-center-orb {
          width: 560px;
          height: 560px;
          border-radius: 50%;
          position: absolute;
          z-index: 10;
          background: #0f172a;
          box-shadow: 
            0 10px 30px rgba(0,0,0,0.3),
            inset 0 2px 5px rgba(255,255,255,0.2);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .orb-bg {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
        }
        .orb-bg-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        /* Dark gradient overlay at bottom for text readability */
        .orb-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.15) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: white;
          transition: background 0.3s;
          border-radius: 50%; /* Keep overlay constrained to circle */
        }
        .orb-overlay.playing {
          background: linear-gradient(to bottom, rgba(0,0,0,0) 80%, rgba(0,0,0,0.8) 100%);
        }

        .orb-play-btn {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 20px;
        }
        .orb-play-btn:hover {
          background: rgba(255,255,255,0.25);
          transform: scale(1.05);
        }
        .orb-play-btn.hidden {
          opacity: 0;
        }
        .orb-play-btn.hidden:hover {
          opacity: 1;
        }

        .orb-info-bottom {
          position: absolute;
          bottom: 40px;
          width: 70%;
          text-align: center;
        }
        .orb-info-bottom h3 {
          font-size: 1.3rem;
          font-weight: 700;
          margin: 0;
        }
        .orb-info-bottom p {
          font-size: 0.85rem;
          color: #cbd5e1;
          margin: 4px 0 16px 0;
        }

        .progress-times {
          display: flex;
          justify-content: center;
          gap: 12px;
          font-size: 0.75rem;
          color: #94a3b8;
          font-variant-numeric: tabular-nums;
        }

        /* Circular Progress SVG */
        .circular-progress-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
          z-index: 15;
          pointer-events: none;
        }
        .progress-bg {
          fill: none;
          stroke: transparent;
        }
        .progress-value {
          fill: none;
          stroke: #3b82f6;
          vector-effect: non-scaling-stroke;
          stroke-width: 3px;
          stroke-linecap: round;
          stroke-dasharray: 308;
          transition: stroke-dashoffset 0.1s linear;
        }


        /* ── RIGHT FLOATING CARD ── */
        .right-card-area {
          flex: 1;
          max-width: 300px;
          display: flex;
          justify-content: flex-end;
          z-index: 10;
        }
        .floating-ia-card {
          background: #ffffff;
          border-radius: 20px;
          padding: 24px;
          width: 260px;
          box-shadow: 
            0 10px 30px rgba(0,0,0,0.04),
            0 1px 3px rgba(0,0,0,0.02);
          border: 1px solid rgba(255,255,255,0.8);
          position: relative;
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .card-titles h4 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #1e293b;
        }
        .card-titles span {
          font-size: 0.75rem;
          color: #64748b;
        }
        .floating-ia-card p {
          font-size: 0.95rem;
          line-height: 1.4;
          margin: 0;
        }
        .card-chevron {
          position: absolute;
          bottom: 24px;
          right: 24px;
          color: #94a3b8;
        }

        /* ── BOTTOM GRID ── */
        .home-bottom-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          padding: 40px 60px;
          margin-top: 40px;
          width: 100%;
        }
        .grid-col {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .section-header h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #475569;
          margin: 0;
        }
        .text-gray { color: #94a3b8; }

        /* Unified Video Card */
        .video-card-unified {
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0,0,0,0.03);
          border: 1px solid rgba(255,255,255,0.8);
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
        }
        .video-card-unified:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.05);
        }
        .video-card-unified .img-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
        }
        .video-card-unified .img-wrapper img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .video-card-unified .time-badge {
          position: absolute;
          bottom: 8px; right: 8px;
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 4px 6px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .video-card-unified .card-info {
          padding: 12px;
          display: flex;
          flex-direction: column;
        }
        .video-card-unified .card-info h4 {
          margin: 0 0 4px 0;
          font-size: 0.95rem;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .video-card-unified .card-info p {
          margin: 0;
          font-size: 0.8rem;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Tu Programación */
        .program-list-card {
          background: #ffffff;
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.03);
          border: 1px solid rgba(255,255,255,0.8);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .program-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          border-radius: 12px;
          transition: background 0.2s;
          position: relative;
        }
        .program-item:hover {
          background: #f8fafc;
        }
        .program-item.active {
          background: #eff6ff;
        }
        .active-indicator {
          position: absolute;
          left: -4px;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 24px;
          background: #3b82f6;
          border-radius: 4px;
        }
        .prog-time {
          font-weight: 700;
          color: #3b82f6;
          font-size: 0.9rem;
          min-width: 44px;
        }
        .prog-info h4 {
          margin: 0 0 2px 0;
          font-size: 0.9rem;
          color: #1e293b;
        }
        .prog-info p {
          margin: 0;
          font-size: 0.75rem;
          color: #64748b;
        }

        /* Explorar */
        .explore-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .explore-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #ffffff;
          border: 1px solid rgba(255,255,255,0.8);
          padding: 16px 20px;
          border-radius: 16px;
          font-size: 0.95rem;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
          transition: all 0.2s;
        }
        .explore-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        .explore-btn .arrow {
          margin-left: auto;
        }

        /* Recomendado para vos (Horizontal scroll) */
        .horizontal-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 20px;
          scrollbar-width: none;
        }
        .horizontal-scroll::-webkit-scrollbar {
          display: none;
        }

        /* ── MOBILE RESPONSIVENESS ── */
        @media (max-width: 768px) {
          .home-navbar {
            padding: 16px 20px;
          }
          .nav-links {
            display: none; /* Ocultar links en mobile */
          }
          .home-search-container {
            padding: 0 20px;
          }
          .search-input-wrapper {
            width: 100%;
          }
          .home-middle-section {
            flex-direction: column;
            padding: 0 20px;
            gap: 40px;
          }
          .left-welcome {
            max-width: 100%;
            text-align: center;
          }
          .left-welcome .btn-outline-ai {
            margin: 0 auto;
          }
          
          /* Escalar el aro central dinámicamente según el ancho de la pantalla */
          .center-dial {
            width: 100%;
            overflow: visible;
          }
          .dial-wrapper {
            transform: scale(0.48);
            margin-top: -176px;
            margin-bottom: -176px;
          }

          .right-card-area {
            max-width: 100%;
            justify-content: center;
          }
          
          .home-bottom-grid {
            grid-template-columns: 1fr;
            padding: 20px;
            gap: 40px;
            width: 100%;
            overflow-x: hidden;
          }
        }
      `}</style>
    </div>
  );
}
