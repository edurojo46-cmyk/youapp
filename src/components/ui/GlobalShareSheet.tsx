import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  QrCode,
  Send,
  Share2,
  Smartphone,
  Sparkles,
  X
} from 'lucide-react';
import { YouAppOfficialLogo } from './YouAppOfficialLogo';
import { encodeAnimatedGif } from '../../lib/share/gifEncoder';

export interface ShareSheetPayload {
  title: string;
  text: string;
  url: string;
  thumbnailUrl?: string;
  subtitle?: string;
  badge?: string;
}

const SHARE_SHEET_EVENT = 'youapp:open-share-sheet';
const DYNAMIC_OG_SHARE_BASE = 'https://fancy-snow-28a0youapp-share.edurojo46.workers.dev/';
let pendingPayload: ShareSheetPayload | null = null;

function extractYtIdFromThumbOrUrl(thumb?: string, url?: string): string | null {
  const thumbMatch = thumb?.match(/\/vi\/([A-Za-z0-9_-]{11})\//);
  if (thumbMatch?.[1]) return thumbMatch[1];
  const urlMatch = url?.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (urlMatch?.[1]) return urlMatch[1];
  return null;
}

/**
 * Construye el enlace dinámico con Open Graph real (Cloudflare Worker text/html)
 * para que WhatsApp, Telegram y X muestren la miniatura y el título exactos del video/señal
 * y al tocarlo abran directo youapptv.com.
 */
function buildDynamicPreviewShareUrl(payload: ShareSheetPayload): string {
  try {
    const parsed = new URL(payload.url);
    const isYouAppHost =
      parsed.hostname === 'youapptv.com' ||
      parsed.hostname === 'www.youapptv.com' ||
      parsed.hostname === 'youapp.tv';
    if (!isYouAppHost) return payload.url;

    const ytId = extractYtIdFromThumbOrUrl(payload.thumbnailUrl, payload.url);
    // Enlace ultra-corto y limpio (/v/<ID>, /m/<ID>, /y/<ID>) sin choclo de parámetros
    if (ytId) {
      const mode = parsed.pathname.startsWith('/mitv') || parsed.pathname.startsWith('/misenal1')
        ? 'm'
        : parsed.pathname.startsWith('/youmusic')
        ? 'y'
        : 'v';
      return `${DYNAMIC_OG_SHARE_BASE}${mode}/${ytId}`;
    }

    const sp = new URLSearchParams();
    sp.set('to', payload.url);
    const cleanTitle = payload.title.replace(/\s*·\s*(YOUAPP TV|YOUAPP|YOU MUSIC)\s*$/i, '').trim();
    if (cleanTitle) sp.set('t', `${cleanTitle.slice(0, 95)} · YOUAPP TV`);
    const desc = payload.subtitle
      ? `${payload.subtitle.slice(0, 70)} · Miralo gratis en YOUAPP TV`
      : 'Miralo gratis en YOUAPP TV';
    sp.set('d', desc);
    if (payload.thumbnailUrl && /^https?:\/\//i.test(payload.thumbnailUrl)) {
      sp.set('img', payload.thumbnailUrl);
    }
    return `${DYNAMIC_OG_SHARE_BASE}?${sp.toString()}`;
  } catch {
    return payload.url;
  }
}

/**
 * Abre siempre la Tarjeta Moderna de Compartir YOUAPP (Liquid Glass)
 * con vista previa visual, WhatsApp, Telegram, X, QR, descarga de Tarjeta PNG
 * y botón "Más apps" conectado al diálogo nativo del teléfono / APK.
 */
export async function shareContentUniversal(payload: ShareSheetPayload): Promise<void> {
  pendingPayload = payload;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SHARE_SHEET_EVENT));
  }
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:\s]+$/, '')}…`;
  }
  return lines;
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

async function drawStoryCardFrame(
  ctx: CanvasRenderingContext2D,
  payload: ShareSheetPayload,
  loadedImg: HTMLImageElement | null,
  progress: number
): Promise<void> {
  const W = 1080;
  const H = 1350;

  // 1. Fondo degradado Apple oscuro con brillo dinámico
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0a0f1d');
  bgGrad.addColorStop(0.5, '#111827');
  bgGrad.addColorStop(1, '#070b14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const shiftX = Math.sin(progress * Math.PI * 2) * 70;
  const glow1 = ctx.createRadialGradient(W * 0.25 + shiftX, H * 0.2, 40, W * 0.25 + shiftX, H * 0.2, 520);
  glow1.addColorStop(0, 'rgba(56, 189, 248, 0.3)');
  glow1.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.8 - shiftX, H * 0.82, 40, W * 0.8 - shiftX, H * 0.82, 520);
  glow2.addColorStop(0, 'rgba(139, 92, 246, 0.26)');
  glow2.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // 2. Tarjeta central glaseada
  const cardX = 76;
  const cardY = 120;
  const cardW = W - 152;
  const cardH = H - 240;

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.stroke();
  ctx.restore();

  // 3. Badge superior
  const badgeText = (payload.badge || 'YOUAPP TV').toUpperCase();
  ctx.font = '700 28px system-ui, -apple-system, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 56;
  drawRoundedRect(ctx, cardX + 52, cardY + 52, badgeW, 54, 27);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText(badgeText, cardX + 80, cardY + 89);

  // 4. Miniatura 16:9 con movimiento suave (Ken Burns zoom + paneo)
  const thumbX = cardX + 52;
  const thumbY = cardY + 140;
  const thumbW = cardW - 104;
  const thumbH = Math.round((thumbW * 9) / 16);

  ctx.save();
  drawRoundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 30);
  ctx.clip();
  const thumbGrad = ctx.createLinearGradient(thumbX, thumbY, thumbX + thumbW, thumbY + thumbH);
  thumbGrad.addColorStop(0, '#1e293b');
  thumbGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = thumbGrad;
  ctx.fillRect(thumbX, thumbY, thumbW, thumbH);

  if (loadedImg) {
    const zoom = 1.0 + progress * 0.14;
    const baseScale = Math.max(thumbW / loadedImg.width, thumbH / loadedImg.height) * zoom;
    const dw = loadedImg.width * baseScale;
    const dh = loadedImg.height * baseScale;
    const panX = (progress - 0.5) * 32;
    ctx.drawImage(loadedImg, thumbX + (thumbW - dw) / 2 - panX, thumbY + (thumbH - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.font = '800 72px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOUAPP TV', thumbX + thumbW / 2, thumbY + thumbH / 2 + 24);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // 5. Título y subtítulo
  const cleanTitle = payload.title.replace(/\s*·\s*(YOUAPP TV|YOUAPP|YOU MUSIC)\s*$/i, '').trim();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 50px system-ui, -apple-system, sans-serif';
  const titleLines = wrapCanvasText(ctx, cleanTitle || 'Mi Señal en YOUAPP', thumbW, 3);
  let textY = thumbY + thumbH + 86;
  for (const line of titleLines) {
    ctx.fillText(line, thumbX, textY);
    textY += 64;
  }

  if (payload.subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(payload.subtitle.slice(0, 48), thumbX, textY + 12);
  }

  // 6. Pie de marca
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(thumbX, cardY + cardH - 130, thumbW, 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 36px system-ui, -apple-system, sans-serif';
  ctx.fillText('YOUAPP TV', thumbX, cardY + cardH - 64);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 30px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('youapptv.com', thumbX + thumbW, cardY + cardH - 64);
  ctx.textAlign = 'left';
}

async function loadThumbImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
  } catch {
    return null;
  }
}

async function generateStoryCardBlob(payload: ShareSheetPayload): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = await loadThumbImage(payload.thumbnailUrl);
  await drawStoryCardFrame(ctx, payload, img, 0.35);
  return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

async function generateAnimatedGifBlob(payload: ShareSheetPayload): Promise<Blob | null> {
  const gw = 480;
  const gh = 270;
  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const img = await loadThumbImage(payload.thumbnailUrl);
  const frames: Uint8ClampedArray[] = [];
  // Solo la foto a pantalla completa con zoom cinematográfico suave de lejos (1.00x) a cerca (1.26x)
  const totalFrames = 16;
  for (let i = 0; i < totalFrames; i += 1) {
    const t = i / (totalFrames - 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, gw, gh);

    if (img) {
      const zoom = 1.0 + eased * 0.26;
      const scale = Math.max(gw / img.width, gh / img.height) * zoom;
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (gw - dw) / 2, (gh - dh) / 2, dw, dh);
    } else {
      const grad = ctx.createLinearGradient(0, 0, gw, gh);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, gw, gh);
    }
    frames.push(ctx.getImageData(0, 0, gw, gh).data);
  }
  return encodeAnimatedGif(gw, gh, frames, 11);
}

export const GlobalShareSheet: React.FC = () => {
  const [payload, setPayload] = useState<ShareSheetPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [savingGif, setSavingGif] = useState(false);
  const [readyGifFile, setReadyGifFile] = useState<File | null>(null);
  const [cardNotice, setCardNotice] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setPayload(pendingPayload);
      setCopied(false);
      setShowQr(false);
      setReadyGifFile(null);
      setCardNotice(null);
    };
    window.addEventListener(SHARE_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(SHARE_SHEET_EVENT, onOpen);
  }, []);

  if (!payload) return null;

  const cleanTitle = payload.title.replace(/\s*·\s*(YOUAPP TV|YOUAPP|YOU MUSIC)\s*$/i, '').trim();
  const isAndroidWebView =
    typeof window !== 'undefined' &&
    (Boolean((window as unknown as { YouAppAndroidPiP?: unknown }).YouAppAndroidPiP) ||
      /;\s*wv\)/i.test(navigator.userAgent || ''));
  const richShareUrl = buildDynamicPreviewShareUrl(payload);
  const isMusicShare =
    payload.url.includes('/youmusic') || (payload.badge || '').toUpperCase().includes('MUSICAL');
  const waMessage = isMusicShare ? `Tu señal musical\n${richShareUrl}` : richShareUrl;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(richShareUrl)}&text=${encodeURIComponent(payload.text)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.text)}&url=${encodeURIComponent(richShareUrl)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(payload.url)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(richShareUrl);
    } catch {
      // ignore
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const handleNativeMore = async () => {
    const androidBridge = (window as unknown as {
      YouAppAndroidPiP?: { share?: (t: string, body: string, u: string) => void };
    }).YouAppAndroidPiP;
    if (androidBridge && typeof androidBridge.share === 'function') {
      try {
        androidBridge.share(payload.title, payload.text, richShareUrl);
        setPayload(null);
        return;
      } catch {
        // fallback
      }
    }
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          url: richShareUrl
        });
        setPayload(null);
        return;
      }
    } catch {
      // ignore cancel
    }
    await handleCopy();
  };

  const handleDownloadStoryCard = async () => {
    setSavingCard(true);
    setCardNotice(null);
    try {
      const blob = await generateStoryCardBlob(payload);
      if (!blob) throw new Error('canvas');
      const file = new File([blob], 'youapp-senal.png', { type: 'image/png' });

      // Si el celular soporta compartir archivo PNG directo a WhatsApp/Instagram Stories
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        try {
          await navigator.share({
            files: [file],
            title: payload.title,
            text: `${payload.text} ${payload.url}`
          });
          setSavingCard(false);
          return;
        } catch {
          // fallback a descarga PNG
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'youapp-tarjeta.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      setCardNotice('✓ Tarjeta PNG descargada lista para tus Historias.');
    } catch {
      setCardNotice('No se pudo generar la imagen en este dispositivo.');
    } finally {
      setSavingCard(false);
    }
  };

  const sharePreparedGifFile = async (file: File) => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          files: [file],
          title: payload.title,
          text: richShareUrl
        });
        setReadyGifFile(null);
        return true;
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return true;
    }
    return false;
  };

  const handleShareAnimatedGif = async () => {
    if (readyGifFile) {
      const sent = await sharePreparedGifFile(readyGifFile);
      if (!sent) {
        const blobUrl = URL.createObjectURL(readyGifFile);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = readyGifFile.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        setCardNotice('✓ GIF animado guardado en Descargas para adjuntar en WhatsApp.');
        setReadyGifFile(null);
      }
      return;
    }

    setSavingGif(true);
    setCardNotice(null);
    try {
      const blob = await generateAnimatedGifBlob(payload);
      if (!blob) throw new Error('gif');
      const file = new File([blob], 'youapp-tarjeta.gif', { type: 'image/gif' });
      const sentNow = await sharePreparedGifFile(file);
      if (!sentNow) {
        setReadyGifFile(file);
        setCardNotice('✓ GIF listo: tocá «Enviar GIF ahora» para elegir WhatsApp.');
      }
    } catch {
      setCardNotice('No se pudo generar el GIF en este dispositivo.');
    } finally {
      setSavingGif(false);
    }
  };

  return (
    <div
      className="ya-share-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Compartir desde YOUAPP"
      onClick={() => setPayload(null)}
    >
      <div className="ya-share-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ya-share-handle" aria-hidden="true" />

        <div className="ya-share-head">
          <div className="ya-share-head-title">
            <Share2 size={15} color="#7dd3fc" />
            <span>Compartir</span>
          </div>
          <button
            type="button"
            className="ya-share-close"
            onClick={() => setPayload(null)}
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>

        {/* TARJETA VISUAL GLASEADA (ESTILO APPLE TV / SPOTIFY) */}
        <div className="ya-share-card">
          {payload.thumbnailUrl && (
            <div
              className="ya-share-card-ambient"
              style={{ backgroundImage: `url(${payload.thumbnailUrl})` }}
              aria-hidden="true"
            />
          )}
          <div className="ya-share-card-inner">
            <div className="ya-share-card-top">
              <YouAppOfficialLogo size="sm" theme="dark" />
              <span className="ya-share-badge">{payload.badge || 'YOUAPP TV'}</span>
            </div>

            {showQr ? (
              <div className="ya-share-qr-box">
                <img src={qrSrc} alt="Código QR para abrir en otro dispositivo" />
                <span>Escaneá con la cámara para abrir al instante</span>
              </div>
            ) : (
              <div className="ya-share-card-media-row">
                {payload.thumbnailUrl && (
                  <div className="ya-share-thumb-frame">
                    <img
                      src={payload.thumbnailUrl}
                      alt=""
                      className="ya-share-thumb"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="ya-share-card-meta">
                  <strong>{cleanTitle || payload.title}</strong>
                  {payload.subtitle && <span>{payload.subtitle}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CÁPSULA DE ENLACE + COPIAR */}
        <div className="ya-share-link-pill">
          <span className="ya-share-url-text">{payload.url.replace(/^https?:\/\//, '')}</span>
          <button
            type="button"
            className={`ya-share-copy-chip ${copied ? 'is-copied' : ''}`}
            onClick={() => void handleCopy()}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>

        {/* ACCIONES RÁPIDAS CIRCULARES */}
        <div className="ya-share-actions-row">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ya-share-circle-item"
            onClick={() => setPayload(null)}
          >
            <span className="ya-share-circle ya-share-circle--wa">
              <MessageCircle size={19} />
            </span>
            <em>WhatsApp</em>
          </a>

          <a
            href={tgHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ya-share-circle-item"
            onClick={() => setPayload(null)}
          >
            <span className="ya-share-circle ya-share-circle--tg">
              <Send size={18} />
            </span>
            <em>Telegram</em>
          </a>

          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ya-share-circle-item"
            onClick={() => setPayload(null)}
          >
            <span className="ya-share-circle ya-share-circle--x">
              <ExternalLink size={18} />
            </span>
            <em>X</em>
          </a>

          <button
            type="button"
            className="ya-share-circle-item"
            onClick={() => setShowQr((v) => !v)}
          >
            <span className={`ya-share-circle ${showQr ? 'is-active' : ''}`}>
              <QrCode size={18} />
            </span>
            <em>{showQr ? 'Tarjeta' : 'QR'}</em>
          </button>

          <button
            type="button"
            className="ya-share-circle-item"
            onClick={() => void handleNativeMore()}
          >
            <span className="ya-share-circle">
              <Smartphone size={18} />
            </span>
            <em>Más apps</em>
          </button>
        </div>

        {/* BOTÓN PRINCIPAL: en APK abre el compartir nativo; en Web permite GIF animado real + Tarjeta PNG */}
        {isAndroidWebView ? (
          <button
            type="button"
            className="ya-share-story-btn is-ready"
            onClick={() => void handleNativeMore()}
          >
            <Share2 size={15} />
            <span>Compartir ahora (WhatsApp / otras apps)</span>
          </button>
        ) : (
          <div className="ya-share-export-row">
            <button
              type="button"
              className={`ya-share-story-btn ${readyGifFile ? 'is-ready' : ''}`}
              onClick={() => void handleShareAnimatedGif()}
              disabled={savingGif || savingCard}
            >
              <Sparkles size={15} />
              <span>
                {savingGif
                  ? 'Creando GIF…'
                  : readyGifFile
                  ? 'Enviar GIF ahora'
                  : 'GIF animado'}
              </span>
            </button>
            <button
              type="button"
              className="ya-share-story-btn"
              onClick={() => void handleDownloadStoryCard()}
              disabled={savingCard || savingGif}
            >
              <Download size={15} />
              <span>{savingCard ? 'Generando…' : 'Imagen PNG'}</span>
            </button>
          </div>
        )}

        {cardNotice && <div className="ya-share-notice">{cardNotice}</div>}
      </div>

      <style>{`
        .ya-share-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(4, 7, 15, 0.72);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 14px;
        }
        @media (min-width: 640px) {
          .ya-share-backdrop {
            align-items: center;
          }
        }
        .ya-share-sheet {
          width: 100%;
          max-width: 410px;
          border-radius: 26px;
          background: linear-gradient(165deg, rgba(26, 32, 48, 0.88) 0%, rgba(12, 16, 26, 0.94) 100%);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 28px 72px rgba(0, 0, 0, 0.7);
          padding: 10px 18px calc(18px + env(safe-area-inset-bottom));
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 13px;
          animation: yaShareUp 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes yaShareUp {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ya-share-handle {
          width: 36px;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.26);
          margin: 0 auto 2px;
        }
        .ya-share-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ya-share-head-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .ya-share-close {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* Tarjeta visual glaseada */
        .ya-share-card {
          position: relative;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.05);
        }
        .ya-share-card-ambient {
          position: absolute;
          inset: -24px;
          background-size: cover;
          background-position: center;
          filter: blur(26px) saturate(160%);
          opacity: 0.38;
          pointer-events: none;
          animation: yaShareGlow 9s ease-in-out infinite alternate;
        }
        @keyframes yaShareGlow {
          0% { transform: scale(1) translate3d(-4px, -2px, 0); opacity: 0.34; }
          100% { transform: scale(1.12) translate3d(5px, 4px, 0); opacity: 0.48; }
        }
        .ya-share-card-inner {
          position: relative;
          z-index: 1;
          padding: 13px;
          background: linear-gradient(180deg, rgba(10, 14, 24, 0.55) 0%, rgba(10, 14, 24, 0.84) 100%);
          display: flex;
          flex-direction: column;
          gap: 11px;
        }
        .ya-share-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ya-share-badge {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #e0f2fe;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 999px;
          padding: 3px 9px;
        }
        .ya-share-card-media-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ya-share-thumb-frame {
          width: 92px;
          height: 54px;
          border-radius: 10px;
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }
        .ya-share-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          animation: yaShareThumbMotion 7s ease-in-out infinite alternate;
        }
        @keyframes yaShareThumbMotion {
          0% { transform: scale(1.0) translate3d(0, 0, 0); }
          100% { transform: scale(1.16) translate3d(-4px, -2px, 0); }
        }
        .ya-share-export-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .ya-share-card-meta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .ya-share-card-meta strong {
          font-size: 13.5px;
          font-weight: 700;
          line-height: 1.3;
          color: #ffffff;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ya-share-card-meta span {
          font-size: 11.5px;
          color: #cbd5e1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ya-share-qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 6px 0 2px;
        }
        .ya-share-qr-box img {
          width: 152px;
          height: 152px;
          border-radius: 14px;
          background: #ffffff;
          padding: 6px;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
        }
        .ya-share-qr-box span {
          font-size: 11.5px;
          color: #cbd5e1;
        }

        /* Cápsula enlace + copiar */
        .ya-share-link-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 5px 5px 5px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ya-share-url-text {
          font-size: 11.5px;
          color: #cbd5e1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .ya-share-copy-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.9);
          color: #0f172a;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.12s ease, background 0.15s ease;
        }
        .ya-share-copy-chip.is-copied {
          background: #22c55e;
          border-color: #4ade80;
          color: #052e16;
        }
        .ya-share-copy-chip:active {
          transform: scale(0.96);
        }

        /* Fila circular de apps */
        .ya-share-actions-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }
        .ya-share-circle-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          text-decoration: none;
          color: #e2e8f0;
          cursor: pointer;
          padding: 2px 0;
        }
        .ya-share-circle-item em {
          font-style: normal;
          font-size: 11px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .ya-share-circle {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
          transition: transform 0.14s ease, background 0.14s ease;
        }
        .ya-share-circle-item:hover .ya-share-circle {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.18);
        }
        .ya-share-circle.is-active {
          background: rgba(56, 189, 248, 0.28);
          border-color: rgba(125, 211, 252, 0.65);
          color: #e0f2fe;
        }
        .ya-share-circle--wa {
          background: rgba(34, 197, 94, 0.18);
          border-color: rgba(74, 222, 128, 0.42);
          color: #86efac;
        }
        .ya-share-circle--tg {
          background: rgba(56, 189, 248, 0.18);
          border-color: rgba(125, 211, 252, 0.42);
          color: #7dd3fc;
        }
        .ya-share-circle--x {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.26);
          color: #ffffff;
        }

        /* Botón tarjeta historia */
        .ya-share-story-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 11px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.09) 100%);
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
          transition: background 0.14s ease, transform 0.12s ease;
        }
        .ya-share-story-btn:hover {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.13) 100%);
        }
        .ya-share-story-btn.is-ready {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-color: #4ade80;
          color: #052e16;
        }
        .ya-share-story-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .ya-share-notice {
          text-align: center;
          font-size: 11.5px;
          color: #86efac;
        }
      `}</style>
    </div>
  );
};
