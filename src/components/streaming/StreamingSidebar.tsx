import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Compass, Bookmark, Radio, Settings, ChevronDown, Layers } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const StreamingSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useStore();

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="mp-sidebar-left">
      <div>
        <div className="mp-logo" onClick={() => navigate('/mi-plataforma')} style={{ cursor: 'pointer' }}>
          <span>YOU</span>
          <span className="mp-logo-badge">APP</span>
        </div>

        <nav>
          <ul className="mp-nav-list">
            <li>
              <button
                className={`mp-nav-item ${isActive('/mi-plataforma') ? 'active' : ''}`}
                onClick={() => navigate('/mi-plataforma')}
              >
                <Layers size={18} />
                <span>Mi Plataforma</span>
              </button>
            </li>
            <li>
              <button
                className={`mp-nav-item ${isActive('/explorar') ? 'active' : ''}`}
                onClick={() => navigate('/explorar')}
              >
                <Compass size={18} />
                <span>Explorar</span>
              </button>
            </li>
            <li>
              <button
                className={`mp-nav-item ${isActive('/') ? 'active' : ''}`}
                onClick={() => navigate('/')}
              >
                <Home size={18} />
                <span>Inicio TV</span>
              </button>
            </li>
            <li>
              <button
                className={`mp-nav-item ${isActive('/search') ? 'active' : ''}`}
                onClick={() => navigate('/search')}
              >
                <Search size={18} />
                <span>Buscar</span>
              </button>
            </li>
            <li>
              <button
                className={`mp-nav-item ${isActive('/my-lists') ? 'active' : ''}`}
                onClick={() => navigate('/my-lists')}
              >
                <Bookmark size={18} />
                <span>Mi lista</span>
              </button>
            </li>
            <li>
              <button
                className={`mp-nav-item ${isActive('/programartv') ? 'active' : ''}`}
                onClick={() => navigate('/programartv')}
              >
                <Radio size={18} />
                <span>Señal</span>
              </button>
            </li>
            <li>
              <button
                className={`mp-nav-item ${isActive('/settings') ? 'active' : ''}`}
                onClick={() => navigate('/settings')}
              >
                <Settings size={18} />
                <span>Configuración</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* User Profile Footer */}
      <div className="mp-user-profile" onClick={() => navigate('/profile')}>
        <img
          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"
          alt={user?.email || 'Mariano'}
          className="mp-user-avatar"
        />
        <div className="mp-user-info">
          <div className="mp-user-name">{user?.email?.split('@')[0] || 'Mariano'}</div>
          <div className="mp-user-sub">
            <span>Ver perfil</span>
            <ChevronDown size={12} />
          </div>
        </div>
      </div>
    </aside>
  );
};
