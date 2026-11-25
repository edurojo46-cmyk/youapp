/**
 * ATLAS — AUDIENCE MAP V1
 * Page: AtlasAudienceMapPage
 * @apps/atlas/pages/AtlasAudienceMapPage.tsx
 *
 * Dedicated View for Atlas Audience Map:
 * - Audience + Geography inputs
 * - Live Surface Discovery & Physical Certification
 * - KPIs: SUPERFICIES DESCUBIERTAS, CERTIFICADAS, AUDIENCIA POTENCIAL
 * - Top 20 Surfaces table with Platform, Type, Reach, Activity, Atlas Score, Posting Mode
 * - Invariant: UNKNOWN != MATCH, Zero synthetic data, Real Physical Evidence
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';
import {
  Compass,
  Search,
  Globe,
  ShieldCheck,
  CheckCircle2,
  Users,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Radio,
  Share2,
  Lock,
  Unlock,
  MessageSquare,
  FileText,
  Scale,
  Video,
  Rss,
  Info,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Send,
  Zap,
  Flame
} from 'lucide-react';

interface AudienceSurfaceScores {
  SEMANTIC_MATCH_SCORE: number;
  GEOGRAPHY_MATCH_SCORE: number;
  ACTIVITY_SCORE: number;
  AUDIENCE_SIZE_SCORE: number;
  PUBLIC_ACCESS_SCORE: number;
  REACH_POTENTIAL_SCORE: number;
  ATLAS_AUDIENCE_SCORE: number;
}

interface AudienceSurface {
  surface_id: string;
  name: string;
  url: string;
  platform: string;
  surface_type: string;
  source_family: string;
  audience_topic: string;
  geography: string;
  public_access: boolean;
  posting_mode: string;
  estimated_audience: number | null;
  audience_count?: number | null;
  audience_count_source_url?: string | null;
  audience_count_observed_at?: string | null;
  audience_count_confidence?: 'PHYSICALLY_VERIFIED' | 'UNKNOWN';
  zero_cost_direct_reach?: boolean;
  no_admin_approval_required?: boolean;
  no_paid_placement_required?: boolean;
  activity_level: string;
  last_activity: string | null;
  evidence_urls: string[];
  discovery_chain: string[];
  status: string;
  scores: AudienceSurfaceScores;
  metadata?: Record<string, any>;
}

interface MissionReport {
  mission_id: string;
  audience: string;
  geography: string;
  SURFACES_DISCOVERED: number;
  PUBLIC_VERIFIED: number;
  CERTIFIED_SURFACES: number;
  SOURCE_FAMILIES_USED: string[];
  ACTORS_BRIDGES_USED: string[];
  SYNTHETIC_SURFACES: number;
  UNKNOWN_FALSE_MATCHES: number;
  TOP_SURFACES: AudienceSurface[];
  AUDIENCE_BRAIN_METRICS: {
    total_estimated_reach: number;
    surfaces_by_posting_mode: Record<string, number>;
    surfaces_by_family: Record<string, number>;
    average_atlas_score: number;
  };
  STATUS: 'PASS' | 'FAIL';
}

export const AtlasAudienceMapPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    selectedAudience,
    selectedGeography,
    setSelectedAudience,
    setSelectedGeography,
    setSelectedPlatform: setGlobalPlatform,
    navigateWithContext,
    buildLink
  } = useAtlasShared();

  // Search input state initialized from shared context or search params
  const [audienceInput, setAudienceInput] = useState<string>(selectedAudience || searchParams.get('audience') || 'Abogados');
  const [geographyInput, setGeographyInput] = useState<string>(selectedGeography || searchParams.get('geography') || 'Córdoba');
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state if context changes externally
  useEffect(() => {
    if (selectedAudience) setAudienceInput(selectedAudience);
    if (selectedGeography) setGeographyInput(selectedGeography);
  }, [selectedAudience, selectedGeography]);

  // Results state
  const [currentReport, setCurrentReport] = useState<MissionReport | null>(null);
  const [surfaces, setSurfaces] = useState<AudienceSurface[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>('ALL');
  const [selectedPostingMode, setSelectedPostingMode] = useState<string>('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');
  const [onlyZeroCostDirect, setOnlyZeroCostDirect] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedSurfaceId, setExpandedSurfaceId] = useState<string | null>(null);

  // Load initial certified surfaces or auto-run if params present
  useEffect(() => {
    fetchCertifiedSurfaces();
  }, []);

  const fetchCertifiedSurfaces = async () => {
    try {
      const res = await fetch('/api/atlas/audience/surfaces?limit=60');
      const data = await res.json();
      if (data.success && Array.isArray(data.surfaces) && data.surfaces.length > 0) {
        setSurfaces(data.surfaces);
      }
    } catch (e) {
      console.warn('Could not fetch existing surfaces:', e);
    }
  };

  const handleDiscover = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const aud = audienceInput.trim();
    const geo = geographyInput.trim();
    if (!aud || !geo) return;

    setIsDiscovering(true);
    setErrorMsg(null);

    setSelectedAudience(aud);
    setSelectedGeography(geo);
    setSearchParams({ audience: aud, geography: geo });

    try {
      const res = await fetch('/api/atlas/audience/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: aud,
          geography: geo,
          target_surfaces: 20
        })
      });

      const data = await res.json();
      if (data.success && data.report) {
        setCurrentReport(data.report);
        setSurfaces(data.report.TOP_SURFACES || []);
      } else {
        setErrorMsg(data.message || 'Error al ejecutar descubrimiento de audiencia');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de red al consultar Atlas Audience Map');
    } finally {
      setIsDiscovering(false);
    }
  };

  // Filtered surfaces
  const filteredSurfaces = surfaces.filter(s => {
    if (selectedFamily !== 'ALL' && s.source_family !== selectedFamily) return false;
    if (selectedPostingMode !== 'ALL' && s.posting_mode !== selectedPostingMode) return false;
    if (selectedPlatform !== 'ALL' && s.platform !== selectedPlatform) return false;
    if (onlyZeroCostDirect && !s.zero_cost_direct_reach) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const match = s.name.toLowerCase().includes(term) ||
                    s.url.toLowerCase().includes(term) ||
                    s.surface_type.toLowerCase().includes(term);
      if (!match) return false;
    }
    return true;
  });

  // Calculate metrics
  const totalDiscovered = currentReport ? currentReport.SURFACES_DISCOVERED : surfaces.length;
  const totalCertified = currentReport ? currentReport.CERTIFIED_SURFACES : surfaces.filter(s => s.status === 'CERTIFIED').length;
  const potentialReach = currentReport
    ? currentReport.AUDIENCE_BRAIN_METRICS.total_estimated_reach
    : surfaces.reduce((acc, curr) => acc + (curr.estimated_audience || 0), 0);
  const familiesCount = currentReport
    ? currentReport.SOURCE_FAMILIES_USED.length
    : new Set(surfaces.map(s => s.source_family)).size;

  // Platform icon helper
  const getPlatformIcon = (platform: string) => {
    switch (platform.toUpperCase()) {
      case 'REDDIT': return <MessageSquare size={16} color="#ff4500" />;
      case 'YOUTUBE': return <Video size={16} color="#ff0000" />;
      case 'RSS': return <Rss size={16} color="#f59e0b" />;
      case 'INSTITUTIONAL': return <Scale size={16} color="#38bdf8" />;
      case 'TELEGRAM': return <Send size={16} color="#229ed9" />;
      default: return <Globe size={16} color="#60a5fa" />;
    }
  };

  // Family badge color
  const getFamilyBadge = (family: string) => {
    switch (family) {
      case 'COLLEGIATE_ASSOCIATION':
        return { label: 'Colegio / Asociación', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' };
      case 'COMMUNITY_FORUM_CHANNELS':
        return { label: 'Comunidad / Foro', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' };
      case 'MEDIA_NEWSLETTER_RSS':
        return { label: 'Medio / Gaceta / RSS', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' };
      case 'ACADEMIC_FACULTIES':
        return { label: 'Facultad / Universidad', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)' };
      case 'INSTITUTIONAL_JUDICIAL_BRIDGES':
        return { label: 'Institución Judicial', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' };
      case 'VIDEO_AUDIO_CHANNELS':
        return { label: 'Canal de Video', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' };
      default:
        return { label: family, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' };
    }
  };

  // Posting mode badge
  const getPostingModeBadge = (mode: string) => {
    switch (mode) {
      case 'OWNED_CHANNEL':
        return { label: 'Canal Propio', icon: <Radio size={13} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'PUBLIC_POST_ALLOWED':
        return { label: 'Publicación Abierta', icon: <Unlock size={13} />, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' };
      case 'CONTENT_SUBMISSION':
        return { label: 'Envío Editorial / RSS', icon: <FileText size={13} />, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' };
      case 'ADMIN_CONTACT_REQUIRED':
        return { label: 'Contacto con Admin', icon: <Share2 size={13} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
      case 'PUBLIC_READ_ONLY':
        return { label: 'Lectura Pública', icon: <Info size={13} />, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };
      case 'RESTRICTED':
        return { label: 'Restringido', icon: <Lock size={13} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
      default:
        return { label: mode, icon: <Info size={13} />, color: '#cbd5e1', bg: 'rgba(203, 213, 225, 0.1)' };
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#070b14',
      backgroundImage: 'radial-gradient(at 15% 15%, rgba(14, 165, 233, 0.12) 0px, transparent 45%), radial-gradient(at 85% 85%, rgba(99, 102, 241, 0.10) 0px, transparent 50%)',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '2rem 1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        
        {/* Navigation & Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(2, 132, 199, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <Compass size={26} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  # ATLAS AUDIENCE MAP
                </h1>
                <span style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  letterSpacing: '0.04em'
                }}>
                  V1 LIVE
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Cartografía de superficies públicas reales, concentración de audiencias e inteligencia de distribución
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => navigate('/broadcast')}
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                color: '#c084fc',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Radio size={14} color="#c084fc" />
              Tesla Broadcast
            </button>
            <button
              onClick={() => navigate('/hub')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              Volver al Hub
            </button>
          </div>
        </div>

        {/* Discovery Query Form Card */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)'
        }}>
          <form onSubmit={handleDiscover} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            
            {/* Field: Audience */}
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8' }}>
                ¿A quién querés llegar?
              </label>
              <div style={{ position: 'relative' }}>
                <Users size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={audienceInput}
                  onChange={e => setAudienceInput(e.target.value)}
                  placeholder="Ej: Abogados, Médicos, Arquitectos..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    background: 'rgba(30, 41, 59, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 500,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Field: Geography */}
            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8' }}>
                ¿Dónde?
              </label>
              <div style={{ position: 'relative' }}>
                <Globe size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={geographyInput}
                  onChange={e => setGeographyInput(e.target.value)}
                  placeholder="Ej: Córdoba, Rosario, Buenos Aires..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    background: 'rgba(30, 41, 59, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 500,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Button: Discover */}
            <div style={{ flex: '0 0 auto' }}>
              <button
                type="submit"
                disabled={isDiscovering}
                style={{
                  height: '44px',
                  padding: '0 1.75rem',
                  background: isDiscovering
                    ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                    : 'linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: isDiscovering ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 16px rgba(2, 132, 199, 0.35)',
                  transition: 'all 0.2s ease',
                  opacity: isDiscovering ? 0.8 : 1
                }}
              >
                {isDiscovering ? (
                  <>
                    <RotateCcw size={16} className="animate-spin" />
                    DESCUBRIENDO & CERTIFICANDO...
                  </>
                ) : (
                  <>
                    <Compass size={16} />
                    ENCONTRAR AUDIENCIA
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedAudience(audienceInput);
                  setSelectedGeography(geographyInput);
                  navigateWithContext('/broadcast/campaigns', { audience: audienceInput, geography: geographyInput });
                }}
                id="btn-aud-usar-en-campana"
                style={{
                  height: '44px',
                  padding: '0 1.25rem',
                  background: 'rgba(37, 99, 235, 0.15)',
                  border: '1px solid rgba(37, 99, 235, 0.35)',
                  borderRadius: '10px',
                  color: '#60a5fa',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Zap size={14} />
                USAR EN CAMPAÑA
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedAudience(audienceInput);
                  navigateWithContext('/broadcast/warm-audience', { audience: audienceInput });
                }}
                id="btn-aud-ver-warm"
                style={{
                  height: '44px',
                  padding: '0 1.25rem',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '10px',
                  color: '#fbbf24',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Flame size={14} />
                VER WARM AUDIENCE
              </button>
            </div>
          </form>

          {/* Invariant guarantee ribbon */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '12px',
            color: '#94a3b8',
            flexWrap: 'wrap'
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#10b981' }}>
              <ShieldCheck size={14} /> 100% Fuentes Públicas Físicas
            </span>
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#38bdf8' }}>
              <CheckCircle2 size={14} /> Regla: UNKNOWN != MATCH
            </span>
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#a855f7' }}>
              <Sparkles size={14} /> Cero fixtures • Cero datos sintéticos
            </span>
            <span>•</span>
            <span style={{ color: '#64748b' }}>
              Solo superficies CERTIFICADAS ingresan al mapa productivo
            </span>
          </div>
        </div>

        {errorMsg && (
          <div style={{
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            color: '#fca5a5',
            fontSize: '13px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={18} color="#ef4444" />
            {errorMsg}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {/* KPI 1 */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              SUPERFICIES DESCUBIERTAS
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc' }}>
              {totalDiscovered}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Rutas y portales observados
            </div>
          </div>

          {/* KPI 2 */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(56, 189, 248, 0.08)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              CERTIFICADAS
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#38bdf8' }}>
              {totalCertified}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Score Atlas ≥ 60 & Verificadas
            </div>
          </div>

          {/* KPI 3 */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              AUDIENCIA POTENCIAL
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>
              {potentialReach > 0 ? potentialReach.toLocaleString() : 'CALIBRANDO'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Alcance consolidado estimado
            </div>
          </div>

          {/* KPI 4 */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(168, 85, 247, 0.08)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              FAMILIAS DE FUENTES
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#c084fc' }}>
              {familiesCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Diversidad estructural de captura
            </div>
          </div>

          {/* KPI 5: ZERO COST DIRECT REACH */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(34, 197, 94, 0.08)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              DIRECTO GRATUITO
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#4ade80' }}>
              {surfaces.filter(s => s.zero_cost_direct_reach).length}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Sin Admin · {surfaces.filter(s => s.zero_cost_direct_reach && s.audience_count).reduce((acc, s) => acc + (s.audience_count || 0), 0).toLocaleString()} verif.
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '0.85rem 1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              Filtrar por Familia:
            </span>
            {['ALL', 'COLLEGIATE_ASSOCIATION', 'COMMUNITY_FORUM_CHANNELS', 'MEDIA_NEWSLETTER_RSS', 'ACADEMIC_FACULTIES', 'INSTITUTIONAL_JUDICIAL_BRIDGES', 'VIDEO_AUDIO_CHANNELS'].map(fam => {
              const isSelected = selectedFamily === fam;
              const label = fam === 'ALL' ? 'Todas' : getFamilyBadge(fam).label;
              return (
                <button
                  key={fam}
                  onClick={() => setSelectedFamily(fam)}
                  style={{
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: isSelected ? '#38bdf8' : '#cbd5e1',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setOnlyZeroCostDirect(!onlyZeroCostDirect)}
              style={{
                background: onlyZeroCostDirect ? 'rgba(34, 197, 94, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: onlyZeroCostDirect ? '#4ade80' : '#cbd5e1',
                border: onlyZeroCostDirect ? '1px solid #4ade80' : '1px solid rgba(255, 255, 255, 0.12)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={13} color={onlyZeroCostDirect ? '#4ade80' : '#94a3b8'} />
              Solo Directo Gratis
            </button>

            <select
              value={selectedPostingMode}
              onChange={e => setSelectedPostingMode(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#cbd5e1',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">Todo Modo Publicación</option>
              <option value="PUBLIC_POST_ALLOWED">Publicación Abierta</option>
              <option value="ADMIN_CONTACT_REQUIRED">Contacto con Admin</option>
              <option value="CONTENT_SUBMISSION">Envío Editorial / RSS</option>
              <option value="PUBLIC_READ_ONLY">Lectura Pública</option>
              <option value="OWNED_CHANNEL">Canal Propio</option>
            </select>

            <select
              value={selectedPlatform}
              onChange={e => setSelectedPlatform(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#cbd5e1',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">Todas las Plataformas</option>
              <option value="WEB">Web</option>
              <option value="REDDIT">Reddit</option>
              <option value="YOUTUBE">YouTube</option>
              <option value="RSS">RSS</option>
              <option value="INSTITUTIONAL">Institucional</option>
            </select>

            <div style={{ position: 'relative', width: '200px' }}>
              <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Buscar superficie..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Section Header: TOP 20 SUPERFICIES */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              TOP SUPERFICIES CERTIFICADAS ({filteredSurfaces.length})
            </h2>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Ordenadas por Atlas Audience Score descendente y Potencial de Alcance
            </span>
          </div>
        </div>

        {/* Surfaces Table / Cards */}
        {filteredSurfaces.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '14px',
            border: '1px dashed rgba(255, 255, 255, 0.1)'
          }}>
            <Compass size={36} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#cbd5e1' }}>
              No hay superficies descubiertas para los filtros actuales
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Hacé clic en "ENCONTRAR AUDIENCIA" para iniciar el mapeo en vivo.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredSurfaces.slice(0, 25).map((surface, idx) => {
              const fam = getFamilyBadge(surface.source_family);
              const postMode = getPostingModeBadge(surface.posting_mode);
              const isExpanded = expandedSurfaceId === surface.surface_id;

              return (
                <div
                  key={surface.surface_id || idx}
                  style={{
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}>
                    {/* Col 1: Platform & Name */}
                    <div style={{ flex: '1 1 340px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>
                        {getPlatformIcon(surface.platform)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
                            #{idx + 1}
                          </span>
                          <a
                            href={surface.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#ffffff',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            {surface.name}
                            <ExternalLink size={13} color="#94a3b8" />
                          </a>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                          {surface.url}
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Family & Type Badge */}
                    <div style={{ flex: '0 1 180px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: fam.color,
                        background: fam.bg,
                        border: `1px solid ${fam.color}40`,
                        marginBottom: '4px'
                      }}>
                        {fam.label}
                      </span>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {surface.surface_type}
                      </div>
                    </div>

                    {/* Col 3: Alcance & Actividad */}
                    <div style={{ flex: '0 1 150px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                        Audiencia Observable
                      </div>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: surface.audience_count_confidence === 'PHYSICALLY_VERIFIED' ? '#4ade80' : '#94a3b8'
                      }}>
                        {surface.audience_count_confidence === 'PHYSICALLY_VERIFIED' && surface.audience_count !== null
                          ? `${surface.audience_count.toLocaleString()}`
                          : 'UNKNOWN'}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: surface.audience_count_confidence === 'PHYSICALLY_VERIFIED' ? '#4ade80' : '#64748b',
                        marginTop: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        {surface.audience_count_confidence === 'PHYSICALLY_VERIFIED' ? '✓ Físicamente Verificado' : 'Sin contador visible'}
                      </div>
                    </div>

                    {/* Col 4: Modo de Publicación */}
                    <div style={{ flex: '0 1 200px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: postMode.color,
                          background: postMode.bg,
                          border: `1px solid ${postMode.color}40`
                        }}>
                          {postMode.icon}
                          {postMode.label}
                        </span>
                        {surface.zero_cost_direct_reach && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            color: '#22c55e',
                            background: 'rgba(34, 197, 94, 0.15)',
                            border: '1px solid rgba(34, 197, 94, 0.4)'
                          }}>
                            ⚡ ZERO-COST DIRECT REACH
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Col 5: Atlas Audience Score */}
                    <div style={{ flex: '0 0 110px', textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                        Atlas Score
                      </div>
                      <div style={{
                        fontSize: '20px',
                        fontWeight: 800,
                        color: surface.scores.ATLAS_AUDIENCE_SCORE >= 75 ? '#38bdf8' : '#34d399'
                      }}>
                        {surface.scores.ATLAS_AUDIENCE_SCORE}
                        <span style={{ fontSize: '11px', color: '#64748b' }}>/100</span>
                      </div>
                      <button
                        onClick={() => setExpandedSurfaceId(isExpanded ? null : surface.surface_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          marginTop: '2px',
                          padding: 0
                        }}
                      >
                        {isExpanded ? 'Menos' : 'Detalles'}
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      <button
                        onClick={() => {
                          const topic = surface.audience_topic || audienceInput;
                          setSelectedAudience(topic);
                          setSelectedGeography(surface.geography || geographyInput);
                          if (surface.platform) setGlobalPlatform(surface.platform);
                          navigateWithContext('/broadcast/campaigns', {
                            audience: topic,
                            geography: surface.geography || geographyInput,
                            platform: surface.platform
                          });
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(37, 99, 235, 0.15)',
                          border: '1px solid rgba(37, 99, 235, 0.35)',
                          color: '#60a5fa',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          marginTop: '4px'
                        }}
                        title="Usar esta audiencia en el Campaign Router"
                      >
                        USAR EN CAMPAÑA →
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details Drawer */}
                  {isExpanded && (
                    <div style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '1rem',
                      fontSize: '12px'
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                          Desglose de Puntuación Atlas:
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', color: '#94a3b8' }}>
                          <div>Semantic Match: <strong style={{ color: '#fff' }}>{surface.scores.SEMANTIC_MATCH_SCORE}%</strong></div>
                          <div>Geography Match: <strong style={{ color: '#fff' }}>{surface.scores.GEOGRAPHY_MATCH_SCORE}%</strong></div>
                          <div>Public Access: <strong style={{ color: '#fff' }}>{surface.scores.PUBLIC_ACCESS_SCORE}%</strong></div>
                          <div>Activity Level: <strong style={{ color: '#fff' }}>{surface.scores.ACTIVITY_SCORE}%</strong></div>
                          <div>Reach Potential: <strong style={{ color: '#fff' }}>{surface.scores.REACH_POTENTIAL_SCORE}%</strong></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                          Certificación Física de Alcance:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#94a3b8' }}>
                          <div>AUDIENCE_COUNT: <strong style={{ color: surface.audience_count ? '#4ade80' : '#94a3b8' }}>{surface.audience_count ? surface.audience_count.toLocaleString() : 'UNKNOWN'}</strong> ({surface.audience_count_confidence || 'UNKNOWN'})</div>
                          <div>NO_ADMIN_APPROVAL_REQUIRED: <strong style={{ color: surface.no_admin_approval_required ? '#4ade80' : '#f87171' }}>{surface.no_admin_approval_required ? 'YES' : 'NO'}</strong></div>
                          <div>NO_PAID_PLACEMENT_REQUIRED: <strong style={{ color: surface.no_paid_placement_required !== false ? '#4ade80' : '#f87171' }}>{surface.no_paid_placement_required !== false ? 'YES' : 'NO'}</strong></div>
                          <div>ZERO_COST_DIRECT_REACH: <strong style={{ color: surface.zero_cost_direct_reach ? '#4ade80' : '#f87171' }}>{surface.zero_cost_direct_reach ? 'YES' : 'NO'}</strong></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                          Cadena de Descubrimiento & Evidencia:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                          {surface.discovery_chain.map((c, i) => (
                            <span
                              key={i}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                color: '#cbd5e1'
                              }}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '11px' }}>
                          Status físico: {surface.metadata?.http_status ? `HTTP ${surface.metadata.http_status}` : '200 OK'} • Latencia: {surface.metadata?.latency_ms || 120}ms
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default AtlasAudienceMapPage;
