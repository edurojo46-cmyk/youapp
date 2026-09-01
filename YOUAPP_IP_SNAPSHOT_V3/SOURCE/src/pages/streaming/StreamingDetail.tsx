import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play, Plus, Check, ArrowLeft, ExternalLink, Share2,
  Radio, Sparkles, Star, Clock, Calendar, Users, Film
} from 'lucide-react';
import { StreamingLayout } from '../../components/streaming/StreamingLayout';
import { StreamingCard } from '../../components/streaming/StreamingCard';
import { useStreamingStore } from '../../store/useStreamingStore';
import { streamingRepository } from '../../lib/streaming/streamingRepository';
import { getProviderInfo } from '../../lib/streaming/providerRegistry';
import { getStreamingCapabilities } from '../../lib/streaming/streamingTypes';
import type { UniversalContent } from '../../lib/streaming/streamingTypes';

export default function StreamingDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();

  const {
    isPlatformEnabled,
    toggleSaveLibrary,
    isInLibrary,
    logStreamingActivity
  } = useStreamingStore();

  const [content, setContent] = useState<UniversalContent | null>(null);
  const [similarTitles, setSimilarTitles] = useState<UniversalContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      setLoading(true);
      streamingRepository.getContentDetail(id, type).then((item) => {
        setContent(item);
        setLoading(false);
      });
      streamingRepository.getRecommendedTitles().then((sims) => {
        setSimilarTitles(sims.filter(s => s.id !== id).slice(0, 4));
      });
    }
  }, [id, type]);

  if (loading) {
    return (
      <StreamingLayout showRightPanel={false}>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
          Cargando detalles de la producción...
        </div>
      </StreamingLayout>
    );
  }

  if (!content) {
    return (
      <StreamingLayout showRightPanel={false}>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
          <p style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Título no encontrado</p>
          <button className="mp-btn-primary" onClick={() => navigate('/explorar')} style={{ margin: '16px auto' }}>
            Explorar catálogo
          </button>
        </div>
      </StreamingLayout>
    );
  }

  const capabilities = getStreamingCapabilities(content);
  const primaryProv = getProviderInfo(content.primaryProvider);
  const isIncluded = isPlatformEnabled(content.primaryProvider);

  const handleLaunch = (url?: string, defaultUrl?: string) => {
    logStreamingActivity(content);
    const target = (url && url !== '#') ? url : defaultUrl;
    if (target && target !== '#') {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: content.title,
          text: `Mirá ${content.title} en YouApp`,
          url: window.location.href
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Enlace copiado al portapapeles');
      }
    } catch {
      // cancel
    }
  };

  // Group availability
  const mySubscriptions = content.availability.filter(a =>
    a.access === 'subscription' && isPlatformEnabled(a.provider)
  );

  const otherSubscriptions = content.availability.filter(a =>
    a.access === 'subscription' && !isPlatformEnabled(a.provider)
  );

  const transactional = content.availability.filter(a =>
    a.access === 'rent' || a.access === 'buy' || a.access === 'free'
  );

  return (
    <StreamingLayout showRightPanel={true}>
      {/* Back button */}
      <button
        className="mp-btn-secondary"
        onClick={() => navigate(-1)}
        style={{ marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
      >
        <ArrowLeft size={15} />
        <span>Volver</span>
      </button>

      {/* Backdrop Hero Card */}
      <div
        style={{
          position: 'relative',
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#0f172a',
          color: '#ffffff',
          marginBottom: '32px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
        }}
      >
        {content.backdropUrl && (
          <img
            src={content.backdropUrl}
            alt={content.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.35
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(15,23,42,0.95) 10%, rgba(15,23,42,0.4) 100%)'
          }}
        />

        <div style={{ position: 'relative', zIndex: 2, padding: '36px', display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
          <img
            src={content.posterUrl}
            alt={content.title}
            style={{
              width: '160px',
              borderRadius: '16px',
              objectFit: 'cover',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              flexShrink: 0
            }}
          />

          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ background: '#007aff', color: '#ffffff', padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                {content.type.toUpperCase()}
              </span>
              <span style={{ color: '#00f0ff', fontSize: '13px', fontWeight: 700 }}>
                {content.matchScore || 95}% match para vos
              </span>
            </div>

            <h1 style={{ fontSize: '32px', fontWeight: 900, margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
              {content.title}
            </h1>

            <div style={{ display: 'flex', gap: '16px', fontSize: '13.5px', color: '#cbd5e1', marginBottom: '16px', flexWrap: 'wrap' }}>
              {content.year && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} /> {content.year}
                </span>
              )}
              {content.durationText && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={14} /> {content.durationText}
                </span>
              )}
              {content.rating && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                  <Star size={14} fill="#fbbf24" /> {content.rating.toFixed(1)} / 10
                </span>
              )}
            </div>

            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#e2e8f0', maxWidth: '640px', marginBottom: '24px' }}>
              {content.description}
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="mp-btn-primary"
                onClick={() => handleLaunch(content.availability[0]?.webUrl)}
                style={{ padding: '12px 24px', fontSize: '14px' }}
              >
                <Play size={16} fill="#ffffff" />
                <span>Ver en {primaryProv.name} {isIncluded ? '(Incluida)' : ''}</span>
              </button>

              <button
                className="mp-btn-secondary"
                onClick={() => toggleSaveLibrary(content)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }}
              >
                {isInLibrary(content.id) ? (
                  <>
                    <Check size={16} color="#00f0ff" />
                    <span>En mi lista</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Guardar en mi lista</span>
                  </>
                )}
              </button>

              {capabilities.share && (
                <button
                  className="mp-btn-secondary"
                  onClick={handleShare}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }}
                >
                  <Share2 size={16} />
                  <span>Compartir</span>
                </button>
              )}

              {capabilities.addToSignal && (
                <button
                  className="mp-btn-secondary"
                  onClick={() => {
                    navigate('/programartv');
                  }}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }}
                >
                  <Radio size={16} />
                  <span>Mi Señal</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── DÓNDE VERLA EN ARGENTINA (CARD) ── */}
      <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '28px', marginBottom: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
          Disponibilidad en Argentina 🇦🇷
        </h2>

        {/* 1. TU SUSCRIPCIÓN */}
        {mySubscriptions.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#007aff', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Incluida con tus plataformas activas
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mySubscriptions.map((avail, idx) => {
                const prov = getProviderInfo(avail.provider);
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      background: '#f0f7ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                        {prov.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#007aff', fontWeight: 600 }}>
                        ✓ Incluida en tu suscripción declarada
                      </div>
                    </div>

                    <button
                      className="mp-btn-primary"
                      onClick={() => handleLaunch(avail.webUrl)}
                    >
                      <Play size={14} fill="#ffffff" />
                      <span>Abrir {prov.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. OTRAS SUSCRIPCIONES */}
        {otherSubscriptions.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Otras plataformas con suscripción
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {otherSubscriptions.map((avail, idx) => {
                const prov = getProviderInfo(avail.provider);
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {prov.name}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                        Requiere suscripción activa a {prov.name}
                      </div>
                    </div>

                    <button
                      className="mp-btn-secondary"
                      onClick={() => handleLaunch(avail.webUrl)}
                    >
                      <ExternalLink size={13} />
                      <span>Ver en {prov.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. ALQUILER Y COMPRA */}
        {transactional.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Opciones de Alquiler y Compra
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transactional.map((avail, idx) => {
                const prov = getProviderInfo(avail.provider);
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {prov.name}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {avail.accessLabel || (avail.access === 'rent' ? 'Alquiler digital' : 'Compra')}
                      </div>
                    </div>

                    <button
                      className="mp-btn-secondary"
                      onClick={() => handleLaunch(avail.webUrl)}
                    >
                      <ExternalLink size={13} />
                      <span>Ver opción</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8', textAlign: 'right' }}>
          Trazabilidad: {content.availability[0]?.source || 'tmdb_justwatch'} · Verificado en Argentina 🇦🇷
        </div>
      </div>

      {/* ── FICHA TÉCNICA & REPARTO ── */}
      <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '28px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
          Ficha técnica & Créditos
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          {content.director && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Dirección</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{content.director}</div>
            </div>
          )}

          {content.genres && content.genres.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Géneros</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{content.genres.join(', ')}</div>
            </div>
          )}

          {content.cast && content.cast.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Reparto principal</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{content.cast.join(' · ')}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── TÍTULOS SIMILARES ── */}
      {similarTitles.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title">
              <Sparkles size={18} color="#007aff" />
              <span>Títulos afines recomendados</span>
            </div>
          </div>

          <div className="mp-grid-cards">
            {similarTitles.map((item) => (
              <StreamingCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}
    </StreamingLayout>
  );
}
