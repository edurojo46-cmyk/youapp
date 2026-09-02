import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, Pause, SkipForward, SkipBack, Maximize, Volume2, MoreHorizontal,
  ChevronDown, ChevronRight, Mic, Sparkles, BookOpen, Clock, Settings,
  Radio, ShieldCheck, CheckCircle2, ChevronLeft, Bookmark, Plus, Subtitles,
  Share2, ListFilter, SlidersHorizontal, Info, PlayCircle
} from 'lucide-react';
import { useSignalStore } from '../lib/tv/signalStore';
import { YouAppPlayer, type YouAppPlayerHandle } from '../components/player/YouAppPlayer';
import { ThumbnailWithFallback } from '../components/ThumbnailWithFallback';
import { getMomentsForVideo } from '../lib/moments/momentEngine';
import type { VideoMoment } from '../lib/moments/momentTypes';
import { logAudienceEvent } from '../lib/player/telemetry/playerEvents';

export default function MiSenal1() {
  const navigate = useNavigate();
  const { activeSignal, currentBlockIndex, setSignal } = useSignalStore();
  const playerRef = useRef<YouAppPlayerHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [moments, setMoments] = useState<VideoMoment[]>([]);
  const [activeMomentId, setActiveMomentId] = useState<string | undefined>();
  const currentBlock = activeSignal?.schedule[currentBlockIndex] || null;

  const fetchMoments = async (actualDuration: number) => {
    if (!currentBlock || actualDuration === 0) return;
    const ms = await getMomentsForVideo({
      blockId: currentBlock.id,
      provider: currentBlock.contentItem.provider as any,
      providerContentId: currentBlock.contentItem.providerId || currentBlock.contentItem.id,
      durationSec: actualDuration,
      title: currentBlock.contentItem.title
    });
    setMoments(ms.moments || (ms as any));
    setActiveMomentId(undefined); // reset
  };

  const handleMomentClick = (moment: VideoMoment, index: number) => {
    if (!playerRef.current || !currentBlock) return;
    
    const actualDuration = playerRef.current.getDuration();
    // Safety clamp: never seek beyond actualDuration - 1
    let safeSeekSec = moment.startSec;
    if (actualDuration > 0) {
      safeSeekSec = Math.min(moment.startSec, actualDuration - 1);
    }
    
    setActiveMomentId(moment.id);
    playerRef.current.seek(safeSeekSec);
    playerRef.current.play();
    setIsPlaying(true);
    
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // If there's no active signal, we can show a fallback or load the demo signal automatically
  useEffect(() => {
    if (!activeSignal) {
      const MOCK_SIGNAL = {
        id: 'mock-signal-1',
        name: 'Señal de Prueba (Demo)',
        prompt: 'Demostración de Programar TV',
        visibility: 'private' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        schedule: [
          {
            id: 'block-1',
            position: 0,
            startOffsetSec: 0,
            durationSec: 596,
            topic: 'Documental',
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
            topic: 'Naturaleza',
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
      setSignal(MOCK_SIGNAL as any);
    }
  }, [activeSignal, setSignal]);



  return (
    <div className="ms-container fade-in">
      
      {/* --- TOP NAVIGATION --- */}
      <nav className="ms-topnav">
        <div className="ms-logo-area">
          <div className="ms-logo">
            <span style={{ color: '#2563eb', fontWeight: 900 }}>YOUAPP</span> 
            <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '4px' }}>TV</span>
          </div>
          <div className="ms-divider"></div>
          <div className="ms-breadcrumb">
            <span className="ms-breadcrumb-root">Mi Señal</span>
            <span className="ms-dot">•</span>
            <span className="ms-breadcrumb-current">Historia de Roma</span>
          </div>
        </div>

        <div className="ms-nav-links">
          <button className="ms-nav-btn">Inicio</button>
          <button className="ms-nav-btn active">Mi Señal</button>
          <button className="ms-nav-btn">Programación</button>
        </div>

        <div className="ms-user-area">
          <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&q=80" alt="User" className="ms-avatar" />
          <ChevronDown size={16} color="#64748b" />
        </div>
      </nav>

      {/* --- MAIN CONTENT --- */}
      <main className="ms-main">
        
        {/* LEFT COLUMN: PLAYER */}
        <div className="ms-player-section">
          <div className="ms-player-container">
            {/* Real Video Player */}
            {currentBlock ? (
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
                   onReady={(duration) => {
                     // Get true duration on ready, then fetch moments to ensure we calculate 10/35/65/90 correctly
                     fetchMoments(duration);
                   }}
                   onEnded={() => {}}
                   onError={(err) => console.error(err)}
                 />
               </div>
            ) : (
              <div 
                className="ms-player-bg" 
                style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1552832230-c0197dd311f5?q=80&w=1920&auto=format&fit=crop)' }}
              ></div>
            )}
            
            <div className="ms-player-overlay">
              {/* Top Left Badge */}
              <div className="ms-live-badge">
                <Radio size={14} /> ESTÁS VIENDO
              </div>

              {/* Central Ring (YOU RING) */}
              <div className="ms-you-ring-container">
                <div className="ms-ring-label top">YOU RING</div>
                
                <div className="ms-you-ring">
                  {/* Progress arc (simulated with SVG) */}
                  <svg className="ms-ring-svg" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                    <circle cx="100" cy="100" r="96" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray="603" strokeDashoffset="400" strokeLinecap="round" transform="rotate(-90 100 100)" />
                  </svg>
                  
                  {/* Actions around ring */}
                  <div className="ms-ring-action left">
                    <SkipBack size={18} />
                    <span>Anterior</span>
                  </div>
                  <div className="ms-ring-action right">
                    <SkipForward size={18} />
                    <span>Siguiente</span>
                  </div>
                  <div className="ms-ring-action bottom-left">
                    <Sparkles size={18} />
                    <span>Sorpréndeme</span>
                  </div>
                  <div className="ms-ring-action bottom-right">
                    <div className="ms-director-icon"><Mic size={14} color="white" /></div>
                    <span>Director</span>
                  </div>

                  {/* Center Play/Pause */}
                  <div 
                    className="ms-ring-center"
                    onClick={() => {
                      if (isPlaying) {
                        playerRef.current?.pause();
                        setIsPlaying(false);
                      } else {
                        playerRef.current?.play();
                        setIsPlaying(true);
                      }
                    }}
                  >
                    {isPlaying ? <Pause size={24} color="#2563eb" fill="#2563eb" /> : <Play size={24} color="#2563eb" fill="#2563eb" style={{ marginLeft: '4px' }} />}
                  </div>
                </div>
              </div>

              {/* Bottom Info */}
              <div className="ms-player-info">
                <h1>{currentBlock ? currentBlock.contentItem.title : 'Roma'}</h1>
                <h2>{currentBlock ? currentBlock.topic : 'El nacimiento de un imperio'}</h2>
                <div className="ms-player-source">
                  Fuente: {currentBlock ? currentBlock.contentItem.provider : 'YouTube'} - {currentBlock ? (currentBlock.contentItem.channelTitle || (currentBlock.contentItem as any).channelName) : 'History Channel'} <Info size={14} />
                </div>
              </div>

              {/* Bottom Controls */}
              <div className="ms-player-controls">
                <span className="ms-time">08:42</span>
                <div className="ms-progress-bar">
                  <div className="ms-progress-fill" style={{ width: '40%' }}></div>
                  <div className="ms-progress-handle" style={{ left: '40%' }}></div>
                </div>
                <span className="ms-time">20:18</span>
                <div className="ms-controls-right">
                  <button className="ms-control-btn"><Volume2 size={18} /></button>
                  <button className="ms-control-btn"><Maximize size={18} /></button>
                  <button className="ms-control-btn"><MoreHorizontal size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SIDEBAR */}
        <aside className="ms-sidebar">
          
          {/* YOU4 Section */}
          <div className="ms-card ms-you4-card">
            <div className="ms-card-header">
              <div className="ms-card-title">
                <span className="ms-you4-logo">YOU4</span> 
                <span className="ms-you4-subtitle">4 momentos clave en 1 vistazo</span>
              </div>
              <button className="ms-info-btn"><Info size={14} /></button>
            </div>

            <div className="ms-you4-grid">
              {moments.map((m, idx) => (
                <div 
                  key={m.id} 
                  className={`ms-you4-item ${activeMomentId === m.id ? 'active' : ''}`}
                  style={{ backgroundImage: `url(${currentBlock?.contentItem.thumbnail || (currentBlock?.contentItem as any).thumbnailUrl || 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=600&auto=format&fit=crop'})` }}
                  onClick={() => handleMomentClick(m, idx)}
                >
                  <div className="ms-you4-badge">{idx + 1}</div>
                  <div className="ms-you4-overlay">
                    <h4>{m.title}</h4>
                    <div className="ms-you4-times"><span>{formatTime(m.startSec)}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <button className="ms-btn-outline ms-full-width" style={{ marginTop: '16px' }}>
              Ver todo el video <Maximize size={14} style={{ marginLeft: '6px' }}/>
            </button>
          </div>

          <div className="ms-sidebar-bottom">
            {/* Elegido para vos */}
            <div className="ms-card ms-suggest-card">
              <div className="ms-suggest-header">
                <Sparkles size={16} color="#3b82f6" />
                <span>Elegido para vos</span>
              </div>
              <p className="ms-suggest-text">Introduce el Imperio Romano antes del bloque de arqueología.</p>
              <div className="ms-suggest-meta">
                14 min <span className="dot">•</span> Documental <span className="dot">•</span> Nivel introductorio
              </div>
              <button className="ms-btn-secondary ms-full-width" style={{ marginTop: '16px' }}>
                Ver sugerencia <ChevronRight size={16} style={{ marginLeft: 'auto' }} />
              </button>
            </div>

            {/* Director */}
            <div className="ms-card ms-director-card">
              <div className="ms-director-header">
                <Mic size={16} color="#3b82f6" />
                <span>Director</span>
              </div>
              <p className="ms-director-sub">Tu asistente inteligente</p>
              
              <div className="ms-director-wave-btn">
                <div className="ms-wave-bars">
                  <div className="bar"></div><div className="bar"></div><div className="bar"></div><div className="bar"></div><div className="bar"></div>
                </div>
              </div>
              
              <button className="ms-btn-secondary ms-full-width">
                Hablá con Director
              </button>
            </div>
          </div>

        </aside>
      </main>

      {/* --- BOTTOM SECTION --- */}
      <footer className="ms-bottom-section">
        
        {/* TIMELINE */}
        <div className="ms-timeline-container">
          <div className="ms-timeline-label">
            <span>MI SEÑAL</span> <Radio size={14} color="#64748b" />
          </div>
          
          <div className="ms-timeline-track">
            {/* Nav buttons */}
            <button className="ms-timeline-nav"><ListFilter size={16} /></button>
            <button className="ms-timeline-nav"><ChevronLeft size={16} /></button>

            {/* Past Block */}
            <div className="ms-block past">
              <div className="ms-block-time">08:00</div>
              <div className="ms-block-card">
                <img src="https://images.unsplash.com/photo-1548232979-6c557ee14752?w=100&q=80" alt="thumb" />
                <div className="ms-block-info">
                  <h4>Los orígenes de Roma</h4>
                  <span>16 min</span>
                </div>
              </div>
            </div>

            {/* Current Block */}
            <div className="ms-block current">
              <div className="ms-block-time active">
                <div className="ms-time-marker">08:42</div>
                <div className="ms-time-line"></div>
              </div>
              <div className="ms-block-card active">
                <img src="https://images.unsplash.com/photo-1552832230-c0197dd311f5?w=100&q=80" alt="thumb" />
                <div className="ms-block-info">
                  <h4>Roma</h4>
                  <span>El nacimiento de un imperio</span>
                  <div className="ms-block-dur">20 min</div>
                </div>
                <div className="ms-playing-eq">
                  <div className="eq-bar"></div><div className="eq-bar"></div><div className="eq-bar"></div>
                </div>
              </div>
            </div>

            {/* Future Block 1 */}
            <div className="ms-block">
              <div className="ms-block-time">09:03</div>
              <div className="ms-block-card">
                <img src="https://images.unsplash.com/photo-1606821385908-569b0717208d?w=100&q=80" alt="thumb" />
                <div className="ms-block-info">
                  <h4>Arqueología de Roma</h4>
                  <span>12 min</span>
                </div>
              </div>
            </div>

            {/* Future Block 2 */}
            <div className="ms-block">
              <div className="ms-block-time">09:35</div>
              <div className="ms-block-card">
                <img src="https://images.unsplash.com/photo-1534067425164-8848d6d841cc?w=100&q=80" alt="thumb" />
                <div className="ms-block-info">
                  <h4>Hallazgos recientes</h4>
                  <span>15 min</span>
                </div>
              </div>
            </div>
            
            <div className="ms-block-add">
              <Plus size={20} color="#94a3b8" />
              <span>Agregar<br/>contenido</span>
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="ms-actions-row">
          <button className="ms-action-btn"><Sparkles size={16} /> Resumen IA</button>
          <button className="ms-action-btn"><Bookmark size={16} /> Momentos</button>
          <button className="ms-action-btn"><Plus size={16} /> Guardar</button>
          <button className="ms-action-btn"><Subtitles size={16} /> Subtítulos</button>
          <button className="ms-action-btn"><Share2 size={16} /> Compartir</button>
          <button className="ms-action-btn">1.0x Velocidad <ChevronDown size={14} /></button>
          <button className="ms-action-btn"><ListFilter size={16} /> Lista</button>
        </div>

        {/* FOOTER STATS */}
        <div className="ms-footer-stats">
          <div className="ms-stat-item">
            <div className="ms-stat-icon"><PlayCircle size={20} color="#3b82f6" /></div>
            <div>
              <h4>Tu señal inteligente</h4>
              <span>Hecha para vos</span>
            </div>
          </div>
          
          <div className="ms-stat-item">
            <div className="ms-stat-icon"><Clock size={20} color="#3b82f6" /></div>
            <div>
              <h4>Duración total</h4>
              <span>1 h 05 min</span>
            </div>
          </div>
          
          <div className="ms-stat-item">
            <div className="ms-stat-icon"><Sparkles size={20} color="#3b82f6" /></div>
            <div>
              <h4>Contenido de calidad</h4>
              <span>Curado con IA</span>
            </div>
          </div>
          
          <div className="ms-stat-item">
            <div className="ms-stat-icon"><ShieldCheck size={20} color="#3b82f6" /></div>
            <div>
              <h4>Fuentes confiables</h4>
              <span>Verificadas</span>
            </div>
          </div>
          
          <div className="ms-stat-item">
            <div className="ms-stat-indicator"></div>
            <div>
              <h4>Señal activa</h4>
              <span>En vivo</span>
            </div>
          </div>
          
          <button className="ms-btn-edit">
            Editar mi señal <SlidersHorizontal size={14} style={{ marginLeft: '8px' }} />
          </button>
        </div>

      </footer>

      <style>{`
        /* Global & Reset */
        .ms-container {
          background-color: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #0f172a;
          display: flex;
          flex-direction: column;
        }

        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* Top Navigation */
        .ms-topnav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 32px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .ms-logo-area { display: flex; align-items: center; gap: 16px; }
        .ms-logo { font-size: 20px; letter-spacing: -0.5px; }
        .ms-divider { width: 1px; height: 24px; background: #cbd5e1; }
        .ms-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 14px; }
        .ms-breadcrumb-root { font-weight: 600; color: #334155; }
        .ms-dot { color: #94a3b8; }
        .ms-breadcrumb-current { color: #94a3b8; }

        .ms-nav-links { display: flex; gap: 32px; }
        .ms-nav-btn { background: none; border: none; font-size: 15px; color: #64748b; font-weight: 500; cursor: pointer; padding-bottom: 4px; border-bottom: 2px solid transparent; transition: 0.2s; }
        .ms-nav-btn:hover { color: #0f172a; }
        .ms-nav-btn.active { color: #2563eb; font-weight: 600; border-bottom-color: #2563eb; }

        .ms-user-area { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .ms-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }

        /* Main Content Grid */
        .ms-main {
          display: flex;
          gap: 24px;
          padding: 24px 32px;
          flex: 1;
        }

        /* Player Section */
        .ms-player-section { flex: 1; display: flex; flex-direction: column; }
        .ms-player-container {
          position: relative;
          width: 100%;
          border-radius: 24px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          aspect-ratio: 16/9;
          max-height: calc(100vh - 280px);
        }
        .ms-player-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          opacity: 0.85;
        }
        .ms-player-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.8) 100%);
          display: flex;
          flex-direction: column;
          padding: 24px;
          color: white;
          pointer-events: none;
        }
        .ms-player-overlay > * { pointer-events: auto; }
        .ms-live-badge {
          background: rgba(255,255,255,0.2);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 6px 12px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          width: fit-content;
        }

        /* YOU RING */
        .ms-you-ring-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .ms-ring-label {
          font-size: 10px;
          letter-spacing: 1.5px;
          color: rgba(255,255,255,0.8);
          margin-bottom: 8px;
          font-weight: 600;
        }
        .ms-you-ring {
          position: relative;
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,0,0,0) 40%, rgba(0,0,0,0.3) 100%);
        }
        .ms-ring-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .ms-ring-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 64px;
          height: 64px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px rgba(255,255,255,0.3);
          cursor: pointer;
          transition: transform 0.2s;
        }
        .ms-ring-center:hover { transform: translate(-50%, -50%) scale(1.05); }
        .ms-ring-action {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: rgba(255,255,255,0.8);
          font-size: 11px;
          cursor: pointer;
          transition: color 0.2s;
        }
        .ms-ring-action:hover { color: white; }
        .ms-ring-action.left { top: 50%; left: -20px; transform: translateY(-50%); }
        .ms-ring-action.right { top: 50%; right: -20px; transform: translateY(-50%); }
        .ms-ring-action.bottom-left { bottom: 10px; left: 10px; }
        .ms-ring-action.bottom-right { bottom: 10px; right: 10px; }
        .ms-director-icon { background: rgba(255,255,255,0.2); padding: 6px; border-radius: 50%; display: flex; margin-bottom: 2px; }

        .ms-player-info { margin-top: auto; margin-bottom: 24px; }
        .ms-player-info h1 { margin: 0 0 4px; font-size: 42px; font-weight: 700; }
        .ms-player-info h2 { margin: 0 0 12px; font-size: 20px; font-weight: 400; opacity: 0.9; }
        .ms-player-source { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.7; }

        .ms-player-controls { display: flex; align-items: center; gap: 16px; }
        .ms-time { font-size: 13px; font-weight: 500; font-family: monospace; }
        .ms-progress-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; position: relative; cursor: pointer; }
        .ms-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #3b82f6; border-radius: 2px; }
        .ms-progress-handle { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; background: white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.5); }
        .ms-controls-right { display: flex; gap: 12px; }
        .ms-control-btn { background: rgba(255,255,255,0.1); border: none; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .ms-control-btn:hover { background: rgba(255,255,255,0.2); }

        /* Sidebar */
        .ms-sidebar { width: 360px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; }
        
        .ms-card { background: white; border-radius: 20px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid #f1f5f9; }
        
        .ms-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .ms-card-title { display: flex; align-items: center; gap: 8px; }
        .ms-you4-logo { color: #3b82f6; font-weight: 800; font-size: 16px; letter-spacing: -0.5px; }
        .ms-you4-subtitle { color: #64748b; font-size: 12px; }
        .ms-info-btn { background: none; border: 1px solid #e2e8f0; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #94a3b8; cursor: pointer; }

        .ms-you4-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ms-you4-item { position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background-size: cover; background-position: center; cursor: pointer; transition: transform 0.2s; }
        .ms-you4-item:hover { transform: scale(1.02); }
        .ms-you4-badge { position: absolute; top: 8px; left: 8px; background: #3b82f6; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; z-index: 2; }
        .ms-you4-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; color: white; }
        .ms-you4-overlay h4 { margin: 0 0 4px; font-size: 12px; font-weight: 600; }
        .ms-you4-times { display: flex; justify-content: space-between; font-size: 10px; font-family: monospace; opacity: 0.8; }

        .ms-btn-outline { background: white; border: 1px solid #e2e8f0; color: #334155; padding: 12px; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .ms-btn-outline:hover { background: #f8fafc; }
        .ms-full-width { width: 100%; }

        .ms-sidebar-bottom { display: flex; gap: 16px; }
        .ms-suggest-card { flex: 2; display: flex; flex-direction: column; }
        .ms-suggest-header { display: flex; align-items: center; gap: 6px; color: #3b82f6; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
        .ms-suggest-text { font-size: 13px; color: #334155; line-height: 1.4; margin: 0 0 12px; }
        .ms-suggest-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; margin-top: auto; }
        .dot { font-size: 8px; }

        .ms-director-card { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: center; }
        .ms-director-header { display: flex; align-items: center; gap: 6px; color: #3b82f6; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .ms-director-sub { font-size: 10px; color: #94a3b8; margin: 0 0 16px; }
        .ms-director-wave-btn { width: 48px; height: 48px; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; cursor: pointer; transition: 0.2s; }
        .ms-director-wave-btn:hover { background: #dbeafe; transform: scale(1.05); }
        .ms-wave-bars { display: flex; gap: 3px; align-items: center; }
        .ms-wave-bars .bar { width: 3px; background: #3b82f6; border-radius: 2px; }
        .ms-wave-bars .bar:nth-child(1) { height: 10px; }
        .ms-wave-bars .bar:nth-child(2) { height: 18px; }
        .ms-wave-bars .bar:nth-child(3) { height: 24px; }
        .ms-wave-bars .bar:nth-child(4) { height: 16px; }
        .ms-wave-bars .bar:nth-child(5) { height: 8px; }

        .ms-btn-secondary { background: #f8fafc; border: 1px solid #e2e8f0; color: #3b82f6; padding: 10px; border-radius: 10px; font-weight: 600; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .ms-btn-secondary:hover { background: #eff6ff; border-color: #bfdbfe; }

        /* Bottom Section */
        .ms-bottom-section { background: white; border-top: 1px solid #e2e8f0; padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; }
        
        .ms-timeline-container { display: flex; align-items: center; gap: 24px; }
        .ms-timeline-label { display: flex; align-items: center; gap: 8px; color: #3b82f6; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; width: 100px; flex-shrink: 0; }
        
        .ms-timeline-track { display: flex; align-items: center; gap: 12px; flex: 1; overflow-x: auto; padding-bottom: 8px; }
        .ms-timeline-track::-webkit-scrollbar { height: 4px; }
        .ms-timeline-track::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        
        .ms-timeline-nav { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: center; color: #64748b; cursor: pointer; flex-shrink: 0; }
        .ms-timeline-nav:hover { background: #f8fafc; }

        .ms-block { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
        .ms-block-time { font-size: 12px; color: #64748b; font-family: monospace; font-weight: 500; }
        .ms-block-time.active { position: relative; color: #3b82f6; }
        .ms-time-marker { background: #3b82f6; color: white; padding: 2px 8px; border-radius: 10px; }
        .ms-time-line { position: absolute; left: 50%; top: 20px; bottom: -10px; width: 2px; background: #3b82f6; transform: translateX(-50%); z-index: 1; }
        
        .ms-block-card { display: flex; align-items: center; gap: 12px; background: white; border: 1px solid #e2e8f0; padding: 8px; border-radius: 12px; width: 260px; transition: 0.2s; position: relative; z-index: 2; cursor: pointer; }
        .ms-block.past .ms-block-card { opacity: 0.6; }
        .ms-block-card.active { background: #3b82f6; border-color: #3b82f6; color: white; box-shadow: 0 10px 20px rgba(59, 130, 246, 0.2); }
        .ms-block-card img { width: 64px; height: 44px; border-radius: 6px; object-fit: cover; }
        
        .ms-block-info h4 { margin: 0 0 2px; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
        .ms-block-info span { font-size: 11px; color: #64748b; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
        .ms-block-card.active .ms-block-info span { color: rgba(255,255,255,0.8); }
        .ms-block-dur { font-size: 11px; margin-top: 2px; font-weight: 500; }

        .ms-playing-eq { position: absolute; right: 12px; display: flex; gap: 2px; align-items: center; }
        .eq-bar { width: 3px; background: white; border-radius: 2px; animation: eq 1s infinite alternate ease-in-out; }
        .eq-bar:nth-child(1) { height: 8px; animation-delay: 0s; }
        .eq-bar:nth-child(2) { height: 14px; animation-delay: 0.2s; }
        .eq-bar:nth-child(3) { height: 10px; animation-delay: 0.4s; }
        @keyframes eq { 0% { height: 6px; } 100% { height: 16px; } }

        .ms-block-add { display: flex; align-items: center; gap: 12px; border: 1px dashed #cbd5e1; padding: 12px 20px; border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 22px; transition: 0.2s; }
        .ms-block-add:hover { background: #f8fafc; border-color: #94a3b8; }

        /* Actions Row */
        .ms-actions-row { display: flex; gap: 12px; padding-left: 124px; }
        .ms-action-btn { background: white; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 500; color: #334155; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .ms-action-btn:hover { background: #f8fafc; border-color: #cbd5e1; }

        /* Footer Stats */
        .ms-footer-stats { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 20px; }
        .ms-stat-item { display: flex; align-items: center; gap: 12px; }
        .ms-stat-icon { background: #eff6ff; padding: 8px; border-radius: 50%; display: flex; }
        .ms-stat-item h4 { margin: 0 0 2px; font-size: 13px; font-weight: 600; color: #1e293b; }
        .ms-stat-item span { font-size: 11px; color: #64748b; }
        .ms-stat-indicator { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2); margin: 0 8px; }

        .ms-btn-edit { background: #f1f5f9; border: none; color: #475569; font-size: 13px; font-weight: 600; padding: 10px 20px; border-radius: 20px; display: flex; align-items: center; cursor: pointer; transition: 0.2s; }
        .ms-btn-edit:hover { background: #e2e8f0; }

      `}</style>
    </div>
  );
}
