import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import MyStream from './pages/MyStream';
import LiveZapping from './pages/LiveZapping';
import MixChannel from './pages/MixChannel';
import SearchAndProgram from './pages/SearchAndProgram';
import ChannelSearch from './pages/ChannelSearch';
import ChannelProfile from './pages/ChannelProfile';
import SearchLab from './pages/SearchLab';
import Login from './pages/Login';
import PublicChannel from './pages/PublicChannel';
import EmbedChannel from './pages/EmbedChannel';
import MobileRemote from './pages/MobileRemote';
import MyAlgorithm from './pages/MyAlgorithm';
import CreateSignal from './pages/CreateSignal';
import MyLists from './pages/MyLists';
import MyMoments from './pages/MyMoments';
import ShareTarget from './pages/ShareTarget';
import { useStore } from './store/useStore';

import DesktopLayout from './components/DesktopLayout';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useStore();
  if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Dashboard Route (Includes Left & Right Sidebar)
const DashboardRoute = ({ children }: { children: React.ReactNode }) => {
  return (
    <ProtectedRoute>
      <DesktopLayout>
        {children}
      </DesktopLayout>
    </ProtectedRoute>
  );
};

function App() {
  const { initAuth } = useStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Interceptar URL compartida desde Web Share Target API
  useEffect(() => {
    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const sharedUrl = params.get('url') || params.get('text');
      if (sharedUrl) {
        // Redirigir a la ruta interna de share manteniendo los params
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "#/share" + window.location.search;
        window.history.replaceState(null, '', newUrl);
        window.location.reload(); // Forzar recarga limpia en el HashRouter
      }
    }
  }, []);

  return (
    <div className="app-layout">
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Rutas públicas para espectadores, control remoto y sitios web incrustados */}
        <Route path="/c/:idOrSlug" element={<PublicChannel />} />
        <Route path="/embed/:idOrSlug" element={<EmbedChannel />} />
        <Route path="/remote" element={<MobileRemote />} />
        <Route path="/remote/:sessionId" element={<MobileRemote />} />

        
        <Route path="/" element={<DashboardRoute><Home /></DashboardRoute>} />
        <Route path="/you4" element={<ProtectedRoute><LiveZapping forceQuad={true} /></ProtectedRoute>} />
        <Route path="/quad" element={<ProtectedRoute><LiveZapping forceQuad={true} /></ProtectedRoute>} />
        <Route path="/stream" element={<ProtectedRoute><MyStream /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><LiveZapping /></ProtectedRoute>} />
        <Route path="/channels" element={<DashboardRoute><ChannelProfile /></DashboardRoute>} />
        <Route path="/search" element={<DashboardRoute><ChannelSearch /></DashboardRoute>} />
        <Route path="/my-algorithm" element={<DashboardRoute><MyAlgorithm /></DashboardRoute>} />
        <Route path="/create-signal" element={<DashboardRoute><CreateSignal /></DashboardRoute>} />
        <Route path="/my-lists" element={<DashboardRoute><MyLists /></DashboardRoute>} />
        {/* Nueva Ruta de Momentos */}
        <Route path="/moments" element={<DashboardRoute><MyMoments /></DashboardRoute>} />
        <Route path="/channels-search" element={<DashboardRoute><ChannelSearch /></DashboardRoute>} />
        <Route path="/program" element={<DashboardRoute><SearchAndProgram /></DashboardRoute>} />
        <Route path="/trending" element={<DashboardRoute><div style={{padding:'2rem'}}>Tendencias (Próximamente)</div></DashboardRoute>} />
        
        {/* Herramienta de Laboratorio para evaluar el Search Engine */}
        <Route path="/lab/search" element={<DashboardRoute><SearchLab /></DashboardRoute>} />
        
        {/* Ruta para capturar enlaces compartidos */}
        <Route path="/share" element={<ProtectedRoute><ShareTarget /></ProtectedRoute>} />
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
