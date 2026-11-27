import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface PlayerControlsDrawerProps {
  children: React.ReactNode;
  className?: string;
  /** En escritorio (> 768px) arranca abierto; en celular (<= 768px) arranca plegado para ganar pantalla */
  defaultOpenDesktop?: boolean;
}

export const PlayerControlsDrawer: React.FC<PlayerControlsDrawerProps> = ({
  children,
  className = '',
  defaultOpenDesktop = true
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpenDesktop;
    return window.innerWidth > 768 ? defaultOpenDesktop : false;
  });

  return (
    <div className={`yapp-pcd-root ${isOpen ? 'is-open' : 'is-collapsed'} ${className}`}>
      {isOpen && <div className="yapp-pcd-body">{children}</div>}

      <div className="yapp-pcd-bar">
        <button
          type="button"
          className="yapp-pcd-white-btn"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Ocultar barra de controles' : 'Desplegar barra inteligente y controles'}
          title={isOpen ? 'Ocultar controles' : 'Desplegar controles'}
        >
          <span className="yapp-pcd-grip" aria-hidden="true" />
          {isOpen ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
        </button>
      </div>

      <style>{`
        .yapp-pcd-root {
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .yapp-pcd-body {
          width: 100%;
          animation: yappPcdSlide 0.18s ease-out;
        }
        @keyframes yappPcdSlide {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .yapp-pcd-bar {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 5px 0 6px;
        }
        .yapp-pcd-white-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 24px;
          min-width: 78px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #111827;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
          cursor: pointer;
          transition: transform 0.14s ease, box-shadow 0.14s ease, opacity 0.14s ease;
        }
        .yapp-pcd-white-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
        }
        .yapp-pcd-white-btn:active {
          transform: scale(0.96);
        }
        .yapp-pcd-grip {
          width: 24px;
          height: 3.5px;
          border-radius: 999px;
          background: #111827;
          opacity: 0.78;
        }
        .is-expanded .yapp-pcd-root,
        .is-mini-floating .yapp-pcd-root {
          display: none !important;
        }
      `}</style>
    </div>
  );
};
