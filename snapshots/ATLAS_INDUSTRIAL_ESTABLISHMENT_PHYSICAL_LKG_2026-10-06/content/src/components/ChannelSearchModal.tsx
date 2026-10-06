/**
 * ChannelSearchModal — Motor de búsqueda unificado YouApp TV
 * Búsqueda dual: grilla activa + catálogo universal, scoring ponderado,
 * deduplicación por ID, 0ms latencia por keystroke.
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, X, Tv, Play, Radio, CheckCircle2, Plus, Sparkles, Mic, MicOff, ArrowUpLeft
} from 'lucide-react';
import { UNIVERSAL_CATALOG, parseUniversalUrl, type UniversalChannel } from '../lib/universalChannels';
import { fetchYouTubeLiveSuggestions } from '../lib/youtube';


// ─── Tipos ──────────────────────────────────────────────────────────────────
interface GridChannel {
  id: string;
  name: string;
  category?: string;
  currentVideoTitle?: string;
  avatarUrl?: string;
  thumbnail?: string;
  videoUrl?: string;
  author?: string;
}

interface ChannelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: GridChannel[];
  onSelectChannel: (index: number) => void;
  onAddChannel?: (channel: any) => void;
  onSelectRealYouTubeChannel?: (channelId: string, channelTitle: string) => void;
}

// ─── Catálogos rápidos ───────────────────────────────────────────────────────
const TRENDING_TAGS = [
  'América TV', 'Crónica TV', 'TN', 'LUZU TV', 'OLGA', 'Lofi Girl',
  'MrBeast', 'Ibai', 'NASA', 'Gaming', 'Música', 'Naturaleza'
];

const CATEGORY_FILTERS = [
  { id: 'all',        icon: '✨', label: 'Todos' },
  { id: 'noticias',   icon: '🔴', label: 'Noticias & TV' },
  { id: 'streaming',  icon: '🎙️', label: 'Streaming' },
  { id: 'gaming',     icon: '🎮', label: 'Gaming' },
  { id: 'musica',     icon: '🎵', label: 'Música' },
  { id: 'ciencia',    icon: '🚀', label: 'Ciencia' },
  { id: 'naturaleza', icon: '🌿', label: 'Naturaleza' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

const scoreMatch = (haystack: string, needle: string, terms: string[]): number => {
  let s = 0;
  if (haystack.includes(needle)) s += 10;
  terms.forEach(t => { if (haystack.includes(t)) s += 2; });
  return s;
};

function dedup<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter(x => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function toGridChannel(ch: UniversalChannel): any {
  return {
    id:                ch.id || `cat-${Date.now()}`,
    name:              ch.name,
    category:          ch.category || '🔴 Canal en Vivo',
    viewerCount:       ch.viewerCount || Math.floor(Math.random() * 10000) + 2000,
    videoUrl:          ch.videoUrl,
    currentVideoTitle: ch.currentVideoTitle || ch.name,
    thumbnail:         ch.thumbnail || ch.avatarUrl,
    author:            ch.name,
    avatarUrl:         ch.avatarUrl,
    isLive:            ch.isLive ?? true,
    durationSeconds:   ch.durationSeconds,
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ChannelSearchModal({
  isOpen,
  onClose,
  channels,
  onSelectChannel,
  onAddChannel,
  onSelectRealYouTubeChannel,
}: ChannelSearchModalProps) {
  const [query,           setQuery]           = useState('');
  const [catFilter,       setCatFilter]       = useState('all');
  const [feedback,        setFeedback]        = useState<string | null>(null);
  const [urlParsed,       setUrlParsed]       = useState<UniversalChannel | null>(null);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [isListening,     setIsListening]     = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setCatFilter('all');
      setFeedback(null);
      setUrlParsed(null);
      setLiveSuggestions([]);
      setShowSuggestions(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Autosuggest en tiempo real estilo YouTube
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setLiveSuggestions([]);
      return;
    }
    let isMounted = true;
    const timer = setTimeout(async () => {
      const sugs = await fetchYouTubeLiveSuggestions(query);
      if (isMounted) setLiveSuggestions(sugs.slice(0, 6));
    }, 150);
    return () => { isMounted = false; clearTimeout(timer); };
  }, [query]);

  // Búsqueda por voz
  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      if (text) {
        setQuery(text);
        setShowSuggestions(false);
      }
    };
    recognition.start();
  };

  useEffect(() => {
    const parsed = parseUniversalUrl(query.trim());
    setUrlParsed(parsed);
  }, [query]);


  // Catálogo universal deduplicado
  const cleanCatalog = useMemo(() =>
    dedup(UNIVERSAL_CATALOG, ch => ch.id),
  []);

  // Filtro por categoría del catálogo
  const catalogByCategory = useMemo(() => {
    if (catFilter === 'all') return cleanCatalog;
    return cleanCatalog.filter(ch => {
      const t = norm(ch.category + ' ' + (ch.tags || []).join(' '));
      switch (catFilter) {
        case 'noticias':   return t.includes('noticia') || t.includes('tv') || t.includes('television');
        case 'streaming':  return t.includes('streaming') || t.includes('charla') || t.includes('humor');
        case 'gaming':     return t.includes('gaming') || t.includes('creador') || t.includes('reto') || t.includes('aventura');
        case 'musica':     return t.includes('musica') || t.includes('lofi') || t.includes('trap') || t.includes('rock') || t.includes('electronica');
        case 'ciencia':    return t.includes('ciencia') || t.includes('espacio') || t.includes('ia') || t.includes('tech') || t.includes('cosmos');
        case 'naturaleza': return t.includes('naturaleza') || t.includes('oceano') || t.includes('bosque') || t.includes('zen');
        default:           return true;
      }
    });
  }, [catFilter, cleanCatalog]);

  // Resultados de la grilla activa
  const gridResults = useMemo(() => {
    if (!query.trim()) return channels.map((ch, idx) => ({ ch, idx }));
    const q     = norm(query);
    const terms = q.split(/\s+/).filter(Boolean);
    return channels
      .map((ch, idx) => ({
        ch, idx,
        s: scoreMatch(
          norm([ch.name, ch.category, ch.currentVideoTitle, ch.author].join(' ')),
          q, terms
        )
      }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(r => ({ ch: r.ch, idx: r.idx }));
  }, [query, channels]);

  // Resultados del catálogo universal
  const catalogResults = useMemo(() => {
    if (!query.trim()) {
      return catFilter === 'all' ? catalogByCategory.slice(0, 24) : catalogByCategory;
    }
    const q     = norm(query);
    const terms = q.split(/\s+/).filter(Boolean);
    return catalogByCategory
      .map(ch => ({
        ch,
        s: scoreMatch(
          norm([ch.name, ch.category, ch.description, ch.currentVideoTitle, ...(ch.tags || [])].join(' ')),
          q, terms
        )
      }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(r => r.ch);
  }, [query, catalogByCategory]);

  if (!isOpen) return null;

  const handleAddCatalog = (ch: UniversalChannel) => {
    const newCh = toGridChannel(ch);
    setFeedback(ch.name);
    setTimeout(() => setFeedback(null), 2500);
    if (onAddChannel) onAddChannel(newCh);
    else if (onSelectRealYouTubeChannel) onSelectRealYouTubeChannel(ch.channelId || ch.id, ch.name);
    onClose();
  };

  const handleAddUrl = () => {
    if (!urlParsed) return;
    handleAddCatalog(urlParsed);
  };

  const handleSelectGrid = (idx: number) => {
    onSelectChannel(idx);
    onClose();
  };

  const totalResults = gridResults.length + catalogResults.length + (urlParsed ? 1 : 0);

  return (
    <div className="csm-backdrop" onClick={onClose}>
      <div className="csm-panel" onClick={e => e.stopPropagation()}>

        {/* ── Cabecera ─────────────────────────────────────────────────────── */}
        <div className="csm-header">
          <div className="csm-input-wrap">
            <Search size={18} className="csm-ico-search" />
            <input
              ref={inputRef}
              className="csm-input"
              type="text"
              placeholder="Buscar canal, categoría, o pegar link de YouTube / Twitch / HLS..."
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            {query && (
              <button className="csm-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                <X size={15} />
              </button>
            )}
            <button
              className={`csm-mic ${isListening ? 'listening' : ''}`}
              title={isListening ? "Escuchando..." : "Buscar por voz"}
              onClick={startVoiceSearch}
            >
              {isListening ? <MicOff size={16} color="#ef4444" /> : <Mic size={16} />}
            </button>
          </div>
          <button className="csm-close" onClick={onClose}><X size={20} /></button>

          {/* Autosuggestions Dropdown */}
          {showSuggestions && query.trim().length >= 2 && liveSuggestions.length > 0 && (
            <div className="csm-suggest-dropdown">
              {liveSuggestions.map((s, idx) => (
                <div
                  key={`${s}-${idx}`}
                  className="csm-suggest-item"
                  onMouseDown={() => { setQuery(s); setShowSuggestions(false); }}
                >
                  <Search size={13} className="csm-suggest-ico" />
                  <span>{s}</span>
                  <ArrowUpLeft size={13} className="csm-suggest-arrow" />
                </div>
              ))}
            </div>
          )}
        </div>


        {/* ── Toast feedback ───────────────────────────────────────────────── */}
        {feedback && (
          <div className="csm-toast">
            <CheckCircle2 size={16} color="#4ade80" />
            <span>¡<strong>{feedback}</strong> agregado y sintonizado!</span>
          </div>
        )}

        {/* ── Filtros de categoría ─────────────────────────────────────────── */}
        <div className="csm-cats">
          {CATEGORY_FILTERS.map(c => (
            <button
              key={c.id}
              className={`csm-cat-pill ${catFilter === c.id ? 'active' : ''}`}
              onClick={() => { setCatFilter(c.id); setQuery(''); }}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* ── Tags de tendencia ────────────────────────────────────────────── */}
        {!query && (
          <div className="csm-trending">
            <span className="csm-trending-lbl">🔥 Tendencias:</span>
            {TRENDING_TAGS.map(tag => (
              <button key={tag} className="csm-tag" onClick={() => setQuery(tag)}>
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* ── Estadística de resultados ────────────────────────────────────── */}
        {query && (
          <div className="csm-stat">
            <Sparkles size={13} />
            <span>{totalResults} resultado{totalResults !== 1 ? 's' : ''} para "<strong>{query}</strong>"</span>
          </div>
        )}

        {/* ── Resultado de URL detectada ───────────────────────────────────── */}
        {urlParsed && (
          <div className="csm-url-result" onClick={handleAddUrl}>
            <div className="csm-url-icon">🔗</div>
            <div className="csm-url-info">
              <p className="csm-url-name">{urlParsed.name}</p>
              <p className="csm-url-sub">Link detectado · {urlParsed.provider.toUpperCase()} · Click para sintonizar</p>
            </div>
            <button className="csm-url-play" onClick={e => { e.stopPropagation(); handleAddUrl(); }}>
              <Play size={16} fill="white" />
            </button>
          </div>
        )}

        {/* ── Lista de resultados ──────────────────────────────────────────── */}
        <div className="csm-results">

          {/* Sección: Canales de tu Grilla */}
          {gridResults.length > 0 && (
            <section className="csm-section">
              <div className="csm-section-title">
                <Tv size={13} />
                EN TU GRILLA AHORA ({gridResults.length})
              </div>
              {gridResults.map(({ ch, idx }) => (
                <div
                  key={`grid-${ch.id}`}
                  className="csm-card csm-card-grid"
                  onClick={() => handleSelectGrid(idx)}
                >
                  <div className="csm-ch-num">CH {String(idx + 1).padStart(2, '0')}</div>
                  <div className="csm-avatar">
                    {ch.avatarUrl || ch.thumbnail
                      ? <img src={ch.avatarUrl || ch.thumbnail} alt={ch.name} />
                      : <Tv size={20} className="csm-avatar-placeholder" />}
                  </div>
                  <div className="csm-info">
                    <div className="csm-name-row">
                      <span className="csm-name">{ch.name}</span>
                      {ch.category && <span className="csm-badge">{ch.category}</span>}
                    </div>
                    {ch.currentVideoTitle && (
                      <p
                        className="csm-subtitle"
                        dangerouslySetInnerHTML={{ __html: ch.currentVideoTitle }}
                      />
                    )}
                  </div>
                  <button className="csm-btn-play" title="Sintonizar">
                    <Play size={15} fill="white" />
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Sección: Directorio de Canales */}
          {catalogResults.length > 0 && (
            <section className="csm-section">
              <div className="csm-section-title">
                <Radio size={13} />
                DIRECTORIO DE CANALES ({catalogResults.length})
              </div>
              {catalogResults.map(ch => (
                <div
                  key={`cat-${ch.id}`}
                  className="csm-card csm-card-cat"
                  onClick={() => handleAddCatalog(ch)}
                >
                  <div className="csm-avatar csm-avatar-yt">
                    {ch.avatarUrl || ch.thumbnail
                      ? <img src={ch.avatarUrl || ch.thumbnail} alt={ch.name} />
                      : <Radio size={20} className="csm-avatar-placeholder" />}
                  </div>
                  <div className="csm-info">
                    <div className="csm-name-row">
                      <span className="csm-name">{ch.name}</span>
                      <CheckCircle2 size={12} className="csm-verified" />
                      {ch.isLive && <span className="csm-live-badge">🔴 EN VIVO</span>}
                    </div>
                    <p className="csm-subtitle">
                      {ch.currentVideoTitle || ch.description || 'Transmisión continua 24/7'}
                    </p>
                  </div>
                  <div className="csm-actions">
                    <button
                      className="csm-btn-add"
                      onClick={e => { e.stopPropagation(); handleAddCatalog(ch); }}
                      title="Agregar a tu grilla"
                    >
                      <Plus size={13} /> AGREGAR
                    </button>
                    <button
                      className="csm-btn-play"
                      onClick={e => { e.stopPropagation(); handleAddCatalog(ch); }}
                      title="Sintonizar ahora"
                    >
                      <Play size={15} fill="white" />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Estado vacío */}
          {!urlParsed && gridResults.length === 0 && catalogResults.length === 0 && (
            <div className="csm-empty">
              <Sparkles size={38} />
              <h3>Sin resultados{query ? ` para "${query}"` : ''}</h3>
              <p>Prueba con "América TV", "Lofi", "NASA", "Gaming", o pega un link de YouTube / Twitch / HLS</p>
            </div>
          )}

        </div>
      </div>

      <style>{`
        .csm-backdrop {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.88);
          backdrop-filter: blur(18px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: csmFadeIn .18s ease-out;
        }
        @keyframes csmFadeIn { from { opacity:0 } to { opacity:1 } }

        .csm-panel {
          width: 100%; max-width: 740px; max-height: 90vh;
          background: #0c0e14;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 22px;
          display: flex; flex-direction: column;
          box-shadow: 0 28px 70px rgba(0,0,0,.9);
          overflow: hidden;
          animation: csmSlideUp .22s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes csmSlideUp { from { transform: translateY(24px); opacity:0 } to { transform: translateY(0); opacity:1 } }

        .csm-header {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255,255,255,.07);
          flex-shrink: 0;
          position: relative;
        }
        .csm-input-wrap {
          flex: 1; display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,.06);
          border: 1.5px solid rgba(99,102,241,.35);
          border-radius: 14px; padding: 11px 14px;
          transition: border-color .2s;
        }
        .csm-input-wrap:focus-within { border-color: #818cf8; }
        .csm-ico-search { color: #818cf8; flex-shrink: 0; }
        .csm-input {
          flex: 1; background: transparent; border: none;
          color: #fff; font-size: 1rem; font-weight: 500; outline: none;
        }
        .csm-input::placeholder { color: rgba(255,255,255,.38); }
        .csm-clear, .csm-close {
          background: transparent; border: none;
          color: rgba(255,255,255,.55); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 5px; border-radius: 50%;
          transition: background .18s, color .18s;
        }
        .csm-clear:hover, .csm-close:hover {
          background: rgba(255,255,255,.1); color: #fff;
        }
        .csm-mic {
          background: transparent; border: none;
          color: rgba(255,255,255,.55); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 5px; border-radius: 50%;
          transition: all .18s;
        }
        .csm-mic:hover { color: #fff; background: rgba(255,255,255,.1); }
        .csm-mic.listening { animation: micPulse 1.2s infinite; background: rgba(239,68,68,0.2); }

        .csm-suggest-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 18px;
          right: 58px;
          background: #181b26;
          border: 1px solid rgba(99,102,241,.3);
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.8);
          z-index: 1000;
          overflow: hidden;
          animation: csmFadeIn .15s ease-out;
        }
        .csm-suggest-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          color: rgba(255,255,255,0.85);
          font-size: 0.88rem;
          cursor: pointer;
          transition: background .12s;
        }
        .csm-suggest-item:hover { background: rgba(99,102,241,0.18); color: #fff; }
        .csm-suggest-ico { color: #818cf8; flex-shrink: 0; }
        .csm-suggest-arrow { margin-left: auto; color: rgba(255,255,255,0.25); }


        .csm-toast {
          display: flex; align-items: center; gap: 8px;
          margin: 0 18px 6px;
          background: rgba(74,222,128,.15);
          border: 1px solid rgba(74,222,128,.35);
          color: #86efac; padding: 8px 14px; border-radius: 12px;
          font-size: .82rem; animation: csmFadeIn .2s;
          flex-shrink: 0;
        }

        .csm-cats {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 18px; overflow-x: auto; scrollbar-width: none;
          border-bottom: 1px solid rgba(255,255,255,.05);
          background: rgba(255,255,255,.025);
          flex-shrink: 0;
        }
        .csm-cats::-webkit-scrollbar { display: none; }
        .csm-cat-pill {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          color: rgba(255,255,255,.82); padding: 5px 13px;
          border-radius: 20px; font-size: .78rem; font-weight: 700;
          white-space: nowrap; cursor: pointer;
          transition: all .18s cubic-bezier(.4,0,.2,1);
        }
        .csm-cat-pill:hover {
          background: rgba(99,102,241,.25); border-color: #6366f1; color: #fff;
        }
        .csm-cat-pill.active {
          background: linear-gradient(135deg,#6366f1,#4f46e5);
          border-color: #818cf8; color: #fff;
          box-shadow: 0 2px 10px rgba(99,102,241,.45);
        }

        .csm-trending {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 18px; overflow-x: auto; scrollbar-width: none;
          border-bottom: 1px solid rgba(255,255,255,.05);
          flex-shrink: 0;
        }
        .csm-trending::-webkit-scrollbar { display: none; }
        .csm-trending-lbl {
          font-size: .72rem; font-weight: 800; color: rgba(255,255,255,.38);
          text-transform: uppercase; flex-shrink: 0; letter-spacing: .3px;
        }
        .csm-tag {
          background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
          color: rgba(255,255,255,.82); padding: 4px 11px;
          border-radius: 14px; font-size: .73rem; font-weight: 600;
          white-space: nowrap; cursor: pointer; transition: all .18s;
        }
        .csm-tag:hover { background: rgba(99,102,241,.28); border-color: #6366f1; color: #fff; }

        .csm-stat {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 18px; font-size: .78rem; color: rgba(255,255,255,.45);
          flex-shrink: 0;
        }

        .csm-url-result {
          margin: 8px 18px; display: flex; align-items: center; gap: 14px;
          padding: 12px 16px;
          background: rgba(99,102,241,.14);
          border: 1.5px solid rgba(99,102,241,.45);
          border-radius: 16px; cursor: pointer;
          transition: background .18s;
          flex-shrink: 0;
        }
        .csm-url-result:hover { background: rgba(99,102,241,.25); }
        .csm-url-icon { font-size: 1.6rem; }
        .csm-url-info { flex: 1; }
        .csm-url-name { margin: 0; font-size: .95rem; font-weight: 700; color: #fff; }
        .csm-url-sub  { margin: 2px 0 0; font-size: .73rem; color: rgba(255,255,255,.5); }
        .csm-url-play {
          background: #6366f1; border: none; border-radius: 50%;
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background .18s;
        }
        .csm-url-play:hover { background: #4f46e5; }

        .csm-results {
          flex: 1; overflow-y: auto; padding: 10px 18px 18px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .csm-results::-webkit-scrollbar { width: 4px; }
        .csm-results::-webkit-scrollbar-track { background: transparent; }
        .csm-results::-webkit-scrollbar-thumb { background: rgba(99,102,241,.4); border-radius: 4px; }

        .csm-section { display: flex; flex-direction: column; gap: 8px; }
        .csm-section-title {
          display: flex; align-items: center; gap: 6px;
          font-size: .7rem; font-weight: 800; letter-spacing: .6px;
          color: rgba(255,255,255,.4); padding: 2px 0;
        }

        .csm-card {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 14px;
          border-radius: 14px; cursor: pointer;
          transition: transform .15s, background .15s, border-color .15s;
          border: 1px solid rgba(255,255,255,.06);
          background: rgba(255,255,255,.03);
        }
        .csm-card:hover {
          background: rgba(99,102,241,.18);
          border-color: rgba(99,102,241,.5);
          transform: translateY(-2px);
        }
        .csm-card-cat {
          background: rgba(99,102,241,.06);
          border-color: rgba(99,102,241,.18);
        }

        .csm-ch-num {
          font-family: monospace; font-size: .8rem; font-weight: 800;
          color: #a5b4fc; background: rgba(99,102,241,.18);
          padding: 3px 7px; border-radius: 7px; flex-shrink: 0;
        }

        .csm-avatar {
          width: 46px; height: 46px; border-radius: 50%;
          overflow: hidden; background: rgba(255,255,255,.08);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; border: 1px solid rgba(255,255,255,.1);
        }
        .csm-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .csm-avatar-placeholder { color: rgba(255,255,255,.4); }
        .csm-avatar-yt { border-color: rgba(99,102,241,.3); }

        .csm-info { flex: 1; min-width: 0; }
        .csm-name-row { display: flex; align-items: center; gap: 5px; margin-bottom: 3px; flex-wrap: wrap; }
        .csm-name {
          font-size: .92rem; font-weight: 700; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 200px;
        }
        .csm-badge {
          font-size: .62rem; font-weight: 700;
          background: rgba(255,255,255,.08); color: rgba(255,255,255,.65);
          padding: 2px 6px; border-radius: 6px; text-transform: uppercase;
          white-space: nowrap; flex-shrink: 0;
        }
        .csm-verified { color: #38bdf8; flex-shrink: 0; }
        .csm-live-badge {
          font-size: .6rem; font-weight: 800;
          background: #ef4444; color: #fff;
          padding: 2px 5px; border-radius: 5px; letter-spacing: .4px;
          flex-shrink: 0;
        }
        .csm-subtitle {
          margin: 0; font-size: .73rem; color: rgba(255,255,255,.48);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .csm-actions { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
        .csm-btn-add {
          display: flex; align-items: center; gap: 5px;
          background: #6366f1; color: #fff; border: none;
          padding: 7px 12px; border-radius: 10px;
          font-size: .7rem; font-weight: 800; cursor: pointer;
          white-space: nowrap; transition: background .15s, transform .15s;
          box-shadow: 0 2px 10px rgba(99,102,241,.4);
        }
        .csm-btn-add:hover { background: #4f46e5; transform: scale(1.04); }
        .csm-btn-play {
          background: rgba(99,102,241,.75); border: none;
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background .15s;
          flex-shrink: 0;
        }
        .csm-btn-play:hover { background: #6366f1; }

        .csm-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 10px; padding: 40px 20px; text-align: center;
          color: rgba(255,255,255,.4);
        }
        .csm-empty h3 { margin: 0; font-size: 1rem; font-weight: 700; color: rgba(255,255,255,.7); }
        .csm-empty p  { margin: 0; font-size: .83rem; }
      `}</style>
    </div>
  );
}