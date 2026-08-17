import React, { useState, useMemo } from 'react';
import { Search, X, Tv, Sparkles, Star, Play, Radio } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  category?: string;
  currentVideoTitle?: string;
  avatarUrl?: string;
}

interface ChannelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  onSelectChannel: (index: number) => void;
  onSearchYouTube?: (query: string) => void;
}

const QUICK_TAGS = ['🔥 En Vivo', '🧘 Relax', '☕ Lo-Fi', '🧠 Ciencia', '🎮 Gaming', '⚽ Deportes', '🍿 Películas', '🎙️ Podcasts', '🍳 Cocina'];

export default function ChannelSearchModal({
  isOpen,
  onClose,
  channels,
  onSelectChannel,
  onSearchYouTube
}: ChannelSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  const filtered = useMemo(() => {
    let result = channels;
    if (selectedTag) {
      const cleanTag = selectedTag.replace(/^[^\s]+\s/, '').toLowerCase();
      result = result.filter(ch => 
        (ch.category && ch.category.toLowerCase().includes(cleanTag)) ||
        (ch.name && ch.name.toLowerCase().includes(cleanTag)) ||
        (ch.currentVideoTitle && ch.currentVideoTitle.toLowerCase().includes(cleanTag))
      );
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(ch =>
        ch.name.toLowerCase().includes(term) ||
        (ch.category && ch.category.toLowerCase().includes(term)) ||
        (ch.currentVideoTitle && ch.currentVideoTitle.toLowerCase().includes(term))
      );
    }
    return result;
  }, [channels, searchTerm, selectedTag]);

  if (!isOpen) return null;

  const handleCustomYouTubeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim() && onSearchYouTube) {
      onSearchYouTube(searchTerm.trim());
      onClose();
    }
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal-container glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera del Buscador */}
        <div className="search-header">
          <div className="search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Buscar canal, programa, tema o creador..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (selectedTag) setSelectedTag('');
              }}
              autoFocus
            />
            {searchTerm && (
              <button className="clear-btn" onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Chips de Búsqueda Rápida */}
        <div className="quick-tags-bar">
          {QUICK_TAGS.map(tag => (
            <button
              key={tag}
              className={`tag-chip ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => {
                if (selectedTag === tag) {
                  setSelectedTag('');
                } else {
                  setSelectedTag(tag);
                  setSearchTerm('');
                }
              }}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Lista de Canales Encontrados */}
        <div className="search-results-list">
          {filtered.length > 0 ? (
            filtered.map((channel) => {
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
                    {channel.avatarUrl ? (
                      <img src={channel.avatarUrl} alt={channel.name} className="channel-avatar" />
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
            <div className="no-results-box">
              <Sparkles size={40} className="no-results-icon" />
              <h3>No se encontraron canales locales</h3>
              <p>¿Quieres buscar transmisiones en vivo de "{searchTerm}" directamente en YouTube?</p>
              {onSearchYouTube && (
                <button className="btn btn-primary search-yt-btn" onClick={handleCustomYouTubeSearch}>
                  <Radio size={16} />
                  <span>Buscar en Vivo en YouTube</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .search-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .search-modal-container {
          width: 100%;
          max-width: 680px;
          max-height: 85vh;
          background: #0f111a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9);
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
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 10px 16px;
        }

        .search-icon {
          color: #a5b4fc;
          flex-shrink: 0;
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          font-size: 1rem;
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
          gap: 8px;
          padding: 12px 20px;
          overflow-x: auto;
          scrollbar-width: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .quick-tags-bar::-webkit-scrollbar {
          display: none;
        }

        .tag-chip {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tag-chip:hover {
          background: rgba(255, 255, 255, 0.12);
          color: white;
        }

        .tag-chip.active {
          background: #6366f1;
          border-color: #6366f1;
          color: white;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.4);
        }

        .search-results-list {
          flex: 1;
          overflow-y: auto;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 55vh;
        }

        .search-channel-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          cursor: pointer;
          transition: transform 0.15s, background 0.15s, border-color 0.15s;
        }

        .search-channel-card:hover {
          background: rgba(99, 102, 241, 0.12);
          border-color: rgba(99, 102, 241, 0.35);
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
          width: 44px;
          height: 44px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
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
          gap: 8px;
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
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #6366f1;
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.8;
          transition: opacity 0.2s, transform 0.15s;
        }

        .search-channel-card:hover .zap-to-btn {
          opacity: 1;
          transform: scale(1.1);
        }

        .no-results-box {
          text-align: center;
          padding: 30px 20px;
          color: rgba(255, 255, 255, 0.6);
        }

        .no-results-icon {
          color: #6366f1;
          margin-bottom: 12px;
          animation: pulse 2s infinite;
        }

        .search-yt-btn {
          margin-top: 15px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: 700;
        }

        @media (max-width: 600px) {
          .search-modal-container {
            max-height: 92vh;
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
            width: 38px;
            height: 38px;
          }
        }
      `}</style>
    </div>
  );
}
