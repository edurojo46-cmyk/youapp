import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Sparkles, Mic } from 'lucide-react';

interface YouRingProps {
  playing: boolean;
  signalProgress: number; // 0 to 100
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSurprise: () => void;
  onDirector: () => void;
  isMosaic?: boolean;
  onExitMosaic?: () => void;
}

export function YouRing({
  playing,
  signalProgress,
  onPlayPause,
  onNext,
  onPrevious,
  onSurprise,
  onDirector,
  isMosaic = false,
  onExitMosaic
}: YouRingProps) {
  // SVG for progress ring
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (signalProgress / 100) * circumference;

  return (
    <div className="you-ring-wrapper">
      <div className="you-ring-label">YOU RING</div>
      <div className="you-ring-container">
        
        {/* SVG Progress */}
        <svg className="you-ring-svg" width="160" height="160" viewBox="0 0 160 160">
          {/* Background dashed track */}
          <circle 
            className="you-ring-track" 
            cx="80" cy="80" r={radius} 
            strokeWidth="2" fill="none" 
            strokeDasharray="4 6"
          />
          {/* Progress solid track */}
          <circle 
            className="you-ring-progress" 
            cx="80" cy="80" r={radius} 
            strokeWidth="4" fill="none" 
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Action Buttons Around Ring */}
        <div className="you-ring-btn-group top" onClick={isMosaic ? onExitMosaic : onDirector}>
          <div className="you-ring-btn">
            {isMosaic ? <Pause size={16} color="white" /> : <Mic size={16} color="white" />}
          </div>
          <span className="you-ring-text">{isMosaic ? "Salir YOU4" : "Director"}</span>
        </div>
        <div className="you-ring-btn-group right" onClick={onNext}>
          <div className="you-ring-btn">
            <SkipForward size={16} color="white" />
          </div>
          <span className="you-ring-text">{isMosaic ? "Siguiente" : "Siguiente"}</span>
        </div>
        <div className="you-ring-btn-group bottom" onClick={isMosaic ? () => {} : onSurprise}>
          <div className="you-ring-btn">
            {isMosaic ? <Pause size={16} color="white" /> : <Sparkles size={16} color="white" />}
          </div>
          <span className="you-ring-text">{isMosaic ? "Pausar pre-vistas" : "Sorpréndeme"}</span>
        </div>
        <div className="you-ring-btn-group left" onClick={onPrevious}>
          <div className="you-ring-btn">
            <SkipBack size={16} color="white" />
          </div>
          <span className="you-ring-text">{isMosaic ? "Anterior" : "Anterior"}</span>
        </div>

        {/* Center Play/Pause */}
        <div className="you-ring-center" onClick={onPlayPause}>
          {playing ? (
            <Pause size={24} color="#2b6cb0" fill="#2b6cb0" />
          ) : (
            <Play size={24} color="#2b6cb0" fill="#2b6cb0" style={{ marginLeft: 4 }} />
          )}
        </div>
      </div>

      <style>{`
        .you-ring-wrapper {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 20;
        }

        .you-ring-label {
          color: white;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          margin-bottom: 24px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }

        .you-ring-container {
          position: relative;
          width: 260px;
          height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: ${isMosaic ? 'scale(0.8)' : 'scale(1)'};
          transition: transform 0.3s ease;
        }

        .you-ring-svg {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-90deg);
          pointer-events: none;
        }

        .you-ring-track {
          stroke: rgba(255,255,255,0.4);
        }

        .you-ring-progress {
          stroke: #4299e1;
          filter: drop-shadow(0 0 8px rgba(66, 153, 225, 0.6));
          transition: stroke-dashoffset 0.5s ease;
        }

        .you-ring-center {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 0 24px rgba(255, 255, 255, 0.5), inset 0 2px 4px rgba(255, 255, 255, 1);
          transition: 0.2s;
        }

        .you-ring-center:hover {
          transform: scale(1.05);
        }

        .you-ring-btn-group {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: auto;
          cursor: pointer;
          transition: 0.2s;
        }

        .you-ring-btn-group:hover {
          transform: scale(1.1);
        }

        .you-ring-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }

        .you-ring-text {
          color: white;
          font-size: 11px;
          font-weight: 500;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }

        .you-ring-btn-group.top { top: 10px; left: 50%; transform: translateX(-50%); }
        .you-ring-btn-group.bottom { bottom: 10px; left: 50%; transform: translateX(-50%); }
        .you-ring-btn-group.left { left: 10px; top: 50%; transform: translateY(-50%); }
        .you-ring-btn-group.right { right: 10px; top: 50%; transform: translateY(-50%); }
        
        .you-ring-btn-group.top:hover { transform: translateX(-50%) scale(1.1); }
        .you-ring-btn-group.bottom:hover { transform: translateX(-50%) scale(1.1); }
        .you-ring-btn-group.left:hover { transform: translateY(-50%) scale(1.1); }
        .you-ring-btn-group.right:hover { transform: translateY(-50%) scale(1.1); }
      `}</style>
    </div>
  );
}
