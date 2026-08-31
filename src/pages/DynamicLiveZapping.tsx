import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSignalStore } from '../lib/tv/signalStore';
import { getDraftSignal } from '../lib/tv/draftStore';
import SmartTVPlayer from '../lib/tv/playback/SmartTVPlayer';
import { ChevronLeft, ChevronRight, SkipForward, XCircle, Sparkles, Tv } from 'lucide-react';

export default function DynamicLiveZapping() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeSignal, currentBlockIndex, currentBlockId, setSignal, next, previous } = useSignalStore();
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const signalId = params.get('signal');
    
    if (signalId) {
      // If we don't have it in store or it's a different one, load from draftStore
      if (!activeSignal || activeSignal.id !== signalId) {
        const draft = getDraftSignal(signalId);
        if (draft) {
          setSignal(draft);
        }
      }
    }
    setLoading(false);
  }, [location.search, activeSignal, setSignal]);

  if (loading) {
    return <div style={{ background: 'black', height: '100vh', color: 'white' }}>Cargando TV...</div>;
  }

  if (!activeSignal) {
    return (
      <div style={{ background: '#0f172a', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <h2>No hay señal activa</h2>
        <button onClick={() => navigate('/create-signal')} style={{ marginTop: 20, padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Crear Señal
        </button>
      </div>
    );
  }

  const currentBlock = activeSignal.schedule[currentBlockIndex];
  const nextBlock = activeSignal.schedule[currentBlockIndex + 1];

  const handleEnded = (blockId: string) => {
    if (blockId !== currentBlock.id) return;
    console.log('[TV Telemetry] block_completed:', blockId);
    next();
  };

  const handleError = (blockId: string, err: any) => {
    if (blockId !== currentBlock.id) return;
    console.error('[TV Telemetry] playback_error:', blockId, err);
    next(); // Skip on error (Phase 3B rule)
  };

  const handleSkip = () => {
    console.log('[TV Telemetry] user_skip:', currentBlock.id);
    next();
  };
  
  const handlePrevious = () => {
    console.log('[TV Telemetry] user_previous:', currentBlock.id);
    previous();
  };

  return (
    <div style={{ background: 'black', height: '100vh', display: 'flex', flexDirection: 'column', color: 'white', fontFamily: 'Inter, sans-serif' }}>
      
      {/* HEADER OVERLAY */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 24, zIndex: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)' }}>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{activeSignal.name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Bloque {currentBlockIndex + 1} de {activeSignal.schedule.length}
          </div>
        </div>
      </div>

      {/* PLAYER AREA */}
      <div style={{ flex: 1, position: 'relative' }}>
        {currentBlock ? (
          <SmartTVPlayer 
            key={currentBlock.id} // Force remount on block change
            block={currentBlock} 
            onEnded={() => handleEnded(currentBlock.id)} 
            onError={(err) => handleError(currentBlock.id, err)} 
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <h2>Tu señal terminó</h2>
            <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
              <button onClick={() => navigate('/create-signal')} style={{ padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Generar otra
              </button>
              <button onClick={() => useSignalStore.getState().jumpTo(activeSignal.schedule[0].id)} style={{ padding: '12px 24px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Repetir
              </button>
              <button onClick={() => navigate('/programar-tv')} style={{ padding: '12px 24px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Editar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* OSD BOTTOM BAR */}
      {currentBlock && (
        <div style={{ padding: 24, background: '#0f172a', borderTop: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', gap: 24 }}>
            
            {/* AHORA */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>AHORA</div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {currentBlock.contentItem.title}
              </h3>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                {(currentBlock.durationSec / 60).toFixed(0)} min
              </div>
            </div>

            {/* A CONTINUACION */}
            <div style={{ flex: 1, borderLeft: '1px solid #1e293b', paddingLeft: 24 }}>
              {nextBlock ? (
                <>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>A CONTINUACIÓN</div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#cbd5e1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {nextBlock.contentItem.title}
                  </h3>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    {(nextBlock.durationSec / 60).toFixed(0)} min
                  </div>
                </>
              ) : (
                <div style={{ color: '#64748b', fontSize: 14, fontStyle: 'italic', height: '100%', display: 'flex', alignItems: 'center' }}>
                  Último bloque de la señal
                </div>
              )}
            </div>
            
            {/* ACTIONS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => navigate('/programar-tv')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <Tv size={16} /> Programación
              </button>
              
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={previous} disabled={currentBlockIndex === 0} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', border: 'none', color: currentBlockIndex === 0 ? '#475569' : 'white', padding: '10px', borderRadius: 8, cursor: currentBlockIndex === 0 ? 'default' : 'pointer' }}>
                  <ChevronLeft size={18} />
                </button>
                <button onClick={handleSkip} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', border: 'none', color: 'white', padding: '10px', borderRadius: 8, cursor: 'pointer' }}>
                  <SkipForward size={18} />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
