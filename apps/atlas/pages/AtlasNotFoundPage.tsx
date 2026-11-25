import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Home } from 'lucide-react';

export const AtlasNotFoundPage: React.FC = () => {
  return (
    <div style={{
      minHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      textAlign: 'center'
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        marginBottom: 20
      }}>
        <AlertCircle size={32} />
      </div>

      <div style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#ef4444',
        marginBottom: 8
      }}>
        Error 404 — NOT FOUND
      </div>

      <h1 style={{
        fontSize: 28,
        fontWeight: 700,
        color: '#f8fafc',
        margin: '0 0 12px 0'
      }}>
        Página no encontrada
      </h1>

      <p style={{
        fontSize: 14,
        color: '#94a3b8',
        maxWidth: 480,
        margin: '0 0 28px 0',
        lineHeight: 1.5
      }}>
        La ruta solicitada no existe o ha sido trasladada dentro de la plataforma Atlas Core.
      </p>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => window.history.back()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 16px',
            borderRadius: 8,
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={14} /> Volver atrás
        </button>

        <Link
          to="/broadcast/control-center"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 16px',
            borderRadius: 8,
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none'
          }}
        >
          <Home size={14} /> Ir al Control Center
        </Link>
      </div>
    </div>
  );
};

export default AtlasNotFoundPage;
