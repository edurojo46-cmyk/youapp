import React, { useMemo, useState } from 'react';
import { BarChart3, Check, Copy, Download, QrCode, Share2, Sparkles, X } from 'lucide-react';
import {
  AUDIENCE_SOURCES,
  readBridgeMetrics,
  type AudienceSourceKey
} from '../../lib/tv/audienceBridgeStore';

interface SignalInviteFollowersModalProps {
  isOpen: boolean;
  onClose: () => void;
  signalId: string;
  signalName: string;
  channelCount: number;
  featuredVideoId?: string;
  featuredVideoTitle?: string;
}

export const SignalInviteFollowersModal: React.FC<SignalInviteFollowersModalProps> = ({
  isOpen,
  onClose,
  signalId,
  signalName,
  channelCount,
  featuredVideoId,
  featuredVideoTitle
}) => {
  const [activeTab, setActiveTab] = useState<'share' | 'metrics'>('share');
  const [selectedSource, setSelectedSource] = useState<AudienceSourceKey>('instagram');
  const [linkToCurrentVideo, setLinkToCurrentVideo] = useState<boolean>(Boolean(featuredVideoId));
  const [copied, setCopied] = useState(false);
  const [copiedPromo, setCopiedPromo] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const inviteUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://youapp.tv';
    const srcParam = selectedSource !== 'direct' ? `&src=${encodeURIComponent(selectedSource)}` : '';
    const vParam =
      linkToCurrentVideo && featuredVideoId ? `&v=${encodeURIComponent(featuredVideoId)}` : '';
    return `${origin}/misenal1?signal=${encodeURIComponent(signalId)}&sharedSignal=1&follow=1${srcParam}${vParam}`;
  }, [signalId, selectedSource, linkToCurrentVideo, featuredVideoId]);

  const metrics = isOpen ? readBridgeMetrics(signalId) : null;

  const qrImageUrl = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&bgcolor=ffffff&color=0f172a&data=${encodeURIComponent(inviteUrl)}`,
    [inviteUrl]
  );

  if (!isOpen) return null;

  const shareMessage = `Toda mi programación, mis videos seleccionados y las novedades que recomiendo están ahora en «${signalName}» en YOUAPP. Entrá sin registro y seguime gratis: ${inviteUrl}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // ignore
    }
  };

  const handleCopyPromo = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedPromo(true);
      window.setTimeout(() => setCopiedPromo(false), 2400);
    } catch {
      // ignore
    }
  };

  // Genera una tarjeta vertical 9:16 (1080x1920) estilo TikCode lista para Stories / Estados / Reels
  const handleDownloadStoryCard = async () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Fondo Apple Glass oscuro con gradientes atmosféricos
      const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
      bg.addColorStop(0, '#0c111b');
      bg.addColorStop(0.5, '#132238');
      bg.addColorStop(1, '#090c12');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1080, 1920);

      const glow = ctx.createRadialGradient(540, 620, 60, 540, 620, 580);
      glow.addColorStop(0, 'rgba(10, 132, 255, 0.38)');
      glow.addColorStop(1, 'rgba(10, 132, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1080, 1920);

      // Marca superior
      ctx.fillStyle = '#64d2ff';
      ctx.font = '700 34px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('YOUAPP TV · MI SEÑAL', 540, 220);

      // Nombre de la señal
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 68px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      const displayName = signalName.length > 26 ? `${signalName.slice(0, 25)}…` : signalName;
      ctx.fillText(displayName, 540, 340);

      ctx.fillStyle = 'rgba(245, 245, 247, 0.78)';
      ctx.font = '500 32px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      const subLine =
        linkToCurrentVideo && featuredVideoTitle
          ? `Destacado: ${featuredVideoTitle.slice(0, 40)}${featuredVideoTitle.length > 40 ? '…' : ''}`
          : 'Escaneá el QR o tocá el enlace en mi bio';
      ctx.fillText(subLine, 540, 415);

      // Tarjeta blanca central para el QR
      const cardX = 240;
      const cardY = 520;
      const cardSize = 600;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardSize, cardSize, 48);
      ctx.fill();

      // Cargar QR con crossOrigin anonymous
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, cardX + 45, cardY + 45, cardSize - 90, cardSize - 90);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = qrImageUrl;
      });

      // CTA inferior
      ctx.fillStyle = '#64d2ff';
      ctx.font = '700 40px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      ctx.fillText('Seguime en YOUAPP en 1 clic', 540, 1260);

      ctx.fillStyle = 'rgba(245, 245, 247, 0.72)';
      ctx.font = '500 28px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      ctx.fillText(`${channelCount} canales · Programación en vivo y a la carta`, 540, 1325);

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `youapp-invitar-${signalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'mi-senal'}.png`;
      a.click();
    } catch {
      window.open(qrImageUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="sif-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Invitar seguidores desde otras redes"
      onClick={onClose}
    >
      <div className="sif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sif-head">
          <div className="sif-head-title">
            <QrCode size={18} color="#64d2ff" />
            <div>
              <strong>Invitar seguidores desde tus redes</strong>
              <span>TikTok · Instagram · Facebook · YouTube · WhatsApp</span>
            </div>
          </div>
          <button type="button" className="sif-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="sif-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'share'}
            className={`sif-tab ${activeTab === 'share' ? 'active' : ''}`}
            onClick={() => setActiveTab('share')}
          >
            <QrCode size={13} />
            <span>Enlaces por red y QR</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'metrics'}
            className={`sif-tab ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <BarChart3 size={13} />
            <span>ATLAS Bridge · Métricas</span>
          </button>
        </div>

        {activeTab === 'metrics' && metrics ? (
          <div className="sif-body">
            <div className="sif-kpi-grid four">
              <div className="sif-kpi-card">
                <strong>{metrics.totalVisits > 0 ? metrics.totalVisits : '—'}</strong>
                <span>Visitas</span>
              </div>
              <div className="sif-kpi-card">
                <strong>{metrics.totalFollows > 0 ? metrics.totalFollows : '—'}</strong>
                <span>Seguidores</span>
              </div>
              <div className="sif-kpi-card">
                <strong>{metrics.conversionPct !== null ? `${metrics.conversionPct}%` : '—'}</strong>
                <span>Conversión</span>
              </div>
              <div className="sif-kpi-card">
                <strong>{metrics.totalReturns > 0 ? metrics.totalReturns : '—'}</strong>
                <span>Retornos</span>
              </div>
            </div>

            <div className="sif-sources-list">
              <div className="sif-sources-head">Procedencia de los visitantes</div>
              {metrics.sources.map((s) => {
                const barPct =
                  metrics.maxSourceVisits > 0
                    ? Math.max(4, Math.round((s.visits / metrics.maxSourceVisits) * 100))
                    : 0;
                return (
                  <div key={s.key} className="sif-source-item">
                    <div className="sif-source-row">
                      <span>{s.label}</span>
                      <em>
                        {s.visits > 0
                          ? `${s.visits} ${s.visits === 1 ? 'visita' : 'visitas'} · ${s.follows} ${s.follows === 1 ? 'seguidor' : 'seguidores'}`
                          : 'Sin datos'}
                      </em>
                    </div>
                    {s.visits > 0 && (
                      <div className="sif-bar-track">
                        <div className="sif-bar-fill" style={{ width: `${barPct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="sif-metrics-note">
              Métricas reales registradas desde tus enlaces etiquetados (?src=...). Los visitantes ven tu contenido sin registrarse; recién al tocar «Seguir» se les pide iniciar sesión.
            </p>
          </div>
        ) : (
        <div className="sif-body">
          {featuredVideoId && (
            <label className="sif-deep-toggle">
              <input
                type="checkbox"
                checked={linkToCurrentVideo}
                onChange={(e) => setLinkToCurrentVideo(e.target.checked)}
              />
              <span>
                Abrir directo en el video actual
                {featuredVideoTitle ? `: «${featuredVideoTitle.slice(0, 44)}${featuredVideoTitle.length > 44 ? '…' : ''}»` : ''}
              </span>
            </label>
          )}
          <div className="sif-src-picker">
            <label>Elegí en qué red vas a publicar este enlace (para medir visitas):</label>
            <div className="sif-src-chips">
              {AUDIENCE_SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`sif-src-chip ${selectedSource === s.key ? 'active' : ''}`}
                  onClick={() => setSelectedSource(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sif-qr-box">
            <img src={qrImageUrl} alt={`QR para seguir a ${signalName} en YOUAPP`} />
            <div className="sif-qr-meta">
              <span className="sif-eyebrow">
                <Sparkles size={11} /> TARJETA PARA BIO / STORIES
              </span>
              <h3>{signalName}</h3>
              <p>
                Pegá este enlace en tu bio o descargá la tarjeta vertical 9:16 con tu QR para subir a Historias, Estados de WhatsApp o al cierre de tus Reels/TikToks.
              </p>
              <button
                type="button"
                className="sif-primary-btn"
                onClick={() => void handleDownloadStoryCard()}
                disabled={downloading}
              >
                <Download size={14} />
                <span>{downloading ? 'Generando tarjeta…' : 'Descargar tarjeta 9:16 + QR'}</span>
              </button>
            </div>
          </div>

          <div className="sif-link-box">
            <label>Enlace directo de seguimiento (para tu bio)</label>
            <div className="sif-link-row">
              <input type="text" readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="sif-copy-btn" onClick={() => void handleCopyLink()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="sif-social-row">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sif-social-btn wa"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sif-social-btn fb"
            >
              Facebook
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sif-social-btn x"
            >
              X (Twitter)
            </a>
            <button type="button" className="sif-social-btn native" onClick={() => void handleCopyPromo()}>
              {copiedPromo ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copiedPromo ? 'Texto copiado' : 'Copiar texto'}</span>
            </button>
          </div>
        </div>
        )}
      </div>

      <style>{`
        .sif-backdrop {
          position: fixed;
          inset: 0;
          z-index: 150;
          background: rgba(10, 12, 16, 0.76);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .sif-modal {
          width: 100%;
          max-width: 580px;
          border-radius: 24px;
          background: rgba(20, 24, 32, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
          color: #f5f5f7;
          overflow: hidden;
        }
        .sif-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
        }
        .sif-head-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sif-head-title strong {
          display: block;
          font-size: 15px;
          color: #ffffff;
        }
        .sif-head-title span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
        }
        .sif-close {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .sif-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sif-qr-box {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .sif-qr-box img {
          width: 146px;
          height: 146px;
          border-radius: 14px;
          background: #ffffff;
          padding: 6px;
          flex-shrink: 0;
        }
        .sif-qr-meta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .sif-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.06em;
          color: #64d2ff;
        }
        .sif-qr-meta h3 {
          margin: 0;
          font-size: 17px;
          color: #ffffff;
        }
        .sif-qr-meta p {
          margin: 0;
          font-size: 12px;
          line-height: 1.42;
          color: rgba(245, 245, 247, 0.76);
        }
        .sif-primary-btn {
          margin-top: 4px;
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .sif-primary-btn:hover:not(:disabled) {
          background: #0a84ff;
        }
        .sif-link-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sif-link-box label {
          font-size: 11.5px;
          font-weight: 650;
          color: rgba(245, 245, 247, 0.78);
        }
        .sif-link-row {
          display: flex;
          gap: 8px;
          padding: 5px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .sif-link-row input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: #d9f3ff;
          font-size: 12px;
          padding: 6px 10px;
          outline: none;
        }
        .sif-copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 10px;
          border: none;
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .sif-copy-btn:hover {
          background: #0071e3;
        }
        .sif-social-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .sif-social-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 9px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.10);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          text-decoration: none;
          cursor: pointer;
        }
        .sif-social-btn.wa {
          background: rgba(37, 211, 102, 0.22);
          border-color: rgba(37, 211, 102, 0.45);
        }
        .sif-social-btn.fb {
          background: rgba(24, 119, 242, 0.24);
          border-color: rgba(24, 119, 242, 0.5);
        }
        .sif-social-btn.x {
          background: rgba(255, 255, 255, 0.14);
        }
        .sif-social-btn:hover {
          filter: brightness(1.15);
        }
        @media (max-width: 560px) {
          .sif-qr-box {
            flex-direction: column;
            text-align: center;
          }
          .sif-primary-btn {
            align-self: center;
          }
          .sif-social-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .sif-tabs {
          display: flex;
          gap: 6px;
          padding: 10px 20px 0;
        }
        .sif-tab {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(245, 245, 247, 0.78);
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .sif-tab.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .sif-src-picker {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sif-src-picker label {
          font-size: 11.5px;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.78);
        }
        .sif-src-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .sif-src-chip {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.85);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .sif-src-chip.active {
          background: rgba(10, 132, 255, 0.34);
          border-color: #64d2ff;
          color: #ffffff;
        }
        .sif-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .sif-kpi-grid.four {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .sif-deep-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 12px;
          background: rgba(10, 132, 255, 0.14);
          border: 1px solid rgba(100, 210, 255, 0.34);
          font-size: 12px;
          color: #d9f3ff;
          cursor: pointer;
        }
        .sif-source-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sif-bar-track {
          width: 100%;
          height: 5px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .sif-bar-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #0071e3, #64d2ff);
        }
        .sif-kpi-card {
          padding: 14px 12px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .sif-kpi-card strong {
          font-family: var(--you-font-display, 'Space Grotesk', 'Geist', sans-serif);
          font-variant-numeric: tabular-nums;
          font-size: 22px;
          font-weight: 760;
          color: #64d2ff;
        }
        .sif-kpi-card span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.72);
        }
        .sif-sources-list {
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sif-sources-head {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: rgba(245, 245, 247, 0.65);
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .sif-source-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          color: #ffffff;
        }
        .sif-source-row em {
          font-style: normal;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.66);
        }
        .sif-metrics-note {
          margin: 0;
          font-size: 11.5px;
          line-height: 1.45;
          color: rgba(245, 245, 247, 0.65);
        }
      `}</style>
    </div>
  );
};
