import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  ArrowLeftRight,
  ExternalLink,
  PlusCircle,
  MousePointerClick,
  HelpCircle,
  X,
  Tv,
  Share2,
  ChevronDown,
  Check
} from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSignalStore } from '../../lib/tv/signalStore';
import { shareYouAppVideo } from '../../lib/tv/youappShareHelper';
import {
  listSignalMemberships,
  listSwitchableSignals,
  recordAndOpenOriginalChannel,
  slotToExposureLevel,
  EXPOSURE_LEVELS,
  type SignalMembershipItem,
  type UserSignalSummary
} from '../../lib/tv/associationsService';

interface SignalNetworkHeaderStripProps {
  signalId?: string;
  signalName?: string;
  fallbackOwnerChannelName?: string;
  memberships?: SignalMembershipItem[];
  onRefreshRequested?: () => void;
  onSelectSignal?: (sig: UserSignalSummary) => void;
}

export function SignalNetworkHeaderStrip({
  signalId = '',
  signalName = 'Mi Señal Personal',
  fallbackOwnerChannelName,
  memberships,
  onRefreshRequested,
  onSelectSignal
}: SignalNetworkHeaderStripProps) {
  const navigate = useNavigate();
  const [internalItems, setInternalItems] = useState<SignalMembershipItem[]>([]);
  const [availableSignals, setAvailableSignals] = useState<UserSignalSummary[]>([]);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    let alive = true;
    listSwitchableSignals()
      .then((rows) => {
        if (alive) setAvailableSignals(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (memberships) return;
    let alive = true;
    listSignalMemberships(signalId)
      .then((rows) => {
        if (alive) setInternalItems(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signalId, memberships]);

  const items = memberships ?? internalItems;
  const principalChannel = items.find((m) => m.membershipRole === 'owned');
  const associatedChannels = items.filter(
    (m) => m.membershipRole === 'repeater' || m.membershipRole === 'reciprocal_repeater'
  );

  const handleOpenPartner = async (m: SignalMembershipItem) => {
    await recordAndOpenOriginalChannel(m, false);
    if (onRefreshRequested) {
      onRefreshRequested();
    } else {
      const refreshed = await listSignalMemberships(signalId).catch(() => null);
      if (refreshed) setInternalItems(refreshed);
    }
  };

  const handleShareSignal = async () => {
    const playerState = usePlayerStore.getState();
    const signalState = useSignalStore.getState();
    const activeBlock =
      signalState.activeSignal?.schedule?.[signalState.currentBlockIndex] || null;
    const videoId =
      playerState.currentBlock?.providerContentId ||
      activeBlock?.contentItem?.providerId ||
      activeBlock?.contentItem?.id ||
      '';
    const title =
      playerState.currentBlock?.title ||
      activeBlock?.contentItem?.title ||
      signalName;
    const channelName =
      activeBlock?.contentItem?.channelTitle ||
      (activeBlock?.contentItem as any)?.channelName ||
      signalName;

    const result = await shareYouAppVideo({
      videoId,
      startSec: playerState.currentTime,
      title,
      channelName,
      customMessage: `Mirá «${title}» en YOUAPP TV`
    });
    if (result.status === 'copied') {
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2400);
    }
  };

  return (
    <section
      aria-label={`Identidad y red de canales de ${signalName}`}
      className="snhs-root"
    >
      {/* Fila 1: Identidad + Selector vivo de señal + Acciones */}
      <div className="snhs-top-row">
        <div className="snhs-identity">
          <div className="snhs-title-line">
            <span className="snhs-live-pill">
              <span className="snhs-live-dot" /> MI SEÑAL
            </span>

            {/* Selector desplegable de señales en vivo */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowSwitcher((v) => !v)}
                className="snhs-switcher-btn"
                title="Cambiar de señal en vivo"
              >
                <span className="snhs-signal-title">{signalName}</span>
                {availableSignals.length > 0 && <ChevronDown size={15} color="#2563eb" />}
              </button>

              {showSwitcher && availableSignals.length > 0 && (
                <div className="snhs-switcher-menu" role="listbox" aria-label="Elegir señal">
                  <div className="snhs-switcher-caption">Cambiar de señal en vivo</div>
                  {availableSignals.map((sig) => {
                    const isCurrent =
                      sig.id === signalId ||
                      sig.name.toLowerCase() === signalName.toLowerCase();
                    return (
                      <button
                        key={sig.id}
                        type="button"
                        onClick={() => {
                          setShowSwitcher(false);
                          if (onSelectSignal) {
                            onSelectSignal(sig);
                          } else {
                            navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`);
                          }
                        }}
                        className={`snhs-switcher-item ${isCurrent ? 'current' : ''}`}
                      >
                        <div>
                          <strong>{sig.name}</strong>
                          <span>{sig.mainTopic || sig.prompt || 'Señal temática'}</span>
                        </div>
                        {isCurrent && <Check size={14} color="#2563eb" />}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setShowSwitcher(false);
                      navigate('/create-signal');
                    }}
                    className="snhs-switcher-new"
                  >
                    <PlusCircle size={13} /> Crear nueva señal propia
                  </button>
                </div>
              )}
            </div>

            <span className="snhs-count-badge">
              1 propio + {associatedChannels.length}{' '}
              {associatedChannels.length === 1 ? 'repetidora' : 'repetidoras'}
            </span>
          </div>
          <p className="snhs-subtitle">
            Tu propia cadena audiovisual: combina programación propia con repetidoras digitales de otros canales, llevando siempre al contenido original.
          </p>
        </div>

        <div className="snhs-actions">
          <button
            type="button"
            onClick={() => void handleShareSignal()}
            className="snhs-help-btn"
            title="Copiar enlace directo de esta señal para compartir"
          >
            {copiedShare ? <Check size={14} color="#16a34a" /> : <Share2 size={14} />}
            <span>{copiedShare ? '¡Link copiado!' : 'Compartir señal'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExplainer((v) => !v)}
            className={`snhs-help-btn ${showExplainer ? 'active' : ''}`}
          >
            {showExplainer ? <X size={14} /> : <HelpCircle size={14} />}
            <span>{showExplainer ? 'Cerrar guía' : '¿Cómo funciona?'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/repetidoras')}
            className="snhs-cta-btn"
          >
            <PlusCircle size={14} />
            <span>Sumar repetidora</span>
          </button>
        </div>
      </div>

      {/* Guía visual desplegable en 3 pasos */}
      {showExplainer && (
        <div className="snhs-explainer-grid">
          <div className="snhs-step-card">
            <div className="snhs-step-icon"><Tv size={16} /></div>
            <div>
              <strong>1 · Armás tu propia cadena</strong>
              <p>Organizás videos externos por temática y horario sin alojar ni copiar archivos.</p>
            </div>
          </div>
          <div className="snhs-step-card">
            <div className="snhs-step-icon"><Radio size={16} /></div>
            <div>
              <strong>2 · Sumás repetidoras voluntarias</strong>
              <p>Otros canales actúan como repetidoras en tu señal de forma unilateral o recíproca.</p>
            </div>
          </div>
          <div className="snhs-step-card">
            <div className="snhs-step-icon"><Share2 size={16} /></div>
            <div>
              <strong>3 · Audiencia hacia el original</strong>
              <p>Cada espectador descubre canales afines y entra directo al canal oficial del creador.</p>
            </div>
          </div>
        </div>
      )}

      {/* Fila 2: Tira horizontal táctil de canales que integran esta señal */}
      <div className="snhs-chips-scroller" role="list" aria-label="Canales que integran esta señal">
        <div className="snhs-chip principal" role="listitem">
          <span className="snhs-chip-badge dark">Principal</span>
          <div className="snhs-chip-body">
            <strong>{principalChannel?.channelName || fallbackOwnerChannelName || signalName}</strong>
            <span>Contenido anfitrión</span>
          </div>
        </div>

        {associatedChannels.map((m) => {
          const exp = EXPOSURE_LEVELS[slotToExposureLevel(m.placementSlot)];
          return (
            <button
              key={m.id}
              type="button"
              role="listitem"
              onClick={() => void handleOpenPartner(m)}
              title={`Abrir canal original (${m.originPlatform}) — suma 1 derivación verificable`}
              className="snhs-chip partner"
            >
              <span className="snhs-chip-badge blue">
                {m.membershipRole === 'reciprocal_repeater' && <ArrowLeftRight size={10} />}
                {exp.label}
              </span>
              <div className="snhs-chip-body">
                <strong>{m.channelName}</strong>
                <span>
                  {m.membershipRole === 'reciprocal_repeater' ? 'Repetidora recíproca' : 'Repetidora'}
                  {typeof m.referralClicks === 'number' && m.referralClicks > 0
                    ? ` · ${m.referralClicks} ${m.referralClicks === 1 ? 'derivación' : 'derivaciones'}`
                    : ''}
                </span>
              </div>
              {typeof m.referralClicks === 'number' && m.referralClicks > 0 && (
                <MousePointerClick size={12} color="#0369a1" style={{ flexShrink: 0 }} />
              )}
              <ExternalLink size={12} color="#2563eb" style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>

      <style>{`
        .snhs-root {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: saturate(190%) blur(24px);
          -webkit-backdrop-filter: saturate(190%) blur(24px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
          padding: 15px 32px 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .snhs-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .snhs-identity {
          min-width: 0;
          flex: 1 1 320px;
        }
        .snhs-title-line {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .snhs-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #f5f5f7;
          background: #1d1d1f;
          border: none;
          padding: 4px 10px;
          border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        }
        .snhs-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #30d158;
          box-shadow: 0 0 8px rgba(48, 209, 88, 0.85);
        }
        .snhs-switcher-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          padding: 5px 14px 5px 15px;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .snhs-switcher-btn:hover {
          background: #ffffff;
          border-color: rgba(0, 113, 227, 0.35);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        .snhs-signal-title {
          font-size: 16.5px;
          font-weight: 700;
          color: #1d1d1f;
          letter-spacing: -0.025em;
        }
        .snhs-switcher-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          min-width: 285px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: saturate(190%) blur(24px);
          -webkit-backdrop-filter: saturate(190%) blur(24px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 18px;
          padding: 8px;
          box-shadow: 0 20px 44px rgba(0, 0, 0, 0.14);
          z-index: 80;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .snhs-switcher-caption {
          font-size: 10.5px;
          font-weight: 650;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #86868b;
          padding: 4px 10px 3px;
        }
        .snhs-switcher-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 11px;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 0.14s ease;
        }
        .snhs-switcher-item:hover { background: rgba(118, 118, 128, 0.08); }
        .snhs-switcher-item.current { background: rgba(0, 113, 227, 0.1); }
        .snhs-switcher-item strong {
          display: block;
          font-size: 13px;
          font-weight: 650;
          color: #1d1d1f;
          letter-spacing: -0.01em;
        }
        .snhs-switcher-item span {
          display: block;
          font-size: 11px;
          color: #6e6e73;
        }
        .snhs-switcher-new {
          margin-top: 4px;
          padding: 8px 10px;
          border-radius: 11px;
          border: 1px dashed rgba(0, 113, 227, 0.35);
          background: rgba(0, 113, 227, 0.06);
          color: #0071e3;
          font-size: 12px;
          font-weight: 650;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
        }
        .snhs-count-badge {
          font-size: 11.5px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          color: #6e6e73;
          background: rgba(118, 118, 128, 0.09);
          padding: 4px 10px;
          border-radius: 999px;
        }
        .snhs-subtitle {
          margin: 6px 0 0;
          font-size: 12.5px;
          color: #6e6e73;
          line-height: 1.42;
          letter-spacing: -0.005em;
        }
        .snhs-actions {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          flex-shrink: 0;
        }
        .snhs-help-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(118, 118, 128, 0.09);
          color: #1d1d1f;
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 999px;
          padding: 7px 13px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: all 0.16s ease;
        }
        .snhs-help-btn:hover,
        .snhs-help-btn.active {
          background: #ffffff;
          border-color: rgba(0, 0, 0, 0.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        .snhs-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0071e3;
          color: #ffffff;
          border: none;
          border-radius: 999px;
          padding: 7px 15px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.01em;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(0, 113, 227, 0.28);
          transition: background 0.16s ease, transform 0.16s ease;
        }
        .snhs-cta-btn:hover {
          background: #0077ed;
          transform: translateY(-0.5px);
        }
        .snhs-explainer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
          padding-top: 2px;
        }
        .snhs-step-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
        }
        .snhs-step-icon {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .snhs-step-card strong {
          display: block;
          font-size: 12.5px;
          font-weight: 650;
          color: #1d1d1f;
          margin-bottom: 2px;
        }
        .snhs-step-card p {
          margin: 0;
          font-size: 11.5px;
          color: #6e6e73;
          line-height: 1.4;
        }
        .snhs-chips-scroller {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .snhs-chips-scroller::-webkit-scrollbar { display: none; }
        .snhs-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px 5px 7px;
          border-radius: 999px;
          flex-shrink: 0;
          text-align: left;
        }
        .snhs-chip.principal {
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
        }
        .snhs-chip.partner {
          background: rgba(0, 113, 227, 0.07);
          border: 1px solid rgba(0, 113, 227, 0.18);
          cursor: pointer;
          transition: all 0.16s ease;
        }
        .snhs-chip.partner:hover {
          background: #ffffff;
          border-color: rgba(0, 113, 227, 0.45);
          box-shadow: 0 3px 10px rgba(0, 113, 227, 0.1);
          transform: translateY(-1px);
        }
        .snhs-chip-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 650;
          padding: 2.5px 8px;
          border-radius: 999px;
        }
        .snhs-chip-badge.dark { background: #1d1d1f; color: #f5f5f7; }
        .snhs-chip-badge.blue { background: #0071e3; color: #ffffff; }
        .snhs-chip-body {
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-size: 12.5px;
        }
        .snhs-chip-body strong { color: #1d1d1f; font-weight: 650; letter-spacing: -0.01em; }
        .snhs-chip-body span { color: #6e6e73; font-size: 11.5px; }

        @media (max-width: 768px) {
          .snhs-root {
            padding: 12px 16px;
            gap: 10px;
          }
          .snhs-signal-title { font-size: 15px; }
          .snhs-subtitle { font-size: 12px; }
          .snhs-actions {
            width: 100%;
            justify-content: space-between;
          }
          .snhs-help-btn,
          .snhs-cta-btn {
            flex: 1;
            justify-content: center;
            padding: 7px 10px;
            font-size: 12px;
          }
        }
      `}</style>
    </section>
  );
}
