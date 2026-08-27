import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Tv, Grid, Radio, Plus, Play, Brain, BarChart2, Bookmark,
  SplitSquareHorizontal, Film, GraduationCap, List, PlaySquare, Star, User, Calendar, Mic, Settings
} from 'lucide-react';
import AddVideoModal from '../components/AddVideoModal';

const HUD_ITEMS = [
  { id: 'inicio', icon: HomeIcon, label: 'INICIO', sub: '', color: '#60a5fa', route: '/' },
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

  const radius = 280; // Radio del círculo

  return (
    <div className="hud-home-container">
      {/* ── TOP BAR ── */}
      <header className="hud-topbar">
        <div className="hud-logo">
          <h1>YOUAPP <span>TV</span></h1>
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
        <div className="dial-wrapper">
          {/* Fondo Espacial Central */}
          <div className="dial-center-orb">
            <div className="orb-bg"></div>
            <div className="orb-content">
              <button className="orb-play-btn" onClick={() => navigate('/live')}>
                <Play size={48} fill="currentColor" />
              </button>
              <div className="orb-info">
                <h3>El futuro de la humanidad</h3>
                <p>Documental · 45 min</p>
                <div className="orb-badges">
                  <span>4K</span>
                  <span>HDR</span>
                </div>
              </div>
              
              <div className="orb-progress">
                <span>18:27</span>
                <div className="progress-bar"><div className="fill" style={{width:'40%'}}></div></div>
                <span>45:00</span>
              </div>
            </div>
          </div>

          {/* El Aro Físico (Thick Ring) y sus divisiones */}
          <div className="dial-physical-ring">
            {/* Divisiones (Spokes) */}
            {Array.from({ length: 18 }).map((_, i) => (
              <div 
                key={`spoke-${i}`} 
                className="dial-spoke" 
                style={{ transform: `rotate(${-80 + (i * 20)}deg)` }}
              ></div>
            ))}
          </div>

          {/* Anillo de Segmentos y Textos */}
          <div className="dial-ring">
            {HUD_ITEMS.map((item, index) => {
              // 18 items -> 20 grados cada uno
              // Empezamos en -90deg (arriba)
              const angleDeg = -90 + (index * 20);
              const angleRad = (angleDeg * Math.PI) / 180;
              
              // Radio del aro físico donde se asientan los iconos
              const ringRadius = 270;
              const x = Math.cos(angleRad) * ringRadius;
              const y = Math.sin(angleRad) * ringRadius;
              
              // Radio donde empiezan las líneas conectoras y el texto
              const textRadius = ringRadius + 120;
              const tx = Math.cos(angleRad) * textRadius;
              const ty = Math.sin(angleRad) * textRadius;

              // Lógica de alineación del texto según el lado
              const isRightSide = angleDeg > -90 && angleDeg < 90;
              const isLeftSide = angleDeg > 90 || angleDeg < -90;
              const isTop = angleDeg === -90;
              const isBottom = angleDeg === 90;

              return (
                <div key={item.id} className="dial-segment" style={{ '--x': `${x}px`, '--y': `${y}px` } as React.CSSProperties}>
                  
                  {/* Icono interactivo asentado sobre el aro */}
                  <button 
                    className={`dial-icon-btn ${hoveredItem === item.id ? 'active' : ''}`}
                    style={{ '--clr': item.color } as React.CSSProperties}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => navigate(item.route)}
                  >
                    <item.icon size={24} />
                    {isTop && <span className="dial-icon-label-center" style={{color: item.color}}>INICIO</span>}
                    {isBottom && <span className="dial-icon-label-center" style={{color: item.color}}>IA</span>}
                  </button>

                  {/* Texto Conector (HUD Callout Line) */}
                  {!isTop && !isBottom && (
                    <div 
                      className={`dial-text-connector ${isRightSide ? 'right' : ''} ${isLeftSide ? 'left' : ''} ${hoveredItem === item.id ? 'highlight' : ''}`}
                      style={{ 
                        transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`,
                        alignItems: isRightSide ? 'flex-start' : 'flex-end',
                        textAlign: isRightSide ? 'left' : 'right',
                        '--clr': item.color
                      } as React.CSSProperties}
                    >
                      <h4>{item.label}</h4>
                      <p>{item.sub}</p>
                      
                      {/* Línea conectora quebrada (Callout line) */}
                      <svg className="connector-svg" preserveAspectRatio="none">
                        {isRightSide ? (
                          <path d={`M -60 5 L -20 5 L 0 ${-ty/4}`} />
                        ) : (
                          <path d={`M 240 5 L 200 5 L 180 ${-ty/4}`} />
                        )}
                      </svg>
                    </div>
                  )}
                </div>
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
          width: 440px;
          height: 440px;
          border-radius: 50%;
          position: absolute;
          z-index: 5;
          padding: 10px;
          background: conic-gradient(from 0deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.02) 100%);
          box-shadow: inset 0 0 40px rgba(0,0,0,0.9), 0 0 80px rgba(0,0,0,0.8);
          animation: spin-slow 20s linear infinite;
        }
        .dial-center-orb > * { animation: spin-slow-reverse 20s linear infinite; }

        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
        @keyframes spin-slow-reverse { 100% { transform: rotate(-360deg); } }

        .orb-bg {
          position: absolute;
          inset: 15px;
          border-radius: 50%;
          background: url('https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=800&q=80') center/cover;
          opacity: 0.6;
          z-index: 1;
          border: 2px solid rgba(255,255,255,0.1);
        }
        .orb-bg::after {
          content: ''; position: absolute; inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,0,0,0) 20%, rgba(0,0,0,0.9) 100%);
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

        .orb-info h3 { margin: 0 0 8px 0; font-size: 1.4rem; font-weight: 600; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
        .orb-info p { margin: 0 0 12px 0; font-size: 0.9rem; color: #cbd5e1; }
        .orb-badges { display: flex; gap: 8px; justify-content: center; margin-bottom: 24px; }
        .orb-badges span {
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
          padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;
        }

        .orb-progress {
          width: 70%;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.75rem;
          color: #9ca3af;
        }
        .progress-bar {
          flex: 1; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px;
        }
        .progress-bar .fill { height: 100%; background: #3b82f6; border-radius: 2px; box-shadow: 0 0 10px #3b82f6; }


        /* El Aro Físico */
        .dial-physical-ring {
          position: absolute;
          width: 620px;
          height: 620px;
          border-radius: 50%;
          border: 80px solid rgba(15, 15, 20, 0.7);
          box-shadow: inset 0 0 30px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.6);
          backdrop-filter: blur(10px);
          z-index: 1;
        }
        .dial-physical-ring::before {
          content: ''; position: absolute; inset: -80px;
          border-radius: 50%; border: 1px solid rgba(255,255,255,0.15);
        }
        .dial-physical-ring::after {
          content: ''; position: absolute; inset: 0px;
          border-radius: 50%; border: 1px solid rgba(255,255,255,0.1);
        }
        .dial-spoke {
          position: absolute;
          top: -80px; left: 50%;
          width: 2px; height: 80px;
          background: rgba(255,255,255,0.15);
          transform-origin: center 390px; /* 310 + 80 */
        }


        /* Ring Items */
        .dial-ring {
          position: absolute;
          width: 100%; height: 100%;
          pointer-events: none;
          z-index: 10;
        }

        .dial-segment {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y)));
          pointer-events: auto;
        }

        .dial-icon-btn {
          width: 100%; height: 100%;
          min-width: 60px; min-height: 60px;
          border-radius: 12px; /* Cambiado a cuadrado redondeado para parecer botón de segmento */
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.5);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .dial-icon-btn:hover, .dial-icon-btn.active {
          color: var(--clr);
          transform: scale(1.1);
          text-shadow: 0 0 10px var(--clr);
        }
        /* Glow indicator underneath */
        .dial-icon-btn:hover::after, .dial-icon-btn.active::after {
          content: ''; position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
          width: 20px; height: 3px; background: var(--clr); border-radius: 2px;
          box-shadow: 0 0 10px var(--clr);
        }

        .dial-icon-label-center {
          position: absolute;
          bottom: -24px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 1px;
          white-space: nowrap;
          text-shadow: 0 0 10px var(--clr);
        }

        /* External Connectors */
        .dial-text-connector {
          position: absolute;
          top: 50%; left: 50%;
          width: 180px; height: 40px;
          display: flex;
          flex-direction: column;
          opacity: 0.6;
          transition: 0.3s;
          pointer-events: none;
        }
        .dial-text-connector.highlight { opacity: 1; transform: scale(1.05) !important; }
        
        .dial-text-connector h4 {
          margin: 0 0 2px 0; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
          color: rgba(255,255,255,0.9);
        }
        .dial-text-connector.highlight h4 { color: var(--clr); text-shadow: 0 0 8px var(--clr); }
        .dial-text-connector p {
          margin: 0; font-size: 0.65rem; color: #9ca3af; line-height: 1.2;
        }

        /* Angular Callout Line SVG */
        .connector-svg {
          position: absolute;
          top: 50%;
          width: 200px;
          height: 100px;
          pointer-events: none;
          overflow: visible;
        }
        .dial-text-connector.right .connector-svg { left: -70px; transform: translateY(-50%); }
        .dial-text-connector.left .connector-svg { right: -70px; transform: translateY(-50%); }
        
        .connector-svg path {
          fill: none;
          stroke: rgba(255,255,255,0.15);
          stroke-width: 1.5;
          transition: 0.3s;
        }
        
        .dial-text-connector.highlight .connector-svg path {
          stroke: var(--clr);
          filter: drop-shadow(0 0 4px var(--clr));
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
          .dial-wrapper { transform: scale(0.45); }
          .hud-bottom-bar { flex-direction: column; gap: 10px; }
          .hud-mega-play { width: 90px; height: 90px; }
          .hud-add-video-btn span { display: none; }
        }
      `}</style>
    </div>
  );
}
