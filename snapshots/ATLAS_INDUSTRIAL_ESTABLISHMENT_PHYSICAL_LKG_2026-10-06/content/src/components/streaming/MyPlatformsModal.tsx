import React from 'react';
import { X, Check } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';
import { POPULAR_AR_PROVIDERS } from '../../lib/streaming/providerRegistry';

export const MyPlatformsModal: React.FC = () => {
  const { isPlatformsModalOpen, setIsPlatformsModalOpen, isPlatformEnabled, togglePlatform } = useStreamingStore();

  if (!isPlatformsModalOpen) return null;

  return (
    <div
      className="mp-modal-backdrop"
      onClick={() => setIsPlatformsModalOpen(false)}
    >
      <div
        className="mp-modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mp-modal-header">
          <h3 className="mp-modal-title">Mis plataformas</h3>
          <button
            className="mp-modal-close"
            onClick={() => setIsPlatformsModalOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '13.5px', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
          Elegí los servicios que ya utilizás. YouApp no te pide contraseñas ni credenciales; únicamente usamos esta información para priorizar contenido que ya podés ver sin pagar de más.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {POPULAR_AR_PROVIDERS.map((prov) => {
            const active = isPlatformEnabled(prov.code);
            return (
              <div
                key={prov.code}
                onClick={() => togglePlatform(prov.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderRadius: '14px',
                  border: `1px solid ${active ? '#007aff' : '#e2e8f0'}`,
                  background: active ? '#f0f7ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: '18px' }}>
                    {prov.code === 'netflix' ? '🔴' : prov.code === 'prime_video' ? '🔵' : prov.code === 'disney_plus' ? '🔷' : prov.code === 'max' ? '🟣' : prov.code === 'apple_tv_plus' ? '⚫' : '⭐'}
                  </span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                      {prov.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Disponible en Argentina (AR)
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: active ? '#007aff' : '#ffffff',
                    border: `2px solid ${active ? '#007aff' : '#cbd5e1'}`,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {active && <Check size={13} strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Privacidad garantizada · Sin contraseñas
          </span>
          <button
            className="mp-btn-primary"
            onClick={() => setIsPlatformsModalOpen(false)}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
