import { useState, useEffect } from 'react';
import { Moon, X, Clock, Sun } from 'lucide-react';

interface SleepTimerProps {
  onSleepTriggered: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const TIMER_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min (1h)', minutes: 60 },
  { label: '90 min', minutes: 90 },
];

export default function SleepTimer({ onSleepTriggered, isOpen, onClose }: SleepTimerProps) {
  const [activeMinutes, setActiveMinutes] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (secondsRemaining === null) return;

    if (secondsRemaining <= 0) {
      setActiveMinutes(null);
      setSecondsRemaining(null);
      onSleepTriggered();
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining, onSleepTriggered]);

  const handleStartTimer = (mins: number) => {
    setActiveMinutes(mins);
    setSecondsRemaining(mins * 60);
    onClose();
  };

  const handleCancelTimer = () => {
    setActiveMinutes(null);
    setSecondsRemaining(null);
    onClose();
  };

  const formatRemaining = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="sleep-timer-modal-overlay" onClick={onClose}>
      <div className="sleep-timer-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="timer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Moon size={22} className="text-accent" />
            <h3>Temporizador de Apagado (Sleep Timer)</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="timer-desc">
          Programa el apagado automático de la transmisión para dormirte tranquilo con el televisor encendido.
        </p>

        {secondsRemaining !== null && (
          <div className="active-timer-banner">
            <Clock size={16} />
            <span>Apagando en: <strong>{formatRemaining(secondsRemaining)}</strong></span>
            <button className="cancel-btn" onClick={handleCancelTimer}>Cancelar</button>
          </div>
        )}

        <div className="timer-options-grid">
          {TIMER_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              className={`timer-opt-btn ${activeMinutes === opt.minutes ? 'active' : ''}`}
              onClick={() => handleStartTimer(opt.minutes)}
            >
              <Moon size={16} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {activeMinutes && (
          <button className="btn btn-glass" onClick={handleCancelTimer} style={{ marginTop: '16px', width: '100%' }}>
            Desactivar Temporizador
          </button>
        )}
      </div>

      <style>{`
        .sleep-timer-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .sleep-timer-card {
          width: 100%;
          max-width: 400px;
          padding: 24px;
          border-radius: 18px;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 15px 50px rgba(0, 0, 0, 0.8);
          animation: popIn 0.2s ease-out;
        }

        .timer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .timer-header h3 {
          margin: 0;
          font-size: 1.05rem;
          color: white;
        }

        .close-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }

        .timer-desc {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 20px;
          line-height: 1.4;
        }

        .active-timer-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(99, 102, 241, 0.2);
          border: 1px solid rgba(99, 102, 241, 0.4);
          padding: 10px 14px;
          border-radius: 8px;
          color: white;
          font-size: 0.85rem;
          margin-bottom: 16px;
        }

        .cancel-btn {
          background: none;
          border: none;
          color: #ef4444;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .timer-options-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .timer-opt-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }

        .timer-opt-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          transform: translateY(-2px);
        }

        .timer-opt-btn.active {
          background: #6366f1;
          border-color: #6366f1;
        }
      `}</style>
    </div>
  );
}
