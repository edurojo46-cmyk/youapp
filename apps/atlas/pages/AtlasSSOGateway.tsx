import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../../packages/auth/index.ts';
import { Layers, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';

export const AtlasSSOGateway: React.FC = () => {
  const [searchParams] = useSearchParams();
  const authReqId = searchParams.get('auth_req_id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestDetails, setRequestDetails] = useState<{
    client_id: string;
    redirect_uri: string;
    state: string;
  } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch Request Details & check current session
  useEffect(() => {
    if (!authReqId) {
      setError('Petición de autorización inválida o ausente (missing auth_req_id).');
      setLoading(false);
      return;
    }

    async function evaluateAuth() {
      try {
        const detailsRes = await fetch(`/api/auth/sso/request-details/${encodeURIComponent(authReqId!)}`);
        if (!detailsRes.ok) {
          const errData = await detailsRes.json();
          throw new Error(errData.error || 'La solicitud de inicio de sesión ha expirado.');
        }

        const details = await detailsRes.json();
        setRequestDetails(details);

        // Check if user is currently authenticated in Atlas with a verified identity
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token && session.user && !session.user.is_anonymous && session.user.email) {
          // Already authenticated! Issue code immediately with verified token
          await issueCodeAndRedirect(session.access_token);
          return;
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    evaluateAuth();
  }, [authReqId]);

  const issueCodeAndRedirect = async (accessToken: string) => {
    try {
      const issueRes = await fetch('/api/auth/sso/issue-code', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          auth_req_id: authReqId
        })
      });

      if (!issueRes.ok) {
        const errData = await issueRes.json();
        throw new Error(errData.error || 'Error emitiendo código de autorización');
      }

      const { code, redirect_uri, state } = await issueRes.json();
      const targetUrl = new URL(redirect_uri);
      targetUrl.searchParams.set('code', code);
      targetUrl.searchParams.set('state', state);

      // Secure redirect back to client (ONLY code and state, NO tokens in URL!)
      window.location.href = targetUrl.toString();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { data, error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginErr || !data.session) {
        throw new Error(loginErr?.message || 'Credenciales inválidas');
      }

      await issueCodeAndRedirect(data.session.access_token);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090d16',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <Loader2 size={36} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '14px' }}>
          Conectando con Atlas Auth Gateway...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0f172a 0%, #090d16 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px'
          }}>
            <Layers size={24} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px 0' }}>
            Atlas Auth Gateway
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
            Inicia sesión una vez para acceder a {requestDetails?.client_id || 'la aplicación'}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            color: '#fca5a5',
            fontSize: '13px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: '8px',
              padding: '12px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
            }}
          >
            {submitting ? 'Autenticando...' : 'Iniciar Sesión y Continuar'}
            {!submitting && <ArrowRight size={16} />}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px' }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>PKCE S256 • Supabase Auth SSOT</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AtlasSSOGateway;
