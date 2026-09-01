import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, Search, List, Radio, User } from 'lucide-react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <footer className="youapp-bottom-nav">
        <button className={`nav-item ${isActive('/') ? 'active' : ''}`} onClick={() => navigate('/')}>
          <HomeIcon size={20} />
          <span>Inicio</span>
        </button>

        <button className={`nav-item ${isActive('/search') ? 'active' : ''}`} onClick={() => navigate('/search')}>
          <Search size={20} />
          <span>Buscar</span>
        </button>

        {/* Botón Central Flotante Neón (En Vivo) */}
        <button className="center-fab-launcher" onClick={() => navigate('/live')} title="TV en vivo">
          <div className="fab-glow-core">
            <Radio size={22} fill="white" color="white" />
          </div>
        </button>

        <button className={`nav-item ${isActive('/my-lists') ? 'active' : ''}`} onClick={() => navigate('/my-lists')}>
          <List size={20} />
          <span>Mis Listas</span>
        </button>

        <button className={`nav-item ${isActive('/channels') ? 'active' : ''}`} onClick={() => navigate('/channels')}>
          <User size={20} />
          <span>Perfil</span>
        </button>
      </footer>

      <style>{`
        .youapp-bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          max-width: 480px;
          margin: 0 auto;
          height: 68px;
          background: rgba(5, 5, 5, 0.95);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          justify-items: center;
          align-items: center;
          padding: 0;
          z-index: 99;
        }

        .nav-item {
          background: none;
          border: none;
          color: #6b7280;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 0.65rem;
          font-weight: 600;
          cursor: pointer;
          transition: color 0.2s;
        }

        .nav-item:hover, .nav-item.active {
          color: #a78bfa;
        }

        .center-fab-launcher {
          position: relative;
          top: -16px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a78bfa, #c084fc);
          border: 4px solid #050505;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(167, 139, 250, 0.5);
          transition: transform 0.2s;
        }

        .center-fab-launcher:active {
          transform: scale(0.92);
        }

        .fab-glow-core {
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </>
  );
}
