import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../../packages/auth/index.ts';
import { TvUserSessionMenu, goYouAppRoute } from '../../../src/components/tv/TvUserSessionMenu.tsx';
import { YouAppOfficialLogo } from '../../../src/components/ui/YouAppOfficialLogo.tsx';

export default function YouAppPublisherPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('Sincronizando sesión…');

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let disposed = false;
    let requestSerial = 0;

    const postSessionToFrame = (session: any) => {
      if (disposed) return;
      const validUser = session?.user && !session.user.is_anonymous ? session.user : null;
      const token = validUser ? session?.access_token || null : null;
      const email = validUser?.email || null;
      frame.contentWindow?.postMessage(
        { type: 'YOUAPP_PUBLISHER_SESSION', token, email },
        window.location.origin
      );
      setSessionStatus(
        token ? `🟢 Sesión conectada (${email || 'YOUAPP'})` : '🟡 Modo Invitado · Iniciá sesión para publicar'
      );
    };

    const refreshSession = async () => {
      const serial = ++requestSerial;
      try {
        const { data } = await supabase.auth.getSession();
        if (!disposed && serial === requestSerial) {
          postSessionToFrame(data?.session || null);
        }
      } catch {
        if (!disposed && serial === requestSerial) {
          postSessionToFrame(null);
        }
      }
    };

    const handleFrameMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'YOUAPP_PUBLISHER_AUTH') {
        void refreshSession();
        return;
      }
      if (event.data?.type === 'YOUAPP_PUBLISHER_LOGIN') {
        const email = String(event.data.email || '').trim();
        const password = String(event.data.password || '');
        setSessionStatus('Verificando credenciales…');
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setSessionStatus('Error al iniciar sesión');
          frame.contentWindow?.postMessage(
            { type: 'YOUAPP_PUBLISHER_LOGIN_RESULT', ok: false, error: error.message },
            window.location.origin
          );
        } else {
          postSessionToFrame(data.session);
          frame.contentWindow?.postMessage(
            { type: 'YOUAPP_PUBLISHER_LOGIN_RESULT', ok: true },
            window.location.origin
          );
        }
      }
    };

    const handleFrameLoad = () => {
      void refreshSession();
    };

    window.addEventListener('message', handleFrameMessage);
    frame.addEventListener('load', handleFrameLoad);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      requestSerial++;
      postSessionToFrame(session);
    });

    void refreshSession();

    return () => {
      disposed = true;
      requestSerial++;
      window.removeEventListener('message', handleFrameMessage);
      frame.removeEventListener('load', handleFrameLoad);
      sub.subscription.unsubscribe();
    };
  }, []);

  const iframeSrc = `/social-publisher/index.html${location.search}${location.hash}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 70,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          padding: '10px 24px',
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'saturate(180%) blur(16px)',
          borderBottom: '1px solid #e2e8f0'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <YouAppOfficialLogo theme="light" />
          <div style={{ width: 1, height: 20, background: '#e2e8f0' }} />
          <nav aria-label="Navegación YOUAPP" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}>Inicio</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/mitv')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}>MiTV</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/misenal1')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}>Mi Señal 1</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/repetidoras')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}>Repetidoras</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/search')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}>Buscar Canales</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/redes')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}>Mis Redes</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/publicador')} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}>Publicador</button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 10px' }}>
            {sessionStatus}
          </span>
          <TvUserSessionMenu />
        </div>
      </header>

      <iframe
        ref={frameRef}
        id="publisher-frame"
        title="YOUAPP Studio Publicador"
        src={iframeSrc}
        loading="eager"
        style={{ display: 'block', width: '100%', flex: 1, minHeight: 'calc(100dvh - 58px)', border: 0, background: '#f5f5f7' }}
      />
    </div>
  );
}
