import React from 'react';
import { X, Check, Plus, ExternalLink, Play } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';
import { getProviderInfo } from '../../lib/streaming/providerRegistry';

export const AvailabilityModal: React.FC = () => {
  const {
    selectedContentForDetails,
    setSelectedContentForDetails,
    isPlatformEnabled,
    toggleSaveLibrary,
    isInLibrary,
    logStreamingActivity
  } = useStreamingStore();

  if (!selectedContentForDetails) return null;

  const content = selectedContentForDetails;

  const handleLaunch = (url?: string, defaultUrl?: string) => {
    logStreamingActivity(content);
    const target = (url && url !== '#') ? url : defaultUrl;
    if (target && target !== '#') {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  // Group availability by priority
  const mySubscriptionOptions = content.availability.filter(a => 
    a.access === 'subscription' && isPlatformEnabled(a.provider)
  );

  const otherSubscriptionOptions = content.availability.filter(a => 
    a.access === 'subscription' && !isPlatformEnabled(a.provider)
  );

  const transactionalOptions = content.availability.filter(a => 
    a.access === 'rent' || a.access === 'buy' || a.access === 'free'
  );

  return (
    <div
      className="mp-modal-backdrop"
      onClick={() => setSelectedContentForDetails(null)}
    >
      <div
        className="mp-modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="mp-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 className="mp-modal-title">{content.title}</h3>
            <span
              style={{
                background: '#f0f7ff',
                color: '#007aff',
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 800
              }}
            >
              {content.matchScore || 95}% match
            </span>
          </div>

          <button
            className="mp-modal-close"
            onClick={() => setSelectedContentForDetails(null)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Media Top info */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
          <img
            src={content.posterUrl}
            alt={content.title}
            style={{
              width: '110px',
              borderRadius: '12px',
              objectFit: 'cover',
              boxShadow: '0 4px 14px rgba(0,0,0,0.1)'
            }}
          />

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
              {content.year} · {content.durationText || `${content.durationMin} min`} · {content.genres.join(', ')}
            </div>

            {content.director && (
              <div style={{ fontSize: '12.5px', color: '#334155', marginBottom: '4px' }}>
                <strong>Director:</strong> {content.director}
              </div>
            )}

            {content.cast && content.cast.length > 0 && (
              <div style={{ fontSize: '12.5px', color: '#334155', marginBottom: '8px' }}>
                <strong>Elenco:</strong> {content.cast.slice(0, 3).join(', ')}
              </div>
            )}

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: 0 }}>
              {content.description}
            </p>
          </div>
        </div>

        {/* ── DÓNDE VERLA EN ARGENTINA ── */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
          <div style={{ fontSize: '15px', fontWeigth: 800, fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>
            Dónde verla en Argentina
          </div>

          {/* 1. TU SUSCRIPCIÓN (Ya lo pagás) */}
          {mySubscriptionOptions.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#007aff', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Tu suscripción (Incluida)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mySubscriptionOptions.map((avail, idx) => {
                  const prov = getProviderInfo(avail.provider);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: '#f0f7ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                          {prov.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#007aff', fontWeight: 600 }}>
                          ✓ Incluida con tu suscripción
                        </div>
                      </div>

                      <button
                        className="mp-btn-primary"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                        onClick={() => handleLaunch(avail.webUrl, prov.defaultWebUrl)}
                      >
                        <Play size={13} fill="#ffffff" />
                        <span>Ver ahora</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. OTRAS SUSCRIPCIONES */}
          {otherSubscriptionOptions.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Otras suscripciones
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {otherSubscriptionOptions.map((avail, idx) => {
                  const prov = getProviderInfo(avail.provider);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 16px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                          {prov.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          Requiere suscripción
                        </div>
                      </div>

                      <button
                        className="mp-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => handleLaunch(avail.webUrl, prov.defaultWebUrl)}
                      >
                        <ExternalLink size={12} />
                        <span>Abrir</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. ALQUILER / COMPRA */}
          {transactionalOptions.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Alquiler / Compra
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {transactionalOptions.map((avail, idx) => {
                  const prov = getProviderInfo(avail.provider);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 16px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                          {prov.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {avail.accessLabel || (avail.access === 'rent' ? 'Alquiler' : 'Compra')}
                        </div>
                      </div>

                      <button
                        className="mp-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => handleLaunch(avail.webUrl, prov.defaultWebUrl)}
                      >
                        <ExternalLink size={12} />
                        <span>Ver opción</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="mp-btn-secondary"
                onClick={() => toggleSaveLibrary(content)}
              >
                {isInLibrary(content.id) ? (
                  <>
                    <Check size={14} color="#007aff" />
                    <span>En mi lista</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Guardar en mi lista</span>
                  </>
                )}
              </button>

              <button
                className="mp-btn-secondary"
                onClick={() => {
                  setSelectedContentForDetails(null);
                  window.location.href = `/streaming/${content.type}/${content.id}`;
                }}
              >
                <span>Ver ficha completa →</span>
              </button>
            </div>

            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Última verificación: Hoy · Argentina 🇦🇷
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
