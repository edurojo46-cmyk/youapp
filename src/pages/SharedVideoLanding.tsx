import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Play, Search, Sparkles, Tv, UserPlus, X } from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { YouAppPlayer, type YouAppPlayerHandle } from '../components/player/YouAppPlayer';
import { resolveKnownChannelAvatar } from '../lib/tv/channelIdentityCatalog';
import { useStore } from '../store/useStore';

export default function SharedVideoLanding() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();
  const isRegisteredUser = Boolean(user && !(user as any).is_anonymous);
  const playerRef = useRef<YouAppPlayerHandle>(null);

  const videoId = (searchParams.get('v') || '').trim();
  const startSec = Math.max(0, Math.floor(Number(searchParams.get('t') || 0) || 0));
  const sharedTitle = searchParams.get('title') || 'Video compartido en YOUAPP TV';
  const sharedChannel = searchParams.get('ch') || 'YOUAPP TV';

  const [searchQuery, setSearchQuery] = useState('');
  const [gateReason, setGateReason] = useState<string | null>(null);
  const hasSeekedRef = useRef(false);

  const channelAvatar = useMemo(() => resolveKnownChannelAvatar(sharedChannel), [sharedChannel]);
  const initial = (sharedChannel.trim()[0] || 'Y').toUpperCase();

  const openRegisterGate = (reason: string) => {
    setGateReason(reason);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (isRegisteredUser) {
      navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
      return;
    }
    openRegisterGate(
      q
        ? `Registrate gratis en YOUAPP para buscar «${q}» y ver más videos.`
        : 'Registrate gratis en YOUAPP para buscar otros videos y canales.'
    );
  };

  const formattedStart = (() => {
    if (startSec <= 0) return null;
    const mm = String(Math.floor(startSec / 60)).padStart(2, '0');
    const ss = String(startSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  })();

  return (
    <div className="svl-page">
      {/* Cabecera Inicio YOUAPP (Modo Invitado por enlace compartido) */}
      <header className="svl-topnav">
        <div className="svl-brand">
          <YouAppOfficialLogo theme="light" />
          <span className="svl-guest-pill">Video compartido</span>
        </div>

        <form onSubmit={handleSearchSubmit} className="svl-search-form" role="search">
          <Search size={14} className="svl-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar otro video o canal en YOUAPP…"
            className="svl-search-input"
            aria-label="Buscar otro video o canal"
          />
          <button type="submit" className="svl-search-btn">
            Buscar
          </button>
        </form>

        <div className="svl-auth-actions">
          {isRegisteredUser ? (
            <button
              type="button"
              className="svl-login-btn"
              onClick={() => navigate('/misenal1')}
            >
              <Tv size={14} />
              <span>Ir a Mi Señal</span>
            </button>
          ) : (
            <button
              type="button"
              className="svl-login-btn"
              onClick={() => navigate('/login')}
            >
              <UserPlus size={14} />
              <span>Crear cuenta gratis</span>
            </button>
          )}
        </div>
      </header>

      <main className="svl-main">
        {/* Cabecera estilo Apple arriba del video */}
        <div className="svl-video-header">
          <div className="svl-avatar">
            {channelAvatar ? (
              <img src={channelAvatar} alt={sharedChannel} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="svl-title-col">
            <h1>{sharedTitle}</h1>
            <p>
              {sharedChannel}
              {formattedStart ? ` · Empieza en ${formattedStart}` : ''}
            </p>
          </div>
        </div>

        {/* Reproductor libre para este video compartido */}
        <div className="svl-stage">
          {videoId ? (
            <YouAppPlayer
              ref={playerRef}
              item={{
                blockId: `shared-${videoId}`,
                provider: 'youtube',
                providerContentId: videoId,
                playbackUrl: `https://www.youtube.com/watch?v=${videoId}${startSec > 0 ? `&t=${startSec}s` : ''}`,
                title: sharedTitle,
                durationSec: 600,
                autoplay: true,
                muted: false
              }}
              onReady={() => {
                if (startSec > 0 && !hasSeekedRef.current) {
                  hasSeekedRef.current = true;
                  void playerRef.current?.seek(startSec);
                }
              }}
            />
          ) : (
            <div className="svl-empty">
              <Play size={28} />
              <span>No se encontró el video compartido.</span>
            </div>
          )}
        </div>

        {/* Franja inferior: si es invitado pide registro al explorar más; si ya tiene cuenta ofrece ir a Mi Señal */}
        {!isRegisteredUser && (
          <section className="svl-cta-card">
            <div className="svl-cta-text">
              <span className="svl-cta-badge">
                <Sparkles size={12} /> YOUAPP TV
              </span>
              <h2>¿Querés buscar otros videos o armar tu propia señal?</h2>
              <p>
                Podés ver este video completo sin cuenta. Para buscar otros canales, guardar momentos o crear tu señal, registrate gratis en 10 segundos.
              </p>
            </div>

            <div className="svl-cta-btns">
              <button
                type="button"
                className="svl-btn-primary"
                onClick={() => navigate('/login')}
              >
                <UserPlus size={14} />
                <span>Registrarme gratis</span>
              </button>
              <button
                type="button"
                className="svl-btn-secondary"
                onClick={() =>
                  openRegisterGate('Creá tu cuenta gratuita para explorar señales y armar tu propia grilla.')
                }
              >
                <Tv size={14} />
                <span>Explorar señales</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Modal de registro al intentar buscar otro video */}
      {gateReason && (
        <div
          className="svl-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="svl-gate-title"
          onClick={() => setGateReason(null)}
        >
          <div className="svl-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="svl-modal-close"
              onClick={() => setGateReason(null)}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>

            <div className="svl-modal-icon">
              <Lock size={20} />
            </div>

            <h3 id="svl-gate-title">Registrate gratis para seguir explorando</h3>
            <p>{gateReason}</p>

            <div className="svl-modal-actions">
              <button
                type="button"
                className="svl-btn-primary full"
                onClick={() => navigate('/login')}
              >
                <UserPlus size={14} />
                <span>Crear cuenta / Iniciar sesión</span>
              </button>
              <button
                type="button"
                className="svl-btn-ghost full"
                onClick={() => setGateReason(null)}
              >
                Seguir viendo este video
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .svl-page {
          min-height: 100dvh;
          background: #f5f5f7;
          color: #1d1d1f;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          padding-bottom: 40px;
        }
        .svl-topnav {
          position: sticky;
          top: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 18px;
          background: rgba(255, 255, 255, 0.86);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          flex-wrap: wrap;
        }
        .svl-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .svl-guest-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          font-size: 11px;
          font-weight: 650;
        }
        .svl-search-form {
          flex: 1 1 280px;
          max-width: 480px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 5px 4px 12px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .svl-search-icon {
          color: #86868b;
          flex-shrink: 0;
        }
        .svl-search-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: #1d1d1f;
          font-size: 13px;
          outline: none;
        }
        .svl-search-btn {
          border: none;
          border-radius: 999px;
          background: #1d1d1f;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 13px;
          cursor: pointer;
        }
        .svl-login-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .svl-main {
          max-width: 960px;
          margin: 0 auto;
          padding: 18px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .svl-video-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
        }
        .svl-avatar {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1.5px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        }
        .svl-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .svl-title-col {
          min-width: 0;
          flex: 1;
        }
        .svl-title-col h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #1d1d1f;
          line-height: 1.25;
        }
        .svl-title-col p {
          margin: 2px 0 0;
          font-size: 12px;
          color: #6e6e73;
        }
        .svl-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 20px 44px -16px rgba(0, 0, 0, 0.25);
        }
        .svl-empty {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #aeaeb2;
        }
        .svl-cta-card {
          margin-top: 6px;
          padding: 18px 20px;
          border-radius: 22px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .svl-cta-text {
          flex: 1 1 320px;
        }
        .svl-cta-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #0071e3;
          letter-spacing: 0.03em;
        }
        .svl-cta-text h2 {
          margin: 4px 0 4px;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .svl-cta-text p {
          margin: 0;
          font-size: 13px;
          color: #6e6e73;
          line-height: 1.45;
        }
        .svl-cta-btns {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .svl-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 16px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .svl-btn-primary:hover {
          background: #0077ed;
        }
        .svl-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 15px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .svl-btn-ghost {
          padding: 9px 14px;
          border-radius: 999px;
          border: none;
          background: rgba(118, 118, 128, 0.1);
          color: #1d1d1f;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .full {
          width: 100%;
        }
        .svl-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(29, 29, 31, 0.45);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .svl-modal {
          position: relative;
          width: 100%;
          max-width: 390px;
          background: #ffffff;
          border-radius: 24px;
          padding: 24px 22px 20px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
          text-align: center;
        }
        .svl-modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: rgba(118, 118, 128, 0.12);
          color: #1d1d1f;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .svl-modal-icon {
          width: 46px;
          height: 46px;
          margin: 0 auto 12px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.12);
          color: #0071e3;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .svl-modal h3 {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .svl-modal p {
          margin: 0 0 18px;
          font-size: 13.5px;
          color: #6e6e73;
          line-height: 1.45;
        }
        .svl-modal-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}
