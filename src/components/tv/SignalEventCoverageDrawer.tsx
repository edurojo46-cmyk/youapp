import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ExternalLink,
  Heart,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Send,
  Trash2,
  Trophy,
  X
} from 'lucide-react';
import {
  activateEventCoverage,
  addEventComment,
  addEventUpdate,
  deactivateEventCoverage,
  deleteEventUpdate,
  getSignalEventPhase,
  likeEventComment,
  readEventCoverage,
  updateEventScoreboard,
  type SignalEventCategory,
  type SignalEventCoverage,
  type SignalEventMeta,
  type SignalEventUpdateTag
} from '../../lib/tv/signalEventsStore';
import type {
  SignalAudioSource,
  SignalMediaBundle
} from '../../lib/tv/signalMediaSourcesStore';

interface SignalEventCoverageDrawerProps {
  signalId: string;
  signalName: string;
  isOwner: boolean;
  eventMeta?: SignalEventMeta | null;
  mediaBundle: SignalMediaBundle;
  playingAudioId?: string | null;
  isAudioPlaying?: boolean;
  onToggleAudio?: (source: SignalAudioSource) => void;
  onPlayVideoUrl?: (url: string, title?: string) => void;
  onOpenMediaManager?: () => void;
  openRequestTick?: number;
}

function normalizeInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isPlayableVideoUrl(raw?: string): boolean {
  if (!raw) return false;
  const u = raw.trim();
  if (
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i.test(
      u
    )
  ) {
    return true;
  }
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u)) return true;
  return false;
}

type CoverageTab = 'timeline' | 'sources' | 'comments';

const TAG_OPTIONS: { id: SignalEventUpdateTag; label: string; color: string; bg: string }[] = [
  { id: 'DESTACADO', label: 'Destacado', color: '#0071e3', bg: 'rgba(0,113,227,0.1)' },
  { id: 'RESULTADO', label: 'Resultado', color: '#c41e1a', bg: 'rgba(255,59,48,0.12)' },
  { id: 'NOTICIA', label: 'Noticia', color: '#1d1d1f', bg: 'rgba(29,29,31,0.08)' },
  { id: 'VIDEO', label: 'Video', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  { id: 'AUDIO', label: 'Audio', color: '#047857', bg: 'rgba(4,120,87,0.1)' },
  { id: 'DATO', label: 'Dato', color: '#b45309', bg: 'rgba(217,119,6,0.12)' }
];

const QUICK_PRESETS: {
  label: string;
  category: SignalEventCategory;
  mode: 'versus' | 'status';
  leftLabel: string;
  rightLabel: string;
  statusLine: string;
}[] = [
  {
    label: 'Partido / Deporte',
    category: 'Deporte',
    mode: 'versus',
    leftLabel: 'Equipo A',
    rightLabel: 'Equipo B',
    statusLine: '1er Tiempo · En juego'
  },
  {
    label: 'Elecciones / Política',
    category: 'Política / Elecciones',
    mode: 'status',
    leftLabel: 'Escrutinio',
    rightLabel: '',
    statusLine: 'Seguimiento oficial en curso'
  },
  {
    label: 'Festival / Especial',
    category: 'Cultura / Festival',
    mode: 'status',
    leftLabel: 'Escenario',
    rightLabel: '',
    statusLine: 'Transmisión y cobertura abierta'
  }
];

export const SignalEventCoverageDrawer: React.FC<SignalEventCoverageDrawerProps> = ({
  signalId,
  signalName,
  isOwner,
  eventMeta,
  mediaBundle,
  playingAudioId,
  isAudioPlaying,
  onToggleAudio,
  onPlayVideoUrl,
  onOpenMediaManager,
  openRequestTick = 0
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [coverage, setCoverage] = useState<SignalEventCoverage | null>(() =>
    readEventCoverage(signalId)
  );
  const [isOpen, setIsOpen] = useState<boolean>(() => Boolean(readEventCoverage(signalId)?.active));
  const [activeTab, setActiveTab] = useState<CoverageTab>('timeline');

  // Formulario de activación rápida
  const [setupTitle, setSetupTitle] = useState<string>('');
  const [setupCategory, setSetupCategory] = useState<SignalEventCategory>('Deporte');
  const [setupMode, setSetupMode] = useState<'versus' | 'status'>('versus');
  const [setupLeft, setSetupLeft] = useState<string>('Equipo A');
  const [setupRight, setSetupRight] = useState<string>('Equipo B');

  // Edición rápida de marcador
  const [editingScore, setEditingScore] = useState(false);
  const [scLeftLabel, setScLeftLabel] = useState('');
  const [scLeftVal, setScLeftVal] = useState('');
  const [scRightLabel, setScRightLabel] = useState('');
  const [scRightVal, setScRightVal] = useState('');
  const [scStatus, setScStatus] = useState('');

  // Nuevo minuto a minuto
  const [updTag, setUpdTag] = useState<SignalEventUpdateTag>('DESTACADO');
  const [updTime, setUpdTime] = useState('');
  const [updText, setUpdText] = useState('');
  const [updSourceName, setUpdSourceName] = useState('');
  const [updSourceUrl, setUpdSourceUrl] = useState('');

  // Comentario audiencia
  const [cmtAuthor, setCmtAuthor] = useState('');
  const [cmtText, setCmtText] = useState('');

  useEffect(() => {
    const loaded = readEventCoverage(signalId);
    setCoverage(loaded);
    setIsOpen(Boolean(loaded?.active));
  }, [signalId]);

  useEffect(() => {
    if (openRequestTick > 0) {
      setIsOpen(true);
      window.setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
    }
  }, [openRequestTick]);

  const isLiveActive = Boolean(coverage?.active);
  const phaseInfo = eventMeta ? getSignalEventPhase(eventMeta) : null;

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    const created = activateEventCoverage(signalId, {
      title: setupTitle.trim() || `Cobertura en vivo · ${signalName}`,
      category: setupCategory,
      mode: setupMode,
      leftLabel: setupLeft,
      rightLabel: setupRight
    });
    setCoverage(created);
    setIsOpen(true);
    setActiveTab('timeline');
  };

  const startScoreEdit = () => {
    if (!coverage) return;
    setScLeftLabel(coverage.scoreboard.leftLabel);
    setScLeftVal(coverage.scoreboard.leftValue);
    setScRightLabel(coverage.scoreboard.rightLabel);
    setScRightVal(coverage.scoreboard.rightValue);
    setScStatus(coverage.scoreboard.statusLine);
    setEditingScore(true);
  };

  const saveScoreEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = updateEventScoreboard(signalId, {
      leftLabel: scLeftLabel.trim() || 'Local',
      leftValue: scLeftVal.trim() || '0',
      rightLabel: scRightLabel.trim(),
      rightValue: scRightVal.trim(),
      statusLine: scStatus.trim() || 'En curso'
    });
    if (next) setCoverage(next);
    setEditingScore(false);
  };

  const handlePostUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const rawText = updText.trim();
    let normalizedUrl = normalizeInputUrl(updSourceUrl);

    // Si pegó el link directamente en el campo de texto principal, lo detectamos automáticamente
    if (!normalizedUrl && /^https?:\/\/\S+$/i.test(rawText)) {
      normalizedUrl = rawText;
    }

    if (!rawText && !normalizedUrl) return;

    const playable = isPlayableVideoUrl(normalizedUrl);
    const finalText =
      rawText && rawText !== normalizedUrl
        ? rawText
        : playable
        ? 'Video en vivo sumado a la cobertura'
        : 'Actualización con fuente en vivo';
    const finalTag: SignalEventUpdateTag =
      playable && updTag === 'DESTACADO' ? 'VIDEO' : updTag;

    const next = addEventUpdate(signalId, {
      tag: finalTag,
      timeLabel: updTime.trim() || undefined,
      text: finalText,
      sourceName: updSourceName.trim() || (playable ? 'Video en reproductor' : undefined),
      sourceUrl: normalizedUrl || undefined
    });
    if (next) setCoverage(next);

    if (playable && normalizedUrl && onPlayVideoUrl) {
      onPlayVideoUrl(normalizedUrl, finalText);
    }

    setUpdTime('');
    setUpdText('');
    setUpdSourceName('');
    setUpdSourceUrl('');
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmtText.trim()) return;
    const next = addEventComment(signalId, cmtAuthor.trim() || 'Espectador YOUAPP', cmtText.trim());
    if (next) setCoverage(next);
    setCmtText('');
  };

  const getTagStyle = (tag: SignalEventUpdateTag) =>
    TAG_OPTIONS.find((t) => t.id === tag) || TAG_OPTIONS[0];

  return (
    <div ref={containerRef} className={`ms-evcov-drawer ${isLiveActive ? 'is-live' : ''}`}>
      <button
        type="button"
        className="ms-evcov-toggle"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <span className="ms-evcov-toggle-left">
          <span className={`ms-evcov-icon ${isLiveActive ? 'live' : ''}`}>
            <Activity size={13} />
          </span>
          <span className="ms-evcov-toggle-texts">
            <strong>
              {isLiveActive
                ? coverage?.title || 'Cobertura en vivo'
                : 'Cobertura en vivo de acontecimientos'}
            </strong>
            <span>
              {isLiveActive
                ? `${coverage?.updates.length || 0} actualizaciones · ${coverage?.comments.length || 0} comentarios`
                : phaseInfo
                ? `${phaseInfo.badge} · ${phaseInfo.detail}`
                : 'Marcador, minuto a minuto, fuentes y comentarios'}
            </span>
          </span>
        </span>
        <span className="ms-evcov-toggle-right">
          {isLiveActive && <span className="ms-evcov-live-pill">● EN VIVO</span>}
          <ChevronDown
            size={14}
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.16s ease'
            }}
          />
        </span>
      </button>

      {isOpen && (
        <div className="ms-evcov-body">
          {!isLiveActive ? (
            isOwner ? (
              <form className="ms-evcov-setup" onSubmit={handleActivate}>
                <p className="ms-evcov-intro">
                  Organizá videos, audio, noticias, resultados y comentarios durante un evento real
                  sin servidores de streaming propios.
                </p>

                <div className="ms-evcov-presets">
                  {QUICK_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={`ms-evcov-preset-btn ${
                        setupCategory === p.category && setupMode === p.mode ? 'active' : ''
                      }`}
                      onClick={() => {
                        setSetupCategory(p.category);
                        setSetupMode(p.mode);
                        setSetupLeft(p.leftLabel);
                        setSetupRight(p.rightLabel);
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  className="ms-evcov-input"
                  value={setupTitle}
                  onChange={(e) => setSetupTitle(e.target.value)}
                  placeholder={`Título del acontecimiento (ej. Final Copa · ${signalName})`}
                />

                {setupMode === 'versus' ? (
                  <div className="ms-evcov-row-2">
                    <input
                      type="text"
                      className="ms-evcov-input"
                      value={setupLeft}
                      onChange={(e) => setSetupLeft(e.target.value)}
                      placeholder="Local / Lado A"
                    />
                    <input
                      type="text"
                      className="ms-evcov-input"
                      value={setupRight}
                      onChange={(e) => setSetupRight(e.target.value)}
                      placeholder="Visitante / Lado B"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    className="ms-evcov-input"
                    value={setupLeft}
                    onChange={(e) => setSetupLeft(e.target.value)}
                    placeholder="Etiqueta de estado (ej. Escrutinio, Escenario, Situación)"
                  />
                )}

                <button type="submit" className="ms-evcov-primary-btn">
                  <Activity size={13} />
                  <span>Activar Cobertura en Vivo</span>
                </button>
              </form>
            ) : (
              <div className="ms-evcov-empty">
                Esta señal no tiene una cobertura de acontecimiento activa en este momento.
              </div>
            )
          ) : (
            coverage && (
              <>
                {/* Marcador / Estado en Vivo */}
                <div className="ms-evcov-scoreboard">
                  <div className="ms-evcov-score-head">
                    <span className="ms-evcov-cat-pill">
                      <Trophy size={11} />
                      <span>{coverage.category}</span>
                    </span>
                    <div className="ms-evcov-score-head-actions">
                      {isOwner && !editingScore && (
                        <button
                          type="button"
                          className="ms-evcov-mini-btn"
                          onClick={startScoreEdit}
                          title="Editar marcador o estado"
                        >
                          <Pencil size={11} />
                          <span>Editar</span>
                        </button>
                      )}
                      {isOwner && (
                        <button
                          type="button"
                          className="ms-evcov-mini-btn danger"
                          onClick={() => {
                            const stopped = deactivateEventCoverage(signalId);
                            setCoverage(stopped);
                          }}
                          title="Finalizar cobertura en vivo"
                        >
                          <X size={11} />
                          <span>Finalizar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {editingScore ? (
                    <form className="ms-evcov-score-edit" onSubmit={saveScoreEdit}>
                      {coverage.scoreboard.mode === 'versus' ? (
                        <>
                          <div className="ms-evcov-row-2">
                            <input
                              type="text"
                              className="ms-evcov-input"
                              value={scLeftLabel}
                              onChange={(e) => setScLeftLabel(e.target.value)}
                              placeholder="Local"
                            />
                            <input
                              type="text"
                              className="ms-evcov-input center"
                              value={scLeftVal}
                              onChange={(e) => setScLeftVal(e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="ms-evcov-row-2">
                            <input
                              type="text"
                              className="ms-evcov-input"
                              value={scRightLabel}
                              onChange={(e) => setScRightLabel(e.target.value)}
                              placeholder="Visitante"
                            />
                            <input
                              type="text"
                              className="ms-evcov-input center"
                              value={scRightVal}
                              onChange={(e) => setScRightVal(e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="ms-evcov-row-2">
                          <input
                            type="text"
                            className="ms-evcov-input"
                            value={scLeftLabel}
                            onChange={(e) => setScLeftLabel(e.target.value)}
                            placeholder="Indicador"
                          />
                          <input
                            type="text"
                            className="ms-evcov-input"
                            value={scLeftVal}
                            onChange={(e) => setScLeftVal(e.target.value)}
                            placeholder="Valor / Estado"
                          />
                        </div>
                      )}
                      <input
                        type="text"
                        className="ms-evcov-input"
                        value={scStatus}
                        onChange={(e) => setScStatus(e.target.value)}
                        placeholder="Estado (ej. 2do Tiempo · 78' o Mesas escrutadas 64%)"
                      />
                      <div className="ms-evcov-row-2">
                        <button type="submit" className="ms-evcov-primary-btn">
                          Guardar marcador
                        </button>
                        <button
                          type="button"
                          className="ms-evcov-ghost-btn"
                          onClick={() => setEditingScore(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : coverage.scoreboard.mode === 'versus' ? (
                    <div className="ms-evcov-versus-box">
                      <div className="ms-evcov-team">
                        <span>{coverage.scoreboard.leftLabel}</span>
                        <strong>{coverage.scoreboard.leftValue}</strong>
                      </div>
                      <span className="ms-evcov-vs-sep">–</span>
                      <div className="ms-evcov-team">
                        <span>{coverage.scoreboard.rightLabel}</span>
                        <strong>{coverage.scoreboard.rightValue}</strong>
                      </div>
                      <div className="ms-evcov-status-line">{coverage.scoreboard.statusLine}</div>
                    </div>
                  ) : (
                    <div className="ms-evcov-status-box">
                      <span className="ms-evcov-status-label">{coverage.scoreboard.leftLabel}</span>
                      <strong className="ms-evcov-status-val">{coverage.scoreboard.leftValue}</strong>
                      <span className="ms-evcov-status-line">{coverage.scoreboard.statusLine}</span>
                    </div>
                  )}
                </div>

                {/* Pestañas internas */}
                <div className="ms-evcov-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'timeline'}
                    className={`ms-evcov-tab ${activeTab === 'timeline' ? 'active' : ''}`}
                    onClick={() => setActiveTab('timeline')}
                  >
                    Minuto a minuto ({coverage.updates.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'sources'}
                    className={`ms-evcov-tab ${activeTab === 'sources' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sources')}
                  >
                    Fuentes ({mediaBundle.audio.length + mediaBundle.news.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'comments'}
                    className={`ms-evcov-tab ${activeTab === 'comments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('comments')}
                  >
                    Comentarios ({coverage.comments.length})
                  </button>
                </div>

                {/* TAB 1: MINUTO A MINUTO */}
                {activeTab === 'timeline' && (
                  <div className="ms-evcov-section">
                    {isOwner && (
                      <form className="ms-evcov-post-form" onSubmit={handlePostUpdate}>
                        <div className="ms-evcov-tag-row">
                          {TAG_OPTIONS.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className={`ms-evcov-tag-pill ${updTag === t.id ? 'active' : ''}`}
                              style={
                                updTag === t.id
                                  ? { background: t.color, color: '#fff', borderColor: t.color }
                                  : undefined
                              }
                              onClick={() => setUpdTag(t.id)}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <div className="ms-evcov-row-time">
                          <input
                            type="text"
                            className="ms-evcov-input time"
                            value={updTime}
                            onChange={(e) => setUpdTime(e.target.value)}
                            placeholder="Hora / Min"
                          />
                          <input
                            type="text"
                            className="ms-evcov-input"
                            value={updText}
                            onChange={(e) => setUpdText(e.target.value)}
                            placeholder="Publicá una actualización en vivo…"
                          />
                        </div>
                        <div className="ms-evcov-row-2">
                          <input
                            type="text"
                            className="ms-evcov-input small"
                            value={updSourceName}
                            onChange={(e) => setUpdSourceName(e.target.value)}
                            placeholder="Fuente autorizada (opcional)"
                          />
                          <input
                            type="text"
                            className="ms-evcov-input small"
                            value={updSourceUrl}
                            onChange={(e) => setUpdSourceUrl(e.target.value)}
                            placeholder="URL YouTube / video o nota"
                          />
                        </div>
                        <button type="submit" className="ms-evcov-primary-btn">
                          <Send size={12} />
                          <span>Publicar en minuto a minuto</span>
                        </button>
                      </form>
                    )}

                    <div className="ms-evcov-timeline">
                      {coverage.updates.length === 0 ? (
                        <div className="ms-evcov-empty">Sin actualizaciones todavía.</div>
                      ) : (
                        coverage.updates.map((u) => {
                          const st = getTagStyle(u.tag);
                          return (
                            <div key={u.id} className="ms-evcov-upd-card">
                              <div className="ms-evcov-upd-head">
                                <span className="ms-evcov-upd-time">{u.timeLabel}</span>
                                <span
                                  className="ms-evcov-upd-tag"
                                  style={{ color: st.color, background: st.bg }}
                                >
                                  {st.label}
                                </span>
                                {isOwner && (
                                  <button
                                    type="button"
                                    className="ms-evcov-del-btn"
                                    onClick={() => {
                                      const next = deleteEventUpdate(signalId, u.id);
                                      if (next) setCoverage(next);
                                    }}
                                    title="Quitar actualización"
                                    aria-label="Quitar actualización"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                              <p className="ms-evcov-upd-text">{u.text}</p>
                              {(u.sourceName || u.sourceUrl) && (
                                <div className="ms-evcov-upd-source">
                                  {u.sourceUrl && isPlayableVideoUrl(u.sourceUrl) && onPlayVideoUrl && (
                                    <button
                                      type="button"
                                      className="ms-evcov-watch-btn"
                                      onClick={() => onPlayVideoUrl(u.sourceUrl!, u.text)}
                                    >
                                      <Play size={10} />
                                      <span>Ver en reproductor</span>
                                    </button>
                                  )}
                                  {u.sourceUrl ? (
                                    <a
                                      href={u.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <span>Fuente: {u.sourceName || u.sourceUrl}</span>
                                      <ExternalLink size={11} />
                                    </a>
                                  ) : (
                                    <span>Fuente: {u.sourceName}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: FUENTES DEL EVENTO */}
                {activeTab === 'sources' && (
                  <div className="ms-evcov-section">
                    <p className="ms-evcov-sources-note">
                      Fuentes autorizadas reunidas para este acontecimiento (sin retransmisión propia):
                    </p>

                    {mediaBundle.audio.length > 0 && (
                      <div className="ms-evcov-source-group">
                        <span className="ms-evcov-subhead">
                          <Radio size={11} /> Relatos y Radio en vivo
                        </span>
                        {mediaBundle.audio.map((aud) => {
                          const playing = playingAudioId === aud.id && isAudioPlaying;
                          return (
                            <div key={aud.id} className="ms-evcov-source-row">
                              <button
                                type="button"
                                className={`ms-evcov-play-btn ${playing ? 'playing' : ''}`}
                                onClick={() => onToggleAudio?.(aud)}
                                aria-label={playing ? `Pausar ${aud.title}` : `Escuchar ${aud.title}`}
                              >
                                {playing ? <Pause size={11} /> : <Play size={11} />}
                              </button>
                              <div className="ms-evcov-source-meta">
                                <strong>{aud.title}</strong>
                                <span>{aud.author}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {mediaBundle.news.length > 0 && (
                      <div className="ms-evcov-source-group">
                        <span className="ms-evcov-subhead">Noticias y crónicas</span>
                        {mediaBundle.news.map((n) => (
                          <a
                            key={n.id}
                            href={n.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ms-evcov-source-row link"
                          >
                            <div className="ms-evcov-source-meta">
                              <strong>{n.title}</strong>
                              <span>{n.sourceName}</span>
                            </div>
                            <ExternalLink size={12} color="#6e6e73" />
                          </a>
                        ))}
                      </div>
                    )}

                    {mediaBundle.audio.length === 0 && mediaBundle.news.length === 0 && (
                      <div className="ms-evcov-empty">
                        Todavía no sumaste radios ni noticias a esta señal.
                      </div>
                    )}

                    {onOpenMediaManager && (
                      <button
                        type="button"
                        className="ms-evcov-ghost-btn"
                        onClick={onOpenMediaManager}
                      >
                        <Plus size={12} />
                        <span>Sumar radios o noticias al evento</span>
                      </button>
                    )}
                  </div>
                )}

                {/* TAB 3: COMENTARIOS */}
                {activeTab === 'comments' && (
                  <div className="ms-evcov-section">
                    <form className="ms-evcov-post-form" onSubmit={handlePostComment}>
                      <input
                        type="text"
                        className="ms-evcov-input small"
                        value={cmtAuthor}
                        onChange={(e) => setCmtAuthor(e.target.value)}
                        placeholder="Tu nombre (opcional)"
                      />
                      <div className="ms-evcov-row-send">
                        <input
                          type="text"
                          className="ms-evcov-input"
                          value={cmtText}
                          onChange={(e) => setCmtText(e.target.value)}
                          placeholder="Sumá tu comentario del evento…"
                        />
                        <button type="submit" className="ms-evcov-send-icon-btn" aria-label="Enviar comentario">
                          <Send size={13} />
                        </button>
                      </div>
                    </form>

                    <div className="ms-evcov-comments">
                      {coverage.comments.length === 0 ? (
                        <div className="ms-evcov-empty">
                          <MessageSquare size={14} style={{ opacity: 0.5 }} />
                          <span>Sé el primero en comentar este acontecimiento.</span>
                        </div>
                      ) : (
                        coverage.comments.map((c) => (
                          <div key={c.id} className="ms-evcov-cmt-card">
                            <div className="ms-evcov-cmt-head">
                              <strong>{c.author}</strong>
                              <button
                                type="button"
                                className="ms-evcov-like-btn"
                                onClick={() => {
                                  const next = likeEventComment(signalId, c.id);
                                  if (next) setCoverage(next);
                                }}
                              >
                                <Heart size={11} />
                                <span>{c.likes}</span>
                              </button>
                            </div>
                            <p>{c.text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}

      <style>{`
        .ms-evcov-drawer {
          margin: 10px 14px 4px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(0, 0, 0, 0.08);
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
        }
        .ms-evcov-drawer.is-live {
          border-color: rgba(255, 59, 48, 0.3);
          box-shadow: 0 4px 16px rgba(255, 59, 48, 0.08);
        }
        .ms-evcov-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 13px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          color: #1d1d1f;
        }
        .ms-evcov-toggle-left {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }
        .ms-evcov-icon {
          width: 28px;
          height: 28px;
          border-radius: 9px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ms-evcov-icon.live {
          background: rgba(255, 59, 48, 0.14);
          color: #ff3b30;
        }
        .ms-evcov-toggle-texts {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .ms-evcov-toggle-texts strong {
          font-size: 12.5px;
          font-weight: 700;
          color: #1d1d1f;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-evcov-toggle-texts span {
          font-size: 11px;
          color: #6e6e73;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-evcov-toggle-right {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #6e6e73;
          flex-shrink: 0;
        }
        .ms-evcov-live-pill {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #ff3b30;
          background: rgba(255, 59, 48, 0.12);
          padding: 3px 7px;
          border-radius: 999px;
        }
        .ms-evcov-body {
          padding: 0 13px 13px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ms-evcov-setup {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 10px;
        }
        .ms-evcov-intro, .ms-evcov-sources-note {
          margin: 0;
          font-size: 11.5px;
          line-height: 1.4;
          color: #6e6e73;
        }
        .ms-evcov-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ms-evcov-preset-btn {
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 9px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ms-evcov-preset-btn.active {
          background: #1d1d1f;
          color: #fff;
          border-color: #1d1d1f;
        }
        .ms-evcov-input {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          font-size: 12px;
          color: #1d1d1f;
          outline: none;
        }
        .ms-evcov-input:focus {
          border-color: #0071e3;
        }
        .ms-evcov-input.small {
          padding: 6px 9px;
          font-size: 11.5px;
        }
        .ms-evcov-input.center {
          text-align: center;
          font-weight: 700;
        }
        .ms-evcov-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .ms-evcov-row-time {
          display: grid;
          grid-template-columns: 78px 1fr;
          gap: 6px;
        }
        .ms-evcov-row-send {
          display: flex;
          gap: 6px;
        }
        .ms-evcov-primary-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 10px;
          border: none;
          background: #0071e3;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ms-evcov-ghost-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          color: #1d1d1f;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .ms-evcov-scoreboard {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 13px;
          background: linear-gradient(135deg, #fbfbfd 0%, #f2f4f8 100%);
          border: 1px solid rgba(0, 0, 0, 0.07);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ms-evcov-score-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ms-evcov-cat-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 700;
          color: #1d1d1f;
        }
        .ms-evcov-score-head-actions {
          display: flex;
          gap: 5px;
        }
        .ms-evcov-mini-btn {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #fff;
          color: #1d1d1f;
          font-size: 10.5px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ms-evcov-mini-btn.danger {
          color: #c41e1a;
          border-color: rgba(255, 59, 48, 0.25);
        }
        .ms-evcov-versus-box {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 6px;
          text-align: center;
        }
        .ms-evcov-team {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .ms-evcov-team span {
          font-size: 11px;
          font-weight: 600;
          color: #515154;
        }
        .ms-evcov-team strong {
          font-size: 22px;
          font-weight: 800;
          color: #1d1d1f;
          line-height: 1.1;
        }
        .ms-evcov-vs-sep {
          font-size: 18px;
          font-weight: 700;
          color: #86868b;
        }
        .ms-evcov-status-line {
          grid-column: 1 / -1;
          font-size: 11px;
          font-weight: 600;
          color: #0071e3;
          text-align: center;
          margin-top: 2px;
        }
        .ms-evcov-status-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          text-align: center;
        }
        .ms-evcov-status-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6e6e73;
        }
        .ms-evcov-status-val {
          font-size: 16px;
          font-weight: 800;
          color: #1d1d1f;
        }
        .ms-evcov-score-edit {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ms-evcov-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
          background: #f2f2f7;
          padding: 3px;
          border-radius: 10px;
        }
        .ms-evcov-tab {
          border: none;
          background: transparent;
          color: #515154;
          font-size: 11px;
          font-weight: 600;
          padding: 6px 4px;
          border-radius: 8px;
          cursor: pointer;
        }
        .ms-evcov-tab.active {
          background: #fff;
          color: #1d1d1f;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        .ms-evcov-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ms-evcov-post-form {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 9px;
          border-radius: 11px;
          background: #f9f9fb;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }
        .ms-evcov-tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .ms-evcov-tag-pill {
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #fff;
          color: #515154;
          font-size: 10.5px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ms-evcov-timeline, .ms-evcov-comments {
          display: flex;
          flex-direction: column;
          gap: 7px;
          max-height: 280px;
          overflow-y: auto;
        }
        .ms-evcov-upd-card, .ms-evcov-cmt-card {
          padding: 9px 10px;
          border-radius: 11px;
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.07);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ms-evcov-upd-head, .ms-evcov-cmt-head {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ms-evcov-upd-time {
          font-size: 11px;
          font-weight: 800;
          color: #1d1d1f;
          font-variant-numeric: tabular-nums;
        }
        .ms-evcov-upd-tag {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 999px;
        }
        .ms-evcov-del-btn {
          margin-left: auto;
          border: none;
          background: transparent;
          color: #86868b;
          cursor: pointer;
          padding: 2px;
        }
        .ms-evcov-upd-text, .ms-evcov-cmt-card p {
          margin: 0;
          font-size: 12px;
          line-height: 1.4;
          color: #1d1d1f;
        }
        .ms-evcov-upd-source {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: #0071e3;
        }
        .ms-evcov-watch-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: none;
          background: #0071e3;
          color: #fff;
          font-size: 10.5px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ms-evcov-watch-btn:hover {
          background: #0062c4;
        }
        .ms-evcov-upd-source a {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #0071e3;
          text-decoration: none;
          font-weight: 600;
        }
        .ms-evcov-source-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .ms-evcov-subhead {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 700;
          color: #6e6e73;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ms-evcov-source-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 9px;
          border-radius: 10px;
          background: #f9f9fb;
          border: 1px solid rgba(0, 0, 0, 0.06);
          text-decoration: none;
          color: #1d1d1f;
        }
        .ms-evcov-source-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .ms-evcov-source-meta strong {
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-evcov-source-meta span {
          font-size: 11px;
          color: #6e6e73;
        }
        .ms-evcov-play-btn {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: none;
          background: #1d1d1f;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ms-evcov-play-btn.playing {
          background: #0071e3;
        }
        .ms-evcov-send-icon-btn {
          width: 34px;
          border-radius: 10px;
          border: none;
          background: #0071e3;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ms-evcov-cmt-head strong {
          font-size: 11.5px;
          color: #1d1d1f;
        }
        .ms-evcov-like-btn {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f5f5f7;
          color: #515154;
          font-size: 10.5px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ms-evcov-empty {
          padding: 12px 8px;
          font-size: 11.5px;
          color: #6e6e73;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
      `}</style>
    </div>
  );
};
