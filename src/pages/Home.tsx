import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Tv, Grid, Radio, Plus, Play, Info, Video } from 'lucide-react';
import AddVideoModal from '../components/AddVideoModal';

export default function Home() {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="home-desktop-page">
      {/* Hero Banner */}
      <div className="hdt-hero-banner">
        <span className="hdt-hero-badge">SEÑAL DESTACADA</span>
        <h2 className="hdt-hero-title">El mundo<br/>que viene</h2>
        <p className="hdt-hero-desc">Una selección de los mejores análisis<br/>sobre tecnología, sociedad y el futuro.</p>
        
        <div className="hdt-hero-actions">
          <button className="hdt-btn-primary" onClick={() => navigate('/live')}>
            <Play size={18} fill="white" /> Ver señal
          </button>
          <button className="hdt-btn-outline" onClick={() => setShowAddModal(true)}>
            <Video size={16} /> Agregar Video
          </button>
        </div>
        
        <div className="hdt-hero-dots">
          <span className="dot active"></span>
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>

      {/* ¿Qué querés hacer? */}
      <section className="hdt-section">
        <h3 className="hdt-section-title">¿Qué querés hacer?</h3>
        <div className="hdt-actions-row">


          <div className="hdt-action-card" onClick={() => navigate('/my-algorithm')}>
            <div className="hdt-action-icon purple"><Tv size={22} /></div>
            <div className="hdt-action-text">
              <h4>Mi Algoritmo</h4>
              <p>Ajustá reglas<br/>y perfiles</p>
            </div>
          </div>

          <div className="hdt-action-card" onClick={() => navigate('/quad')}>
            <div className="hdt-action-icon orange"><Grid size={22} /></div>
            <div className="hdt-action-text">
              <h4>You4</h4>
              <p>Compará opiniones<br/>sobre un tema</p>
            </div>
          </div>

          <div className="hdt-action-card" onClick={() => navigate('/live')}>
            <div className="hdt-action-icon red"><Radio size={22} /></div>
            <div className="hdt-action-text">
              <h4>En vivo</h4>
              <p>Mirá transmisiones<br/>en directo</p>
            </div>
          </div>

          <div className="hdt-action-card" onClick={() => navigate('/create-signal')}>
            <div className="hdt-action-icon green"><Plus size={22} /></div>
            <div className="hdt-action-text">
              <h4>Estudio TV</h4>
              <p>Programar<br/>tu señal</p>
            </div>
          </div>

        </div>
      </section>

      {/* Señales para vos */}
      <section className="hdt-section">
        <div className="hdt-section-header">
          <h3 className="hdt-section-title">Señales para vos</h3>
          <span className="hdt-link" onClick={() => navigate('/search')}>Ver todas {'>'}</span>
        </div>
        <div className="hdt-carousel">
          
          <div className="hdt-signal-card" onClick={() => navigate('/live')}>
            <div className="hdt-signal-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&q=80')"}}>
              <span className="hdt-badge purple">NUEVA</span>
            </div>
            <div className="hdt-signal-info">
              <h4>Ciencia Sin Límites</h4>
              <div className="hdt-signal-meta"><span>12 videos</span><span>3:45:20</span></div>
            </div>
          </div>

          <div className="hdt-signal-card" onClick={() => navigate('/live')}>
            <div className="hdt-signal-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=400&q=80')"}}>
              <span className="hdt-badge orange">POPULAR</span>
            </div>
            <div className="hdt-signal-info">
              <h4>Historia Argentina</h4>
              <div className="hdt-signal-meta"><span>18 videos</span><span>5:22:10</span></div>
            </div>
          </div>

          <div className="hdt-signal-card" onClick={() => navigate('/live')}>
            <div className="hdt-signal-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1560415755-bd80d06eda60?w=400&q=80')"}}>
              <span className="hdt-badge green">RECOMENDADA</span>
            </div>
            <div className="hdt-signal-info">
              <h4>Innovadores</h4>
              <div className="hdt-signal-meta"><span>14 videos</span><span>4:10:33</span></div>
            </div>
          </div>

          <div className="hdt-signal-card" onClick={() => navigate('/live')}>
            <div className="hdt-signal-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80')"}}>
              <span className="hdt-badge blue">EN TENDENCIA</span>
            </div>
            <div className="hdt-signal-info">
              <h4>Naturaleza Extrema</h4>
              <div className="hdt-signal-meta"><span>9 videos</span><span>2:15:40</span></div>
            </div>
          </div>

          <div className="hdt-signal-card" onClick={() => navigate('/live')}>
            <div className="hdt-signal-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&q=80')"}}>
              <span className="hdt-badge purple">NUEVA</span>
            </div>
            <div className="hdt-signal-info">
              <h4>Psicología al Día</h4>
              <div className="hdt-signal-meta"><span>11 videos</span><span>2:40:15</span></div>
            </div>
          </div>

        </div>
      </section>

      {/* Continúa mirando */}
      <section className="hdt-section">
        <h3 className="hdt-section-title">Continúa mirando</h3>
        <div className="hdt-carousel">
          
          <div className="hdt-video-card">
            <div className="hdt-video-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=80')"}}>
              <span className="hdt-video-time">45:20</span>
              <div className="hdt-progress-bar"><div className="hdt-progress-fill" style={{width: '60%'}}></div></div>
            </div>
            <h4>La carrera espacial</h4>
            <p>Queda 15 min</p>
          </div>

          <div className="hdt-video-card">
            <div className="hdt-video-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1573164713988-8665fc963095?w=400&q=80')"}}>
              <span className="hdt-video-time">32:10</span>
              <div className="hdt-progress-bar"><div className="hdt-progress-fill" style={{width: '75%'}}></div></div>
            </div>
            <h4>Entrevista a Juan</h4>
            <p>Queda 8 min</p>
          </div>

          <div className="hdt-video-card">
            <div className="hdt-video-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400&q=80')"}}>
              <span className="hdt-video-time">1:05:30</span>
              <div className="hdt-progress-bar"><div className="hdt-progress-fill" style={{width: '40%'}}></div></div>
            </div>
            <h4>Roma: el imperio eterno</h4>
            <p>Queda 22 min</p>
          </div>

          <div className="hdt-video-card">
            <div className="hdt-video-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80')"}}>
              <span className="hdt-video-time">28:45</span>
              <div className="hdt-progress-bar"><div className="hdt-progress-fill" style={{width: '80%'}}></div></div>
            </div>
            <h4>Economía global 2024</h4>
            <p>Queda 10 min</p>
          </div>
          
          <div className="hdt-video-card">
            <div className="hdt-video-img" style={{backgroundImage: "url('https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=80')"}}>
              <span className="hdt-video-time">52:10</span>
              <div className="hdt-progress-bar"><div className="hdt-progress-fill" style={{width: '30%'}}></div></div>
            </div>
            <h4>Cambio climático</h4>
            <p>Queda 18 min</p>
          </div>

        </div>
      </section>

      <style>{`
        .home-desktop-page {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        /* Hero Banner */
        .hdt-hero-banner {
          position: relative;
          background: linear-gradient(90deg, rgba(5,5,5,1) 0%, rgba(5,5,5,0.4) 50%, rgba(5,5,5,0) 100%), 
                      url('https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1600&q=80') center/cover;
          border-radius: 20px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 380px;
          border: 1px solid rgba(139, 92, 246, 0.2);
          overflow: hidden;
        }

        .hdt-hero-badge {
          background: rgba(167, 139, 250, 0.2);
          color: #a78bfa;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 800;
          width: fit-content;
          margin-bottom: 20px;
          letter-spacing: 0.5px;
        }

        .hdt-hero-title {
          font-size: 3.5rem;
          font-weight: 800;
          line-height: 1.1;
          margin: 0 0 16px 0;
          text-shadow: 0 4px 20px rgba(0,0,0,0.8);
        }

        .hdt-hero-desc {
          font-size: 1.05rem;
          color: rgba(255,255,255,0.8);
          line-height: 1.5;
          margin: 0 0 32px 0;
        }

        .hdt-hero-actions {
          display: flex;
          gap: 16px;
        }

        .hdt-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #a78bfa;
          color: #050505;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .hdt-btn-primary:hover { transform: scale(1.05); }

        .hdt-btn-outline {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .hdt-btn-outline:hover { background: rgba(255,255,255,0.2); }

        .hdt-hero-dots {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
        }
        .hdt-hero-dots .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
        }
        .hdt-hero-dots .dot.active {
          background: #a78bfa;
          width: 24px;
          border-radius: 4px;
        }

        /* Sections */
        .hdt-section-title {
          font-size: 1.2rem;
          font-weight: 600;
          margin: 0 0 20px 0;
        }
        .hdt-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .hdt-section-header h3 { margin: 0; }
        .hdt-link { color: #a78bfa; font-size: 0.85rem; font-weight: 600; cursor: pointer; }

        /* Actions Row */
        .hdt-actions-row {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 8px;
        }
        .hdt-actions-row::-webkit-scrollbar { display: none; }

        .hdt-action-card {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: background 0.2s;
          flex: 1;
          min-width: 220px;
        }
        .hdt-action-card:hover { background: rgba(255,255,255,0.05); }

        .hdt-action-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
        .hdt-action-icon.blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-color: rgba(59,130,246,0.3); }
        .hdt-action-icon.purple { background: rgba(167, 139, 250, 0.15); color: #c084fc; border-color: rgba(167,139,250,0.3); }
        .hdt-action-icon.orange { background: rgba(249, 115, 22, 0.15); color: #fb923c; border-color: rgba(249,115,22,0.3); }
        .hdt-action-icon.red { background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
        .hdt-action-icon.green { background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16,185,129,0.3); }

        .hdt-action-text h4 { margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 600; line-height: 1.2; }
        .hdt-action-text p { margin: 0; font-size: 0.75rem; color: #9ca3af; line-height: 1.3; }

        /* Carousels */
        .hdt-carousel {
          display: flex;
          gap: 20px;
          overflow-x: auto;
          padding-bottom: 10px;
        }
        .hdt-carousel::-webkit-scrollbar { display: none; }

        /* Signal Card */
        .hdt-signal-card {
          min-width: 220px;
          cursor: pointer;
        }
        .hdt-signal-img {
          width: 100%;
          height: 140px;
          border-radius: 12px;
          background-size: cover;
          background-position: center;
          position: relative;
          margin-bottom: 12px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .hdt-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          font-size: 0.6rem;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 6px;
          color: white;
        }
        .hdt-badge.purple { background: #8b5cf6; }
        .hdt-badge.orange { background: #f59e0b; }
        .hdt-badge.green { background: #10b981; }
        .hdt-badge.blue { background: #3b82f6; }

        .hdt-signal-info h4 { margin: 0 0 6px 0; font-size: 1rem; font-weight: 600; }
        .hdt-signal-meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: #9ca3af; }

        /* Video Card */
        .hdt-video-card {
          min-width: 220px;
          cursor: pointer;
        }
        .hdt-video-img {
          width: 100%;
          height: 120px;
          border-radius: 12px;
          background-size: cover;
          background-position: center;
          position: relative;
          margin-bottom: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          overflow: hidden;
        }
        .hdt-video-time {
          position: absolute;
          bottom: 12px;
          right: 8px;
          background: rgba(0,0,0,0.8);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .hdt-progress-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(255,255,255,0.2);
        }
        .hdt-progress-fill {
          height: 100%;
          background: #ef4444;
        }
        .hdt-video-card h4 { margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 600; }
        .hdt-video-card p { margin: 0; font-size: 0.8rem; color: #9ca3af; }

        /* RESPONSIVE DESIGNS */
        @media (max-width: 1024px) {
          .home-desktop-page {
            gap: 24px;
          }

          .hdt-hero-banner {
            min-height: 280px;
            padding: 24px;
          }

          .hdt-hero-title {
            font-size: 2.2rem;
          }

          .hdt-hero-desc {
            font-size: 0.9rem;
            margin-bottom: 24px;
          }

          .hdt-hero-actions {
            flex-direction: column;
            gap: 12px;
          }

          .hdt-actions-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            overflow-x: visible;
          }

          .hdt-action-card {
            min-width: 0; /* Override the 200px min-width */
            padding: 12px;
            gap: 8px;
            flex-direction: column;
            text-align: center;
          }
          
          .hdt-action-icon {
            width: 44px;
            height: 44px;
            margin: 0 auto;
          }
          
          .hdt-action-text h4 {
            font-size: 0.9rem;
            margin-bottom: 2px;
          }

          .hdt-action-text p {
            display: none; /* Hide subtext on mobile to save space */
          }
          
          .hdt-action-icon {
            width: 40px;
            height: 40px;
          }
          
          .hdt-action-text h4 {
            font-size: 0.85rem;
          }

          .hdt-signal-card {
            min-width: 160px;
          }

          .hdt-video-card {
            min-width: 160px;
          }
          
          .hdt-video-img, .hdt-signal-img {
            height: 100px;
          }
        }
      `}</style>
      
      {showAddModal && (
        <AddVideoModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
