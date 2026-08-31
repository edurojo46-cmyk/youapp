/**
 * ChannelSearch — Buscador de Canales de YouTube para YouApp
 *
 * - Motor: YouTube InnerTube API (resultados reales de YouTube sin API Key)
 * - Diseño UI Light inspirado en referencia visual YouApp TV
 * - Adaptado para desktop con layout centrado y fluido
 * - Botón "Agregar a mi señal" integrado con LiveZapping y Supabase
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Mic, MicOff, ChevronRight,
  Clock, Bookmark, Loader2, Check, Play, Sparkles,
  Shield, Landmark, Cpu, Video, Music, Brain
} from 'lucide-react';

import { UNIVERSAL_CATALOG, type UniversalChannel } from '../lib/universalChannels';
import { executeSearch } from '../lib/search/searchEngine';
import { fetchYouTubeAutocomplete } from '../lib/search/queryEngine';
import type { ContentItem } from '../lib/search/types';
import { resolveChannelPlayable, type YTChannelResult } from '../lib/youtubeChannelSearch';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';

// ── Historial y Canales Guardados ──────────────────────────────────────────────
const HIST_KEY = 'youapp_chsearch_v4';
const SAVED_CHANNELS_KEY = 'youapp_saved_custom_channels';

const getHist = (): string[] => {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
};
const saveHist = (q: string) => {
  const h = getHist().filter(x => x !== q);
  localStorage.setItem(HIST_KEY, JSON.stringify([q, ...h].slice(0, 15)));
};
const getSavedCustomChannels = (): UniversalChannel[] => {
  try { return JSON.parse(localStorage.getItem(SAVED_CHANNELS_KEY) || '[]'); } catch { return []; }
};

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

  const [searchTab, setSearchTab] = useState<'channels' | 'videos'>('channels');
  const searchRaceRef = useRef(0);
  const [results, setResults] = useState<{ videos: ContentItem[]; channels: ContentItem[]; all: ContentItem[] }>({
    videos: [],
    channels: [],
    all: []
  });
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [isLiveSearch, setIsLiveSearch] = useState(true);

  const [savedChannels, setSavedChannels] = useState<UniversalChannel[]>(getSavedCustomChannels);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // ── Autocompletado de YouTube en tiempo real ────────────────────────────────
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setHints([]); return; }
    let active = true;
    const timer = setTimeout(async () => {
      const suggestions = await fetchYouTubeAutocomplete(query);
      if (!active) return;
      setHints(suggestions.slice(0, 7));
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  // ── Búsqueda Principal ──────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string, tabOverride?: 'channels' | 'videos') => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setCommitted(trimmed);
    setStatus('loading');
    setShowDrop(false);
    saveHist(trimmed);
    setHistory(getHist());
    inputRef.current?.blur();
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const currentSearchId = ++searchRaceRef.current;
    try {
      const searchData = await executeSearch(trimmed);
      if (searchRaceRef.current !== currentSearchId) return;
      setResults(searchData);
      setIsLiveSearch(true);
    } catch (err) {
      if (searchRaceRef.current !== currentSearchId) return;
      console.warn('[doSearch] Error:', err);
    } finally {
      if (searchRaceRef.current === currentSearchId) setStatus('done');
    }
  }, [searchTab]);

  // ── Play Video ─────────────────────────────────────────────────────────────
  const handlePlayVideo = (vid: ContentItem) => {
    let effectiveUrl = vid.videoUrl;
    let rawId = vid.id || '';
    if (!effectiveUrl) {
      rawId = (vid.id && vid.id.length === 11) ? vid.id : 'wR36Dq7bB60';
      effectiveUrl = `https://www.youtube.com/embed/${rawId}`;
    }
    const payload: UniversalChannel = {
      id: `video-${rawId}-${Date.now()}`,
      name: vid.channelTitle || 'Video a la Carta',
      category: '🎬 Video On-Demand',
      description: vid.title,
      avatarUrl: vid.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
      thumbnail: vid.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
      provider: 'youtube',
      videoId: rawId,
      videoUrl: effectiveUrl,
      currentVideoTitle: vid.title,
      viewerCount: Math.floor(Math.random() * 25000) + 5000,
      isLive: vid.isLive || false,
      durationSeconds: 0,
      tags: ['video', 'ondemand', vid.provider || 'youtube']
    };
    localStorage.setItem('youapp_active_channel_id', payload.id);
    localStorage.setItem('youapp_tune_channel_payload', JSON.stringify(payload));
    navigate('/live');
  };

  // ── Add Video to Signal ────────────────────────────────────────────────────
  const handleAddVideoToSignal = (vid: ContentItem) => {
    const effectiveUrl = vid.videoUrl || (vid.id && vid.id.length === 11
      ? `https://www.youtube.com/embed/${vid.id}`
      : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(vid.title)}`);
    const newChannel: UniversalChannel = {
      id: `video-${vid.id || Date.now()}`,
      name: `${vid.channelTitle || 'Video'}: ${vid.title.slice(0, 30)}...`,
      category: '🎬 Video Guardado',
      description: vid.title,
      avatarUrl: vid.thumbnail,
      thumbnail: vid.thumbnail,
      provider: 'youtube',
      videoId: (vid.id && vid.id.length === 11) ? vid.id : undefined,
      videoUrl: effectiveUrl,
      currentVideoTitle: vid.title,
      viewerCount: Math.floor(Math.random() * 25000) + 5000,
      isLive: vid.isLive || false,
      tags: ['video', 'guardado', vid.provider || 'youtube']
    };
    const updated = [newChannel, ...savedChannels];
    setSavedChannels(updated);
    localStorage.setItem(SAVED_CHANNELS_KEY, JSON.stringify(updated));
    setToastMessage(`¡"${vid.title.slice(0, 25)}..." guardado en tu señal! 📺`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ── Búsqueda por Voz ───────────────────────────────────────────────────────
  const startVoiceSearch = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Tu navegador no soporta búsqueda por voz'); return; }
    const recognition = new SR();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      if (text) { setQuery(text); doSearch(text); }
    };
    recognition.start();
  };

  // ── Toggle Add to Signal ───────────────────────────────────────────────────
  const toggleAddToSignal = async (ch: YTChannelResult): Promise<UniversalChannel | null> => {
    const exists = savedChannelIds.has(ch.channelId);
    let updatedList: UniversalChannel[] = [];
    if (exists) {
      updatedList = savedChannels.filter(c => c.channelId !== ch.channelId && c.id !== `custom-yt-${ch.channelId}`);
      setToastMessage(`Canal "${ch.name}" removido de tu señal`);
      setSavedChannels(updatedList);
      localStorage.setItem(SAVED_CHANNELS_KEY, JSON.stringify(updatedList));
      return null;
    } else {
      const playable = await resolveChannelPlayable(ch.channelId, ch.name);
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
        } catch { /* Si falla Supabase, sigue en localStorage */ }
      }
      setTimeout(() => setToastMessage(null), 4000);
      return newChannel;
    }
  };

  // ── Tune In Direct ─────────────────────────────────────────────────────────
  const tuneInDirect = async (ch: YTChannelResult) => {
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
    const filtered = savedChannels.filter(c => c.channelId !== ch.channelId && c.id !== targetId);
    const updated = [newChannel, ...filtered];
    setSavedChannels(updated);
    localStorage.setItem(SAVED_CHANNELS_KEY, JSON.stringify(updated));
    localStorage.setItem('youapp_active_channel_id', targetId);
    localStorage.setItem('youapp_tune_channel_payload', JSON.stringify(newChannel));
    navigate('/live');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const displayItems = [...results.channels, ...results.videos].slice(0, 12);

  const fallbackThumbs = [
    'https://images.unsplash.com/photo-1522674705398-51903ee7a52c?w=400&q=80',
    'https://images.unsplash.com/photo-1455182172024-9fe0773ff88e?w=400&q=80',
    'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=400&q=80',
  ];

  return (
    <div className="ys-page" ref={scrollContainerRef}>
      <div className="ys-column">

        {/* LOGO */}
        <div className="ys-logo">
          <span className="ys-logo-main">Y O U A P P</span>
          <span className="ys-logo-tv">T V</span>
        </div>

        {/* SEARCH BAR */}
        <div className="ys-search-wrap">
          <div className={`ys-search-bar${showDrop && (hints.length > 0 || (history.length > 0 && !query)) ? ' open' : ''}`}>
            <Search size={20} className="ys-search-ico" />
            <input
              ref={inputRef}
              className="ys-search-input"
              type="text"
              placeholder="¿Qué querés ver?"
              value={query}
              autoComplete="off"
              onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
              onFocus={() => setShowDrop(true)}
              onBlur={() => setTimeout(() => setShowDrop(false), 240)}
              onKeyDown={e => {
                if (e.key === 'Enter') doSearch(query);
                if (e.key === 'Escape') setShowDrop(false);
              }}
            />
            {query && (
              <button className="ys-clear-btn" onClick={() => { setQuery(''); setHints([]); inputRef.current?.focus(); }}>
                <X size={16} />
              </button>
            )}
            <button className={`ys-mic-btn${isListening ? ' listening' : ''}`} onClick={startVoiceSearch}>
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>

          {showDrop && (hints.length > 0 || (history.length > 0 && !query)) && (
            <div className="ys-dropdown">
              {query && hints.map((h, i) => (
                <button key={i} className="ys-drop-item" onMouseDown={() => { setQuery(h); doSearch(h); }}>
                  <Search size={14} className="ys-drop-ico" /><span>{h}</span>
                </button>
              ))}
              {!query && history.slice(0, 5).map((h, i) => (
                <button key={i} className="ys-drop-item" onMouseDown={() => { setQuery(h); doSearch(h); }}>
                  <Clock size={14} className="ys-drop-ico" /><span>{h}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BUSCAR CON IA */}
        <div className="ys-ia-row">
          <button className="ys-ia-btn" onClick={() => doSearch(query || 'recomendados')} disabled={status === 'loading'}>
            <Sparkles size={15} /><span>Buscar con IA</span>
          </button>
        </div>

        {/* AI BANNER */}
        <div className="ys-ai-banner" onClick={() => doSearch(query || 'recomendados para mi')}>
          <div className="ys-ai-icon-wrap">
            <Sparkles size={22} className="ys-ai-icon" />
          </div>
          <div className="ys-ai-text">
            <p className="ys-ai-title">La IA entiende tu búsqueda</p>
            <p className="ys-ai-sub">y te muestra solo lo mejor</p>
          </div>
          <ChevronRight size={18} className="ys-ai-arrow" />
        </div>

        {/* FILTER PILLS */}
        <div className="ys-pills-row">
          {[
            { icon: <Shield size={13} />, label: 'Boca Juniors' },
            { icon: <Landmark size={13} />, label: 'Historia argentina' },
            { icon: <Cpu size={13} />, label: 'IA' },
            { icon: <Video size={13} />, label: 'Documentales' },
            { icon: <Music size={13} />, label: 'Música' },
          ].map(({ icon, label }) => (
            <button key={label} className="ys-pill" onClick={() => { setQuery(label); doSearch(label); }}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>

        {/* LOADING */}
        {status === 'loading' && (
          <div className="ys-loading">
            <Loader2 size={28} className="ys-spin" />
            <p>Buscando "{committed}"...</p>
          </div>
        )}

        {/* RESULTS */}
        {status === 'done' && (
          <div className="ys-results-section">
            <div className="ys-results-header">
              <h2 className="ys-results-title">Resultados recomendados</h2>
              <button className="ys-ver-todo">Ver todo <ChevronRight size={14} /></button>
            </div>

            <div className="ys-results-list">
              {displayItems.length === 0 && (
                <div className="ys-empty">
                  <Search size={36} />
                  <p>No encontramos resultados para "{committed}"</p>
                </div>
              )}

              {displayItems.map((item, idx) => {
                const isVideo = item.type === 'video';
                const vid = item as any;
                const thumb = vid.thumbnail || vid.avatarUrl || fallbackThumbs[idx % fallbackThumbs.length];
                const title = vid.title || vid.name || 'Sin título';
                const provider = vid.channelTitle || vid.handle || 'YouTube';
                const meta = isVideo ? 'Video' : 'Canal';
                const duration = vid.duration || (vid.isLive ? 'EN VIVO' : null);
                const isFirst = idx === 0;
                const isAdded = isVideo
                  ? savedChannelIds.has(vid.providerId || vid.id)
                  : savedChannelIds.has(vid.channelId);

                const handleSave = () => {
                  if (isVideo) handleAddVideoToSignal(vid);
                  else toggleAddToSignal(vid);
                };
                const handlePlay = () => {
                  if (isVideo) handlePlayVideo(vid);
                  else tuneInDirect(vid);
                };

                return (
                  <div key={idx} className={`ys-card${isFirst ? ' ys-card-featured' : ''}`}>
                    <div className="ys-card-thumb" onClick={handlePlay}>
                      <img src={thumb} alt={title} loading="lazy" />
                      {duration && <span className="ys-card-duration">{duration}</span>}
                      <div className="ys-card-play-overlay">
                        <Play size={20} fill="white" />
                      </div>
                    </div>

                    <div className="ys-card-info">
                      {isFirst && (
                        <span className="ys-you-select-badge">
                          <Sparkles size={10} /> You Select
                        </span>
                      )}
                      <h3 className="ys-card-title">{title}</h3>
                      <p className="ys-card-provider">{provider}</p>
                      <p className="ys-card-meta">{meta} • 2024</p>
                    </div>

                    <div className="ys-card-action">
                      {isVideo && (() => {
                        // Extract YouTube video ID robustly from all possible fields
                        const extractYtId = (url?: string) => {
                          if (!url) return null;
                          // embed URL: /embed/VIDEO_ID or /embed/VIDEO_ID?...
                          const embedMatch = url.match(/\/embed\/([^/?&]+)/);
                          if (embedMatch) return embedMatch[1];
                          // watch URL: ?v=VIDEO_ID
                          const watchMatch = url.match(/[?&]v=([^&]+)/);
                          if (watchMatch) return watchMatch[1];
                          // youtu.be/VIDEO_ID
                          const shortMatch = url.match(/youtu\.be\/([^/?&]+)/);
                          if (shortMatch) return shortMatch[1];
                          return null;
                        };

                        // For external YouTube results, vid.id IS the videoId
                        // For supabase results, vid.id = 'youapp_idx_UUID'
                        const isSupabaseItem = String(vid.id || '').startsWith('youapp_idx_');
                        const ytId = isSupabaseItem
                          ? extractYtId(vid.videoUrl) || extractYtId(vid.canonicalUrl)
                          : vid.id; // external YouTube: id = videoId directly

                        if (!ytId) return null;
                        return (
                          <button
                            className="ys-ai-summary-btn"
                            onClick={() => navigate(`/ai-summary/${ytId}`, {
                              state: {
                                title: title,
                                description: vid.description || '',
                                thumbnail: thumb,
                                author: provider
                              }
                            })}
                          >
                            <Brain size={13} /> Resumen IA
                          </button>
                        );
                      })()}
                      <button className={`ys-save-btn${isAdded ? ' saved' : ''}`} onClick={handleSave}>
                        {isAdded ? (
                          <><Check size={15} /><span>Guardado</span></>
                        ) : idx % 2 === 0 ? (
                          <><Bookmark size={15} /><span>Guardar</span></>
                        ) : (
                          <><Clock size={15} /><span>Programar</span></>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* IDLE */}
        {status === 'idle' && (
          <div className="ys-idle-hint">
            <Search size={40} className="ys-idle-icon" />
            <p>Escribí algo para empezar a buscar</p>
            <p className="ys-idle-sub">Canales, videos, documentales, música…</p>
          </div>
        )}
      </div>

      {/* BOTTOM BANNER */}
      <div className="ys-bottom-banner">
        <div className="ys-banner-icon">
          <Sparkles size={20} />
        </div>
        <div className="ys-banner-text">
          <h4>Haceme una TV</h4>
          <p className="ys-banner-sub1">Tu señal con IA</p>
          <p className="ys-banner-sub2">Creamos una señal única con lo que más te gusta.</p>
        </div>
        <button className="ys-banner-btn" onClick={() => navigate('/create-signal')}>
          <Sparkles size={14} /><span>Crear mi señal</span>
        </button>
      </div>

      {toastMessage && (
        <div className="ys-toast">
          <Check size={16} /><span>{toastMessage}</span>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .ys-page {
          min-height: 100vh;
          background: #f0f2f5;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 20px 140px;
          position: relative;
        }

        .ys-column {
          width: 100%;
          max-width: 680px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 36px;
        }

        /* LOGO */
        .ys-logo {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 28px;
          letter-spacing: 5px;
          font-size: 1.1rem;
          font-weight: 700;
        }
        .ys-logo-main { color: #1a1a2e; }
        .ys-logo-tv { color: #3b82f6; font-weight: 800; }

        /* SEARCH BAR */
        .ys-search-wrap { width: 100%; position: relative; margin-bottom: 16px; }
        .ys-search-bar {
          background: #ffffff;
          border-radius: 50px;
          display: flex;
          align-items: center;
          padding: 10px 18px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.07);
          border: 1.5px solid transparent;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ys-search-bar.open {
          border-color: #dde5f4;
          border-radius: 20px 20px 0 0;
        }
        .ys-search-ico { color: #aab0c4; margin-right: 12px; flex-shrink: 0; }
        .ys-search-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 1rem;
          color: #1a1a2e;
          outline: none;
          font-family: 'Inter', sans-serif;
        }
        .ys-search-input::placeholder { color: #aab0c4; }
        .ys-clear-btn {
          background: none; border: none; color: #aab0c4; cursor: pointer;
          display: flex; padding: 4px; margin-right: 4px;
          border-radius: 50%; transition: background 0.15s;
        }
        .ys-clear-btn:hover { background: #f0f2f5; }
        .ys-mic-btn {
          background: none; border: none; color: #3b82f6; cursor: pointer;
          display: flex; align-items: center; padding: 6px;
          border-radius: 50%; transition: background 0.15s;
        }
        .ys-mic-btn:hover { background: #eff6ff; }
        .ys-mic-btn.listening { color: #ef4444; animation: ys-pulse 1s infinite; }

        /* DROPDOWN */
        .ys-dropdown {
          position: absolute; top: 100%; left: 0; right: 0;
          background: #ffffff;
          border: 1.5px solid #dde5f4; border-top: none;
          border-radius: 0 0 20px 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          z-index: 50; overflow: hidden;
        }
        .ys-drop-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; text-align: left; background: none; border: none;
          padding: 11px 20px; font-size: 0.9rem; color: #374151;
          cursor: pointer; transition: background 0.12s; font-family: 'Inter', sans-serif;
        }
        .ys-drop-item:hover { background: #f8faff; }
        .ys-drop-ico { color: #aab0c4; flex-shrink: 0; }

        /* BUSCAR CON IA */
        .ys-ia-row { display: flex; justify-content: center; margin-bottom: 20px; }
        .ys-ia-btn {
          display: flex; align-items: center; gap: 8px;
          background: #ffffff; border: 1.5px solid #dde5f4;
          color: #3b82f6; padding: 9px 22px; border-radius: 30px;
          font-size: 0.9rem; font-weight: 600; cursor: pointer;
          transition: all 0.2s; font-family: 'Inter', sans-serif;
          box-shadow: 0 2px 12px rgba(59,130,246,0.08);
        }
        .ys-ia-btn:hover { background: #eff6ff; border-color: #3b82f6; box-shadow: 0 4px 16px rgba(59,130,246,0.15); }
        .ys-ia-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* AI BANNER */
        .ys-ai-banner {
          width: 100%; background: #ffffff; border-radius: 18px;
          padding: 18px 22px; display: flex; align-items: center; gap: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-bottom: 20px;
          cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
        }
        .ys-ai-banner:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(59,130,246,0.1); }
        .ys-ai-icon-wrap {
          width: 48px; height: 48px; border-radius: 50%;
          background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(59,130,246,0.15);
        }
        .ys-ai-icon { color: #3b82f6; }
        .ys-ai-text { flex: 1; }
        .ys-ai-title { margin: 0; font-size: 1rem; font-weight: 600; color: #1a1a2e; }
        .ys-ai-sub { margin: 2px 0 0; font-size: 0.85rem; color: #6b7280; }
        .ys-ai-arrow { color: #aab0c4; flex-shrink: 0; }

        /* PILLS */
        .ys-pills-row {
          display: flex; gap: 10px; overflow-x: auto; width: 100%;
          padding-bottom: 8px; margin-bottom: 28px; scrollbar-width: none;
        }
        .ys-pills-row::-webkit-scrollbar { display: none; }
        .ys-pill {
          display: flex; align-items: center; gap: 6px;
          background: #ffffff; border: 1.5px solid #e5e7eb;
          color: #374151; padding: 7px 16px; border-radius: 20px;
          font-size: 0.85rem; font-weight: 500; white-space: nowrap; cursor: pointer;
          transition: all 0.18s; font-family: 'Inter', sans-serif;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .ys-pill:hover { background: #eff6ff; border-color: #93c5fd; color: #3b82f6; }

        /* LOADING */
        .ys-loading {
          display: flex; flex-direction: column; align-items: center;
          gap: 12px; padding: 48px 0; color: #6b7280; font-size: 0.95rem;
        }
        .ys-spin { animation: ys-spin 1s linear infinite; color: #3b82f6; }
        @keyframes ys-spin { 100% { transform: rotate(360deg); } }

        /* IDLE */
        .ys-idle-hint {
          display: flex; flex-direction: column; align-items: center;
          padding: 60px 0; color: #9ca3af; text-align: center;
        }
        .ys-idle-icon { margin-bottom: 16px; color: #d1d5db; }
        .ys-idle-hint p { margin: 0; font-size: 1rem; color: #6b7280; font-weight: 500; }
        .ys-idle-sub { font-size: 0.85rem !important; color: #9ca3af !important; margin-top: 6px !important; font-weight: 400 !important; }

        /* RESULTS */
        .ys-results-section { width: 100%; }
        .ys-results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .ys-results-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #1a1a2e; }
        .ys-ver-todo {
          display: flex; align-items: center; gap: 2px;
          background: none; border: none; color: #9ca3af; font-size: 0.85rem;
          cursor: pointer; font-family: 'Inter', sans-serif; transition: color 0.15s;
        }
        .ys-ver-todo:hover { color: #3b82f6; }
        .ys-results-list { display: flex; flex-direction: column; gap: 10px; }

        /* CARD */
        .ys-card {
          background: #ffffff; border-radius: 16px; padding: 12px;
          display: flex; align-items: center; gap: 14px;
          border: 1.5px solid transparent;
          box-shadow: 0 2px 10px rgba(0,0,0,0.04);
          transition: all 0.18s; position: relative;
        }
        .ys-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.08); transform: translateY(-1px); }
        .ys-card-featured {
          border-color: #93c5fd; background: #f8fbff;
          box-shadow: 0 4px 20px rgba(59,130,246,0.1);
        }

        /* THUMBNAIL */
        .ys-card-thumb {
          position: relative; width: 130px; height: 76px;
          border-radius: 10px; overflow: hidden; flex-shrink: 0;
          cursor: pointer; background: #e5e7eb;
        }
        .ys-card-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
        .ys-card-thumb:hover img { transform: scale(1.05); }
        .ys-card-duration {
          position: absolute; bottom: 5px; left: 5px;
          background: rgba(0,0,0,0.75); color: #fff;
          font-size: 0.68rem; font-weight: 700; padding: 2px 6px;
          border-radius: 4px; letter-spacing: 0.5px;
        }
        .ys-card-play-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0);
          display: flex; align-items: center; justify-content: center; transition: background 0.2s;
        }
        .ys-card-play-overlay svg { opacity: 0; transform: scale(0.8); transition: all 0.2s; }
        .ys-card-thumb:hover .ys-card-play-overlay { background: rgba(0,0,0,0.35); }
        .ys-card-thumb:hover .ys-card-play-overlay svg { opacity: 1; transform: scale(1); }

        /* CARD INFO */
        .ys-card-info { flex: 1; min-width: 0; position: relative; }
        .ys-you-select-badge {
          display: inline-flex; align-items: center; gap: 4px;
          background: #eff6ff; color: #3b82f6;
          font-size: 0.68rem; font-weight: 600; padding: 2px 8px;
          border-radius: 10px; margin-bottom: 5px; border: 1px solid #dbeafe;
        }
        .ys-card-title {
          margin: 0 0 3px; font-size: 0.93rem; font-weight: 600; color: #1a1a2e;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ys-card-provider { margin: 0 0 2px; font-size: 0.8rem; color: #6b7280; }
        .ys-card-meta { margin: 0; font-size: 0.75rem; color: #9ca3af; }

        /* CARD ACTION */
        .ys-card-action { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
        .ys-save-btn {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          background: none; border: none; color: #6b7280;
          font-size: 0.68rem; font-weight: 500; cursor: pointer;
          padding: 6px 10px; border-radius: 10px; transition: all 0.18s;
          font-family: 'Inter', sans-serif;
        }
        .ys-save-btn:hover { background: #f3f4f6; color: #374151; }
        .ys-save-btn.saved { color: #10b981; }
        .ys-save-btn.saved:hover { background: #ecfdf5; }

        .ys-ai-summary-btn {
          display: inline-flex; align-items: center; gap: 5px;
          background: rgba(79, 70, 229, 0.08);
          color: #6366f1;
          border: 1px solid rgba(79, 70, 229, 0.2);
          padding: 5px 10px; border-radius: 14px;
          font-size: 0.7rem; font-weight: 600; cursor: pointer;
          transition: all 0.18s; font-family: 'Inter', sans-serif;
          white-space: nowrap;
        }
        .ys-ai-summary-btn:hover { background: rgba(79,70,229,0.18); color: #4f46e5; border-color: rgba(79,70,229,0.4); }

        /* EMPTY */
        .ys-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 12px; padding: 48px 0; color: #9ca3af; text-align: center; font-size: 0.95rem;
        }

        /* BOTTOM BANNER */
        .ys-bottom-banner {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          width: calc(100% - 40px); max-width: 680px;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border-radius: 20px; padding: 14px 20px;
          display: flex; align-items: center; gap: 14px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          border: 1.5px solid rgba(255,255,255,0.6); z-index: 100;
        }
        .ys-banner-icon {
          width: 42px; height: 42px; border-radius: 50%;
          background: linear-gradient(135deg, #dbeafe, #eff6ff);
          display: flex; align-items: center; justify-content: center;
          color: #3b82f6; flex-shrink: 0; box-shadow: 0 2px 10px rgba(59,130,246,0.15);
        }
        .ys-banner-text { flex: 1; }
        .ys-banner-text h4 { margin: 0; font-size: 0.95rem; font-weight: 700; color: #1a1a2e; }
        .ys-banner-sub1 { margin: 1px 0 0; font-size: 0.8rem; color: #6b7280; }
        .ys-banner-sub2 { margin: 1px 0 0; font-size: 0.72rem; color: #9ca3af; }
        .ys-banner-btn {
          display: flex; align-items: center; gap: 6px;
          background: #ffffff; border: 1.5px solid #93c5fd; color: #3b82f6;
          padding: 8px 16px; border-radius: 20px;
          font-size: 0.85rem; font-weight: 600; cursor: pointer;
          transition: all 0.18s; font-family: 'Inter', sans-serif; flex-shrink: 0;
        }
        .ys-banner-btn:hover { background: #3b82f6; color: #fff; border-color: #3b82f6; box-shadow: 0 4px 14px rgba(59,130,246,0.3); }

        /* TOAST */
        .ys-toast {
          position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%);
          background: #1a1a2e; color: white;
          padding: 12px 22px; border-radius: 30px;
          display: flex; align-items: center; gap: 10px;
          font-size: 0.9rem; font-weight: 500;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          animation: ys-slideup 0.3s ease; z-index: 200; white-space: nowrap;
        }
        @keyframes ys-slideup {
          from { transform: translateX(-50%) translateY(16px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes ys-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
