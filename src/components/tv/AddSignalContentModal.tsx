import React, { useState } from 'react';
import { X, Search, Plus, Sparkles, Youtube, Link as LinkIcon, Check, Film, Tv } from 'lucide-react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { supabase } from '../../lib/supabase';
import { extractYouTubeId } from '../../lib/search/publishers/publisherVideoExtractor';

interface AddSignalContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (block: ScheduleBlock) => void;
  existingCount: number;
}

const QUICK_SUGGESTIONS = [
  {
    id: 'sug-1',
    title: 'La Renga - Balada Del Diablo y La Muerte (En Vivo)',
    channelName: 'La Renga Oficial',
    providerId: 'e499dZ5q3s8',
    durationSec: 360,
    thumbnailUrl: 'https://img.youtube.com/vi/e499dZ5q3s8/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=e499dZ5q3s8',
    topic: 'Música & Rock'
  },
  {
    id: 'sug-2',
    title: 'Historia de Roma: De la República al Imperio',
    channelName: 'Canal Encuentro',
    providerId: 'EngW7tLk6R8',
    durationSec: 2400,
    thumbnailUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600',
    videoUrl: 'https://www.youtube.com/watch?v=EngW7tLk6R8',
    topic: 'Historia'
  },
  {
    id: 'sug-3',
    title: 'Discurso Histórico del 17 de Octubre - TV Pública',
    channelName: 'TV Pública / AGN',
    providerId: 'dQw4w9WgXcQ',
    durationSec: 1200,
    thumbnailUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    topic: 'Archivo Histórico'
  },
  {
    id: 'sug-4',
    title: 'Cosmos: El Universo y la Vida Marina 4K',
    channelName: 'Ciencia & Naturaleza',
    providerId: 'r9PeYPHdpNo',
    durationSec: 2940,
    thumbnailUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600',
    videoUrl: 'https://www.youtube.com/watch?v=r9PeYPHdpNo',
    topic: 'Naturaleza & 4K'
  }
];

export function AddSignalContentModal({
  isOpen,
  onClose,
  onAddBlock,
  existingCount
}: AddSignalContentModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'url' | 'suggestions'>('suggestions');
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddFromUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) return;

    const ytId = extractYouTubeId(cleanUrl) || cleanUrl;
    const finalTitle = titleInput.trim() || `Video Agregado (${ytId})`;

    const newBlock: ScheduleBlock = {
      id: `block-user-${Date.now()}`,
      position: existingCount,
      startOffsetSec: existingCount * 600,
      durationSec: 600,
      topic: 'Personalizado',
      role: 'deep_dive',
      contentItem: {
        id: ytId,
        providerId: ytId,
        type: 'video',
        provider: 'youtube',
        title: finalTitle,
        thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        videoUrl: cleanUrl.startsWith('http') ? cleanUrl : `https://www.youtube.com/watch?v=${ytId}`,
        channelName: 'Mi Canal',
        channelId: 'user_channel',
        isLive: false,
        isVerified: true
      }
    };

    onAddBlock(newBlock);
    setUrlInput('');
    setTitleInput('');
    onClose();
  };

  const handleSearchAtlas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const { data } = await supabase
        .from('youapp_index')
        .select('*')
        .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        .limit(10);

      setSearchResults(data || []);
    } catch (err) {
      console.error('Error buscando en Atlas:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (sug: typeof QUICK_SUGGESTIONS[0]) => {
    setAddedId(sug.id);
    const newBlock: ScheduleBlock = {
      id: `block-sug-${Date.now()}`,
      position: existingCount,
      startOffsetSec: existingCount * 600,
      durationSec: sug.durationSec,
      topic: sug.topic,
      role: 'deep_dive',
      contentItem: {
        id: sug.providerId,
        providerId: sug.providerId,
        type: 'video',
        provider: 'youtube',
        title: sug.title,
        thumbnailUrl: sug.thumbnailUrl,
        videoUrl: sug.videoUrl,
        channelName: sug.channelName,
        channelId: 'pub_channel',
        isLive: false,
        isVerified: true
      }
    };

    setTimeout(() => {
      onAddBlock(newBlock);
      onClose();
    }, 300);
  };

  const handleSelectAtlasItem = (item: any) => {
    setAddedId(item.id);
    const newBlock: ScheduleBlock = {
      id: `block-atlas-${Date.now()}`,
      position: existingCount,
      startOffsetSec: existingCount * 600,
      durationSec: item.duration_seconds || 600,
      topic: item.source || 'Atlas',
      role: 'deep_dive',
      contentItem: {
        id: item.provider_content_id || item.video_id || item.id,
        providerId: item.provider_content_id || item.video_id,
        type: 'video',
        provider: (item.provider as any) || 'youtube',
        title: item.title,
        thumbnailUrl: item.thumbnail || `https://img.youtube.com/vi/${item.provider_content_id}/hqdefault.jpg`,
        videoUrl: item.url || `https://www.youtube.com/watch?v=${item.provider_content_id}`,
        channelName: item.creator_name || 'Creador',
        channelId: item.creator_id || 'creator',
        isLive: false,
        isVerified: true
      }
    };

    setTimeout(() => {
      onAddBlock(newBlock);
      onClose();
    }, 300);
  };

  return (
    <div className="add-signal-overlay" onClick={onClose}>
      <div className="add-signal-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Plus size={20} className="modal-icon" />
            <h3>Agregar Contenido a Mi Señal</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button 
            className={`tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
            onClick={() => setActiveTab('suggestions')}
          >
            <Sparkles size={16} /> Sugerencias Rápidas
          </button>
          <button 
            className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
            onClick={() => setActiveTab('url')}
          >
            <LinkIcon size={16} /> Pegar Enlace YouTube
          </button>
          <button 
            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={16} /> Buscar en Atlas
          </button>
        </div>

        {/* Tab Contents */}
        <div className="modal-body">
          {activeTab === 'suggestions' && (
            <div className="suggestions-list">
              <p className="tab-desc">Selecciona un video para incorporarlo a tu programación continua:</p>
              <div className="cards-grid">
                {QUICK_SUGGESTIONS.map((sug) => (
                  <div 
                    key={sug.id} 
                    className={`suggestion-card ${addedId === sug.id ? 'added' : ''}`}
                    onClick={() => handleSelectSuggestion(sug)}
                  >
                    <div 
                      className="sug-thumb" 
                      style={{ backgroundImage: `url(${sug.thumbnailUrl})` }}
                    />
                    <div className="sug-info">
                      <h4>{sug.title}</h4>
                      <div className="sug-meta">
                        <span className="sug-channel">{sug.channelName}</span>
                        <span className="sug-topic">{sug.topic}</span>
                      </div>
                    </div>
                    <button className="add-icon-btn">
                      {addedId === sug.id ? <Check size={16} color="#10b981" /> : <Plus size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'url' && (
            <form onSubmit={handleAddFromUrl} className="url-form">
              <p className="tab-desc">Pega cualquier URL de YouTube o ID de video para añadirlo a tu señal:</p>
              
              <div className="input-group">
                <label>URL o ID del Video</label>
                <div className="input-wrap">
                  <Youtube size={18} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Título Personalizado (Opcional)</label>
                <div className="input-wrap">
                  <Film size={18} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="Ej: Mi Documental Favorito"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn-submit" disabled={!urlInput.trim()}>
                  <Plus size={16} /> Agregar a Señal
                </button>
              </div>
            </form>
          )}

          {activeTab === 'search' && (
            <div className="search-tab">
              <form onSubmit={handleSearchAtlas} className="search-bar-wrap">
                <Search size={18} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Buscar en Atlas (ej: la renga, peron, ciencia)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="search-btn" disabled={isSearching || !searchQuery.trim()}>
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </button>
              </form>

              <div className="search-results-list">
                {searchResults.length === 0 && !isSearching && searchQuery && (
                  <div className="empty-state">No se encontraron videos en Atlas para "{searchQuery}"</div>
                )}
                {searchResults.map((item) => (
                  <div 
                    key={item.id} 
                    className={`suggestion-card ${addedId === item.id ? 'added' : ''}`}
                    onClick={() => handleSelectAtlasItem(item)}
                  >
                    <div 
                      className="sug-thumb" 
                      style={{ backgroundImage: `url(${item.thumbnail || `https://img.youtube.com/vi/${item.provider_content_id}/hqdefault.jpg`})` }}
                    />
                    <div className="sug-info">
                      <h4>{item.title}</h4>
                      <div className="sug-meta">
                        <span className="sug-channel">{item.creator_name || 'Atlas'}</span>
                        <span className="sug-topic">{item.duration_seconds ? `${Math.floor(item.duration_seconds / 60)} min` : 'Video'}</span>
                      </div>
                    </div>
                    <button className="add-icon-btn">
                      {addedId === item.id ? <Check size={16} color="#10b981" /> : <Plus size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .add-signal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }

        .add-signal-modal {
          background: var(--you-surface, #1e293b);
          border: 1px solid var(--you-border, rgba(255, 255, 255, 0.1));
          border-radius: 16px;
          width: 100%;
          max-width: 600px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--you-border, rgba(255, 255, 255, 0.1));
        }

        .modal-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .modal-icon {
          color: var(--you-blue-vivid, #38bdf8);
        }

        .modal-title-wrap h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: var(--you-text, #f8fafc);
        }

        .close-btn {
          background: transparent;
          border: none;
          color: var(--you-text-secondary, #94a3b8);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .modal-tabs {
          display: flex;
          border-bottom: 1px solid var(--you-border, rgba(255, 255, 0.1));
          padding: 0 24px;
          gap: 16px;
          background: rgba(0, 0, 0, 0.2);
        }

        .tab-btn {
          background: transparent;
          border: none;
          padding: 14px 4px;
          color: var(--you-text-secondary, #94a3b8);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 2px solid transparent;
          transition: 0.2s;
        }

        .tab-btn:hover {
          color: #fff;
        }

        .tab-btn.active {
          color: var(--you-blue-vivid, #38bdf8);
          border-bottom-color: var(--you-blue-vivid, #38bdf8);
        }

        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }

        .tab-desc {
          font-size: 13px;
          color: var(--you-text-secondary, #94a3b8);
          margin-top: 0;
          margin-bottom: 18px;
        }

        .cards-grid, .search-results-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .suggestion-card {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--you-border, rgba(255, 255, 255, 0.08));
          padding: 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: 0.2s;
        }

        .suggestion-card:hover {
          background: rgba(56, 189, 248, 0.08);
          border-color: rgba(56, 189, 248, 0.4);
          transform: translateY(-1px);
        }

        .suggestion-card.added {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.1);
        }

        .sug-thumb {
          width: 64px;
          height: 48px;
          border-radius: 6px;
          background-size: cover;
          background-position: center;
          flex-shrink: 0;
        }

        .sug-info {
          flex: 1;
          min-width: 0;
        }

        .sug-info h4 {
          margin: 0 0 4px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-text, #fff);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sug-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          color: var(--you-text-secondary, #94a3b8);
        }

        .add-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--you-border, rgba(255, 255, 255, 0.1));
          color: var(--you-text, #fff);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: pointer;
          transition: 0.2s;
        }

        .suggestion-card:hover .add-icon-btn {
          background: var(--you-blue-vivid, #38bdf8);
          color: #000;
        }

        .input-group {
          margin-bottom: 16px;
        }

        .input-group label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--you-text-secondary, #94a3b8);
          margin-bottom: 6px;
        }

        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: var(--you-text-secondary, #94a3b8);
        }

        .input-wrap input {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--you-border, rgba(255, 255, 255, 0.1));
          padding: 12px 14px 12px 42px;
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: 0.2s;
        }

        .input-wrap input:focus {
          border-color: var(--you-blue-vivid, #38bdf8);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        .btn-cancel {
          background: transparent;
          border: 1px solid var(--you-border, rgba(255, 255, 255, 0.1));
          color: var(--you-text-secondary, #94a3b8);
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }

        .btn-submit {
          background: var(--you-blue-vivid, #38bdf8);
          color: #000;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: 0.2s;
        }

        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .search-bar-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
          position: relative;
        }

        .search-bar-wrap input {
          flex: 1;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--you-border, rgba(255, 255, 255, 0.1));
          padding: 12px 14px 12px 40px;
          border-radius: 10px;
          color: #fff;
          font-size: 13px;
          outline: none;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          color: var(--you-text-secondary, #94a3b8);
        }

        .search-btn {
          background: var(--you-blue-vivid, #38bdf8);
          color: #000;
          border: none;
          padding: 12px 18px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .empty-state {
          padding: 30px;
          text-align: center;
          color: var(--you-text-secondary, #94a3b8);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
