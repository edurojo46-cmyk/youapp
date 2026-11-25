/**
 * ATLAS — IMAGE DISCOVERY FRONT DISCRETO (APPLE PRO STYLE)
 * Route: /tools/image-discovery
 *
 * Exposes ATLAS_IMAGE_DISCOVERY_ENGINE cleanly, discreetly and non-invasively.
 */
import React, { useState } from 'react';
import {
  Search,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  X,
  Layers,
  Image as ImageIcon,
  Video,
  Film,
  Loader2
} from 'lucide-react';

interface DiscoveredItem {
  id?: number;
  asset_id?: string;
  assetId?: string;
  collection_id?: string;
  collectionId?: string;
  objective?: string;
  profile?: string;
  source: string;
  source_id?: string;
  sourceId?: string;
  source_url?: string;
  sourceUrl?: string;
  media_url?: string;
  mediaUrl?: string;
  thumb_url?: string;
  thumbUrl?: string;
  title: string;
  creator?: string;
  license?: string;
  license_url?: string;
  licenseUrl?: string;
  attribution_required?: boolean;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  aspectRatio?: string;
  sha256?: string;
  visual_quality_score?: number;
  visualQualityScore?: number;
  scores?: any;
}

const PROFILE_OPTIONS = [
  { id: 'GENERAL_IMAGE', label: 'General' },
  { id: 'NATURE_PREMIUM', label: 'Naturaleza Premium' },
  { id: 'ARCHITECTURE', label: 'Arquitectura' },
  { id: 'HISTORICAL', label: 'Histórico' },
  { id: 'TRAVEL', label: 'Viajes' },
  { id: 'PRODUCT', label: 'Productos' }
];

export const AtlasImageDiscoveryPage: React.FC = () => {
  // Form State
  const [objective, setObjective] = useState('');
  const [mediaType, setMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [targetCount, setTargetCount] = useState<number>(5);
  const [profile, setProfile] = useState<string>('NATURE_PREMIUM');

  // Advanced Options State (Hidden by default)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [minQuality, setMinQuality] = useState<number>(80);
  const [licensePolicy, setLicensePolicy] = useState<string>('COMMERCIAL_PERMISSIVE');
  const [customCollection, setCustomCollection] = useState<string>('');

  // Execution & Progress State
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [progressCertified, setProgressCertified] = useState<number>(0);
  const [progressTarget, setProgressTarget] = useState<number>(5);
  const [searchStatusText, setSearchStatusText] = useState<string>('');
  const [results, setResults] = useState<DiscoveredItem[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState<DiscoveredItem | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!objective.trim()) return;

    setIsSearching(true);
    setErrorMsg('');
    setProgressCertified(0);
    setProgressTarget(targetCount);
    setSearchStatusText('Buscando...');
    setResults([]);

    const collectionId = customCollection.trim() || `COLLECTION_${profile}_${Date.now()}`;
    setActiveCollectionId(collectionId);

    // Setup polling interval to update progress counter from DB in real-time
    const pollInterval = setInterval(async () => {
      try {
        const pRes = await fetch(`/api/atlas/image-discovery/collections/${collectionId}`);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (Array.isArray(pData.items) && pData.items.length > 0) {
            setProgressCertified(pData.items.length);
          }
        }
      } catch {}
    }, 2000);

    try {
      const response = await fetch('/api/atlas/image-discovery/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: objective.trim(),
          mediaType,
          profile,
          target: targetCount,
          quality: showAdvanced ? minQuality : undefined,
          licensePolicy: showAdvanced ? licensePolicy : undefined,
          outputCollection: collectionId
        })
      });

      clearInterval(pollInterval);

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.statusText}`);
      }

      const data = await response.json();
      const discovered = data.result?.discoveredAssets || [];

      if (discovered.length > 0) {
        setResults(discovered);
        setProgressCertified(discovered.length);
        setTimeout(() => {
          document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else {
        // Fallback: fetch final collection directly from readback endpoint
        const readbackRes = await fetch(`/api/atlas/image-discovery/collections/${collectionId}`);
        const readbackData = await readbackRes.json();
        if (readbackData.items && readbackData.items.length > 0) {
          setResults(readbackData.items);
          setProgressCertified(readbackData.items.length);
          setTimeout(() => {
            document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        }
      }
    } catch (err: any) {
      clearInterval(pollInterval);
      console.error('Search error:', err);
      setErrorMsg(err.message || 'Error al ejecutar la búsqueda');
    } finally {
      clearInterval(pollInterval);
      setIsSearching(false);
      setSearchStatusText('');
    }
  };

  return (
    <div
      className="atlas-image-discovery-page"
      style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '36px 20px 80px',
        width: '100%',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif'
      }}
    >
      {/* Discreet Header */}
      <div style={{ marginBottom: '28px', textAlign: 'center' }}>
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
            marginBottom: '10px'
          }}
        >
          <Sparkles size={11} style={{ color: '#38bdf8' }} />
          <span>Atlas Media Discovery Engine</span>
        </div>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: '#f8fafc',
            margin: '0 0 6px',
            letterSpacing: '-0.02em'
          }}
        >
          Buscar imágenes y videos
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          Descubrimiento y evaluación multimedia certificada con licencias y derechos verificados
        </p>
      </div>

      {/* Apple-style Compact Search Card */}
      <div
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
          marginBottom: '32px'
        }}
      >
        <form onSubmit={handleSearch}>
          {/* Main Search Row */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '18px'
            }}
          >
            {/* Media Type Selector: Foto / Video */}
            <div
              style={{
                display: 'inline-flex',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                padding: '3px',
                gap: '2px'
              }}
            >
              <button
                type="button"
                id="btn-media-type-image"
                onClick={() => setMediaType('IMAGE')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: mediaType === 'IMAGE' ? '#38bdf8' : 'transparent',
                  color: mediaType === 'IMAGE' ? '#07090e' : '#94a3b8',
                  transition: 'all 0.15s ease'
                }}
              >
                <ImageIcon size={14} /> Foto
              </button>
              <button
                type="button"
                id="btn-media-type-video"
                onClick={() => setMediaType('VIDEO')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: mediaType === 'VIDEO' ? '#38bdf8' : 'transparent',
                  color: mediaType === 'VIDEO' ? '#07090e' : '#94a3b8',
                  transition: 'all 0.15s ease'
                }}
              >
                <Film size={14} /> Video
              </button>
            </div>

            {/* Input Objective */}
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b'
                }}
              />
              <input
                id="input-image-objective"
                type="text"
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder={mediaType === 'VIDEO' ? '¿Qué videos querés encontrar? (ej: mountain sunset, ocean waves)' : '¿Qué imágenes querés encontrar?'}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
                disabled={isSearching}
              />
            </div>

            {/* Input Cantidad */}
            <div style={{ width: '90px' }}>
              <input
                id="input-image-target"
                type="number"
                min={1}
                max={50}
                value={targetCount}
                onChange={e => setTargetCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                title="Cantidad objetivo"
                style={{
                  width: '100%',
                  padding: '12px 10px',
                  textAlign: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
                disabled={isSearching}
              />
            </div>

            {/* Action Button: BUSCAR */}
            <div>
              <button
                id="btn-search-images"
                type="submit"
                disabled={isSearching || !objective.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  backgroundColor: isSearching ? 'rgba(56, 189, 248, 0.4)' : '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  cursor: isSearching || !objective.trim() ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                  transition: 'all 0.16s ease'
                }}
              >
                {isSearching ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>BUSCANDO...</span>
                  </>
                ) : (
                  <span>BUSCAR</span>
                )}
              </button>
            </div>
          </div>

          {/* Profile Selector (Apple Segmented Pills) */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px'
              }}
            >
              Perfil
            </div>
            <div
              style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap'
              }}
            >
              {PROFILE_OPTIONS.map(opt => {
                const isSelected = profile === opt.id;
                return (
                  <button
                    key={opt.id}
                    id={`profile-btn-${opt.id}`}
                    type="button"
                    onClick={() => setProfile(opt.id)}
                    disabled={isSearching}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: isSelected ? 600 : 400,
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                      color: isSelected ? '#38bdf8' : '#94a3b8',
                      cursor: isSearching ? 'not-allowed' : 'pointer',
                      transition: 'all 0.14s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discrete Progress Strip */}
          {isSearching && (
            <div
              id="search-progress-strip"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '8px',
                marginTop: '12px',
                marginBottom: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#38bdf8',
                    boxShadow: '0 0 10px #38bdf8'
                  }}
                  className="animate-pulse"
                />
                <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: 500 }}>
                  Buscando...
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  CERTIFIED / TARGET:
                </span>
                <span
                  id="progress-counter"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#38bdf8'
                  }}
                >
                  {progressCertified} / {progressTarget}
                </span>
              </div>
            </div>
          )}

          {/* Advanced Options Accordion */}
          <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '12px' }}>
            <button
              id="btn-toggle-advanced"
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '4px 0'
              }}
            >
              <Sliders size={13} />
              <span>Opciones avanzadas</span>
              {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showAdvanced && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '14px',
                  marginTop: '14px',
                  padding: '16px',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                    Calidad mínima (Score 0-100)
                  </label>
                  <input
                    id="input-min-quality"
                    type="number"
                    min={40}
                    max={95}
                    value={minQuality}
                    onChange={e => setMinQuality(parseInt(e.target.value, 10) || 80)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '12px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                    Licencia
                  </label>
                  <select
                    id="select-license-policy"
                    value={licensePolicy}
                    onChange={e => setLicensePolicy(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '12px'
                    }}
                  >
                    <option value="COMMERCIAL_PERMISSIVE">Permisiva / Comercial (CC0, CC-BY, PDM)</option>
                    <option value="ANY_OPEN">Cualquier licencia abierta</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                    Colección destino (Opcional)
                  </label>
                  <input
                    id="input-custom-collection"
                    type="text"
                    value={customCollection}
                    onChange={e => setCustomCollection(e.target.value)}
                    placeholder="Auto-generada única"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '12px'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            color: '#f87171',
            fontSize: '13px',
            marginBottom: '20px'
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Results Header */}
      {results.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
            Resultados ({results.length})
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
            COLECCIÓN: {activeCollectionId || results[0]?.collection_id || results[0]?.collectionId}
          </div>
        </div>
      )}

      {/* Simple Image Grid */}
      <div
        id="image-results-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px'
        }}
      >
        {results.map((item, index) => {
          const thumb = item.thumb_url || item.thumbUrl || item.media_url || item.mediaUrl;
          const score = item.visual_quality_score || item.visualQualityScore || 0;
          const source = item.source || 'WIKIMEDIA_COMMONS';

          return (
            <div
              key={item.sha256 || index}
              id={`image-card-${index}`}
              onClick={() => setSelectedItem(item)}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
                display: 'flex',
                flexDirection: 'column'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  backgroundColor: '#0a0f1d',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={item.title}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#475569'
                    }}
                  >
                    <ImageIcon size={28} />
                  </div>
                )}
                {/* VIDEO BADGES: DURATION & RESOLUTION */}
                {((item as any).media_type === 'VIDEO' || (item as any).duration_seconds || (item as any).durationSeconds) && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      display: 'flex',
                      gap: '4px',
                      alignItems: 'center'
                    }}
                  >
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(4px)',
                        color: '#f8fafc',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      {Math.round((item as any).duration_seconds || (item as any).durationSeconds || 10)}s
                    </span>
                    {((item as any).resolution || (item.width && item.height ? `${item.width}x${item.height}` : null)) && (
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(56, 189, 248, 0.25)',
                          backdropFilter: 'blur(4px)',
                          color: '#38bdf8',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          border: '1px solid rgba(56, 189, 248, 0.4)'
                        }}
                      >
                        {(item as any).resolution || `${item.width}x${item.height}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer: Quality Score + Source */}
              <div
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                {/* QUALITY_SCORE */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} style={{ color: '#38bdf8' }} />
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: score >= 90 ? '#34d399' : '#38bdf8',
                      fontFamily: 'monospace'
                    }}
                  >
                    SCORE {Math.round(score)}
                  </span>
                </div>

                {/* SOURCE */}
                <span
                  style={{
                    fontSize: '10px',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 500
                  }}
                >
                  {source.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal (Full detail only on click) */}
      {selectedItem && (
        <div
          id="image-detail-modal"
          onClick={() => setSelectedItem(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 9999
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#0b1120',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)'
            }}
          >
            {/* Modal Image */}
            <div style={{ width: '100%', maxHeight: '360px', overflow: 'hidden', position: 'relative' }}>
              <img
                src={selectedItem.media_url || selectedItem.mediaUrl || selectedItem.thumb_url || selectedItem.thumbUrl}
                alt={selectedItem.title}
                style={{
                  width: '100%',
                  maxHeight: '360px',
                  objectFit: 'contain',
                  backgroundColor: '#020617'
                }}
              />
              <button
                id="btn-close-modal"
                onClick={() => setSelectedItem(null)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: '0 0 10px' }}>
                {selectedItem.title}
              </h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  marginBottom: '16px',
                  fontSize: '12px'
                }}
              >
                <div>
                  <span style={{ color: '#64748b' }}>Creador / Autor:</span>
                  <div style={{ color: '#e2e8f0', fontWeight: 500 }}>
                    {selectedItem.creator || 'Wikimedia Commons'}
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b' }}>Licencia:</span>
                  <div style={{ color: '#38bdf8', fontWeight: 500 }}>
                    {selectedItem.license || 'Open License'}
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b' }}>Dimensiones:</span>
                  <div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>
                    {selectedItem.width} × {selectedItem.height} px
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b' }}>Quality Score:</span>
                  <div style={{ color: '#34d399', fontWeight: 700, fontFamily: 'monospace' }}>
                    {Math.round(selectedItem.visual_quality_score || selectedItem.visualQualityScore || 0)} / 100
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
                <a
                  href={selectedItem.media_url || selectedItem.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    fontSize: '12px',
                    fontWeight: 500,
                    textDecoration: 'none'
                  }}
                >
                  <ExternalLink size={13} />
                  <span>Ver imagen original</span>
                </a>

                {selectedItem.source_url || selectedItem.sourceUrl ? (
                  <a
                    href={selectedItem.source_url || selectedItem.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#94a3b8',
                      fontSize: '12px',
                      textDecoration: 'none'
                    }}
                  >
                    <span>Fuente original</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtlasImageDiscoveryPage;
