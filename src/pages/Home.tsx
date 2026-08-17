import { Play, Radio, Tv, Sparkles, TrendingUp, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <header className="home-header">
        <h2 className="greeting">Buenos días, Eduardo.</h2>
        <h1 className="question">¿Qué querés mirar?</h1>
      </header>

      <main className="menu-grid">
        <button 
          className="menu-btn primary-action glass-card"
          onClick={() => navigate('/stream')}
        >
          <Play className="icon" size={32} />
          <span>MI STREAM</span>
        </button>

        <button 
          className="menu-btn live-action glass-card"
          onClick={() => navigate('/live')}
        >
          <Radio className="icon" size={32} />
          <span>EN VIVO</span>
        </button>

        <button 
          className="menu-btn secondary-action glass-card"
          onClick={() => navigate('/channels')}
        >
          <Tv className="icon" size={32} />
          <span>MIS CANALES</span>
        </button>

        <button 
          className="menu-btn magic-action glass-card"
          onClick={() => navigate('/search')}
        >
          <Search className="icon" size={32} />
          <span>BUSCAR Y PROGRAMAR</span>
        </button>

        <button 
          className="menu-btn trending-action glass-card"
          onClick={() => navigate('/mix')}
        >
          <Sparkles className="icon" size={32} />
          <span>MIX IA</span>
        </button>
      </main>

      <section className="continue-watching">
        <h3 className="section-title">Continuar viendo</h3>
        <div className="carousel">
          <div className="glass-card thumbnail">
            <span className="channel-tag">Historia</span>
            <p>La revolución de mayo</p>
          </div>
          <div className="glass-card thumbnail">
            <span className="channel-tag">Economía</span>
            <p>Resumen Semanal</p>
          </div>
        </div>
      </section>

      <style>{`
        .home-container {
          padding: var(--space-2xl) var(--space-lg);
          max-width: 600px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-2xl);
        }

        .home-header {
          text-align: center;
        }

        .greeting {
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 1.5rem;
          margin-bottom: var(--space-xs);
        }

        .question {
          font-size: 2.5rem;
          background: var(--text-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .menu-grid {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .menu-btn {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-lg);
          border: none;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 1.2rem;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
        }

        .primary-action {
          background: var(--accent-gradient);
          border-color: transparent;
        }

        .primary-action:hover {
          box-shadow: 0 8px 25px rgba(121, 40, 202, 0.5);
        }

        .live-action .icon { color: #ff3b30; }
        .secondary-action .icon { color: #34c759; }
        .magic-action .icon { color: #af52de; }
        .trending-action .icon { color: #ff9500; }

        .continue-watching {
          margin-top: var(--space-lg);
        }

        .section-title {
          font-size: 1.2rem;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }

        .carousel {
          display: flex;
          gap: var(--space-md);
          overflow-x: auto;
          padding-bottom: var(--space-sm);
        }

        .thumbnail {
          min-width: 200px;
          height: 120px;
          padding: var(--space-md);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          background: linear-gradient(to top, rgba(0,0,0,0.8), transparent), url('https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=400');
          background-size: cover;
          background-position: center;
          border-color: rgba(255,255,255,0.1);
        }

        .thumbnail:nth-child(2) {
          background: linear-gradient(to top, rgba(0,0,0,0.8), transparent), url('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=400');
          background-size: cover;
        }

        .channel-tag {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent-secondary);
          font-weight: 700;
          margin-bottom: 4px;
        }

        .thumbnail p {
          font-weight: 600;
          font-size: 1rem;
        }
      `}</style>
    </div>
  );
}
