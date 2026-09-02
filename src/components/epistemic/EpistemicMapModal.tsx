import React from 'react';
import { Compass, X, Check, BarChart2, Layers } from 'lucide-react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { calculateSignalEpistemicDistribution, evaluateEpistemicNature } from '../../lib/field/epistemicGuard';
import { EpistemicBadge } from './EpistemicBadge';

interface EpistemicMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ScheduleBlock[];
  signalName?: string;
  entityName?: string;
  totalMinutes?: number;
}

export function EpistemicMapModal({
  isOpen,
  onClose,
  schedule,
  signalName = 'Mi Señal',
  entityName = 'Nikola Tesla',
  totalMinutes = 52
}: EpistemicMapModalProps) {
  if (!isOpen) return null;

  const distribution = calculateSignalEpistemicDistribution(schedule, entityName);

  return (
    <div className="epistemic-modal-overlay" onClick={onClose}>
      <div 
        className="epistemic-map-card" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="epistemic-header">
          <div className="epistemic-header-title">
            <Compass size={18} className="text-cyan-400" />
            <span>MAPA DE CONOCIMIENTO DE LA SEÑAL</span>
          </div>
          <button className="epistemic-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Signal Header Info */}
        <div className="epistemic-signal-title-row">
          <div>
            <h3 className="epistemic-signal-heading">{signalName}</h3>
            <span className="epistemic-entity-badge">Tema: {entityName}</span>
          </div>
          <span className="epistemic-duration-pill">{totalMinutes} min totales</span>
        </div>

        {/* Segmented Distribution Bar */}
        <div className="epistemic-segmented-bar">
          {distribution.documentedPct > 0 && (
            <div 
              className="epistemic-bar-segment documented" 
              style={{ width: `${distribution.documentedPct}%` }}
              title={`Documentado: ${distribution.documentedPct}%`}
            />
          )}
          {distribution.interpretivePct > 0 && (
            <div 
              className="epistemic-bar-segment interpretive" 
              style={{ width: `${distribution.interpretivePct}%` }}
              title={`Interpretativo: ${distribution.interpretivePct}%`}
            />
          )}
          {distribution.controversialPct > 0 && (
            <div 
              className="epistemic-bar-segment controversial" 
              style={{ width: `${distribution.controversialPct}%` }}
              title={`Controvertido: ${distribution.controversialPct}%`}
            />
          )}
          {distribution.speculativePct > 0 && (
            <div 
              className="epistemic-bar-segment speculative" 
              style={{ width: `${distribution.speculativePct}%` }}
              title={`Especulativo: ${distribution.speculativePct}%`}
            />
          )}
        </div>

        {/* Percentage Table Breakdown */}
        <div className="epistemic-metrics-breakdown">
          <div className="epistemic-breakdown-row">
            <div className="epistemic-breakdown-label">
              <span className="epistemic-dot-legend documented" />
              <span>Documentado</span>
            </div>
            <div className="epistemic-breakdown-bar-track">
              <div className="epistemic-breakdown-bar documented" style={{ width: `${distribution.documentedPct}%` }} />
            </div>
            <span className="epistemic-breakdown-val">{distribution.documentedPct}%</span>
          </div>

          <div className="epistemic-breakdown-row">
            <div className="epistemic-breakdown-label">
              <span className="epistemic-dot-legend interpretive" />
              <span>Interpretativo</span>
            </div>
            <div className="epistemic-breakdown-bar-track">
              <div className="epistemic-breakdown-bar interpretive" style={{ width: `${distribution.interpretivePct}%` }} />
            </div>
            <span className="epistemic-breakdown-val">{distribution.interpretivePct}%</span>
          </div>

          <div className="epistemic-breakdown-row">
            <div className="epistemic-breakdown-label">
              <span className="epistemic-dot-legend controversial" />
              <span>Controvertido</span>
            </div>
            <div className="epistemic-breakdown-bar-track">
              <div className="epistemic-breakdown-bar controversial" style={{ width: `${distribution.controversialPct}%` }} />
            </div>
            <span className="epistemic-breakdown-val">{distribution.controversialPct}%</span>
          </div>

          <div className="epistemic-breakdown-row">
            <div className="epistemic-breakdown-label">
              <span className="epistemic-dot-legend speculative" />
              <span>Especulativo</span>
            </div>
            <div className="epistemic-breakdown-bar-track">
              <div className="epistemic-breakdown-bar speculative" style={{ width: `${distribution.speculativePct}%` }} />
            </div>
            <span className="epistemic-breakdown-val">{distribution.speculativePct}%</span>
          </div>
        </div>

        {/* Balance Status Card */}
        <div className="epistemic-balance-banner">
          <div className="epistemic-balance-title">
            <Check size={16} className="text-emerald-400" />
            <span>Balance epistemológico: <strong>{distribution.balanceRating}</strong></span>
          </div>
          <p className="epistemic-balance-desc">{distribution.balanceDescription}</p>
        </div>

        {/* Chronological Sequence List */}
        <div className="epistemic-sequence-header">
          <Layers size={14} className="text-slate-400" />
          <span>ESTRUCTURA DE LA EXPERIENCIA</span>
        </div>

        <div className="epistemic-sequence-list">
          {schedule.map((block, idx) => {
            const assessment = evaluateEpistemicNature(block.contentItem, entityName, block.role);
            return (
              <div key={block.id || idx} className="epistemic-seq-item">
                <span className="epistemic-seq-num">{idx + 1}</span>
                <div className="epistemic-seq-info">
                  <span className="epistemic-seq-title">{block.contentItem?.title || 'Bloque audiovisual'}</span>
                  <span className="epistemic-seq-meta">{Math.round((block.durationSec || 600) / 60)} min</span>
                </div>
                <EpistemicBadge nature={assessment.nature} size="sm" />
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .epistemic-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 16px;
          animation: fadeIn 0.2s ease-out;
        }

        .epistemic-map-card {
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          background: linear-gradient(180deg, rgba(28, 32, 42, 0.96) 0%, rgba(18, 21, 28, 0.98) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
          color: #f1f5f9;
          font-family: inherit;
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .epistemic-signal-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .epistemic-signal-heading {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 4px;
        }

        .epistemic-entity-badge {
          font-size: 12px;
          color: #38bdf8;
          font-weight: 500;
        }

        .epistemic-duration-pill {
          background: rgba(255, 255, 255, 0.06);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .epistemic-segmented-bar {
          display: flex;
          height: 10px;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
          margin-bottom: 16px;
        }

        .epistemic-bar-segment.documented { background: #38bdf8; }
        .epistemic-bar-segment.interpretive { background: #c084fc; }
        .epistemic-bar-segment.controversial { background: #fb923c; }
        .epistemic-bar-segment.speculative { background: #e879f9; }

        .epistemic-metrics-breakdown {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
          background: rgba(255, 255, 255, 0.02);
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .epistemic-breakdown-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
        }

        .epistemic-breakdown-label {
          width: 100px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #cbd5e1;
        }

        .epistemic-dot-legend {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .epistemic-dot-legend.documented { background: #38bdf8; }
        .epistemic-dot-legend.interpretive { background: #c084fc; }
        .epistemic-dot-legend.controversial { background: #fb923c; }
        .epistemic-dot-legend.speculative { background: #e879f9; }

        .epistemic-breakdown-bar-track {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          overflow: hidden;
        }

        .epistemic-breakdown-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.4s ease-out;
        }
        .epistemic-breakdown-bar.documented { background: #38bdf8; }
        .epistemic-breakdown-bar.interpretive { background: #c084fc; }
        .epistemic-breakdown-bar.controversial { background: #fb923c; }
        .epistemic-breakdown-bar.speculative { background: #e879f9; }

        .epistemic-breakdown-val {
          width: 36px;
          text-align: right;
          font-weight: 600;
          color: #e2e8f0;
        }

        .epistemic-balance-banner {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.25);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 20px;
        }

        .epistemic-balance-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #a7f3d0;
          margin-bottom: 4px;
        }

        .epistemic-balance-desc {
          font-size: 12px;
          color: #cbd5e1;
          margin: 0;
          line-height: 1.4;
        }

        .epistemic-sequence-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #94a3b8;
          margin-bottom: 10px;
        }

        .epistemic-sequence-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .epistemic-seq-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .epistemic-seq-num {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          width: 16px;
        }

        .epistemic-seq-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .epistemic-seq-title {
          font-size: 12px;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .epistemic-seq-meta {
          font-size: 11px;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
