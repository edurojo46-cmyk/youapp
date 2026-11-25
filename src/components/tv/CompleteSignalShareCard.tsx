import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Check,
  Download,
  Film,
  Music,
  Radio,
  Share2,
  Tv
} from 'lucide-react';
import { buildWhatsAppShareHref, buildYouAppFullSignalShareUrl } from '../../lib/tv/youappShareHelper';

export interface CompleteSignalVisualData {
  signalId: string;
  signalName: string;
  avatarUrl?: string;
  heroCoverUrl?: string;
  channelThumbs: Array<{ title: string; thumb: string }>;
  mitvThumbs: Array<{ title: string; thumb: string }>;
  mitvChannelsCount: number;
  mitvItemsCount: number;
  musicThumbs: Array<{ title: string; thumb: string }>;
  musicCount: number;
  lecturas: Array<{ title: string; source: string; thumb?: string }>;
  lecturasCount: number;
  reelsAndSavedThumbs: Array<{ title: string; thumb: string }>;
  reelsAndSavedCount: number;
  signalsCount: number;
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 3500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / Math.max(1, img.height);
  const boxRatio = w / Math.max(1, h);
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function CompleteSignalShareCard({ data }: { data: CompleteSignalVisualData }) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const activePillars = useMemo(() => {
    const list: string[] = [];
    if (data.signalsCount > 0 || data.channelThumbs.length > 0) list.push('Mi Señal');
    if (data.mitvChannelsCount > 0 || data.mitvItemsCount > 0) list.push('MiTV');
    if (data.musicCount > 0) list.push('Música');
    if (data.lecturasCount > 0) list.push('Lecturas');
    if (data.reelsAndSavedCount > 0) list.push('Reels');
    return list.length > 0 ? list.join(' · ') : 'Mi Señal · MiTV · Música · Lecturas · Reels';
  }, [data]);

  const handleShareWhatsApp = () => {
    const url = buildYouAppFullSignalShareUrl(data.signalId);
    const parts: string[] = [];
    if (data.signalsCount > 0) parts.push(`${data.signalsCount} señales`);
    if (data.mitvItemsCount > 0) parts.push(`${data.mitvItemsCount} videos en MiTV`);
    if (data.musicCount > 0) parts.push(`${data.musicCount} temas musicales`);
    if (data.lecturasCount > 0) parts.push(`${data.lecturasCount} lecturas`);
    if (data.reelsAndSavedCount > 0) parts.push(`${data.reelsAndSavedCount} reels y guardados`);
    const summary = parts.length > 0 ? `\nIncluye ${parts.join(' · ')}.` : '';
    const msg = `📺 Te comparto mi universo «${data.signalName}» en YOUAPP (${activePillars}).${summary}\nAbrilo gratis acá:`;
    const href = buildWhatsAppShareHref(msg, url);
    window.open(href, '_blank', 'noopener,noreferrer');
    setNotice('Abriendo WhatsApp…');
    window.setTimeout(() => setNotice(null), 2600);
  };

  const handleDownloadCardPng = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-ctx');

      // Cargar fondo oficial de Mis Listas (mismo origen, 0 problemas CORS) + miniaturas reales
      const [bgPhoto, heroImg, mitvImg, musicImg, lecturaImg, reelsImg] = await Promise.all([
        loadCanvasImage('/my-lists-autumn-lake-bg.png'),
        loadCanvasImage(data.heroCoverUrl || data.channelThumbs[0]?.thumb || ''),
        loadCanvasImage(data.mitvThumbs[0]?.thumb || ''),
        loadCanvasImage(data.musicThumbs[0]?.thumb || ''),
        loadCanvasImage(data.lecturas[0]?.thumb || ''),
        loadCanvasImage(data.reelsAndSavedThumbs[0]?.thumb || '')
      ]);

      // Fondo: misma imagen difuminada de Mis Listas con velo de lectura Apple Glass
      if (bgPhoto) {
        ctx.save();
        ctx.filter = 'blur(12px) brightness(0.78) contrast(1.06) saturate(1.08)';
        drawCoverImage(ctx, bgPhoto, -24, -24, 1248, 678);
        ctx.restore();
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
        bgGrad.addColorStop(0, '#101622');
        bgGrad.addColorStop(0.55, '#19141b');
        bgGrad.addColorStop(1, '#0e131b');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1200, 630);
      }

      const veilGrad = ctx.createLinearGradient(0, 0, 0, 630);
      veilGrad.addColorStop(0, 'rgba(12, 14, 18, 0.34)');
      veilGrad.addColorStop(0.55, 'rgba(12, 14, 18, 0.42)');
      veilGrad.addColorStop(1, 'rgba(8, 10, 14, 0.68)');
      ctx.fillStyle = veilGrad;
      ctx.fillRect(0, 0, 1200, 630);

      // Panel de vidrio sutil contenedor (estilo Mis Listas)
      ctx.save();
      drawRoundedRect(ctx, 26, 22, 1148, 586, 30);
      ctx.fillStyle = 'rgba(14, 16, 22, 0.28)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      // Cabecera
      ctx.fillStyle = 'rgba(186,230,253,0.92)';
      ctx.font = '700 15px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('YOUAPP · MI SEÑAL COMPLETA', 54, 62);

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 38px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(data.signalName.slice(0, 34), 54, 110);

      ctx.fillStyle = 'rgba(245,245,247,0.82)';
      ctx.font = '500 18px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(activePillars, 54, 140);

      const boxes = [
        {
          x: 54,
          y: 170,
          w: 520,
          h: 365,
          label: 'MI SEÑAL',
          sub: data.channelThumbs[0]?.title || `${Math.max(1, data.signalsCount)} señales activas`,
          img: heroImg,
          accent: '#38bdf8'
        },
        {
          x: 594,
          y: 170,
          w: 266,
          h: 172,
          label: 'MITV',
          sub: data.mitvThumbs[0]?.title || `${data.mitvChannelsCount} canales`,
          img: mitvImg,
          accent: '#22d3ee'
        },
        {
          x: 880,
          y: 170,
          w: 266,
          h: 172,
          label: 'YOU MUSIC',
          sub: data.musicThumbs[0]?.title || `${data.musicCount} temas musicales`,
          img: musicImg,
          accent: '#c084fc'
        },
        {
          x: 594,
          y: 363,
          w: 266,
          h: 172,
          label: 'LECTURAS',
          sub: data.lecturas[0]?.source || data.lecturas[0]?.title || `${data.lecturasCount} lecturas`,
          img: lecturaImg,
          accent: '#fbbf24'
        },
        {
          x: 880,
          y: 363,
          w: 266,
          h: 172,
          label: 'REELS Y FAVORITOS',
          sub: `${data.reelsAndSavedCount} guardados`,
          img: reelsImg,
          accent: '#f472b6'
        }
      ];

      for (const b of boxes) {
        ctx.save();
        drawRoundedRect(ctx, b.x, b.y, b.w, b.h, 22);
        ctx.clip();

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(b.x, b.y, b.w, b.h);

        if (b.img) {
          drawCoverImage(ctx, b.img, b.x, b.y, b.w, b.h);
        }

        const scrim = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        scrim.addColorStop(0, 'rgba(8,10,16,0.18)');
        scrim.addColorStop(1, 'rgba(8,10,16,0.86)');
        ctx.fillStyle = scrim;
        ctx.fillRect(b.x, b.y, b.w, b.h);

        ctx.fillStyle = b.accent;
        ctx.font = '700 13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(b.label, b.x + 20, b.y + b.h - 42);

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 19px -apple-system, BlinkMacSystemFont, sans-serif';
        const maxChars = b.w > 400 ? 40 : 21;
        ctx.fillText(String(b.sub).slice(0, maxChars), b.x + 20, b.y + b.h - 18);

        ctx.restore();

        ctx.save();
        drawRoundedRect(ctx, b.x, b.y, b.w, b.h, 22);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Pie mínimo
      ctx.fillStyle = 'rgba(245,245,247,0.68)';
      ctx.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif';
      const footerStats = `${data.signalsCount} señales · ${data.mitvChannelsCount} canales MiTV · ${data.musicCount} música · ${data.lecturasCount} lecturas · ${data.reelsAndSavedCount} reels`;
      ctx.fillText(footerStats, 54, 582);

      ctx.fillStyle = '#64d2ff';
      ctx.font = '800 17px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('youapp.tv', 1146, 582);

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `youapp-senal-${data.signalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || 'completa'}.png`;
      a.click();
      setNotice('Tarjeta visual PNG descargada');
      window.setTimeout(() => setNotice(null), 2800);
    } catch {
      setNotice('No se pudo exportar la imagen en este navegador');
      window.setTimeout(() => setNotice(null), 2800);
    } finally {
      setExporting(false);
    }
  };

  const initial = (data.signalName.trim()[0] || 'Y').toUpperCase();
  const mainHeroThumb = data.heroCoverUrl || data.channelThumbs[0]?.thumb || '';

  return (
    <section className="csc-card" aria-label="Señal completa visual para compartir">
      {/* CABECERA MINIMALISTA */}
      <div className="csc-head">
        <div className="csc-identity">
          <div className="csc-avatar" aria-hidden="true">
            {data.avatarUrl ? (
              <img src={data.avatarUrl} alt={data.signalName} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="csc-title-col">
            <span className="csc-kicker">TU SEÑAL COMPLETA · VISTA PARA COMPARTIR</span>
            <h2>{data.signalName}</h2>
            <p>{activePillars}</p>
          </div>
        </div>

        <div className="csc-actions">
          <button
            type="button"
            className="csc-btn csc-btn-wa"
            onClick={handleShareWhatsApp}
            title="Compartir tu señal completa por WhatsApp"
          >
            <Share2 size={14} color="#25D366" />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            className="csc-btn"
            onClick={() => void handleDownloadCardPng()}
            disabled={exporting}
            title="Descargar tarjeta visual en PNG para WhatsApp o estados"
          >
            {notice === 'Tarjeta visual PNG descargada' ? <Check size={14} /> : <Download size={14} />}
            <span>{exporting ? 'Armando…' : 'Tarjeta PNG'}</span>
          </button>
        </div>
      </div>

      {/* MOSAICO BENTO COMPACTO DE 4 CÁPSULAS */}
      <div className="csc-bento">
        {/* 1. CANALES Y SEÑALES (BLOQUE PRINCIPAL) */}
        <button
          type="button"
          className="csc-tile csc-tile-hero"
          onClick={() => navigate('/misenal1')}
        >
          {mainHeroThumb && (
            <img src={mainHeroThumb} alt={data.signalName} className="csc-tile-bg" loading="lazy" />
          )}
          <div className="csc-tile-scrim" />
          <div className="csc-tile-top">
            <span className="csc-chip blue">
              <Radio size={11} /> Canales y TV
            </span>
          </div>
          <div className="csc-tile-bottom">
            {data.channelThumbs.length > 0 && (
              <div className="csc-mini-strip">
                {data.channelThumbs.slice(0, 3).map((item, idx) => (
                  <img
                    key={`${item.thumb}-${idx}`}
                    src={item.thumb}
                    alt={item.title}
                    className="csc-mini-thumb"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            <strong>{data.signalName}</strong>
            <span>
              {data.signalsCount > 0
                ? `${data.signalsCount} ${data.signalsCount === 1 ? 'señal' : 'señales'} · Abrir en vivo`
                : 'Armá tu grilla en Mi Señal'}
            </span>
          </div>
        </button>

        {/* 2. MITV */}
        <button
          type="button"
          className="csc-tile csc-tile-mitv"
          onClick={() => navigate('/mitv')}
        >
          {data.mitvThumbs[0]?.thumb && (
            <img src={data.mitvThumbs[0].thumb} alt="MiTV" className="csc-tile-bg" loading="lazy" />
          )}
          <div className="csc-tile-scrim" />
          <div className="csc-tile-top">
            <span className="csc-chip cyan">
              <Tv size={11} /> MiTV
            </span>
          </div>
          <div className="csc-tile-bottom">
            {data.mitvThumbs.length > 1 && (
              <div className="csc-mini-strip">
                {data.mitvThumbs.slice(0, 3).map((item, idx) => (
                  <img
                    key={`${item.thumb}-${idx}`}
                    src={item.thumb}
                    alt={item.title}
                    className="csc-mini-thumb"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            <strong>{data.mitvThumbs[0]?.title || 'MiTV Personal'}</strong>
            <span>
              {data.mitvItemsCount > 0
                ? `${data.mitvChannelsCount} ${data.mitvChannelsCount === 1 ? 'canal' : 'canales'} · ${data.mitvItemsCount} videos`
                : 'Programá tu grilla de TV'}
            </span>
          </div>
        </button>

        {/* 3. YOU MUSIC */}
        <button
          type="button"
          className="csc-tile csc-tile-music"
          onClick={() => navigate('/youmusic')}
        >
          {data.musicThumbs[0]?.thumb && (
            <img src={data.musicThumbs[0].thumb} alt="YOU MUSIC" className="csc-tile-bg" loading="lazy" />
          )}
          <div className="csc-tile-scrim" />
          <div className="csc-tile-top">
            <span className="csc-chip purple">
              <Music size={11} /> Música
            </span>
          </div>
          <div className="csc-tile-bottom">
            {data.musicThumbs.length > 1 && (
              <div className="csc-mini-strip">
                {data.musicThumbs.slice(0, 3).map((item, idx) => (
                  <img
                    key={`${item.thumb}-${idx}`}
                    src={item.thumb}
                    alt={item.title}
                    className="csc-mini-square"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            <strong>{data.musicThumbs[0]?.title || 'YOU MUSIC'}</strong>
            <span>
              {data.musicCount > 0
                ? `${data.musicCount} ${data.musicCount === 1 ? 'tema' : 'temas'} en tus listas`
                : 'Sumá tus canciones y artistas'}
            </span>
          </div>
        </button>

        {/* 3. LECTURAS */}
        <button
          type="button"
          className="csc-tile csc-tile-lecturas"
          onClick={() => navigate('/lecturas')}
        >
          {data.lecturas[0]?.thumb && (
            <img src={data.lecturas[0].thumb} alt="Lecturas" className="csc-tile-bg" loading="lazy" />
          )}
          <div className="csc-tile-scrim" />
          <div className="csc-tile-top">
            <span className="csc-chip amber">
              <BookOpen size={11} /> Lecturas
            </span>
          </div>
          <div className="csc-tile-bottom">
            <strong>{data.lecturas[0]?.title || 'Tus lecturas y diarios'}</strong>
            <span>
              {data.lecturasCount > 0
                ? `${data.lecturas[0]?.source || 'Guardados'} · ${data.lecturasCount} notas`
                : 'Guardá artículos y diarios'}
            </span>
          </div>
        </button>

        {/* 4. REELS Y FAVORITOS */}
        <button
          type="button"
          className="csc-tile csc-tile-reels"
          onClick={() => navigate('/reels')}
        >
          {data.reelsAndSavedThumbs[0]?.thumb && (
            <img
              src={data.reelsAndSavedThumbs[0].thumb}
              alt="Reels y Favoritos"
              className="csc-tile-bg"
              loading="lazy"
            />
          )}
          <div className="csc-tile-scrim" />
          <div className="csc-tile-top">
            <span className="csc-chip pink">
              <Film size={11} /> Reels y Favoritos
            </span>
          </div>
          <div className="csc-tile-bottom">
            {data.reelsAndSavedThumbs.length > 1 && (
              <div className="csc-mini-strip">
                {data.reelsAndSavedThumbs.slice(0, 3).map((item, idx) => (
                  <img
                    key={`${item.thumb}-${idx}`}
                    src={item.thumb}
                    alt={item.title}
                    className="csc-mini-square"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            <strong>{data.reelsAndSavedThumbs[0]?.title || 'Reels y Guardados'}</strong>
            <span>
              {data.reelsAndSavedCount > 0
                ? `${data.reelsAndSavedCount} piezas guardadas`
                : 'Explorá Shorts y favoritos'}
            </span>
          </div>
        </button>
      </div>

      {/* PIE MINIMALISTA */}
      <div className="csc-foot">
        <span className="csc-stats">
          <Tv size={12} /> {data.signalsCount} señales · {data.mitvChannelsCount} canales MiTV · {data.musicCount} música ·{' '}
          {data.lecturasCount} lecturas · {data.reelsAndSavedCount} reels y guardados
        </span>
        <span className="csc-brand-mark">{notice || 'YOUAPP · COMPARTIBLE'}</span>
      </div>

      <style>{`
        .csc-card {
          position: relative;
          border-radius: 26px;
          padding: 20px 22px 16px;
          background: rgba(255, 255, 255, 0.045);
          backdrop-filter: blur(22px) saturate(145%);
          -webkit-backdrop-filter: blur(22px) saturate(145%);
          box-shadow: 0 22px 48px rgba(0, 0, 0, 0.34);
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow: hidden;
        }
        .csc-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 2px;
          background:
            radial-gradient(240px circle at 0% 0%, rgba(255,255,255,0.92), transparent 56%),
            radial-gradient(200px circle at 100% 0%, rgba(160,224,255,0.72), transparent 56%),
            radial-gradient(200px circle at 0% 100%, rgba(255,255,255,0.42), transparent 56%),
            radial-gradient(240px circle at 100% 100%, rgba(255,255,255,0.82), transparent 56%),
            linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .csc-card > * { position: relative; z-index: 1; }

        .csc-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .csc-identity {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }
        .csc-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          overflow: hidden;
          border: 1.5px solid rgba(255, 255, 255, 0.35);
          background: linear-gradient(135deg, rgba(0, 113, 227, 0.45), rgba(100, 210, 255, 0.25));
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
          color: #ffffff;
          flex-shrink: 0;
        }
        .csc-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .csc-title-col { min-width: 0; }
        .csc-kicker {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: rgba(125, 211, 252, 0.9);
          margin-bottom: 2px;
        }
        .csc-title-col h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .csc-title-col p {
          margin: 2px 0 0;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }

        .csc-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .csc-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
        }
        .csc-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.16);
          transform: translateY(-1px);
        }
        .csc-btn:disabled { opacity: 0.6; cursor: wait; }
        .csc-btn-wa {
          border-color: rgba(37, 211, 102, 0.48);
          background: rgba(37, 211, 102, 0.14);
          color: #b2f7cb;
        }
        .csc-btn-wa:hover {
          background: rgba(37, 211, 102, 0.24) !important;
          border-color: rgba(37, 211, 102, 0.75);
        }

        .csc-bento {
          display: grid;
          grid-template-columns: 1.25fr 1fr 1fr;
          grid-template-rows: 138px 138px;
          gap: 11px;
        }
        .csc-tile {
          position: relative;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.09), rgba(14, 18, 28, 0.45));
          overflow: hidden;
          padding: 12px 14px;
          text-align: left;
          color: #ffffff;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .csc-tile:hover {
          transform: translateY(-2px);
          border-color: rgba(125, 211, 252, 0.55);
        }
        .csc-tile-hero {
          grid-column: 1 / 2;
          grid-row: 1 / 3;
        }
        .csc-tile-mitv {
          grid-column: 2 / 3;
          grid-row: 1 / 2;
        }
        .csc-tile-music {
          grid-column: 3 / 4;
          grid-row: 1 / 2;
        }
        .csc-tile-lecturas {
          grid-column: 2 / 3;
          grid-row: 2 / 3;
        }
        .csc-tile-reels {
          grid-column: 3 / 4;
          grid-row: 2 / 3;
        }

        .csc-tile-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        .csc-tile:hover .csc-tile-bg { transform: scale(1.05); }
        .csc-tile-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(8, 10, 16, 0.22) 0%,
            rgba(8, 10, 16, 0.5) 45%,
            rgba(8, 10, 16, 0.88) 100%
          );
        }
        .csc-tile-top,
        .csc-tile-bottom {
          position: relative;
          z-index: 1;
        }
        .csc-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .csc-chip.blue { background: rgba(0, 113, 227, 0.38); color: #bae6fd; }
        .csc-chip.cyan { background: rgba(6, 182, 212, 0.38); color: #a5f3fc; }
        .csc-chip.purple { background: rgba(139, 92, 246, 0.38); color: #e9d5ff; }
        .csc-chip.amber { background: rgba(245, 158, 11, 0.34); color: #fde68a; }
        .csc-chip.pink { background: rgba(236, 72, 153, 0.36); color: #fbcfe8; }

        .csc-tile-bottom {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .csc-tile-bottom strong {
          font-size: 14px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .csc-tile-bottom span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.78);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .csc-mini-strip {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 5px;
        }
        .csc-mini-thumb {
          width: 52px;
          height: 30px;
          border-radius: 7px;
          object-fit: cover;
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
        }
        .csc-mini-square {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
        }

        .csc-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding-top: 2px;
          font-size: 11px;
          color: rgba(245, 245, 247, 0.68);
        }
        .csc-stats {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .csc-brand-mark {
          font-weight: 700;
          letter-spacing: 0.12em;
          color: rgba(125, 211, 252, 0.85);
          text-transform: uppercase;
          font-size: 10px;
        }

        @media (max-width: 760px) {
          .csc-bento {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 170px 132px 132px;
          }
          .csc-tile-hero { grid-column: 1 / 3; grid-row: 1 / 2; }
          .csc-tile-mitv { grid-column: 1 / 2; grid-row: 2 / 3; }
          .csc-tile-music { grid-column: 2 / 3; grid-row: 2 / 3; }
          .csc-tile-lecturas { grid-column: 1 / 2; grid-row: 3 / 4; }
          .csc-tile-reels { grid-column: 2 / 3; grid-row: 3 / 4; }
        }
      `}</style>
    </section>
  );
}
