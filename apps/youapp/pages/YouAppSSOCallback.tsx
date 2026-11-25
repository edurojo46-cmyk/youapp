import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleSSOCallback } from '../../../packages/auth/sso.ts';
import { Loader2, AlertCircle } from 'lucide-react';

export const YouAppSSOCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function exchange() {
      try {
        const { returnPath } = await handleSSOCallback();
        navigate(returnPath || '/', { replace: true });
      } catch (err: any) {
        console.error('SSO Callback Error:', err);
        setError(err.message || 'Error en intercambio de sesión SSO');
      }
    }

    exchange();
  }, [navigate]);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#05070c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          textAlign: 'center'
        }}>
          <AlertCircle size={36} color="#ef4444" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Fallo de Autenticación SSO</h3>
          <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              background: '#ec4899',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '13px'
            }}
          >
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#05070c',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <Loader2 size={36} color="#ec4899" style={{ animation: 'spin 1s linear infinite' }} />
      <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '14px' }}>
        Estableciendo sesión en YouApp...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default YouAppSSOCallback;
