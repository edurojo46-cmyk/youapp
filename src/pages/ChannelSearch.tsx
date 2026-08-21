/**
 * ChannelSearch — Buscador de Canales de YouTube para YouApp
 * 
 * - Motor: YouTube InnerTube API (resultados reales de YouTube sin API Key)
 * - Scroll completo y fluido optimizado para desktop y mobile
 * - Diseño UI Dark Neon acorde a YouApp TV
 * - Botón "Agregar a mi señal" integrado con LiveZapping y Supabase
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Mic, MicOff, ArrowLeft,
  Clock, TrendingUp, Trash2, ArrowUpLeft, Loader2,
  CheckCircle2, ExternalLink, Tv, Radio, Plus, Check, Play, Sparkles
} from 'lucide-react';
import { UNIVERSAL_CATALOG, type UniversalChannel } from '../lib/universalChannels';
import { fetchYouTubeLiveSuggestions } from '../lib/youtube';
import { searchYouTubeChannels, resolveChannelPlayable, type YTChannelResult } from '../lib/youtubeChannelSearch';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';

// ── Historial y Canales Guardados ─────────────────────────────────────────────
const HIST_KEY = 'youapp_chsearch_v4';
const SAVED_CHANNELS_KEY = 'youapp_saved_custom_channels';

const getHist = (): string[] => {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
};
const saveHist = (q: string) => {
  const h = getHist().filter(x => x !== q);
  localStorage.setItem(HIST_KEY, JSON.stringify([q, ...h].slice(0, 15)));
};
const clearHist = () => localStorage.removeItem(HIST_KEY);
const removeHist = (q: string) =>
  localStorage.setItem(HIST_KEY, JSON.stringify(getHist().filter(x => x !== q)));

const getSavedCustomChannels = (): UniversalChannel[] => {
  try { return JSON.parse(localStorage.getItem(SAVED_CHANNELS_KEY) || '[]'); } catch { return []; }
};

const TRENDING_SUGGESTIONS = [
  'América TV',
  'Crónica TV',
  'TN Todo Noticias',
  'LUZU TV',
  'Prensa Solidaria',
  'Carnaval Stream',
  'NASA TV',
  'Ibai Llanos',
  'Lofi Girl',
  'Bizarrap',
  'MrBeast en Español',
  'La Nación+'
];

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

export default function ChannelSearch() {
  const navigate = useNavigate();
  const { user } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [history, setHistory] = useState<string[]>(getHist);
  const [hints, setHints] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);

  const [results, setResults] = useState<YTChannelResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [isLiveSearch, setIsLiveSearch] = useState(true);

  // Canales guardados en la señal del usuario
  const [savedChannels, setSavedChannels] = useState<UniversalChannel[]>(getSavedCustomChannels);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Set de IDs guardados para renderizado instantáneo
  const savedChannelIds = useMemo(() => {
    const ids = new Set<string>();
    savedChannels.forEach(c => {
      if (c.channelId) ids.add(c.channelId);
      if (c.id) ids.add(c.id.replace(/^custom-yt-/, ''));
    });
    return ids;
  }, [savedChannels]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Autocompletado dinámico ────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setHints([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      // Sugerencias de YouTube
      const yt = await fetchYouTubeLiveSuggestions(query + ' canal');
      if (!active) return;
      setHints(yt.filter(s => s.length < 50).slice(0, 6));
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  // ── Búsqueda de Canales con InnerTube ───────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setCommitted(trimmed);
    setStatus('loading');
    setResults([]);
    setShowDrop(false);
    saveHist(trimmed);
    setHistory(getHist());
    inputRef.current?.blur();

    // Scroll to top of list
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      const ytResults = await searchYouTubeChannels(trimmed, 30);
      if (ytResults && ytResults.length > 0) {
        setResults(ytResults);
        setIsLiveSearch(true);
        setStatus('done');
        return;
      }
    } catch {
      // Intento con catálogo local si no hubo conexión
    }

    // Fallback local
    const qLower = trimmed.toLowerCase();
    const local = UNIVERSAL_CATALOG
      .filter(ch =>
        ch.name.toLowerCase().includes(qLower) ||
        (ch.category && ch.category.toLowerCase().includes(qLower)) ||
        (ch.description && ch.description.toLowerCase().includes(qLower))
      )
      .map((ch): YTChannelResult => ({
        channelId: ch.channelId || ch.id,
        name: ch.name,
        handle: `@${ch.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}`,
        subscribers: `${Math.round(ch.viewerCount * 6 / 1000)}K suscriptores`,
        videoCount: 'Canal Oficial',
        description: ch.description,
        avatarUrl: ch.avatarUrl,
        isVerified: true,
        channelUrl: ch.videoId ? `https://youtube.com/watch?v=${ch.videoId}` : `https://youtube.com/`
      }));

    setResults(local);
    setIsLiveSearch(false);
    setStatus('done');
  }, []);

  // ── Búsqueda por Voz ───────────────────────────────────────────────────────
  const startVoiceSearch = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Tu navegador no soporta búsqueda por voz');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      if (text) {
        setQuery(text);
        doSearch(text);
      }
    };
    recognition.start();
  };

  // ── Agregar / Quitar de Mi Señal ──────────────────────────────────────────
  const toggleAddToSignal = async (ch: YTChannelResult): Promise<UniversalChannel | null> => {
    const exists = savedChannelIds.has(ch.channelId);
    let updatedList: UniversalChannel[] = [];

    if (exists) {
      // Quitar de la señal
      updatedList = savedChannels.filter(c =>
        c.channelId !== ch.channelId && c.id !== `custom-yt-${ch.channelId}`
      );
      setToastMessage(`Canal "${ch.name}" removido de tu señal`);
      setSavedChannels(updatedList);
      localStorage.setItem(SAVED_CHANNELS_KEY, JSON.stringify(updatedList));
      return null;
    } else {
      // 1. Resolver señal en vivo o últimos programas cronológicos del canal 24/7
      const playable = await resolveChannelPlayable(ch.channelId, ch.name);

      // 2. Construir canal para YouApp TV
      const newChannel: UniversalChannel = {
        id: `custom-yt-${ch.channelId}`,
        name: ch.name,
        category: '🌟 Mi Señal Personal',
        description: ch.description || `Transmisión oficial de ${ch.name}`,
        avatarUrl: ch.avatarUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400',
        thumbnail: ch.avatarUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
        provider: 'youtube',
        channelId: ch.channelId,
        videoId: playable.videoId || undefined,
        videoUrl: playable.videoUrl,
        currentVideoTitle: playable.title ? `Ahora: ${playable.title}` : `Transmisión en Vivo: ${ch.name}`,
        viewerCount: Math.floor(Math.random() * 4000) + 1500,
        isLive: true,
        tags: [ch.name.toLowerCase(), 'custom', 'mi-señal', 'youtube']
      };

      updatedList = [newChannel, ...savedChannels];
      setSavedChannels(updatedList);
      localStorage.setItem(SAVED_CHANNELS_KEY, JSON.stringify(updatedList));
      setToastMessage(`¡"${ch.name}" agregado y sintonizado en tu Señal! 📺`);

      // Guardar también en base de datos Supabase si el usuario está autenticado
      if (user) {
        try {
          const slug = ch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          await supabase.from('channels').insert({
            user_id: user.id,
            name: ch.name,
            slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
            category: 'YouTube TV',
            is_24_7: true
          });
        } catch {
          // Si falla inserción en Supabase, el canal sigue guardado en localStorage
        }
      }

      setTimeout(() => {
        setToastMessage(null);
      }, 4000);

      return newChannel;
    }
  };

  // ── Sintonizar directo en YouApp TV Live ────────────────────────────────────
  const tuneInDirect = async (ch: YTChannelResult) => {
    // 1. Resolver señal fresca con los programas más recientes
    const playable = await resolveChannelPlayable(ch.channelId, ch.name);
    const targetId = `custom-yt-${ch.channelId}`;

    const newChannel: UniversalChannel = {
      id: targetId,
      name: ch.name,
      category: '🌟 Mi Señal Personal',
      description: ch.description || `Transmisión oficial de ${ch.name}`,
      avatarUrl: ch.avatarUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400',
      thumbnail: ch.avatarUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
      provider: 'youtube',
      channelId: ch.channelId,
      videoId: playable.videoId || undefined,
      videoUrl: playable.videoUrl,
      currentVideoTitle: playable.title ? `Ahora: ${playable.title}` : `Transmisión en Vivo: ${ch.name}`,
      viewerCount: Math.floor(Math.random() * 4000) + 1500,
      isLive: playable.isLive,
      tags: [ch.name.toLowerCase(), 'custom', 'mi-señal', 'youtube']
    };

    // Actualizar lista guardada con la señal fresca
    const filtered = savedChannels.filter(c => c.channelId !== ch.channelId && c.id !== targetId);
    const updated = [newChannel, ...filtered];
    setSavedChannels(updated);
    localStorage.setItem(SAVED_CHANNELS_KEY, JSON.stringify(updated));

    // 2. Establecer como canal activo
    localStorage.setItem('youapp_active_channel_id', targetId);

    // 3. Navegar a TV en vivo
    navigate('/live');
  };

  const hasCommitted = committed.trim().length > 0;

  return (
    <div className="youapp-search-page" ref={scrollContainerRef}>

      {/* ══════════════════════════ TOPBAR ════════════════════════════════════ */}
      <header className="youapp-search-header">
        <div className="header-inner">
          <button className="nav-back-button" onClick={() => navigate(-1)} title="Volver">
            <ArrowLeft size={22} />
          </button>

          <div className="search-bar-wrapper">
            <div className={`search-input-box ${showDrop ? 'is-focused' : ''}`}>
              <Search size={20} className="search-lead-icon" />
              <input
                ref={inputRef}
                className="search-main-input"
                type="text"
                placeholder="Buscar canales de YouTube (ej. América TV, Prensa Solidaria...)"
                value={query}
                autoComplete="off"
                onChange={e => {
                  setQuery(e.target.value);
                  setShowDrop(true);
                }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 240)}
                onKeyDown={e => {
                  if (e.key === 'Enter') doSearch(query);
                  if (e.key === 'Escape') setShowDrop(false);
                }}
              />
              {query && (
                <button
                  className="search-clear-btn"
                  onClick={() => {
                    setQuery('');
                    setHints([]);
                    inputRef.current?.focus();
                  }}
                  title="Borrar texto"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <button
              className="search-submit-btn"
              onClick={() => doSearch(query)}
              title="Buscar canales"
            >
              <Search size={20} />
              <span>Buscar</span>
            </button>

            <button
              className={`search-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={startVoiceSearch}
              title="Buscar por voz"
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* ── DROPDOWN AUTOCOMPLETADO & HISTORIAL ── */}
            {showDrop && (
              <div className="search-dropdown-menu">
                {/* Historial Reciente */}
                {!query.trim() && history.length > 0 && (
                  <div className="dropdown-section">
                    <div className="dropdown-section-title">
                      <span><Clock size={13} /> Búsquedas recientes</span>
                      <button
                        className="clear-history-btn"
                        onMouseDown={() => {
                          clearHist();
                          setHistory([]);
                        }}
                      >
                        <Trash2 size={12} /> Borrar historial
                      </button>
                    </div>
                    {history.slice(0, 6).map(h => (
                      <div
                        key={h}
                        className="dropdown-row"
                        onMouseDown={() => {
                          setQuery(h);
                          doSearch(h);
                        }}
                      >
                        <Clock size={16} className="dropdown-row-icon muted" />
                        <span className="dropdown-row-text">{h}</span>
                        <button
                          className="dropdown-remove-item"
                          onMouseDown={e => {
                            e.stopPropagation();
                            removeHist(h);
                            setHistory(getHist());
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sugerencias de Autocompletado */}
                {query.trim() && hints.length > 0 && (
                  <div className="dropdown-section">
                    {hints.map((hint, idx) => (
                      <div
                        key={idx}
                        className="dropdown-row"
                        onMouseDown={() => {
                          setQuery(hint);
                          doSearch(hint);
                        }}
                      >
                        <Search size={16} className="dropdown-row-icon" />
                        <span className="dropdown-row-text">{hint}</span>
                        <ArrowUpLeft size={14} className="dropdown-row-arrow" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Canales Populares */}
                {!query.trim() && (
                  <div className="dropdown-section">
                    <div className="dropdown-section-title">
                      <span><TrendingUp size={13} /> Canales destacados</span>
                    </div>
                    <div className="trending-tags-grid">
                      {TRENDING_SUGGESTIONS.map(tag => (
                        <button
                          key={tag}
                          className="trending-chip"
                          onMouseDown={() => {
                            setQuery(tag);
                            doSearch(tag);
                          }}
                        >
                          <Sparkles size={12} />
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════ CUERPO PRINCIPAL ═══════════════════════════ */}
      <main className="youapp-search-main">

        {/* Estado Inicial */}
        {!hasCommitted && status === 'idle' && (
          <div className="search-welcome-state">
            <div className="welcome-glow-icon">
              <Tv size={48} />
            </div>
            <h2>Buscador de Canales de YouTube</h2>
            <p>
              Explora cualquier canal de YouTube, agrégalo a tu señal personalizada de YouApp TV y transmítelo en vivo las 24 horas.
            </p>

            <div className="welcome-quick-pills">
              <span className="pills-title">Prueba buscando:</span>
              <div className="pills-flex">
                {TRENDING_SUGGESTIONS.slice(0, 8).map(tag => (
                  <button
                    key={tag}
                    className="quick-pill-button"
                    onClick={() => {
                      setQuery(tag);
                      doSearch(tag);
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cargando */}
        {status === 'loading' && (
          <div className="search-loading-state">
            <div className="loading-spinner-wrap">
              <Loader2 size={42} className="spin-animation" />
            </div>
            <h3>Buscando canales en YouTube...</h3>
            <p className="loading-term">"{committed}"</p>
          </div>
        )}

        {/* Barra de Estado de Resultados */}
        {status === 'done' && results.length > 0 && (
          <div className="results-status-banner">
            <div className="banner-left">
              <CheckCircle2 size={16} className="text-neon-cyan" />
              <span>
                <strong>{results.length}</strong> canales encontrados para "<strong>{committed}</strong>"
              </span>
            </div>
            {isLiveSearch && (
              <div className="live-source-badge">
                <Radio size={12} />
                <span>Base oficial YouTube</span>
              </div>
            )}
          </div>
        )}

        {/* Sin Resultados */}
        {status === 'done' && results.length === 0 && (
          <div className="search-empty-state">
            <Search size={54} className="empty-icon" />
            <h3>No encontramos canales para "{committed}"</h3>
            <p>Intenta con otro nombre, handle (@...) o categoría.</p>
            <div className="pills-flex" style={{ marginTop: '1rem' }}>
              {TRENDING_SUGGESTIONS.slice(0, 5).map(tag => (
                <button
                  key={tag}
                  className="quick-pill-button"
                  onClick={() => {
                    setQuery(tag);
                    doSearch(tag);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════ LISTA DE CANALES CON SCROLL FLUIDO ═════════════ */}
        <div className="channels-results-list">
          {results.map((ch, idx) => {
            const isAdded = savedChannelIds.has(ch.channelId);

            return (
              <article
                key={`${ch.channelId}-${idx}`}
                className={`channel-card-item ${isAdded ? 'is-in-signal' : ''}`}
                style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
              >
                {/* Avatar del Canal */}
                <div className="channel-avatar-column">
                  <div className="avatar-frame">
                    <img
                      src={
                        ch.avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.name)}&background=18152e&color=00f0ff&size=120&bold=true`
                      }
                      alt={ch.name}
                      className="channel-avatar-img"
                      onError={e => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.name)}&background=18152e&color=00f0ff&size=120&bold=true`;
                      }}
                    />
                    <span className="avatar-live-glow" />
                  </div>
                </div>

                {/* Info Principal */}
                <div className="channel-details-column">
                  <div className="channel-title-row">
                    <h3 className="channel-name-heading">{ch.name}</h3>
                    {ch.isVerified && (
                      <span className="verified-badge-wrap" title="Canal Verificado por YouTube">
                        <svg viewBox="0 0 24 24" width="16" height="16" className="verified-svg">
                          <path
                            fill="currentColor"
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4-4 1.41-1.41L10 13.67l6.59-6.59L18 8.5l-8 8z"
                          />
                        </svg>
                      </span>
                    )}
                    {ch.isLiveNow && (
                      <span className="channel-live-now-tag" title="Emitiendo en Vivo en este momento">
                        <span className="tag-live-pulse-dot" />
                        <span>EN DIRECTO</span>
                      </span>
                    )}
                  </div>

                  {/* Metadatos (Handle, Suscriptores, Videos) */}
                  <div className="channel-stats-row">
                    <span className="stat-handle">{ch.handle}</span>
                    {ch.subscribers && (
                      <>
                        <span className="stat-separator">•</span>
                        <span className="stat-subscribers">{ch.subscribers}</span>
                      </>
                    )}
                    {ch.videoCount && (
                      <>
                        <span className="stat-separator">•</span>
                        <span className="stat-videos">{ch.videoCount}</span>
                      </>
                    )}
                  </div>

                  {/* Descripción */}
                  {ch.description && (
                    <p className="channel-description-text">{ch.description}</p>
                  )}
                </div>

                {/* Columna de Acciones */}
                <div className="channel-actions-column">
                  {/* Botón Principal: Agregar a la Señal */}
                  <button
                    className={`btn-add-to-signal ${isAdded ? 'added' : ''}`}
                    onClick={() => toggleAddToSignal(ch)}
                    title={isAdded ? 'Quitar de mi señal' : 'Agregar a mi señal de YouApp TV'}
                  >
                    {isAdded ? (
                      <>
                        <Check size={16} className="btn-icon-pulse" />
                        <span>En tu Señal</span>
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        <span>Agregar a la señal</span>
                      </>
                    )}
                  </button>

                  {/* Botón Sintonizar en Vivo */}
                  <button
                    className="btn-tune-in"
                    onClick={() => tuneInDirect(ch)}
                    title="Ver canal en YouApp TV"
                  >
                    <Play size={15} fill="currentColor" />
                    <span>Ver en Vivo</span>
                  </button>

                  {/* Enlace a YouTube */}
                  <a
                    href={ch.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-open-youtube"
                    title="Abrir canal en YouTube"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>

        {/* Indicador de fin de lista completa */}
        {results.length > 0 && (
          <div className="results-bottom-status">
            <div className="status-line" />
            <span>✓ Mostrando los {results.length} canales encontrados</span>
            <div className="status-line" />
          </div>
        )}
      </main>

      {/* ════════════════════ TOAST DE NOTIFICACIÓN ══════════════════════════ */}
      {toastMessage && (
        <div className="youapp-toast-alert">
          <div className="toast-content">
            <Tv size={20} className="toast-icon" />
            <span>{toastMessage}</span>
          </div>
          <button className="toast-action-btn" onClick={() => navigate('/live')}>
            Ir a TV en Vivo →
          </button>
        </div>
      )}

      {/* ════════════════════ ESTILOS YOUAPP DARK NEON ════════════════════════ */}
      <style>{`
        /* Reset y Contenedor Principal con Scroll Fluido Natural */
        .youapp-search-page {
          min-height: 100vh;
          width: 100%;
          background: radial-gradient(circle at 50% 0%, #151329 0%, #090814 55%, #040308 100%);
          color: #f1f1fa;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
          overflow-y: visible;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        /* Scrollbar Personalizado */
        .youapp-search-page::-webkit-scrollbar {
          width: 9px;
        }
        .youapp-search-page::-webkit-scrollbar-track {
          background: #07060d;
        }
        .youapp-search-page::-webkit-scrollbar-thumb {
          background: rgba(0, 240, 255, 0.25);
          border-radius: 6px;
        }
        .youapp-search-page::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 240, 255, 0.55);
        }

        /* ── HEADER & BARRA DE BÚSQUEDA ───────────────────────────────────────── */
        .youapp-search-header {
          position: sticky;
          top: 0;
          z-index: 300;
          background: rgba(9, 8, 20, 0.88);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(0, 240, 255, 0.12);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          padding: 12px 20px;
        }
        .header-inner {
          max-width: 1060px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .nav-back-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }
        .nav-back-button:hover {
          background: rgba(0, 240, 255, 0.12);
          border-color: rgba(0, 240, 255, 0.4);
          color: #00f0ff;
          transform: translateX(-2px);
        }

        .search-bar-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          position: relative;
          gap: 8px;
        }

        .search-input-box {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(18, 16, 36, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 30px;
          height: 48px;
          padding: 0 16px;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .search-input-box.is-focused {
          border-color: #00f0ff;
          background: rgba(24, 21, 48, 0.95);
          box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.18), 0 8px 24px rgba(0, 0, 0, 0.5);
        }

        .search-lead-icon {
          color: rgba(255, 255, 255, 0.4);
          flex-shrink: 0;
        }
        .search-input-box.is-focused .search-lead-icon {
          color: #00f0ff;
        }

        .search-main-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 1rem;
          font-family: inherit;
          min-width: 0;
        }
        .search-main-input::placeholder {
          color: rgba(255, 255, 255, 0.38);
        }

        .search-clear-btn {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .search-clear-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .search-submit-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          background: linear-gradient(135deg, #00f0ff 0%, #7928ca 100%);
          border: none;
          color: #ffffff;
          font-weight: 600;
          font-size: 0.92rem;
          height: 48px;
          padding: 0 20px;
          border-radius: 24px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(0, 240, 255, 0.25);
        }
        .search-submit-btn:hover {
          filter: brightness(1.15);
          box-shadow: 0 6px 22px rgba(0, 240, 255, 0.4);
          transform: translateY(-1px);
        }

        .search-mic-btn {
          background: rgba(18, 16, 36, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #e2e8f0;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .search-mic-btn:hover {
          background: rgba(0, 240, 255, 0.12);
          border-color: #00f0ff;
          color: #00f0ff;
        }
        .search-mic-btn.listening {
          background: #ff0055;
          border-color: #ff0055;
          color: #fff;
          animation: pulseMic 1.2s infinite;
        }
        @keyframes pulseMic {
          0% { box-shadow: 0 0 0 0 rgba(255, 0, 85, 0.6); }
          70% { box-shadow: 0 0 0 14px rgba(255, 0, 85, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 0, 85, 0); }
        }

        /* ── DROPDOWN ─────────────────────────────────────────────────────────── */
        .search-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #100e21;
          border: 1px solid rgba(0, 240, 255, 0.2);
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
          overflow: hidden;
          z-index: 500;
          padding: 8px 0;
          max-height: 440px;
          overflow-y: auto;
        }
        .dropdown-section {
          padding: 6px 0;
        }
        .dropdown-section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 18px 6px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: rgba(255, 255, 255, 0.45);
        }
        .dropdown-section-title span {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .clear-history-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          font-size: 0.72rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .clear-history-btn:hover {
          color: #ff4466;
        }

        .dropdown-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 18px;
          cursor: pointer;
          color: #e2e8f0;
          font-size: 0.92rem;
          transition: background 0.12s ease;
        }
        .dropdown-row:hover {
          background: rgba(0, 240, 255, 0.08);
          color: #00f0ff;
        }
        .dropdown-row-icon {
          color: rgba(0, 240, 255, 0.7);
          flex-shrink: 0;
        }
        .dropdown-row-icon.muted {
          color: rgba(255, 255, 255, 0.35);
        }
        .dropdown-row-text {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dropdown-row-arrow {
          color: rgba(255, 255, 255, 0.25);
          flex-shrink: 0;
        }
        .dropdown-remove-item {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
        }
        .dropdown-remove-item:hover {
          color: #ff4466;
          background: rgba(255, 68, 102, 0.12);
        }

        .trending-tags-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 18px 12px;
        }
        .trending-chip {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          font-size: 0.82rem;
          padding: 6px 12px;
          border-radius: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s;
        }
        .trending-chip:hover {
          background: rgba(0, 240, 255, 0.14);
          border-color: rgba(0, 240, 255, 0.4);
          color: #00f0ff;
        }

        /* ── CUERPO Y RESULTADOS ──────────────────────────────────────────────── */
        .youapp-search-main {
          flex: 1;
          max-width: 1060px;
          width: 100%;
          margin: 0 auto;
          padding: 24px 20px 140px;
        }

        /* Estado Inicial */
        .search-welcome-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 60px 20px;
          max-width: 640px;
          margin: 0 auto;
        }
        .welcome-glow-icon {
          width: 90px;
          height: 90px;
          border-radius: 28px;
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(121, 40, 202, 0.25));
          border: 1px solid rgba(0, 240, 255, 0.3);
          box-shadow: 0 12px 32px rgba(0, 240, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00f0ff;
          margin-bottom: 24px;
        }
        .search-welcome-state h2 {
          font-size: 1.6rem;
          font-weight: 700;
          margin-bottom: 12px;
          background: linear-gradient(135deg, #ffffff 30%, #00f0ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .search-welcome-state p {
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.95rem;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        .welcome-quick-pills {
          width: 100%;
        }
        .pills-title {
          display: block;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 14px;
        }
        .pills-flex {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: center;
        }
        .quick-pill-button {
          background: rgba(18, 16, 36, 0.9);
          border: 1px solid rgba(0, 240, 255, 0.2);
          color: #e2e8f0;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.86rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .quick-pill-button:hover {
          background: rgba(0, 240, 255, 0.16);
          border-color: #00f0ff;
          color: #00f0ff;
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(0, 240, 255, 0.2);
        }

        /* Cargando */
        .search-loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 80px 20px;
        }
        .loading-spinner-wrap {
          color: #00f0ff;
          margin-bottom: 18px;
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .search-loading-state h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .loading-term {
          color: #00f0ff;
          font-size: 0.95rem;
        }

        /* Banner de Estado */
        .results-status-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(18, 16, 36, 0.7);
          border: 1px solid rgba(0, 240, 255, 0.15);
          border-radius: 14px;
          padding: 12px 18px;
          margin-bottom: 20px;
          font-size: 0.88rem;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e2e8f0;
        }
        .text-neon-cyan {
          color: #00f0ff;
        }
        .live-source-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 240, 255, 0.1);
          border: 1px solid rgba(0, 240, 255, 0.25);
          color: #00f0ff;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        /* Sin Resultados */
        .search-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 70px 20px;
        }
        .empty-icon {
          color: rgba(255, 255, 255, 0.25);
          margin-bottom: 16px;
        }
        .search-empty-state h3 {
          font-size: 1.25rem;
          margin-bottom: 8px;
        }
        .search-empty-state p {
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.9rem;
        }

        /* ── TARJETA DE CANAL (LISTA CON SCROLL COMPLETO) ────────────────────── */
        .channels-results-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .channel-card-item {
          display: flex;
          align-items: center;
          gap: 22px;
          background: rgba(15, 13, 30, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 20px 24px;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          animation: cardSlideIn 0.35s ease-out both;
        }
        @keyframes cardSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .channel-card-item:hover {
          background: rgba(22, 19, 44, 0.95);
          border-color: rgba(0, 240, 255, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.08);
        }
        .channel-card-item.is-in-signal {
          border-color: rgba(16, 185, 129, 0.35);
          background: rgba(12, 26, 24, 0.65);
        }

        /* Avatar */
        .channel-avatar-column {
          flex-shrink: 0;
        }
        .avatar-frame {
          position: relative;
          width: 84px;
          height: 84px;
          border-radius: 50%;
          padding: 3px;
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.4), rgba(121, 40, 202, 0.5));
        }
        .channel-avatar-img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          display: block;
          background: #090814;
        }
        .avatar-live-glow {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid #090814;
          box-shadow: 0 0 8px #10b981;
        }

        /* Info */
        .channel-details-column {
          flex: 1;
          min-width: 0;
        }
        .channel-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .channel-name-heading {
          font-size: 1.12rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.2px;
        }
        .verified-badge-wrap {
          color: #00f0ff;
          display: flex;
          align-items: center;
        }

        .channel-live-now-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(255, 0, 85, 0.2);
          border: 1px solid rgba(255, 0, 85, 0.6);
          color: #ff0055;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.6px;
          padding: 2px 8px;
          border-radius: 12px;
          box-shadow: 0 0 10px rgba(255, 0, 85, 0.35);
        }
        .tag-live-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ff0055;
          box-shadow: 0 0 6px #ff0055;
          animation: livePulse 1.2s infinite ease-in-out;
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }

        .channel-stats-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 0.84rem;
          color: rgba(255, 255, 255, 0.55);
          margin-bottom: 8px;
        }
        .stat-handle {
          color: #00f0ff;
          font-weight: 600;
        }
        .stat-separator {
          color: rgba(255, 255, 255, 0.25);
        }

        .channel-description-text {
          font-size: 0.82rem;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Acciones */
        .channel-actions-column {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Botón Agregar a la Señal */
        .btn-add-to-signal {
          display: flex;
          align-items: center;
          gap: 7px;
          background: linear-gradient(135deg, #00f0ff 0%, #0070f3 100%);
          border: none;
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 10px 18px;
          border-radius: 24px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(0, 240, 255, 0.25);
        }
        .btn-add-to-signal:hover {
          filter: brightness(1.15);
          box-shadow: 0 6px 24px rgba(0, 240, 255, 0.45);
          transform: translateY(-1px);
        }
        .btn-add-to-signal.added {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
        }
        .btn-add-to-signal.added:hover {
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
          box-shadow: 0 4px 16px rgba(239, 68, 68, 0.35);
        }

        /* Botón Sintonizar en Vivo */
        .btn-tune-in {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 600;
          padding: 10px 15px;
          border-radius: 24px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .btn-tune-in:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: #00f0ff;
          color: #00f0ff;
          transform: translateY(-1px);
        }

        /* Botón YouTube Externo */
        .btn-open-youtube {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          transition: all 0.2s;
        }
        .btn-open-youtube:hover {
          background: rgba(255, 0, 0, 0.18);
          border-color: #ff0000;
          color: #ff3333;
          transform: translateY(-1px);
        }

        /* ── TOAST NOTIFICATION ───────────────────────────────────────────────── */
        .youapp-toast-alert {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 999;
          background: rgba(16, 14, 34, 0.95);
          border: 1px solid #00f0ff;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.8), 0 0 24px rgba(0, 240, 255, 0.3);
          border-radius: 30px;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 18px;
          animation: toastPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes toastPop {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .toast-content {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
          font-size: 0.92rem;
          font-weight: 500;
        }
        .toast-icon {
          color: #00f0ff;
        }
        .toast-action-btn {
          background: linear-gradient(135deg, #00f0ff 0%, #7928ca 100%);
          border: none;
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 16px;
          cursor: pointer;
          transition: filter 0.2s;
        }
        .toast-action-btn:hover {
          filter: brightness(1.2);
        }

        /* Indicador de Fin de Resultados */
        .results-bottom-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 36px;
          padding: 16px;
          color: rgba(0, 240, 255, 0.7);
          font-size: 0.88rem;
          font-weight: 600;
        }
        .status-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.25), transparent);
        }

        /* ── RESPONSIVE DESIGN (MOBILE & TABLET) ──────────────────────────────── */
        @media (max-width: 820px) {
          .youapp-search-main {
            padding: 16px 12px 140px;
          }
          .channel-card-item {
            display: grid;
            grid-template-columns: 56px 1fr;
            gap: 12px;
            padding: 14px;
            border-radius: 14px;
          }
          .channel-avatar-column {
            grid-column: 1;
            grid-row: 1;
          }
          .avatar-frame {
            width: 54px;
            height: 54px;
            padding: 2px;
          }
          .channel-details-column {
            grid-column: 2;
            grid-row: 1;
          }
          .channel-name-heading {
            font-size: 1rem;
          }
          .channel-description-text {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            font-size: 0.82rem;
          }
          .channel-actions-column {
            grid-column: 1 / -1;
            grid-row: 2;
            width: 100%;
            display: flex;
            gap: 8px;
            margin-top: 4px;
          }
          .btn-add-to-signal {
            flex: 1;
            padding: 8px 12px;
            font-size: 0.78rem;
            justify-content: center;
          }
          .btn-tune-in {
            flex: 1;
            padding: 8px 12px;
            font-size: 0.78rem;
            justify-content: center;
          }
          .btn-open-youtube {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
          }
          .search-submit-btn span {
            display: none;
          }
          .search-submit-btn {
            padding: 0 14px;
          }
        }
      `}</style>
    </div>
  );
}
