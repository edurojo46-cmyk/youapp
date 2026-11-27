import YouAppPublisherPage from '../apps/youapp/pages/YouAppPublisherPage.tsx';
import YouAppAssociationsPage from '../apps/youapp/pages/YouAppAssociationsPage.tsx';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import SharedVideoLanding from './pages/SharedVideoLanding';
import YouAppSocialPresence from '../apps/youapp/pages/YouAppSocialPresence.tsx';
import MyStream from './pages/MyStream';
import LiveZapping from './pages/LiveZapping';
import MixChannel from './pages/MixChannel';
import SearchAndProgram from './pages/SearchAndProgram';
import ChannelSearch from './pages/ChannelSearch';
import { ToastHost } from './components/ui/ToastHost';
import { ModalHost } from './components/ui/ModalHost';
import ChannelProfile from './pages/ChannelProfile';
import SearchLab from './pages/SearchLab';
import Login from './pages/Login';
import PublicChannel from './pages/PublicChannel';
import EmbedChannel from './pages/EmbedChannel';
import MobileRemote from './pages/MobileRemote';
import MyAlgorithm from './pages/MyAlgorithm';
import CreateSignal from './pages/CreateSignal';
import ProgramarTV from './pages/ProgramarTV';
import MiSenal1 from './pages/MiSenal1';
import YouAppChannelPage from './pages/YouAppChannelPage';
import SignalAudioNewsPage from './pages/SignalAudioNewsPage';
import ArgentinaNewsPage from './pages/ArgentinaNewsPage';
import YouDialPage from './pages/YouDialPage';
import YouMusicPage from './pages/YouMusicPage';
import YouReelsPage from './pages/YouReelsPage';
import YouLecturasPage from './pages/YouLecturasPage';
import DigitalAntennaEmbed from './pages/DigitalAntennaEmbed';
import MyLists from './pages/MyLists';
import MyMoments from './pages/MyMoments';
import ShareTarget from './pages/ShareTarget';
import SeedManager from './pages/SeedManager';
import RankingTest from './pages/RankingTest';
import SearchTestLab from './pages/SearchTestLab';
import PipelineDebugger from './pages/PipelineDebugger';
import { ProviderIntelligence } from './components/telemetry/ProviderIntelligence';
import AiSummary from './pages/AiSummary';
import ControlCenter from './pages/ControlCenter';
import Player from './pages/Player';
import MiPlataforma from './pages/streaming/MiPlataforma';
import ExplorarStreaming from './pages/streaming/ExplorarStreaming';
import StreamingDetail from './pages/streaming/StreamingDetail';
import MercadoLibreCreatorHub from './pages/MercadoLibreCreatorHub';
import AtlasTimelinePilotPage from './pages/tools/AtlasTimelinePilotPage';
import AtlasMotionVoiceStudio from './pages/tools/AtlasMotionVoiceStudio';
import { useStore } from './store/useStore';
import DesktopLayout from './components/DesktopLayout';
import { MobileTopBar } from './components/ui/MobileTopBar';
import { GlobalMiniPlayer } from './components/player/GlobalMiniPlayer';
import { GlobalShareSheet } from './components/ui/GlobalShareSheet';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useStore();
  if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Strict Registered Account Route (for admin / internal seed tools)
const RegisteredOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useStore();
  if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
  if (!user || user.isAnonymous || !user.email) {
    return <Navigate to="/login" replace />;
  }
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

// Inicio de YOUAPP (Guest-First): cualquier visitante entra directo sin muro de login;
// si llega con ?v=<videoId>, abre ese video exacto; si entra a "/", abre Home vivo en 2 segundos.
const HomeOrSharedRoute = () => {
  const [searchParams] = useSearchParams();
  const hasSharedVideo = Boolean(searchParams.get('v'));

  if (hasSharedVideo) {
    return <SharedVideoLanding />;
  }
  return <Home />;
};

// Permite abrir Mi Señal sin login cuando un visitante llega desde un enlace compartido (?signal=...&sharedSignal=1 o &follow=1)
const MiSenalPublicOrProtectedRoute = () => {
  const [searchParams] = useSearchParams();
  const isPublicInvite =
    Boolean(searchParams.get('add')) ||
    (Boolean(searchParams.get('signal')) &&
      (searchParams.get('sharedSignal') === '1' || searchParams.get('follow') === '1'));
  if (isPublicInvite) {
    return <MiSenal1 />;
  }
  return (
    <ProtectedRoute>
      <MiSenal1 />
    </ProtectedRoute>
  );
};

// Permite abrir una programación compartida de MiTV (?shared=...) o agregar desde Share (?add=...) sin pedir login
const MiTvPublicOrProtectedRoute = () => {
  const [searchParams] = useSearchParams();
  const isPublicOrShareAdd = Boolean(searchParams.get('shared') || searchParams.get('add'));
  if (isPublicOrShareAdd) {
    return <ProgramarTV />;
  }
  return (
    <ProtectedRoute>
      <ProgramarTV />
    </ProtectedRoute>
  );
};

// Frame ligero con origen HTTPS real (youapptv.com) para Document Picture-in-Picture sin Error 153 de YouTube
const PipEmbedFrame = () => {
  const [searchParams] = useSearchParams();
  const provider = (searchParams.get('provider') || 'youtube').toLowerCase();
  const id = (searchParams.get('id') || '').trim();
  const embed = (searchParams.get('embed') || '').trim();

  const src =
    provider === 'vimeo' && id
      ? `https://player.vimeo.com/video/${encodeURIComponent(id.replace(/^vm_/, ''))}?autoplay=1&dnt=1`
      : (provider === 'peertube' || provider === 'odysee') && embed.startsWith('https://')
        ? embed
        : provider === 'archive' && id
          ? embed.startsWith('https://')
            ? embed
            : `https://archive.org/embed/${encodeURIComponent(id.replace(/^ar_/, ''))}?autoplay=1`
          : id
            ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
            : '';

  if (!src) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <iframe
        src={src}
        title="YOUAPP PiP"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};

function App() {
  const { initAuth } = useStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Interceptar URL compartida desde Web Share Target API SOLO si no estamos ya en /share (evita bucle infinito de recarga)
  useEffect(() => {
    if (window.location.pathname === '/share') return;
    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const sharedUrl = params.get('url') || params.get('text');
      if (sharedUrl && /https?:\/\//i.test(sharedUrl)) {
        window.location.replace(`/share${window.location.search}`);
      }
    }
  }, []);

  return (
    <div className="app-layout">
      <Routes>
        {/* PUBLIC MERCADO LIBRE CREATOR HUB (CANONICAL YOUTUBE PROFILE URL) */}
        <Route path="/recomendados" element={<MercadoLibreCreatorHub />} />
        <Route path="/productos-recomendados" element={<MercadoLibreCreatorHub />} />

        <Route path="/redes" element={<YouAppSocialPresence />} />
        <Route path="/repetidoras" element={<YouAppAssociationsPage />} />
        <Route path="/asociaciones" element={<YouAppAssociationsPage />} />
    <Route path="/publicador" element={<YouAppPublisherPage />} />
    <Route path="/redes/acceso" element={<Login social />} />
        <Route path="/login" element={<Login />} />
        {/* Rutas públicas para espectadores, control remoto y sitios web incrustados */}
        <Route path="/c/:idOrSlug" element={<PublicChannel />} />
        <Route path="/embed/:idOrSlug" element={<EmbedChannel />} />
        <Route path="/pip-frame" element={<PipEmbedFrame />} />
        <Route path="/antena/:signalId" element={<DigitalAntennaEmbed />} />
        <Route path="/remote" element={<MobileRemote />} />
        <Route path="/remote/:sessionId" element={<MobileRemote />} />
        <Route path="/r" element={<MobileRemote />} />
        <Route path="/r/:sessionId" element={<MobileRemote />} />

        <Route path="/" element={<HomeOrSharedRoute />} />
        <Route path="/you4" element={<ProtectedRoute><LiveZapping forceQuad={true} /></ProtectedRoute>} />
        <Route path="/quad" element={<ProtectedRoute><LiveZapping forceQuad={true} /></ProtectedRoute>} />
        <Route path="/stream" element={<ProtectedRoute><MyStream /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><LiveZapping /></ProtectedRoute>} />
        <Route path="/channels" element={<ChannelProfile />} />
        <Route path="/perfil" element={<ChannelProfile />} />
        <Route path="/favorites" element={<MyLists />} />
        <Route path="/search" element={<ChannelSearch />} />
        <Route path="/my-algorithm" element={<MyAlgorithm />} />
        <Route path="/create-signal" element={<ProtectedRoute><CreateSignal /></ProtectedRoute>} />
        {/* Nueva Capa Multiplataforma (Streaming MVP V1) */}
        <Route path="/mi-plataforma" element={<ProtectedRoute><MiPlataforma /></ProtectedRoute>} />
        <Route path="/explorar" element={<ProtectedRoute><ExplorarStreaming /></ProtectedRoute>} />
        <Route path="/streaming/:type/:id" element={<ProtectedRoute><StreamingDetail /></ProtectedRoute>} />
        
        {/* MiTV (antes Programar TV) - Sin DesktopLayout para barra superior limpia */}
        <Route path="/mitv" element={<MiTvPublicOrProtectedRoute />} />
        <Route path="/tv" element={<MiTvPublicOrProtectedRoute />} />
        <Route path="/programartv" element={<Navigate to="/mitv" replace />} />
        <Route path="/misenal1" element={<MiSenalPublicOrProtectedRoute />} />
        <Route path="/misenal-medios" element={<ProtectedRoute><SignalAudioNewsPage /></ProtectedRoute>} />
        <Route path="/diarios" element={<ProtectedRoute><ArgentinaNewsPage /></ProtectedRoute>} />
        <Route path="/dial" element={<YouDialPage />} />
        <Route path="/youmusic" element={<YouMusicPage />} />
        <Route path="/music" element={<YouMusicPage />} />
        <Route path="/reels" element={<YouReelsPage />} />
        <Route path="/lecturas" element={<YouLecturasPage />} />
        <Route path="/canal/:channelSlug" element={<ProtectedRoute><YouAppChannelPage /></ProtectedRoute>} />
        <Route path="/my-lists" element={<MyLists />} />
        {/* Nueva Ruta de Momentos */}
        <Route path="/moments" element={<DashboardRoute><MyMoments /></DashboardRoute>} />
        <Route path="/channels-search" element={<ChannelSearch />} />
        <Route path="/program" element={<DashboardRoute><SearchAndProgram /></DashboardRoute>} />
        <Route path="/player" element={<ProtectedRoute><Player /></ProtectedRoute>} />
        <Route path="/trending" element={<DashboardRoute><div style={{padding:'2rem'}}>Tendencias (Próximamente)</div></DashboardRoute>} />
        
        {/* Herramienta de Laboratorio para evaluar el Search Engine */}
        <Route path="/lab/search" element={<DashboardRoute><SearchLab /></DashboardRoute>} />
        <Route path="/lab/ranking" element={<DashboardRoute><RankingTest /></DashboardRoute>} />
        <Route path="/lab/search-test" element={<SearchTestLab />} />
        <Route path="/lab/pipeline" element={<PipelineDebugger />} />
        <Route path="/lab/intelligence" element={<ProviderIntelligence />} />
        
        {/* Herramienta Interna de Ingestión */}
        <Route path="/seed-manager" element={<RegisteredOnlyRoute><DesktopLayout><SeedManager /></DesktopLayout></RegisteredOnlyRoute>} />
        
        {/* Panel de Control de Cuota / Admin */}
        <Route path="/admin/control-center" element={<RegisteredOnlyRoute><DesktopLayout><ControlCenter /></DesktopLayout></RegisteredOnlyRoute>} />
        
        {/* Nueva página Resumen IA */}
        <Route path="/ai-summary/:id" element={<ProtectedRoute><AiSummary /></ProtectedRoute>} />
        
        {/* Ruta para capturar enlaces compartidos (abierta para invitados y registrados, sin flicker) */}
        <Route path="/share" element={<ShareTarget />} />

        {/* Isolated Timeline Pilot */}
        <Route path="/tools/timeline-pilot" element={<AtlasTimelinePilotPage />} />
        <Route path="/timeline-pilot" element={<AtlasTimelinePilotPage />} />
        {/* Cinematic Motion & Piper Voice Studio */}
        <Route path="/tools/motion-voice" element={<AtlasMotionVoiceStudio />} />
        <Route path="/tools/voice-library" element={<AtlasMotionVoiceStudio />} />
        <Route path="/motion-voice" element={<AtlasMotionVoiceStudio />} />
      </Routes>

      <style>{`
        .app-layout {
          height: 100vh;
          width: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          background: radial-gradient(circle at 50% 0%, var(--bg-secondary), var(--bg-primary) 70%);
        }
      `}</style>
      
      <MobileTopBar />
      <GlobalMiniPlayer />
      <GlobalShareSheet />
      <ToastHost />
      <ModalHost />
    </div>
  );
}

export default App;
