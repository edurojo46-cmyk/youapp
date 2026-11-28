import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Radio,
  Play,
  RefreshCw,
  X,
  Loader2,
  Wand2
} from 'lucide-react';
import {
  buildAtlasDraftSignal,
  convertAtlasDraftToCustomSignal,
  EDITORIAL_ROLE_LABELS,
  type AtlasDraftSignal,
  type AtlasSignalStyle
} from '../../lib/tv/atlasSignalBuilder';
import { useSignalStore } from '../../lib/tv/signalStore';
import { persistSignal } from '../../lib/tv/signalPersistence';

interface Props {
  compact?: boolean;
  onSignalLaunched?: (signalId: string) => void;
}

const INSPIRATION_CHIPS = [
  'Historia de Roma',
  'Rock Nacional en vivo',
  'Fútbol táctico',
  'Asado argentino',
  'Cosmos y astronomía',
  'Inteligencia Artificial',
  'Jazz de medianoche',
  'Viajes por la Patagonia'
];

const STYLE_OPTIONS: Array<{ id: AtlasSignalStyle; label: string }> = [
  { id: 'documental', label: 'Documental' },
  { id: 'dinamico', label: 'Dinámico' },
  { id: 'musica', label: 'Música / Vivo' }
];

export function AtlasBuildSignalBox({ compact = false, onSignalLaunched }: Props) {
  const navigate = useNavigate();
  const setSignal = useSignalStore((s) => s.setSignal);

  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState<AtlasSignalStyle>('documental');
  const [isBuilding, setIsBuilding] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [draft, setDraft] = useState<AtlasDraftSignal | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  const runBuild = async (seedTopic?: string, seedStyle?: AtlasSignalStyle) => {
    const targetTopic = (seedTopic ?? topic).trim();
    const targetStyle = seedStyle ?? style;
    if (targetTopic.length < 2 || isBuilding) return;

    setTopic(targetTopic);
    setStyle(targetStyle);
    setErrorMsg(null);
    setIsBuilding(true);
    setProgressText(`ATLAS está buscando videos reales sobre «${targetTopic}»…`);

    try {
      const built = await buildAtlasDraftSignal({
        topic: targetTopic,
        style: targetStyle,
        count: 10,
        onProgress: (_idx, label) => setProgressText(label)
      });
      if (!built || built.videos.length === 0) {
        setErrorMsg('No encontramos suficientes videos embebibles para ese tema. Probá con otra palabra clave.');
        return;
      }
      setDraft(built);
      setCustomTitle(built.title);
    } catch {
      setErrorMsg('No se pudo armar la señal en este momento. Intentá de nuevo.');
    } finally {
      setIsBuilding(false);
      setProgressText('');
    }
  };

  const handleSwapVideo = (idx: number) => {
    if (!draft) return;
    if (draft.reservePool.length === 0) return;
    const [replacement, ...restReserve] = draft.reservePool;
    const current = draft.videos[idx];
    const nextVideos = [...draft.videos];
    nextVideos[idx] = { ...replacement, role: current.role };
    setDraft({
      ...draft,
      coverVideoId: idx === 0 ? replacement.videoId : draft.coverVideoId,
      videos: nextVideos,
      reservePool: [...restReserve, current]
    });
  };

  const handleRemoveVideo = (idx: number) => {
    if (!draft || draft.videos.length <= 1) return;
    const nextVideos = draft.videos.filter((_, i) => i !== idx);
    setDraft({
      ...draft,
      coverVideoId: nextVideos[0]?.videoId || draft.coverVideoId,
      videos: nextVideos
    });
  };

  const handleLaunchSignal = async () => {
    if (!draft || isLaunching) return;
    setIsLaunching(true);
    try {
      const builtSignal = convertAtlasDraftToCustomSignal(draft, customTitle);
      setSignal(builtSignal, { saveToOwn: true });
      void persistSignal(builtSignal);
      onSignalLaunched?.(builtSignal.id);
      navigate(`/misenal1?signal=${encodeURIComponent(builtSignal.id)}`);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <section
      className={`abx-box ${compact ? 'is-compact' : ''}`}
      aria-label="Armá tu señal con ATLAS"
    >
      <div className="abx-head">
        <div className="abx-head-ico">
          <Wand2 size={16} />
        </div>
        <div className="abx-head-text">
          <div className="abx-title-row">
            <strong>Armá tu señal con ATLAS</strong>
            <span className="abx-pill">IA · 10 videos reales</span>
          </div>
          <p>Escribí cualquier tema y ATLAS + IA arman tu propio canal de TV listo para ver y compartir.</p>
        </div>
      </div>

      <form
        className="abx-form"
        onSubmit={(e) => {
          e.preventDefault();
          void runBuild();
        }}
      >
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="¿De qué querés tu señal hoy? Ej: Historia de Roma, Rock Nacional, Asado…"
          aria-label="Tema para armar tu señal"
          disabled={isBuilding}
        />
        <button type="submit" className="abx-submit-btn" disabled={isBuilding || topic.trim().length < 2}>
          {isBuilding ? <Loader2 size={14} className="abx-spin" /> : <Sparkles size={14} />}
          <span>{isBuilding ? 'Armando…' : 'Armar señal'}</span>
        </button>
      </form>

      <div className="abx-controls-row">
        <div className="abx-styles" role="tablist" aria-label="Estilo de señal">
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={style === opt.id}
              className={`abx-style-chip ${style === opt.id ? 'active' : ''}`}
              onClick={() => setStyle(opt.id)}
              disabled={isBuilding}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="abx-ideas-carousel" aria-label="Ideas rápidas">
        {INSPIRATION_CHIPS.map((idea) => (
          <button
            key={idea}
            type="button"
            className="abx-idea-chip"
            disabled={isBuilding}
            onClick={() => void runBuild(idea, style)}
          >
            <Sparkles size={10} />
            <span>{idea}</span>
          </button>
        ))}
      </div>

      {isBuilding && progressText && (
        <div className="abx-progress" role="status">
          <Loader2 size={14} className="abx-spin" color="#64d2ff" />
          <span>{progressText}</span>
        </div>
      )}

      {errorMsg && <div className="abx-error">{errorMsg}</div>}

      {draft && !isBuilding && (
        <div className="abx-preview">
          <div className="abx-preview-hero">
            <div className="abx-preview-cover">
              <img
                src={`https://i.ytimg.com/vi/${draft.coverVideoId}/hqdefault.jpg`}
                alt={customTitle || draft.title}
                referrerPolicy="no-referrer"
              />
              <div className="abx-preview-scrim" />
              <span className="abx-signal-badge">
                <Radio size={11} color="#64d2ff" />
                <span>Señal lista · {draft.videos.length} videos</span>
              </span>
            </div>

            <div className="abx-preview-meta">
              <label className="abx-name-label">
                <span>Nombre de tu señal</span>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Nombre de tu señal…"
                />
              </label>
              <p>{draft.subtitle}</p>
              <div className="abx-preview-actions">
                <button
                  type="button"
                  className="abx-launch-btn"
                  onClick={() => void handleLaunchSignal()}
                  disabled={isLaunching}
                >
                  <Play size={14} fill="#ffffff" color="#ffffff" />
                  <span>{isLaunching ? 'Sintonizando…' : 'Estrenar mi señal ahora'}</span>
                </button>
                <button
                  type="button"
                  className="abx-ghost-btn"
                  onClick={() => setDraft(null)}
                >
                  Cerrar vista previa
                </button>
              </div>
            </div>
          </div>

          <div className="abx-video-list">
            {draft.videos.map((v, idx) => (
              <div key={`${v.videoId}-${idx}`} className="abx-video-row">
                <span className="abx-row-num">{idx + 1}</span>
                <img
                  src={v.thumbnailUrl}
                  alt={v.title}
                  className="abx-row-thumb"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="abx-row-info">
                  <div className="abx-row-meta">
                    <span className="abx-role-tag">{EDITORIAL_ROLE_LABELS[v.role]}</span>
                    <span className="abx-channel-name">{v.channelName}</span>
                  </div>
                  <strong>{v.title}</strong>
                </div>
                <div className="abx-row-btns">
                  {draft.reservePool.length > 0 && (
                    <button
                      type="button"
                      className="abx-mini-btn"
                      onClick={() => handleSwapVideo(idx)}
                      title="Cambiar este video por otra opción de ATLAS"
                      aria-label="Cambiar video"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                  {draft.videos.length > 1 && (
                    <button
                      type="button"
                      className="abx-mini-btn danger"
                      onClick={() => handleRemoveVideo(idx)}
                      title="Quitar de la señal"
                      aria-label="Quitar video"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .abx-box {
          border-radius: 20px;
          padding: 15px 16px;
          background: linear-gradient(
            145deg,
            rgba(0, 113, 227, 0.2) 0%,
            rgba(20, 26, 40, 0.72) 55%,
            rgba(100, 210, 255, 0.12) 100%
          );
          border: 1px solid rgba(100, 210, 255, 0.34);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 12px 30px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          display: flex;
          flex-direction: column;
          gap: 10px;
          color: #f5f5f7;
        }
        .abx-box.is-compact {
          padding: 12px 13px;
          border-radius: 18px;
        }
        .abx-head {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .abx-head-ico {
          width: 34px;
          height: 34px;
          border-radius: 11px;
          background: linear-gradient(135deg, #0071e3 0%, #38bdf8 100%);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 113, 227, 0.4);
        }
        .abx-head-text {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .abx-title-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .abx-title-row strong {
          font-size: 14.5px;
          font-weight: 760;
          color: #ffffff;
        }
        .abx-pill {
          font-size: 10px;
          font-weight: 750;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(100, 210, 255, 0.2);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #d8f3ff;
        }
        .abx-head-text p {
          margin: 0;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.78);
          line-height: 1.35;
        }
        .abx-form {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 6px 5px 12px;
          border-radius: 999px;
          background: rgba(10, 14, 24, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.22);
        }
        .abx-form:focus-within {
          border-color: #64d2ff;
          box-shadow: 0 0 0 2px rgba(100, 210, 255, 0.22);
        }
        .abx-form input {
          flex: 1;
          min-width: 0;
          border: 0;
          background: transparent;
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .abx-form input::placeholder {
          color: rgba(245, 245, 247, 0.52);
        }
        .abx-submit-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 999px;
          border: 0;
          background: linear-gradient(135deg, #0071e3 0%, #0a84ff 100%);
          color: #ffffff;
          font-size: 12px;
          font-weight: 720;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .abx-submit-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .abx-controls-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .abx-styles {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .abx-style-chip {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.84);
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
        }
        .abx-style-chip.active {
          background: rgba(255, 255, 255, 0.92);
          border-color: #ffffff;
          color: #111827;
        }
        .abx-ideas-carousel {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 5px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 1px;
        }
        .abx-ideas-carousel::-webkit-scrollbar {
          display: none;
        }
        .abx-idea-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.26);
          background: rgba(100, 210, 255, 0.1);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
        }
        .abx-idea-chip:hover {
          background: rgba(100, 210, 255, 0.22);
          color: #ffffff;
        }
        .abx-progress {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 12px;
          background: rgba(10, 14, 24, 0.62);
          border: 1px solid rgba(100, 210, 255, 0.3);
          font-size: 12px;
          font-weight: 600;
          color: #d8f3ff;
        }
        .abx-spin {
          animation: abxSpin 0.9s linear infinite;
        }
        @keyframes abxSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .abx-error {
          padding: 8px 11px;
          border-radius: 11px;
          background: rgba(255, 69, 58, 0.18);
          border: 1px solid rgba(255, 69, 58, 0.42);
          color: #ffd3d0;
          font-size: 12px;
          font-weight: 600;
        }
        .abx-preview {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
        }
        .abx-preview-hero {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 12px;
          align-items: stretch;
        }
        .abx-preview-cover {
          position: relative;
          border-radius: 14px;
          overflow: hidden;
          aspect-ratio: 16 / 9;
          background: #0b101b;
        }
        .abx-preview-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .abx-preview-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 50%, rgba(0,0,0,0.7) 100%);
        }
        .abx-signal-badge {
          position: absolute;
          top: 7px;
          left: 7px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.78);
          border: 1px solid rgba(100, 210, 255, 0.48);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
        }
        .abx-preview-meta {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 7px;
          min-width: 0;
        }
        .abx-name-label {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .abx-name-label span {
          font-size: 10.5px;
          font-weight: 700;
          color: rgba(245, 245, 247, 0.68);
        }
        .abx-name-label input {
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(10, 14, 24, 0.62);
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 720;
          outline: none;
        }
        .abx-name-label input:focus {
          border-color: #64d2ff;
        }
        .abx-preview-meta p {
          margin: 0;
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.76);
          line-height: 1.35;
        }
        .abx-preview-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .abx-launch-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 999px;
          border: 0;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35);
        }
        .abx-ghost-btn {
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.86);
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .abx-video-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 310px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .abx-video-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 12px;
          background: rgba(10, 14, 24, 0.56);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .abx-row-num {
          width: 18px;
          text-align: center;
          font-size: 11px;
          font-weight: 750;
          color: rgba(245, 245, 247, 0.58);
          flex-shrink: 0;
        }
        .abx-row-thumb {
          width: 58px;
          height: 36px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
          background: #000;
        }
        .abx-row-info {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .abx-row-meta {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .abx-role-tag {
          font-size: 9.5px;
          font-weight: 750;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.24);
          color: #93c5fd;
        }
        .abx-channel-name {
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.65);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .abx-row-info strong {
          font-size: 12px;
          font-weight: 650;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .abx-row-btns {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .abx-mini-btn {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .abx-mini-btn:hover {
          background: rgba(100, 210, 255, 0.24);
        }
        .abx-mini-btn.danger:hover {
          background: rgba(255, 69, 58, 0.28);
          color: #ffb4ae;
        }
        @media (max-width: 640px) {
          .abx-preview-hero {
            grid-template-columns: 1fr;
          }
          .abx-form input {
            font-size: 12px;
          }
          .abx-submit-btn {
            padding: 6px 11px;
            font-size: 11.5px;
          }
        }
      `}</style>
    </section>
  );
}
