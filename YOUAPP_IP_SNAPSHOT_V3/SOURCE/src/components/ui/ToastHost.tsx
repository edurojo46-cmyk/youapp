import React from 'react';
import { useUIStore } from '../../store/useUIStore';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react';

export const ToastHost: React.FC = () => {
  const { toasts, dismissToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none'
    }}>
      {toasts.map((toast) => {
        let Icon = Info;
        let color = '#3b82f6'; // info (blue)
        
        if (toast.type === 'success') {
          Icon = CheckCircle2;
          color = '#10b981'; // success (green)
        } else if (toast.type === 'error') {
          Icon = AlertCircle;
          color = '#ef4444'; // error (red)
        }

        return (
          <div 
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              padding: '12px 20px',
              borderRadius: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              border: '1px solid rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              pointerEvents: 'auto',
              cursor: 'pointer',
              animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            <Icon size={18} color={color} />
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a' }}>
              {toast.message}
            </span>
          </div>
        );
      })}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
