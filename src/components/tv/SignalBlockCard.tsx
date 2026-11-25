import React, { useState, useRef, useEffect } from 'react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { Trash2 } from 'lucide-react';
import { EpistemicBadge } from '../epistemic/EpistemicBadge';
import { evaluateEpistemicNature } from '../../lib/field/epistemicGuard';

function extractPreviewVideoId(item: ScheduleBlock['contentItem']): string | null {
  const candidates = [item.providerId, item.id];
  for (const c of candidates) {
    if (typeof c === 'string' && /^[A-Za-z0-9_-]{11}$/.test(c)) return c;
  }
  const url = item.videoUrl || '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

interface SignalBlockCardProps {
  block: ScheduleBlock;
  isCurrent: boolean;
  isPast: boolean;
  entityName?: string;
  onContextClick?: () => void;
  onSelectClick?: () => void;
  onRemoveClick?: () => void;
}

/**
 * Estándar visual Cápsula Redonda (+30%, vista previa de video en vivo al pasar el cursor) para bloques de grilla en YOUAPP TV.
 */
export function SignalBlockCard({
  block,
  isCurrent,
  isPast,
  entityName = 'Tema',
  onContextClick,
  onSelectClick,
  onRemoveClick
}: SignalBlockCardProps) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => setIsPreviewing(true), 220);
  };

  const handleMouseLeave = () => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setIsPreviewing(false);
  };

  const thumb =
    block.contentItem.thumbnailUrl ||
    (block.contentItem as any).thumbnail ||
    'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg';
  const previewYtId = extractPreviewVideoId(block.contentItem);
  const isDirectMp4 =
    !previewYtId &&
    typeof block.contentItem.videoUrl === 'string' &&
    /\.(mp4|webm)(\?|$)/i.test(block.contentItem.videoUrl);
  const assessment = evaluateEpistemicNature(block.contentItem, entityName, block.role);

  const totalSec = Math.max(1, Math.round(block.durationSec || 60));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const formattedDur = `${mm}:${ss}`;

  const channelLabel =
    block.contentItem.channelTitle ||
    (block.contentItem as any).channelName ||
    block.contentItem.provider;

  return (
    <div
      className={`tl-card ${isCurrent ? 'active' : ''} ${isPast ? 'past' : ''}`}
      onClick={onSelectClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: onSelectClick ? 'pointer' : undefined }}
    >
      <div className={`tl-card-thumb-wrap ${isCurrent ? 'ring-live' : ''} ${isPreviewing ? 'previewing' : ''}`}>
        <img src={thumb} alt={block.contentItem.title} />
        {isPreviewing && previewYtId && (
          <iframe
            className="tl-card-preview-media"
            src={`https://www.youtube.com/embed/${previewYtId}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0&iv_load_policy=3`}
            title={`Vista previa de ${block.contentItem.title}`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
          />
        )}
        {isPreviewing && isDirectMp4 && (
          <video
            className="tl-card-preview-media"
            src={block.contentItem.videoUrl}
            autoPlay
            muted
            loop
            playsInline
          />
        )}
        {isCurrent && !isPreviewing && (
          <div className="tl-card-thumb-center" aria-hidden="true">
            <span className="tl-card-live-indicator">
              <span className="tl-card-live-dot" />
            </span>
          </div>
        )}
      </div>

      <div className="tl-card-content">
        <div className="tl-card-status-row">
          <span className={`tl-card-state ${isCurrent ? 'live' : ''}`}>
            {isCurrent ? (
              <>
                <span className="tl-playing-eq" aria-hidden="true">
                  <span className="tl-eq-bar" />
                  <span className="tl-eq-bar" />
                  <span className="tl-eq-bar" />
                </span>
                <span>Al aire · <strong className="tl-card-mono">{formattedDur}</strong></span>
              </>
            ) : (
              <span>
                {isPast ? 'Emitido' : 'Sigue'} · <strong className="tl-card-mono">{formattedDur}</strong>
              </span>
            )}
          </span>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <EpistemicBadge
              nature={assessment.nature}
              size="sm"
              onClick={onContextClick}
            />
            {onRemoveClick && (
              <button
                type="button"
                className="tl-card-remove-btn"
                title="Eliminar este video de la grilla"
                aria-label={`Eliminar ${block.contentItem.title} de la grilla`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveClick();
                }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        <h5 className="tl-card-title">{block.contentItem.title}</h5>

        <div className="tl-card-meta-row">
          <span className="tl-card-origin">{channelLabel}</span>
          {block.topic && (
            <>
              <span style={{ color: '#94a3b8' }}>•</span>
              <span className="tl-card-topic">{block.topic}</span>
            </>
          )}
        </div>
      </div>

      <style>{`
        .tl-card {
          width: 338px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          display: flex;
          align-items: center;
          padding: 10px 11px;
          gap: 12px;
          transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
          position: relative;
        }

        .tl-card:hover {
          border-color: #93c5fd;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
          transform: translateY(-1px);
        }

        .tl-card.active {
          background: #f8fbff;
          border: 2px solid #2563eb;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.14);
        }

        .tl-card.past {
          opacity: 0.66;
        }

        .tl-card-thumb-wrap {
          position: relative;
          width: 117px;
          height: 70px;
          border-radius: 999px;
          overflow: hidden;
          flex-shrink: 0;
          background: #0f172a;
          border: 1px solid #cbd5e1;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }

        .tl-card-thumb-wrap.ring-live {
          border-color: #2563eb;
          animation: tlCapsuleRingPulse 2.2s ease-in-out infinite;
        }

        @keyframes tlCapsuleRingPulse {
          0%, 100% {
            box-shadow: 0 0 0 2px #2563eb, 0 0 12px rgba(37, 99, 235, 0.32);
          }
          50% {
            box-shadow: 0 0 0 3px #2563eb, 0 0 18px rgba(37, 99, 235, 0.5);
          }
        }

        .tl-card-thumb-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.25s ease;
        }

        .tl-card:hover .tl-card-thumb-wrap {
          transform: scale(1.03);
        }

        .tl-card:hover .tl-card-thumb-wrap img {
          transform: scale(1.06);
        }

        .tl-card-thumb-wrap.previewing {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.35);
        }

        .tl-card-preview-media {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          object-fit: cover;
          pointer-events: none;
          transform: scale(1.38);
          transform-origin: center;
          z-index: 2;
        }

        .tl-card-thumb-center {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 3;
        }

        .tl-card-live-indicator {
          width: 23px;
          height: 23px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.58);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tl-card-live-dot {
          width: 8.5px;
          height: 8.5px;
          border-radius: 999px;
          background: #60a5fa;
          box-shadow: 0 0 8px rgba(96, 165, 250, 0.9);
        }

        .tl-card-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .tl-card-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }

        .tl-card-state {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
        }

        .tl-card-state.live {
          color: #2563eb;
        }

        .tl-card-mono {
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-weight: 700;
        }

        .tl-playing-eq {
          display: inline-flex;
          gap: 1.8px;
          align-items: flex-end;
          height: 11px;
          flex-shrink: 0;
        }

        .tl-eq-bar {
          width: 2px;
          background: #2563eb;
          border-radius: 2px;
          animation: tlEq 0.65s infinite alternate ease-in-out;
        }

        .tl-eq-bar:nth-child(1) { height: 4px; animation-delay: 0s; }
        .tl-eq-bar:nth-child(2) { height: 11px; animation-delay: 0.15s; }
        .tl-eq-bar:nth-child(3) { height: 7px; animation-delay: 0.3s; }

        @keyframes tlEq {
          0% { height: 3.5px; }
          100% { height: 11px; }
        }

        .tl-card-title {
          margin: 0;
          font-size: 12.2px;
          font-weight: 700;
          color: #0f172a;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.26;
        }

        .tl-card-meta-row {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          min-width: 0;
        }

        .tl-card-origin {
          font-weight: 700;
          color: #2563eb;
          flex-shrink: 0;
        }

        .tl-card-topic {
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        .tl-card-remove-btn {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
          transition: 0.16s ease;
        }

        .tl-card-remove-btn:hover {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}
