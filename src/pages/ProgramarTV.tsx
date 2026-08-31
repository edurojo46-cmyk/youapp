import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignalStore } from '../lib/tv/signalStore';
import { generateSurpriseBlock } from '../lib/tv/surpriseGenerator';
import { ThumbnailWithFallback } from '../components/ThumbnailWithFallback';
import { 
  Bell, Search, Mic, Sparkles, Maximize, Play, Volume2, 
  Settings, Maximize2, Bookmark, Clock, Info, Plus, PlayCircle, Radio,
  GripVertical, MoreHorizontal, MoreVertical, X, RotateCcw, Layers
} from 'lucide-react';

export default function ProgramarTV() {
  const navigate = useNavigate();
  const { activeSignal, reorder, remove, insert, currentBlockId, currentBlockIndex } = useSignalStore();

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [isGeneratingSurprise, setIsGeneratingSurprise] = useState(false);

  // Fallback if no signal
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

  // Logic for Drag & Drop Reordering
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    reorder(draggedIdx, idx);
    setDraggedIdx(null);
  };

  const handleRemove = (blockId: string) => {
    remove(blockId);
  };

  const handleSurprise = async (afterIndex: number) => {
    if (isGeneratingSurprise) return;
    setIsGeneratingSurprise(true);
    
    try {
      const surprise = await generateSurpriseBlock(activeSignal, afterIndex);
      if (surprise) {
        insert(surprise, afterIndex);
        console.log('[TV Telemetry] surprise_inserted');
      } else {
        alert("No encontramos una buena sorpresa en este momento.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingSurprise(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatOffset = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `+${h}h ${m}m`;
    return `+${m}m`;
  };

  return (
    <div className="ptv-layout fade-in">
      {/* ── TOP NAV ── */}
      <nav className="ptv-topnav">
        <div className="ptv-logo">
          Y O U A P P <span style={{ color: '#2563eb', marginLeft: '6px' }}>T V</span>
        </div>
        
        <div className="ptv-nav-links">
          <button onClick={() => navigate('/')}>Inicio</button>
          <button className="active">Programar TV</button>
          <button onClick={() => navigate('/create-signal')}>Mi señal</button>
        </div>

        <div className="ptv-user-section">
          <div className="icon-btn"><Bell size={20} /></div>
          <div className="user-avatar">
            <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User" />
          </div>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div className="ptv-main">
        {/* SIDEBAR: TV Preview & Actions */}
        <aside className="ptv-sidebar">
          
          <div className="ptv-preview-container">
            <div className="ptv-preview-screen">
               {/* Current video thumb */}
               {activeSignal.schedule[currentBlockIndex] && (
                 <img src={activeSignal.schedule[currentBlockIndex].contentItem.thumbnailUrl || 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=600'} alt="Playing" />
               )}
               <div className="ptv-preview-overlay">
                 <div className="live-badge">EN VIVO</div>
                 <div className="bottom-info">
                   <div className="playing-title">
                     {activeSignal.schedule[currentBlockIndex]?.contentItem.title}
                   </div>
                 </div>
               </div>
            </div>
            
            <button className="ptv-play-btn" onClick={() => navigate(`/live-zapping?signal=${activeSignal.id}`)}>
              <Play size={20} /> VOLVER A TV
            </button>
          </div>
          
          <div className="ptv-signal-info">
            <h2>{activeSignal.name}</h2>
            <div className="ptv-tags">
              {activeSignal.prompt.split(',').slice(0,3).map(tag => (
                <span key={tag} className="tag">{tag.trim()}</span>
              ))}
            </div>
            <div className="ptv-stats">
              <div className="stat">
                <Clock size={16} />
                <span>{Math.round(activeSignal.schedule.reduce((acc, b) => acc + b.durationSec, 0) / 60)} min totales</span>
              </div>
              <div className="stat">
                <Layers size={16} />
                <span>{activeSignal.schedule.length} bloques</span>
              </div>
            </div>
          </div>
          
          <div className="ptv-brain-card">
            <Sparkles size={20} color="#a855f7" />
            <div className="brain-text">
              <h3>Modo Director Activo</h3>
              <p>Arrastra los bloques para reordenarlos. El tiempo se ajustará automáticamente.</p>
            </div>
          </div>

        </aside>

        {/* CENTER CONTENT: Playlist Editor */}
        <div className="ptv-editor">
          
          <div className="editor-header">
            <div className="eh-left">
              <h2>Programación</h2>
              <span className="eh-subtitle">Modificá tu grilla en tiempo real</span>
            </div>
          </div>

          <div className="editor-list">
            {activeSignal.schedule.map((item, index) => {
              const isPlaying = index === currentBlockIndex;
              const isPast = index < currentBlockIndex;
              
              return (
                <div 
                  key={item.id}
                  className={`editor-item ${isPlaying ? 'playing' : ''} ${isPast ? 'past' : ''} ${draggedIdx === index ? 'dragging' : ''}`}
                  draggable={!isPast}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <div className="ei-drag-handle">
                    {!isPast ? <GripVertical size={20} color="#64748b" /> : <div style={{width: 20}}></div>}
                  </div>
                  
                  <div className="ei-time">
                    {formatOffset(item.startOffsetSec)}
                  </div>
                  
                  <div className="ei-thumb">
                    <ThumbnailWithFallback 
                      src={item.contentItem.thumbnailUrl || ''} 
                      candidates={item.contentItem.thumbnailCandidates}
                      alt={item.contentItem.title} 
                    />
                    {isPlaying && <div className="now-playing-overlay"><PlayCircle size={24} color="white" /></div>}
                  </div>
                  
                  <div className="ei-info">
                    <h3>{item.contentItem.title}</h3>
                    <div className="ei-meta">
                      <span className="ei-channel">{item.contentItem.channelName || 'TV'}</span>
                      <span className="ei-dot">•</span>
                      <span className="ei-tag">{item.role}</span>
                      <span className="ei-dot">•</span>
                      <span className="ei-duration">{formatTime(item.durationSec)}</span>
                    </div>
                  </div>
                  
                  <div className="ei-actions">
                    {!isPast && (
                      <>
                        <button className="action-btn" title="Sorpréndeme aquí" onClick={() => handleSurprise(index)}>
                          <Sparkles size={18} />
                        </button>
                        <button className="action-btn remove" onClick={() => handleRemove(item.id)}>
                          <X size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            
          </div>
        </div>
      </div>

      <style>{`
        /* Minimalist styles for ProgramarTV */
        .ptv-layout {
          background-color: #0f172a;
          min-height: 100vh;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          flex-direction: column;
        }

        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .ptv-topnav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 32px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
        }

        .ptv-logo {
          font-weight: 900;
          letter-spacing: 2px;
          font-size: 18px;
        }

        .ptv-nav-links {
          display: flex;
          gap: 24px;
        }

        .ptv-nav-links button {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: 0.2s;
        }

        .ptv-nav-links button:hover { color: white; }
        .ptv-nav-links button.active { color: white; font-weight: 700; border-bottom: 2px solid #2563eb; padding-bottom: 4px; }

        .ptv-user-section {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .icon-btn { color: #94a3b8; cursor: pointer; }
        .icon-btn:hover { color: white; }

        .user-avatar img {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid #334155;
        }

        .ptv-main {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .ptv-sidebar {
          width: 380px;
          background: #1e293b;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          border-right: 1px solid #334155;
        }

        .ptv-preview-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ptv-preview-screen {
          width: 100%;
          aspect-ratio: 16/9;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .ptv-preview-screen img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.8;
        }

        .ptv-preview-overlay {
          position: absolute;
          inset: 0;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 40%, rgba(0,0,0,0.8) 100%);
        }

        .live-badge {
          background: #ef4444;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          width: fit-content;
        }

        .playing-title {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.3;
        }

        .ptv-play-btn {
          width: 100%;
          background: #2563eb;
          color: white;
          border: none;
          padding: 14px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .ptv-play-btn:hover { background: #1d4ed8; }

        .ptv-signal-info h2 {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 800;
        }

        .ptv-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }

        .ptv-tags .tag {
          background: #334155;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          color: #cbd5e1;
          font-weight: 500;
        }

        .ptv-stats {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #94a3b8;
          font-size: 14px;
        }

        .ptv-brain-card {
          background: rgba(168, 85, 247, 0.1);
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          gap: 16px;
          margin-top: auto;
        }

        .brain-text h3 {
          margin: 0 0 4px;
          font-size: 14px;
          color: #e9d5ff;
        }

        .brain-text p {
          margin: 0;
          font-size: 12px;
          color: #c084fc;
          line-height: 1.5;
        }

        .ptv-editor {
          flex: 1;
          padding: 40px;
          overflow-y: auto;
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 32px;
        }

        .eh-left h2 {
          margin: 0 0 8px;
          font-size: 28px;
          font-weight: 800;
        }

        .eh-subtitle {
          color: #94a3b8;
          font-size: 15px;
        }

        .editor-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .editor-item {
          display: flex;
          align-items: center;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 16px;
          gap: 20px;
          transition: 0.2s;
        }

        .editor-item.dragging {
          opacity: 0.5;
          border: 1px dashed #2563eb;
        }

        .editor-item.playing {
          border-color: #2563eb;
          background: rgba(37, 99, 235, 0.1);
        }
        
        .editor-item.past {
          opacity: 0.5;
          filter: grayscale(0.5);
        }

        .ei-drag-handle {
          cursor: grab;
        }

        .ei-time {
          font-family: monospace;
          font-size: 16px;
          font-weight: 700;
          color: #cbd5e1;
          width: 80px;
        }

        .ei-thumb {
          width: 140px;
          height: 78px;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
        }

        .ei-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .now-playing-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ei-info {
          flex: 1;
        }

        .ei-info h3 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          line-height: 1.3;
        }

        .ei-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #94a3b8;
        }

        .ei-tag {
          background: #334155;
          padding: 2px 6px;
          border-radius: 4px;
          color: white;
          font-size: 11px;
          text-transform: uppercase;
        }

        .ei-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          background: #0f172a;
          border: 1px solid #334155;
          color: #94a3b8;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.2s;
        }

        .action-btn:hover {
          background: #334155;
          color: white;
        }

        .action-btn.remove:hover {
          background: #ef4444;
          border-color: #ef4444;
        }

      `}</style>
    </div>
  );
}
