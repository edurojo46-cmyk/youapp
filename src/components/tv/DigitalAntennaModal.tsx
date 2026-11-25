import React, { useState } from 'react';
import { Check, Code2, Copy, ExternalLink, Radio, X } from 'lucide-react';
import { getYouAppShareOrigin } from '../../lib/tv/youappShareHelper';

interface DigitalAntennaModalProps {
  isOpen: boolean;
  onClose: () => void;
  signalId: string;
  signalName: string;
  featuredVideoId?: string;
}

export const DigitalAntennaModal: React.FC<DigitalAntennaModalProps> = ({
  isOpen,
  onClose,
  signalId,
  signalName,
  featuredVideoId
}) => {
  const [mode, setMode] = useState<'full' | 'compact'>('full');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const origin = getYouAppShareOrigin();
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('name', signalName);
  if (featuredVideoId) params.set('v', featuredVideoId);

  const embedPath = `/antena/${encodeURIComponent(signalId)}?${params.toString()}`;
  const fullEmbedUrl = `${origin}${embedPath}`;
  const iframeHeight = mode === 'compact' ? 275 : 460;
  const snippet = `<iframe src="${fullEmbedUrl}" width="100%" height="${iframeHeight}" style="max-width:560px;border:0;border-radius:20px;overflow:hidden;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // ignore
    }
  };

  return (
    <div className="dam-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dam-head">
          <div>
            <span className="dam-eyebrow">
              <Radio size={11} /> ANTENA DIGITAL · DISTRIBUCIÓN EXTERNA
            </span>
            <h2>Insertá «{signalName}» en cualquier página web</h2>
          </div>
          <button type="button" className="dam-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="dam-mode-row">
          <span className="dam-lbl">Formato de la antena</span>
          <div className="dam-seg">
            <button
              type="button"
              className={mode === 'full' ? 'active' : ''}
              onClick={() => setMode('full')}
            >
              Completa ({460}px)
            </button>
            <button
              type="button"
              className={mode === 'compact' ? 'active' : ''}
              onClick={() => setMode('compact')}
            >
              Compacta ({275}px)
            </button>
          </div>
        </div>

        {/* Vista previa real en vivo */}
        <div className="dam-preview-wrap">
          <iframe
            src={embedPath}
            title={`Vista previa Antena Digital de ${signalName}`}
            width="100%"
            height={mode === 'compact' ? 255 : 360}
            style={{ border: 0, borderRadius: 18, background: '#f5f5f7' }}
          />
        </div>

        {/* Código HTML listo para copiar */}
        <div className="dam-code-block">
          <div className="dam-code-head">
            <span>
              <Code2 size={13} /> Código HTML (WordPress, Wix, HTML, Notion)
            </span>
            <a
              href={embedPath}
              target="_blank"
              rel="noopener noreferrer"
              className="dam-open-link"
            >
              Abrir antena <ExternalLink size={11} />
            </a>
          </div>
          <textarea readOnly value={snippet} rows={3} className="dam-textarea" />
          <button type="button" className="dam-copy-btn" onClick={() => void handleCopy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? '¡Código de Antena copiado!' : 'Copiar código para insertar'}</span>
          </button>
        </div>
      </div>

      <style>{`
        .dam-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(29, 29, 31, 0.48);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .dam-modal {
          width: 100%;
          max-width: 600px;
          max-height: 92dvh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 24px;
          padding: 20px 22px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.24);
          display: flex;
          flex-direction: column;
          gap: 14px;
          color: #1d1d1f;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
        }
        .dam-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .dam-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          color: #0071e3;
        }
        .dam-head h2 {
          margin: 4px 0 0;
          font-size: 18px;
          font-weight: 750;
          letter-spacing: -0.02em;
        }
        .dam-close {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: rgba(118, 118, 128, 0.14);
          color: #1d1d1f;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .dam-mode-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .dam-lbl { font-size: 12.5px; font-weight: 620; color: #424245; }
        .dam-seg {
          display: inline-flex;
          padding: 3px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.12);
          gap: 3px;
        }
        .dam-seg button {
          padding: 5px 12px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #424245;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .dam-seg button.active {
          background: #ffffff;
          color: #1d1d1f;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .dam-preview-wrap {
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.07);
        }
        .dam-code-block {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          border-radius: 16px;
          background: #f5f5f7;
        }
        .dam-code-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 680;
          color: #424245;
        }
        .dam-code-head span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .dam-open-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #0071e3;
          text-decoration: none;
        }
        .dam-textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          color: #1d1d1f;
          resize: none;
        }
        .dam-copy-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};
