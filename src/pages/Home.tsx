import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Tv, Grid, Radio, Plus, Play, Brain, BarChart2, Bookmark,
  SplitSquareHorizontal, Film, GraduationCap, List, PlaySquare, Star, User, Calendar, Mic, Settings,
  SkipBack, Pause, SkipForward, Maximize
} from 'lucide-react';
import AddVideoModal from '../components/AddVideoModal';
import { INITIAL_SCHEDULE } from './CreateSignal';

const HUD_ITEMS = [
  { id: 'inicio', icon: Maximize, label: 'CUADRADO', sub: 'Cambiar formato del video.', color: '#60a5fa', action: 'toggleSquare', route: '/' },
  { id: 'algoritmo', icon: Brain, label: 'MI ALGORITMO', sub: 'Personalizá cómo te recomienda.', color: '#c084fc', route: '/my-algorithm' },
  { id: 'tendencias', icon: BarChart2, label: 'TENDENCIAS', sub: 'Lo más relevante ahora.', color: '#f59e0b', route: '/trending' },
  { id: 'momentos', icon: Bookmark, label: 'MOMENTOS', sub: 'Guardá y reviví lo mejor.', color: '#fcd34d', route: '/moments' },
  { id: 'you4', icon: Grid, label: 'YOU4', sub: 'Cuatro perspectivas. Un mismo tema.', color: '#4ade80', route: '/quad' },
  { id: 'comparar', icon: SplitSquareHorizontal, label: 'COMPARAR', sub: 'Varios videos en paralelo.', color: '#22d3ee', route: '/compare' },
  { id: 'director', icon: Film, label: 'YOU DIRECTOR', sub: 'IA que crea tu experiencia.', color: '#818cf8', route: '/director' },
  { id: 'aprender', icon: GraduationCap, label: 'APRENDER', sub: 'Rutas de aprendizaje por nivel.', color: '#d946ef', route: '/learn' },
  { id: 'listas', icon: List, label: 'LISTAS', sub: 'Tus listas y colecciones.', color: '#f472b6', route: '/my-lists' },
  { id: 'ia', icon: Brain, label: 'IA ASISTENTE', sub: 'Tu guía inteligente en YouApp.', color: '#3b82f6', route: '/assistant' },
  { id: 'canales', icon: PlaySquare, label: 'CANALES', sub: 'Canales temáticos 24/7.', color: '#06b6d4', route: '/channels' },
  { id: 'curadores', icon: Star, label: 'CURADORES', sub: 'Las mejores selecciones temáticas.', color: '#10b981', route: '/curators' },
  { id: 'creadores', icon: User, label: 'CREADORES', sub: 'Seguí, descubrí y apoyá creadores.', color: '#fbbf24', route: '/creators' },
  { id: 'envivo', icon: Radio, label: 'EN VIVO', sub: 'En vivo y próximos eventos.', color: '#ef4444', route: '/live' },
  { id: 'programacion', icon: Calendar, label: 'PROGRAMACIÓN', sub: 'Organizá tu TV por día y hora.', color: '#f43f5e', route: '/program' },
  { id: 'misenal', icon: Tv, label: 'MI SEÑAL', sub: 'Tu programación personalizada.', color: '#ec4899', route: '/create-signal' },
  { id: 'youselect', icon: Star, label: 'YOU SELECT', sub: 'Los 20 mejores sobre cualquier tema.', color: '#a855f7', route: '/select' },
  { id: 'buscar', icon: Search, label: 'BUSCAR', sub: 'Encontrá los mejores videos con IA.', color: '#0ea5e9', route: '/search' }
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isPlayingInOrb, setIsPlayingInOrb] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [realProgress, setRealProgress] = useState(0);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isSquare, setIsSquare] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const videoSources = [
    "/background.mp4",
    "/video2.mp4",
    "/video3.mp4"
  ];
  const videoThumbnails = [
    "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=800&q=80",
    "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80",
    "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=800&q=80"
  ];

  // Hacer la barra de progreso "real" (gira con el tiempo) y manejar la barra espaciadora
  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      // Simulamos que el progreso es el porcentaje de los segundos del minuto actual (da una vuelta cada minuto)
      const secProgress = now.getSeconds() / 60;
      setRealProgress(secProgress);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(()=>{});
      }
    }
  }, [isPaused, currentVideoIndex]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Evitar que la página haga scroll
        if (isPlayingInOrb) {
          setIsPaused(prev => !prev);
        } else {
          setIsPlayingInOrb(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayingInOrb]);

  const handleNextVideo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentVideoIndex((prev) => (prev + 1) % videoSources.length);
  };

  const handlePrevVideo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentVideoIndex((prev) => (prev - 1 + videoSources.length) % videoSources.length);
  };

  const currentSignalSlot = INITIAL_SCHEDULE[currentVideoIndex % INITIAL_SCHEDULE.length];
  const radius = 280; // Radio del círculo

  return (
    <div className="hud-home-container">
      {/* ── TOP BAR ── */}
      <header className="hud-topbar">
        <div className="hud-logo">
          <h1>YouApp <span>TV</span></h1>
          <p>TU MUNDO EN UN SOLO CÍRCULO</p>
        </div>
        
        <div className="hud-search">
          <Search size={18} className="search-icon" />
          <input type="text" placeholder="¿Qué querés ver?" />
          <Mic size={18} className="mic-icon" />
        </div>

        <div className="hud-top-actions">
          <div className="hud-you-select-toggle">
            <Star size={14} className="star-icon" />
            <div className="toggle-text">
              <span>YOU SELECT</span>
              <small>Solo lo mejor</small>
            </div>
            <div className="toggle-switch active"></div>
          </div>
          
          <button className="hud-add-video-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> AGREGAR VIDEO
          </button>
          
          <div className="hud-user">
            <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&q=80" alt="Edu" />
            <div className="user-text">
              <span>Hola, Edu</span>
              <small>Tu TV. Tus reglas.</small>
            </div>
          </div>
        </div>
      </header>

      {/* ── DIAL CENTRAL ── */}
      <main className="hud-main-dial">
        <div className={`dial-wrapper ${isSquare ? 'square-mode' : ''}`}>
          {/* Fondo Espacial Central con Video */}
          <div className="dial-center-orb">
            <div className="orb-bg">
              <video 
                key={currentVideoIndex} // Fuerza recarga al cambiar de canal
                src={videoSources[currentVideoIndex]}
                poster={videoThumbnails[currentVideoIndex]}
                className="orb-bg-video"
                autoPlay
                muted={!isPlayingInOrb}
                loop
                playsInline
                ref={videoRef}
              />
            </div>
            
            {!isPlayingInOrb && (
              <div className="orb-content">
                <button className="orb-play-btn" onClick={() => {
                  setIsPlayingInOrb(true);
                  if (videoRef.current) {
                    videoRef.current.muted = false;
                    videoRef.current.play().catch(()=>{});
                  }
                }}>
                  <Play size={48} fill="currentColor" />
                </button>
                <div className="orb-info">
                  <h3>{currentSignalSlot.video.title}</h3>
                  <p>{currentSignalSlot.video.channel.toUpperCase()} · {currentSignalSlot.video.duration}</p>
                  <div className="orb-badges">
                    <span>4K</span>
                    <span>HDR</span>
                  </div>
                  
                  <div className="orb-media-controls">
                    <button onClick={handlePrevVideo}><SkipBack size={20} fill="currentColor" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}>
                      {isPaused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}
                    </button>
                    <button onClick={handleNextVideo}><SkipForward size={20} fill="currentColor" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Circular Progress Ring (Estilo YOU RING) */}
          <div className="circular-progress-container" style={{ '--progress': realProgress } as React.CSSProperties}>
            <svg width="610" height="610" viewBox="0 0 610 610" className="progress-svg">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Pista de fondo */}
              <circle cx="305" cy="305" r="295" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              {/* Barra de progreso luminosa */}
              <circle 
                cx="305" cy="305" r="295" 
                fill="none" stroke="#0ea5e9" strokeWidth="3"
                strokeLinecap="round"
                filter="url(#glow)"
                className="progress-arc"
              />
            </svg>
            <div className="progress-dot-wrapper">
              <div className="progress-dot" />
            </div>
            
            {/* Tiempos */}
            <div className="progress-text left-text">{currentSignalSlot.timeStart}</div>
            <div className="progress-text right-text">{currentSignalSlot.timeEnd}</div>
          </div>

          {/* El Aro Físico (Thick Ring) y sus divisiones */}
          <div className="dial-physical-ring">
            {/* Divisiones (Spokes) matemáticas para el aro */}
            {Array.from({ length: 18 }).map((_, i) => {
              // Desfasamos 10 grados para que los iconos caigan justo en medio
              const angleDeg = -70 + (i * 20);
              return (
                <div 
                  key={`spoke-${i}`} 
                  className="dial-spoke"
                  style={{ transform: `rotate(${angleDeg}deg)` }}
                />
              );
            })}
          </div>

          {/* Anillo de Segmentos y Textos */}
          <div className="dial-ring" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            {HUD_ITEMS.map((item, index) => {
              // 18 items -> 20 grados cada uno
              const angleDeg = -90 + (index * 20);
              const angleRad = (angleDeg * Math.PI) / 180;
              
              // Radio exacto del centro del borde físico (337px)
              const ringRadius = 337;
              // Usamos coordenadas relativas al centro 0,0 para que CSS calc() maneje el centro
              const x = Math.cos(angleRad) * ringRadius;
              const y = Math.sin(angleRad) * ringRadius;

              return (
                <React.Fragment key={item.id}>
                  {/* Icono interactivo asentado sobre el aro */}
                  <div 
                    className="dial-segment-icon"
                    style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
                  >
                    <button 
                      className={`dial-icon-btn ${hoveredItem === item.id ? 'active' : ''}`}
                      style={{ '--clr': item.color } as React.CSSProperties}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={() => {
                        if (item.action === 'toggleSquare') {
                          setIsSquare(!isSquare);
                        } else {
                          navigate(item.route);
                        }
                      }}
                    >
                      <item.icon size={32} />
                      {/* Opcional: mostrar un tooltip al pasar el cursor si no hay texto fijo */}
                      <span className="dial-tooltip">{item.label}</span>
                    </button>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </main>

      {/* ── BOTTOM CONTROL BAR ── */}
      <footer className="hud-bottom-bar">
        <div className="hud-pill-btn">
          <div className="pill-icon"><Star size={20} /></div>
          <div className="pill-text">
            <span>MI DÍA</span>
            <small>Tu resumen inteligente.</small>
          </div>
        </div>

        <button className="hud-mega-play" onClick={() => navigate('/live')}>
          <Play size={28} fill="currentColor" />
          <span>PLAY MI TV</span>
        </button>

        <div className="hud-pill-btn right">
          <div className="pill-text">
            <span>TU TIEMPO VALE</span>
            <small>Mejores videos. Mejores personas.</small>
          </div>
          <div className="pill-icon"><Settings size={20} /></div>
        </div>
      </footer>

      {showAddModal && <AddVideoModal onClose={() => setShowAddModal(false)} />}

      {/* ── STYLES ── */}
      <style>{`
        .hud-home-container {
          min-height: 100vh;
          background: #020202; /* Deep black space background */
          color: white;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, sans-serif;
          overflow: hidden;
          position: relative;
        }

        /* Subtle background glow */
        .hud-home-container::before {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(0,0,0,0) 70%);
          z-index: 0;
          pointer-events: none;
        }

        /* ── TOPBAR ── */
        .hud-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 40px;
          z-index: 10;
        }

        .hud-logo h1 {
          margin: 0;
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: 1px;
        }
        .hud-logo h1 span { color: #3b82f6; }
        .hud-logo p {
          margin: 4px 0 0 0;
          font-size: 0.7rem;
          letter-spacing: 2px;
          color: #9ca3af;
        }

        .hud-search {
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 30px;
          padding: 10px 20px;
          width: 400px;
          backdrop-filter: blur(10px);
        }
        .hud-search input {
          background: transparent;
          border: none;
          color: white;
          width: 100%;
          padding: 0 16px;
          outline: none;
          font-size: 0.95rem;
        }
        .hud-search .search-icon, .hud-search .mic-icon { color: #9ca3af; }

        .hud-top-actions {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .hud-you-select-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.05);
          padding: 8px 16px;
          border-radius: 30px;
        }
        .hud-you-select-toggle .star-icon { color: #60a5fa; }
        .toggle-text span { display: block; font-size: 0.8rem; font-weight: 700; }
        .toggle-text small { color: #9ca3af; font-size: 0.65rem; }
        .toggle-switch {
          width: 36px; height: 20px;
          background: rgba(255,255,255,0.2);
          border-radius: 20px;
          position: relative;
        }
        .toggle-switch.active { background: #3b82f6; }
        .toggle-switch::after {
          content: ''; position: absolute;
          width: 16px; height: 16px;
          background: white; border-radius: 50%;
          top: 2px; left: 2px;
          transition: 0.3s;
        }
        .toggle-switch.active::after { transform: translateX(16px); }

        .hud-add-video-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(139, 92, 246, 0.2);
          color: #c4b5fd;
          border: 1px solid rgba(139, 92, 246, 0.5);
          padding: 10px 20px;
          border-radius: 30px;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.3s;
        }
        .hud-add-video-btn:hover {
          background: rgba(139, 92, 246, 0.4);
          transform: translateY(-2px);
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
        }

        .hud-user {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .hud-user img {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.2);
        }
        .user-text span { display: block; font-weight: 600; font-size: 0.9rem; }
        .user-text small { color: #9ca3af; font-size: 0.75rem; }

        /* ── DIAL CENTRAL ── */
        .hud-main-dial {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }

        .dial-wrapper {
          position: relative;
          width: 900px;
          height: 900px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Center Orb */
        .dial-center-orb {
          width: 580px;
          height: 580px;
          left: calc(50% - 290px);
          top: calc(50% - 290px);
          border-radius: 50%;
          position: absolute;
          z-index: 5;
          padding: 10px;
          background: conic-gradient(from 0deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.02) 100%);
          box-shadow: inset 0 0 40px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.3);
          animation: spin-slow 20s linear infinite;
        }
        .dial-center-orb > * { animation: spin-slow-reverse 20s linear infinite; }

        .dial-wrapper.square-mode .dial-center-orb {
          border-radius: 24px;
          animation: none;
          transform: rotate(0deg);
        }
        .dial-wrapper.square-mode .dial-center-orb > * {
          animation: none;
          transform: rotate(0deg);
        }
        .dial-wrapper.square-mode .orb-bg {
          border-radius: 16px;
        }

        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
        @keyframes spin-slow-reverse { 100% { transform: rotate(-360deg); } }

        .orb-bg {
          position: absolute;
          inset: 15px;
          border-radius: 50%;
          background: transparent;
          opacity: 1;
          z-index: 1;
          border: 2px solid rgba(255,255,255,0.1);
          overflow: hidden;
        }
        .orb-bg-video {
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
          opacity: 1;
          z-index: 1;
        }

        .orb-content {
          position: absolute;
          inset: 10px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .orb-play-btn {
          width: 80px; height: 80px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(5px);
          cursor: pointer;
          transition: all 0.3s;
          margin-bottom: 40px;
        }
        .orb-play-btn:hover {
          background: rgba(255,255,255,0.2);
          transform: scale(1.1);
          box-shadow: 0 0 30px rgba(255,255,255,0.3);
        }

        .orb-info h3 { margin: 0 0 8px 0; font-size: 1rem; font-weight: 700; letter-spacing: 1px; text-shadow: 0 2px 10px rgba(0,0,0,0.8); text-transform: uppercase; }
        .orb-info p { margin: 0 0 12px 0; font-size: 0.75rem; color: #cbd5e1; letter-spacing: 1px; }
        .orb-badges { display: flex; gap: 8px; justify-content: center; margin-bottom: 24px; }
        .orb-badges span {
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
          padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;
        }

        .orb-media-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 32px;
          margin-top: 10px;
        }
        .orb-media-controls button {
          background: none; border: none; color: white; cursor: pointer;
          opacity: 0.8; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .orb-media-controls button:hover { opacity: 1; transform: scale(1.1); text-shadow: 0 0 10px white; }

        /* CIRCULAR PROGRESS RING */
        .circular-progress-container {
          position: absolute;
          width: 610px;
          height: 610px;
          left: calc(50% - 305px);
          top: calc(50% - 305px);
          z-index: 6;
          pointer-events: none;
          --progress: 0.42;
          --circumference: 1853.53;
          --offset: calc(var(--circumference) * (1 - var(--progress)));
        }
        .progress-svg {
          transform: rotate(180deg);
        }
        .progress-arc {
          stroke-dasharray: var(--circumference);
          stroke-dashoffset: var(--offset);
          transition: stroke-dashoffset 0.5s ease;
        }
        .progress-dot-wrapper {
          position: absolute;
          width: 590px; height: 590px;
          top: 10px; left: 10px;
          border-radius: 50%;
          transform: rotate(calc(180deg + (var(--progress) * 360deg)));
        }
        .progress-dot {
          position: absolute;
          top: calc(50% - 4px);
          right: -4px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #0ea5e9;
          box-shadow: 0 0 8px #0ea5e9, 0 0 15px #0ea5e9, 0 0 20px #fff;
        }
        .progress-text {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.8rem;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 1px;
        }
        .progress-text.left-text { left: -45px; }
        .progress-text.right-text { right: -45px; }


        /* El Aro Físico */
        .dial-physical-ring {
          position: absolute;
          box-sizing: border-box;
          width: 720px;
          height: 720px;
          left: calc(50% - 360px);
          top: calc(50% - 360px);
          border-radius: 50%;
          border: 46px solid rgba(15, 15, 20, 0.7);
          box-shadow: inset 0 0 30px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.6);
          backdrop-filter: blur(10px);
          z-index: 1;
        }
        .dial-physical-ring::before {
          content: ''; position: absolute; inset: -46px;
          border-radius: 50%; border: 3px solid rgba(255,255,255,0.3);
        }
        .dial-physical-ring::after {
          content: ''; position: absolute; inset: 0px;
          border-radius: 50%; border: 3px solid rgba(255,255,255,0.25);
        }
        .dial-spoke {
          position: absolute;
          top: -46px; left: calc(50% - 3px);
          width: 6px; height: 46px;
          background: rgba(255,255,255,0.4);
          transform-origin: center 360px;
          z-index: 2;
        }

        /* Ring Items */
        .dial-ring {
          position: absolute;
          width: 100%; height: 100%;
          pointer-events: none;
          z-index: 10;
        }

        .dial-segment-icon {
          position: absolute;
          transform: translate(-50%, -50%);
          pointer-events: auto;
          width: 80px; height: 80px;
        }

        .dial-icon-btn {
          width: 100%; height: 100%;
          border-radius: 12px;
          background: transparent;
          border: none;
          color: var(--clr);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .dial-icon-btn:hover, .dial-icon-btn.active {
          transform: scale(1.1);
          text-shadow: 0 0 10px var(--clr);
        }
        /* Glow indicator underneath */
        .dial-icon-btn:hover::after, .dial-icon-btn.active::after {
          content: ''; position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
          width: 20px; height: 3px; background: var(--clr); border-radius: 2px;
          box-shadow: 0 0 10px var(--clr);
        }

        .dial-tooltip {
          position: absolute;
          top: -30px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 1px;
          white-space: nowrap;
          color: white;
          background: rgba(0,0,0,0.8);
          padding: 4px 12px;
          border-radius: 12px;
          border: 1px solid var(--clr);
          box-shadow: 0 0 10px var(--clr);
          opacity: 0;
          pointer-events: none;
          transform: translateY(10px);
          transition: all 0.3s;
        }

        .dial-icon-btn:hover .dial-tooltip {
          opacity: 1;
          transform: translateY(0);
        }


        /* ── BOTTOM BAR ── */
        .hud-bottom-bar {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 60px;
          padding: 30px;
          z-index: 10;
        }

        .hud-pill-btn {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 8px 24px 8px 8px;
          border-radius: 40px;
          backdrop-filter: blur(10px);
          cursor: pointer;
          transition: 0.2s;
        }
        .hud-pill-btn.right {
          padding: 8px 8px 8px 24px;
        }
        .hud-pill-btn:hover { background: rgba(255,255,255,0.08); }
        
        .pill-icon {
          width: 48px; height: 48px; border-radius: 50%;
          background: rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
        }
        .pill-text span { display: block; font-size: 0.85rem; font-weight: 700; letter-spacing: 1px; }
        .pill-text small { color: #9ca3af; font-size: 0.7rem; }
        .hud-pill-btn.right .pill-text { text-align: right; }

        .hud-mega-play {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 120px; height: 120px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(10,10,15,0.8) 100%);
          border: 2px solid #3b82f6;
          color: white;
          box-shadow: 0 0 30px rgba(59,130,246,0.4), inset 0 0 20px rgba(59,130,246,0.2);
          cursor: pointer;
          transition: all 0.3s;
        }
        .hud-mega-play:hover {
          transform: translateY(-5px) scale(1.05);
          box-shadow: 0 10px 40px rgba(59,130,246,0.6), inset 0 0 30px rgba(59,130,246,0.4);
          background: radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(10,10,15,0.9) 100%);
        }
        .hud-mega-play span {
          font-size: 0.8rem; font-weight: 800; letter-spacing: 1px;
        }


        /* RESPONSIVE SCALING */
        @media (max-width: 1200px) {
          .dial-wrapper { transform: scale(0.85); }
          .hud-topbar { padding: 20px; }
          .hud-search { width: 300px; }
        }
        @media (max-width: 900px) {
          .dial-wrapper { transform: scale(0.65); }
          .hud-search { display: none; }
          .hud-you-select-toggle { display: none; }
          .hud-bottom-bar { gap: 20px; transform: scale(0.8); }
        }
        @media (max-width: 600px) {
          .hud-topbar { padding: 5px 15px; }
          .hud-logo h1 { font-size: 1rem; }
          .hud-logo p { display: none; }
          .hud-add-video-btn { padding: 6px 12px; }
          .hud-add-video-btn svg { width: 14px; height: 14px; }
          .hud-user img { width: 30px; height: 30px; }
          .hud-user .user-text { display: none; }
          .hud-main-dial { align-items: flex-start; }
          .dial-wrapper { 
            transform: scale(0.54) translateY(80px); 
            transform-origin: top center; 
            margin-top: 20px; 
          }
          .hud-bottom-bar { flex-direction: column; gap: 10px; padding: 10px; margin-top: -20px; }
          .hud-mega-play { width: 80px; height: 80px; }
          .hud-mega-play span { font-size: 0.6rem; }
          .hud-add-video-btn span { display: none; }
        }
      `}</style>
    </div>
  );
}
