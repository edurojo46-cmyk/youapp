import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Tv, Sparkles, Star, Play, Radio, Loader2, CheckCircle2, Plus, PlusCircle, ExternalLink } from 'lucide-react';
import { searchRealYouTubeChannels, CURATED_POPULAR_CHANNELS } from '../lib/youtube';

interface Channel {
  id: string;
  name: string;
  category?: string;
  currentVideoTitle?: string;
  avatarUrl?: string;
  videoUrl?: string;
  thumbnail?: string;
}

interface ChannelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  onSelectChannel: (index: number) => void;
  onAddChannel?: (channel: any) => void;
  onSelectRealYouTubeChannel?: (channelId: string, channelTitle: string) => void;
}

const POPULAR_CHANNELS = [
  'Crónica TV', 'Carnaval Stream', 'TN En Vivo', 'MrBeast', 'Ibai', 
  'Lofi Girl', 'Luzu TV', 'Olga', 'Platzi', 'Red Bull'
];

export default function ChannelSearchModal({
  isOpen,
  onClose,
  channels,
  onSelectChannel,
  onAddChannel,
  onSelectRealYouTubeChannel
}: ChannelSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [ytChannels, setYtChannels] = useState<any[]>([]);
  const [isSearchingYT, setIsSearchingYT] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'youtube' | 'grilla'>('all');
  const [addedChannelFeedback, setAddedChannelFeedback] = useState<string | null>(null);

  // Búsqueda en tiempo real en YouTube con debounce rápido
  useEffect(() => {
    if (!searchTerm.trim()) {
      setYtChannels([]);
      setIsSearchingYT(false);
      return;
    }

    const clean = searchTerm.trim();
    // Si es URL o @handle, buscar de inmediato sin esperar debounce
    const isDirect = clean.startsWith('http') || clean.startsWith('@') || clean.includes('youtube.com');
    const delay = isDirect ? 0 : 200;

    const timer = setTimeout(async () => {
      setIsSearchingYT(true);
      try {
        const results = await searchRealYouTubeChannels(clean);
        setYtChannels(results);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingYT(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const localFiltered = useMemo(() => {
    if (!searchTerm.trim()) return channels;
    const term = searchTerm.toLowerCase();
    return channels.filter(ch =>
      ch.name.toLowerCase().includes(term) ||
      (ch.category && ch.category.toLowerCase().includes(term)) ||
      (ch.currentVideoTitle && ch.currentVideoTitle.toLowerCase().includes(term))
    );
  }, [channels, searchTerm]);

  if (!isOpen) return null;

  const handleQuickChannelClick = (channelName: string) => {
    setSearchTerm(channelName);
  };

  const handleAddAndPlay = (yt: any) => {
    const newChannel = {
      id: yt.id || `yt-${yt.channelId || yt.videoId || Math.random().toString(36).slice(2)}`,
      name: yt.name,
      category: yt.category || '🔴 Canal YouTube',
      viewerCount: yt.viewerCount || Math.floor(Math.random() * 5000) + 1200,
      videoUrl: yt.videoUrl || `https://www.youtube.com/embed/${yt.videoId || 'jfKfPfyJRdk'}`,
      currentVideoTitle: yt.currentVideoTitle || yt.name,
      thumbnail: yt.thumbnail || yt.avatarUrl,
      author: yt.name,
      avatarUrl: yt.avatarUrl,
      isLive: yt.isLive !== undefined ? yt.isLive : true
    };

    setAddedChannelFeedback(yt.name);
    setTimeout(() => setAddedChannelFeedback(null), 2500);

    if (onAddChannel) {
      onAddChannel(newChannel);
    } else if (onSelectRealYouTubeChannel) {
      onSelectRealYouTubeChannel(yt.channelId, yt.name);
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    const clean = searchTerm.trim();
    setIsSearchingYT(true);
    try {
      const results = await searchRealYouTubeChannels(clean);
      if (results && results.length > 0) {
        handleAddAndPlay(results[0]);
      }
    } catch (err) {
      console.error("Error on search submit:", err);
    } finally {
      setIsSearchingYT(false);
    }
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal-container glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera del Buscador */}
        <form onSubmit={handleSubmit} className="search-header">
          <div className="search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Pega link de Canal (@MrBeast, youtube.com/@ibai, playlist o video) o busca..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            {searchTerm && (
              <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </form>

        {/* Notificación de canal agregado */}
        {addedChannelFeedback && (
          <div className="added-feedback-toast">
            <CheckCircle2 size={18} color="#4ade80" />
            <span>¡Canal <strong>"{addedChannelFeedback}"</strong> agregado a la grilla y sintonizado!</span>
          </div>
        )}

        {/* Canales Populares Sugeridos */}
        <div className="quick-tags-bar">
          <span className="quick-tag-label">Sugeridos:</span>
          {POPULAR_CHANNELS.map(name => (
            <button
              key={name}
              type="button"
              className={`tag-chip ${searchTerm === name ? 'active' : ''}`}
              onClick={() => handleQuickChannelClick(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Pestañas de Resultados */}
        <div className="search-tabs-row">
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Todos los Canales
          </button>
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'youtube' ? 'active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube (+ Agregar a Grilla) {ytChannels.length > 0 && `(${ytChannels.length})`}
          </button>
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'grilla' ? 'active' : ''}`}
            onClick={() => setActiveTab('grilla')}
          >
            En Tu Grilla ({localFiltered.length})
          </button>
        </div>

        {/* Lista de Resultados */}
        <div className="search-results-list">
          {/* Indicador de Carga */}
          {isSearchingYT && (
            <div className="search-loading-row">
              <Loader2 size={20} className="animate-spin text-accent" />
              <span>Buscando canales oficiales en YouTube...</span>
            </div>
          )}

          {/* 1. SECCIÓN CANALES REALES DE YOUTUBE (CON BOTÓN AGREGAR A GRILLA) */}
          {(activeTab === 'all' || activeTab === 'youtube') && ytChannels.length > 0 && (
            <div className="results-group">
              <div className="group-title">
                <Radio size={16} className="text-accent" />
                <span>CANALES DE YOUTUBE (TOCA PARA SINTONIZAR Y AGREGAR A LA GRILLA)</span>
              </div>

              {ytChannels.map(yt => (
                <div
                  key={yt.id}
                  className="search-channel-card yt-real-card"
                  onClick={() => handleAddAndPlay(yt)}
                >
                  <div className="channel-avatar-box yt-avatar">
                    <img src={yt.avatarUrl || yt.thumbnail} alt={yt.name} className="channel-avatar" />
                  </div>

                  <div className="channel-info">
                    <div className="channel-title-row">
                      <h4>{yt.name}</h4>
                      <CheckCircle2 size={14} className="verified-badge" />
                      <span className="yt-badge">{yt.isLive ? '🔴 EN VIVO' : 'YOUTUBE'}</span>
                    </div>
                    <p className="channel-program-name">
                      {yt.currentVideoTitle || yt.description || 'Transmisión continua 24/7'}
                    </p>
                  </div>

                  <div className="card-actions-right">
                    <button 
                      className="add-to-grid-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddAndPlay(yt);
                      }}
                      title="Agregar este canal a mi grilla de televisión"
                    >
                      <Plus size={16} />
                      <span>AGREGAR A GRILLA</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 2. SECCIÓN CANALES DE LA GRILLA LOCAL */}
          {(activeTab === 'all' || activeTab === 'grilla') && (
            <div className="results-group">
              <div className="group-title">
                <Tv size={16} />
                <span>CANALES ACTIVOS EN TU GRILLA ({localFiltered.length})</span>
              </div>

              {localFiltered.length > 0 ? (
                localFiltered.map(channel => {
                  const originalIndex = channels.findIndex(c => c.id === channel.id);
                  return (
                    <div
                      key={channel.id}
                      className="search-channel-card"
                      onClick={() => {
                        if (originalIndex !== -1) {
                          onSelectChannel(originalIndex);
                        }
                        onClose();
                      }}
                    >
                      <div className="channel-ch-num">
                        CH {String((originalIndex !== -1 ? originalIndex : 0) + 1).padStart(2, '0')}
                      </div>

                      <div className="channel-avatar-box">
                        {channel.avatarUrl || channel.thumbnail ? (
                          <img src={channel.avatarUrl || channel.thumbnail} alt={channel.name} className="channel-avatar" />
                        ) : (
                          <div className="channel-avatar-placeholder">
                            <Tv size={18} />
                          </div>
                        )}
                      </div>

                      <div className="channel-info">
                        <div className="channel-title-row">
                          <h4>{channel.name}</h4>
                          <span className="channel-badge">{channel.category || 'General'}</span>
                        </div>
                        {channel.currentVideoTitle && (
                          <p 
                            className="channel-program-name"
                            dangerouslySetInnerHTML={{ __html: channel.currentVideoTitle }}
                          />
                        )}
                      </div>

                      <button className="zap-to-btn" title="Sintonizar canal">
                        <Play size={16} fill="white" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state-text">No hay canales de la grilla que coincidan.</div>
              )}
            </div>
          )}

          {/* Sin resultados */}
          {!isSearchingYT && ytChannels.length === 0 && localFiltered.length === 0 && (
            <div className="no-results-box">
              <Sparkles size={40} className="no-results-icon" />
              <h3>No se encontraron canales</h3>
              <p>Prueba buscando con el nombre de un creador como "MrBeast", "Ibai", "Platzi" o "Lofi Girl".</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .added-feedback-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid rgba(74, 222, 128, 0.4);
          color: #86efac;
          padding: 8px 16px;
          margin: 0 20px 8px 20px;
          border-radius: 12px;
          font-size: 0.85rem;
          animation: fadeIn 0.2s ease-out;
        }

        .card-actions-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .add-to-grid-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #6366f1;
          color: white;
          border: none;
          padding: 8px 14px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.4);
          white-space: nowrap;
        }

        .add-to-grid-btn:hover {
          background: #4f46e5;
          transform: scale(1.05);
        }

        .add-to-grid-btn:active {
          transform: scale(0.95);
        }

        .search-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .search-modal-container {
          width: 100%;
          max-width: 720px;
          max-height: 88vh;
          background: #0d1017;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.95);
          overflow: hidden;
        }

        .search-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .search-input-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 14px;
          padding: 12px 16px;
        }

        .search-icon {
          color: #818cf8;
          flex-shrink: 0;
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          font-size: 1.05rem;
          font-weight: 500;
          outline: none;
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .clear-btn, .close-modal-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 50%;
          transition: background 0.2s, color 0.2s;
        }

        .clear-btn:hover, .close-modal-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .quick-tags-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          overflow-x: auto;
          scrollbar-width: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
        }

        .quick-tags-bar::-webkit-scrollbar {
          display: none;
        }

        .quick-tag-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          flex-shrink: 0;
        }

        .tag-chip {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.85);
          padding: 5px 12px;
          border-radius: 16px;
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tag-chip:hover {
          background: rgba(99, 102, 241, 0.3);
          border-color: #6366f1;
          color: white;
        }

        .tag-chip.active {
          background: #6366f1;
          border-color: #6366f1;
          color: white;
        }

        .search-tabs-row {
          display: flex;
          gap: 12px;
          padding: 8px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .tab-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.8rem;
          font-weight: 700;
          padding: 6px 0;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: color 0.2s, border-color 0.2s;
        }

        .tab-btn.active {
          color: #a5b4fc;
          border-bottom-color: #6366f1;
        }

        .search-results-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 60vh;
        }

        .search-loading-row {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #a5b4fc;
          font-size: 0.85rem;
          padding: 10px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 12px;
        }

        .results-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .group-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .search-channel-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          cursor: pointer;
          transition: transform 0.15s, background 0.15s, border-color 0.15s;
        }

        .yt-real-card {
          background: rgba(99, 102, 241, 0.06);
          border-color: rgba(99, 102, 241, 0.2);
        }

        .search-channel-card:hover {
          background: rgba(99, 102, 241, 0.18);
          border-color: rgba(99, 102, 241, 0.5);
          transform: translateY(-2px);
        }

        .channel-ch-num {
          font-family: monospace;
          font-size: 0.85rem;
          font-weight: 800;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.15);
          padding: 4px 8px;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .channel-avatar-box {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .channel-avatar {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .channel-avatar-placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .channel-info {
          flex: 1;
          min-width: 0;
        }

        .channel-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 3px;
        }

        .channel-title-row h4 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 700;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .verified-badge {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .yt-badge {
          font-size: 0.65rem;
          font-weight: 800;
          background: #ef4444;
          color: white;
          padding: 2px 6px;
          border-radius: 6px;
          letter-spacing: 0.5px;
        }

        .channel-badge {
          font-size: 0.65rem;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.7);
          padding: 2px 6px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .channel-program-name {
          margin: 0;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .zap-to-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #6366f1;
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.9;
          transition: opacity 0.2s, transform 0.15s;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
        }

        .search-channel-card:hover .zap-to-btn {
          opacity: 1;
          transform: scale(1.1);
          background: #4f46e5;
        }

        .no-results-box {
          text-align: center;
          padding: 40px 20px;
          color: rgba(255, 255, 255, 0.6);
        }

        .no-results-icon {
          color: #6366f1;
          margin-bottom: 12px;
          animation: pulse 2s infinite;
        }

        .empty-state-text {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
          padding: 10px;
        }

        @media (max-width: 600px) {
          .search-modal-container {
            max-height: 94vh;
            border-radius: 20px;
          }
          .search-header {
            padding: 12px 14px;
          }
          .search-results-list {
            padding: 10px 14px;
          }
          .search-channel-card {
            padding: 10px 12px;
          }
          .channel-avatar-box {
            width: 42px;
            height: 42px;
          }
        }
      `}</style>
    </div>
  );
}
