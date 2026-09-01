import React, { useEffect, useState, useRef } from 'react';
import type { VideoMoment } from '../../lib/moments/momentTypes';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import ReactPlayer from 'react-player';
import { logAudienceEvent } from '../../lib/player/telemetry/playerEvents';
import { Volume2, VolumeX, Maximize2 } from 'lucide-react';

interface MosaicPlayerGridProps {
  moments: VideoMoment[];
  currentBlock: ScheduleBlock;
  onSelect: (moment: VideoMoment, index: number) => void;
  thumbnailFallbackUrl?: string;
}

export function MosaicPlayerGrid({ moments, currentBlock, onSelect, thumbnailFallbackUrl }: MosaicPlayerGridProps) {
  const [activeAudioIdx, setActiveAudioIdx] = useState<number>(0);
  const [loadedCount, setLoadedCount] = useState<number>(1);
  const [elapsed, setElapsed] = useState<number>(0);
  const playerRefs = useRef<(YouAppPlayerHandle | null)[]>([]);

  useEffect(() => {
    logAudienceEvent({ type: 'you4_mosaic_opened' as any, blockId: currentBlock.id });
    
    // Stagger loading to prevent rate limits
    setLoadedCount(1);
    let count = 1;
    const interval = setInterval(() => {
      count++;
      setLoadedCount(count);
      if (count >= 4) clearInterval(interval);
    }, 400);

    // Simulated live time counter
    setElapsed(0);
    const timeInterval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
      logAudienceEvent({ type: 'you4_mosaic_closed' as any, blockId: currentBlock.id });
    };
  }, [currentBlock.id]);

  const handleTileClick = (moment: VideoMoment, index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveAudioIdx(index);
  };

  const handleMaximize = (moment: VideoMoment, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    logAudienceEvent({ type: 'you4_tile_selected' as any, blockId: currentBlock.id, payload: { momentIndex: index } });
    onSelect(moment, index);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isDirectVideo = (url: string) => {
    if (!url) return false;
    const clean = url.toLowerCase().split('?')[0];
    return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.includes('.mp4') || clean.includes('storage.googleapis.com');
  };

  const videoUrl = currentBlock.contentItem.videoUrl || '';
  const rawId = currentBlock.contentItem.providerId || currentBlock.contentItem.id || '';
  const isDirect = isDirectVideo(videoUrl) || currentBlock.contentItem.provider === 'local';
  
  // Build foolproof YouTube embed URL
  const buildYouTubeSrc = (videoId: string, start: number, isMuted: boolean) => {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&start=${start}&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=0`;
  };

  return (
    <div className="mosaic-grid">
      {moments.slice(0, 4).map((m, idx) => {
        const isAudioActive = activeAudioIdx === idx;
        const canLoad = idx < loadedCount;
        const startSec = Math.floor(Number(m.startSec)) || 0;

        return (
          <div 
            key={m.id} 
            className={`mosaic-tile fade-in ${isAudioActive ? 'audio-active' : ''}`}
            onClick={(e) => handleTileClick(m, idx, e)}
          >
            <div className="mosaic-player-wrapper" style={{ background: '#000' }}>
              {canLoad && (
                isDirect ? (
                  <video
                    src={`${videoUrl}#t=${startSec}`}
                    autoPlay
                    loop
                    muted={!isAudioActive}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <iframe
                    src={buildYouTubeSrc(rawId, startSec, !isAudioActive)}
                    title={m.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                  />
                )
              )}
              
              {/* Overlay to capture clicks and show UI like QuadMultiview */}
              <div className="mosaic-click-catcher">
                <div className="mosaic-overlay-header">
                  <div className="mosaic-badge-pill">
                    <span>MOMENTO {idx + 1}</span>
                  </div>

                  <div className="mosaic-cell-actions">
                    <button
                      className={`mosaic-icon-btn ${isAudioActive ? 'active' : ''}`}
                      onClick={(e) => handleTileClick(m, idx, e)}
                      title={isAudioActive ? 'Silenciar audio' : 'Activar audio'}
                    >
                      {isAudioActive ? <Volume2 size={14} color="#00f0ff" /> : <VolumeX size={14} />}
                      <span className="audio-label">{isAudioActive ? 'Audio ON' : 'Audio'}</span>
                    </button>

                    <button
                      className="mosaic-icon-btn maximize-btn"
                      onClick={(e) => handleMaximize(m, idx, e)}
                      title="Ver este momento a pantalla completa"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mosaic-overlay-info">
                  <h4>{m.title}</h4>
                  <span>{formatTime(startSec + elapsed)}</span>
                </div>
              </div>
              
              {/* Active Audio Badge */}
              {isAudioActive && (
                <div className="active-audio-badge">
                  <Volume2 size={14} className="active-audio-icon" />
                  <span>Audio Principal</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <style>{`
        .mosaic-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 12px;
          width: 100%;
          height: 100%;
          background: black;
          padding: 12px;
          box-sizing: border-box;
          border-radius: var(--you-radius-lg);
        }
        .mosaic-tile {
          position: relative;
          background: #000;
          border-radius: var(--you-radius-md);
          overflow: hidden;
          cursor: pointer;
          border: 2px solid rgba(255, 255, 255, 0.08);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .mosaic-tile:hover {
          border-color: rgba(0, 240, 255, 0.5);
        }
        .mosaic-tile.audio-active {
          border-color: #00f0ff;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.4), inset 0 0 15px rgba(0, 240, 255, 0.2);
        }
        .mosaic-player-wrapper, .mosaic-preview-img {
          width: 100%;
          height: 100%;
          position: relative;
          background-size: cover;
          background-position: center;
        }
        .mosaic-click-catcher {
          position: absolute;
          inset: 0;
          z-index: 10;
          background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.85) 100%);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 10px;
        }
        
        .mosaic-overlay-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .mosaic-badge-pill {
          display: inline-flex;
          align-items: center;
          background: rgba(14, 12, 28, 0.85);
          border: 1px solid rgba(0, 240, 255, 0.3);
          color: #ffffff;
          font-size: 0.76rem;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 14px;
          backdrop-filter: blur(8px);
        }

        .mosaic-cell-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .mosaic-icon-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(14, 12, 28, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          padding: 4px 8px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 700;
          backdrop-filter: blur(8px);
          transition: all 0.2s;
        }
        .mosaic-icon-btn:hover {
          background: rgba(0, 240, 255, 0.2);
          border-color: #00f0ff;
        }
        .mosaic-icon-btn.active {
          background: rgba(0, 240, 255, 0.3);
          border-color: #00f0ff;
          color: #00f0ff;
          box-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
        }

        .active-audio-badge {
          position: absolute;
          bottom: 10px;
          right: 10px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #00f0ff;
          color: #05030a;
          font-size: 0.72rem;
          font-weight: 900;
          padding: 4px 10px;
          border-radius: 12px;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.6);
          pointer-events: none;
          z-index: 20;
        }
        .mosaic-overlay-info h4 {
          margin: 0 0 4px;
          color: white;
          font-size: 16px;
          font-weight: 700;
          text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }
        .mosaic-overlay-info span {
          color: rgba(255,255,255,0.8);
          font-size: 13px;
          font-weight: 600;
        }
        @media (max-width: 768px) {
          .mosaic-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
          .mosaic-tile {
            aspect-ratio: 16/9;
          }
        }
      `}</style>
    </div>
  );
}
