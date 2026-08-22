import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, Heart, Download, Settings, HelpCircle, LogOut } from 'lucide-react';
import BottomNav from '../components/BottomNav';

export default function ChannelProfile() {
  const navigate = useNavigate();

  return (
    <div className="profile-dark-page">
      <header className="pd-header">
        <div className="pd-user-info">
          <img 
            src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400&q=80" 
            alt="User Avatar" 
            className="pd-avatar"
          />
          <div className="pd-user-details">
            <h2>Eduardo</h2>
            <button className="pd-edit-btn">Editar perfil</button>
          </div>
        </div>
      </header>

      <div className="pd-stats-row">
        <div className="pd-stat-box">
          <span className="pd-stat-num">24</span>
          <span className="pd-stat-label">Listas</span>
        </div>
        <div className="pd-stat-box">
          <span className="pd-stat-num">136</span>
          <span className="pd-stat-label">Señales</span>
        </div>
        <div className="pd-stat-box">
          <span className="pd-stat-num">89</span>
          <span className="pd-stat-label">Guardados</span>
        </div>
      </div>

      <div className="pd-menu-list">
        <div className="pd-menu-item">
          <Activity size={20} className="pd-menu-icon" />
          <span>Mi actividad</span>
          <ChevronRight />
        </div>
        
        <div className="pd-menu-item" onClick={() => navigate('/my-lists')}>
          <Clock size={20} className="pd-menu-icon" />
          <span>Historial</span>
          <ChevronRight />
        </div>

        <div className="pd-menu-item" onClick={() => navigate('/my-lists')}>
          <Heart size={20} className="pd-menu-icon" />
          <span>Mis favoritos</span>
          <ChevronRight />
        </div>

        <div className="pd-menu-item">
          <Download size={20} className="pd-menu-icon" />
          <span>Descargas</span>
          <ChevronRight />
        </div>

        <div className="pd-menu-item">
          <Settings size={20} className="pd-menu-icon" />
          <span>Configuración</span>
          <ChevronRight />
        </div>

        <div className="pd-menu-item">
          <HelpCircle size={20} className="pd-menu-icon" />
          <span>Ayuda y soporte</span>
          <ChevronRight />
        </div>
      </div>

      <div className="pd-footer">
        <button className="pd-logout-btn" onClick={() => navigate('/login')}>
          Cerrar sesión
        </button>
      </div>

      <BottomNav />

      <style>{`
        .profile-dark-page {
          min-height: 100vh;
          background: #050505;
          color: white;
          padding-bottom: 90px;
        }

        .pd-header {
          padding: 24px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .pd-user-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .pd-avatar {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #a78bfa;
          padding: 2px;
        }

        .pd-user-details h2 {
          margin: 0 0 4px 0;
          font-size: 1.4rem;
          font-weight: 700;
        }

        .pd-edit-btn {
          background: none;
          border: none;
          color: #a78bfa;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0;
          cursor: pointer;
        }

        .pd-stats-row {
          display: flex;
          justify-content: space-around;
          padding: 24px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .pd-stat-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .pd-stat-num {
          font-size: 1.2rem;
          font-weight: 700;
          color: white;
        }

        .pd-stat-label {
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .pd-menu-list {
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .pd-menu-item {
          display: flex;
          align-items: center;
          padding: 16px 0;
          gap: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          cursor: pointer;
        }

        .pd-menu-item:last-child {
          border-bottom: none;
        }

        .pd-menu-icon {
          color: #9ca3af;
        }

        .pd-menu-item span {
          flex: 1;
          font-size: 0.95rem;
          color: #e5e7eb;
        }

        .pd-footer {
          padding: 24px 20px;
          display: flex;
          justify-content: center;
        }

        .pd-logout-btn {
          width: 100%;
          background: rgba(167, 139, 250, 0.1);
          border: 1px solid rgba(167, 139, 250, 0.3);
          color: #a78bfa;
          padding: 16px;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .pd-logout-btn:active {
          background: rgba(167, 139, 250, 0.2);
        }
      `}</style>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );
}
