import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ExternalLink,
  ArrowLeftRight,
  MousePointerClick,
  PlusCircle,
  Play,
  Tv
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

function extractPromoThumbnail(featuredUrl?: string | null, originUrl?: string | null): string | null {
  const candidates = [featuredUrl, originUrl].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );
  for (const raw of candidates) {
    const ytMatch = raw.match(
      /(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i
    );
    if (ytMatch?.[1]) {
      return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }
    const dmMatch = raw.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
    if (dmMatch?.[1]) {
      return `https://www.dailymotion.com/thumbnail/video/${dmMatch[1]}`;
    }
  }
  return null;
}

const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #0ea5e9 100%)',
  'linear-gradient(135deg, #1e1b4b 0%, #6d28d9 55%, #ec4899 100%)',
  'linear-gradient(135deg, #064e3b 0%, #0d9488 55%, #38bdf8 100%)',
  'linear-gradient(135deg, #3b0764 0%, #9333ea 55%, #f59e0b 100%)'
];

function pickFallbackGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

/**
 * Vitrina de Publicidad Colaborativa — Repetidoras y Señales Aliadas.
 * Presenta con miniatura visual de alto impacto los contenidos destacados
 * de cada repetidora asociada, derivando siempre audiencia real al canal original.
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
      aria-label="Destacados de repetidoras"
      className={`yrep-rail ${isGlass ? 'is-glass' : 'is-light'}`}
    >
      <div className="yrep-head">
        <div className="yrep-head-left">
          <div className="yrep-head-ico">
            <Sparkles size={17} />
          </div>
          <div className="yrep-head-text">
            <div className="yrep-title-row">
              <h3>Destacados de repetidoras</h3>
              <span className="yrep-count-pill">{repeaters.length}</span>
              <span className="yrep-collab-tag">Red colaborativa</span>
            </div>
            <p>
              Promoción cruzada entre señales aliadas — cada clic suma audiencia real al canal original.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="yrep-manage-btn"
          onClick={() => navigate('/repetidoras')}
        >
          <PlusCircle size={13} />
          <span>Sumar repetidora</span>
        </button>
      </div>

      {loaded && repeaters.length === 0 && (
        <div className="yrep-empty">
          Esta señal aún no tiene repetidoras activas. Desde <strong>Sumar repetidora</strong> podés asociar canales aliados para intercambiar visibilidad y audiencia real.
        </div>
      )}

      {loaded && repeaters.length > 0 && (
        <div className="yrep-grid">
          {repeaters.map((m) => {
            const exp = EXPOSURE_LEVELS[slotToExposureLevel(m.placementSlot)];
            const headline =
              m.featuredVideoTitle ||
              `Selección recomendada de ${m.channelCategory || m.channelName || 'canal aliado'}`;
            const thumbUrl = extractPromoThumbnail(m.featuredVideoUrl, m.originUrl);
            const fallbackBg = pickFallbackGradient(m.channelName || m.id);
            const isReciprocal = m.membershipRole === 'reciprocal_repeater';

            const handleOpenPromo = async () => {
              await recordAndOpenOriginalChannel(m, true);
              await refresh();
            };

            return (
              <article key={m.id} className="yrep-card">
                <button
                  type="button"
                  className="yrep-thumb-btn"
                  onClick={() => void handleOpenPromo()}
                  aria-label={`Ver ${headline} en ${m.channelName || 'canal original'}`}
                  style={thumbUrl ? undefined : { background: fallbackBg }}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={headline}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="yrep-thumb-fallback">
                      <Tv size={26} />
                      <span>{m.channelName || 'Señal aliada'}</span>
                    </div>
                  )}

                  <div className="yrep-thumb-scrim" />

                  <div className="yrep-thumb-top">
                    <span className={`yrep-role-pill ${isReciprocal ? 'is-reciprocal' : ''}`}>
                      {isReciprocal ? <ArrowLeftRight size={11} /> : <Sparkles size={11} />}
                      <span>{isReciprocal ? 'Alianza recíproca' : exp.badge}</span>
                    </span>
                    <span className="yrep-platform-pill">{m.originPlatform || 'YouTube'}</span>
                  </div>

                  <div className="yrep-thumb-bottom">
                    <span className="yrep-channel-chip">
                      {m.channelName || 'Canal asociado'}
                    </span>
                    <span className="yrep-play-badge">
                      <Play size={13} fill="#ffffff" color="#ffffff" />
                    </span>
                  </div>
                </button>

                <div className="yrep-card-body">
                  <button
                    type="button"
                    className="yrep-headline-btn"
                    onClick={() => void handleOpenPromo()}
                  >
                    {headline}
                  </button>

                  <div className="yrep-card-footer">
                    <span className="yrep-meta">
                      {m.channelCategory || m.originPlatform} ·{' '}
                      <MousePointerClick size={11} style={{ verticalAlign: '-1px' }} />{' '}
                      {m.referralClicks || 0}{' '}
                      {m.referralClicks === 1 ? 'visita' : 'visitas'}
                    </span>

                    <button
                      type="button"
                      className="yrep-cta-btn"
                      onClick={() => void handleOpenPromo()}
                    >
                      <span>Ver canal</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style>{`
        .yrep-rail {
          border-radius: 22px;
          padding: 16px 18px 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .yrep-rail.is-glass {
          background: linear-gradient(155deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.06) 100%);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 14px 34px rgba(0, 0, 0, 0.28);
          color: #f5f5f7;
        }
        .yrep-rail.is-light {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
          color: #0f172a;
        }
        .yrep-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }
        .yrep-head-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .yrep-head-ico {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .yrep-rail.is-glass .yrep-head-ico {
          background: linear-gradient(135deg, rgba(10, 132, 255, 0.34), rgba(100, 210, 255, 0.18));
          border: 1px solid rgba(100, 210, 255, 0.42);
          color: #7dd3fc;
        }
        .yrep-rail.is-light .yrep-head-ico {
          background: #eff6ff;
          color: #2563eb;
        }
        .yrep-head-text {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .yrep-title-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .yrep-title-row h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 760;
          line-height: 1.2;
        }
        .yrep-count-pill {
          font-size: 11px;
          font-weight: 750;
          padding: 1px 7px;
          border-radius: 999px;
        }
        .yrep-rail.is-glass .yrep-count-pill {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }
        .yrep-rail.is-light .yrep-count-pill {
          background: #e2e8f0;
          color: #0f172a;
        }
        .yrep-collab-tag {
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          padding: 2px 7px;
          border-radius: 999px;
        }
        .yrep-rail.is-glass .yrep-collab-tag {
          background: rgba(52, 211, 153, 0.18);
          border: 1px solid rgba(52, 211, 153, 0.38);
          color: #a7f3d0;
        }
        .yrep-rail.is-light .yrep-collab-tag {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
        }
        .yrep-head-text p {
          margin: 0;
          font-size: 12px;
          line-height: 1.35;
        }
        .yrep-rail.is-glass .yrep-head-text p {
          color: rgba(245, 245, 247, 0.74);
        }
        .yrep-rail.is-light .yrep-head-text p {
          color: #64748b;
        }
        .yrep-manage-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 680;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .yrep-manage-btn:hover {
          transform: translateY(-1px);
        }
        .yrep-rail.is-glass .yrep-manage-btn {
          background: rgba(10, 132, 255, 0.24);
          color: #e0f2fe;
          border: 1px solid rgba(100, 210, 255, 0.45);
        }
        .yrep-rail.is-light .yrep-manage-btn {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        }
        .yrep-empty {
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 12.5px;
          line-height: 1.45;
        }
        .yrep-rail.is-glass .yrep-empty {
          background: rgba(18, 22, 30, 0.44);
          border: 1px dashed rgba(255, 255, 255, 0.24);
          color: rgba(245, 245, 247, 0.8);
        }
        .yrep-rail.is-light .yrep-empty {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          color: #475569;
        }
        .yrep-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
        }
        .yrep-card {
          border-radius: 18px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .yrep-card:hover {
          transform: translateY(-2px);
        }
        .yrep-rail.is-glass .yrep-card {
          background: rgba(14, 18, 28, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
        }
        .yrep-rail.is-glass .yrep-card:hover {
          border-color: rgba(100, 210, 255, 0.48);
          box-shadow: 0 14px 32px rgba(0, 113, 227, 0.24);
        }
        .yrep-rail.is-light .yrep-card {
          background: #f8fbff;
          border: 1px solid #dbeafe;
          box-shadow: 0 6px 18px rgba(37, 99, 235, 0.08);
        }
        .yrep-thumb-btn {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          padding: 0;
          border: 0;
          overflow: hidden;
          cursor: pointer;
          display: block;
          background: #0b101b;
        }
        .yrep-thumb-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s ease;
        }
        .yrep-card:hover .yrep-thumb-btn img {
          transform: scale(1.04);
        }
        .yrep-thumb-fallback {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 13px;
          font-weight: 700;
          padding: 12px;
          text-align: center;
        }
        .yrep-thumb-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.45) 0%,
            rgba(0, 0, 0, 0.06) 44%,
            rgba(0, 0, 0, 0.78) 100%
          );
          pointer-events: none;
        }
        .yrep-thumb-top {
          position: absolute;
          top: 9px;
          left: 9px;
          right: 9px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          pointer-events: none;
        }
        .yrep-role-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.84);
          backdrop-filter: blur(8px);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 750;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
        }
        .yrep-role-pill.is-reciprocal {
          background: rgba(16, 185, 129, 0.88);
        }
        .yrep-platform-pill {
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.72);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: rgba(255, 255, 255, 0.92);
          font-size: 10px;
          font-weight: 700;
        }
        .yrep-thumb-bottom {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 9px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          pointer-events: none;
        }
        .yrep-channel-chip {
          font-size: 12px;
          font-weight: 750;
          color: #ffffff;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yrep-play-badge {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.92);
          border: 1.5px solid rgba(255, 255, 255, 0.55);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .yrep-card-body {
          padding: 12px 13px 13px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
          flex: 1;
        }
        .yrep-headline-btn {
          border: 0;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
          font-size: 13.5px;
          font-weight: 730;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .yrep-rail.is-glass .yrep-headline-btn {
          color: #ffffff;
        }
        .yrep-rail.is-light .yrep-headline-btn {
          color: #0f172a;
        }
        .yrep-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .yrep-meta {
          font-size: 11px;
          font-weight: 560;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yrep-rail.is-glass .yrep-meta {
          color: rgba(245, 245, 247, 0.66);
        }
        .yrep-rail.is-light .yrep-meta {
          color: #64748b;
        }
        .yrep-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 0;
          background: linear-gradient(135deg, #0071e3 0%, #0a84ff 100%);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 113, 227, 0.32);
        }
        .yrep-cta-btn:hover {
          filter: brightness(1.08);
        }
        @media (max-width: 640px) {
          .yrep-rail {
            padding: 13px 12px 14px;
            border-radius: 18px;
          }
          .yrep-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
      `}</style>
    </section>
  );
}
