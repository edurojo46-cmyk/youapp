import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Car,
  ExternalLink,
  Headphones,
  Newspaper,
  Pause,
  Play,
  Plus,
  Radio,
  SkipBack,
  SkipForward,
  Trash2,
  Tv,
  X
} from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { useSignalStore } from '../lib/tv/signalStore';
import {
  addSignalAudioSource,
  addSignalNewsSource,
  isPlayableAudioUrl,
  readSignalMediaBundle,
  removeSignalAudioSource,
  removeSignalNewsSource,
  STARTER_AUDIO_PRESETS,
  type SignalAudioSource,
  type SignalMediaBundle
} from '../lib/tv/signalMediaSourcesStore';

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Fuente externa';
  }
}

export default function SignalAudioNewsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeSignal, getSavedSignal } = useSignalStore();

  const signalId = searchParams.get('signal') || activeSignal?.id || 'justicia-social-signal-1';
  const resolvedSignal = getSavedSignal(signalId) || activeSignal;
  const signalName = resolvedSignal?.name || 'Mi Señal';

  const [tab, setTab] = useState<'audio' | 'news'>('audio');
  const [bundle, setBundle] = useState<SignalMediaBundle>(() => readSignalMediaBundle(signalId));
  const [playingAudio, setPlayingAudio] = useState<SignalAudioSource | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [carMode, setCarMode] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Form Audio
  const [audioTitle, setAudioTitle] = useState('');
  const [audioAuthor, setAudioAuthor] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioKind, setAudioKind] = useState<'radio' | 'music' | 'podcast'>('radio');

  // Form Noticias
  const [newsTitle, setNewsTitle] = useState('');
  const [newsSource, setNewsSource] = useState('');
  const [newsUrl, setNewsUrl] = useState('');
  const [newsSummary, setNewsSummary] = useState('');

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setBundle(readSignalMediaBundle(signalId));
  }, [signalId]);

  const handlePlayToggle = (item: SignalAudioSource) => {
    if (!isPlayableAudioUrl(item.streamUrl)) {
      window.open(item.originUrl || item.streamUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (playingAudio?.id === item.id) {
      if (isAudioPlaying) {
        audioRef.current?.pause();
        setIsAudioPlaying(false);
      } else {
        void audioRef.current?.play();
        setIsAudioPlaying(true);
      }
      return;
    }
    setPlayingAudio(item);
    setToast(null);
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = item.streamUrl;
      el.load();
      el.play()
        .then(() => {
          setIsAudioPlaying(true);
        })
        .catch(() => {
          setIsAudioPlaying(false);
          setToast('No se pudo reproducir el stream directo. Podés abrir la fuente oficial.');
        });
    }
  };

  const handleAddAudio = (e: React.FormEvent) => {
    e.preventDefault();
    const url = audioUrl.trim();
    const title = audioTitle.trim();
    if (!url || !title) return;
    const next = addSignalAudioSource(signalId, {
      title,
      author: audioAuthor.trim() || safeHostname(url),
      streamUrl: url,
      originUrl: url,
      kind: audioKind
    });
    setBundle(next);
    setAudioTitle('');
    setAudioAuthor('');
    setAudioUrl('');
    setToast(`Sumado a Radio y Podcasts de «${signalName}».`);
  };

  const handleAddNews = (e: React.FormEvent) => {
    e.preventDefault();
    const url = newsUrl.trim();
    const title = newsTitle.trim();
    if (!url || !title) return;
    const next = addSignalNewsSource(signalId, {
      title,
      sourceName: newsSource.trim() || safeHostname(url),
      articleUrl: url,
      summary: newsSummary.trim() || undefined
    });
    setBundle(next);
    setNewsTitle('');
    setNewsSource('');
    setNewsUrl('');
    setNewsSummary('');
    setToast(`Noticia / artículo agregado a «${signalName}».`);
  };

  return (
    <div className="smn-page">
      <audio
        ref={audioRef}
        onPause={() => setIsAudioPlaying(false)}
        onPlay={() => setIsAudioPlaying(true)}
      />

      {/* Cabecera Apple Glass */}
      <header className="smn-topnav">
        <div className="smn-left">
          <button
            type="button"
            className="smn-back-btn"
            onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(signalId)}`)}
          >
            <ArrowLeft size={14} />
            <span>Volver a Señal TV</span>
          </button>
          <div className="smn-divider" />
          <YouAppOfficialLogo theme="light" />
        </div>

        <div className="smn-user">
          <TvUserSessionMenu />
        </div>
      </header>

      <main className="smn-shell">
        {/* Identidad de la señal + Selector Radio / Noticias */}
        <section className="smn-hero">
          <div className="smn-hero-meta">
            <span className="smn-eyebrow">MI SEÑAL UNIVERSAL · CAPA 2</span>
            <h1>{signalName}</h1>
            <p>
              Radio en vivo, podcasts y noticias seleccionadas para esta señal, respetando siempre la fuente original.
            </p>
          </div>

          <div className="smn-hero-controls">
            <div className="smn-segmented" role="tablist" aria-label="Formatos de la señal">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'audio'}
                className={`smn-seg-btn ${tab === 'audio' ? 'active' : ''}`}
                onClick={() => setTab('audio')}
              >
                <Headphones size={14} />
                <span>Radio y Música ({bundle.audio.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'news'}
                className={`smn-seg-btn ${tab === 'news' ? 'active' : ''}`}
                onClick={() => setTab('news')}
              >
                <Newspaper size={14} />
                <span>Noticias y Artículos ({bundle.news.length})</span>
              </button>
            </div>

            <button
              type="button"
              className="smn-tv-link"
              onClick={() => {
                if (!playingAudio && bundle.audio.length > 0) {
                  handlePlayToggle(bundle.audio[0]);
                }
                setCarMode(true);
              }}
              title="Modo Auto / Solo Audio con botones grandes"
            >
              <Car size={13} />
              <span>Modo Auto</span>
            </button>

            <button
              type="button"
              className="smn-tv-link"
              onClick={() => navigate(`/diarios?signal=${encodeURIComponent(signalId)}`)}
            >
              <Newspaper size={13} />
              <span>Diarios Argentinos</span>
            </button>

            <button
              type="button"
              className="smn-tv-link"
              onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(signalId)}`)}
            >
              <Tv size={13} />
              <span>Ir a Señal TV</span>
            </button>
          </div>
        </section>

        {toast && (
          <div className="smn-toast" role="status">
            {toast}
          </div>
        )}

        {/* Reproductor flotante limpio si hay una radio/audio sonando */}
        {playingAudio && (
          <div className="smn-player-bar">
            <button
              type="button"
              className="smn-play-circle"
              onClick={() => handlePlayToggle(playingAudio)}
              aria-label={isAudioPlaying ? 'Pausar audio' : 'Reproducir audio'}
            >
              {isAudioPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="smn-player-meta">
              <span className="smn-live-tag">
                <Radio size={11} /> {playingAudio.kind === 'radio' ? 'RADIO EN VIVO' : 'PODCAST'}
              </span>
              <strong>{playingAudio.title}</strong>
              <span>{playingAudio.author}</span>
            </div>
            {playingAudio.originUrl && (
              <a
                href={playingAudio.originUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="smn-origin-btn"
              >
                Fuente <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* TAB 1: RADIO Y PODCASTS */}
        {tab === 'audio' && (
          <section className="smn-section">
            <form onSubmit={handleAddAudio} className="smn-form-card">
              <div className="smn-form-title">Sumar radio online o podcast a esta señal</div>
              <div className="smn-form-grid">
                <input
                  type="text"
                  required
                  value={audioTitle}
                  onChange={(e) => setAudioTitle(e.target.value)}
                  placeholder="Nombre del programa, radio o podcast"
                  className="smn-input"
                />
                <input
                  type="text"
                  value={audioAuthor}
                  onChange={(e) => setAudioAuthor(e.target.value)}
                  placeholder="Emisora o autor (opcional)"
                  className="smn-input"
                />
                <input
                  type="url"
                  required
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://... (stream MP3/AAC, RSS o página del podcast)"
                  className="smn-input wide"
                />
                <select
                  value={audioKind}
                  onChange={(e) => setAudioKind(e.target.value as 'radio' | 'music' | 'podcast')}
                  className="smn-select"
                >
                  <option value="radio">Radio en vivo</option>
                  <option value="music">Música / Playlist</option>
                  <option value="podcast">Podcast / Audio</option>
                </select>
                <button type="submit" className="smn-submit-btn">
                  <Plus size={14} /> Sumar audio
                </button>
              </div>

              {/* Presets rápidos de radios reales */}
              <div className="smn-presets-row">
                <span className="smn-presets-lbl">Sumar rápido:</span>
                {STARTER_AUDIO_PRESETS.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    className="smn-preset-chip"
                    onClick={() => {
                      if (bundle.audio.some((a) => a.streamUrl === p.streamUrl)) {
                        setToast('Esa radio ya está en tu señal.');
                        return;
                      }
                      setBundle(addSignalAudioSource(signalId, p));
                      setToast(`Sumada: ${p.title}`);
                    }}
                  >
                    <Plus size={11} /> {p.author}
                  </button>
                ))}
              </div>
            </form>

            {bundle.audio.length === 0 ? (
              <div className="smn-empty">
                Todavía no agregaste radios ni podcasts a <strong>{signalName}</strong>. Probá sumar una radio rápida arriba o pegar un enlace.
              </div>
            ) : (
              <div className="smn-cards-grid">
                {bundle.audio.map((item) => {
                  const active = playingAudio?.id === item.id && isAudioPlaying;
                  return (
                    <article key={item.id} className={`smn-media-card ${active ? 'playing' : ''}`}>
                      <button
                        type="button"
                        className="smn-card-play"
                        onClick={() => handlePlayToggle(item)}
                        aria-label={`Escuchar ${item.title}`}
                      >
                        {active ? <Pause size={16} /> : <Play size={16} />}
                      </button>

                      <div className="smn-card-meta">
                        <span className="smn-kind-pill">
                          {item.kind === 'radio'
                            ? 'Radio'
                            : item.kind === 'music'
                            ? 'Música'
                            : 'Podcast'}{' '}
                          · {item.author}
                        </span>
                        <h3>{item.title}</h3>
                      </div>

                      <div className="smn-card-actions">
                        {item.originUrl && (
                          <a
                            href={item.originUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="smn-icon-btn"
                            title="Abrir fuente original"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <button
                          type="button"
                          className="smn-icon-btn danger"
                          title="Quitar de la señal"
                          onClick={() => setBundle(removeSignalAudioSource(signalId, item.id))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: NOTICIAS Y ARTÍCULOS */}
        {tab === 'news' && (
          <section className="smn-section">
            <form onSubmit={handleAddNews} className="smn-form-card">
              <div className="smn-form-title">Sumar noticia, nota o artículo a esta señal</div>
              <div className="smn-form-grid">
                <input
                  type="text"
                  required
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  placeholder="Titular de la noticia o artículo"
                  className="smn-input wide"
                />
                <input
                  type="url"
                  required
                  value={newsUrl}
                  onChange={(e) => setNewsUrl(e.target.value)}
                  placeholder="https://... (enlace a la nota original)"
                  className="smn-input wide"
                />
                <input
                  type="text"
                  value={newsSource}
                  onChange={(e) => setNewsSource(e.target.value)}
                  placeholder="Medio o fuente (ej. Infobae, La Nación, BBC)"
                  className="smn-input"
                />
                <input
                  type="text"
                  value={newsSummary}
                  onChange={(e) => setNewsSummary(e.target.value)}
                  placeholder="Comentario breve o bajada (opcional)"
                  className="smn-input"
                />
                <button type="submit" className="smn-submit-btn">
                  <Plus size={14} /> Publicar nota
                </button>
              </div>
            </form>

            {bundle.news.length === 0 ? (
              <div className="smn-empty">
                Todavía no agregaste noticias ni artículos a <strong>{signalName}</strong>. Pegá cualquier enlace arriba para armar la portada informativa de tu señal.
              </div>
            ) : (
              <div className="smn-news-list">
                {bundle.news.map((n) => (
                  <article key={n.id} className="smn-news-card">
                    <div className="smn-news-body">
                      <span className="smn-kind-pill">
                        {n.sourceName} · {safeHostname(n.articleUrl)}
                      </span>
                      <h3>{n.title}</h3>
                      {n.summary && <p>{n.summary}</p>}
                    </div>
                    <div className="smn-news-actions">
                      <a
                        href={n.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="smn-origin-btn"
                      >
                        Leer nota <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        className="smn-icon-btn danger"
                        title="Quitar nota"
                        onClick={() => setBundle(removeSignalNewsSource(signalId, n.id))}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* #5 — MODO AUTO / SOLO AUDIO (Botones grandes estilo CarPlay) */}
      {carMode && (
        <div className="smn-car-overlay" role="dialog" aria-modal="true" aria-label="Modo Auto Solo Audio">
          <div className="smn-car-top">
            <span className="smn-car-badge">
              <Car size={15} /> MODO AUTO · {signalName.toUpperCase()}
            </span>
            <button type="button" className="smn-car-exit" onClick={() => setCarMode(false)}>
              <X size={18} /> Salir
            </button>
          </div>

          <div className="smn-car-center">
            <div className="smn-car-icon-ring">
              <Radio size={44} />
            </div>
            <h2>{playingAudio?.title || (bundle.audio[0]?.title ?? 'Sin radios cargadas')}</h2>
            <p>
              {playingAudio
                ? `${playingAudio.kind === 'radio' ? 'Radio en vivo' : playingAudio.kind === 'music' ? 'Música' : 'Podcast'} · ${playingAudio.author}`
                : 'Sumá una radio o música en tu señal para escucharla acá'}
            </p>
          </div>

          <div className="smn-car-controls">
            <button
              type="button"
              className="smn-car-step"
              disabled={bundle.audio.length <= 1}
              onClick={() => {
                if (bundle.audio.length <= 1) return;
                const idx = bundle.audio.findIndex((a) => a.id === playingAudio?.id);
                const prevIdx = idx <= 0 ? bundle.audio.length - 1 : idx - 1;
                handlePlayToggle(bundle.audio[prevIdx]);
              }}
              aria-label="Estación anterior"
            >
              <SkipBack size={28} />
            </button>

            <button
              type="button"
              className="smn-car-play"
              disabled={bundle.audio.length === 0}
              onClick={() => {
                const target = playingAudio || bundle.audio[0];
                if (target) handlePlayToggle(target);
              }}
              aria-label={isAudioPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isAudioPlaying ? <Pause size={38} /> : <Play size={38} />}
            </button>

            <button
              type="button"
              className="smn-car-step"
              disabled={bundle.audio.length <= 1}
              onClick={() => {
                if (bundle.audio.length <= 1) return;
                const idx = bundle.audio.findIndex((a) => a.id === playingAudio?.id);
                const nextIdx = idx === -1 ? 0 : (idx + 1) % bundle.audio.length;
                handlePlayToggle(bundle.audio[nextIdx]);
              }}
              aria-label="Siguiente estación"
            >
              <SkipForward size={28} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .smn-page {
          min-height: 100dvh;
          background: #f5f5f7;
          color: #1d1d1f;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          padding-bottom: 48px;
        }
        .smn-topnav {
          position: sticky;
          top: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.86);
          backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .smn-left, .smn-user {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .smn-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .smn-divider {
          width: 1px;
          height: 18px;
          background: rgba(0, 0, 0, 0.1);
        }
        .smn-shell {
          max-width: 980px;
          margin: 0 auto;
          padding: 20px 18px 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .smn-hero {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 24px;
          padding: 20px 22px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .smn-eyebrow {
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          color: #0071e3;
        }
        .smn-hero h1 {
          margin: 4px 0 4px;
          font-size: 24px;
          font-weight: 760;
          letter-spacing: -0.028em;
        }
        .smn-hero p {
          margin: 0;
          font-size: 13.5px;
          color: #6e6e73;
        }
        .smn-hero-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .smn-segmented {
          display: inline-flex;
          padding: 3px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.12);
          gap: 3px;
        }
        .smn-seg-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #424245;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .smn-seg-btn.active {
          background: #ffffff;
          color: #1d1d1f;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .smn-tv-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .smn-toast {
          padding: 10px 14px;
          border-radius: 14px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 12.5px;
          font-weight: 600;
        }
        .smn-player-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 18px;
          background: #1d1d1f;
          color: #ffffff;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);
        }
        .smn-play-circle {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .smn-player-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .smn-live-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 750;
          color: #2997ff;
        }
        .smn-player-meta strong {
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .smn-player-meta span:last-child {
          font-size: 11.5px;
          color: #aeaeb2;
        }
        .smn-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .smn-form-card {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 20px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .smn-form-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #1d1d1f;
        }
        .smn-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 9px;
        }
        .smn-input, .smn-select {
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 13px;
          outline: none;
        }
        .smn-input:focus {
          background: #ffffff;
          border-color: #0071e3;
        }
        .smn-submit-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 9px 16px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .smn-presets-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .smn-presets-lbl {
          font-size: 11.5px;
          color: #6e6e73;
          font-weight: 600;
        }
        .smn-preset-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 113, 227, 0.22);
          background: rgba(0, 113, 227, 0.07);
          color: #0071e3;
          font-size: 11.5px;
          font-weight: 620;
          cursor: pointer;
        }
        .smn-empty {
          padding: 24px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(0, 0, 0, 0.06);
          text-align: center;
          font-size: 13px;
          color: #6e6e73;
        }
        .smn-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 12px;
        }
        .smn-media-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
        }
        .smn-media-card.playing {
          border-color: #0071e3;
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
        }
        .smn-card-play {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: none;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .smn-media-card.playing .smn-card-play {
          background: #0071e3;
          color: #ffffff;
        }
        .smn-card-meta {
          min-width: 0;
          flex: 1;
        }
        .smn-kind-pill {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #6e6e73;
        }
        .smn-card-meta h3, .smn-news-body h3 {
          margin: 2px 0 0;
          font-size: 14px;
          font-weight: 680;
          color: #1d1d1f;
        }
        .smn-card-actions, .smn-news-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .smn-icon-btn {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f5f5f7;
          color: #424245;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          text-decoration: none;
        }
        .smn-icon-btn.danger:hover {
          background: rgba(255, 59, 48, 0.12);
          color: #d70015;
        }
        .smn-origin-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
        }
        .smn-news-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .smn-news-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          padding: 15px 17px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }
        .smn-news-body {
          min-width: 0;
          flex: 1 1 280px;
        }
        .smn-news-body p {
          margin: 4px 0 0;
          font-size: 12.5px;
          color: #6e6e73;
          line-height: 1.4;
        }
        .smn-car-overlay {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: radial-gradient(circle at 50% 20%, #1c2434 0%, #090b10 100%);
          color: #ffffff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 24px 22px 42px;
        }
        .smn-car-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .smn-car-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #2997ff;
        }
        .smn-car-exit {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
        }
        .smn-car-center {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          max-width: 560px;
          margin: 0 auto;
        }
        .smn-car-icon-ring {
          width: 104px;
          height: 104px;
          border-radius: 999px;
          background: rgba(41, 151, 255, 0.16);
          border: 2px solid rgba(41, 151, 255, 0.45);
          color: #2997ff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .smn-car-center h2 {
          margin: 4px 0 0;
          font-size: 28px;
          font-weight: 760;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }
        .smn-car-center p {
          margin: 0;
          font-size: 16px;
          color: #aeaeb2;
        }
        .smn-car-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 28px;
        }
        .smn-car-step {
          width: 68px;
          height: 68px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .smn-car-step:disabled { opacity: 0.3; cursor: not-allowed; }
        .smn-car-play {
          width: 92px;
          height: 92px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 12px 32px rgba(0, 113, 227, 0.5);
        }
      `}</style>
    </div>
  );
}
