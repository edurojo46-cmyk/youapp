import React, { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useStore } from '../../store/useStore';
import { useSignalStore } from '../../lib/tv/signalStore';
import { useUIStore } from '../../store/useUIStore';
import { getSmartBarCapabilities } from '../../lib/smartbar/capabilities';
import './SmartBar.css';
import { 
  Sparkles, 
  Bookmark, 
  MessageCircleQuestion, 
  Heart, 
  ArrowUpRight, 
  Radio,
  Plus,
  Check,
  ChevronUp,
  Play,
  Pause,
  MoreHorizontal
} from 'lucide-react';

export type ShareTarget =
  | { type: 'video'; contentId: string }
  | { type: 'moment'; contentId: string; startSec: number }
  | { type: 'you4'; contentId: string }
  | { type: 'signal'; signalId: string };

export interface SmartBarProps {
  isPlaying?: boolean;
  onPlayPause?: () => void;
}

export const SmartBar: React.FC<SmartBarProps> = ({ 
  isPlaying: isPlayingProp, 
  onPlayPause: onPlayPauseProp 
}) => {
  const playbackState = usePlayerStore(s => s.playbackState);
  const storeIsPlaying = playbackState === 'playing';
  const isPlaying = isPlayingProp !== undefined ? isPlayingProp : storeIsPlaying;
  const currentBlock = usePlayerStore(s => s.currentBlock);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const playerApi = usePlayerStore(s => s.playerApi);
  const isAnalyzingYOU4 = usePlayerStore(s => s.isAnalyzingYOU4);

  const { saveContent, unsaveContent, isSaved, followCreator, unfollowCreator, isFollowing } = useStore();
  const { activeSignal, insert, currentBlockIndex } = useSignalStore();
  const { showToast, openModal } = useUIStore();

  const [expanded, setExpanded] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // If there's no active block, the Smart Bar hides completely.
  if (!currentBlock) return null;

  const signalBlock = activeSignal?.schedule?.[currentBlockIndex];
  
  // Create a normalized content item to use across the bar
  const content = signalBlock?.contentItem || {
    id: currentBlock.providerContentId,
    provider: currentBlock.provider as any,
    providerId: currentBlock.providerContentId,
    title: currentBlock.title,
    channelTitle: 'Creador',
    channelId: currentBlock.providerContentId,
    isLive: false,
    thumbnailUrl: ''
  };

  const capabilities = getSmartBarCapabilities(content);
  
  const saved = isSaved(content.id);
  const following = isFollowing(content.channelId);

  const handlePlayPause = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentState = usePlayerStore.getState().playbackState;
    const isCurrentlyActive = currentState === 'playing' || currentState === 'buffering';
    console.log(`[SmartBar] ${isCurrentlyActive ? 'PAUSE' : 'PLAY'} CLICK (real-time state: ${currentState})`);
    if (onPlayPauseProp) {
      onPlayPauseProp();
    } else if (playerApi) {
      if (isCurrentlyActive) await playerApi.pause();
      else await playerApi.play();
    }
  };

  const handleYOU4 = () => {
    if (isAnalyzingYOU4) return; // Wait
    const cardsEl = document.querySelector('.you-tv-intelligence');
    if (cardsEl) {
      cardsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('YOU4 no está visible en esta vista.', 'info');
    }
  };

  const handleSave = () => {
    if (saved) {
      unsaveContent(content.id);
      showToast('Eliminado de Mi Lista', 'info');
    } else {
      saveContent({
        id: content.id,
        type: 'video',
        title: content.title,
        provider: content.provider,
        savedAt: new Date().toISOString()
      });
      showToast('Guardado en Mi Lista', 'success');
    }
  };

  const handleFollow = () => {
    if (following) {
      unfollowCreator(content.channelId);
      showToast('Dejaste de seguir a este creador', 'info');
    } else {
      followCreator({
        creatorId: content.channelId,
        creatorName: content.channelTitle || 'Creador',
        provider: content.provider
      });
      showToast('Ahora seguís a este creador', 'success');
    }
  };

  const handleAddToSignal = () => {
    if (activeSignal) {
      // Create a duplicate block for insertion in the current signal
      const newBlock = { ...currentBlock, id: `manual-${Date.now()}` };
      insert(newBlock, currentBlockIndex + 1);
      showToast('Añadido a Mi Señal', 'success');
    } else {
      showToast('No hay una señal activa para añadir.', 'error');
    }
  };

  const handleShareOption = async (option: ShareTarget) => {
    setShowShareMenu(false);
    
    // For V1 fallback, we share the provider canonical url if it's just the video
    let urlToShare = content.canonicalUrl || `https://www.youtube.com/watch?v=${content.providerId}`;
    if (option.type === 'moment') urlToShare += `&t=${Math.floor(currentTime)}s`;
    
    // Attempt native share, fallback to clipboard
    const shareData = {
      title: content.title,
      text: 'Mira esto en YouApp',
      url: urlToShare
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(urlToShare);
        showToast('Enlace copiado al portapapeles', 'success');
      }
    } catch (e) {
      console.error('Share failed', e);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time) || time < 0) return '00:00';
    const totalSecs = Math.floor(time);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const effectiveDuration = duration > 0 ? duration : (currentBlock?.durationSec || 0);
  const progressPercent = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  return (
    <div className={`smart-bar-wrapper ${expanded ? 'expanded' : ''} ${isHovered ? 'hovered' : ''}`}>
      <div 
        className="smart-bar-container"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        
        {/* Left Section: Signal Identity */}
        <div className="sb-section sb-left">
          <div className="sb-avatar">
            <div className="sb-avatar-img" style={{ backgroundImage: content.thumbnailUrl ? `url(${content.thumbnailUrl})` : 'url(https://i.pravatar.cc/100?img=11)' }} />
          </div>
          <div className="sb-identity">
            <div className="sb-title">
              {content.channelTitle || 'Creador'}
            </div>
            <div className="sb-subtitle" style={{ fontSize: '11px', fontWeight: 500 }}>
              Fuente: {content.provider === 'youtube' ? 'YouTube' : content.provider}
            </div>
          </div>
        </div>

        {/* Center Section: Smart Actions */}
        <div className="sb-section sb-center">
          {capabilities.summary && (
            <button className="sb-btn" title="Resumen IA" onClick={() => openModal('summary', currentBlock)}>
              <Sparkles size={20} />
              <span className="sb-btn-label">Resumen</span>
            </button>
          )}
          
          {capabilities.you4 && (
            <button className="sb-btn has-badge" title="YOU4" onClick={handleYOU4}>
              {isAnalyzingYOU4 ? <Sparkles size={20} className="pulse-anim" color="var(--you-blue-vivid)" /> : <Bookmark size={20} />}
              <span className="sb-btn-label">{isAnalyzingYOU4 ? 'Analizando...' : 'YOU4'}</span>
            </button>
          )}
          
          {capabilities.ask && (
            <button className="sb-btn" title="Preguntar" onClick={() => openModal('ask', currentBlock)}>
              <MessageCircleQuestion size={20} />
              <span className="sb-btn-label">Preguntar</span>
            </button>
          )}

          <div className="sb-divider"></div>
          
          {capabilities.save && (
            <button className={`sb-btn ${saved ? 'active' : ''}`} title="Guardar" onClick={handleSave}>
              <Heart size={20} fill={saved ? 'currentColor' : 'none'} color={saved ? '#ef4444' : 'currentColor'} />
            </button>
          )}
          
          {capabilities.share && (
            <button className="sb-btn" title="Compartir" onClick={() => setShowShareMenu(!showShareMenu)}>
              <ArrowUpRight size={20} />
            </button>
          )}

          {capabilities.addToSignal && (
            <button className="sb-btn" title="Mi Señal" onClick={handleAddToSignal}>
              <Radio size={20} />
            </button>
          )}
          
          <button className="sb-btn" onClick={() => { setExpanded(!expanded); setShowShareMenu(false); }} title="Más">
            <MoreHorizontal size={20} />
          </button>

          <button className="sb-btn play-btn" onClick={handlePlayPause}>
             {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
        </div>

        {/* Right Section: Subscribe & Time */}
        <div className="sb-section sb-right">
          {capabilities.followCreator && content.channelId && (
            <button className={`sb-subscribe-btn ${following ? 'following' : ''}`} onClick={handleFollow}>
               {following ? <Check size={16} /> : <Plus size={16} />} 
               {following ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
          
          <div className="sb-time-display">
            <div className="sb-time-text">
              <span className="sb-time-current">{formatTime(currentTime)}</span>
              <span className="sb-time-total">de {formatTime(effectiveDuration)}</span>
            </div>
            <div className="sb-progress-ring-container" title={`${Math.round(progressPercent)}% transcurrido`}>
               <svg className="sb-progress-ring" viewBox="0 0 36 36">
                  <path className="sb-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="sb-ring-fill" strokeDasharray={`${progressPercent.toFixed(1)}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
            </div>
          </div>
        </div>

      </div>

      {/* Share Menu Popup */}
      {showShareMenu && (
        <div className="sb-share-menu" style={{ position: 'absolute', bottom: '84px', background: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '240px', zIndex: 110 }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Compartir (YouApp)</div>
          
          <div onClick={() => handleShareOption({ type: 'video', contentId: content.id })} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', padding: '4px 0' }}>
            ○ Video completo
          </div>
          <div onClick={() => handleShareOption({ type: 'moment', contentId: content.id, startSec: currentTime })} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', padding: '4px 0' }}>
            ● Este momento ({formatTime(currentTime)})
          </div>
          <div onClick={() => showToast('Páginas públicas de YOU4 próximamente', 'info')} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', padding: '4px 0', color: '#666' }}>
            ○ YOU4 (Próximamente)
          </div>
          <div onClick={() => showToast('Páginas públicas de Señal próximamente', 'info')} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', padding: '4px 0', color: '#666' }}>
            ○ Mi Señal (Próximamente)
          </div>
          
          <div style={{ margin: '8px 0', height: '1px', background: '#eee' }}></div>
          <button onClick={() => window.open(content.canonicalUrl || `https://www.youtube.com/watch?v=${content.providerId}`, '_blank')} style={{ background: 'transparent', border: 'none', color: 'var(--you-blue-vivid)', fontWeight: 500, cursor: 'pointer', textAlign: 'left', padding: '0', fontSize: '13px' }}>
            Abrir original en {content.provider === 'youtube' ? 'YouTube' : content.provider}
          </button>
        </div>
      )}

      {/* Expanded Menu Drawer */}
      <div className={`sb-expanded-menu ${expanded ? 'visible' : ''}`}>
         <div className="sb-menu-col">
           <h4>EXPERIENCIA</h4>
           <ul>
             <li onClick={() => showToast('Ajuste de velocidad próximamente')}>Velocidad</li>
             <li onClick={() => showToast('Subtítulos próximamente')}>Subtítulos</li>
             <li onClick={() => showToast('Información avanzada próximamente')}>Información</li>
           </ul>
         </div>
      </div>
    </div>
  );
};
