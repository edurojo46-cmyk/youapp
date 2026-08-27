import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Tv, Clock, RotateCcw, Save, Sparkles, X, Plus } from 'lucide-react';
import { type UniversalChannel } from '../lib/universalChannels';

// Sample video data to populate and swap
export const VIDEO_LIBRARY = [
  { id: 'v1', title: 'El futuro del trabajo y la IA', duration: '60 min', channel: 'Tech Trends', thumb: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=400&q=80' },
  { id: 'v2', title: 'Historia de la Antigua Roma', duration: '60 min', channel: 'DocuHistory', thumb: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400&q=80' },
  { id: 'v3', title: 'Cómo invertir en 2026', duration: '60 min', channel: 'Finanzas Hoy', thumb: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80' },
  { id: 'v4', title: 'La física cuántica explicada', duration: '60 min', channel: 'Ciencia 101', thumb: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=400&q=80' },
  { id: 'v5', title: 'Viaje por la Patagonia', duration: '60 min', channel: 'Travelers', thumb: 'https://images.unsplash.com/photo-1518182170546-076616fd4aa6?w=400&q=80' },
  { id: 'v6', title: 'Resumen de Noticias 24h', duration: '60 min', channel: 'News Global', thumb: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=400&q=80' },
  { id: 'v7', title: 'Música Lo-Fi para estudiar', duration: '60 min', channel: 'Chill Vibes', thumb: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80' },
  { id: 'v8', title: 'Entrevista: Creadores del Futuro', duration: '60 min', channel: 'Podcast Pro', thumb: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&q=80' }
];

interface TimeSlot {
  timeStart: string;
  timeEnd: string;
  video: typeof VIDEO_LIBRARY[0];
}

export const INITIAL_SCHEDULE: TimeSlot[] = [
  { timeStart: '18:00', timeEnd: '19:00', video: VIDEO_LIBRARY[0] },
  { timeStart: '19:00', timeEnd: '20:00', video: VIDEO_LIBRARY[1] },
  { timeStart: '20:00', timeEnd: '21:00', video: VIDEO_LIBRARY[2] },
  { timeStart: '21:00', timeEnd: '22:00', video: VIDEO_LIBRARY[3] },
  { timeStart: '22:00', timeEnd: '23:00', video: VIDEO_LIBRARY[4] },
];

export default function CreateSignal() {
  const navigate = useNavigate();
  const [signalName, setSignalName] = useState('Mi Señal Inteligente');
  const [schedule, setSchedule] = useState<TimeSlot[]>(INITIAL_SCHEDULE);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);

  const handleOpenSwapModal = (index: number) => {
    setActiveSlotIndex(index);
    setIsModalOpen(true);
  };

  const handleSwapVideo = (newVideo: typeof VIDEO_LIBRARY[0]) => {
    if (activeSlotIndex !== null) {
      const newSchedule = [...schedule];
      newSchedule[activeSlotIndex].video = newVideo;
      setSchedule(newSchedule);
    }
    setIsModalOpen(false);
  };

  const handleAddSlot = () => {
    const lastSlot = schedule[schedule.length - 1];
    const newStart = lastSlot.timeEnd;
    const endHour = (parseInt(newStart.split(':')[0]) + 1) % 24;
    const newEnd = `${endHour.toString().padStart(2, '0')}:00`;
    
    // Pick a random video from library to populate
    const randomVideo = VIDEO_LIBRARY[Math.floor(Math.random() * VIDEO_LIBRARY.length)];

    setSchedule([
      ...schedule,
      { timeStart: newStart, timeEnd: newEnd, video: randomVideo }
    ]);
  };

  const handleSaveSignal = () => {
    const newSignal: UniversalChannel = {
      id: `custom-${Date.now()}`,
      name: signalName,
      description: 'Programación personalizada',
      category: 'custom',
      avatarUrl: 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=200',
      thumbnail: 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=600',
      provider: 'direct',
      videoUrl: '',
      currentVideoTitle: 'Programación Custom',
      viewerCount: 0,
      isLive: true,
      tags: ['Personal', 'Custom']
    };

    const saved = localStorage.getItem('youapp_saved_custom_channels');
    const existing = saved ? JSON.parse(saved) : [];
    existing.push(newSignal);
    localStorage.setItem('youapp_saved_custom_channels', JSON.stringify(existing));

    navigate('/my-lists');
  };

  return (
    <div className="studio-page fade-in">
      {/* HEADER */}
      <header className="studio-header">
        <div className="sh-left">
          <button className="sh-back" onClick={() => navigate(-1)}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <input 
              type="text" 
              className="sh-title-input" 
              value={signalName}
              onChange={(e) => setSignalName(e.target.value)}
            />
            <p className="sh-subtitle"><Sparkles size={14} color="#a78bfa" /> Estudio de Programación • Generado por IA</p>
          </div>
        </div>
        <button className="sh-save-btn" onClick={handleSaveSignal}>
          <Save size={18} /> Programar Señal
        </button>
      </header>

      {/* TIMELINE */}
      <div className="studio-timeline">
        <div className="timeline-line"></div>
        
        {schedule.map((slot, index) => (
          <div key={index} className="slot-item">
            <div className="slot-time">
              <span className="st-start">{slot.timeStart}</span>
              <span className="st-end">{slot.timeEnd}</span>
            </div>
            
            <div className="slot-dot"></div>

            <div className="slot-card">
              <div 
                className="sc-thumb" 
                style={{ backgroundImage: `url(${slot.video.thumb})` }}
              >
                <div className="sc-duration">{slot.video.duration}</div>
              </div>
              
              <div className="sc-info">
                <h3>{slot.video.title}</h3>
                <span className="sc-channel">{slot.video.channel}</span>
                <p className="sc-desc">Video por defecto asignado según tu algoritmo.</p>
              </div>

              <div className="sc-actions">
                <button 
                  className="sc-btn sc-swap"
                  onClick={() => handleOpenSwapModal(index)}
                >
                  <RotateCcw size={16} /> Cambiar
                </button>
              </div>
            </div>
          </div>
        ))}
        
        <button className="add-slot-btn" onClick={handleAddSlot}>
          <Plus size={18} /> Agregar bloque horario ({schedule[schedule.length - 1].timeEnd})
        </button>
      </div>

      {/* SWAP MODAL */}
      {isModalOpen && (
        <div className="swap-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="swap-modal" onClick={e => e.stopPropagation()}>
            <div className="sm-header">
              <h3>Elegir contenido alternativo</h3>
              <button className="sm-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <p className="sm-desc">Selecciona un video de tu biblioteca o sugerencias de IA para reemplazar el horario de {activeSlotIndex !== null ? schedule[activeSlotIndex].timeStart : ''}</p>
            
            <div className="sm-grid">
              {VIDEO_LIBRARY.map(vid => (
                <div key={vid.id} className="sm-card" onClick={() => handleSwapVideo(vid)}>
                  <div className="sm-card-thumb" style={{ backgroundImage: `url(${vid.thumb})` }}></div>
                  <div className="sm-card-info">
                    <h4>{vid.title}</h4>
                    <span>{vid.channel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .studio-page {
          padding: 32px 40px;
          max-width: 1000px;
          margin: 0 auto;
          color: white;
        }

        .fade-in {
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .studio-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 24px;
          border-radius: 20px;
        }

        .sh-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .sh-back {
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          width: 44px; height: 44px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }
        .sh-back:hover { background: rgba(255,255,255,0.2); }

        .sh-title-input {
          background: transparent;
          border: none;
          color: white;
          font-size: 2rem;
          font-weight: 800;
          outline: none;
          width: 100%;
          border-bottom: 2px solid transparent;
          transition: border-color 0.2s;
        }
        .sh-title-input:focus {
          border-bottom: 2px solid #a78bfa;
        }
        .sh-subtitle {
          margin: 4px 0 0 0;
          color: #9ca3af;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
        }

        .sh-save-btn {
          background: linear-gradient(135deg, #ec4899, #8b5cf6);
          border: none;
          color: white;
          padding: 14px 28px;
          border-radius: 14px;
          font-weight: 800;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(236, 72, 153, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .sh-save-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(236, 72, 153, 0.5);
        }

        .studio-timeline {
          position: relative;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .timeline-line {
          position: absolute;
          left: 106px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(255,255,255,0.1);
        }

        .slot-item {
          display: flex;
          align-items: center;
          gap: 24px;
          position: relative;
        }

        .slot-time {
          width: 70px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex-shrink: 0;
        }
        .st-start {
          font-size: 1.2rem;
          font-weight: 800;
          color: white;
        }
        .st-end {
          font-size: 0.9rem;
          color: #6b7280;
          font-weight: 600;
        }

        .slot-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #a78bfa;
          box-shadow: 0 0 10px #a78bfa;
          z-index: 2;
          flex-shrink: 0;
        }

        .slot-card {
          flex: 1;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 20px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .slot-card:hover {
          border-color: rgba(167, 139, 250, 0.4);
          background: rgba(167, 139, 250, 0.05);
          transform: translateX(4px);
        }

        .sc-thumb {
          width: 160px;
          height: 90px;
          background-size: cover;
          background-position: center;
          border-radius: 10px;
          position: relative;
          flex-shrink: 0;
        }
        .sc-duration {
          position: absolute;
          bottom: 6px;
          right: 6px;
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .sc-info {
          flex: 1;
        }
        .sc-info h3 {
          margin: 0 0 4px 0;
          font-size: 1.1rem;
          color: white;
        }
        .sc-channel {
          display: block;
          font-size: 0.85rem;
          color: #a78bfa;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .sc-desc {
          margin: 0;
          font-size: 0.85rem;
          color: #9ca3af;
        }

        .sc-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sc-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .sc-btn:hover { background: rgba(255,255,255,0.1); }
        .sc-swap:hover {
          background: rgba(167, 139, 250, 0.15);
          border-color: #a78bfa;
          color: #c084fc;
        }

        .add-slot-btn {
          margin-left: 130px;
          background: transparent;
          border: 2px dashed rgba(255,255,255,0.1);
          color: #9ca3af;
          padding: 16px;
          border-radius: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .add-slot-btn:hover {
          border-color: rgba(255,255,255,0.3);
          color: white;
        }

        /* MODAL CSS */
        .swap-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(5px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .swap-modal {
          background: #0f111a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 32px;
          width: 90%;
          max-width: 800px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        .swap-modal::-webkit-scrollbar { width: 8px; }
        .swap-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        
        .sm-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .sm-header h3 { margin: 0; font-size: 1.5rem; color: white; }
        .sm-close { background: none; border: none; color: #9ca3af; cursor: pointer; }
        .sm-close:hover { color: white; }
        .sm-desc { color: #9ca3af; margin-bottom: 24px; }

        .sm-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        .sm-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s;
        }
        .sm-card:hover {
          transform: translateY(-4px);
          border-color: #a78bfa;
        }
        .sm-card-thumb {
          height: 120px;
          background-size: cover;
          background-position: center;
        }
        .sm-card-info {
          padding: 12px;
        }
        .sm-card-info h4 { margin: 0 0 4px 0; font-size: 0.95rem; color: white; }
        .sm-card-info span { font-size: 0.8rem; color: #a78bfa; }

        @media (max-width: 768px) {
          .studio-page { padding: 16px; overflow-x: hidden; }
          .studio-header { flex-direction: column; align-items: stretch; gap: 16px; padding: 16px; }
          .sh-title-input { font-size: 1.5rem; }
          
          .studio-timeline { padding-left: 0; }
          .timeline-line { left: 16px; }
          
          .slot-item { flex-direction: column; align-items: flex-start; gap: 8px; padding-left: 40px; }
          .slot-time { position: absolute; left: 0; top: -20px; align-items: flex-start; flex-direction: row; gap: 8px; width: auto; }
          .st-start { font-size: 1rem; }
          
          .slot-dot { position: absolute; left: 10px; top: 20px; width: 12px; height: 12px; }
          
          .slot-card { width: 100%; flex-direction: column; align-items: stretch; padding: 12px; gap: 12px; }
          .sc-thumb { width: 100%; height: 180px; }
          
          .add-slot-btn { margin-left: 40px; margin-top: 10px; width: calc(100% - 40px); }
          
          .swap-modal { padding: 20px; width: 95%; }
          .sm-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
