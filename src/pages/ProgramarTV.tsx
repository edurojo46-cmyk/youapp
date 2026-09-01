import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignalStore } from '../lib/tv/signalStore';
import { generateSurpriseBlock } from '../lib/tv/surpriseGenerator';
import { YouAppPlayer, type YouAppPlayerHandle } from '../components/player/YouAppPlayer';
import { YOU4Cards } from '../components/player/YOU4Cards';
import { MosaicPlayerGrid } from '../components/player/MosaicPlayerGrid';
import { YouRing } from '../components/player/YouRing';
import { usePlayerStore } from '../store/usePlayerStore';
import type { VideoMoment } from '../lib/moments/momentTypes';
import { getMomentsForVideo, requestSemanticAnalysis } from '../lib/moments/momentEngine';
import { logAudienceEvent } from '../lib/player/telemetry/playerEvents';
import { Sparkles } from 'lucide-react';

import { ProgramarTVLayout } from '../components/tv/ProgramarTVLayout';
import { SignalTimeline } from '../components/tv/SignalTimeline';
import { ChosenForYou } from '../components/tv/ChosenForYou';
import { DirectorCard } from '../components/tv/DirectorCard';
import { PlayerActionBar } from '../components/tv/PlayerActionBar';
import { SignalStatusBar } from '../components/tv/SignalStatusBar';

export default function ProgramarTV() {
  const navigate = useNavigate();
  const { activeSignal, remove, insert, currentBlockIndex, setSignal, next, previous, reorder } = useSignalStore();
  const playbackState = usePlayerStore(state => state.playbackState);
  const isPlaying = playbackState === 'playing';
  const isAnalyzingYOU4 = usePlayerStore(state => state.isAnalyzingYOU4);
  const setIsAnalyzingYOU4 = usePlayerStore(state => state.setIsAnalyzingYOU4);

  const [isGeneratingSurprise, setIsGeneratingSurprise] = useState(false);

  // YOU4 State
  type YOU4ViewMode = 'single' | 'mosaic';
  const [viewMode, setViewMode] = useState<YOU4ViewMode>('single');
  const playerRef = useRef<YouAppPlayerHandle>(null);
  const [moments, setMoments] = useState<VideoMoment[]>([]);
  const [isFallbackMoments, setIsFallbackMoments] = useState(false);
  const [activeMomentId, setActiveMomentId] = useState<string | undefined>();
  
  const currentBlock = activeSignal?.schedule[currentBlockIndex] || null;
  const currentBlockIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentBlockIdRef.current = currentBlock?.id || null;
  }, [currentBlock?.id]);

  // Auto-load 2 real default videos if signal is empty
  useEffect(() => {
    if (!activeSignal || !activeSignal.schedule || activeSignal.schedule.length === 0) {
      const DEFAULT_2_VIDEOS_SIGNAL = {
        id: 'user-signal-1',
        name: 'Mi Señal Personal',
        prompt: 'Programación de Mi Señal',
        visibility: 'private' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        schedule: [
          {
            id: 'block-1',
            position: 0,
            startOffsetSec: 0,
            durationSec: 596,
            topic: 'Cortometraje',
            role: 'opening' as const,
            contentItem: {
              id: 'aqz-KE-bpKQ',
              providerId: 'aqz-KE-bpKQ',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'Big Buck Bunny (Cortometraje)',
              thumbnailUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
              channelName: 'Blender Foundation',
              channelId: 'blender',
              isLive: false,
              isVerified: true
            }
          },
          {
            id: 'block-2',
            position: 1,
            startOffsetSec: 596,
            durationSec: 653,
            topic: 'Animación',
            role: 'deep_dive' as const,
            contentItem: {
              id: 'TLkA0RELQ1g',
              providerId: 'TLkA0RELQ1g',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'Elephants Dream',
              thumbnailUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=TLkA0RELQ1g',
              channelName: 'Blender Foundation',
              channelId: 'blender',
              isLive: false,
              isVerified: true
            }
          }
        ]
      };
      setSignal(DEFAULT_2_VIDEOS_SIGNAL as any);
    }
  }, [activeSignal, setSignal]);

  const fetchMoments = async (actualDuration: number) => {
    if (!currentBlock || actualDuration <= 0) return;
    try {
      const res = await getMomentsForVideo({
        blockId: currentBlock.id,
        provider: currentBlock.contentItem.provider as any,
        providerContentId: currentBlock.contentItem.providerId || currentBlock.contentItem.id,
        durationSec: actualDuration,
        title: currentBlock.contentItem.title
      });
      setMoments(res.moments || []);
      setIsFallbackMoments(res.isFallback);
    } catch (error) {
      console.error("Failed to fetch moments", error);
      setMoments([]);
      setIsFallbackMoments(true);
    }
    setActiveMomentId(undefined); // reset
  };

  useEffect(() => {
    setViewMode('single');
    setIsAnalyzingYOU4(false);
    if (currentBlock && currentBlock.durationSec > 0) {
      fetchMoments(currentBlock.durationSec);
    } else {
      setMoments([]);
    }
  }, [currentBlock?.id]);

  const handleMomentClick = (moment: VideoMoment, index: number) => {
    if (!currentBlock) return;
    
    setViewMode('single');
    setActiveMomentId(moment.id);
    
    setTimeout(() => {
      if (!playerRef.current) return;
      const actualDuration = playerRef.current.getDuration();
      let safeSeekSec = moment.startSec;
      if (actualDuration > 0) {
        safeSeekSec = Math.min(moment.startSec, actualDuration - 1);
      }
      playerRef.current.seek(safeSeekSec);
      playerRef.current.unmute();
      playerRef.current.play();
    }, 100);
    
    logAudienceEvent({
      type: 'you4_moment_selected',
      blockId: currentBlock.id,
      payload: {
        contentKey: moment.contentKey,
        momentIndex: index,
        startSec: moment.startSec,
        source: moment.source
      }
    });
  };

  const handleOpenMosaic = async () => {
    setViewMode('mosaic');
    
    if (isFallbackMoments && !isAnalyzingYOU4 && currentBlock) {
      const requestedBlockId = currentBlock.id;
      setIsAnalyzingYOU4(true);
      
      try {
        const analyzed = await requestSemanticAnalysis({
          blockId: currentBlock.id,
          provider: currentBlock.contentItem.provider as any,
          providerContentId: currentBlock.contentItem.providerId || currentBlock.contentItem.id,
          durationSec: currentBlock.durationSec,
          title: currentBlock.contentItem.title
        });
        
        // Race condition protection
        if (currentBlockIdRef.current !== requestedBlockId) {
          return;
        }

        if (analyzed && analyzed.length === 4) {
          setMoments(analyzed);
          setIsFallbackMoments(false);
        } else {
          // AI analysis failed or timed out
          alert("Aviso: El análisis semántico por Inteligencia Artificial falló o demoró demasiado. Se utilizarán tiempos estándar de prueba (fallback) para el mosaico.");
        }
      } catch (err) {
        console.error('Semantic analysis failed', err);
        alert("Aviso: Error de conexión con el motor de IA. Se utilizarán tiempos estándar de prueba (fallback).");
      } finally {
        if (currentBlockIdRef.current === requestedBlockId) {
          setIsAnalyzingYOU4(false);
        }
      }
    }
  };

  const handleSurprise = async () => {
    if (isGeneratingSurprise || !activeSignal || !currentBlock) return;
    setIsGeneratingSurprise(true);
    
    try {
      const surprise = await generateSurpriseBlock(activeSignal, currentBlockIndex);
      if (surprise) {
        insert(surprise, currentBlockIndex);
      } else {
        alert("No encontramos una buena sorpresa en este momento.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingSurprise(false);
    }
  };

  const handlePlayPause = async () => {
    const currentState = usePlayerStore.getState().playbackState;
    console.log('[ProgramarTV] handlePlayPause clicked, real-time state:', currentState);
    if (currentState === 'playing' || currentState === 'buffering') {
      console.log('[ProgramarTV] -> invoking pause()');
      await playerRef.current?.pause();
    } else {
      console.log('[ProgramarTV] -> invoking play()');
      await playerRef.current?.play();
    }
  };

  const handleNext = () => next();
  const handlePrevious = () => previous();
  const handleDirector = () => {
    alert("Modo Director activo. Aquí podríamos abrir un modal con controles avanzados.");
  };

  if (!activeSignal) {
    return <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--you-bg)', minHeight: '100vh' }}>Cargando señal...</div>;
  }

  // Calculate signal progress for YouRing
  const totalSeconds = activeSignal.schedule.reduce((acc, b) => acc + b.durationSec, 0);
  const elapsedSeconds = activeSignal.schedule.slice(0, currentBlockIndex).reduce((acc, b) => acc + b.durationSec, 0);
  const signalProgress = totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;

  const stage = (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 'var(--you-radius-lg)', overflow: 'hidden', boxShadow: 'var(--you-shadow)', background: '#000' }}>
      {currentBlock ? (
        viewMode === 'mosaic' && moments.length >= 4 ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <MosaicPlayerGrid 
              moments={moments}
              currentBlock={currentBlock}
              onSelect={handleMomentClick}
              thumbnailFallbackUrl={currentBlock.contentItem.thumbnailUrl}
            />
            {isAnalyzingYOU4 && (
              <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9000, background: 'rgba(14, 12, 28, 0.9)', padding: '10px 20px', borderRadius: '24px', color: '#00f0ff', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 20px rgba(0, 240, 255, 0.5)', border: '1px solid rgba(0, 240, 255, 0.3)', backdropFilter: 'blur(8px)' }}>
                <Sparkles size={16} className="pulse-anim" /> ✦ Analizando video...
              </div>
            )}
            {/* YouRing over Mosaic */}
            <YouRing 
              playing={isPlaying}
              signalProgress={signalProgress}
              onPlayPause={handlePlayPause}
              onNext={handleNext}
              onPrevious={handlePrevious}
              onSurprise={handleSurprise}
              onDirector={handleDirector}
              isMosaic={true}
              onExitMosaic={() => setViewMode('single')}
            />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0 }}>
            <YouAppPlayer
              ref={playerRef}
              item={{
                blockId: currentBlock.id,
                provider: currentBlock.contentItem.provider as any,
                providerContentId: currentBlock.contentItem.providerId || currentBlock.contentItem.id,
                playbackUrl: currentBlock.contentItem.videoUrl,
                title: currentBlock.contentItem.title,
                durationSec: currentBlock.durationSec
              }}
              onEnded={() => next()}
              onError={(err) => console.error(err)}
              onPlaybackStateChange={(state) => {
                console.log('[ProgramarTV] PLAYER STATE ->', state);
              }}
              onReady={(duration) => {
                // If duration is unknown, or differs by more than 10 seconds from what we had,
                // re-calculate moments using the real duration to ensure accuracy.
                if (
                  !currentBlock?.durationSec || 
                  currentBlock.durationSec <= 0 || 
                  Math.abs(duration - currentBlock.durationSec) > 10
                ) {
                  fetchMoments(duration);
                }
              }}
            />
            {/* Player Overlays */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to right, rgba(0,0,0,0.4) 0%, transparent 40%), linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.6) 100%)' }}>
              <div style={{ position: 'absolute', top: 24, left: 32 }}>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600, letterSpacing: '1px', marginBottom: '8px' }}>AHORA</div>
                <h2 style={{ color: 'white', fontSize: '32px', fontWeight: 800, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{currentBlock.topic}</h2>
                <div style={{ color: 'white', fontSize: '14px', fontWeight: 500, marginTop: '8px', opacity: 0.9 }}>
                  {Math.round(currentBlock.durationSec / 60)} MIN • {currentBlock.contentItem.title}
                </div>
              </div>
            </div>

            {/* YouRing Overlay */}
            <YouRing 
              playing={isPlaying}
              signalProgress={signalProgress}
              onPlayPause={handlePlayPause}
              onNext={handleNext}
              onPrevious={handlePrevious}
              onSurprise={handleSurprise}
              onDirector={handleDirector}
              isMosaic={false}
            />
          </div>
        )
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--you-text-secondary)' }}>
          Cargando señal...
        </div>
      )}
    </div>
  );

  const intelligence = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <YOU4Cards 
        moments={moments} 
        onMomentClick={handleMomentClick}
        onOpenMosaic={handleOpenMosaic}
        activeMomentId={activeMomentId}
        thumbnailFallbackUrl={currentBlock?.contentItem.thumbnailUrl}
      />
      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          <ChosenForYou currentBlock={currentBlock} />
        </div>
        <div style={{ flex: 1 }}>
          <DirectorCard 
            onRemove={() => {
              if (currentBlock) remove(currentBlock.id);
            }}
            onSurprise={handleSurprise}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ProgramarTVLayout
        stage={stage}
        intelligence={intelligence}
        timeline={<SignalTimeline schedule={activeSignal?.schedule || []} currentIndex={currentBlockIndex} onReorder={reorder} />}
        actions={<PlayerActionBar />}
        status={<SignalStatusBar />}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        signalName={activeSignal?.name || 'Mi Señal Personal'}
      />
    <style>{`
      @keyframes pulse {
        0% { opacity: 0.5; }
        50% { opacity: 1; text-shadow: 0 0 10px #00f0ff; }
        100% { opacity: 0.5; }
      }
      .pulse-anim {
        animation: pulse 1.5s infinite ease-in-out;
      }
    `}</style>
    </>
  );
}
