import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Send, Share2, X } from 'lucide-react';

export interface ShareSheetPayload {
  title: string;
  text: string;
  url: string;
}

const SHARE_SHEET_EVENT = 'youapp:open-share-sheet';
let pendingPayload: ShareSheetPayload | null = null;

/**
 * Compartir universal YOUAPP:
 * 1) Intenta puente nativo Android APK (`YouAppAndroidPiP.share`) si existe.
 * 2) Intenta `navigator.share` en navegadores móviles compatibles.
 * 3) Si falla o no existe (Android WebView / PC), abre hoja elegante con WhatsApp, Telegram, X y Copiar enlace.
 */
export async function shareContentUniversal(payload: ShareSheetPayload): Promise<void> {
  const androidBridge = (window as any).YouAppAndroidPiP;
  try {
    if (androidBridge && typeof androidBridge.share === 'function') {
      androidBridge.share(payload.title, payload.text, payload.url);
      return;
    }
  } catch {
    // fallback a navigator.share o sheet
  }

  try {
    // Evitar el navigator.share roto de Android WebView si existe el objeto bridge
    const isAndroidWebView = typeof navigator !== 'undefined' && /;\s*wv\)/i.test(navigator.userAgent || '');
    if (!isAndroidWebView && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url
      });
      return;
    }
  } catch (err: any) {
    // Si el usuario canceló el diálogo nativo, no abrir el sheet
    if (err?.name === 'AbortError') return;
  }

  pendingPayload = payload;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SHARE_SHEET_EVENT));
  }
}

export const GlobalShareSheet: React.FC = () => {
  const [payload, setPayload] = useState<ShareSheetPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setPayload(pendingPayload);
      setCopied(false);
    };
    window.addEventListener(SHARE_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(SHARE_SHEET_EVENT, onOpen);
  }, []);

  if (!payload) return null;

  const fullText = `${payload.text} ${payload.url}`.trim();
  const waHref = `https://wa.me/?text=${encodeURIComponent(fullText)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(payload.url)}&text=${encodeURIComponent(payload.text)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.text)}&url=${encodeURIComponent(payload.url)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(payload.url);
    } catch {
      // ignore
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
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
        <div className="ya-share-head">
          <div className="ya-share-head-title">
            <Share2 size={15} color="#64d2ff" />
            <span>Compartir</span>
          </div>
          <button
            type="button"
            className="ya-share-close"
            onClick={() => setPayload(null)}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="ya-share-preview">{payload.title}</div>

        <div className="ya-share-grid">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ya-share-btn ya-share-btn--wa"
            onClick={() => setPayload(null)}
          >
            <MessageCircle size={18} />
            <span>WhatsApp</span>
          </a>

          <a
            href={tgHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ya-share-btn ya-share-btn--tg"
            onClick={() => setPayload(null)}
          >
            <Send size={17} />
            <span>Telegram</span>
          </a>

          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ya-share-btn ya-share-btn--x"
            onClick={() => setPayload(null)}
          >
            <ExternalLink size={17} />
            <span>X / Twitter</span>
          </a>

          <button type="button" className="ya-share-btn ya-share-btn--copy" onClick={() => void handleCopy()}>
            {copied ? <Check size={17} color="#34d399" /> : <Copy size={17} />}
            <span>{copied ? 'Copiado' : 'Copiar link'}</span>
          </button>
        </div>
      </div>

      <style>{`
        .ya-share-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100020;
          background: rgba(0, 0, 0, 0.62);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 16px;
        }
        @media (min-width: 641px) {
          .ya-share-backdrop {
            align-items: center;
          }
        }
        .ya-share-sheet {
          width: 100%;
          max-width: 400px;
          border-radius: 22px;
          padding: 16px 16px max(18px, env(safe-area-inset-bottom));
          background: rgba(16, 20, 30, 0.97);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.72);
          color: #f5f5f7;
          display: flex;
          flex-direction: column;
          gap: 12px;
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
          font-size: 14.5px;
          font-weight: 700;
        }
        .ya-share-close {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ya-share-preview {
          font-size: 12.5px;
          color: rgba(235, 240, 255, 0.8);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
        }
        .ya-share-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .ya-share-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13.5px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .ya-share-btn--wa {
          background: rgba(37, 211, 102, 0.22);
          border-color: rgba(37, 211, 102, 0.55);
          color: #86efac;
        }
        .ya-share-btn--tg {
          background: rgba(56, 189, 248, 0.2);
          border-color: rgba(56, 189, 248, 0.5);
          color: #7dd3fc;
        }
        .ya-share-btn--x {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.24);
        }
        .ya-share-btn--copy {
          background: rgba(10, 132, 255, 0.2);
          border-color: rgba(100, 210, 255, 0.45);
          color: #93d5ff;
        }
      `}</style>
    </div>
  );
};
