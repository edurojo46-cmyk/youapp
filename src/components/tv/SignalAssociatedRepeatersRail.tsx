import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ExternalLink,
  ArrowLeftRight,
  MousePointerClick,
  PlusCircle,
  Film
} from 'lucide-react';
import {
  listSignalMemberships,
  recordAndOpenOriginalChannel,
  slotToExposureLevel,
  EXPOSURE_LEVELS,
  type SignalMembershipItem
} from '../../lib/tv/associationsService';

interface Props {
  signalId?: string;
  memberships?: SignalMembershipItem[];
  onRefreshRequested?: () => void;
  variant?: 'light' | 'glass';
}

/**
 * Sección inferior diferenciada de la franja superior:
 * En lugar de repetir la lista de canales, presenta los CONTENIDOS Y COBERTURAS DESTACADAS
 * que recomienda cada canal asociado de esta señal, dirigiendo siempre a la fuente original.
 */
export function SignalAssociatedRepeatersRail({
  signalId = '',
  memberships,
  onRefreshRequested,
  variant = 'light'
}: Props) {
  const isGlass = variant === 'glass';
  const navigate = useNavigate();
  const [internalItems, setInternalItems] = useState<SignalMembershipItem[]>([]);
  const [loaded, setLoaded] = useState(Boolean(memberships));

  const refresh = useCallback(async () => {
    if (onRefreshRequested) {
      onRefreshRequested();
      setLoaded(true);
      return;
    }
    try {
      const list = await listSignalMemberships(signalId);
      setInternalItems(list);
    } catch {
      // silent
    } finally {
      setLoaded(true);
    }
  }, [onRefreshRequested, signalId]);

  useEffect(() => {
    if (memberships) {
      setLoaded(true);
      return;
    }
    void refresh();
  }, [memberships, refresh]);

  const items = memberships ?? internalItems;
  const repeaters = items.filter(
    (i) => i.membershipRole === 'repeater' || i.membershipRole === 'reciprocal_repeater'
  );

  return (
    <section
      aria-label="Contenidos destacados de tus repetidoras"
      style={
        isGlass
          ? {
              background:
                'linear-gradient(155deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.08) 100%)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              boxShadow:
                'inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 12px 32px rgba(0, 0, 0, 0.24)',
              borderRadius: 22,
              padding: '18px 22px',
              color: '#f5f5f7'
            }
          : {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 20,
              padding: '18px 22px'
            }
      }
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: repeaters.length > 0 ? 14 : 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              background: isGlass ? 'rgba(10, 132, 255, 0.22)' : '#eff6ff',
              border: isGlass ? '1px solid rgba(100, 210, 255, 0.36)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isGlass ? '#64d2ff' : '#2563eb',
              flexShrink: 0
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 750, color: isGlass ? '#ffffff' : '#0f172a' }}>
              Destacados de repetidoras ({repeaters.length})
            </div>
            <div style={{ fontSize: 12, color: isGlass ? 'rgba(245, 245, 247, 0.72)' : '#64748b' }}>
              Recomendaciones editoriales de las repetidoras de esta señal, sin copiar ni alojar videos ajenos.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/repetidoras')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: isGlass ? 'rgba(10, 132, 255, 0.24)' : '#eff6ff',
            color: isGlass ? '#d9f3ff' : '#1d4ed8',
            border: isGlass ? '1px solid rgba(100, 210, 255, 0.44)' : '1px solid #bfdbfe',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 650,
            cursor: 'pointer'
          }}
        >
          <PlusCircle size={14} /> Gestionar repetidoras
        </button>
      </div>

      {loaded && repeaters.length === 0 && (
        <div
          style={{
            marginTop: 12,
            padding: '14px 16px',
            borderRadius: 14,
            background: isGlass ? 'rgba(18, 22, 30, 0.44)' : '#f8fafc',
            border: isGlass ? '1px dashed rgba(255, 255, 255, 0.24)' : '1px dashed #cbd5e1',
            fontSize: 13,
            color: isGlass ? 'rgba(245, 245, 247, 0.8)' : '#475569'
          }}
        >
          Esta señal aún no tiene repetidoras activas. Desde <strong>Gestionar repetidoras</strong> podés sumar otros canales como repetidoras para intercambiar visibilidad.
        </div>
      )}

      {loaded && repeaters.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 12
          }}
        >
          {repeaters.map((m) => {
            const exp = EXPOSURE_LEVELS[slotToExposureLevel(m.placementSlot)];
            const headline =
              m.featuredVideoTitle ||
              `Selección recomendada de ${m.channelCategory || m.channelName}`;

            return (
              <div
                key={m.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 16,
                  background: isGlass
                    ? 'rgba(18, 22, 30, 0.48)'
                    : 'linear-gradient(180deg, #f8fbff 0%, #f0f7ff 100%)',
                  border: isGlass ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid #bae6fd',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 8
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11,
                        fontWeight: 750,
                        color: isGlass ? '#64d2ff' : '#0369a1'
                      }}
                    >
                      {m.membershipRole === 'reciprocal_repeater' && <ArrowLeftRight size={12} />}
                      <span>También en {m.channelName}</span>
                    </span>
                    <span
                      style={{
                        background: isGlass ? 'rgba(10, 132, 255, 0.24)' : '#dbeafe',
                        color: isGlass ? '#d9f3ff' : '#1e40af',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 750
                      }}
                    >
                      {exp.badge}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      fontSize: 14,
                      fontWeight: 750,
                      color: isGlass ? '#ffffff' : '#0f172a',
                      lineHeight: 1.32
                    }}
                  >
                    <Film size={16} color={isGlass ? '#64d2ff' : '#2563eb'} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>«{headline}»</span>
                  </div>

                  <div style={{ fontSize: 11.5, color: isGlass ? 'rgba(245, 245, 247, 0.72)' : '#475569', marginTop: 6 }}>
                    {m.channelCategory || m.originPlatform} ·{' '}
                    <MousePointerClick size={11} style={{ verticalAlign: 'middle' }} />{' '}
                    {m.referralClicks || 0}{' '}
                    {m.referralClicks === 1
                      ? 'derivación desde esta señal'
                      : 'derivaciones desde esta señal'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: isGlass ? 'rgba(245, 245, 247, 0.62)' : '#64748b', fontWeight: 600 }}>
                    Fuente: {m.originPlatform}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await recordAndOpenOriginalChannel(m, true);
                      await refresh();
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#0071e3',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: 999,
                      padding: '7px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Ver en canal original <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
