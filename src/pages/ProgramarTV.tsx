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
import { AddSignalContentModal } from '../components/tv/AddSignalContentModal';
import { EpistemicBadge } from '../components/epistemic/EpistemicBadge';
import { EpistemicContextModal } from '../components/epistemic/EpistemicContextModal';
import { EpistemicMapModal } from '../components/epistemic/EpistemicMapModal';
import { EpistemicRigorModal } from '../components/epistemic/EpistemicRigorModal';
import { evaluateEpistemicNature } from '../lib/field/epistemicGuard';
import type { EpistemicRigorProfile, EpistemicAssessment } from '../lib/field/epistemicTypes';
import type { ScheduleBlock } from '../lib/tv/signalTypes';

export default function ProgramarTV() {
  const navigate = useNavigate();
  const { activeSignal, remove, insert, currentBlockIndex, setSignal, next, previous, reorder } = useSignalStore();
  const playbackState = usePlayerStore(state => state.playbackState);
  const isPlaying = playbackState === 'playing';
  const isAnalyzingYOU4 = usePlayerStore(state => state.isAnalyzingYOU4);
  const setIsAnalyzingYOU4 = usePlayerStore(state => state.setIsAnalyzingYOU4);

  const [isGeneratingSurprise, setIsGeneratingSurprise] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Epistemic Guard Modals State
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isRigorModalOpen, setIsRigorModalOpen] = useState(false);
  const [rigorProfile, setRigorProfile] = useState<EpistemicRigorProfile>('balanced');
  const [targetedBlockForContext, setTargetedBlockForContext] = useState<ScheduleBlock | null>(null);

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

  // Auto-load default signal if empty
  useEffect(() => {
    if (!activeSignal || !activeSignal.schedule || activeSignal.schedule.length === 0) {
      const DEFAULT_2_VIDEOS_SIGNAL = {
        id: 'user-signal-1',
        name: 'Mi Señal · Nikola Tesla',
        prompt: 'Nikola Tesla',
        visibility: 'private' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        schedule: [
          {
            id: 'block-1',
            position: 0,
            startOffsetSec: 0,
            durationSec: 720,
            topic: 'Nikola Tesla: Biografía y Patentes',
            role: 'opening' as const,
            contentItem: {
              id: 'aqz-KE-bpKQ',
              providerId: 'aqz-KE-bpKQ',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'Nikola Tesla: Biografía y Patentes Históricas',
              description: 'Archivo documental sobre la biografía oficial y patentes de Nikola Tesla.',
              thumbnailUrl: 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
              channelName: 'Historia de la Ciencia',
              channelId: 'historia-ciencia',
              isLive: false,
              isVerified: true
            }
          },
          {
            id: 'block-2',
            position: 1,
            startOffsetSec: 720,
            durationSec: 660,
            topic: 'Motor de Inducción Polifásico',
            role: 'deep_dive' as const,
            contentItem: {
              id: 'TLkA0RELQ1g',
              providerId: 'TLkA0RELQ1g',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'Motor de Inducción Polifásico y Corriente Alterna',
              description: 'Explicación técnica de la patente y mecanismo de inducción polifásico.',
              thumbnailUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=TLkA0RELQ1g',
              channelName: 'Ingeniería Aplicada',
              channelId: 'ingenieria',
              isLive: false,
              isVerified: true
            }
          },
          {
            id: 'block-3',
            position: 2,
            startOffsetSec: 1380,
            durationSec: 540,
            topic: 'Tesla vs Edison: Guerra de Corrientes',
            role: 'explainer' as const,
            contentItem: {
              id: 'sKzBwDTeYqA',
              providerId: 'sKzBwDTeYqA',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'Tesla vs Edison: La Guerra de las Corrientes',
              description: 'El debate histórico y la disputa técnica entre corriente alterna y continua.',
              thumbnailUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=sKzBwDTeYqA',
              channelName: 'Debates de la Historia',
              channelId: 'debates-historia',
              isLive: false,
              isVerified: true
            }
          },
          {
            id: 'block-4',
            position: 3,
            startOffsetSec: 1920,
            durationSec: 600,
            topic: 'La Torre de Wardenclyffe y Transmisión Inalámbrica',
            role: 'deep_dive' as const,
            contentItem: {
              id: 'w4w8a5k_tes',
              providerId: 'w4w8a5k_tes',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'La Torre de Wardenclyffe: Visión y Controversia',
              description: 'Análisis e interpretación del proyecto de energía inalámbrica de Wardenclyffe.',
              thumbnailUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=TLkA0RELQ1g',
              channelName: 'Misterios y Realidades',
              channelId: 'misterios',
              isLive: false,
              isVerified: false
            }
          },
          {
            id: 'block-5',
            position: 4,
            startOffsetSec: 2520,
            durationSec: 600,
            topic: 'El Mito del Rayo de la Muerte',
            role: 'discovery' as const,
            contentItem: {
              id: 'rayo_muerte_tes',
              providerId: 'rayo_muerte_tes',
              type: 'video' as const,
              provider: 'youtube' as const,
              title: 'El Supuesto Rayo de la Muerte: Mito vs Realidad',
              description: 'Hipótesis teóricas y mitos contemporáneos sobre el rayo de la muerte de Tesla.',
              thumbnailUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600',
              videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
              channelName: 'Ciencia Especulativa',
              channelId: 'especulativa',
              isLive: false,
              isVerified: false
            }
          }
        ]
      };
      setSignal(DEFAULT_2_VIDEOS_SIGNAL as any);
    }
  }, [activeSignal, setSignal]);

  const activeAssessment: EpistemicAssessment = evaluateEpistemicNature(
    (targetedBlockForContext || currentBlock)?.contentItem,
    activeSignal?.prompt || activeSignal?.name || 'Nikola Tesla',
    (targetedBlockForContext || currentBlock)?.role
  );

  const fetchMoments = async (knownDuration?: number) => {
    if (!currentBlock) return;
    const requestedBlockId = currentBlock.id;
    const duration = knownDuration || currentBlock.durationSec;
    
    try {
      const playbackItem: any = {
        id: currentBlock.contentItem.id,
        title: currentBlock.contentItem.title,
        durationSec: duration,
        videoUrl: currentBlock.contentItem.videoUrl || '',
        provider: currentBlock.contentItem.provider || 'youtube',
        providerId: (currentBlock.contentItem as any).providerContentId || currentBlock.contentItem.id
      };
      const res = await getMomentsForVideo(playbackItem);
      if (currentBlockIdRef.current !== requestedBlockId) return;

      if (res && res.moments && res.moments.length >= 4) {
        setMoments(res.moments);
        setIsFallbackMoments(res.isFallback);
      } else {
        const fallbacks: VideoMoment[] = [0.15, 0.38, 0.62, 0.85].map((ratio, index) => {
          const startSec = Math.floor(duration * ratio);
          return {
            id: `fallback-${index}-${currentBlock.id}`,
            contentKey: currentBlock.contentItem.id,
            startSec,
            title: `Momento ${index + 1}`,
            summary: `Punto de interés destacado en ${Math.floor(startSec / 60)}:${(startSec % 60).toString().padStart(2, '0')}`,
            type: 'key_point',
            confidence: 0.8,
            source: 'fallback'
          };
        });
        setMoments(fallbacks);
        setIsFallbackMoments(true);
      }
    } catch (e) {
      console.error('Error fetching moments:', e);
    }
  };

  useEffect(() => {
    if (currentBlock) {
      fetchMoments();
    }
  }, [currentBlock?.id]);

  const handleMomentClick = (moment: VideoMoment) => {
    setActiveMomentId(moment.id);
    if (viewMode === 'mosaic') {
      setViewMode('single');
    }
    playerRef.current?.seek(moment.startSec ?? 0);
  };

  const handleOpenMosaic = async () => {
    setViewMode('mosaic');
    if (isFallbackMoments && currentBlock) {
      const requestedBlockId = currentBlock.id;
      setIsAnalyzingYOU4(true);
      try {
        const playbackItem: any = {
          id: currentBlock.contentItem.id,
          title: currentBlock.contentItem.title,
          durationSec: currentBlock.durationSec,
          videoUrl: currentBlock.contentItem.videoUrl || '',
          provider: currentBlock.contentItem.provider || 'youtube',
          providerId: (currentBlock.contentItem as any).providerContentId || currentBlock.contentItem.id
        };
        const semRes = await requestSemanticAnalysis(playbackItem);
        if (currentBlockIdRef.current === requestedBlockId && semRes && semRes.moments && semRes.moments.length >= 4) {
          setMoments(semRes.moments);
          setIsFallbackMoments(false);
        }
      } catch (err) {
        console.error('Semantic analysis error:', err);
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
    if (currentState === 'playing' || currentState === 'buffering') {
      await playerRef.current?.pause();
    } else {
      await playerRef.current?.play();
    }
  };

  const handleNext = () => next();
  const handlePrevious = () => previous();
  const handleDirector = () => {
    alert("Modo Director activo.");
  };

  const openContextForCurrent = () => {
    setTargetedBlockForContext(null);
    setIsContextModalOpen(true);
  };

  const openContextForBlock = (block: ScheduleBlock) => {
    setTargetedBlockForContext(block);
    setIsContextModalOpen(true);
  };

  if (!activeSignal) {
    return <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--you-bg)', minHeight: '100vh' }}>Cargando señal...</div>;
  }

  // Calculate signal progress
  const totalSeconds = activeSignal.schedule.reduce((acc, b) => acc + b.durationSec, 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const elapsedSeconds = activeSignal.schedule.slice(0, currentBlockIndex).reduce((acc, b) => acc + b.durationSec, 0);
  const signalProgress = totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;

  const currentAssessment = evaluateEpistemicNature(
    currentBlock?.contentItem,
    activeSignal?.prompt || activeSignal?.name || 'Nikola Tesla',
    currentBlock?.role
  );

  const stage = (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 'var(--you-radius-lg)', overflow: 'hidden', boxShadow: 'var(--you-shadow)', background: '#000' }}>
      {currentBlock ? (
        viewMode === 'mosaic' && moments.length >= 4 ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <MosaicPlayerGrid 
              moments={moments}
              currentBlock={currentBlock}
              onSelect={handleMomentClick}
              thumbnailFallbackUrl={currentBlock.contentItem.thumbnail || (currentBlock.contentItem as any).thumbnailUrl}
            />
            {isAnalyzingYOU4 && (
              <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9000, background: 'rgba(14, 12, 28, 0.9)', padding: '10px 20px', borderRadius: '24px', color: '#00f0ff', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 20px rgba(0, 240, 255, 0.5)', border: '1px solid rgba(0, 240, 255, 0.3)', backdropFilter: 'blur(8px)' }}>
                <Sparkles size={16} className="pulse-anim" /> ✦ Analizando video...
              </div>
            )}
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
              onReady={(duration) => {
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>AHORA</span>
                  <EpistemicBadge nature={currentAssessment.nature} size="sm" />
                </div>
                <h2 style={{ color: 'white', fontSize: '28px', fontWeight: 800, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{currentBlock.topic}</h2>
                <div style={{ color: 'white', fontSize: '13px', fontWeight: 500, marginTop: '6px', opacity: 0.9 }}>
                  {Math.round(currentBlock.durationSec / 60)} MIN • {currentBlock.contentItem.title}
                </div>
              </div>
            </div>

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
        thumbnailFallbackUrl={currentBlock?.contentItem.thumbnail || (currentBlock?.contentItem as any).thumbnailUrl}
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

  const handleAddBlock = (newBlock: ScheduleBlock) => {
    const lastPos = (activeSignal?.schedule.length || 1) - 1;
    insert(newBlock, lastPos);
  };

  return (
    <>
      <ProgramarTVLayout
        stage={stage}
        intelligence={intelligence}
        timeline={
          <SignalTimeline 
            schedule={activeSignal?.schedule || []} 
            currentIndex={currentBlockIndex} 
            onReorder={reorder}
            onAddClick={() => setIsAddModalOpen(true)}
            onMapClick={() => setIsMapModalOpen(true)}
            onRigorClick={() => setIsRigorModalOpen(true)}
            entityName={activeSignal?.prompt || activeSignal?.name || 'Nikola Tesla'}
            onBlockContextClick={openContextForBlock}
          />
        }
        actions={
          <PlayerActionBar 
            onContextClick={openContextForCurrent}
          />
        }
        status={<SignalStatusBar />}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        signalName={activeSignal?.name || 'Mi Señal · Nikola Tesla'}
      />

      <AddSignalContentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddBlock={handleAddBlock}
        existingCount={activeSignal?.schedule.length || 0}
      />

      {/* Epistemic Guard Modals */}
      <EpistemicContextModal
        isOpen={isContextModalOpen}
        onClose={() => {
          setIsContextModalOpen(false);
          setTargetedBlockForContext(null);
        }}
        assessment={activeAssessment}
        videoTitle={(targetedBlockForContext || currentBlock)?.contentItem?.title}
      />

      <EpistemicMapModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        schedule={activeSignal?.schedule || []}
        signalName={activeSignal?.name || 'Mi Señal'}
        entityName={activeSignal?.prompt || activeSignal?.name || 'Nikola Tesla'}
        totalMinutes={totalMinutes}
      />

      <EpistemicRigorModal
        isOpen={isRigorModalOpen}
        onClose={() => setIsRigorModalOpen(false)}
        currentProfile={rigorProfile}
        onSelectProfile={(profile) => setRigorProfile(profile)}
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
