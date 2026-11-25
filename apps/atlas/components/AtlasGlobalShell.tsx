/**
 * ATLAS GLOBAL SHELL & UNIFIED COMMUNICATION HEADER (APPLE PRO EDITION)
 * @apps/atlas/components/AtlasGlobalShell.tsx
 *
 * Unified persistent shell for all Atlas pages:
 * 1. Apple Studio HUD Telemetry Bar (Tier 1):
 *    - Real Verified Telemetry:
 *      * PLATFORMS CONNECTED (e.g. 4/7)
 *      * ACTIVE ACCOUNTS (e.g. 7)
 *      * HOT AUDIENCE (e.g. 43)
 *      * WINNERS (e.g. 3)
 *      * BREAKOUTS (e.g. 3)
 *      * SCALE READY (e.g. 3)
 *      * 3M STATUS (Strictly UNKNOWN, never 0)
 * 2. Segmented Control Navigation & Context Bar (Tier 2):
 *    - Persistent Navigation Bar (9 modules):
 *      * CONTROL CENTER
 *      * CUENTAS
 *      * CAMPAÑAS
 *      * AUDIENCIA
 *      * WARM AUDIENCE
 *      * VIRALIDAD
 *      * RELEASE
 *      * MÉTRICAS 3M
 *      * CONFIGURACIÓN
 *    - Breadcrumb Hierarchy: ATLAS > MÓDULO > ELEMENTO
 *    - Context Filter Badges with Quick Clearance
 *
 * Design: Apple Dark Glass Pro Aesthetic (macOS Sequoia / VisionOS Pro inspired).
 */

import React, { useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Target,
  Radio,
  Zap,
  Globe,
  Flame,
  Sparkles,
  Award,
  BarChart3,
  Sliders,
  ChevronRight,
  X,
  RefreshCw,
  Activity,
  Layers,
  Mountain,
  Heart,
  ArrowRight,
  Search,
  Link2,
  BookOpen,
  Film
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  matches: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'control-center',
    label: 'CONTROL CENTER',
    path: '/broadcast/control-center',
    icon: Target,
    matches: p => p === '/broadcast/control-center' || p === '/control-center' || p === '/' || p === '/hub'
  },
  {
    id: 'fabrica-videos',
    label: 'FÁBRICA VIDEOS',
    path: '/atlas/fabrica-videos',
    icon: Film,
    matches: p => p === '/atlas/fabrica-videos' || p === '/fabrica-videos'
  },
  {
    id: 'contenidos',
    label: 'CONTENIDOS',
    path: '/broadcast/content-library',
    icon: Layers,
    matches: p => p.startsWith('/broadcast/content-library') || p.startsWith('/content-library') || p.startsWith('/contenidos')
  },
  {
    id: 'naturaleza',
    label: 'NATURALEZA',
    path: '/broadcast/nature-assets',
    icon: Mountain,
    matches: p => p.startsWith('/broadcast/nature-assets') || p.startsWith('/nature-assets') || p.startsWith('/naturaleza')
  },
  {
    id: 'emotive-lab',
    label: 'EMOTIVE LAB',
    path: '/emotive-lab',
    icon: Heart,
    matches: p => p.startsWith('/emotive') || p.includes('emotive')
  },
  {
    id: 'cuentas',
    label: 'CUENTAS',
    path: '/broadcast/accounts',
    icon: Radio,
    matches: p => p.startsWith('/broadcast/accounts') || p.startsWith('/cuentas')
  },
  {
    id: 'campanas',
    label: 'CAMPAÑAS',
    path: '/broadcast/campaigns',
    icon: Zap,
    matches: p => p.startsWith('/broadcast/campaigns') || p.startsWith('/campaigns') || p === '/broadcast' || p === '/tesla-broadcast'
  },
  {
    id: 'audiencia',
    label: 'AUDIENCIA',
    path: '/audience',
    icon: Globe,
    matches: p => (p.startsWith('/audience') || p.startsWith('/audiencia')) && !p.includes('warm')
  },
  {
    id: 'warm-audience',
    label: 'WARM AUDIENCE',
    path: '/broadcast/warm-audience',
    icon: Flame,
    matches: p => p.includes('warm-audience') || p.includes('warm')
  },
  {
    id: 'viralidad',
    label: 'VIRALIDAD',
    path: '/broadcast/virality',
    icon: Sparkles,
    matches: p => p.startsWith('/broadcast/virality') || p.startsWith('/viralidad')
  },
  {
    id: 'release',
    label: 'RELEASE',
    path: '/broadcast/release',
    icon: Award,
    matches: p => p.startsWith('/broadcast/release') || p.startsWith('/release')
  },
  {
    id: 'metricas-3m',
    label: 'MÉTRICAS 3M',
    path: '/broadcast/metrics-3m',
    icon: BarChart3,
    matches: p => p.startsWith('/broadcast/metrics-3m') || p.startsWith('/metricas-3m')
  },
  {
    id: 'configuracion',
    label: 'CONFIGURACIÓN',
    path: '/broadcast/settings',
    icon: Sliders,
    matches: p => p.startsWith('/broadcast/settings') || p.startsWith('/configuracion')
  }
];

export const AtlasGlobalShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    selectedAccount,
    selectedPlatform,
    selectedCampaign,
    selectedContent,
    selectedAudience,
    selectedGeography,
    clearContext,
    clearKey,
    buildLink,
    telemetry,
    refreshTelemetry
  } = useAtlasShared();

  // Active module calculation
  const currentNav = useMemo(() => {
    return NAV_ITEMS.find(item => item.matches(location.pathname)) || NAV_ITEMS[0];
  }, [location.pathname]);

  // Dynamic Element for Breadcrumb (ATLAS > MÓDULO > ELEMENTO)
  const currentElement = useMemo(() => {
    if (selectedContent) return selectedContent.toUpperCase();
    if (currentNav.id === 'cuentas' && selectedAccount) return selectedAccount.toUpperCase();
    if (currentNav.id === 'campanas' && selectedCampaign) return selectedCampaign.toUpperCase();
    if ((currentNav.id === 'audiencia' || currentNav.id === 'warm-audience') && selectedAudience) return selectedAudience.toUpperCase();
    if (selectedPlatform && currentNav.id !== 'control-center') return selectedPlatform.toUpperCase();
    return null;
  }, [selectedContent, selectedAccount, selectedCampaign, selectedAudience, selectedPlatform, currentNav.id]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedAccount) count++;
    if (selectedPlatform) count++;
    if (selectedCampaign) count++;
    if (selectedContent) count++;
    if (selectedAudience) count++;
    if (selectedGeography) count++;
    return count;
  }, [selectedAccount, selectedPlatform, selectedCampaign, selectedContent, selectedAudience, selectedGeography]);

  return (
    <div
      className="atlas-shell-root"
      style={{
        minHeight: '100vh',
        backgroundColor: '#07090e',
        color: '#f1f3f7',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ========================================================================= */}
      {/* UNIFIED APPLE PRO HEADER (2-TIER STREAMLINED ARCHITECTURE)                */}
      {/* ========================================================================= */}
      <header className="atlas-global-header">
        {/* TIER 1: BRAND + 7 HUD TELEMETRY CHIPS + REFRESH (48px) */}
        <div className="atlas-header-top-row">
          {/* Brand Wordmark & System Status */}
          <div className="atlas-brand-group">
            <Link
              to={buildLink('/broadcast/control-center')}
              id="atlas-brand-home"
              className="atlas-brand-link"
            >
              <div className="atlas-brand-icon-box">
                <Activity size={15} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="atlas-brand-title">ATLAS</span>
                <span className="atlas-brand-badge">CORE OS</span>
              </div>
            </Link>
          </div>

          {/* 7 Telemetry HUD Micro-Pills (Strict Invariants, Clean Pro Typography) */}
          <div className="atlas-telemetry-hud" role="region" aria-label="Telemetría de Red Atlas">
            {/* 1. PLATFORMS CONNECTED */}
            <div
              className="atlas-hud-chip"
              title="4 de 7 plataformas auditadas con cuentas conectadas"
              id="hud-platforms"
            >
              <span className="atlas-hud-icon-dot" style={{ backgroundColor: '#34d399', boxShadow: '0 0 8px #34d399' }} />
              <span className="atlas-hud-val" style={{ color: '#34d399' }}>{telemetry.platformsConnected}</span>
              <span className="atlas-hud-label">Plataformas</span>
            </div>

            {/* 2. ACTIVE ACCOUNTS */}
            <div
              className="atlas-hud-chip"
              title="Total de cuentas reales conectadas a la red de difusión"
              id="hud-accounts"
            >
              <Radio size={12} style={{ color: '#94a3b8' }} />
              <span className="atlas-hud-val" style={{ color: '#ffffff' }}>{telemetry.activeAccounts}</span>
              <span className="atlas-hud-label">Cuentas</span>
            </div>

            {/* 3. HOT AUDIENCE */}
            <div
              className="atlas-hud-chip"
              title="Perfiles en segmentación Hot y Very Hot verificados"
              id="hud-hot-audience"
            >
              <Flame size={12} style={{ color: '#fbbf24' }} />
              <span className="atlas-hud-val" style={{ color: '#fbbf24' }}>{telemetry.hotAudience}</span>
              <span className="atlas-hud-label">Hot Audience</span>
            </div>

            {/* 4. WINNERS */}
            <div
              className="atlas-hud-chip"
              title="Publicaciones con virality score sobre umbral de ganador"
              id="hud-winners"
            >
              <Sparkles size={12} style={{ color: '#c084fc' }} />
              <span className="atlas-hud-val" style={{ color: '#c084fc' }}>{telemetry.winners}</span>
              <span className="atlas-hud-label">Winners</span>
            </div>

            {/* 5. BREAKOUTS */}
            <div
              className="atlas-hud-chip"
              title="Publicaciones en aceleración viral breakout"
              id="hud-breakouts"
            >
              <Zap size={12} style={{ color: '#38bdf8' }} />
              <span className="atlas-hud-val" style={{ color: '#38bdf8' }}>{telemetry.breakouts}</span>
              <span className="atlas-hud-label">Breakouts</span>
            </div>

            {/* 6. SCALE READY */}
            <div
              className="atlas-hud-chip"
              title="Contenidos aprobados para amplificación masiva"
              id="hud-scale-ready"
            >
              <Award size={12} style={{ color: '#34d399' }} />
              <span className="atlas-hud-val" style={{ color: '#34d399' }}>{telemetry.scaleReady}</span>
              <span className="atlas-hud-label">Scale Ready</span>
            </div>

            {/* 7. 3M STATUS (STRICTLY PRESERVES UNKNOWN INVARIANT) */}
            <div
              className="atlas-hud-chip"
              title="Alcance diario hacia 3M: Pendiente de medición física directa"
              id="hud-status-3m"
              style={{
                backgroundColor: telemetry.status3M === 'UNKNOWN' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(52, 211, 153, 0.12)',
                borderColor: telemetry.status3M === 'UNKNOWN' ? 'rgba(245, 158, 11, 0.28)' : 'rgba(52, 211, 153, 0.28)'
              }}
            >
              <Target size={12} style={{ color: telemetry.status3M === 'UNKNOWN' ? '#fbbf24' : '#34d399' }} />
              <span
                className="atlas-hud-val"
                style={{
                  color: telemetry.status3M === 'UNKNOWN' ? '#fbbf24' : '#34d399',
                  fontSize: '10.5px'
                }}
              >
                {telemetry.status3M}
              </span>
              <span className="atlas-hud-label" style={{ color: telemetry.status3M === 'UNKNOWN' ? '#f59e0b' : '#34d399' }}>
                Objetivo 3M
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {activeFiltersCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '5px',
                  fontSize: '10px',
                  fontFamily: 'var(--atlas-font-mono)',
                  fontWeight: 700,
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)'
                }}
                title={`${activeFiltersCount} filtros de contexto activos`}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                {activeFiltersCount} FILTRO{activeFiltersCount > 1 ? 'S' : ''}
              </span>
            )}

            {/* Acceso secundario: HERRAMIENTAS > Buscar imágenes */}
            <Link
              to="/tools/image-discovery"
              id="nav-tools-image-discovery"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 500,
                textDecoration: 'none',
                backgroundColor: location.pathname.startsWith('/tools/image-discovery') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: location.pathname.startsWith('/tools/image-discovery') ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: location.pathname.startsWith('/tools/image-discovery') ? '#38bdf8' : '#94a3b8',
                transition: 'all 0.16s ease'
              }}
              title="Herramientas: Buscar imágenes"
            >
              <Search size={12} />
              <span style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>HERRAMIENTAS:</span>
              <span>Buscar imágenes</span>
            </Link>

            {/* Acceso secundario: HERRAMIENTAS > Links de publicación */}
            <Link
              to="/tools/cta-link"
              id="nav-tools-cta-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 500,
                textDecoration: 'none',
                backgroundColor: location.pathname.startsWith('/tools/cta-link') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: location.pathname.startsWith('/tools/cta-link') ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: location.pathname.startsWith('/tools/cta-link') ? '#38bdf8' : '#94a3b8',
                transition: 'all 0.16s ease'
              }}
              title="Herramientas: Links de publicación"
            >
              <Link2 size={12} />
              <span style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>HERRAMIENTAS:</span>
              <span>Links de publicación</span>
            </Link>

            {/* Acceso secundario: HERRAMIENTAS > Banco de cuentos */}
            <Link
              to="/tools/story-bank"
              id="nav-tools-story-bank"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 500,
                textDecoration: 'none',
                backgroundColor: (location.pathname.startsWith('/tools/story-bank') || location.pathname.startsWith('/banco-cuentos')) ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: (location.pathname.startsWith('/tools/story-bank') || location.pathname.startsWith('/banco-cuentos')) ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: (location.pathname.startsWith('/tools/story-bank') || location.pathname.startsWith('/banco-cuentos')) ? '#38bdf8' : '#94a3b8',
                transition: 'all 0.16s ease'
              }}
              title="Herramientas: Banco de cuentos"
            >
              <BookOpen size={12} />
              <span style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>HERRAMIENTAS:</span>
              <span>Banco de cuentos</span>
            </Link>

            {/* Acceso secundario: HERRAMIENTAS > Video References */}
            <Link
              to="/tools/video-references"
              id="nav-tools-video-references"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 500,
                textDecoration: 'none',
                backgroundColor: (location.pathname.startsWith('/tools/video-references') || location.pathname.startsWith('/video-references')) ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: (location.pathname.startsWith('/tools/video-references') || location.pathname.startsWith('/video-references')) ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: (location.pathname.startsWith('/tools/video-references') || location.pathname.startsWith('/video-references')) ? '#c084fc' : '#94a3b8',
                transition: 'all 0.16s ease'
              }}
              title="Herramientas: Video References & Deep Timeline Learning"
            >
              <Film size={12} />
              <span style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>HERRAMIENTAS:</span>
              <span>Referencias</span>
            </Link>

            <button
              onClick={() => refreshTelemetry()}
              id="btn-refresh-telemetry"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '7px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.16s ease'
              }}
              title="Actualizar telemetría física de red"
            >
              <RefreshCw size={13} className={telemetry.loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* TIER 2: APPLE SEGMENTED MODULE NAV + INLINE BREADCRUMBS & CONTEXT (46px) */}
        <div className="atlas-header-nav-row">
          {/* Segmented Control Pill Bar (9 Modules) */}
          <nav className="atlas-segmented-nav" aria-label="Navegación Módulos Atlas">
            {NAV_ITEMS.map(item => {
              const isActive = item.matches(location.pathname);
              const Icon = item.icon;
              const targetUrl = buildLink(item.path);

              return (
                <Link
                  key={item.id}
                  to={targetUrl}
                  id={`nav-${item.id}`}
                  className={`atlas-nav-tab ${isActive ? 'active' : ''}`}
                >
                  <Icon size={13} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: Breadcrumb & Contextual Badges Inline */}
          <div className="atlas-header-right-meta">
            {/* Inline Breadcrumb */}
            <div className="atlas-inline-breadcrumb" id="atlas-breadcrumb">
              <Link to={buildLink('/broadcast/control-center')}>ATLAS</Link>
              <ChevronRight size={11} />
              {location.pathname.startsWith('/tools/image-discovery') ? (
                <>
                  <span style={{ color: '#94a3b8' }}>HERRAMIENTAS</span>
                  <ChevronRight size={11} />
                  <span className="spotlight-pill">BUSCAR IMÁGENES</span>
                </>
              ) : location.pathname.startsWith('/tools/cta-link') ? (
                <>
                  <span style={{ color: '#94a3b8' }}>HERRAMIENTAS</span>
                  <ChevronRight size={11} />
                  <span className="spotlight-pill">LINKS DE PUBLICACIÓN</span>
                </>
              ) : (location.pathname.startsWith('/tools/story-bank') || location.pathname.startsWith('/banco-cuentos')) ? (
                <>
                  <span style={{ color: '#94a3b8' }}>HERRAMIENTAS</span>
                  <ChevronRight size={11} />
                  <span className="spotlight-pill">BANCO DE CUENTOS</span>
                </>
              ) : (location.pathname.startsWith('/tools/video-references') || location.pathname.startsWith('/video-references')) ? (
                <>
                  <span style={{ color: '#94a3b8' }}>HERRAMIENTAS</span>
                  <ChevronRight size={11} />
                  <span className="spotlight-pill">VIDEO REFERENCES & DNA</span>
                </>
              ) : (
                <>
                  <Link
                    to={buildLink(currentNav.path)}
                    className={!currentElement ? 'active-leaf' : ''}
                  >
                    {currentNav.label}
                  </Link>
                  {currentElement && (
                    <>
                      <ChevronRight size={11} />
                      <span className="spotlight-pill" title={currentElement}>
                        {currentElement}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Context Filters Strip (Only rendered if filters active) */}
            {activeFiltersCount > 0 && (
              <div className="atlas-context-strip" id="shared-context-pills">
                {selectedAccount && (
                  <span className="atlas-context-tag">
                    <span className="atlas-context-tag-key">CUENTA:</span>
                    <span className="atlas-context-tag-val" style={{ color: '#38bdf8' }}>{selectedAccount}</span>
                    <button
                      onClick={() => clearKey('selectedAccount')}
                      className="atlas-context-tag-btn"
                      title="Quitar cuenta"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}

                {selectedPlatform && (
                  <span className="atlas-context-tag">
                    <span className="atlas-context-tag-key">PLATAFORMA:</span>
                    <span className="atlas-context-tag-val" style={{ color: '#c084fc' }}>{selectedPlatform}</span>
                    <button
                      onClick={() => clearKey('selectedPlatform')}
                      className="atlas-context-tag-btn"
                      title="Quitar plataforma"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}

                {selectedCampaign && (
                  <span className="atlas-context-tag">
                    <span className="atlas-context-tag-key">CAMPAÑA:</span>
                    <span className="atlas-context-tag-val" style={{ color: '#fbbf24' }}>{selectedCampaign}</span>
                    <button
                      onClick={() => clearKey('selectedCampaign')}
                      className="atlas-context-tag-btn"
                      title="Quitar campaña"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}

                {selectedContent && (
                  <span className="atlas-context-tag">
                    <span className="atlas-context-tag-key">CONTENIDO:</span>
                    <span className="atlas-context-tag-val" style={{ color: '#34d399' }}>{selectedContent}</span>
                    <button
                      onClick={() => clearKey('selectedContent')}
                      className="atlas-context-tag-btn"
                      title="Quitar contenido"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}

                {selectedAudience && (
                  <span className="atlas-context-tag">
                    <span className="atlas-context-tag-key">AUDIENCIA:</span>
                    <span className="atlas-context-tag-val" style={{ color: '#fb923c' }}>{selectedAudience}</span>
                    <button
                      onClick={() => clearKey('selectedAudience')}
                      className="atlas-context-tag-btn"
                      title="Quitar audiencia"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}

                {selectedGeography && (
                  <span className="atlas-context-tag">
                    <span className="atlas-context-tag-key">GEO:</span>
                    <span className="atlas-context-tag-val" style={{ color: '#38bdf8' }}>{selectedGeography}</span>
                    <button
                      onClick={() => clearKey('selectedGeography')}
                      className="atlas-context-tag-btn"
                      title="Quitar geografía"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}

                <button
                  onClick={clearContext}
                  id="btn-clear-all-context"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f87171',
                    fontSize: '10px',
                    fontFamily: 'var(--atlas-font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '2px 5px',
                    borderRadius: '4px'
                  }}
                  title="Restablecer todos los filtros"
                >
                  LIMPIAR
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN WORKSPACE CONTENT                                                    */}
      {/* ========================================================================= */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#07090e', color: '#f1f3f7', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
};

export default AtlasGlobalShell;
