import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Search, LayoutDashboard, Users, Building2, Target, Radio, MessagesSquare, FileSearch, ShieldAlert, Activity, UserCheck, LogIn, LogOut, Loader2, Database, Cpu, Package } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import './AdminTotal.css';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user, signOut } = useStore();
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleAdminQuickLogin = async () => {
    try {
      setLoggingIn(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: 'admin@youapp.com',
        password: 'AdminPassword123!'
      });
      if (error) throw error;
      window.location.reload();
    } catch (err) {
      console.error('Admin quick login error:', err);
      navigate('/login');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <Link to="/admin/atlas" className="admin-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Activity className="admin-logo-icon" size={28} />
          Atlas Admin
        </Link>
        
        <nav className="admin-nav">
          <NavLink to="/admin/atlas" end className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          <NavLink to="/admin/atlas/knowledge" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Database size={18} /> Knowledge Universe
          </NavLink>
          <NavLink to="/admin/atlas/factory" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Cpu size={18} /> Search Factory
          </NavLink>
          <NavLink to="/admin/atlas/persons" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Users size={18} /> Personas
          </NavLink>
          <NavLink to="/admin/atlas/companies" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Building2 size={18} /> Empresas
          </NavLink>
          <NavLink to="/admin/atlas/opportunities" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Target size={18} /> Oportunidades
          </NavLink>
          <NavLink to="/admin/atlas/signals" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Radio size={18} /> Señales
          </NavLink>
          <NavLink to="/admin/atlas/channels" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <MessagesSquare size={18} /> Canales
          </NavLink>
          <NavLink to="/admin/atlas/evidence" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <FileSearch size={18} /> Evidencia
          </NavLink>
          <NavLink to="/admin/atlas/reputation" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Activity size={18} /> Reputación Mail
          </NavLink>
          <NavLink to="/admin/atlas/system" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <ShieldAlert size={18} /> Sistema
          </NavLink>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="admin-content">
        <header className="admin-topbar">
          <div className="admin-search-container">
            <Search className="admin-search-icon" size={18} />
            <input 
              type="text" 
              className="admin-search-input" 
              placeholder="Buscar personas, empresas, señales..." 
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link
              to="/productos"
              id="admin-topbar-catalogo"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(37, 99, 235, 0.25)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                padding: '0.35rem 0.75rem',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Package size={14} /> Catálogo
            </Link>
            {user?.email ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.35rem 0.75rem', borderRadius: 6, fontSize: '0.8rem' }}>
                <UserCheck size={16} color="#10b981" />
                <span><strong>{user.email}</strong> <span style={{ color: 'var(--admin-text-muted)' }}>(Tenant: e518772b...)</span></span>
                <button
                  type="button"
                  onClick={() => signOut()}
                  title="Cerrar sesión"
                  style={{ background: 'none', border: 'none', color: 'var(--admin-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                id="admin-quick-login-btn"
                onClick={handleAdminQuickLogin}
                disabled={loggingIn}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(109, 40, 217, 0.2)', border: '1px solid var(--admin-accent)', color: '#fff', padding: '0.35rem 0.75rem', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {loggingIn ? <Loader2 className="admin-spin" size={14} /> : <LogIn size={14} />}
                <span>Conectar Sesión Admin</span>
              </button>
            )}

            <div className="admin-system-alert off">
              <div className="admin-pulse-dot"></div>
              EXTERNAL ACTIONS = OFF
            </div>
          </div>
        </header>

        <main className="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;

