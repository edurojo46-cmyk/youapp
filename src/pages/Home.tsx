import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, Radio, Tv, Sparkles, Search, Bell, Cpu, Landmark, 
  Scale, Brain, Send, Gem, Compass, Home as HomeIcon, 
  Folder, Sliders, ChevronRight, Zap, X, Check, Heart, 
  ThumbsUp, HelpCircle, Clock, Dices, Eye, UserPlus, Star
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { UNIVERSAL_CATALOG, type UniversalChannel } from '../lib/universalChannels';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useStore();

  // Estados interactivos
  const [activePill, setActivePill] = useState<'mitv' | 'you4' | 'canales' | 'vip' | 'explorar'>('mitv');
  const [promptText, setPromptText] = useState('');
  const [showYouControl, setShowYouControl] = useState(false);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [showAiProgramModal, setShowAiProgramModal] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<any>(null);
  const [selectedCreator, setSelectedCreator] = useState<any>(null);
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);

  // Estados de YOUCONTROL (Algoritmo personalizado)
  const [controlMode, setControlMode] = useState<'preciso' | 'equilibrado' | 'explorador'>('equilibrado');
  const [discoveryPercent, setDiscoveryPercent] = useState(30);
  const [dnaThemes, setDnaThemes] = useState([
    { name: 'Tecnología', pct: 30, color: '#6366f1' },
    { name: 'Política', pct: 25, color: '#3b82f6' },
    { name: 'Economía', pct: 20, color: '#ec4899' },
    { name: 'Historia', pct: 15, color: '#a855f7' },
    { name: 'Descubrimiento', pct: 10, color: '#10b981' }
  ]);

  // Canales en Vivo Reales para la Home
  const liveCreators = useMemo(() => {
    // 1. Canales guardados por el usuario
    let userChannels: UniversalChannel[] = [];
    try {
      userChannels = JSON.parse(localStorage.getItem('youapp_saved_custom_channels') || '[]');
    } catch {}

    // 2. Canales destacados en vivo reales
    const featuredRealChannels: UniversalChannel[] = [
      {
        id: 'custom-yt-UCRtgbxUH456ox51IswIQgZQ',
        channelId: 'UCRtgbxUH456ox51IswIQgZQ',
        name: 'Carnaval Stream',
        category: '🎉 Streaming & Entretenimiento',
        description: 'Emisión oficial de Carnaval Stream en vivo',
        avatarUrl: 'https://yt3.ggpht.com/Iyl2pqHYrhTadZONr4EZ6AjwwxNS_w5idduTOqXxy0ZMPsMVruM5EuETa7seQRdLSNOCUP7r=s800-c-k-c0x00ffffff-no-rj',
        thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
        provider: 'youtube',
        videoId: 'IUrWKJbOyJs',
        videoUrl: 'https://www.youtube.com/embed/IUrWKJbOyJs',
        currentVideoTitle: 'VISITANTES EN VIVO',
        viewerCount: 38400,
        isLive: true,
        tags: ['carnaval', 'stream', 'duka', 'visitas']
      },
      {
        id: 'custom-yt-UCiPqb8qbvCBjAFHc-KMujBw',
        channelId: 'UCiPqb8qbvCBjAFHc-KMujBw',
        name: 'CANAL 22 / Cúneo',
        category: '🔴 Política & Noticias',
        description: 'Transmisión oficial de CANAL 22 y Santiago Cúneo en vivo',
        avatarUrl: 'https://yt3.ggpht.com/jHzVg6dtilEqyvBN8U67hbnJCAH6F7V1AvXq_WjV7TnP7NiLVn4oyFVtTRK4rUeH6i_AA_67ew=s800-c-k-c0x00ffffff-no-rj',
        thumbnail: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800',
        provider: 'youtube',
        videoId: 'BpGiFNV1iSY',
        videoUrl: 'https://www.youtube.com/embed/BpGiFNV1iSY',
        currentVideoTitle: 'CANAL 22 - EN VIVO!',
        viewerCount: 54100,
        isLive: true,
        tags: ['cuneo', 'canal22', 'politica', 'argentina']
      },
      {
        id: 'ch-americatv',
        channelId: 'UC6NVDkuzY2exMOVFw4i9oHw',
        name: 'América TV',
        category: '🔴 Televisión en Vivo',
        description: 'Transmisión oficial de América TV en directo las 24 horas',
        avatarUrl: 'https://yt3.googleusercontent.com/vIYh4fJ4FiOeD0U8sGUEUZQf3DaK-PME00Ckh7cFf4CRmC3EHopvUsjbgYKhNVkFXURSzltWYQ=s900-c-k-c0x00ffffff-no-rj',
        thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800',
        provider: 'youtube',
        videoId: '3y-Nke9M1Lo',
        videoUrl: 'https://www.youtube.com/embed/3y-Nke9M1Lo',
        currentVideoTitle: 'América TV - Transmisión en Directo',
        viewerCount: 62300,
        isLive: true,
        tags: ['america', 'noticias', 'intrusos']
      },
      {
        id: 'ch-cronicatv',
        channelId: 'UCT7KFGv6s2a-rh2Jq8ZdM1g',
        name: 'Crónica TV',
        category: '🔴 Noticias en Vivo 24/7',
        description: 'Transmisión oficial de Crónica TV en vivo',
        avatarUrl: 'https://yt3.googleusercontent.com/EGyrGJo_3mJxohmZxkP0Ksma9r1J1fU1ORZkGkwJkGJKRyeu6aHTD_Zi-4AodbD0hLRnTzoCWA=s900-c-k-c0x00ffffff-no-rj',
        thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800',
        provider: 'youtube',
        videoId: 'hw4uHyct4vg',
        videoUrl: 'https://www.youtube.com/embed/hw4uHyct4vg',
        currentVideoTitle: 'Crónica TV - En Vivo 24 Horas',
        viewerCount: 47800,
        isLive: true,
        tags: ['cronica', 'noticias', 'argentina']
      },
      {
        id: 'ch-luzutv',
        channelId: 'UCH1qC2yP51B-7a4zN_Lrqpg',
        name: 'LUZU TV',
        category: '⚡ Streaming en Vivo',
        description: 'Nadie Dice Nada, Antes Que Nadie y programación completa',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
        thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
        provider: 'youtube',
        videoId: 'b94k6v3aZ4c',
        videoUrl: 'https://www.youtube.com/embed/b94k6v3aZ4c',
        currentVideoTitle: 'LUZU TV - EN VIVO',
        viewerCount: 92400,
        isLive: true,
        tags: ['luzu', 'nadie dice nada', 'nico occhiato']
      },
      {
        id: 'ch-olga',
        channelId: 'UCgB6b4xU3jR7g0xG5Q-7a9A',
        name: 'Olga en Vivo',
        category: '⚡ Streaming & Humor',
        description: 'Soñé que Volaba con Migue Granados',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300',
        thumbnail: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800',
        provider: 'youtube',
        videoId: 'f94k6v3aZ4c',
        videoUrl: 'https://www.youtube.com/embed/f94k6v3aZ4c',
        currentVideoTitle: 'OLGA - Transmisión en Directo',
        viewerCount: 88100,
        isLive: true,
        tags: ['olga', 'migue granados', 'streaming']
      }
    ];

    // Combinar los canales del usuario primero, luego los destacados del catálogo
    const catalogLive = UNIVERSAL_CATALOG.filter(c => c.isLive);
    const all = [...userChannels, ...featuredRealChannels, ...catalogLive];
    const seen = new Set<string>();

    return all.filter(c => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    }).slice(0, 10).map(c => ({
      id: c.id,
      name: c.name,
      tag: c.category.replace(/[🔴⚡🎉★🌟]/g, '').trim(),
      topic: c.currentVideoTitle || c.description,
      avatar: c.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
      viewers: `${(c.viewerCount || 24500).toLocaleString('es-AR')}`,
      tvsAdded: `${Math.floor((c.viewerCount || 24500) * 3.4).toLocaleString('es-AR')}`,
      currentShow: c.currentVideoTitle || `Transmisión oficial de ${c.name}`,
      channelData: c
    }));
  }, []);

  // Canales Temáticos
  const channelsList = [
    { id: 'tech', title: 'Tecnología', icon: Cpu, color: 'indigo', count: '142 programas' },
    { id: 'historia', title: 'Historia', icon: Landmark, color: 'magenta', count: '89 documentales' },
    { id: 'politica', title: 'Política', icon: Scale, color: 'blue', count: '64 debates' },
    { id: 'ia', title: 'IA', icon: Brain, color: 'purple', count: '210 novedades' }
  ];

  // Manejar el prompt "Pedile a YOUAPP"
  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    const query = promptText.trim();
    // Simular creación instantánea de programación IA
    setGeneratedSchedule({
      title: `Tu canal para ahora: "${query}"`,
      totalMinutes: 38,
      items: [
        { num: '01', title: 'Introducción & Contexto', duration: '8 min', creator: liveCreators[0]?.name || 'YouApp TV' },
        { num: '02', title: 'Perspectiva Empresarial y Económica', duration: '11 min', creator: liveCreators[1]?.name || 'Noticias' },
        { num: '03', title: 'Perspectiva Académica y Futuro', duration: '9 min', creator: liveCreators[2]?.name || 'Streaming' },
        { num: '04', title: 'Debate y Conclusiones en Vivo', duration: '10 min', creator: liveCreators[3]?.name || 'Canal 22' }
      ]
    });
    setShowAiProgramModal(true);
  };

  const handleCreatorClick = (creator: any) => {
    if (creator.id) {
      localStorage.setItem('youapp_active_channel_id', creator.id);
      navigate('/live');
    } else {
      setSelectedCreator(creator);
      setShowCreatorModal(true);
    }
  };

  return (
    <div className="youapp-mobile-root">
      {/* Fondo Glow Ambiental */}
      <div className="ambient-glow glow-top-left" />
      <div className="ambient-glow glow-bottom-right" />

      {/* Contenedor Mockup Celular / Vista Central */}
      <div className="phone-screen-container">

        {/* 1. Header Superior */}
        <header className="youapp-top-bar">
          <div className="brand-logo" onClick={() => navigate('/')}>
            <div className="logo-symbol">
              <svg viewBox="0 0 100 100" className="neon-triangle-svg">
                <defs>
                  <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ec4899" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <polygon 
                  points="20,15 85,50 20,85" 
                  fill="url(#neonGrad)" 
                  filter="url(#neonGlow)"
                />
                <polygon 
                  points="35,32 70,50 35,68" 
                  fill="#ffffff" 
                  opacity="0.9"
                />
              </svg>
            </div>
            <span className="brand-title">YOUAPP</span>
          </div>

          <div className="top-bar-actions">
            <button className="icon-btn" onClick={() => navigate('/search')} title="Buscar">
              <Search size={20} />
            </button>
            <button className="icon-btn notif-btn" onClick={() => setShowWhyModal(true)} title="¿Por qué me mostrás esto?">
              <Bell size={20} />
              <span className="badge-dot" />
            </button>
            <div className="user-avatar-wrap" onClick={() => setShowYouControl(true)} title="YOUCONTROL - Tu ADN">
              <img 
                src={(user as any)?.user_metadata?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150"} 
                alt="Usuario" 
                className="user-avatar"
              />
              <span className="avatar-glow-ring" />
            </div>
          </div>
        </header>


        {/* 2. Hero Título */}
        <section className="hero-greeting-section">
          <h1 className="hero-title">Tu TV está lista</h1>
          <p className="hero-subtitle">Contenido que te inspira, siempre.</p>
        </section>


        {/* 3. Hero Card: "Continuar Mi TV" */}
        <section className="main-hero-card-section">
          <div className="hero-play-card" onClick={() => {
            if (liveCreators[0]?.id) {
              localStorage.setItem('youapp_active_channel_id', liveCreators[0].id);
            }
            navigate('/live');
          }}>
            <div className="hero-card-glow-bg" />
            
            {/* Botón 3D Play de Neón */}
            <div className="hero-play-symbol-wrap">
              <div className="neon-swirl-ring" />
              <div className="play-triangle-center">
                <Play size={26} fill="white" color="white" />
              </div>
            </div>

            {/* Info de Programación Real */}
            <div className="hero-channel-info">
              <span className="continue-label">Continuar</span>
              <h2 className="channel-main-name">{liveCreators[0]?.name || 'YouApp TV'}</h2>
              <div className="now-next-row">
                <p className="now-playing">
                  <span className="bullet bullet-purple">●</span> Ahora: <strong>{liveCreators[0]?.currentShow?.slice(0, 34) || 'En Directo 24/7'}</strong>
                </p>
                <p className="next-playing">
                  <span className="bullet bullet-pink">●</span> Sigue: <strong>{liveCreators[1]?.name || 'Próximo Canal'}</strong>
                </p>
              </div>
            </div>
          </div>
        </section>


        {/* 4. Barra de Pastillas / Modos */}
        <nav className="mode-pills-bar">
          <button 
            className={`pill-btn ${activePill === 'mitv' ? 'active' : ''}`}
            onClick={() => { setActivePill('mitv'); navigate('/live'); }}
          >
            <Play size={15} fill={activePill === 'mitv' ? '#e879f9' : 'none'} />
            <span>Mi TV</span>
          </button>

          <button 
            className={`pill-btn ${activePill === 'you4' ? 'active' : ''}`}
            onClick={() => { setActivePill('you4'); navigate('/live'); }}
          >
            <Zap size={15} color="#e879f9" />
            <span>YOU4</span>
          </button>

          <button 
            className={`pill-btn ${activePill === 'canales' ? 'active' : ''}`}
            onClick={() => { setActivePill('canales'); navigate('/channels'); }}
          >
            <Tv size={15} />
            <span>Canales</span>
          </button>

          <button 
            className={`pill-btn ${activePill === 'vip' ? 'active' : ''}`}
            onClick={() => setShowVipModal(true)}
          >
            <Gem size={15} color="#ec4899" />
            <span>VIP</span>
          </button>

          <button 
            className={`pill-btn ${activePill === 'explorar' ? 'active' : ''}`}
            onClick={() => setShowMoodModal(true)}
          >
            <Compass size={15} />
            <span>Explorar</span>
          </button>
        </nav>


        {/* 5. Sección: En Vivo Ahora > */}
        <section className="live-now-section">
          <div className="section-header" onClick={() => navigate('/live')}>
            <h3>En vivo ahora ({liveCreators.length})</h3>
            <ChevronRight size={18} className="chevron" />
          </div>

          <div className="creators-horizontal-grid">
            {liveCreators.map((creator) => (
              <div 
                key={creator.id} 
                className="creator-card"
                onClick={() => handleCreatorClick(creator)}
                title={`Ver ${creator.name} en vivo`}
              >
                <div className="creator-avatar-wrap">
                  <img src={creator.avatar} alt={creator.name} className="creator-img" />
                  <div className="live-badge-pill">
                    <span>🔴 EN VIVO</span>
                  </div>
                </div>
                <h4 className="creator-name">{creator.name}</h4>
                <p className="creator-tag">{creator.tag}</p>
                <span className="creator-viewers-tag">
                  <Eye size={10} /> {creator.viewers}
                </span>
              </div>
            ))}
          </div>
        </section>


        {/* 6. Sección: Tus Canales > */}
        <section className="your-channels-section">
          <div className="section-header" onClick={() => navigate('/channels')}>
            <h3>Tus canales</h3>
            <ChevronRight size={18} className="chevron" />
          </div>

          <div className="channels-2x2-grid">
            {channelsList.map((ch) => {
              const IconComp = ch.icon;
              return (
                <div 
                  key={ch.id} 
                  className={`channel-glass-box box-${ch.color}`}
                  onClick={() => navigate('/live')}
                >
                  <div className="icon-container">
                    <IconComp size={24} className={`ch-icon icon-${ch.color}`} />
                  </div>
                  <span className="ch-title">{ch.title}</span>
                </div>
              );
            })}
          </div>
        </section>


        {/* 7. Sección: Pedile a YOUAPP */}
        <section className="ask-youapp-section">
          <h3 className="section-title-sm">Pedile a YOUAPP</h3>
          <form className="ask-prompt-box" onSubmit={handlePromptSubmit}>
            <input 
              type="text" 
              placeholder="Quiero 30 minutos sobre IA y economía" 
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="ask-input"
            />
            <button type="submit" className="ask-send-btn">
              <Send size={16} />
            </button>
          </form>
        </section>


        {/* 8. Sección: Primera Fila VIP */}
        <section className="vip-banner-section">
          <div className="vip-promo-card" onClick={() => setShowVipModal(true)}>
            <div className="vip-icon-badge">
              <Gem size={22} color="#ec4899" />
            </div>
            <div className="vip-info">
              <h4 className="vip-title">Primera Fila VIP</h4>
              <p className="vip-desc">Contenido exclusivo, sin cortes y en alta calidad.</p>
            </div>
            <button className="vip-action-btn">
              Ir ahora
            </button>
          </div>
        </section>


        {/* 9. Botón flotante para abrir YOUCONTROL / Director de Programación */}
        <div className="youcontrol-banner-btn" onClick={() => setShowYouControl(true)}>
          <div className="youcontrol-btn-left">
            <Sliders size={18} className="text-accent" />
            <div>
              <strong>YOUCONTROL</strong>
              <span>Vos decidís. La IA organiza tu TV.</span>
            </div>
          </div>
          <span className="youcontrol-pill">Editar ADN</span>
        </div>

      </div>


      {/* 10. Bottom Navigation Bar */}
      <footer className="youapp-bottom-nav">
        <button className="nav-item active" onClick={() => navigate('/')}>
          <HomeIcon size={20} />
          <span>Inicio</span>
        </button>

        <button className="nav-item" onClick={() => navigate('/live')}>
          <Radio size={20} />
          <span>TV en vivo</span>
        </button>

        {/* Botón Central Flotante Neón */}
        <button className="center-fab-launcher" onClick={() => navigate('/live')} title="Play Mi TV">
          <div className="fab-glow-core">
            <Play size={22} fill="white" color="white" />
          </div>
        </button>

        <button className="nav-item" onClick={() => navigate('/channels')}>
          <Folder size={20} />
          <span>Mis canales</span>
        </button>

        <button className="nav-item" onClick={() => setShowVipModal(true)}>
          <Gem size={20} />
          <span>Chat VIP</span>
        </button>
      </footer>


      {/* ========================================================================= */}
      {/* MODAL 1: YOUCONTROL (Director de Programación & ADN de TV) */}
      {/* ========================================================================= */}
      {showYouControl && (
        <div className="youapp-modal-overlay" onClick={() => setShowYouControl(false)}>
          <div className="youcontrol-sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            
            <div className="sheet-header">
              <div>
                <h2>YOUCONTROL</h2>
                <p className="sheet-sub">Vos decidís. Nosotros lo organizamos.</p>
              </div>
              <button className="close-sheet-btn" onClick={() => setShowYouControl(false)}>
                <X size={20} />
              </button>
            </div>

            {/* 1. Control Algorítmico: YO DECIDO vs IA DECIDE */}
            <div className="control-slider-box glass-card">
              <span className="box-label">CONTROL DE DECISIÓN</span>
              <div className="balance-indicator">
                <span className={controlMode === 'preciso' ? 'active-mode' : ''}>YO DECIDO</span>
                <span className="dot-sep">────────●────</span>
                <span className={controlMode === 'explorador' ? 'active-mode' : ''}>IA DECIDE</span>
              </div>

              <div className="mode-cards-row">
                <button 
                  className={`mode-card ${controlMode === 'preciso' ? 'selected' : ''}`}
                  onClick={() => { setControlMode('preciso'); setDiscoveryPercent(10); }}
                >
                  <strong>🎯 Preciso</strong>
                  <span>90% Elexido / 10% Descubrimiento</span>
                </button>
                <button 
                  className={`mode-card ${controlMode === 'equilibrado' ? 'selected' : ''}`}
                  onClick={() => { setControlMode('equilibrado'); setDiscoveryPercent(30); }}
                >
                  <strong>⚖️ Equilibrado</strong>
                  <span>70% Elexido / 30% Descubrimiento</span>
                </button>
                <button 
                  className={`mode-card ${controlMode === 'explorador' ? 'selected' : ''}`}
                  onClick={() => { setControlMode('explorador'); setDiscoveryPercent(50); }}
                >
                  <strong>✨ Explorador</strong>
                  <span>50% Elexido / 50% Sorpresa</span>
                </button>
              </div>
            </div>

            {/* 2. ADN de Temas */}
            <div className="dna-themes-box glass-card">
              <span className="box-label">MI MEZCLA DE TEMAS (ADN)</span>
              <div className="themes-bars-list">
                {dnaThemes.map((item, idx) => (
                  <div key={item.name} className="theme-bar-item">
                    <div className="theme-bar-meta">
                      <span>{item.name}</span>
                      <strong>{item.pct}%</strong>
                    </div>
                    <div className="bar-track">
                      <div 
                        className="bar-fill" 
                        style={{ width: `${item.pct}%`, background: item.color }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Reglas Personales de Programación */}
            <div className="rules-box glass-card">
              <span className="box-label">MIS REGLAS ACTIVAS</span>
              <ul className="rules-list">
                <li><Check size={14} className="text-accent" /> Nunca más de 2 videos políticos seguidos.</li>
                <li><Check size={14} className="text-accent" /> Cada 5 contenidos, mostrar un creador emergente.</li>
                <li><Check size={14} className="text-accent" /> Priorizar noticias de mañana, documentales de noche.</li>
                <li><Check size={14} className="text-accent" /> Si Juan o María inician vivo VIP, pausar y avisar.</li>
              </ul>
            </div>

            <button className="btn btn-primary btn-save-dna" onClick={() => setShowYouControl(false)}>
              Aplicar a Mi TV
            </button>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 2: Creador Modal (Sumar a Mi TV, YOU4, VIP) */}
      {/* ========================================================================= */}
      {showCreatorModal && selectedCreator && (
        <div className="youapp-modal-overlay" onClick={() => setShowCreatorModal(false)}>
          <div className="creator-profile-sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            
            <div className="creator-sheet-top">
              <img src={selectedCreator.avatar} alt={selectedCreator.name} className="creator-large-avatar" />
              <div className="creator-sheet-info">
                <h3>{selectedCreator.name}</h3>
                <span className="topic-pill">{selectedCreator.topic}</span>
                <div className="creator-stats-row">
                  <span>🔴 {selectedCreator.viewers} en vivo</span>
                  <span>📺 <strong>{selectedCreator.tvsAdded}</strong> TVs</span>
                </div>
              </div>
            </div>

            <div className="current-stream-box glass-card">
              <span className="live-now-tag">AL AIRE AHORA</span>
              <h4>{selectedCreator.currentShow}</h4>
              <p>Transmitiendo en 4K Ultra HD y sonido inmersivo.</p>
            </div>

            <div className="creator-action-buttons">
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setShowCreatorModal(false);
                  navigate('/live');
                }}
              >
                <Play size={18} /> Ver Transmisión en Vivo
              </button>

              <button 
                className="btn btn-glass"
                onClick={() => {
                  alert(`¡${selectedCreator.name} sumado a tu programación diaria de Mi TV!`);
                  setShowCreatorModal(false);
                }}
              >
                <Tv size={18} color="#ec4899" /> 📺 Sumar a Mi TV
              </button>

              <button 
                className="btn btn-glass"
                onClick={() => {
                  setShowCreatorModal(false);
                  navigate('/live');
                }}
              >
                <Zap size={18} color="#8b5cf6" /> ▦ Abrir en YOU4 (4 en 1)
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 3: "¿Por qué me mostrás esto?" (Algoritmo Transparente) */}
      {/* ========================================================================= */}
      {showWhyModal && (
        <div className="youapp-modal-overlay" onClick={() => setShowWhyModal(false)}>
          <div className="why-modal-sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={22} className="text-accent" />
                <h3>¿Por qué me mostrás esto?</h3>
              </div>
              <button className="close-sheet-btn" onClick={() => setShowWhyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="why-content glass-card">
              <p className="why-intro">Te mostramos este contenido porque:</p>
              <ul className="why-list">
                <li>• Seguís a <strong>Juan Tecnología</strong> y mirás contenidos de IA.</li>
                <li>• Tu ADN de temas tiene <strong>30% de Tecnología</strong> y <strong>20% de Economía</strong>.</li>
                <li>• Tenés habilitado un <strong>30% de descubrimiento</strong> de creadores emergentes.</li>
                <li>• Programaste 3 videos similares esta semana.</li>
              </ul>
            </div>

            <div className="feedback-buttons-row">
              <button className="fb-btn" onClick={() => { alert('Regla actualizada'); setShowWhyModal(false); }}>
                <Heart size={16} /> Más como esto
              </button>
              <button className="fb-btn" onClick={() => { alert('Menos de este creador'); setShowWhyModal(false); }}>
                <ThumbsUp size={16} /> Menos de este creador
              </button>
              <button className="fb-btn" onClick={() => { setShowWhyModal(false); setShowYouControl(true); }}>
                <Sliders size={16} /> Cambiar regla en YOUCONTROL
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 4: "Pedile a YOUAPP" (Generador de Programación Personalizada) */}
      {/* ========================================================================= */}
      {showAiProgramModal && generatedSchedule && (
        <div className="youapp-modal-overlay" onClick={() => setShowAiProgramModal(false)}>
          <div className="ai-schedule-sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            
            <div className="sheet-header">
              <div>
                <span className="badge-pill">✨ TU CANAL PARA AHORA</span>
                <h3 style={{ marginTop: '4px' }}>{generatedSchedule.title}</h3>
                <span className="schedule-total">⏱ Total: {generatedSchedule.totalMinutes} minutos estructurados</span>
              </div>
              <button className="close-sheet-btn" onClick={() => setShowAiProgramModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="schedule-timeline">
              {generatedSchedule.items.map((item: any) => (
                <div key={item.num} className="schedule-item glass-card">
                  <span className="sched-num">{item.num}</span>
                  <div className="sched-meta">
                    <h4>{item.title}</h4>
                    <p>{item.creator} • {item.duration}</p>
                  </div>
                  <Play size={16} className="text-accent" />
                </div>
              ))}
            </div>

            <button 
              className="btn btn-primary btn-play-schedule"
              onClick={() => {
                setShowAiProgramModal(false);
                navigate('/live');
              }}
            >
              <Play size={20} fill="white" /> SINTONIZAR MI CANAL AHORA
            </button>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 5: "¿Qué tenés ganas de ver AHORA?" (Mood & Tiempo) */}
      {/* ========================================================================= */}
      {showMoodModal && (
        <div className="youapp-modal-overlay" onClick={() => setShowMoodModal(false)}>
          <div className="mood-select-sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>¿Qué tenés ganas de ver AHORA?</h3>
              <button className="close-sheet-btn" onClick={() => setShowMoodModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="mood-options-grid">
              <button className="mood-option-btn" onClick={() => { setShowMoodModal(false); navigate('/live'); }}>
                <Tv size={20} />
                <span>Mi programación normal</span>
              </button>
              <button className="mood-option-btn" onClick={() => { setShowMoodModal(false); navigate('/live'); }}>
                <Clock size={20} />
                <span>Tengo 30 minutos</span>
              </button>
              <button className="mood-option-btn" onClick={() => { setShowMoodModal(false); navigate('/live'); }}>
                <Brain size={20} />
                <span>Aprender algo nuevo</span>
              </button>
              <button className="mood-option-btn" onClick={() => { setShowMoodModal(false); navigate('/live'); }}>
                <Dices size={20} color="#ec4899" />
                <span>🎲 Sorprendeme</span>
              </button>
              <button className="mood-option-btn" onClick={() => { setShowMoodModal(false); navigate('/live'); }}>
                <Radio size={20} color="#ef4444" />
                <span>Ver en vivo directo</span>
              </button>
              <button className="mood-option-btn" onClick={() => { setShowMoodModal(false); navigate('/mix'); }}>
                <Sparkles size={20} color="#8b5cf6" />
                <span>Mix IA Personal</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 6: Primera Fila VIP */}
      {/* ========================================================================= */}
      {showVipModal && (
        <div className="youapp-modal-overlay" onClick={() => setShowVipModal(false)}>
          <div className="vip-sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gem size={22} color="#ec4899" />
                <h3>Primera Fila VIP</h3>
              </div>
              <button className="close-sheet-btn" onClick={() => setShowVipModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="vip-banner-hero">
              <div className="vip-badge-big">⭐ MEMBRESÍA VIP</div>
              <h4>Acceso Exclusivo & Preguntas en Directo</h4>
              <p>Tus preguntas se destacan en la pantalla del creador y tenés acceso a vivos privados sin cortes.</p>
            </div>

            <div className="vip-features-list">
              <div className="vf-item">
                <Check size={16} color="#ec4899" />
                <span>Chat en primera fila con insignia destacada</span>
              </div>
              <div className="vf-item">
                <Check size={16} color="#ec4899" />
                <span>Transmisión 4K 60fps sin compresión</span>
              </div>
              <div className="vf-item">
                <Check size={16} color="#ec4899" />
                <span>Alerta y conexión automática cuando tu creador empieza un vivo</span>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={() => setShowVipModal(false)}>
              Activar Primera Fila VIP
            </button>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* ESTILOS CSS HIGH-END (Alineados exactamente al diseño de la imagen) */}
      {/* ========================================================================= */}
      <style>{`
        .youapp-mobile-root {
          min-height: 100vh;
          background: #05060b;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          overflow-x: hidden;
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding-bottom: 90px;
        }

        /* Ambient Lights */
        .ambient-glow {
          position: fixed;
          width: 350px;
          height: 350px;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.25;
        }
        .glow-top-left {
          top: -50px;
          left: -80px;
          background: #8b5cf6;
        }
        .glow-bottom-right {
          bottom: 100px;
          right: -80px;
          background: #ec4899;
        }

        /* Screen Container */
        .phone-screen-container {
          width: 100%;
          max-width: 440px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: relative;
          z-index: 1;
        }

        /* 1. Top Bar */
        .youapp-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 4px;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .logo-symbol {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .neon-triangle-svg {
          width: 100%;
          height: 100%;
        }

        .brand-title {
          font-size: 1.15rem;
          font-weight: 900;
          letter-spacing: 2px;
          background: linear-gradient(135deg, #ec4899, #a855f7, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .top-bar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-btn {
          background: none;
          border: none;
          color: #a0a5b8;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: 50%;
          transition: color 0.2s, transform 0.1s;
        }
        .icon-btn:hover {
          color: #ffffff;
          transform: scale(1.05);
        }

        .badge-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 7px;
          height: 7px;
          background: #ef4444;
          border-radius: 50%;
          box-shadow: 0 0 8px #ef4444;
        }

        .user-avatar-wrap {
          position: relative;
          width: 34px;
          height: 34px;
          cursor: pointer;
        }

        .user-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #ec4899;
          box-shadow: 0 0 12px rgba(236, 72, 153, 0.5);
        }

        /* 2. Hero Greeting */
        .hero-greeting-section {
          padding-top: 4px;
        }

        .hero-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.5px;
          margin-bottom: 2px;
        }

        .hero-subtitle {
          font-size: 0.85rem;
          color: #8f94a6;
          font-weight: 400;
        }

        /* 3. Hero Card: Continuar Mi TV */
        .main-hero-card-section {
          width: 100%;
        }

        .hero-play-card {
          position: relative;
          border-radius: 24px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(30, 20, 50, 0.75), rgba(15, 10, 30, 0.85));
          border: 1.5px solid rgba(236, 72, 153, 0.4);
          box-shadow: 0 10px 35px rgba(236, 72, 153, 0.25), inset 0 0 25px rgba(139, 92, 246, 0.15);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          gap: 18px;
          cursor: pointer;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .hero-play-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 45px rgba(236, 72, 153, 0.35);
          border-color: rgba(236, 72, 153, 0.7);
        }

        .hero-card-glow-bg {
          position: absolute;
          right: -30px;
          bottom: -30px;
          width: 150px;
          height: 150px;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.3), transparent 70%);
          pointer-events: none;
        }

        .hero-play-symbol-wrap {
          position: relative;
          width: 68px;
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .neon-swirl-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6);
          padding: 3px;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          box-shadow: 0 0 20px rgba(236, 72, 153, 0.6);
          animation: rotateGlow 8s linear infinite;
        }

        @keyframes rotateGlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .play-triangle-center {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ec4899, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(236, 72, 153, 0.6);
        }

        .hero-channel-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .continue-label {
          font-size: 0.75rem;
          color: #c084fc;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .channel-main-name {
          font-size: 1.4rem;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.1;
          margin-bottom: 4px;
        }

        .now-next-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .now-playing, .next-playing {
          font-size: 0.75rem;
          color: #d1d5db;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .bullet-purple { color: #c084fc; font-size: 0.7rem; }
        .bullet-pink { color: #f43f5e; font-size: 0.7rem; }

        /* 4. Pastillas de Navegación */
        .mode-pills-bar {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: none;
        }
        .mode-pills-bar::-webkit-scrollbar { display: none; }

        .pill-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #a0a5b8;
          font-size: 0.75rem;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pill-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        .pill-btn.active {
          background: rgba(192, 132, 252, 0.15);
          border-color: #c084fc;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(192, 132, 252, 0.3);
        }

        /* 5. Sección: En Vivo Ahora */
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          cursor: pointer;
        }

        .section-header h3 {
          font-size: 0.95rem;
          font-weight: 800;
          color: #ffffff;
        }

        .section-header .chevron {
          color: #8f94a6;
        }

        .creators-horizontal-grid {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 8px;
          scrollbar-width: thin;
        }
        .creators-horizontal-grid::-webkit-scrollbar {
          height: 4px;
        }
        .creators-horizontal-grid::-webkit-scrollbar-thumb {
          background: rgba(236, 72, 153, 0.4);
          border-radius: 4px;
        }

        .creator-card {
          flex: 0 0 102px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          padding: 10px 6px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: transform 0.2s, background 0.2s, border-color 0.2s;
        }

        .creator-card:hover {
          transform: translateY(-4px);
          background: rgba(236, 72, 153, 0.12);
          border-color: rgba(236, 72, 153, 0.5);
          box-shadow: 0 8px 20px rgba(236, 72, 153, 0.25);
        }

        .creator-avatar-wrap {
          position: relative;
          width: 62px;
          height: 62px;
          margin-bottom: 8px;
        }

        .creator-img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
        }

        .live-badge-pill {
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          background: #ef4444;
          color: white;
          font-size: 0.55rem;
          font-weight: 900;
          padding: 1px 6px;
          border-radius: 6px;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.8);
          white-space: nowrap;
        }

        .creator-name {
          font-size: 0.72rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        .creator-tag {
          font-size: 0.62rem;
          color: #8f94a6;
          margin: 2px 0 0 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        .creator-viewers-tag {
          font-size: 0.62rem;
          color: #ef4444;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          margin-top: 4px;
          background: rgba(239, 68, 68, 0.12);
          padding: 2px 6px;
          border-radius: 8px;
        }

        /* 6. Sección: Tus Canales */
        .channels-2x2-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .channel-glass-box {
          border-radius: 16px;
          padding: 14px 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
        }

        .channel-glass-box:hover {
          transform: translateY(-2px);
        }

        .box-indigo { border-color: rgba(99, 102, 241, 0.3); }
        .box-indigo:hover { box-shadow: 0 0 15px rgba(99, 102, 241, 0.3); border-color: #6366f1; }

        .box-magenta { border-color: rgba(236, 72, 153, 0.3); }
        .box-magenta:hover { box-shadow: 0 0 15px rgba(236, 72, 153, 0.3); border-color: #ec4899; }

        .box-blue { border-color: rgba(59, 130, 246, 0.3); }
        .box-blue:hover { box-shadow: 0 0 15px rgba(59, 130, 246, 0.3); border-color: #3b82f6; }

        .box-purple { border-color: rgba(168, 85, 247, 0.3); }
        .box-purple:hover { box-shadow: 0 0 15px rgba(168, 85, 247, 0.3); border-color: #a855f7; }

        .ch-icon.icon-indigo { color: #818cf8; }
        .ch-icon.icon-magenta { color: #f472b6; }
        .ch-icon.icon-blue { color: #60a5fa; }
        .ch-icon.icon-purple { color: #c084fc; }

        .ch-title {
          font-size: 0.7rem;
          font-weight: 700;
          color: #ffffff;
        }

        /* 7. Pedile a YOUAPP */
        .section-title-sm {
          font-size: 0.9rem;
          font-weight: 800;
          margin-bottom: 8px;
          color: #ffffff;
        }

        .ask-prompt-box {
          position: relative;
          display: flex;
          align-items: center;
          background: rgba(15, 17, 26, 0.9);
          border: 1.5px solid rgba(168, 85, 247, 0.4);
          border-radius: 16px;
          padding: 6px 8px 6px 14px;
          box-shadow: 0 4px 20px rgba(168, 85, 247, 0.15);
        }

        .ask-input {
          flex: 1;
          background: none;
          border: none;
          color: #ffffff;
          font-size: 0.8rem;
          outline: none;
          font-family: inherit;
        }

        .ask-input::placeholder {
          color: #6b7280;
        }

        .ask-send-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ec4899, #8b5cf6);
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(236, 72, 153, 0.5);
          transition: transform 0.15s;
        }

        .ask-send-btn:hover {
          transform: scale(1.05);
        }

        /* 8. Primera Fila VIP */
        .vip-promo-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(35, 15, 45, 0.8), rgba(20, 10, 30, 0.9));
          border: 1px solid rgba(236, 72, 153, 0.35);
          box-shadow: 0 4px 20px rgba(236, 72, 153, 0.15);
          cursor: pointer;
        }

        .vip-icon-badge {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(236, 72, 153, 0.15);
          border: 1px solid rgba(236, 72, 153, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .vip-info {
          flex: 1;
        }

        .vip-title {
          font-size: 0.85rem;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }

        .vip-desc {
          font-size: 0.65rem;
          color: #9ca3af;
          margin: 2px 0 0 0;
        }

        .vip-action-btn {
          background: rgba(236, 72, 153, 0.15);
          border: 1px solid rgba(236, 72, 153, 0.5);
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        /* YOUCONTROL Launcher Bar */
        .youcontrol-banner-btn {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          cursor: pointer;
          margin-top: 4px;
        }

        .youcontrol-btn-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .youcontrol-btn-left strong {
          display: block;
          font-size: 0.8rem;
          color: #a5b4fc;
        }

        .youcontrol-btn-left span {
          font-size: 0.65rem;
          color: #94a3b8;
        }

        .youcontrol-pill {
          font-size: 0.7rem;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.15);
          padding: 4px 10px;
          border-radius: 12px;
        }

        /* 10. Bottom Navigation Dock */
        .youapp-bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          max-width: 480px;
          margin: 0 auto;
          height: 68px;
          background: rgba(8, 10, 18, 0.95);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 0 10px;
          z-index: 99;
        }

        .nav-item {
          background: none;
          border: none;
          color: #64748b;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          cursor: pointer;
          transition: color 0.2s;
        }

        .nav-item:hover, .nav-item.active {
          color: #e879f9;
        }

        .center-fab-launcher {
          position: relative;
          top: -14px;
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ec4899, #8b5cf6);
          border: 3px solid #05060b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(236, 72, 153, 0.6);
          transition: transform 0.2s;
        }

        .center-fab-launcher:active {
          transform: scale(0.92);
        }

        .fab-glow-core {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ========================================================================= */
        /* MODALS & BOTTOM SHEETS */
        /* ========================================================================= */
        .youapp-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          z-index: 999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .youcontrol-sheet, .creator-profile-sheet, .why-modal-sheet, 
        .ai-schedule-sheet, .mood-select-sheet, .vip-sheet {
          width: 100%;
          max-width: 460px;
          background: #0d101a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px 24px 0 0;
          padding: 16px 20px 30px 20px;
          max-height: 88vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.8);
          animation: slideUp 0.25s ease-out;
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .sheet-handle {
          width: 40px;
          height: 4px;
          background: rgba(255, 255, 255, 0.25);
          border-radius: 4px;
          margin: 0 auto 4px auto;
        }

        .sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .sheet-header h2, .sheet-header h3 {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 0;
        }

        .sheet-sub {
          font-size: 0.75rem;
          color: #94a3b8;
          margin: 2px 0 0 0;
        }

        .close-sheet-btn {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .box-label {
          display: block;
          font-size: 0.65rem;
          font-weight: 800;
          color: #a5b4fc;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .control-slider-box {
          padding: 14px;
          border-radius: 14px;
        }

        .balance-indicator {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          font-weight: 800;
          color: #64748b;
          margin-bottom: 12px;
        }

        .balance-indicator .active-mode {
          color: #e879f9;
        }

        .dot-sep {
          color: #475569;
          letter-spacing: 2px;
        }

        .mode-cards-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .mode-card {
          padding: 10px 6px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: white;
          display: flex;
          flex-direction: column;
          gap: 2px;
          cursor: pointer;
          text-align: center;
        }

        .mode-card strong {
          font-size: 0.75rem;
        }

        .mode-card span {
          font-size: 0.6rem;
          color: #94a3b8;
        }

        .mode-card.selected {
          background: rgba(192, 132, 252, 0.15);
          border-color: #c084fc;
          box-shadow: 0 0 10px rgba(192, 132, 252, 0.3);
        }

        .dna-themes-box {
          padding: 14px;
          border-radius: 14px;
        }

        .themes-bars-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .theme-bar-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          margin-bottom: 3px;
        }

        .bar-track {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 6px;
        }

        .rules-box {
          padding: 14px;
          border-radius: 14px;
        }

        .rules-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.75rem;
          color: #d1d5db;
        }

        .rules-list li {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-save-dna {
          width: 100%;
          padding: 14px;
          font-size: 0.95rem;
        }

        /* Creator Sheet */
        .creator-sheet-top {
          display: flex;
          gap: 14px;
          align-items: center;
        }

        .creator-large-avatar {
          width: 70px;
          height: 70px;
          border-radius: 18px;
          object-fit: cover;
          border: 2px solid #ec4899;
          box-shadow: 0 0 15px rgba(236, 72, 153, 0.5);
        }

        .topic-pill {
          font-size: 0.7rem;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.2);
          padding: 2px 8px;
          border-radius: 6px;
        }

        .creator-stats-row {
          display: flex;
          gap: 12px;
          margin-top: 6px;
          font-size: 0.75rem;
          color: #cbd5e1;
        }

        .current-stream-box {
          padding: 12px;
          border-radius: 12px;
        }

        .live-now-tag {
          font-size: 0.6rem;
          font-weight: 800;
          color: #ef4444;
          letter-spacing: 0.5px;
        }

        .creator-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Why Modal */
        .why-content {
          padding: 14px;
          border-radius: 14px;
        }

        .why-intro {
          font-size: 0.8rem;
          font-weight: 700;
          color: #e2e8f0;
          margin-bottom: 8px;
        }

        .why-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .feedback-buttons-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .fb-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }

        .fb-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        /* AI Schedule Modal */
        .badge-pill {
          font-size: 0.65rem;
          font-weight: 800;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.15);
          padding: 2px 8px;
          border-radius: 6px;
        }

        .schedule-total {
          font-size: 0.75rem;
          color: #a0aec0;
        }

        .schedule-timeline {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .schedule-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 12px;
        }

        .sched-num {
          font-size: 0.9rem;
          font-weight: 900;
          color: #ec4899;
          font-family: monospace;
        }

        .sched-meta {
          flex: 1;
        }

        .sched-meta h4 {
          font-size: 0.8rem;
          margin: 0;
        }

        .sched-meta p {
          font-size: 0.65rem;
          color: #94a3b8;
          margin: 2px 0 0 0;
        }

        .btn-play-schedule {
          width: 100%;
          padding: 14px;
          font-size: 0.95rem;
        }

        /* Mood options */
        .mood-options-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .mood-option-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px 8px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mood-option-btn:hover {
          background: rgba(192, 132, 252, 0.15);
          border-color: #c084fc;
        }

        /* VIP Sheet */
        .vip-banner-hero {
          text-align: center;
          padding: 16px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(139, 92, 246, 0.2));
          border: 1px solid rgba(236, 72, 153, 0.4);
        }

        .vip-badge-big {
          display: inline-block;
          font-size: 0.7rem;
          font-weight: 900;
          color: #ec4899;
          background: rgba(236, 72, 153, 0.2);
          padding: 2px 10px;
          border-radius: 20px;
          margin-bottom: 6px;
        }

        .vip-banner-hero h4 {
          font-size: 1rem;
          margin-bottom: 4px;
        }

        .vip-banner-hero p {
          font-size: 0.75rem;
          color: #d1d5db;
        }

        .vip-features-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: 0.8rem;
        }

        .vf-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}
