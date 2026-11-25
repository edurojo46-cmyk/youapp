import React, { useState } from 'react';
import { X, Search, Plus, Sparkles, Video, Link as LinkIcon, Check, Film } from 'lucide-react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { supabase } from '../../lib/supabase';
import { extractYouTubeId } from '../../lib/search/publishers/publisherVideoExtractor';
import { extractDailymotionVideoId } from '../player/DailymotionOfficialPlayer';
import { parseUniversalUrl } from '../../lib/universalChannels';
import { CURATED_SIGNALS_PILOT } from '../../lib/tv/curatedSignalsCatalog';

interface AddSignalContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (block: ScheduleBlock) => void;
  existingCount: number;
}

export async function resolveUrlToScheduleBlock(
  rawInput: string,
  existingCount: number,
  customTitle?: string
): Promise<{ block: ScheduleBlock; kind: 'video' | 'channel' }> {
  const cleanUrl = rawInput.trim();
  const ytId = extractYouTubeId(cleanUrl);

  // 1. Video directo de YouTube (watch, youtu.be, shorts, embed o ID de 11 chars)
  if (ytId) {
    let title = customTitle?.trim() || '';
    let channelName = 'Canal de YouTube';
    try {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), 2500);
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${ytId}`
        )}&format=json`,
        { signal: controller.signal }
      );
      window.clearTimeout(t);
      if (res.ok) {
        const meta = await res.json();
        if (!title && meta?.title) title = String(meta.title);
        if (meta?.author_name) channelName = String(meta.author_name);
      }
    } catch {
      // Fallback silencioso si falla red/oEmbed
    }

    const block: ScheduleBlock = {
      id: `block-user-vid-${Date.now()}`,
      position: existingCount,
      startOffsetSec: existingCount * 600,
      durationSec: 600,
      topic: 'Video agregado por URL',
      role: 'deep_dive',
      contentItem: {
        id: ytId,
        providerId: ytId,
        type: 'video',
        provider: 'youtube',
        title: title || `Video de YouTube (${ytId})`,
        thumbnailUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        videoUrl: `https://www.youtube.com/watch?v=${ytId}`,
        channelName,
        channelTitle: channelName,
        channelId: `yt-${ytId}`,
        isLive: false,
        isVerified: true
      } as any
    };
    return { block, kind: 'video' };
  }

  // 1b. Video oficial de Dailymotion (dailymotion.com/video/<id>, dai.ly/<id>, geo.dailymotion.com)
  const dmId = extractDailymotionVideoId(cleanUrl);
  if (dmId) {
    const watchUrl = `https://www.dailymotion.com/video/${dmId}`;
    let title = customTitle?.trim() || '';
    let channelName = 'Dailymotion';
    let thumbnail = `https://www.dailymotion.com/thumbnail/video/${dmId}`;
    try {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), 2500);
      const res = await fetch(
        `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(watchUrl)}`,
        { signal: controller.signal }
      );
      window.clearTimeout(t);
      if (res.ok) {
        const meta = await res.json();
        if (!title && meta?.title) title = String(meta.title);
        if (meta?.author_name) channelName = String(meta.author_name);
        if (meta?.thumbnail_url) thumbnail = String(meta.thumbnail_url);
      }
    } catch {
      // Fallback silencioso
    }

    const block: ScheduleBlock = {
      id: `block-user-dm-${Date.now()}`,
      position: existingCount,
      startOffsetSec: existingCount * 600,
      durationSec: 600,
      topic: 'Video de Dailymotion',
      role: 'deep_dive',
      contentItem: {
        id: dmId,
        providerId: dmId,
        type: 'video',
        provider: 'dailymotion',
        title: title || `Video de Dailymotion (${dmId})`,
        thumbnailUrl: thumbnail,
        thumbnail,
        videoUrl: watchUrl,
        originUrl: watchUrl,
        channelName,
        channelTitle: channelName,
        channelId: `dm-${dmId}`,
        isLive: false,
        isVerified: true
      } as any
    };
    return { block, kind: 'video' };
  }

  // 2. Coincidencia con canales reales curados en el piloto (@handle o URL de canal)
  const lower = cleanUrl.toLowerCase();
  for (const sig of CURATED_SIGNALS_PILOT) {
    const ch = sig.channels.find(
      (c) =>
        lower.includes(c.originUrl.toLowerCase().replace(/^https?:\/\/(www\.)?/, '')) ||
        lower.includes(c.channelName.toLowerCase())
    );
    if (ch) {
      const block: ScheduleBlock = {
        id: `block-user-ch-${Date.now()}`,
        position: existingCount,
        startOffsetSec: existingCount * 600,
        durationSec: ch.durationSec,
        topic: `Canal agregado · ${sig.tags[0]}`,
        role: 'deep_dive',
        contentItem: {
          id: ch.videoId,
          providerId: ch.videoId,
          type: 'video',
          provider: 'youtube',
          title: customTitle?.trim() || ch.videoTitle,
          thumbnailUrl: `https://i.ytimg.com/vi/${ch.videoId}/hqdefault.jpg`,
          thumbnail: `https://i.ytimg.com/vi/${ch.videoId}/hqdefault.jpg`,
          videoUrl: `https://www.youtube.com/watch?v=${ch.videoId}`,
          channelName: ch.channelName,
          channelTitle: ch.channelName,
          channelId: ch.id,
          originUrl: ch.originUrl,
          isLive: false,
          isVerified: true
        } as any
      };
      return { block, kind: 'channel' };
    }
  }

  // 3. Parser universal multi-plataforma (Canales @handle, Twitch, HLS .m3u8, MP4, TikTok, Instagram)
  const parsed = parseUniversalUrl(cleanUrl);
  if (parsed) {
    const isChannel =
      Boolean(parsed.channelId) ||
      parsed.provider === 'twitch' ||
      parsed.provider === 'hls' ||
      /@|youtube\.com\/(channel|c|user)\//i.test(cleanUrl);
    const providerId = parsed.videoId || parsed.channelId || parsed.id;
    const block: ScheduleBlock = {
      id: `block-user-uni-${Date.now()}`,
      position: existingCount,
      startOffsetSec: existingCount * 600,
      durationSec: parsed.durationSeconds || 600,
      topic: isChannel ? 'Canal agregado por URL' : 'Contenido agregado por URL',
      role: 'deep_dive',
      contentItem: {
        id: providerId,
        providerId,
        type: 'video',
        provider: parsed.provider,
        title: customTitle?.trim() || parsed.currentVideoTitle || parsed.name,
        thumbnailUrl: parsed.thumbnail || 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
        thumbnail: parsed.thumbnail || 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
        videoUrl: parsed.videoUrl,
        channelName: parsed.name,
        channelTitle: parsed.name,
        channelId: parsed.channelId || parsed.id,
        channelAvatarUrl: parsed.avatarUrl && !parsed.avatarUrl.includes('unsplash.com') ? parsed.avatarUrl : undefined,
        channelCoverUrl: parsed.thumbnail && !parsed.thumbnail.includes('unsplash.com') ? parsed.thumbnail : undefined,
        originUrl: cleanUrl.startsWith('http') ? cleanUrl : `https://www.youtube.com/${cleanUrl.startsWith('@') ? cleanUrl : `@${cleanUrl}`}`,
        isLive: Boolean(parsed.isLive),
        isVerified: true
      } as any
    };
    return { block, kind: isChannel ? 'channel' : 'video' };
  }

  // 4. Fallback seguro para cualquier URL directa de video o canal externo
  const isDirectVideo = /\.(mp4|webm|m3u8)(\?|$)/i.test(cleanUrl);
  const hostLabel = (() => {
    try {
      return new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`).hostname.replace(/^www\./, '');
    } catch {
      return 'Canal externo';
    }
  })();

  const block: ScheduleBlock = {
    id: `block-user-ext-${Date.now()}`,
    position: existingCount,
    startOffsetSec: existingCount * 600,
    durationSec: 600,
    topic: isDirectVideo ? 'Video externo' : 'Canal externo por URL',
    role: 'deep_dive',
    contentItem: {
      id: `ext-${Date.now()}`,
      providerId: cleanUrl,
      type: 'video',
      provider: isDirectVideo ? (cleanUrl.includes('.m3u8') ? 'hls' : 'direct') : 'youtube',
      title: customTitle?.trim() || `Señal desde ${hostLabel}`,
      thumbnailUrl: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
      thumbnail: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
      videoUrl: cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`,
      channelName: hostLabel,
      channelTitle: hostLabel,
      channelId: `ext-${hostLabel}`,
      originUrl: cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`,
      isLive: false,
      isVerified: true
    } as any
  };

  return { block, kind: isDirectVideo ? 'video' : 'channel' };
}

const QUICK_SUGGESTIONS = [
  {
    id: 'sug-1',
    title: 'El Imperio Romano en 10 minutos',
    channelName: 'Academia Play',
    providerId: 'UF_yHrFP1Ls',
    durationSec: 615,
    thumbnailUrl: 'https://i.ytimg.com/vi/UF_yHrFP1Ls/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=UF_yHrFP1Ls',
    topic: 'Historia'
  },
  {
    id: 'sug-2',
    title: '¿Qué es la Rerum Novarum? · Historia social',
    channelName: 'Justicia Social TV',
    providerId: '0cjWa3Eizqw',
    durationSec: 600,
    thumbnailUrl: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=0cjWa3Eizqw',
    topic: 'Documental'
  },
  {
    id: 'sug-3',
    title: '¿Qué pasa si nos caemos en un agujero negro?',
    channelName: 'Kurzgesagt en Español',
    providerId: 'TFhRXnE2xck',
    durationSec: 690,
    thumbnailUrl: 'https://i.ytimg.com/vi/TFhRXnE2xck/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=TFhRXnE2xck',
    topic: 'Ciencia'
  },
  {
    id: 'sug-4',
    title: 'Este fue el primer partido internacional de la historia',
    channelName: 'La Media Inglesa',
    providerId: 'ooj-O2otF7I',
    durationSec: 720,
    thumbnailUrl: 'https://i.ytimg.com/vi/ooj-O2otF7I/hqdefault.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=ooj-O2otF7I',
    topic: 'Fútbol'
  }
];

export function AddSignalContentModal({
  isOpen,
  onClose,
  onAddBlock,
  existingCount
}: AddSignalContentModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'url' | 'suggestions'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl || isResolvingUrl) return;

    setIsResolvingUrl(true);
    try {
      const { block } = await resolveUrlToScheduleBlock(cleanUrl, existingCount, titleInput);
      onAddBlock(block);
      setUrlInput('');
      setTitleInput('');
      onClose();
    } finally {
      setIsResolvingUrl(false);
    }
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
            className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
            onClick={() => setActiveTab('url')}
          >
            <LinkIcon size={16} /> Pegar URL (Video o Canal)
          </button>
          <button 
            className={`tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
            onClick={() => setActiveTab('suggestions')}
          >
            <Sparkles size={16} /> Sugerencias Rápidas
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
              <p className="tab-desc">
                Pegá cualquier URL de <strong>video</strong> o <strong>canal</strong> (YouTube, <code>@canal</code>, Twitch, HLS/MP4, TikTok o Instagram) para sumarlo a tu señal:
              </p>
              
              <div className="input-group">
                <label>URL de Video o Canal</label>
                <div className="input-wrap">
                  <Video size={18} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="https://youtube.com/watch?v=... o https://youtube.com/@canal"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Título Personalizado (Opcional — se detecta solo)</label>
                <div className="input-wrap">
                  <Film size={18} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="Ej: Mi Documental o Canal Favorito"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn-submit" disabled={!urlInput.trim() || isResolvingUrl}>
                  <Plus size={16} /> {isResolvingUrl ? 'Detectando…' : 'Agregar a Mi Señal'}
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
