import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Tv,
  Radio,
  Film,
  Maximize,
  ChevronRight,
  ChevronLeft,
  MonitorPlay,
  Video,
  Music,
  BookOpen,
  Compass,
  Bookmark
} from 'lucide-react';
import { YOUTUBE_VIDEO_POOLS } from '../lib/youtube';
import { UNIVERSAL_CATALOG } from '../lib/universalChannels';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { CuratedSignalsDiscoverSection } from '../components/tv/CuratedSignalsDiscoverSection';
import { AtlasForYouPlanner } from '../components/tv/AtlasForYouPlanner';
import { AtlasBuildSignalBox } from '../components/tv/AtlasBuildSignalBox';
import { SIGNALS_100_CATALOG } from '../lib/tv/signals100Catalog';

const HOME_FEATURED_SIGNALS = [
  ...SIGNALS_100_CATALOG.filter((s) => s.theme === 'cultura').slice(0, 4),
  ...SIGNALS_100_CATALOG.filter((s) => s.theme === 'musica').slice(0, 4),
  ...SIGNALS_100_CATALOG.filter((s) => s.theme === 'mundo').slice(0, 4)
];

const HUD_ITEMS = [
  { id: 'buscar', icon: Search, label: 'BUSCAR', route: '/search', angleDeg: -90 },
  { id: 'mitv', icon: Tv, label: 'MITV', route: '/mitv', angleDeg: -45 },
  { id: 'music', icon: Music, label: 'YOU MUSIC', route: '/youmusic', angleDeg: 0 },
  { id: 'reels', icon: Film, label: 'REELS', route: '/reels', angleDeg: 45 },
  { id: 'lecturas', icon: BookOpen, label: 'LECTURAS', route: '/lecturas', angleDeg: 90 },
  { id: 'listas', icon: Bookmark, label: 'MIS LISTAS', route: '/my-lists', angleDeg: 135 },
  { id: 'misenal', icon: Radio, label: 'MI SEÑAL', route: '/misenal1', angleDeg: 180 },
  { id: 'agrandar', icon: Maximize, label: 'AGRANDAR', route: '/mitv', angleDeg: 225 },
];

function describeAnnularSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(toRad(startDeg));
  const y1 = cy + rOuter * Math.sin(toRad(startDeg));
  const x2 = cx + rOuter * Math.cos(toRad(endDeg));
  const y2 = cy + rOuter * Math.sin(toRad(endDeg));
  const x3 = cx + rInner * Math.cos(toRad(endDeg));
  const y3 = cy + rInner * Math.sin(toRad(endDeg));
  const x4 = cx + rInner * Math.cos(toRad(startDeg));
  const y4 = cy + rInner * Math.sin(toRad(startDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z'
  ].join(' ');
}

export default function Home() {
  const navigate = useNavigate();

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
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

  const audioSource = ""; // Eliminado para evitar 403 y conflictos de AbortError cruzado

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      const p = (mediaRef.current.currentTime / mediaRef.current.duration) * 100;
      setProgress(isNaN(p) ? 0 : p);
    }
  };

  const orbAmbientThumb = '/home-keynote-stage-bg.jpg';

  return (
    <div className="home-layout">
      <div
        className="home-ambient-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${orbAmbientThumb})` }}
      />
      <div className="home-ambient-veil" aria-hidden="true" />

      {/* ── TOP NAV ── */}
      <nav className="home-navbar">
        <YouAppOfficialLogo theme="dark" />
        
        <div className="nav-links">
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/misenal1')} title="MI SEÑAL" aria-label="MI SEÑAL">
            <Radio size={17} />
          </button>
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/mitv')} title="MITV" aria-label="MITV">
            <Tv size={17} />
          </button>
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/youmusic')} title="YOU MUSIC" aria-label="YOU MUSIC">
            <Music size={17} />
          </button>
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/reels')} title="REELS" aria-label="REELS">
            <Film size={17} />
          </button>
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/lecturas')} title="LECTURAS" aria-label="LECTURAS">
            <BookOpen size={17} />
          </button>
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/my-lists')} title="MIS LISTAS" aria-label="MIS LISTAS">
            <Bookmark size={17} />
          </button>
          <button type="button" className="nav-link nav-icon-only" onClick={() => navigate('/search')} title="BUSCAR" aria-label="BUSCAR">
            <Search size={17} />
          </button>
        </div>

        <div className="user-area">
          <TvUserSessionMenu variant="glass" />
        </div>
      </nav>

      {/* ── MAIN MIDDLE SECTION ── */}
      <div className="home-middle-section">
        {/* ── DIAL (ARO) ── */}
        <div className="center-dial">
          <div className="dial-wrapper">
            
            {/* El Aro Físico de Cristal Limpio */}
            <div className="dial-physical-ring" />

            {/* 8 Sectores Interactivos con Líneas Divisorias y Hover en Todo el Espacio */}
            <svg className="dial-sectors-svg" viewBox="0 0 740 740" aria-hidden="true">
              {HUD_ITEMS.map((item) => {
                const d = describeAnnularSector(370, 370, 280, 369, item.angleDeg - 22.5, item.angleDeg + 22.5);
                const isActive = hoveredItem === item.id;
                return (
                  <path
                    key={`sector-${item.id}`}
                    d={d}
                    className={`dial-sector-path ${isActive ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => navigate(item.route)}
                  />
                );
              })}
            </svg>

            {/* Anillo de Íconos (solo Buscar y Agrandar) */}
            <div className="dial-ring">
              {HUD_ITEMS.map((item) => {
                const angleRad = (item.angleDeg * Math.PI) / 180;
                const ringRadius = 325;
                const x = Math.cos(angleRad) * ringRadius;
                const y = Math.sin(angleRad) * ringRadius;

                return (
                  <div 
                    key={item.id}
                    className="dial-segment-icon"
                    style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
                  >
                    <button 
                      className={`dial-icon-btn ${hoveredItem === item.id ? 'active' : ''}`}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={() => navigate(item.route)}
                      title={item.label}
                    >
                      <item.icon size={24} strokeWidth={1.7} className="ring-icon" />
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
                  src="https://www.youtube.com/embed/BHACKCNDMW8?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=BHACKCNDMW8&modestbranding=1"
                  allow="autoplay; encrypted-media"
                  style={{ width: '195%', height: '195%', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', border: 'none' }}
                />
                {audioSource && (
                  <audio 
                    ref={mediaRef}
                    src={audioSource}
                    onTimeUpdate={handleTimeUpdate}
                  />
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── MI SEÑAL VIVA: 3 SEÑALES CURADAS POR PERSONAS ── */}
      <AtlasForYouPlanner />
      {/* ── VITRINA PROTAGONISTA: ARMÁ TU SEÑAL CON ATLAS + 100 SEÑALES TEMÁTICAS ── */}
      <section className="home-signals-showcase" aria-label="Armá tu señal y explorá 100 señales">
        <AtlasBuildSignalBox compact />

        <div className="home-sig-strip-head">
          <div>
            <h3>100 Señales Temáticas listas para ver</h3>
            <span>Cultura & Saber · Música & Escena · Deportes & Mundo</span>
          </div>
          <button
            type="button"
            className="home-sig-all-btn"
            onClick={() => navigate('/senales')}
          >
            <span>Ver las 100 señales</span>
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="home-sig-carousel">
          {HOME_FEATURED_SIGNALS.map((sig) => (
            <button
              key={sig.id}
              type="button"
              className="home-sig-card"
              onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
            >
              <img
                src={`https://i.ytimg.com/vi/${sig.coverVideoId}/hqdefault.jpg`}
                alt={sig.title}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="home-sig-scrim" />
              <span className="home-sig-pill" style={{ borderColor: sig.accent }}>
                <Radio size={10} color="#64d2ff" />
                <span>{sig.videos.length} videos</span>
              </span>
              <div className="home-sig-info">
                <strong>{sig.title}</strong>
                <span>{sig.subtitle}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <CuratedSignalsDiscoverSection />

      {/* ── BOTTOM GRID SECTION ── */}
      <div className="home-bottom-grid">
        {/* Col 1 */}
        <div className="grid-col col-segui-viendo">
          <div className="section-header">
            <h3>Seguí viendo</h3>
            <ChevronRight size={16} className="text-gray" />
          </div>
          {(() => {
            const vid = {
              id: '0cjWa3Eizqw',
              title: '¿Qué es la Rerum Novarum? · Historia social',
              author: 'Justicia Social TV',
              duration: '10:00',
              time: 'En tu señal'
            };
            return (
              <div 
                className="video-card-unified" 
                onClick={() => navigate(`/ai-summary/${vid.id}`, { state: vid })}
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
                className="home-carousel-btn"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => scroll('right')}
                className="home-carousel-btn"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="horizontal-scroll" ref={scrollRef} style={{ scrollBehavior: 'smooth' }}>
            {[
              { id: '0cjWa3Eizqw', title: '¿Qué es la Rerum Novarum? · Justicia Social', author: 'Justicia Social TV', duration: '10:00' },
              { id: 'RPYfIrlMYos', title: 'Papa León XIV · Discursos Completos en Argentina', author: 'Justicia Social TV', duration: '08:00' },
              ...Object.values(YOUTUBE_VIDEO_POOLS).flat().slice(0, 13)
            ].map((vid, i) => (
              <div 
                key={`${vid.id}-${i}`} 
                className="video-card-unified"
                onClick={() => navigate(`/ai-summary/${vid.id}`, { state: vid })}
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
        .home-signals-showcase {
          position: relative;
          z-index: 4;
          width: 100%;
          max-width: 1120px;
          margin: 10px auto 18px;
          padding: 0 18px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .home-sig-strip-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .home-sig-strip-head h3 {
          margin: 0;
          font-size: 15.5px;
          font-weight: 760;
          color: #ffffff;
        }
        .home-sig-strip-head span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }
        .home-sig-all-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.45);
          background: rgba(0, 113, 227, 0.28);
          color: #e0f2fe;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .home-sig-all-btn:hover {
          background: #0071e3;
          color: #ffffff;
        }
        .home-sig-carousel {
          display: flex;
          flex-wrap: nowrap;
          gap: 10px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 4px;
        }
        .home-sig-carousel::-webkit-scrollbar {
          display: none;
        }
        .home-sig-card {
          position: relative;
          width: 224px;
          aspect-ratio: 16 / 9;
          flex-shrink: 0;
          padding: 0;
          border-radius: 15px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          overflow: hidden;
          background: #0b101b;
          cursor: pointer;
          text-align: left;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .home-sig-card:hover {
          transform: translateY(-2px);
          border-color: rgba(100, 210, 255, 0.55);
        }
        .home-sig-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .home-sig-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.08) 42%, rgba(0,0,0,0.85) 100%);
        }
        .home-sig-pill {
          position: absolute;
          top: 7px;
          left: 7px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.78);
          border: 1px solid rgba(100, 210, 255, 0.48);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
        }
        .home-sig-info {
          position: absolute;
          left: 9px;
          right: 9px;
          bottom: 8px;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .home-sig-info strong {
          font-size: 12.5px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .home-sig-info span {
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.76);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 640px) {
          .home-signals-showcase {
            padding: 0 12px;
          }
          .home-sig-card {
            width: 196px;
          }
        }
        /* APPLE GLASS DARK FROSTED SKIN (Unificado con Mi Señal / MiTV / YOU MUSIC / Reels / Lecturas) */
        .home-layout {
          position: relative;
          isolation: isolate;
          min-height: 100dvh;
          background-color: #14161a;
          color: #f5f5f7;
          display: flex;
          flex-direction: column;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          padding-bottom: 48px;
        }
        .home-ambient-bg {
          position: fixed;
          inset: -14px;
          z-index: 0;
          background-color: #16293a;
          background-size: cover;
          background-position: center;
          opacity: 1;
          filter: brightness(0.74) contrast(1.08);
          transform: scale(1.02) translateZ(0);
          contain: strict;
          pointer-events: none;
          overflow: hidden;
          transition: background-image 0.45s ease;
        }
        .home-ambient-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            rgba(18, 22, 30, 0.24) 0%,
            rgba(22, 26, 34, 0.16) 48%,
            rgba(14, 18, 26, 0.36) 100%
          );
          pointer-events: none;
        }
        .home-layout > *:not(.home-ambient-bg):not(.home-ambient-veil) {
          position: relative;
          z-index: 2;
        }

        /* ── NAVBAR (Cristal puro nítido sin desenfoque) ── */
        .home-navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 12px 32px;
          background: transparent;
          border-bottom: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: none;
          position: sticky;
          top: 0;
          z-index: 60;
        }

        .nav-links {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .nav-link {
          background: transparent;
          border: 1px solid transparent;
          color: rgba(245, 245, 247, 0.82);
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: 999px;
          transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
        }
        .nav-link.nav-icon-only {
          width: 36px;
          height: 36px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .nav-link:hover,
        .nav-link.active {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(100, 210, 255, 0.55);
        }

        .user-area {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .icon-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: rgba(245, 245, 247, 0.85);
          width: 34px;
          height: 34px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.16s ease, color 0.16s ease;
        }
        .icon-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }

        /* ── SEARCH BAR ── */
        .home-search-container {
          display: flex;
          justify-content: center;
          margin-top: 22px;
          margin-bottom: 18px;
          padding: 0 20px;
        }
        .search-input-wrapper {
          display: flex;
          align-items: center;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.07) 0%,
            rgba(255, 255, 255, 0.015) 50%,
            rgba(255, 255, 255, 0.05) 100%
          );
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border-radius: 999px;
          padding: 6px 6px 6px 20px;
          width: 100%;
          max-width: 600px;
          border-top: 1.5px solid rgba(255, 255, 255, 0.72);
          border-left: 1.5px solid rgba(255, 255, 255, 0.50);
          border-right: 1.5px solid rgba(255, 255, 255, 0.36);
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.48);
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.72),
            0 12px 30px rgba(0, 0, 0, 0.18);
        }
        .search-icon { color: rgba(245, 245, 247, 0.55); }
        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          padding: 0 14px;
          font-size: 0.96rem;
          color: #f5f5f7;
          outline: none;
        }
        .search-input::placeholder { color: rgba(245, 245, 247, 0.52); }
        
        .btn-ai-search {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: #0071e3;
          color: #ffffff;
          border: 1px solid rgba(100, 210, 255, 0.55);
          border-radius: 999px;
          padding: 9px 18px;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 113, 227, 0.35);
          transition: background 0.16s ease;
        }
        .btn-ai-search:hover {
          background: #0a84ff;
        }

        /* ── MIDDLE SECTION ── */
        .home-middle-section {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0 32px;
          margin-top: 12px;
          position: relative;
        }
        .text-blue { color: #64d2ff; }

        /* ── CENTER DIAL (APPLE GLASS FROSTED RING) ── */
        .center-dial {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }

        .dial-wrapper {
          position: relative;
          width: 740px;
          height: 740px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* The Frosted Crystal Glass Outer Ring (cristal puro nítido sin desenfoque) */
        .dial-physical-ring {
          position: absolute;
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.04);
          -webkit-mask-image: radial-gradient(circle, transparent 278px, #000 280px);
          mask-image: radial-gradient(circle, transparent 278px, #000 280px);
          border: 1.5px solid rgba(255, 255, 255, 0.68);
          box-shadow:
            inset 0 1px 8px rgba(255, 255, 255, 0.24),
            0 12px 32px rgba(0, 0, 0, 0.16);
          z-index: 1;
        }

        /* Sectores SVG interactivos con líneas divisorias y hover en toda la porción */
        .dial-sectors-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 3;
          pointer-events: none;
        }
        .dial-sector-path {
          fill: transparent;
          stroke: rgba(255, 255, 255, 0.34);
          stroke-width: 1.25;
          pointer-events: all;
          cursor: pointer;
          transition: fill 0.18s ease, stroke 0.18s ease;
        }
        .dial-sector-path:hover,
        .dial-sector-path.active {
          fill: rgba(255, 255, 255, 0.22);
          stroke: rgba(100, 210, 255, 0.85);
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
          color: rgba(245, 245, 247, 0.8);
          transition: all 0.2s;
        }
        .dial-icon-btn .ring-icon {
          color: rgba(245, 245, 247, 0.85);
          transition: color 0.2s;
        }
        .dial-icon-btn .ring-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.72);
          white-space: nowrap;
        }
        
        .dial-icon-btn.active .ring-icon,
        .dial-icon-btn:hover .ring-icon {
          color: #64d2ff;
        }
        .dial-icon-btn.active .ring-label,
        .dial-icon-btn:hover .ring-label {
          color: #64d2ff;
        }
        .dial-icon-btn.active {
          position: relative;
        }
        .dial-icon-btn.active::before {
          content: '';
          position: absolute;
          top: -15px;
          width: 20px;
          height: 3px;
          background: #64d2ff;
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


        .home-carousel-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #f5f5f7;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.16s ease;
        }
        .home-carousel-btn:hover {
          background: rgba(255, 255, 255, 0.16);
        }

        /* ── BOTTOM GRID ── */
        .home-bottom-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          padding: 32px 48px;
          margin-top: 28px;
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
          margin-bottom: 16px;
        }
        .section-header h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #f5f5f7;
          margin: 0;
        }
        .text-gray { color: rgba(245, 245, 247, 0.58); }

        /* Unified Video Card (Cristal biselado Glassmorphism con canto luminoso doble) */
        .video-card-unified {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.02) 50%,
            rgba(255, 255, 255, 0.06) 100%
          );
          border-radius: 22px;
          overflow: hidden;
          border-top: 1.5px solid rgba(255, 255, 255, 0.78);
          border-left: 1.5px solid rgba(255, 255, 255, 0.56);
          border-right: 1.5px solid rgba(255, 255, 255, 0.42);
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.54);
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.85),
            inset 0 -1px 2px rgba(255, 255, 255, 0.45),
            inset 0 0 18px rgba(255, 255, 255, 0.12),
            0 16px 40px rgba(0, 0, 0, 0.26);
          cursor: pointer;
          transition: transform 0.2s, background 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
        }
        .video-card-unified:hover {
          transform: translateY(-3px);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.95),
            inset 0 -1px 3px rgba(255, 255, 255, 0.55),
            inset 0 0 22px rgba(255, 255, 255, 0.18),
            0 20px 46px rgba(0, 0, 0, 0.32);
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
          background: rgba(0, 0, 0, 0.78);
          color: #ffffff;
          padding: 3px 6px;
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
          font-size: 0.92rem;
          color: #f5f5f7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .video-card-unified .card-info p {
          margin: 0;
          font-size: 0.78rem;
          color: rgba(245, 245, 247, 0.62);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Tu Programación (Cristal biselado Glassmorphism) */
        .program-list-card {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.02) 50%,
            rgba(255, 255, 255, 0.06) 100%
          );
          border-radius: 22px;
          padding: 14px;
          border-top: 1.5px solid rgba(255, 255, 255, 0.78);
          border-left: 1.5px solid rgba(255, 255, 255, 0.56);
          border-right: 1.5px solid rgba(255, 255, 255, 0.42);
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.54);
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.85),
            inset 0 -1px 2px rgba(255, 255, 255, 0.45),
            inset 0 0 18px rgba(255, 255, 255, 0.12),
            0 16px 40px rgba(0, 0, 0, 0.26);
          display: flex;
          flex-direction: column;
          gap: 10px;
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
          background: rgba(255, 255, 255, 0.08);
        }
        .program-item.active {
          background: rgba(0, 113, 227, 0.22);
        }
        .active-indicator {
          position: absolute;
          left: -4px;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 24px;
          background: #64d2ff;
          border-radius: 4px;
        }
        .prog-time {
          font-weight: 700;
          color: #64d2ff;
          font-size: 0.85rem;
          min-width: 46px;
        }
        .prog-info h4 {
          margin: 0 0 2px 0;
          font-size: 0.88rem;
          color: #f5f5f7;
        }
        .prog-info p {
          margin: 0;
          font-size: 0.74rem;
          color: rgba(245, 245, 247, 0.62);
        }

        /* Explorar */
        .explore-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .explore-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.02) 50%,
            rgba(255, 255, 255, 0.06) 100%
          );
          border-top: 1.5px solid rgba(255, 255, 255, 0.78);
          border-left: 1.5px solid rgba(255, 255, 255, 0.56);
          border-right: 1.5px solid rgba(255, 255, 255, 0.42);
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.54);
          padding: 14px 18px;
          border-radius: 20px;
          font-size: 0.92rem;
          font-weight: 600;
          color: #ffffff;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
          cursor: pointer;
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.85),
            inset 0 -1px 2px rgba(255, 255, 255, 0.45),
            inset 0 0 16px rgba(255, 255, 255, 0.12),
            0 12px 32px rgba(0, 0, 0, 0.22);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .explore-btn:hover {
          transform: translateY(-2px);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.95),
            inset 0 -1px 3px rgba(255, 255, 255, 0.55),
            inset 0 0 22px rgba(255, 255, 255, 0.20),
            0 16px 38px rgba(0, 0, 0, 0.28);
        }
        .explore-btn .arrow {
          margin-left: auto;
          color: rgba(245, 245, 247, 0.55);
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
            transform: scale(0.45);
            margin-top: -195px;
            margin-bottom: -195px;
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
