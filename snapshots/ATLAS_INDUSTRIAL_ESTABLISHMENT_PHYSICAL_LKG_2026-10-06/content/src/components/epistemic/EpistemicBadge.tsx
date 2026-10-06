import React from 'react';
import type { EpistemicNature } from '../../lib/field/epistemicTypes';

interface EpistemicBadgeProps {
  nature?: EpistemicNature;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
  onClick?: () => void;
}

const CONFIG: Record<EpistemicNature, {
  glyph: string;
  label: string;
  bg: string;
  border: string;
  color: string;
  accent: string;
  title: string;
}> = {
  documented: {
    glyph: '✓',
    label: 'DOCUMENTADO',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.35)',
    color: '#7dd3fc',
    accent: '#38bdf8',
    title: 'Hechos históricos y fuentes estructuradas verificables'
  },
  interpretive: {
    glyph: '◐',
    label: 'INTERPRETATIVO',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.35)',
    color: '#d8b4fe',
    accent: '#c084fc',
    title: 'Análisis crítico, biografías y ensayos de autor'
  },
  controversial: {
    glyph: '⇄',
    label: 'CONTROVERTIDO',
    bg: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.35)',
    color: '#fed7aa',
    accent: '#fb923c',
    title: 'Debate abierto entre posturas contrastantes'
  },
  speculative: {
    glyph: '◇',
    label: 'ESPECULATIVO',
    bg: 'rgba(232, 121, 249, 0.12)',
    border: 'rgba(232, 121, 249, 0.35)',
    color: '#f5d0fe',
    accent: '#e879f9',
    title: 'Hipótesis teóricas, conceptos no probados o mitos'
  },
  unknown: {
    glyph: '?',
    label: 'SIN DETERMINAR',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.30)',
    color: '#cbd5e1',
    accent: '#94a3b8',
    title: 'Evidencia o metadatos insuficientes para clasificar'
  }
};


export function EpistemicBadge({
  nature = 'documented',
  size = 'sm',
  showLabel = true,
  className = '',
  onClick
}: EpistemicBadgeProps) {
  const conf = CONFIG[nature] || CONFIG.documented;

  const isSmall = size === 'sm';

  return (
    <span
      className={`epistemic-badge ${className}`}
      title={conf.title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '4px' : '6px',
        padding: isSmall ? '2px 7px' : '4px 10px',
        borderRadius: '9999px',
        fontSize: isSmall ? '10px' : '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        background: conf.bg,
        border: `1px solid ${conf.border}`,
        color: conf.color,
        cursor: onClick ? 'pointer' : 'default',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        userSelect: 'none',
        lineHeight: 1.2
      }}
    >
      <span style={{ fontSize: isSmall ? '10px' : '12px', color: conf.accent }}>
        {conf.glyph}
      </span>
      {showLabel && <span>{conf.label}</span>}
    </span>
  );
}
