import React from 'react';
import { Sliders, X, Check } from 'lucide-react';
import type { EpistemicRigorProfile } from '../../lib/field/epistemicTypes';

interface EpistemicRigorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: EpistemicRigorProfile;
  onSelectProfile: (profile: EpistemicRigorProfile) => void;
}

interface RigorOption {
  id: EpistemicRigorProfile;
  title: string;
  badge?: string;
  description: string;
}

const RIGOR_OPTIONS: RigorOption[] = [
  {
    id: 'open',
    title: 'Libre',
    description: 'Explorar perspectivas sin restricciones ni filtros previos.'
  },
  {
    id: 'balanced',
    title: 'Equilibrado',
    badge: 'Recomendado',
    description: 'Prioriza contenido documentado, permitiendo debate y algunas hipótesis.'
  },
  {
    id: 'documentary',
    title: 'Documental',
    description: 'Prioriza fuentes primarias, archivos históricos y hechos verificables.'
  },
  {
    id: 'exploratory',
    title: 'Exploratorio',
    description: 'Incluye más interpretaciones, controversias históricas y nuevas hipótesis.'
  }
];

export function EpistemicRigorModal({
  isOpen,
  onClose,
  currentProfile,
  onSelectProfile
}: EpistemicRigorModalProps) {
  if (!isOpen) return null;

  const handleSelect = (profile: EpistemicRigorProfile) => {
    onSelectProfile(profile);
    onClose();
  };

  return (
    <div className="epistemic-modal-overlay" onClick={onClose}>
      <div 
        className="epistemic-rigor-card" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="epistemic-header">
          <div className="epistemic-header-title">
            <Sliders size={18} className="text-cyan-400" />
            <span>RIGOR DE MI SEÑAL</span>
          </div>
          <button className="epistemic-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="epistemic-rigor-intro">
          Ajusta la ponderación epistemológica con la que el Field Engine compone la señal:
        </p>

        {/* Options List */}
        <div className="epistemic-rigor-options">
          {RIGOR_OPTIONS.map(opt => {
            const isSelected = currentProfile === opt.id;
            return (
              <div
                key={opt.id}
                className={`epistemic-rigor-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.id)}
              >
                <div className="epistemic-radio-circle">
                  {isSelected && <div className="epistemic-radio-inner" />}
                </div>

                <div className="epistemic-rigor-content">
                  <div className="epistemic-rigor-title-row">
                    <span className="epistemic-rigor-title">{opt.title}</span>
                    {opt.badge && (
                      <span className="epistemic-rigor-badge">{opt.badge}</span>
                    )}
                  </div>
                  <span className="epistemic-rigor-desc">{opt.description}</span>
                </div>

                {isSelected && (
                  <Check size={16} className="text-cyan-400 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        <div className="epistemic-footer-note">
          <span>Esta preferencia no altera Q≥60/R≥40; modula la naturaleza del conocimiento.</span>
        </div>
      </div>

      <style>{`
        .epistemic-rigor-card {
          width: 100%;
          max-width: 440px;
          background: linear-gradient(180deg, rgba(28, 32, 42, 0.96) 0%, rgba(18, 21, 28, 0.98) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
          color: #f1f5f9;
          font-family: inherit;
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .epistemic-rigor-intro {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.4;
          margin: 0 0 16px;
        }

        .epistemic-rigor-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }

        .epistemic-rigor-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          cursor: pointer;
          transition: 0.15s;
        }

        .epistemic-rigor-item:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .epistemic-rigor-item.selected {
          background: rgba(56, 189, 248, 0.08);
          border-color: rgba(56, 189, 248, 0.4);
        }

        .epistemic-radio-circle {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .epistemic-rigor-item.selected .epistemic-radio-circle {
          border-color: #38bdf8;
        }

        .epistemic-radio-inner {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #38bdf8;
        }

        .epistemic-rigor-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .epistemic-rigor-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .epistemic-rigor-title {
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .epistemic-rigor-badge {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .epistemic-rigor-desc {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.35;
        }
      `}</style>
    </div>
  );
}
