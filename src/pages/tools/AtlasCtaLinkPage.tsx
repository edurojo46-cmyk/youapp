/**
 * ATLAS — CTA LINK FRONT TEST (APPLE PRO STYLE)
 * Route: /tools/cta-link
 * Name: Links de publicación
 *
 * Visual test interface for ATLAS_CTA_LINK_ENGINE (SIMULATION_ONLY).
 */
import React, { useState } from 'react';
import {
  Link2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  MousePointerClick,
  Clock,
  AlertCircle
} from 'lucide-react';
import { AtlasCtaLinkEngineInstance } from '../../lib/atlas/atlasCtaLinkEngine';

export type LinkPlacement =
  | 'DIRECT_LINK'
  | 'DESCRIPTION_LINK'
  | 'PROFILE_LINK'
  | 'BIO_CTA'
  | 'RELATED_VIDEO'
  | 'VISUAL_CTA_ONLY';

export type CtaOutput = ReturnType<typeof AtlasCtaLinkEngineInstance.generate>;

// Clean vector icons for platforms
const YouTubeIcon: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 15, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const InstagramIcon: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 15, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const TikTokIcon: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 15, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
  </svg>
);

const PRESET_VIDEOS = [
  { id: 'STORY_001', label: 'STORY_001 — La piedra en el sendero (Historia Emotiva 1)' },
  { id: 'STORY_002', label: 'STORY_002 — El árbol pequeño (Historia Emotiva 2)' },
  { id: 'STORY_003', label: 'STORY_003 — La lámpara de aceite (Historia Emotiva 3)' },
  { id: 'yt-tlCfRT7VbVU', label: 'yt-tlCfRT7VbVU — El Papa Francisco habla sobre Maria' },
  { id: 'CUSTOM', label: 'Otro (Ingresar ID manual)' }
];

const PLATFORMS = [
  { id: 'YOUTUBE', label: 'YouTube', icon: YouTubeIcon },
  { id: 'INSTAGRAM', label: 'Instagram', icon: InstagramIcon },
  { id: 'TIKTOK', label: 'TikTok', icon: TikTokIcon }
];

export const AtlasCtaLinkPage: React.FC = () => {
  // Form State
  const [selectedVideoPreset, setSelectedVideoPreset] = useState<string>('STORY_001');
  const [customVideoId, setCustomVideoId] = useState<string>('');
  const [platform, setPlatform] = useState<string>('YOUTUBE');
  const [destinationUrl, setDestinationUrl] = useState<string>('https://youapp.ai/campanias/emotive-stories');
  const [campaignId, setCampaignId] = useState<string>('CAMP_EMOTIVE_V1');

  // Result State
  const [result, setResult] = useState<CtaOutput | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Click & Tracking Test State
  const [clickCount, setClickCount] = useState<number>(0);
  const [trackingStatus, setTrackingStatus] = useState<string | null>(null);

  const effectiveVideoId = selectedVideoPreset === 'CUSTOM' ? (customVideoId.trim() || 'VIDEO_CUSTOM') : selectedVideoPreset;

  const handleGenerate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Call ATLAS_CTA_LINK_ENGINE (Simulation Only)
    const generated = AtlasCtaLinkEngineInstance.generate({
      videoId: effectiveVideoId,
      platform,
      destinationUrl: destinationUrl.trim() || 'https://youapp.ai',
      campaignId: campaignId.trim() || 'CAMP_DEFAULT'
    });

    setResult(generated);
    setTrackingStatus(null);
    setClickCount(0); // Reset clicks on new generation (NO inventar clics)
    setTimeout(() => {
      document.getElementById('cta-results-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleTestLink = () => {
    // 1. Record authentic test click
    const nextClicks = clickCount + 1;
    setClickCount(nextClicks);

    // 2. Evaluate if real tracking redirect service exists
    // In current simulation mode, tracking is simulated and pending deployment
    setTrackingStatus('TRACKING PENDIENTE');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getPlacementExplanation = (placement: LinkPlacement, plat: string) => {
    switch (placement) {
      case 'DESCRIPTION_LINK':
        return 'Enlace interactivo directo en la descripción del video de YouTube.';
      case 'PROFILE_LINK':
        return 'Enlace interactivo colocado en la biografía del perfil (Instagram no admite links clicables en descripciones de publicaciones).';
      case 'BIO_CTA':
        return 'Llamada a la acción visual hacia el enlace del perfil (TikTok no permite enlaces clicables en descripciones de videos).';
      case 'RELATED_VIDEO':
        return 'Enlace a video relacionado / interactivo en YouTube Shorts.';
      case 'VISUAL_CTA_ONLY':
        return 'Texto visual superpuesto en pantalla o watermark.';
      case 'DIRECT_LINK':
      default:
        return 'Enlace directo nativo en la publicación.';
    }
  };

  return (
    <div
      className="atlas-cta-link-page"
      style={{
        maxWidth: '940px',
        margin: '0 auto',
        padding: '20px 20px 60px',
        width: '100%',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif'
      }}
    >
      {/* Discreet Header */}
      <div style={{ marginBottom: '18px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '20px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            fontSize: '11px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '8px'
          }}
        >
          <Sparkles size={11} style={{ color: '#38bdf8' }} />
          <span>Atlas CTA Link Engine V1</span>
        </div>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            color: '#f8fafc',
            margin: '0 0 4px',
            letterSpacing: '-0.02em'
          }}
        >
          Links de publicación
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          Generador de llamadas a la acción, reglas de colocación de enlaces y tracking inteligente
        </p>
      </div>

      {/* Main Configuration Card */}
      <div
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
          marginBottom: '20px'
        }}
      >
        <form onSubmit={handleGenerate}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
              marginBottom: '16px'
            }}
          >
            {/* Video Selection */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '8px'
                }}
              >
                Video
              </label>
              <select
                id="select-video-preset"
                value={selectedVideoPreset}
                onChange={e => setSelectedVideoPreset(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              >
                {PRESET_VIDEOS.map(v => (
                  <option key={v.id} value={v.id} style={{ backgroundColor: '#0f172a' }}>
                    {v.label}
                  </option>
                ))}
              </select>

              {selectedVideoPreset === 'CUSTOM' && (
                <input
                  id="input-custom-video-id"
                  type="text"
                  placeholder="Ingresar ID del video (ej: yt-l5d93lTX_lE)"
                  value={customVideoId}
                  onChange={e => setCustomVideoId(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              )}
            </div>

            {/* Platform Segmented Buttons */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '8px'
                }}
              >
                Plataforma
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PLATFORMS.map(p => {
                  const isSelected = platform === p.id;
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      id={`btn-platform-${p.id.toLowerCase()}`}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '9px 16px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 600 : 400,
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: isSelected ? '#38bdf8' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.14s ease'
                      }}
                    >
                      {Icon && <Icon size={14} />}
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* URL Destino & Campaña */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '8px'
                }}
              >
                URL destino
              </label>
              <input
                id="input-destination-url"
                type="url"
                value={destinationUrl}
                onChange={e => setDestinationUrl(e.target.value)}
                placeholder="https://youapp.ai/campania"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '8px'
                }}
              >
                Campaña
              </label>
              <input
                id="input-campaign-id"
                type="text"
                value={campaignId}
                onChange={e => setCampaignId(e.target.value)}
                placeholder="CAMP_EMOTIVE_V1"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Action Button: GENERAR PRUEBA */}
          <div>
            <button
              id="btn-generate-cta"
              type="submit"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '10px',
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.03em',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                transition: 'all 0.16s ease'
              }}
            >
              <Sparkles size={15} />
              <span>GENERAR PRUEBA</span>
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {result && (
        <div
          id="cta-results-card"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
            marginBottom: '28px'
          }}
        >
          {/* Header Row: Title & Simulation Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link2 size={16} style={{ color: '#38bdf8' }} />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                Resultado de la simulación
              </span>
            </div>

            <div
              id="badge-simulation-only"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '20px',
                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                color: '#facc15',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em'
              }}
            >
              <Clock size={12} />
              <span>SIMULATION_ONLY</span>
            </div>
          </div>

          {/* Grid of Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '22px' }}>
            {/* CTA generado */}
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                CTA generado
              </div>
              <div
                id="display-cta-text"
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: '#38bdf8',
                  lineHeight: 1.4
                }}
              >
                {result.CTA_TEXT}
              </div>
            </div>

            {/* Dónde se colocaría (LINK_PLACEMENT) */}
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                Dónde se colocaría
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  id="display-link-placement"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    fontWeight: 700
                  }}
                >
                  {result.LINK_PLACEMENT}
                </span>
                <span style={{ fontSize: '12.5px', color: '#cbd5e1' }}>
                  {getPlacementExplanation(result.LINK_PLACEMENT, platform)}
                </span>
              </div>
            </div>

            {/* Tracking URL */}
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tracking URL
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(result.TRACKING_URL)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copied ? '#34d399' : '#94a3b8',
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <div
                id="display-tracking-url"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#f8fafc',
                  wordBreak: 'break-all',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.04)'
                }}
              >
                {result.TRACKING_URL}
              </div>
            </div>

            {/* URL destino */}
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                URL destino
              </div>
              <div
                id="display-destination-url"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#94a3b8',
                  wordBreak: 'break-all'
                }}
              >
                {destinationUrl}
              </div>
            </div>
          </div>

          {/* Action Row: PROBAR LINK & Tracking Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                id="btn-test-link"
                type="button"
                onClick={handleTestLink}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.14s ease'
                }}
              >
                <MousePointerClick size={14} />
                <span>PROBAR LINK</span>
              </button>

              {trackingStatus && (
                <span
                  id="status-tracking-state"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                >
                  <AlertCircle size={13} />
                  <span>{trackingStatus}</span>
                </span>
              )}
            </div>

            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Real publication: 0 (No se emiten publicaciones a plataformas externas)
            </div>
          </div>
        </div>
      )}

      {/* MÉTRICAS VISIBLES (Exact contract requested) */}
      <div
        id="cta-metrics-panel"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '18px 20px',
          fontFamily: 'monospace'
        }}
      >
        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          Métricas Visibles del Motor
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12px' }}>
          <div>
            <span style={{ color: '#64748b' }}>PLATFORM=</span>
            <span id="metric-platform" style={{ color: '#38bdf8', fontWeight: 600 }}>{result ? result.DETAILS.platform : platform}</span>
          </div>

          <div>
            <span style={{ color: '#64748b' }}>LINK_PLACEMENT=</span>
            <span id="metric-placement" style={{ color: '#38bdf8', fontWeight: 600 }}>{result ? result.LINK_PLACEMENT : 'PENDING'}</span>
          </div>

          <div>
            <span style={{ color: '#64748b' }}>CLICKS=</span>
            <span id="metric-clicks" style={{ color: '#34d399', fontWeight: 700 }}>{clickCount}</span>
          </div>

          <div>
            <span style={{ color: '#64748b' }}>CTR=</span>
            <span id="metric-ctr" style={{ color: '#fbbf24', fontWeight: 600 }}>UNKNOWN</span>
          </div>
        </div>

        {result && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '11px' }}>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: '#64748b' }}>CTA_TEXT=</span>
              <span id="metric-cta-text" style={{ color: '#cbd5e1' }}>"{result.CTA_TEXT}"</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>TRACKING_URL=</span>
              <span id="metric-tracking-url" style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>{result.TRACKING_URL}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AtlasCtaLinkPage;
