import YouAppPublisherPage from './pages/YouAppPublisherPage.tsx';
import Login from '../../src/pages/Login.tsx';
import YouAppSocialPresence from './pages/YouAppSocialPresence.tsx';
import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastHost } from '../../src/components/ui/ToastHost.tsx';
import { ModalHost } from '../../src/components/ui/ModalHost.tsx';
import { YouAppLayout } from './routes.tsx';
import Home from '../../src/pages/Home.tsx';
import MyStream from '../../src/pages/MyStream.tsx';
import LiveZapping from '../../src/pages/LiveZapping.tsx';
import ChannelProfile from '../../src/pages/ChannelProfile.tsx';
import ChannelSearch from '../../src/pages/ChannelSearch.tsx';
import MyAlgorithm from '../../src/pages/MyAlgorithm.tsx';
import CreateSignal from '../../src/pages/CreateSignal.tsx';
import ProgramarTV from '../../src/pages/ProgramarTV.tsx';
import MiSenal1 from '../../src/pages/MiSenal1.tsx';
import MyLists from '../../src/pages/MyLists.tsx';
import MyMoments from '../../src/pages/MyMoments.tsx';
import SearchAndProgram from '../../src/pages/SearchAndProgram.tsx';
import Player from '../../src/pages/Player.tsx';
import PublicChannel from '../../src/pages/PublicChannel.tsx';
import EmbedChannel from '../../src/pages/EmbedChannel.tsx';
import MobileRemote from '../../src/pages/MobileRemote.tsx';
import ShareTarget from '../../src/pages/ShareTarget.tsx';
import SearchLab from '../../src/pages/SearchLab.tsx';
import RankingTest from '../../src/pages/RankingTest.tsx';
import SearchTestLab from '../../src/pages/SearchTestLab.tsx';
import PipelineDebugger from '../../src/pages/PipelineDebugger.tsx';
import SeedManager from '../../src/pages/SeedManager.tsx';
import ControlCenter from '../../src/pages/ControlCenter.tsx';
import AiSummary from '../../src/pages/AiSummary.tsx';
import MiPlataforma from '../../src/pages/streaming/MiPlataforma.tsx';
import ExplorarStreaming from '../../src/pages/streaming/ExplorarStreaming.tsx';
import StreamingDetail from '../../src/pages/streaming/StreamingDetail.tsx';
import DesktopLayout from '../../src/components/DesktopLayout.tsx';
import { ProviderIntelligence } from '../../src/components/telemetry/ProviderIntelligence.tsx';
import ProtectedRoute from '../../src/components/auth/ProtectedRoute.tsx';

const DashboardRoute = ({ children }: { children: React.ReactNode }) => {
  return (
    <DesktopLayout>
      {children}
    </DesktopLayout>
  );
};

import YouAppSSOCallback from './pages/YouAppSSOCallback.tsx';

export function YouAppApp() {
  // Web Share Target interceptor
  useEffect(() => {
    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const sharedUrl = params.get('url') || params.get('text');
      if (sharedUrl) {
        const newUrl = window.location.protocol + "//" + window.location.host + "/share" + window.location.search;
        window.history.replaceState(null, '', newUrl);
        window.location.reload();
      }
    }
  }, []);

  return (
    <div className="youapp-standalone-root">
      <Routes>
        <Route path="/redes" element={<YouAppSocialPresence />} />
    <Route path="/publicador" element={<YouAppPublisherPage />} />
    <Route path="/redes/acceso" element={<Login social />} />
        <Route element={<YouAppLayout />}>
          {/* SSO Callback */}
          <Route path="/auth/callback" element={<YouAppSSOCallback />} />

          <Route path="/" element={<DashboardRoute><Home /></DashboardRoute>} />
          <Route path="/you4" element={<ProtectedRoute><LiveZapping forceQuad={true} /></ProtectedRoute>} />
          <Route path="/quad" element={<ProtectedRoute><LiveZapping forceQuad={true} /></ProtectedRoute>} />
          <Route path="/stream" element={<ProtectedRoute><MyStream /></ProtectedRoute>} />
          <Route path="/live" element={<ProtectedRoute><LiveZapping /></ProtectedRoute>} />
          <Route path="/channels" element={<DashboardRoute><ChannelProfile /></DashboardRoute>} />
          <Route path="/search" element={<DashboardRoute><ChannelSearch /></DashboardRoute>} />
          <Route path="/my-algorithm" element={<DashboardRoute><MyAlgorithm /></DashboardRoute>} />
          <Route path="/create-signal" element={<DashboardRoute><CreateSignal /></DashboardRoute>} />
          
          {/* Streaming Layer */}
          <Route path="/mi-plataforma" element={<ProtectedRoute><MiPlataforma /></ProtectedRoute>} />
          <Route path="/explorar" element={<ProtectedRoute><ExplorarStreaming /></ProtectedRoute>} />
          <Route path="/streaming/:type/:id" element={<ProtectedRoute><StreamingDetail /></ProtectedRoute>} />
          
          {/* MiTV (antes Programar TV) */}
          <Route path="/mitv" element={<ProtectedRoute><ProgramarTV /></ProtectedRoute>} />
          <Route path="/programartv" element={<ProtectedRoute><ProgramarTV /></ProtectedRoute>} />
          <Route path="/misenal1" element={<ProtectedRoute><MiSenal1 /></ProtectedRoute>} />
          <Route path="/my-lists" element={<DashboardRoute><MyLists /></DashboardRoute>} />
          <Route path="/moments" element={<DashboardRoute><MyMoments /></DashboardRoute>} />
          <Route path="/channels-search" element={<DashboardRoute><ChannelSearch /></DashboardRoute>} />
          <Route path="/program" element={<DashboardRoute><SearchAndProgram /></DashboardRoute>} />
          <Route path="/player" element={<ProtectedRoute><Player /></ProtectedRoute>} />
          <Route path="/trending" element={<DashboardRoute><div style={{ padding: '2rem' }}>Tendencias (Próximamente)</div></DashboardRoute>} />
          
          {/* Search Lab & Intelligence */}
          <Route path="/lab/search" element={<DashboardRoute><SearchLab /></DashboardRoute>} />
          <Route path="/lab/ranking" element={<DashboardRoute><RankingTest /></DashboardRoute>} />
          <Route path="/lab/search-test" element={<SearchTestLab />} />
          <Route path="/lab/pipeline" element={<PipelineDebugger />} />
          <Route path="/lab/intelligence" element={<ProviderIntelligence />} />
          
          {/* Admin & Ingestion Tools */}
          <Route path="/seed-manager" element={<DashboardRoute><SeedManager /></DashboardRoute>} />
          <Route path="/admin/control-center" element={<DashboardRoute><ControlCenter /></DashboardRoute>} />
          
          {/* AI Summary */}
          <Route path="/ai-summary/:id" element={<ProtectedRoute><AiSummary /></ProtectedRoute>} />

          {/* Public & Embed Channels */}
          <Route path="/c/:idOrSlug" element={<PublicChannel />} />
          <Route path="/embed/:idOrSlug" element={<EmbedChannel />} />
          <Route path="/remote" element={<MobileRemote />} />
          <Route path="/remote/:sessionId" element={<MobileRemote />} />
          <Route path="/share" element={<ProtectedRoute><ShareTarget /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      <ToastHost />
      <ModalHost />
    </div>
  );
}

export default YouAppApp;
