import React from 'react';

export interface ProviderBadgeProps {
  provider?: string;
  publisherName?: string;
  retrievalSource?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

export const ProviderBadge: React.FC<ProviderBadgeProps> = ({
  provider,
  publisherName,
  retrievalSource,
  size = 'sm',
  className = '',
  style = {}
}) => {
  const norm = (provider || '').toLowerCase().trim();
  const src = (retrievalSource || '').toLowerCase().trim();

  let label = 'YouTube';
  let glyph = '▶';
  let bg = 'rgba(239, 68, 68, 0.08)';
  let border = 'rgba(239, 68, 68, 0.22)';
  let color = '#ef4444';

  if (norm === 'vimeo' || src.includes('vimeo')) {
    label = 'Vimeo';
    glyph = '◈';
    bg = 'rgba(14, 165, 233, 0.10)';
    border = 'rgba(14, 165, 233, 0.30)';
    color = '#0ea5e9';
  } else if (norm === 'dailymotion' || src.includes('dailymotion')) {
    label = 'Dailymotion';
    glyph = '◆';
    bg = 'rgba(59, 130, 246, 0.10)';
    border = 'rgba(59, 130, 246, 0.30)';
    color = '#3b82f6';
  } else if (norm === 'publisher' || publisherName || src === 'publisher') {
    label = publisherName || 'Publisher';
    glyph = '📰';
    bg = 'rgba(16, 185, 129, 0.10)';
    border = 'rgba(16, 185, 129, 0.28)';
    color = '#10b981';
  } else if (norm === 'archive' || src === 'archive') {
    label = 'Archive';
    glyph = '🏛';
    bg = 'rgba(168, 85, 247, 0.10)';
    border = 'rgba(168, 85, 247, 0.28)';
    color = '#a855f7';
  } else if (norm === 'atlas' || src === 'atlas') {
    label = 'Atlas';
    glyph = '⚡';
    bg = 'rgba(245, 158, 11, 0.10)';
    border = 'rgba(245, 158, 11, 0.28)';
    color = '#f59e0b';
  }

  const fontSize = size === 'xs' ? '0.65rem' : size === 'md' ? '0.82rem' : '0.72rem';
  const padding = size === 'xs' ? '1px 5px' : size === 'md' ? '3px 9px' : '2px 7px';
  const iconSize = size === 'xs' ? '0.6rem' : size === 'md' ? '0.75rem' : '0.68rem';

  return (
    <span
      className={`provider-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        borderRadius: '6px',
        padding: padding,
        fontSize: fontSize,
        fontWeight: 600,
        letterSpacing: '0.2px',
        lineHeight: 1.2,
        userSelect: 'none',
        backdropFilter: 'blur(4px)',
        transition: 'all 0.15s ease-in-out',
        ...style
      }}
      title={`Fuente de origen: ${label}`}
    >
      <span style={{ fontSize: iconSize, opacity: 0.9 }}>{glyph}</span>
      <span>{label}</span>
    </span>
  );
};

export default ProviderBadge;
