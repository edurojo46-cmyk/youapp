import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import MyStream from './pages/MyStream';
import LiveZapping from './pages/LiveZapping';
import MixChannel from './pages/MixChannel';
import SearchAndProgram from './pages/SearchAndProgram';
import ChannelSearch from './pages/ChannelSearch';
import ChannelProfile from './pages/ChannelProfile';
import Login from './pages/Login';
import PublicChannel from './pages/PublicChannel';
import EmbedChannel from './pages/EmbedChannel';
import MobileRemote from './pages/MobileRemote';
import { useStore } from './store/useStore';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useStore();
  if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  const { initAuth } = useStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <div className="app-layout">
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Rutas públicas para espectadores, control remoto y sitios web incrustados */}
        <Route path="/c/:idOrSlug" element={<PublicChannel />} />
        <Route path="/embed/:idOrSlug" element={<EmbedChannel />} />
        <Route path="/remote" element={<MobileRemote />} />
        <Route path="/remote/:sessionId" element={<MobileRemote />} />

        
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/stream" element={<ProtectedRoute><MyStream /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><LiveZapping /></ProtectedRoute>} />
        <Route path="/channels" element={<ProtectedRoute><ChannelProfile /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><ChannelSearch /></ProtectedRoute>} />
        <Route path="/channels-search" element={<ProtectedRoute><ChannelSearch /></ProtectedRoute>} />
        <Route path="/program" element={<ProtectedRoute><SearchAndProgram /></ProtectedRoute>} />
        <Route path="/trending" element={<ProtectedRoute><div style={{padding:'2rem'}}>Tendencias (Próximamente)</div></ProtectedRoute>} />
      </Routes>

      <style>{`
        .app-layout {
          min-height: 100vh;
          width: 100%;
          background: radial-gradient(circle at 50% 0%, var(--bg-secondary), var(--bg-primary) 70%);
        }
      `}</style>
    </div>
  );
}

export default App;
