import React from 'react';
import { useNavigate } from 'react-router-dom';
import { goYouAppRoute } from '../tv/TvUserSessionMenu';

export interface YouAppOfficialLogoProps {
  theme?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  to?: string | null;
  onClick?: () => void;
  className?: string;
}

/**
 * Logo oficial canónico de YOUAPP TV (idéntico al de la página de Inicio arriba a la izquierda:
 * "Y O U  A P P  T V" con espaciado tipográfico ancho y "T V" en azul oficial #3b82f6).
 */
export const YouAppOfficialLogo: React.FC<YouAppOfficialLogoProps> = ({
  theme = 'light',
  size = 'md',
  to = '/',
  onClick,
  className = ''
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) {
      goYouAppRoute(navigate, to);
    }
  };

  const fontSize = size === 'sm' ? '1.02rem' : size === 'lg' ? '1.35rem' : '1.2rem';
  const letterSpacing = size === 'sm' ? '3px' : '4px';
  const wordGap = size === 'sm' ? '5px' : '6px';
  const mainColor = theme === 'dark' ? '#ffffff' : '#0f172a';
  const interactive = Boolean(onClick || to);

  return (
    <div
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label="YOUAPP TV — Ir al Inicio"
      onClick={interactive ? handleClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={`youapp-official-logo ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: wordGap,
        fontFamily: "var(--you-font-display, 'Space Grotesk', 'Geist', -apple-system, BlinkMacSystemFont, sans-serif)",
        fontSize,
        fontWeight: 800,
        letterSpacing,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: interactive ? 'pointer' : 'default',
        flexShrink: 0
      }}
    >
      <span style={{ color: mainColor }}>Y O U</span>
      <span style={{ color: mainColor }}>A P P</span>
      <span style={{ color: '#3b82f6' }}>T V</span>
      <style>{`
        @media (max-width: 480px) {
          .youapp-official-logo {
            font-size: 1rem !important;
            letter-spacing: 2.6px !important;
            gap: 5px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default YouAppOfficialLogo;
