import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Plus, Check, Loader2, ListVideo, Sparkles,
  Clock, TrendingUp, ChevronLeft, Play, LayoutGrid,
  List, Mic, ArrowUpLeft, Trash2, MicOff, SlidersHorizontal,
  ExternalLink, Eye, Share2, CheckCircle2, Tv, Radio
} from 'lucide-react';
import { searchYouTube, fetchPlaylistVideos, extractPlaylistId, fetchYouTubeLiveSuggestions } from '../lib/youtube';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

// ─── Sugerencias y Tendencias de YouTube ──────────────────────────────────────
const SEARCH_SUGGESTIONS: Record<string, string[]> = {
  noticias: ['prensa solidaria', 'noticias argentina', 'TN en vivo', 'Crónica TV', 'América noticias', 'infobae en vivo', 'c5n en vivo'],
  musica: ['lofi hip hop', 'música relajante', 'jazz en vivo', 'pop latino', 'rock clásico', 'cumbia argentina', 'electrónica'],
  streaming: ['luzu tv', 'olga en vivo', 'ibai', 'mrbeast español', 'streamers argentina', 'gelatina en vivo'],
  gaming: ['minecraft gameplay', 'fortnite en vivo', 'GTA 5', 'gaming argentina', 'esports', 'speedrun'],
  documentales: ['documental naturaleza', 'documental historia', 'documental ciencia', 'documental crimen', 'nasa en vivo'],
  deporte: ['fútbol argentino', 'goles de la fecha', 'fórmula 1', 'boxeo en vivo', 'champions league'],
};

const TRENDING_NOW = [
  '🔴 Prensa Solidaria', '🔴 TN en vivo', '🎵 Lofi Girl', '🎙️ LUZU TV',
  '⚽ Fútbol hoy', '🎮 Gaming live', '🌍 Noticias mundo', '🚀 NASA live'
];

const FILTER_CHIPS = [
  { id: 'all', label: 'Todo', icon: '✨' },
  { id: 'live', label: 'En Vivo 🔴', icon: '🔴' },
  { id: 'short', label: 'Menos de 4 min', icon: '⚡' },
  { id: 'medium', label: '4-20 min', icon: '⏱️' },
  { id: 'long', label: 'Más de 20 min', icon: '🎬' },
  { id: 'channels', label: 'Canales', icon: '📺' },
];

const HISTORY_KEY = 'youapp_search_history';

function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(q: string) {
  if (!q.trim()) return;
  const h = getHistory().filter(x => x.toLowerCase() !== q.toLowerCase());
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...h].slice(0, 15)));
}
function clearHistory() { localStorage.removeItem(HISTORY_KEY); }
function removeFromHistory(q: string) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(getHistory().filter(x => x !== q)));
}

export default function SearchAndProgram() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'search' | 'playlist'>('search');
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [programmed, setProgrammed] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<any>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState<string[]>(getHistory);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'duration' | 'title'>('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [userChannels, setUserChannels] = useState<any[]>([]);

  // Playlist importer state
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistVideos, setPlaylistVideos] = useState<any[]>([]);
  const [isScanningPlaylist, setIsScanningPlaylist] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importStats, setImportStats] = useState({ count: 0, channelName: '' });

  const { user } = useStore();

  useEffect(() => {
    if (user) fetchChannels();
  }, [user]);

  const fetchChannels = async () => {
    try {
      const { data: ownChannels } = await supabase.from('channels').select('*').eq('user_id', user?.id);
      // channel_collaborators tabla no existe — se omite para evitar errores 404
      setUserChannels(ownChannels || []);
    } catch (e) { console.error(e); }
  };

  // ─── Fetch en tiempo real de sugerencias de YouTube (Live Autosuggest) ────────
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setLiveSuggestions([]);
      return;
    }

    let isMounted = true;
    const fetchTimer = setTimeout(async () => {
      const ytSuggests = await fetchYouTubeLiveSuggestions(query);
      if (!isMounted) return;

      if (ytSuggests.length > 0) {
        setLiveSuggestions(ytSuggests.slice(0, 8));
      } else {
        const q = query.toLowerCase();
        const all = Object.values(SEARCH_SUGGESTIONS).flat();
        const matched = all.filter(s => s.toLowerCase().includes(q));
        const dynamic = [
          `${query} en vivo`,
          `${query} 2026`,
          `${query} HD`,
          `mejores de ${query}`,
        ].filter(s => !matched.includes(s));
        setLiveSuggestions([...matched, ...dynamic].slice(0, 8));
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(fetchTimer);
    };
  }, [query]);

  // ─── Búsqueda Automática Instantánea (0ms de latencia) ────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const data = await searchYouTube(q);
    setResults(data);
    setIsSearching(false);
  }, []);

  // Disparar búsqueda automáticamente mientras se escribe
  useEffect(() => {
    if (query.trim().length >= 2) {
      setCommittedQuery(query.trim());
      const timer = setTimeout(() => {
        doSearch(query.trim());
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setCommittedQuery('');
    }
  }, [query, doSearch]);

  // ─── Confirmar búsqueda (Enter o click en sugerencia) ────────────────────────
  const commitSearch = (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    setCommittedQuery(q);
    setShowSuggestions(false);
    saveHistory(q);
    setHistory(getHistory());
    inputRef.current?.blur();
    doSearch(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitSearch(query);
    }
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  const clearSearch = () => {
    setQuery('');
    setCommittedQuery('');
    setResults([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // ─── Búsqueda por Voz ────────────────────────────────────────────────────────
  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta búsqueda por voz.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const spokenText = event.results[0][0].transcript;
      if (spokenText) {
        setQuery(spokenText);
        commitSearch(spokenText);
      }
    };
    recognition.start();
  };

  // ─── Filtrar y Ordenar resultados (estilo YouTube) ─────────────────────────
  const filteredResults = useMemo(() => {
    let list = [...results];

    if (activeFilter === 'live') {
      list = list.filter(v => v.duration === 'En Vivo' || v.isLive);
    } else if (activeFilter === 'short') {
      list = list.filter(v => (v.durationSeconds || 0) < 240);
    } else if (activeFilter === 'medium') {
      list = list.filter(v => (v.durationSeconds || 0) >= 240 && (v.durationSeconds || 0) <= 1200);
    } else if (activeFilter === 'long') {
      list = list.filter(v => (v.durationSeconds || 0) > 1200);
    } else if (activeFilter === 'channels') {
      list = list.filter(v => v.channelInfo);
    }

    if (sortBy === 'duration') {
      list.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
    } else if (sortBy === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return list;
  }, [results, activeFilter, sortBy]);

  // Canal destacado en la cabecera si existe
  const topChannel = useMemo(() => {
    return results.find(r => r.channelInfo)?.channelInfo || null;
  }, [results]);

  const handleProgram = (video: any) => {
    setSelectedVideo(video);
    setShowModal(true);
    setProgrammed(false);
  };

  const createChannel = async () => {
    if (!user) return alert('Debes iniciar sesión');
    const name = prompt('Nombre del canal:');
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    try {
      const { data, error } = await supabase.from('channels').insert({
        user_id: user.id, name,
        slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
        category: 'General', is_24_7: true
      }).select();
      if (!error && data) { setUserChannels(prev => [...prev, data[0]]); return data[0]; }
    } catch (e) { console.error(e); }
  };

  const confirmProgram = async (channelId: string) => {
    if (!selectedVideo || !user) return;
    try {
      const { error: videoError } = await supabase.from('videos').insert({
        id: selectedVideo.id, title: selectedVideo.title, author: selectedVideo.author,
        duration: selectedVideo.duration, thumbnail: selectedVideo.thumbnail, provider: selectedVideo.provider
      });
      if (videoError && videoError.code !== '23505') { console.error(videoError); return; }
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      const { error: progError } = await supabase.from('programming').insert({
        channel_id: channelId, video_id: selectedVideo.id,
        start_time: now.toISOString(), end_time: end.toISOString()
      });
      if (progError) { console.error(progError); return; }
    } catch (error) { console.error(error); return; }
    setProgrammed(true);
    setTimeout(() => setShowModal(false), 1800);
  };

  const handleScanPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) { alert("Pega un enlace válido de playlist de YouTube"); return; }
    setIsScanningPlaylist(true);
    setPlaylistVideos([]);
    try {
      const items = await fetchPlaylistVideos(playlistId);
      if (items.length === 0) alert('No se encontraron videos públicos.');
      else setPlaylistVideos(items);
    } catch (err: any) { alert(`Error: ${err.message}`); }
    finally { setIsScanningPlaylist(false); }
  };

  const handleImportPlaylistToChannel = async (channelId: string) => {
    if (!playlistVideos.length || !user) return;
    setIsImporting(true);
    try {
      for (const v of playlistVideos) {
        await supabase.from('videos').insert({ id: v.id, title: v.title, author: v.author, duration: v.duration, thumbnail: v.thumbnail, provider: 'youtube' });
      }
      let currentStartTime = new Date();
      const programmingPayload = playlistVideos.map(v => {
        const durSec = v.durationSeconds || 300;
        const endTime = new Date(currentStartTime.getTime() + durSec * 1000);
        const item = { channel_id: channelId, video_id: v.id, start_time: currentStartTime.toISOString(), end_time: endTime.toISOString() };
        currentStartTime = endTime;
        return item;
      });
      const { error } = await supabase.from('programming').insert(programmingPayload);
      if (error) throw error;
      const targetCh = userChannels.find(c => c.id === channelId);
      setImportStats({ count: playlistVideos.length, channelName: targetCh?.name || 'tu canal' });
      setImportSuccess(true);
      setPlaylistVideos([]);
      setPlaylistUrl('');
    } catch (err: any) { alert(`Error en importación: ${err.message}`); }
    finally { setIsImporting(false); }
  };

  const hasQuery = query.length > 0;
  const hasResults = filteredResults.length > 0;

  return (
    <div className="sp-root">

      {/* ── Barra de búsqueda idéntica a YouTube ──────────────────────────────── */}
      <div className="sp-topbar">
        <button className="sp-back-btn" onClick={() => navigate('/')} title="Volver">
          <ChevronLeft size={22} />
        </button>

        <div className={`sp-search-wrap ${showSuggestions && hasQuery ? 'sp-search-focused' : ''}`}>
          <Search size={19} className="sp-search-ico" />
          <input
            ref={inputRef}
            className="sp-search-input"
            type="text"
            placeholder="Buscar en YouTube y YouApp..."
            value={query}
            autoComplete="off"
            onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {hasQuery && (
            <button className="sp-clear-btn" onClick={clearSearch}>
              <X size={16} />
            </button>
          )}
          <div className="sp-search-divider" />
          <button className="sp-search-submit" onClick={() => commitSearch(query)} title="Buscar">
            <Search size={18} />
          </button>
          <button
            className={`sp-mic-btn ${isListening ? 'listening' : ''}`}
            title={isListening ? "Escuchando..." : "Buscar por voz"}
            onClick={startVoiceSearch}
          >
            {isListening ? <MicOff size={16} color="#ef4444" /> : <Mic size={16} />}
          </button>

          {/* ── Dropdown de Sugerencias en Vivo de YouTube ───────────────────── */}
          {showSuggestions && (
            <div className="sp-suggest-box" ref={suggestBoxRef}>
              {!hasQuery && history.length > 0 && (
                <>
                  <div className="sp-suggest-section-header">
                    <Clock size={12} /> Búsquedas recientes
                    <button className="sp-clear-history" onMouseDown={() => { clearHistory(); setHistory([]); }}>
                      <Trash2 size={11} /> Borrar
                    </button>
                  </div>
                  {history.slice(0, 6).map(h => (
                    <div key={h} className="sp-suggest-item" onMouseDown={() => commitSearch(h)}>
                      <Clock size={14} className="sp-suggest-icon history" />
                      <span>{h}</span>
                      <button className="sp-suggest-remove" onMouseDown={e => { e.stopPropagation(); removeFromHistory(h); setHistory(getHistory()); }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {hasQuery && liveSuggestions.length > 0 && (
                <>
                  {liveSuggestions.map((s, idx) => (
                    <div key={`${s}-${idx}`} className="sp-suggest-item" onMouseDown={() => commitSearch(s)}>
                      <Search size={14} className="sp-suggest-icon" />
                      <span dangerouslySetInnerHTML={{
                        __html: s.toLowerCase().startsWith(query.toLowerCase())
                          ? `<span>${query}</span><strong>${s.slice(query.length)}</strong>`
                          : s.replace(new RegExp(`(${query})`, 'gi'), '<strong>$1</strong>')
                      }} />
                      <ArrowUpLeft size={13} className="sp-suggest-fill" />
                    </div>
                  ))}
                </>
              )}

              {!hasQuery && (
                <>
                  <div className="sp-suggest-section-header">
                    <TrendingUp size={12} /> Tendencias populares
                  </div>
                  {TRENDING_NOW.map(t => (
                    <div key={t} className="sp-suggest-item trending" onMouseDown={() => commitSearch(t.replace(/^[^\s]+\s/, ''))}>
                      <TrendingUp size={14} className="sp-suggest-icon trending" />
                      <span>{t}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="sp-tabs">
          <button className={`sp-tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
            <Search size={15} /> Buscador
          </button>
          <button className={`sp-tab ${activeTab === 'playlist' ? 'active' : ''}`} onClick={() => setActiveTab('playlist')}>
            <Sparkles size={15} /> Importar Playlist
          </button>
        </div>
      </div>

      {/* ── Modal Búsqueda por Voz ───────────────────────────────────────────── */}
      {isListening && (
        <div className="sp-voice-modal-overlay" onClick={() => setIsListening(false)}>
          <div className="sp-voice-modal" onClick={e => e.stopPropagation()}>
            <div className="sp-voice-header">
              <h3>Búsqueda por voz</h3>
              <button className="sp-voice-close" onClick={() => setIsListening(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="sp-voice-body">
              <div className="sp-voice-pulse-ring">
                <div className="sp-voice-mic-icon">
                  <Mic size={32} color="#fff" />
                </div>
              </div>
              <p className="sp-voice-text">Escuchando tu voz...</p>
              <span className="sp-voice-sub">Di lo que quieres buscar (ej. "Prensa Solidaria", "Noticias en vivo")</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Reproducción de Video ───────────────────────────────────── */}
      {previewVideo && (
        <div className="sp-player-modal-overlay" onClick={() => setPreviewVideo(null)}>
          <div className="sp-player-modal" onClick={e => e.stopPropagation()}>
            <div className="sp-player-header">
              <h4 dangerouslySetInnerHTML={{ __html: previewVideo.title }} />
              <button className="sp-player-close" onClick={() => setPreviewVideo(null)}><X size={18} /></button>
            </div>
            <div className="sp-player-frame-wrap">
              <iframe
                src={`https://www.youtube.com/embed/${previewVideo.videoId}?autoplay=1&rel=0`}
                title={previewVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="sp-player-footer">
              <div className="sp-player-channel">
                <div className="sp-player-avatar">
                  <img src={previewVideo.avatarUrl || `https://i.ytimg.com/vi/${previewVideo.videoId}/default.jpg`} alt="" />
                </div>
                <div>
                  <strong>{previewVideo.author}</strong>
                  <span>{previewVideo.views || 'Transmisión YouTube'}</span>
                </div>
              </div>
              <button className="sp-program-btn" onClick={() => { setPreviewVideo(null); handleProgram(previewVideo); }}>
                <Plus size={16} /> PROGRAMAR EN MI CANAL
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'search' ? (
        <div className="sp-content">

          {/* ── Filtros y Ordenamiento ───────────────────────────────────────── */}
          {hasResults && (
            <div className="sp-filters-row">
              <div className="sp-filter-chips">
                {FILTER_CHIPS.map(f => (
                  <button
                    key={f.id}
                    className={`sp-chip ${activeFilter === f.id ? 'active' : ''}`}
                    onClick={() => setActiveFilter(f.id)}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>

              <div className="sp-sort-select-wrap">
                <SlidersHorizontal size={14} className="sp-sort-ico" />
                <select
                  className="sp-sort-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                >
                  <option value="relevance">Relevancia</option>
                  <option value="duration">Duración</option>
                  <option value="title">Título A-Z</option>
                </select>
              </div>

              <div className="sp-view-toggle">
                <button className={`sp-view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Vista Grilla">
                  <LayoutGrid size={15} />
                </button>
                <button className={`sp-view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="Vista Lista">
                  <List size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── Estado Inicial / Categorías ──────────────────────────────────── */}
          {!committedQuery && !isSearching && (
            <div className="sp-home-state">
              <div className="sp-home-icon"><Search size={44} /></div>
              <h2>Buscador Independiente de YouTube</h2>
              <p>Busca cualquier canal, video o tema y transmítelo en tu señal de TV 24/7</p>

              <div className="sp-category-grid">
                {Object.entries(SEARCH_SUGGESTIONS).map(([cat, items]) => (
                  <div key={cat} className="sp-category-card" onClick={() => commitSearch(items[0])}>
                    <span className="sp-cat-icon">
                      {cat === 'noticias' ? '📺' : cat === 'musica' ? '🎵' : cat === 'streaming' ? '🎙️' :
                        cat === 'gaming' ? '🎮' : cat === 'documentales' ? '🎬' : '⚽'}
                    </span>
                    <span className="sp-cat-label">{cat.toUpperCase()}</span>
                  </div>
                ))}
              </div>

              <div className="sp-trending-section">
                <h3><TrendingUp size={16} /> Búsquedas populares ahora</h3>
                <div className="sp-trending-tags">
                  {TRENDING_NOW.map(t => (
                    <button key={t} className="sp-trending-tag" onClick={() => commitSearch(t.replace(/^[^\s]+\s/, ''))}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Loader Shimmer ───────────────────────────────────────────────── */}
          {isSearching && (
            <div className="sp-searching">
              <div className="sp-search-skeleton-list">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="sp-skeleton-item">
                    <div className="sp-skeleton-thumb" />
                    <div className="sp-skeleton-info">
                      <div className="sp-skeleton-line wide" />
                      <div className="sp-skeleton-line mid" />
                      <div className="sp-skeleton-line short" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tarjeta de Canal Destacado (Estilo YouTube) ─────────────────── */}
          {!isSearching && committedQuery && topChannel && (
            <div className="sp-channel-card">
              <div className="sp-channel-card-avatar">
                <img src={topChannel.avatar} alt={topChannel.name} />
              </div>
              <div className="sp-channel-card-info">
                <div className="sp-channel-card-name-row">
                  <h3>{topChannel.name}</h3>
                  {topChannel.verified && <CheckCircle2 size={16} className="sp-verified-icon" />}
                </div>
                <p className="sp-channel-card-sub">{topChannel.subscribers} · Canal Verificado</p>
                <p className="sp-channel-card-desc">{topChannel.description}</p>
              </div>
              <button className="sp-channel-card-btn" onClick={() => commitSearch(topChannel.name)}>
                <Tv size={16} /> SINTONIZAR CANAL
              </button>
            </div>
          )}

          {/* ── Resultados de Búsqueda ───────────────────────────────────────── */}
          {!isSearching && committedQuery && (
            <>
              {hasResults ? (
                <>
                  <div className="sp-results-header">
                    <p className="sp-results-count">
                      <strong>{filteredResults.length}</strong> resultados para "{committedQuery}"
                    </p>
                  </div>

                  <div className={viewMode === 'grid' ? 'sp-results-grid' : 'sp-results-list'}>
                    {filteredResults.map(video => (
                      <div key={video.id} className={viewMode === 'grid' ? 'sp-video-card-grid' : 'sp-video-card-list'}>
                        {/* Thumbnail */}
                        <div
                          className="sp-thumb-wrap"
                          style={{ backgroundImage: `url(${video.thumbnail})` }}
                          onClick={() => setPreviewVideo(video)}
                        >
                          <div className="sp-thumb-overlay">
                            <button className="sp-play-preview" onClick={e => { e.stopPropagation(); setPreviewVideo(video); }}>
                              <Play size={22} fill="white" />
                            </button>
                          </div>
                          <span className="sp-duration-badge">{video.duration || 'Video'}</span>
                          {video.isLive && <span className="sp-live-badge">🔴 EN VIVO</span>}
                        </div>

                        {/* Info */}
                        <div className="sp-video-info">
                          <div className="sp-video-main-row">
                            {viewMode === 'grid' && (
                              <div className="sp-channel-avatar-sm">
                                <img src={video.avatarUrl || `https://i.ytimg.com/vi/${video.videoId}/default.jpg`} alt="" />
                              </div>
                            )}
                            <div className="sp-video-text-content">
                              <h3
                                className="sp-video-title"
                                onClick={() => setPreviewVideo(video)}
                                dangerouslySetInnerHTML={{ __html: video.title }}
                              />
                              <p className="sp-video-meta">
                                <span className="sp-author">{video.author}</span>
                                <span className="sp-dot">·</span>
                                <span>{video.views || 'YouTube'}</span>
                                <span className="sp-dot">·</span>
                                <span>{video.uploadedAt || 'Reciente'}</span>
                              </p>
                            </div>
                          </div>

                          <div className="sp-card-actions">
                            <button
                              className="sp-btn-preview-link"
                              onClick={() => setPreviewVideo(video)}
                            >
                              <Play size={13} fill="currentColor" /> Ver Video
                            </button>
                            <button
                              className="sp-program-btn"
                              onClick={() => handleProgram(video)}
                            >
                              <Plus size={14} /> PROGRAMAR EN MI CANAL
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="sp-no-results">
                  <Search size={52} />
                  <h3>Sin resultados para "{committedQuery}"</h3>
                  <p>Prueba con "Prensa Solidaria", "América TV", "TN", "Lofi Girl" o "MrBeast"</p>
                  <div className="sp-no-results-suggestions">
                    {TRENDING_NOW.slice(0, 4).map(t => (
                      <button key={t} className="sp-trending-tag" onClick={() => commitSearch(t.replace(/^[^\s]+\s/, ''))}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Pestaña Importador de Playlist ───────────────────────────────── */
        <div className="sp-content">
          <div className="sp-playlist-hero">
            <div className="sp-playlist-hero-icon">
              <ListVideo size={40} />
            </div>
            <div>
              <h2>Importador de Playlist</h2>
              <p>Arma tu canal de TV 24/7 pegando una playlist o lista de videos de YouTube</p>
            </div>
          </div>

          <form onSubmit={handleScanPlaylist} className="sp-playlist-form">
            <div className="sp-playlist-input-row">
              <input
                type="text"
                placeholder="https://youtube.com/playlist?list=PL... o link de video"
                value={playlistUrl}
                onChange={e => setPlaylistUrl(e.target.value)}
                disabled={isScanningPlaylist || isImporting}
              />
              <button type="submit" className="sp-scan-btn" disabled={isScanningPlaylist || !playlistUrl.trim()}>
                {isScanningPlaylist ? <><Loader2 className="spin" size={16} /> Escaneando...</> : <><Search size={16} /> Escanear</>}
              </button>
            </div>
          </form>

          {importSuccess && (
            <div className="sp-import-success">
              <Check size={24} />
              <div>
                <strong>¡Importación exitosa!</strong>
                <p>{importStats.count} videos programados en "{importStats.channelName}"</p>
              </div>
              <button className="sp-btn-go" onClick={() => navigate('/channels')}>Ver Canal →</button>
            </div>
          )}

          {playlistVideos.length > 0 && (
            <div className="sp-scanned-results">
              <div className="sp-scanned-header">
                <div>
                  <h3>{playlistVideos.length} videos listos</h3>
                  <p>Selecciona en qué canal quieres transmitirlos en secuencia 24/7:</p>
                </div>
                <div className="sp-channel-btns">
                  {userChannels.map(ch => (
                    <button
                      key={ch.id}
                      className="sp-import-btn"
                      onClick={() => handleImportPlaylistToChannel(ch.id)}
                      disabled={isImporting}
                    >
                      {isImporting ? <Loader2 className="spin" size={14} /> : '📺'} {ch.name}
                    </button>
                  ))}
                  <button className="sp-new-ch-btn" onClick={createChannel}>
                    <Plus size={14} /> Nuevo canal
                  </button>
                </div>
              </div>

              <div className="sp-preview-grid">
                {playlistVideos.slice(0, 16).map((v, idx) => (
                  <div key={v.id} className="sp-preview-card">
                    <div className="sp-preview-num">#{idx + 1}</div>
                    <img src={v.thumbnail} alt="" className="sp-preview-thumb" />
                    <div className="sp-preview-info">
                      <h5 dangerouslySetInnerHTML={{ __html: v.title }} />
                      <span>{v.duration}</span>
                    </div>
                  </div>
                ))}
                {playlistVideos.length > 16 && (
                  <div className="sp-more-badge">+{playlistVideos.length - 16} videos más en la lista</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal de Programación ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="sp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sp-modal" onClick={e => e.stopPropagation()}>
            {!programmed ? (
              <>
                <div className="sp-modal-header">
                  <h2>¿En qué canal querés programarlo?</h2>
                  {selectedVideo && (
                    <div className="sp-modal-preview">
                      <img src={selectedVideo.thumbnail} alt="" />
                      <div>
                        <p dangerouslySetInnerHTML={{ __html: selectedVideo.title }} />
                        <span>{selectedVideo.author} · {selectedVideo.duration}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="sp-modal-channels">
                  {userChannels.length === 0 ? (
                    <p className="sp-modal-empty">No tienes canales creados todavía. Crea uno primero.</p>
                  ) : (
                    userChannels.map(ch => (
                      <button key={ch.id} className="sp-modal-channel-item" onClick={() => confirmProgram(ch.id)}>
                        <span className="sp-channel-icon">📺</span>
                        <span>{ch.name}</span>
                        <Plus size={16} className="sp-channel-add" />
                      </button>
                    ))
                  )}
                  <button className="sp-modal-new-channel" onClick={createChannel}>
                    <Plus size={16} /> Crear nuevo canal
                  </button>
                </div>
                <button className="sp-modal-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              </>
            ) : (
              <div className="sp-success-state">
                <div className="sp-success-ring">
                  <Check size={44} />
                </div>
                <h2>¡Video Programado!</h2>
                <p>Ya forma parte de la señal de tu canal 24/7</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .sp-root {
          min-height: 100vh;
          background: #0f0f0f;
          color: #f1f1f1;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
        }

        .sp-topbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(15,15,15,0.98);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding: 10px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .sp-back-btn {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          display: flex;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .sp-back-btn:hover { background: rgba(255,255,255,0.1); color: white; }

        .sp-search-wrap {
          flex: 1;
          max-width: 680px;
          position: relative;
          display: flex;
          align-items: center;
          background: #121212;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 40px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .sp-search-wrap:focus-within, .sp-search-focused {
          border-color: #3ea6ff;
          box-shadow: 0 0 0 1px #3ea6ff;
        }

        .sp-search-ico {
          color: rgba(255,255,255,0.5);
          margin-left: 14px;
          flex-shrink: 0;
        }
        .sp-search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: white;
          font-size: 1rem;
          padding: 11px 10px;
          font-family: inherit;
          min-width: 0;
        }
        .sp-search-input::placeholder { color: rgba(255,255,255,0.38); }

        .sp-clear-btn {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          padding: 6px;
          display: flex;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .sp-clear-btn:hover { color: white; }

        .sp-search-divider {
          width: 1px;
          height: 24px;
          background: rgba(255,255,255,0.15);
          flex-shrink: 0;
        }

        .sp-search-submit {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
          flex-shrink: 0;
        }
        .sp-search-submit:hover { color: white; }

        .sp-mic-btn {
          background: rgba(255,255,255,0.06);
          border: none;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          border-radius: 0 40px 40px 0;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .sp-mic-btn:hover { background: rgba(255,255,255,0.1); color: white; }
        .sp-mic-btn.listening {
          background: rgba(239,68,68,0.2);
          animation: micPulse 1.2s infinite;
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }

        .sp-suggest-box {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: #212121;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 16px 48px rgba(0,0,0,0.8);
          z-index: 200;
          max-height: 420px;
          overflow-y: auto;
        }

        .sp-suggest-section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px 4px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(255,255,255,0.4);
        }
        .sp-clear-history {
          margin-left: auto;
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          font-size: 0.7rem;
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .sp-clear-history:hover { color: #ff4e4e; }

        .sp-suggest-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 0.9rem;
          color: rgba(255,255,255,0.85);
          transition: background 0.12s;
        }
        .sp-suggest-item:hover { background: rgba(255,255,255,0.08); }
        .sp-suggest-icon { color: rgba(255,255,255,0.4); flex-shrink: 0; }
        .sp-suggest-icon.trending { color: #ff6b35; }
        .sp-suggest-remove {
          margin-left: auto;
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.3);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
        }
        .sp-suggest-remove:hover { color: white; background: rgba(255,255,255,0.1); }
        .sp-suggest-fill { color: rgba(255,255,255,0.2); margin-left: auto; flex-shrink: 0; }

        .sp-tabs {
          display: flex;
          gap: 4px;
          background: rgba(255,255,255,0.05);
          padding: 4px;
          border-radius: 12px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .sp-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.6);
          border-radius: 9px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.18s;
        }
        .sp-tab.active {
          background: #3ea6ff;
          color: #0f0f0f;
          box-shadow: 0 2px 12px rgba(62,166,255,0.35);
        }

        .sp-content {
          flex: 1;
          max-width: 1240px;
          width: 100%;
          margin: 0 auto;
          padding: 20px 18px 40px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ─── Channel Card ─────────────────────────────────────────────────── */
        .sp-channel-card {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 20px 24px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          animation: spCardIn 0.3s ease-out;
        }
        .sp-channel-card-avatar img {
          width: 88px; height: 88px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,255,255,0.12);
        }
        .sp-channel-card-info { flex: 1; min-width: 0; }
        .sp-channel-card-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .sp-channel-card-name-row h3 { margin: 0; font-size: 1.25rem; font-weight: 700; color: #fff; }
        .sp-verified-icon { color: #3ea6ff; }
        .sp-channel-card-sub { margin: 0 0 6px; font-size: 0.85rem; color: rgba(255,255,255,0.55); font-weight: 500; }
        .sp-channel-card-desc {
          margin: 0; font-size: 0.82rem; color: rgba(255,255,255,0.45);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .sp-channel-card-btn {
          display: flex; align-items: center; gap: 8px;
          background: #fff; color: #0f0f0f; border: none;
          padding: 10px 18px; border-radius: 20px;
          font-weight: 700; font-size: 0.82rem; cursor: pointer;
          transition: transform 0.15s, background 0.15s;
          white-space: nowrap; flex-shrink: 0;
        }
        .sp-channel-card-btn:hover { background: #3ea6ff; color: #0f0f0f; transform: scale(1.03); }

        /* ─── Filters & Sort ───────────────────────────────────────────────── */
        .sp-filters-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .sp-filter-chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          flex: 1;
        }
        .sp-filter-chips::-webkit-scrollbar { display: none; }
        .sp-chip {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.85);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.82rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.18s;
        }
        .sp-chip:hover { background: rgba(255,255,255,0.15); }
        .sp-chip.active { background: white; color: #0f0f0f; border-color: white; }

        .sp-sort-select-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 4px 12px;
          color: rgba(255,255,255,0.8);
          font-size: 0.82rem;
        }
        .sp-sort-ico { color: #3ea6ff; }
        .sp-sort-select {
          background: transparent;
          border: none;
          color: white;
          font-size: 0.82rem;
          font-weight: 600;
          outline: none;
          cursor: pointer;
          font-family: inherit;
        }
        .sp-sort-select option { background: #212121; color: white; }

        .sp-view-toggle {
          display: flex;
          gap: 2px;
          background: rgba(255,255,255,0.06);
          padding: 3px;
          border-radius: 8px;
          flex-shrink: 0;
        }
        .sp-view-btn {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 6px;
          display: flex;
        }
        .sp-view-btn.active { background: rgba(255,255,255,0.14); color: white; }

        /* ─── Grid & List Results ──────────────────────────────────────────── */
        .sp-results-header { padding: 0; }
        .sp-results-count { margin: 0; font-size: 0.85rem; color: rgba(255,255,255,0.5); }
        .sp-results-count strong { color: rgba(255,255,255,0.9); }

        .sp-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 24px;
        }
        .sp-video-card-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: spCardIn 0.3s ease-out both;
        }
        @keyframes spCardIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }

        .sp-results-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sp-video-card-list {
          display: flex;
          gap: 18px;
          align-items: flex-start;
          padding: 10px;
          border-radius: 12px;
          transition: background 0.15s;
          animation: spCardIn 0.3s ease-out both;
        }
        .sp-video-card-list:hover { background: rgba(255,255,255,0.04); }
        .sp-video-card-list .sp-thumb-wrap { width: 280px; min-width: 280px; height: 158px; padding-top: 0; }
        .sp-video-card-list .sp-video-title { font-size: 1.05rem; }

        .sp-thumb-wrap {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background-size: cover;
          background-position: center;
          border-radius: 12px;
          overflow: hidden;
          background-color: #1a1a1a;
          cursor: pointer;
        }
        .sp-thumb-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .sp-thumb-wrap:hover .sp-thumb-overlay { opacity: 1; }
        .sp-play-preview {
          width: 52px; height: 52px;
          background: rgba(0,0,0,0.85);
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .sp-play-preview:hover { transform: scale(1.1); background: #3ea6ff; }

        .sp-duration-badge {
          position: absolute;
          bottom: 8px; right: 8px;
          background: rgba(0,0,0,0.85);
          color: white;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 5px;
        }
        .sp-live-badge {
          position: absolute;
          top: 8px; left: 8px;
          background: #cc0000;
          color: white;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 3px 7px;
          border-radius: 4px;
        }

        .sp-video-info { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .sp-video-main-row { display: flex; gap: 12px; }
        .sp-channel-avatar-sm img {
          width: 36px; height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }
        .sp-video-text-content { flex: 1; }
        .sp-video-title {
          margin: 0 0 4px;
          font-size: 0.95rem;
          font-weight: 600;
          color: #f1f1f1;
          line-height: 1.4;
          cursor: pointer;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .sp-video-title:hover { color: #3ea6ff; }

        .sp-video-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.55);
          margin: 0;
          flex-wrap: wrap;
        }
        .sp-author { color: rgba(255,255,255,0.75); font-weight: 500; }
        .sp-dot { opacity: 0.4; }

        .sp-card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .sp-btn-preview-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.85);
          border: 1px solid rgba(255,255,255,0.12);
          padding: 7px 12px;
          border-radius: 18px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sp-btn-preview-link:hover { background: rgba(255,255,255,0.15); color: white; }

        .sp-program-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #3ea6ff;
          color: #0f0f0f;
          border: none;
          padding: 7px 14px;
          border-radius: 18px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.18s, transform 0.15s;
        }
        .sp-program-btn:hover { background: #60baff; transform: scale(1.03); }

        /* ─── Home State ───────────────────────────────────────────────────── */
        .sp-home-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          padding: 30px 20px;
          text-align: center;
        }
        .sp-home-icon {
          width: 76px; height: 76px;
          background: rgba(255,255,255,0.05);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.3);
        }
        .sp-home-state h2 { margin: 0; font-size: 1.5rem; }
        .sp-home-state p { margin: 0; color: rgba(255,255,255,0.5); font-size: 0.95rem; max-width: 480px; }

        .sp-category-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          width: 100%;
          max-width: 520px;
        }
        .sp-category-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .sp-category-card:hover {
          background: rgba(62,166,255,0.12);
          border-color: rgba(62,166,255,0.3);
          transform: translateY(-2px);
        }
        .sp-cat-icon { font-size: 1.8rem; }
        .sp-cat-label { font-size: 0.76rem; font-weight: 700; color: rgba(255,255,255,0.8); }

        .sp-trending-section { width: 100%; max-width: 640px; }
        .sp-trending-section h3 {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.9rem; margin: 0 0 12px 0;
          color: rgba(255,255,255,0.6);
        }
        .sp-trending-tags { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .sp-trending-tag {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.8);
          padding: 7px 16px;
          border-radius: 20px;
          font-size: 0.83rem;
          cursor: pointer;
          transition: all 0.18s;
        }
        .sp-trending-tag:hover { background: rgba(62,166,255,0.18); border-color: #3ea6ff; color: white; }

        /* ─── Player Modal ─────────────────────────────────────────────────── */
        .sp-player-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.88);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 300;
          padding: 20px;
        }
        .sp-player-modal {
          background: #181818;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          width: 100%;
          max-width: 800px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 60px rgba(0,0,0,0.9);
        }
        .sp-player-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .sp-player-header h4 { margin: 0; font-size: 1rem; color: #fff; }
        .sp-player-close {
          background: transparent; border: none; color: rgba(255,255,255,0.6);
          cursor: pointer; padding: 6px; border-radius: 50%; display: flex;
        }
        .sp-player-close:hover { background: rgba(255,255,255,0.1); color: white; }
        .sp-player-frame-wrap {
          position: relative;
          padding-top: 56.25%;
          background: #000;
        }
        .sp-player-frame-wrap iframe {
          position: absolute;
          inset: 0;
          width: 100%; height: 100%;
          border: none;
        }
        .sp-player-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .sp-player-channel { display: flex; align-items: center; gap: 12px; }
        .sp-player-avatar img { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
        .sp-player-channel strong { display: block; font-size: 0.95rem; }
        .sp-player-channel span { font-size: 0.78rem; color: rgba(255,255,255,0.5); }

        /* ─── Skeleton ─────────────────────────────────────────────────────── */
        .sp-search-skeleton-list { display: flex; flex-direction: column; gap: 16px; }
        .sp-skeleton-item { display: flex; gap: 16px; }
        .sp-skeleton-thumb {
          width: 260px; min-width: 260px; height: 146px;
          background: linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 10px;
        }
        .sp-skeleton-info { flex: 1; display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
        .sp-skeleton-line {
          height: 12px; border-radius: 6px;
          background: linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .sp-skeleton-line.wide { width: 85%; }
        .sp-skeleton-line.mid { width: 60%; }
        .sp-skeleton-line.short { width: 40%; }
        @keyframes shimmer { to { background-position: -200% 0; } }

        /* ─── Voice Modal ──────────────────────────────────────────────────── */
        .sp-voice-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 300;
        }
        .sp-voice-modal {
          background: #212121;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 24px;
          width: 90%;
          max-width: 400px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        .sp-voice-header { width: 100%; display: flex; align-items: center; justify-content: space-between; }
        .sp-voice-header h3 { margin: 0; font-size: 1.1rem; }
        .sp-voice-close { background: transparent; border: none; color: rgba(255,255,255,0.6); cursor: pointer; padding: 6px; border-radius: 50%; display: flex; }
        .sp-voice-body { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
        .sp-voice-pulse-ring {
          width: 90px; height: 90px; border-radius: 50%;
          background: rgba(239,68,68,0.2);
          display: flex; align-items: center; justify-content: center;
          animation: voiceRing 1.5s infinite;
        }
        @keyframes voiceRing {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); transform: scale(0.95); }
          70% { box-shadow: 0 0 0 24px rgba(239,68,68,0); transform: scale(1.05); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); transform: scale(0.95); }
        }
        .sp-voice-mic-icon { width: 58px; height: 58px; border-radius: 50%; background: #ef4444; display: flex; align-items: center; justify-content: center; }
        .sp-voice-text { margin: 0; font-size: 1.2rem; font-weight: 700; color: white; }
        .sp-voice-sub { font-size: 0.83rem; color: rgba(255,255,255,0.5); max-width: 280px; }

        /* ─── Playlist Importer ────────────────────────────────────────────── */
        .sp-playlist-hero {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          background: linear-gradient(135deg, rgba(62,166,255,0.12), rgba(99,102,241,0.08));
          border: 1px solid rgba(62,166,255,0.2);
          border-radius: 16px;
        }
        .sp-playlist-hero-icon {
          width: 68px; height: 68px;
          background: rgba(62,166,255,0.15);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #3ea6ff;
          flex-shrink: 0;
        }
        .sp-playlist-hero h2 { margin: 0 0 4px; font-size: 1.3rem; }
        .sp-playlist-hero p { margin: 0; color: rgba(255,255,255,0.55); font-size: 0.9rem; }
        .sp-playlist-form { width: 100%; }
        .sp-playlist-input-row { display: flex; gap: 10px; }
        .sp-playlist-input-row input {
          flex: 1; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: white; padding: 13px 18px; border-radius: 12px;
          font-size: 0.95rem; outline: none; font-family: inherit;
        }
        .sp-playlist-input-row input:focus { border-color: #3ea6ff; }
        .sp-scan-btn {
          display: flex; align-items: center; gap: 7px;
          background: #3ea6ff; color: #0f0f0f; border: none;
          padding: 13px 22px; border-radius: 12px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
        }
        .spin { animation: spinAnim 1s linear infinite; }
        @keyframes spinAnim { to { transform: rotate(360deg); } }

        .sp-import-success {
          display: flex; align-items: center; gap: 14px;
          background: rgba(16,185,129,0.12);
          border: 1px solid rgba(16,185,129,0.3);
          border-radius: 14px; padding: 16px 20px; color: #34d399;
        }
        .sp-btn-go {
          margin-left: auto; background: #10b981; color: white;
          border: none; padding: 9px 16px; border-radius: 10px;
          font-size: 0.85rem; font-weight: 700; cursor: pointer;
        }

        .sp-scanned-results {
          display: flex; flex-direction: column; gap: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 20px;
        }
        .sp-scanned-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
        .sp-scanned-header h3 { margin: 0 0 4px; font-size: 1.1rem; }
        .sp-channel-btns { display: flex; flex-wrap: wrap; gap: 8px; }
        .sp-import-btn {
          display: flex; align-items: center; gap: 6px;
          background: #3ea6ff; color: #0f0f0f; border: none;
          padding: 9px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer;
        }
        .sp-new-ch-btn {
          display: flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.08);
          border: 1px dashed rgba(255,255,255,0.2);
          color: rgba(255,255,255,0.7);
          padding: 9px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
        }
        .sp-preview-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px; max-height: 380px; overflow-y: auto;
        }
        .sp-preview-card { display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(255,255,255,0.04); border-radius: 10px; }
        .sp-preview-num { font-size: 0.68rem; font-weight: 800; color: rgba(255,255,255,0.3); min-width: 22px; text-align: center; }
        .sp-preview-thumb { width: 52px; height: 30px; border-radius: 5px; object-fit: cover; }
        .sp-preview-info { flex: 1; overflow: hidden; }
        .sp-preview-info h5 { margin: 0; font-size: 0.75rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sp-preview-info span { font-size: 0.67rem; color: rgba(255,255,255,0.4); }
        .sp-more-badge { grid-column: 1 / -1; text-align: center; padding: 10px; color: rgba(255,255,255,0.4); font-size: 0.82rem; }

        /* ─── Modal Programar ──────────────────────────────────────────────── */
        .sp-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          z-index: 200; padding: 20px;
        }
        .sp-modal {
          background: #212121; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px; width: 100%; max-width: 440px; padding: 28px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .sp-modal-header h2 { margin: 0 0 14px; font-size: 1.2rem; }
        .sp-modal-preview { display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 10px; margin-bottom: 6px; }
        .sp-modal-preview img { width: 80px; height: 45px; border-radius: 7px; object-fit: cover; }
        .sp-modal-preview p { margin: 0 0 4px; font-size: 0.85rem; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .sp-modal-preview span { font-size: 0.75rem; color: rgba(255,255,255,0.45); }
        .sp-modal-channels { display: flex; flex-direction: column; gap: 8px; }
        .sp-modal-empty { color: rgba(255,255,255,0.45); font-size: 0.88rem; margin: 0; padding: 12px 0; }
        .sp-modal-channel-item {
          display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          padding: 12px 16px; border-radius: 12px; color: white; font-size: 0.95rem; cursor: pointer;
        }
        .sp-modal-channel-item:hover { background: rgba(62,166,255,0.18); border-color: #3ea6ff; }
        .sp-channel-add { margin-left: auto; color: #3ea6ff; }
        .sp-modal-new-channel {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: transparent; border: 1px dashed rgba(255,255,255,0.2);
          padding: 10px 16px; border-radius: 12px; color: rgba(255,255,255,0.5); font-size: 0.88rem; cursor: pointer;
        }
        .sp-modal-cancel { background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.5); padding: 10px; border-radius: 10px; cursor: pointer; }
        .sp-success-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; text-align: center; }
        .sp-success-ring { width: 80px; height: 80px; background: rgba(16,185,129,0.15); border: 2px solid #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #10b981; }

        .sp-no-results { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; text-align: center; color: rgba(255,255,255,0.4); }
        .sp-no-results h3 { margin: 0; font-size: 1.1rem; color: rgba(255,255,255,0.7); }
        .sp-no-results-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }

        @media (max-width: 700px) {
          .sp-topbar { padding: 8px 10px; gap: 8px; }
          .sp-tabs { display: none; }
          .sp-channel-card { flex-direction: column; text-align: center; gap: 14px; }
          .sp-channel-card-name-row { justify-content: center; }
          .sp-results-grid { grid-template-columns: 1fr; }
          .sp-video-card-list { flex-direction: column; }
          .sp-video-card-list .sp-thumb-wrap { width: 100%; height: auto; padding-top: 56.25%; }
          .sp-category-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  );
}
