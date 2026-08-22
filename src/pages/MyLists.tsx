import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Clock, Heart, Folder, Tv, Play } from 'lucide-react';
import { type UniversalChannel } from '../lib/universalChannels';
import { useStore } from '../store/useStore';

export default function MyLists() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'mis_listas' | 'guardadas'>('mis_listas');
  const [savedChannels, setSavedChannels] = useState<UniversalChannel[]>([]);
  const { setActiveChannel } = useStore();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('youapp_saved_custom_channels');
      if (saved) {
        setSavedChannels(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const handlePlayChannel = (channel: UniversalChannel) => {
    setActiveChannel(channel.id);
    navigate('/live');
  };

  return (
    <div className="my-lists-page">
      <header className="ml-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h2>Mis listas</h2>
        <button className="new-list-btn" onClick={() => navigate('/create-signal')}>
          <Plus size={16} /> Nueva señal
        </button>
      </header>

      <div className="ml-tabs">
        <button 
          className={`ml-tab ${activeTab === 'mis_listas' ? 'active' : ''}`}
          onClick={() => setActiveTab('mis_listas')}
        >
          Mis listas / Señales
        </button>
        <button 
          className={`ml-tab ${activeTab === 'guardadas' ? 'active' : ''}`}
          onClick={() => setActiveTab('guardadas')}
        >
          Guardadas
        </button>
      </div>

      <div className="ml-content">
        <div className="ml-list-item">
          <div className="ml-icon-box" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            <Clock size={24} />
          </div>
          <div className="ml-info">
            <h4>Ver más tarde</h4>
            <p>14 videos</p>
          </div>
          <ChevronLeft size={18} className="chevron-right" />
        </div>

        <div className="ml-list-item">
          <div className="ml-icon-box" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>
            <Heart size={24} />
          </div>
          <div className="ml-info">
            <h4>Favoritas</h4>
            <p>28 videos</p>
          </div>
          <ChevronLeft size={18} className="chevron-right" />
        </div>

        {/* Canales Creados por el Usuario */}
        {savedChannels.length > 0 && (
          <div className="ml-section-title">
            <h3>Tus Señales Creadas</h3>
          </div>
        )}

        {savedChannels.map((channel, index) => (
          <div key={index} className="ml-list-item" onClick={() => handlePlayChannel(channel)}>
            <div className="ml-icon-box" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' }}>
              <Tv size={24} />
            </div>
            <div className="ml-info">
              <h4>{channel.name}</h4>
              <p>Señal personalizada</p>
            </div>
            <button className="play-circle-btn">
              <Play size={16} fill="white" color="white" />
            </button>
          </div>
        ))}

        <div className="ml-section-title">
          <h3>Colecciones Temáticas</h3>
        </div>

        <div className="ml-list-item">
          <div className="ml-icon-box" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
            <Folder size={24} />
          </div>
          <div className="ml-info">
            <h4>Viajes & Mundo</h4>
            <p>19 videos</p>
          </div>
          <ChevronLeft size={18} className="chevron-right" />
        </div>

        <div className="ml-list-item">
          <div className="ml-icon-box" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <Folder size={24} />
          </div>
          <div className="ml-info">
            <h4>Documentales</h4>
            <p>36 videos</p>
          </div>
          <ChevronLeft size={18} className="chevron-right" />
        </div>
      </div>

      <style>{`
        .my-lists-page {
          min-height: 100vh;
          background: #050505;
          color: white;
          padding-bottom: 80px;
        }

        .ml-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
        }

        .ml-header h2 {
          font-size: 1.1rem;
          margin: 0;
          font-weight: 600;
        }

        .back-btn {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .new-list-btn {
          background: none;
          border: none;
          color: #a78bfa;
          font-size: 0.85rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }

        .ml-tabs {
          display: flex;
          padding: 0 20px;
          gap: 12px;
          margin-bottom: 24px;
        }

        .ml-tab {
          flex: 1;
          padding: 10px;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid transparent;
          color: #9ca3af;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ml-tab.active {
          background: rgba(167, 139, 250, 0.15);
          border-color: rgba(167, 139, 250, 0.4);
          color: #a78bfa;
        }

        .ml-content {
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ml-list-item {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 12px 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .ml-list-item:hover {
          background: rgba(255,255,255,0.08);
        }

        .ml-icon-box {
          width: 50px;
          height: 50px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .ml-info {
          flex: 1;
        }

        .ml-info h4 {
          margin: 0 0 4px 0;
          font-size: 1rem;
          font-weight: 600;
        }

        .ml-info p {
          margin: 0;
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .chevron-right {
          color: #6b7280;
          transform: rotate(180deg); /* Left to Right */
        }
        
        .play-circle-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a78bfa, #c084fc);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .ml-section-title h3 {
          font-size: 0.85rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Desktop Adjustments */
        @media (min-width: 1024px) {
          .my-lists-page {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0;
          }
          
          .ml-header {
            display: none; /* DesktopLayout already has a header */
          }

          .ml-tabs {
            padding: 24px 0;
            max-width: 600px;
          }
          
          .ml-tab {
            font-size: 1rem;
            padding: 12px;
          }

          .ml-content {
            padding: 0;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
          }

          .ml-section-title {
            grid-column: 1 / -1;
            margin-top: 24px;
            margin-bottom: 8px;
          }
          
          .ml-list-item {
            padding: 16px 20px;
            background: rgba(255,255,255,0.02);
          }
        }
      `}</style>
    </div>
  );
}
