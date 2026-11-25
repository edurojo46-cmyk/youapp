import YouAppPublisherPage from './pages/YouAppPublisherPage.tsx';
import YouAppAssociationsPage from './pages/YouAppAssociationsPage.tsx';
import Login from '../../src/pages/Login.tsx';
/**
 * YOUAPP STREAMING PRODUCT ROUTES
 * @apps/youapp/routes.tsx
 * 
 * Independent multimedia and streaming product routes:
 * - Home streaming & recommendations
 * - Video Player & Player controls
 * - Live Zapping & TV Channels
 * - Channel Studio & Signal Creation
 * - Streaming Catalog & Explorer
 * - YouApp Exclusive Labs & Debuggers
 * 
 * STRICT ENGINE BOUNDARIES:
 * YouApp contains its own video ranking and streaming pipeline.
 * It is completely independent of Busca Industrial.
 */

import React, { useEffect, useState } from 'react';
import { Outlet, Route, useSearchParams, useLocation } from 'react-router-dom';
import Home from '../../src/pages/Home.tsx';
import { YouAppOfficialLogo } from '../../src/components/ui/YouAppOfficialLogo.tsx';
import YouAppSocialPresence from './pages/YouAppSocialPresence.tsx';
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

// Dashboard Route for YouApp (Sidebar + Content layout)
const DashboardRoute = ({ children }: { children: React.ReactNode }) => {
  return (
    <DesktopLayout>
      {children}
    </DesktopLayout>
  );
};

import YouAppSSOCallback from './pages/YouAppSSOCallback.tsx';
import { supabase } from '../../packages/auth/index.ts';
import { startSSOFlow } from '../../packages/auth/sso.ts';
import { getAtlasUrl, getCurrentProduct } from '../../packages/config/products.ts';

export const YouAppLayout: React.FC = () => {
  const isStandaloneYouApp = getCurrentProduct() === 'YOUAPP';
  const atlasReturnUrl = isStandaloneYouApp ? getAtlasUrl('/') : '/mi-base';
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [ssoAttempted, setSsoAttempted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.is_anonymous) {
        setUser({ id: session.user.id, email: session.user.email });
      } else {
        setUser(null);
        const isFromAtlas = searchParams.get('sso') === 'atlas';
        if (isFromAtlas && !ssoAttempted && location.pathname !== '/auth/callback') {
          setSsoAttempted(true);
          startSSOFlow('YOUAPP', location.pathname);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !session.user.is_anonymous) {
        setUser({ id: session.user.id, email: session.user.email });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [searchParams, location.pathname, ssoAttempted]);

  const handleManualSSO = () => {
    startSSOFlow('YOUAPP', location.pathname);
  };

  return (
    <div className="youapp-app">
      {/* Top Banner: Navigation back to Atlas Platform & SSO Status */}
      <nav style={{
        background: '#090d16',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        position: 'relative',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <YouAppOfficialLogo theme="dark" size="sm" />
          <span style={{ color: '#64748b' }}>|</span>
          <span style={{ color: '#94a3b8' }}>Streaming & Televisión</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span id="youapp-user-email" style={{
                color: '#ec4899',
                fontSize: '12px',
                fontWeight: 600,
                background: 'rgba(236, 72, 153, 0.1)',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(236, 72, 153, 0.25)'
              }}>
                SSO: {user.email || user.id.slice(0, 8)}
              </span>
            </div>
          ) : (
            <button
              id="btn-youapp-sso-login"
              onClick={handleManualSSO}
              style={{
                background: 'rgba(236, 72, 153, 0.15)',
                color: '#ec4899',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Conectar Atlas SSO
            </button>
          )}

          <a
            href={atlasReturnUrl}
            id="nav-return-atlas"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#93c5fd',
              textDecoration: 'none',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.1)',
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}
          >
            <span>Volver a Atlas Plataforma</span>
          </a>
        </div>
      </nav>
      <a href="/redes" style={{padding:"10px 24px",color:"#93c5fd",fontSize:13}}>Crear mi presencia en redes →</a>
      <Outlet />
    </div>
  );
};

export const renderYouAppRoutes = () => (
  <Route element={<YouAppLayout />}>
    <Route path="/redes" element={<YouAppSocialPresence />} />
    <Route path="/repetidoras" element={<YouAppAssociationsPage />} />
    <Route path="/asociaciones" element={<YouAppAssociationsPage />} />
    <Route path="/publicador" element={<YouAppPublisherPage />} />
    <Route path="/redes/acceso" element={<Login social />} />
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
  </Route>
);

export default renderYouAppRoutes;
