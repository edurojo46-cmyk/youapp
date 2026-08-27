import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, Tv, Search, Radio, List, Clock, Users, Grid, Crown, 
  Bell, Plus, Sliders, PlayCircle, Bookmark
} from 'lucide-react';
import { useStore } from '../store/useStore';
import BottomNav from './BottomNav';

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const isActive = (path: string) => location.pathname === path;

  // Render a simple radar chart (using SVG polygon) based on algorithm weights
  const { savedAlgorithms, activeAlgorithmId } = useStore();
  const activeAlgo = savedAlgorithms?.find(a => a.id === activeAlgorithmId) || savedAlgorithms?.[0] || {
    name: 'Equilibrado', weights: { afinidad: 80, actualidad: 60, diversidad: 80, nuevosCreadores: 40, popularidad: 20 }
  };
  const weights = activeAlgo.weights;

  // Render SVG Polygon for Radar
  const mapVal = (val: number) => 15 + (val / 100) * 35; // Map 0-100 to 15-50 (radius)
  
  const getRadarPolygon = () => {
    const a = mapVal(weights.afinidad || 80); // Top
    const b = mapVal(weights.actualidad || 60); // Right
    const c = mapVal(weights.diversidad || 80); // Bottom Right
    const d = mapVal(weights.nuevosCreadores || 40); // Bottom Left
    const e = mapVal(weights.popularidad || 20); // Left

    // Center is 50,50. Angles: 270(top), 342, 54, 126, 198
    const pt = (radius: number, angleDegrees: number) => {
      const rad = (angleDegrees * Math.PI) / 180;
      return `${50 + radius * Math.cos(rad)},${50 + radius * Math.sin(rad)}`;
    };

    const points = `${pt(a, 270)} ${pt(b, 342)} ${pt(c, 54)} ${pt(d, 126)} ${pt(e, 198)}`;

    return (
      <svg viewBox="0 0 100 100" width="100" height="100">
        <polygon points="50,15 85,36 85,64 50,85 15,64 15,36" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>
        <polygon points={points} fill="rgba(167, 139, 250, 0.4)" stroke="#a78bfa" strokeWidth="1" />
      </svg>
    );
  };

  const isHome = location.pathname === '/';

  return (
    <div className="dl-wrapper">
      {/* LEFT SIDEBAR */}
      {!isHome && (
        <aside className="dl-sidebar-left">
          <div className="dl-logo">
          YouApp <span className="dl-logo-badge">TV</span>
        </div>

        <nav className="dl-nav-menu">
          <button className={`dl-nav-item ${isActive('/') ? 'active' : ''}`} onClick={() => navigate('/')}>
            <Home size={20} /> Inicio
          </button>
          <button className="dl-nav-item">
            <Tv size={20} /> Señales
          </button>
          <button className={`dl-nav-item ${isActive('/search') ? 'active' : ''}`} onClick={() => navigate('/search')}>
            <Search size={20} /> Buscar
          </button>
          <button className={`dl-nav-item ${isActive('/live') ? 'active' : ''}`} onClick={() => navigate('/live')}>
            <Radio size={20} /> En vivo
          </button>
          
          <div className="dl-nav-divider"></div>

          <button className={`dl-nav-item ${isActive('/moments') ? 'active' : ''}`} onClick={() => navigate('/moments')}>
            <Bookmark size={20} /> Mis momentos
          </button>
          <button className={`dl-nav-item ${isActive('/my-lists') ? 'active' : ''}`} onClick={() => navigate('/my-lists')}>
            <List size={20} /> Mis listas
          </button>
          <button className="dl-nav-item">
            <Clock size={20} /> Historial
          </button>
          <button className="dl-nav-item">
            <Users size={20} /> Seguidores
          </button>
          <button className="dl-nav-item">
            <Grid size={20} /> You4
          </button>
          <button className="dl-nav-item">
            <Crown size={20} /> VIP
          </button>
        </nav>

        <div className="dl-radar-section" onClick={() => navigate('/my-algorithm')}>
          <div className="dl-radar-header">
            <h4>Mi algoritmo</h4>
            <Sliders size={16} />
          </div>
          <span className="dl-radar-sub">{activeAlgo.name}</span>
          <div className="radar-chart-container">
            {getRadarPolygon()}
          </div>
          <button className="dl-radar-btn">Ver y editar</button>
        </div>
      </aside>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="dl-main">
        {!isHome && (
          <header className="dl-topbar">
            <div className="dl-search-container">
              <Search size={18} className="dl-search-icon" />
              <input 
                type="text" 
                placeholder="¿Qué querés ver hoy?" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate(`/search`);
                  }
                }}
              />
            </div>
            <div className="dl-top-actions">
              <button className="dl-btn-primary" onClick={() => navigate('/create-signal')}>
                <Plus size={18} /> Crear
              </button>
              <button className="dl-btn-icon">
                <Bell size={20} />
                <span className="dl-notification-dot">3</span>
              </button>
              <div className="dl-profile-dropdown" onClick={() => navigate('/channels')}>
                <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&q=80" alt="Eduardo" />
                <span>Eduardo</span>
              </div>
            </div>
          </header>
        )}

        <div className="dl-content-scroll" style={{ padding: isHome ? '0' : '32px', overflowX: 'hidden', overflowY: isHome ? 'hidden' : 'auto' }}>
          {children}
        </div>
      </main>

      {/* RIGHT SIDEBAR */}
      {!isHome && (
        <aside className="dl-sidebar-right">
          <div className="dl-right-section">
          <div className="dl-algo-card">
            <div className="dl-algo-header">
              <h3>{activeAlgo.name}</h3>
              <span className="dl-badge">Activo</span>
            </div>
            <div className="dl-radar-container">
              {getRadarPolygon()}
            </div>
            <div className="dl-algo-stats">
              <div className="dl-algo-stat">
                <span>Afinidad</span>
                <span className="dl-algo-val">{weights.afinidad || 80}%</span>
              </div>
              <div className="dl-algo-stat">
                <span>Actualidad</span>
                <span className="dl-algo-val">{weights.actualidad || 60}%</span>
              </div>
              <div className="dl-algo-stat">
                <span>Diversidad</span>
                <span className="dl-algo-val">{weights.diversidad || 80}%</span>
              </div>
              <div className="dl-algo-stat">
                <span>Nuevos Cread.</span>
                <span className="dl-algo-val">{weights.nuevosCreadores || 40}%</span>
              </div>
              <div className="dl-algo-stat">
                <span>Popularidad</span>
                <span className="dl-algo-val">{weights.popularidad || 20}%</span>
              </div>
            </div>    
          </div>
          <button className="dl-btn-secondary" onClick={() => navigate('/my-algorithm')}>Ver y editar algoritmo</button>
        </div>

        <div className="dl-right-section">
          <div className="dl-section-header">
            <h3>Recomendados por tu red</h3>
            <span className="dl-link">Ver todos</span>
          </div>
          <div className="dl-rec-list">
            <div className="dl-rec-item">
              <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100" className="dl-rec-avatar" />
              <div className="dl-rec-info">
                <p><strong>Maria</strong> recomendó</p>
                <h4>La economía explicada por Juan</h4>
                <span>Hace 2 h</span>
              </div>
              <img src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200" className="dl-rec-thumb" />
            </div>
            <div className="dl-rec-item">
              <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100" className="dl-rec-avatar" />
              <div className="dl-rec-info">
                <p><strong>Pedro</strong> recomendó</p>
                <h4>Documental: Océanos profundos</h4>
                <span>Hace 5 h</span>
              </div>
              <img src="https://images.unsplash.com/photo-1582967177930-fc8c6db22567?w=200" className="dl-rec-thumb" />
            </div>
            <div className="dl-rec-item">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" className="dl-rec-avatar" />
              <div className="dl-rec-info">
                <p><strong>Sofia</strong> recomendó</p>
                <h4>Inteligencia Artificial: ¿aliada o amenaza?</h4>
                <span>Hace 1 día</span>
              </div>
              <img src="https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=200" className="dl-rec-thumb" />
            </div>
          </div>
        </div>

        <div className="dl-right-section">
          <div className="dl-section-header">
            <h3>Curadores destacados</h3>
            <span className="dl-link">Ver todos</span>
          </div>
          <div className="dl-curator-list">
            <div className="dl-curator-item">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" />
              <div>
                <h4>Sofia López</h4>
                <span>Experta en historia</span>
              </div>
              <div className="dl-cur-count">12 señales {'>'}</div>
            </div>
            <div className="dl-curator-item">
              <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100" />
              <div>
                <h4>Diego Tech</h4>
                <span>Tecnología y futuro</span>
              </div>
              <div className="dl-cur-count">8 señales {'>'}</div>
            </div>
            <div className="dl-curator-item">
              <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100" />
              <div>
                <h4>María Educadora</h4>
                <span>Educación y sociedad</span>
              </div>
              <div className="dl-cur-count">15 señales {'>'}</div>
            </div>
          </div>
        </div>
      </aside>
      )}

      <div className="dl-mobile-nav">
        <BottomNav />
      </div>

      <style>{`
        /* Global Reset for this Layout */
        body {
          margin: 0;
          background: #050505;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .dl-wrapper {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background: #050505;
          position: relative;
        }

        .dl-mobile-nav {
          display: none;
        }

        /* LEFT SIDEBAR */
        .dl-sidebar-left {
          width: 260px;
          background: rgba(255,255,255,0.02);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          padding: 24px 20px;
          flex-shrink: 0;
          overflow-y: auto;
        }
        .dl-sidebar-left::-webkit-scrollbar { display: none; }

        .dl-logo {
          font-size: 1.4rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 40px;
        }
        .dl-logo-badge {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 900;
        }

        .dl-nav-menu {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .dl-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          background: none;
          border: none;
          color: #9ca3af;
          font-size: 1rem;
          font-weight: 600;
          padding: 12px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .dl-nav-item:hover { color: white; background: rgba(255,255,255,0.05); }
        .dl-nav-item.active { background: rgba(167, 139, 250, 0.15); color: #a78bfa; }
        .dl-nav-divider {
          height: 1px;
          background: rgba(255,255,255,0.05);
          margin: 12px 0;
        }

        .dl-radar-section {
          margin-top: 40px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 16px;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .dl-radar-section:hover { border-color: rgba(167, 139, 250, 0.4); }
        .dl-radar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #e5e7eb;
        }
        .dl-radar-header h4 { margin: 0; font-size: 0.95rem; font-weight: 600; }
        .dl-radar-sub { display: block; font-size: 0.75rem; color: #a78bfa; margin-bottom: 20px; }
        
        .radar-chart-container {
          position: relative;
          width: 100px;
          height: 100px;
          margin: 0 auto 30px;
        }
        .radar-labels { position: absolute; inset: 0; pointer-events: none; }
        .rl { position: absolute; font-size: 0.5rem; color: #9ca3af; }
        .rl.top { top: -15px; left: 50%; transform: translateX(-50%); }
        .rl.right { top: 35px; right: -30px; }
        .rl.bottom-right { bottom: -10px; right: -15px; }
        .rl.bottom-left { bottom: -10px; left: -25px; }
        .rl.left { top: 35px; left: -30px; }

        .dl-radar-btn {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: none;
          color: #a78bfa;
          padding: 8px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }

        /* MAIN CONTENT */
        .dl-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .dl-topbar {
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }
        .dl-search-container {
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 10px 16px;
          width: 400px;
          max-width: 100%;
          gap: 12px;
        }
        .dl-search-icon { color: #6b7280; }
        .dl-search-container input {
          background: none;
          border: none;
          color: white;
          width: 100%;
          outline: none;
          font-size: 0.95rem;
        }
        .dl-search-container input::placeholder { color: #4b5563; }

        .dl-top-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .dl-btn-primary {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          cursor: pointer;
        }
        .dl-btn-icon {
          position: relative;
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
        }
        .dl-btn-icon:hover { background: rgba(255,255,255,0.05); }
        .dl-notification-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          background: #ef4444;
          color: white;
          font-size: 0.6rem;
          font-weight: 800;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dl-profile-dropdown {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .dl-profile-dropdown img {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }
        .dl-profile-dropdown span {
          font-weight: 600;
          font-size: 0.9rem;
        }

        .dl-content-scroll {
          flex: 1;
          overflow-x: hidden;
          padding: 32px;
        }
        .dl-content-scroll::-webkit-scrollbar { display: none; }

        /* RIGHT SIDEBAR */
        .dl-sidebar-right {
          width: 320px;
          background: rgba(255,255,255,0.02);
          border-left: 1px solid rgba(255,255,255,0.05);
          padding: 24px 20px;
          flex-shrink: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .dl-sidebar-right::-webkit-scrollbar { display: none; }

        .dl-right-section { display: flex; flex-direction: column; gap: 16px; }
        .dl-algo-active-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .dl-algo-active-header h3 { margin: 0 0 4px 0; font-size: 1.1rem; }
        .dl-algo-active-header span { color: #a78bfa; font-size: 0.8rem; font-weight: 600; }
        .dl-algo-subtitle { font-size: 0.85rem; color: #9ca3af; margin: 0; }
        
        .dl-algo-stats { display: flex; flex-direction: column; gap: 12px; }
        .dl-algo-row { display: flex; justify-content: space-between; align-items: center; }
        .dl-algo-label { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #d1d5db; line-height: 1.2; }
        .dl-algo-dot { width: 8px; height: 8px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.5); }
        .dl-algo-dot.green { border-color: #34d399; }
        .dl-algo-dot.teal { border-color: #2dd4bf; }
        .dl-algo-dot.orange { border-color: #fb923c; }
        .dl-algo-dot.yellow { border-color: #facc15; }
        .dl-algo-dot.red { border-color: #f87171; }
        .dl-algo-val { font-weight: 700; font-size: 0.9rem; }

        .dl-btn-secondary {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #a78bfa;
          padding: 10px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .dl-section-header { display: flex; justify-content: space-between; align-items: center; }
        .dl-section-header h3 { margin: 0; font-size: 1rem; }
        .dl-link { font-size: 0.8rem; color: #a78bfa; cursor: pointer; }

        .dl-rec-list { display: flex; flex-direction: column; gap: 16px; }
        .dl-rec-item { display: flex; align-items: center; gap: 12px; }
        .dl-rec-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
        .dl-rec-info { flex: 1; line-height: 1.3; }
        .dl-rec-info p { margin: 0; font-size: 0.75rem; color: #9ca3af; }
        .dl-rec-info h4 { margin: 2px 0; font-size: 0.85rem; color: #e5e7eb; }
        .dl-rec-info span { font-size: 0.7rem; color: #6b7280; }
        .dl-rec-thumb { width: 60px; height: 40px; border-radius: 8px; object-fit: cover; }

        .dl-curator-list { display: flex; flex-direction: column; gap: 16px; }
        .dl-curator-item { display: flex; align-items: center; gap: 12px; }
        .dl-curator-item img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        .dl-curator-item div:nth-child(2) { flex: 1; }
        .dl-curator-item h4 { margin: 0; font-size: 0.9rem; }
        .dl-curator-item span { font-size: 0.8rem; color: #9ca3af; }
        .dl-cur-count { font-size: 0.75rem; color: #6b7280; }
        
        /* RESPONSIVE: Hide sidebars on mobile, show BottomNav */
        @media (max-width: 1024px) {
          .dl-sidebar-left,
          .dl-sidebar-right {
            display: none !important;
          }
          
          .dl-topbar {
            padding: 0 16px;
            gap: 12px;
          }

          .dl-search-container {
            width: auto;
            flex: 1;
          }

          .dl-btn-primary {
            display: none;
          }

          .dl-profile-dropdown span {
            display: none;
          }
          
          .dl-content-scroll {
            padding: 16px;
            padding-bottom: 90px; /* space for bottom nav */
          }
          
          .dl-mobile-nav {
            display: block;
            z-index: 999;
          }
        }
      `}</style>
    </div>
  );
}
