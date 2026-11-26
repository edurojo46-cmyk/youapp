import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Film, Music2, Radio, Tv, X } from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'shorts' || p === 'live' || p === 'embed');
    if (idx >= 0 && parts[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
  } catch {
    // ignore
  }
  return null;
}

export default function ShareTarget() {
  const navigate = useNavigate();
  const location = useLocation();

  const { sharedUrl, sharedTitle, ytThumb } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const rawUrl = params.get('url')?.trim() || '';
    const rawText = params.get('text')?.trim() || '';
    // YouTube en Android suele enviar el enlace dentro de `text` y no en `url`
    const extractedFromText = rawText.match(/https?:\/\/\S+/i)?.[0] || '';
    const url = rawUrl || extractedFromText;
    const title =
      params.get('title')?.trim() ||
      (rawText && rawText !== extractedFromText ? rawText.replace(extractedFromText, '').trim() : '');
    const ytId = url ? extractYouTubeId(url) : null;
    return {
      sharedUrl: url,
      sharedTitle: title,
      ytThumb: ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null
    };
  }, [location.search]);

  const sendTo = (basePath: string) => {
    if (!sharedUrl) {
      navigate('/', { replace: true });
      return;
    }
    const params = new URLSearchParams({ add: sharedUrl });
    if (sharedTitle) params.set('t', sharedTitle);
    navigate(`${basePath}?${params.toString()}`, { replace: true });
  };

  if (!sharedUrl) {
    return (
      <div className="st-page">
        <div className="st-sheet">
          <div className="st-top">
            <YouAppOfficialLogo size="sm" theme="dark" to="/" />
            <button type="button" className="st-close" onClick={() => navigate('/', { replace: true })} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          <p className="st-empty">No recibimos ningún enlace para agregar.</p>
          <button type="button" className="st-home-btn" onClick={() => navigate('/', { replace: true })}>
            Ir a YOUAPP
          </button>
        </div>
        <style>{SHARE_STYLES}</style>
      </div>
    );
  }

  return (
    <div className="st-page">
      <div className="st-sheet">
        <div className="st-top">
          <YouAppOfficialLogo size="sm" theme="dark" to="/" />
          <button
            type="button"
            className="st-close"
            onClick={() => navigate('/', { replace: true })}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="st-preview">
          {ytThumb && <img src={ytThumb} alt={sharedTitle || 'Vista previa'} className="st-thumb" />}
          <div className="st-preview-meta">
            <span className="st-kicker">AGREGAR A YOUAPP</span>
            <h2>{sharedTitle || '¿Dónde querés sumar este enlace?'}</h2>
            <p className="st-url">{sharedUrl}</p>
          </div>
        </div>

        <div className="st-actions">
          <button type="button" className="st-btn st-btn--primary" onClick={() => sendTo('/mitv')}>
            <span className="st-icon blue"><Tv size={20} /></span>
            <span className="st-btn-text">
              <strong>MiTV</strong>
              <span>Sumarlo directo a tu programación personal</span>
            </span>
          </button>

          <button type="button" className="st-btn" onClick={() => sendTo('/misenal1')}>
            <span className="st-icon cyan"><Radio size={20} /></span>
            <span className="st-btn-text">
              <strong>Mi Señal</strong>
              <span>Agregarlo al aire en tu señal</span>
            </span>
          </button>

          <button type="button" className="st-btn" onClick={() => sendTo('/reels')}>
            <span className="st-icon pink"><Film size={20} /></span>
            <span className="st-btn-text">
              <strong>Reels</strong>
              <span>Guardarlo en tus colecciones verticales</span>
            </span>
          </button>

          <button type="button" className="st-btn" onClick={() => sendTo('/youmusic')}>
            <span className="st-icon violet"><Music2 size={20} /></span>
            <span className="st-btn-text">
              <strong>YOU MUSIC</strong>
              <span>Sumarlo a tu playlist musical</span>
            </span>
          </button>

          <button type="button" className="st-btn" onClick={() => sendTo('/lecturas')}>
            <span className="st-icon amber"><BookOpen size={20} /></span>
            <span className="st-btn-text">
              <strong>Lecturas</strong>
              <span>Guardar artículo o nota para leer</span>
            </span>
          </button>
        </div>
      </div>

      <style>{SHARE_STYLES}</style>
    </div>
  );
}

const SHARE_STYLES = `
  .st-page {
    min-height: 100dvh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) 14px max(20px, env(safe-area-inset-bottom));
    box-sizing: border-box;
    background: radial-gradient(circle at 50% 0%, #162033 0%, #090c12 72%);
    font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
    color: #f8fafc;
  }

  .st-sheet {
    width: 100%;
    max-width: 420px;
    border-radius: 26px;
    padding: 18px;
    background: rgba(18, 22, 32, 0.86);
    backdrop-filter: saturate(180%) blur(26px);
    -webkit-backdrop-filter: saturate(180%) blur(26px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.14);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .st-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .st-close {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .st-preview {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .st-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 12px;
    display: block;
    background: #000000;
  }

  .st-preview-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .st-kicker {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #64d2ff;
  }

  .st-preview-meta h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
    color: #ffffff;
  }

  .st-url {
    margin: 0;
    font-size: 11.5px;
    color: rgba(248, 250, 252, 0.56);
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .st-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .st-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.12s ease;
  }

  .st-btn:active {
    transform: scale(0.98);
    background: rgba(255, 255, 255, 0.14);
  }

  .st-btn--primary {
    background: rgba(10, 132, 255, 0.22);
    border-color: rgba(100, 210, 255, 0.45);
  }

  .st-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .st-icon.blue { background: rgba(10, 132, 255, 0.28); color: #64d2ff; }
  .st-icon.cyan { background: rgba(56, 189, 248, 0.22); color: #7dd3fc; }
  .st-icon.pink { background: rgba(244, 63, 94, 0.22); color: #fda4af; }
  .st-icon.violet { background: rgba(168, 85, 247, 0.22); color: #d8b4fe; }
  .st-icon.amber { background: rgba(245, 158, 11, 0.22); color: #fcd34d; }

  .st-btn-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .st-btn-text strong {
    font-size: 0.92rem;
    font-weight: 700;
    color: #ffffff;
  }

  .st-btn-text span {
    font-size: 0.76rem;
    color: rgba(248, 250, 252, 0.66);
  }

  .st-empty {
    margin: 8px 0;
    font-size: 0.9rem;
    color: rgba(248, 250, 252, 0.72);
    text-align: center;
  }

  .st-home-btn {
    padding: 11px 16px;
    border-radius: 999px;
    border: none;
    background: #0071e3;
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 650;
    cursor: pointer;
  }
`;
