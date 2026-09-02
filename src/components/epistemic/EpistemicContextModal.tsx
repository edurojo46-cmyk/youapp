import React, { useState } from 'react';
import { Compass, X, CheckCircle, ExternalLink, HelpCircle, BookOpen, ShieldCheck } from 'lucide-react';
import type { EpistemicAssessment } from '../../lib/field/epistemicTypes';
import { EpistemicBadge } from './EpistemicBadge';

interface EpistemicContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: EpistemicAssessment | null;
  videoTitle?: string;
}

export function EpistemicContextModal({
  isOpen,
  onClose,
  assessment,
  videoTitle
}: EpistemicContextModalProps) {
  const [activeTab, setActiveTab] = useState<'why' | 'sources'>('why');

  if (!isOpen || !assessment) return null;

  // Render 5 dots for confidence score (e.g. score = 4 -> 4 filled, 1 empty)
  const dots = Array.from({ length: 5 }, (_, i) => i < assessment.confidenceScore);

  return (
    <div className="epistemic-modal-overlay" onClick={onClose}>
      <div 
        className="epistemic-modal-card" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="epistemic-header">
          <div className="epistemic-header-title">
            <Compass size={18} className="text-cyan-400" />
            <span>CONTEXTO DEL CONTENIDO</span>
          </div>
          <button className="epistemic-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Video Title Context */}
        {videoTitle && (
          <div className="epistemic-video-title">
            "{videoTitle}"
          </div>
        )}

        {/* Status Badge & Confidence Bar */}
        <div className="epistemic-status-row">
          <div className="epistemic-badge-group">
            <EpistemicBadge nature={assessment.nature} size="md" />
            {assessment.secondaryNature && (
              <span className="epistemic-secondary-chip" title="Naturaleza complementaria detectada">
                + {assessment.secondaryNature === 'documented' ? 'Documentado' : assessment.secondaryNature === 'interpretive' ? 'Interpretativo' : assessment.secondaryNature === 'controversial' ? 'Controvertido' : 'Especulativo'}
              </span>
            )}
          </div>

          <div className="epistemic-confidence-meter">
            <div className="epistemic-dots">
              {dots.map((filled, i) => (
                <span 
                  key={i} 
                  className={`epistemic-dot ${filled ? 'filled' : 'empty'}`} 
                />
              ))}
            </div>
            <span className="epistemic-confidence-text">
              Confianza {assessment.confidenceLabel.toLowerCase()}
            </span>
          </div>
        </div>

        {/* Short Human-Readable Description */}
        <div className="epistemic-description">
          {assessment.shortDescription}
        </div>

        {/* Metadata Grid */}
        <div className="epistemic-meta-grid">
          <div className="epistemic-meta-item">
            <span className="epistemic-meta-label">Tema central</span>
            <span className="epistemic-meta-value">{assessment.entityName}</span>
          </div>
          <div className="epistemic-meta-item">
            <span className="epistemic-meta-label">Rol en la señal</span>
            <span className="epistemic-meta-value">{assessment.roleName || 'Profundización'}</span>
          </div>
        </div>

        {/* Tabs for [ ¿Por qué? ] and [ Ver fuentes ] */}
        <div className="epistemic-tabs">
          <button 
            className={`epistemic-tab ${activeTab === 'why' ? 'active' : ''}`}
            onClick={() => setActiveTab('why')}
          >
            <HelpCircle size={14} />
            ¿Por qué?
          </button>
          <button 
            className={`epistemic-tab ${activeTab === 'sources' ? 'active' : ''}`}
            onClick={() => setActiveTab('sources')}
          >
            <BookOpen size={14} />
            {assessment.hasRealSources ? `Ver fuentes (${assessment.sourcesCount})` : 'Fuentes'}
          </button>
        </div>

        {/* Tab Content */}
        <div className="epistemic-tab-content">
          {activeTab === 'why' ? (
            <div className="epistemic-rationale-view">
              <p className="epistemic-rationale-text">{assessment.rationale}</p>
              {assessment.criteriaMatched && assessment.criteriaMatched.length > 0 && (
                <div className="epistemic-criteria-list">
                  <span className="epistemic-criteria-title">Señales detectadas:</span>
                  <div className="epistemic-chips">
                    {assessment.criteriaMatched.map((c, i) => (
                      <span key={i} className="epistemic-chip">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="epistemic-sources-view">
              {assessment.hasRealSources ? (
                <ul className="epistemic-sources-list">
                  {assessment.sourcesSample.map((src, i) => (
                    <li key={i} className="epistemic-source-item">
                      <CheckCircle size={14} className="text-cyan-400 flex-shrink-0" />
                      <span>{src}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="epistemic-no-sources">
                  <span>Fuentes externas verificadas no provistas en los metadatos directos del contenido.</span>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Footer Note */}
        <div className="epistemic-footer-note">
          <ShieldCheck size={13} className="text-slate-400" />
          <span>Auditoría epistemológica no punitiva por YOU Field Engine V1.1</span>
        </div>
      </div>

      <style>{`
        .epistemic-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 16px;
          animation: fadeIn 0.2s ease-out;
        }

        .epistemic-modal-card {
          width: 100%;
          max-width: 460px;
          background: linear-gradient(180deg, rgba(28, 32, 42, 0.95) 0%, rgba(18, 21, 28, 0.98) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
          color: #f1f5f9;
          font-family: inherit;
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .epistemic-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .epistemic-header-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #94a3b8;
        }

        .epistemic-close-btn {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: #94a3b8;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.15s;
        }

        .epistemic-close-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }

        .epistemic-video-title {
          font-size: 14px;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 16px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .epistemic-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 14px;
        }

        .epistemic-confidence-meter {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .epistemic-dots {
          display: flex;
          gap: 4px;
        }

        .epistemic-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .epistemic-dot.filled {
          background: #38bdf8;
          box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
        }

        .epistemic-dot.empty {
          background: rgba(255, 255, 255, 0.2);
        }

        .epistemic-confidence-text {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }

        .epistemic-description {
          font-size: 13px;
          line-height: 1.5;
          color: #cbd5e1;
          margin-bottom: 16px;
        }

        .epistemic-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }

        .epistemic-meta-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 10px 12px;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .epistemic-meta-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .epistemic-meta-value {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
        }

        .epistemic-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .epistemic-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
          cursor: pointer;
          transition: 0.15s;
        }

        .epistemic-tab.active {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.4);
          color: #38bdf8;
        }

        .epistemic-tab-content {
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 16px;
          min-height: 80px;
        }

        .epistemic-rationale-text {
          font-size: 12px;
          line-height: 1.5;
          color: #cbd5e1;
          margin: 0 0 8px;
        }

        .epistemic-criteria-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .epistemic-criteria-title {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        .epistemic-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .epistemic-chip {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11px;
          color: #e2e8f0;
        }

        .epistemic-sources-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .epistemic-source-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #cbd5e1;
        }

        .epistemic-footer-note {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #64748b;
          justify-content: center;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(12px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
