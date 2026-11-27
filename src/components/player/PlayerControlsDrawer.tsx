import React, { useEffect, useState } from 'react';
import { Bookmark, ChevronDown, ChevronUp } from 'lucide-react';
import {
  isAtlasQuickSaved,
  toggleAtlasQuickSave,
  type AtlasQuickSaveInput
} from '../../lib/tv/atlasQuickSave';

export interface PlayerControlsDrawerProps {
  children: React.ReactNode;
  className?: string;
  /** En escritorio (> 768px) arranca abierto; en celular (<= 768px) arranca plegado para ganar pantalla */
  defaultOpenDesktop?: boolean;
  /** Video / canción actual para el punto rojo de guardado inteligente con ATLAS */
  quickSaveItem?: AtlasQuickSaveInput | null;
}

export const PlayerControlsDrawer: React.FC<PlayerControlsDrawerProps> = ({
  children,
  className = '',
  defaultOpenDesktop = true,
  quickSaveItem = null
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpenDesktop;
    return window.innerWidth > 768 ? defaultOpenDesktop : false;
  });
  const [saved, setSaved] = useState<boolean>(() => isAtlasQuickSaved(quickSaveItem));
  const [atlasToast, setAtlasToast] = useState<string | null>(null);

  useEffect(() => {
    setSaved(isAtlasQuickSaved(quickSaveItem));
  }, [quickSaveItem?.id, quickSaveItem?.videoId, quickSaveItem?.sourceUrl]);

  useEffect(() => {
    if (!atlasToast) return;
    const t = window.setTimeout(() => setAtlasToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [atlasToast]);

  const handleQuickSaveClick = () => {
    if (!quickSaveItem) return;
    const res = toggleAtlasQuickSave(quickSaveItem);
    setSaved(res.saved);
    setAtlasToast(res.saved ? `✓ ATLAS → ${res.label}` : 'Quitado de Mis Listas');
  };

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

        {quickSaveItem && (!saved || atlasToast) && (
          <button
            type="button"
            className={`yapp-pcd-save-btn ${saved ? 'is-saved' : ''}`}
            onClick={saved ? undefined : handleQuickSaveClick}
            disabled={saved}
            aria-label="Guardar en Mis Listas con ATLAS"
            title="Guardar en Mis Listas (ATLAS organiza solo)"
          >
            {!saved && <Bookmark size={15} fill="none" strokeWidth={2.1} />}
            {atlasToast && <span className="yapp-pcd-toast-txt">{atlasToast}</span>}
          </button>
        )}
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
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 5px 10px 6px;
          box-sizing: border-box;
        }
        .yapp-pcd-white-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 24px;
          min-width: 82px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.36);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.14) 100%);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          color: rgba(255, 255, 255, 0.95);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.48),
            0 4px 14px rgba(0, 0, 0, 0.26);
          cursor: pointer;
          transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
        }
        .yapp-pcd-white-btn:hover {
          transform: translateY(-1px);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.36) 0%, rgba(255, 255, 255, 0.2) 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.58),
            0 6px 18px rgba(0, 0, 0, 0.3);
        }
        .yapp-pcd-white-btn:active {
          transform: scale(0.96);
        }
        .yapp-pcd-grip {
          width: 24px;
          height: 3.5px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
        }
        .yapp-pcd-save-btn {
          position: absolute;
          right: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 26px;
          padding: 0 4px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.88);
          cursor: pointer;
          transition: transform 0.14s ease, color 0.16s ease, opacity 0.16s ease;
        }
        .yapp-pcd-save-btn:hover {
          transform: translateY(-1px);
          color: #ffffff;
        }
        .yapp-pcd-save-btn:active {
          transform: scale(0.92);
        }
        .yapp-pcd-save-btn.is-saved {
          color: #ffffff;
        }
        .yapp-pcd-toast-txt {
          font-size: 10.5px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
        }
        .is-expanded .yapp-pcd-root,
        .is-mini-floating .yapp-pcd-root {
          display: none !important;
        }
      `}</style>
    </div>
  );
};
