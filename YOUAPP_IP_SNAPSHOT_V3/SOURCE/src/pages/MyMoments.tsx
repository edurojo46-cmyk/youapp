import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, type SavedMoment } from '../store/useStore';
import { Search, FolderPlus, Play, Trash2, ArrowRight } from 'lucide-react';

export default function MyMoments() {
  const navigate = useNavigate();
  const { savedMoments, removeMoment } = useStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Todos');

  const tabs = ['Todos', 'IA', 'Economía', 'Historia', 'Favoritos'];

  const filteredMoments = savedMoments.filter(m => {
    if (activeTab !== 'Todos' && !m.tags.includes(activeTab)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.aiTitle.toLowerCase().includes(q) ||
        m.aiSummary.toLowerCase().includes(q) ||
        m.videoTitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getDurationStr = (start: number, end: number) => {
    const diff = end - start;
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}:${s.toString().padStart(2, '0')} min`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  return (
    <div className="moments-page fade-in">
      
      {/* HEADER SECTION */}
      <div className="moments-header">
        <div className="mh-titles">
          <h2>Mis Momentos</h2>
          <p>Tu memoria audiovisual inteligente.</p>
        </div>
        <button className="mh-create-btn">
          <Play size={16} fill="white" /> Crear señal con momentos
        </button>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="moments-search-section">
        <div className="ms-input-box">
          <Search size={20} className="ms-icon" />
          <input 
            type="text" 
            placeholder="¿Dónde hablaban de empleos que desaparecerán por IA?" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ms-tabs">
          {tabs.map(t => (
            <button 
              key={t}
              className={`ms-tab ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
          <button className="ms-tab-add"><FolderPlus size={16} /> Nueva</button>
        </div>
      </div>

      {/* RESULTS HEADER */}
      <div className="moments-results-header">
        <span>{filteredMoments.length} momentos encontrados</span>
      </div>

      {/* MOMENTS LIST */}
      <div className="moments-list">
        {filteredMoments.length === 0 ? (
          <div className="empty-state">
            <p>No se encontraron momentos.</p>
          </div>
        ) : (
          filteredMoments.map(moment => (
            <div key={moment.id} className="moment-card">
              
              <div className="mc-left">
                <div 
                  className="mc-thumbnail" 
                  style={{ backgroundImage: `url(${moment.thumbnailUrl})` }}
                >
                  <div className="mc-play-overlay">
                    <Play size={24} fill="white" />
                  </div>
                </div>
                <div className="mc-speaker">
                  {moment.speaker && <span>{moment.speaker}</span>}
                </div>
              </div>

              <div className="mc-content">
                <div className="mc-header">
                  <h3>{moment.aiTitle}</h3>
                  <button className="mc-delete-btn" onClick={() => removeMoment(moment.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="mc-meta">
                  <span className="mc-video-title">{moment.videoTitle}</span>
                  <span className="mc-date">{formatDate(moment.createdAt)}</span>
                </div>
                
                <div className="mc-time-info">
                  <div className="mc-time-range">
                    {formatTime(moment.startConceptualTime)} <ArrowRight size={12} /> {formatTime(moment.endConceptualTime)}
                  </div>
                  <span className="mc-duration">({getDurationStr(moment.startConceptualTime, moment.endConceptualTime)})</span>
                </div>

                <p className="mc-summary">{moment.aiSummary}</p>

                <div className="mc-tags">
                  {moment.tags.map(t => (
                    <span key={t} className="mc-tag">{t}</span>
                  ))}
                </div>
              </div>

            </div>
          ))
        )}
      </div>

      <style>{`
        .moments-page {
          padding: 24px;
          max-width: 1000px;
          margin: 0 auto;
        }

        .fade-in {
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .moments-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 32px;
        }

        .mh-titles h2 {
          font-size: 2rem;
          font-weight: 800;
          margin: 0 0 8px 0;
          color: white;
        }
        .mh-titles p {
          color: #a78bfa;
          margin: 0;
          font-weight: 600;
        }

        .mh-create-btn {
          background: linear-gradient(135deg, #a78bfa, #c084fc);
          color: #050505;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .mh-create-btn:hover {
          transform: translateY(-2px);
        }

        .moments-search-section {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 32px;
        }

        .ms-input-box {
          position: relative;
          margin-bottom: 24px;
        }
        .ms-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }
        .ms-input-box input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 16px 16px 16px 48px;
          color: white;
          font-size: 1.1rem;
          transition: all 0.2s;
        }
        .ms-input-box input:focus {
          outline: none;
          border-color: #a78bfa;
          background: rgba(167, 139, 250, 0.05);
        }

        .ms-tabs {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ms-tab {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #d1d5db;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ms-tab:hover { background: rgba(255,255,255,0.1); }
        .ms-tab.active {
          background: rgba(167, 139, 250, 0.15);
          border-color: #a78bfa;
          color: #c084fc;
        }
        .ms-tab-add {
          background: transparent;
          border: 1px dashed rgba(255,255,255,0.2);
          color: #9ca3af;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .ms-tab-add:hover { border-color: white; color: white; }

        .moments-results-header {
          font-size: 0.9rem;
          color: #9ca3af;
          margin-bottom: 16px;
        }

        .moments-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .moment-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          gap: 24px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .moment-card:hover {
          border-color: rgba(167, 139, 250, 0.4);
          transform: translateY(-2px);
          background: rgba(167, 139, 250, 0.02);
        }

        .mc-left {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 200px;
          flex-shrink: 0;
        }

        .mc-thumbnail {
          width: 100%;
          aspect-ratio: 16/9;
          background-size: cover;
          background-position: center;
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .mc-play-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
          border-radius: 12px;
        }
        .mc-thumbnail:hover .mc-play-overlay { opacity: 1; }

        .mc-speaker {
          font-size: 0.8rem;
          color: #a78bfa;
          font-weight: 600;
          display: flex;
          justify-content: center;
        }

        .mc-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .mc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .mc-header h3 {
          margin: 0;
          font-size: 1.25rem;
          color: white;
        }
        .mc-delete-btn {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          transition: color 0.2s;
        }
        .mc-delete-btn:hover { color: #ef4444; }

        .mc-meta {
          display: flex;
          gap: 12px;
          font-size: 0.85rem;
          color: #9ca3af;
          margin-bottom: 12px;
        }

        .mc-time-info {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.05);
          padding: 6px 12px;
          border-radius: 8px;
          width: fit-content;
          margin-bottom: 16px;
        }
        .mc-time-range {
          font-family: monospace;
          color: #a78bfa;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mc-duration {
          color: #9ca3af;
          font-size: 0.8rem;
        }

        .mc-summary {
          font-size: 0.95rem;
          color: #d1d5db;
          line-height: 1.5;
          margin: 0 0 16px 0;
          flex: 1;
        }

        .mc-tags {
          display: flex;
          gap: 8px;
        }
        .mc-tag {
          background: rgba(255,255,255,0.08);
          color: #e5e7eb;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .moments-header {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .moment-card {
            flex-direction: column;
          }
          .mc-left {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
