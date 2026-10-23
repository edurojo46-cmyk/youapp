/**
 * SHARED UI-BASE PACKAGE
 * @packages/ui-base
 * 
 * Neutral, product-agnostic UI base components shared across Atlas, Busca Industrial, and YouApp.
 * Strictly free of commercial or streaming-specific domain logic.
 */

export { ToastHost } from '../../src/components/ui/ToastHost.tsx';
export { ModalHost } from '../../src/components/ui/ModalHost.tsx';
export { ProviderBadge } from '../../src/components/ui/ProviderBadge.tsx';

import React from 'react';

export interface BaseBadgeProps {
  label: string;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export const BaseBadge: React.FC<BaseBadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md'
}) => {
  const variantStyles: Record<string, React.CSSProperties> = {
    neutral: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' },
    success: { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' },
    warning: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    danger: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
    info: { background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '2px 8px', fontSize: '11px', borderRadius: '12px' },
    md: { padding: '4px 12px', fontSize: '13px', borderRadius: '16px' }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 600,
        lineHeight: 1,
        ...variantStyles[variant],
        ...sizeStyles[size]
      }}
    >
      {label}
    </span>
  );
};

export interface BaseSpinnerProps {
  size?: number;
  color?: string;
}

export const BaseSpinner: React.FC<BaseSpinnerProps> = ({
  size = 20,
  color = '#3b82f6'
}) => (
  <div
    style={{
      width: size,
      height: size,
      border: `2px solid rgba(0,0,0,0.1)`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'base-spin 0.8s linear infinite',
      display: 'inline-block'
    }}
  >
    <style>{`
      @keyframes base-spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);
