/**
 * ATLAS PLATFORM CORE ROUTES
 * @apps/atlas/routes.tsx
 * 
 * Central platform routes for Atlas Core:
 * - Hub Atlas / Navigation
 * - Auth (Login / Registro)
 * - Perfil & Empresa
 * - Mi Base (Canonical Atlas CRM)
 * - Atlas Search Shell (Personas, Contactos, Organizaciones)
 * - Admin Atlas Control Suite
 * - Atlas Front Communication Layer (9 Sections + Global Shell + Shared Context)
 */

import React from 'react';
import { Outlet, Route, Navigate } from 'react-router-dom';
import { AtlasSharedProvider } from './context/AtlasSharedContext.tsx';
import { AtlasGlobalShell } from './components/AtlasGlobalShell.tsx';

import Login from '../../src/pages/Login.tsx';
import Perfil from '../../src/pages/Perfil.tsx';
import MiBase from '../../src/pages/MiBase.tsx';
import AtlasSearchAppShell from '../../src/pages/search/AtlasSearchAppShell.tsx';
import AtlasRealEmailIntelligenceExplorer from '../../src/pages/search/AtlasRealEmailIntelligenceExplorer.tsx';
import ProtectedRoute from '../../src/components/auth/ProtectedRoute.tsx';

import AdminLayout from '../../src/pages/admin/atlas/AdminLayout.tsx';
import AdminDashboard from '../../src/pages/admin/atlas/AdminDashboard.tsx';
import AdminPersons from '../../src/pages/admin/atlas/AdminPersons.tsx';
import AdminCompanies from '../../src/pages/admin/atlas/AdminCompanies.tsx';
import AdminOpportunities from '../../src/pages/admin/atlas/AdminOpportunities.tsx';
import AdminSignals from '../../src/pages/admin/atlas/AdminSignals.tsx';
import AdminChannels from '../../src/pages/admin/atlas/AdminChannels.tsx';
import AdminEvidence from '../../src/pages/admin/atlas/AdminEvidence.tsx';
import AdminSystem from '../../src/pages/admin/atlas/AdminSystem.tsx';
import AdminReputation from '../../src/pages/admin/atlas/AdminReputation.tsx';
import AdminKnowledgeUniverse from '../../src/pages/admin/atlas/AdminKnowledgeUniverse.tsx';
import AdminSearchFactory from '../../src/pages/admin/atlas/AdminSearchFactory.tsx';
import AtlasSSOGateway from './pages/AtlasSSOGateway.tsx';
import BuscaIndustrial from '../../src/pages/BuscaIndustrial.tsx';
import BuscaIndustrialResultados from '../../src/pages/BuscaIndustrialResultados.tsx';
import AtlasLocalCaballito from '../../src/pages/local/AtlasLocalCaballito.tsx';
import AtlasLocalDeepLanding from '../../src/pages/local/AtlasLocalDeepLanding.tsx';
import AtlasLocalMiBarrio from '../../src/pages/local/AtlasLocalMiBarrio.tsx';
import AtlasLocalMiComunidad from '../../src/pages/local/AtlasLocalMiComunidad.tsx';

// 9 Atlas Broadcast Core Modules
import Atlas3MControlCenterPage from './pages/Atlas3MControlCenterPage.tsx';
import AtlasBroadcastAccountsPage from './pages/AtlasBroadcastAccountsPage.tsx';
import AtlasCampaignsPage from './pages/AtlasCampaignsPage.tsx';
import AtlasAudienceMapPage from './pages/AtlasAudienceMapPage.tsx';
import AtlasWarmAudiencePage from './pages/AtlasWarmAudiencePage.tsx';
import AtlasViralityPage from './pages/AtlasViralityPage.tsx';
import AtlasReleasePage from './pages/AtlasReleasePage.tsx';
import AtlasMetrics3MPage from './pages/AtlasMetrics3MPage.tsx';
import AtlasSettingsPage from './pages/AtlasSettingsPage.tsx';
import AtlasTeslaBroadcastPage from './pages/AtlasTeslaBroadcastPage.tsx';
import AtlasContentLibraryPage from './pages/AtlasContentLibraryPage.tsx';
import AtlasNatureAssetsPage from './pages/AtlasNatureAssetsPage.tsx';
import EmotiveReviewLab from '../../src/pages/EmotiveReviewLab.tsx';
import AtlasImageDiscoveryPage from '../../src/pages/tools/AtlasImageDiscoveryPage.tsx';
import AtlasCtaLinkPage from '../../src/pages/tools/AtlasCtaLinkPage.tsx';
import MercadoLibreCreatorHub from '../../src/pages/MercadoLibreCreatorHub.tsx';

export const AtlasLayout: React.FC = () => {
  return (
    <AtlasSharedProvider>
      <AtlasGlobalShell>
        <div className="atlas-app" style={{ minHeight: '100%', backgroundColor: '#07090e', color: '#f1f3f7', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <Outlet />
        </div>
      </AtlasGlobalShell>
    </AtlasSharedProvider>
  );
};

export const renderAtlasRoutes = () => (
  <Route element={<AtlasLayout />}>
    <Route path="/buscaindustrial" element={<BuscaIndustrial />} />
    <Route path="/buscar" element={<BuscaIndustrial />} />
    <Route path="/buscaindustrial/resultados" element={<BuscaIndustrialResultados />} />
    <Route path="/buscaindustrial/productos" element={<Navigate to="/buscaindustrial/resultados" replace />} />
    <Route path="/productos" element={<Navigate to="/buscaindustrial/resultados" replace />} />
    <Route path="/productos/catalogo" element={<Navigate to="/buscaindustrial/resultados" replace />} />
    <Route path="/sso/authorize" element={<AtlasSSOGateway />} />
    <Route path="/login" element={<Login />} />
    <Route path="/registro" element={<Login />} />
    <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
    
    {/* Mi Base (Canonical Atlas CRM) */}
    <Route path="/mi-base" element={<MiBase />} />
    <Route path="/mibase" element={<Navigate to="/mi-base" replace />} />

    {/* Atlas Local (Phase AL-1: Caballito Canary) */}
    <Route path="/local" element={<Navigate to="/local/caballito" replace />} />
    <Route path="/local/caballito" element={<AtlasLocalCaballito />} />
    <Route path="/local/caballito/comercios" element={<Navigate to="/local/caballito?tab=COMERCIOS" replace />} />
    <Route path="/local/caballito/ofertas" element={<Navigate to="/local/caballito?tab=OFERTAS" replace />} />
    <Route path="/local/mi-barrio" element={<AtlasLocalMiBarrio />} />
    <Route path="/local/mi-comunidad" element={<AtlasLocalMiComunidad />} />
    <Route path="/local/:barrioId/oferta/:id" element={<AtlasLocalDeepLanding />} />
    <Route path="/local/:barrioId/comercio/:id" element={<AtlasLocalDeepLanding />} />
    <Route path="/local/:barrioId/oportunidad/:id" element={<AtlasLocalDeepLanding />} />
    <Route path="/local/:barrioId/:contentType/:id" element={<AtlasLocalDeepLanding />} />

    {/* Atlas Search Federated Shell */}
    <Route path="/search/contactos/emails" element={<AtlasRealEmailIntelligenceExplorer />} />
    <Route path="/search/:domainId" element={<AtlasSearchAppShell />} />

    {/* ─── 9 ATLAS CORE BROADCAST MODULES ─── */}

    {/* 1. CONTROL CENTER */}
    <Route path="/broadcast/control-center" element={<Atlas3MControlCenterPage />} />
    <Route path="/control-center" element={<Atlas3MControlCenterPage />} />

    {/* 2. CUENTAS */}
    <Route path="/broadcast/accounts" element={<AtlasBroadcastAccountsPage />} />
    <Route path="/cuentas" element={<AtlasBroadcastAccountsPage />} />
    <Route path="/cuentas-difusion" element={<AtlasBroadcastAccountsPage />} />

    {/* 3. CAMPAÑAS */}
    <Route path="/broadcast/campaigns" element={<AtlasCampaignsPage />} />
    <Route path="/campaigns" element={<AtlasCampaignsPage />} />
    <Route path="/broadcast" element={<AtlasCampaignsPage />} />
    <Route path="/tesla-broadcast" element={<AtlasTeslaBroadcastPage />} />

    {/* 4. AUDIENCIA */}
    <Route path="/audience" element={<AtlasAudienceMapPage />} />
    <Route path="/audiencia" element={<AtlasAudienceMapPage />} />
    <Route path="/audience-map" element={<AtlasAudienceMapPage />} />

    {/* 5. WARM AUDIENCE */}
    <Route path="/broadcast/warm-audience" element={<AtlasWarmAudiencePage />} />
    <Route path="/warm-audience" element={<AtlasWarmAudiencePage />} />
    <Route path="/audience/warm" element={<AtlasWarmAudiencePage />} />

    {/* 6. VIRALIDAD */}
    <Route path="/broadcast/virality" element={<AtlasViralityPage />} />
    <Route path="/viralidad" element={<AtlasViralityPage />} />
    <Route path="/virality" element={<AtlasViralityPage />} />

    {/* 7. RELEASE */}
    <Route path="/broadcast/release" element={<AtlasReleasePage />} />
    <Route path="/release" element={<AtlasReleasePage />} />

    {/* CONTENIDOS / CONTENT PREVIEW LIBRARY */}
    <Route path="/broadcast/content-library" element={<AtlasContentLibraryPage />} />
    <Route path="/content-library" element={<AtlasContentLibraryPage />} />
    <Route path="/broadcast/contenidos" element={<AtlasContentLibraryPage />} />
    <Route path="/contenidos" element={<AtlasContentLibraryPage />} />

    {/* NATURALEZA / NATURE ASSET BANK */}
    <Route path="/broadcast/nature-assets" element={<AtlasNatureAssetsPage />} />
    <Route path="/nature-assets" element={<AtlasNatureAssetsPage />} />
    <Route path="/broadcast/naturaleza" element={<AtlasNatureAssetsPage />} />
    <Route path="/naturaleza" element={<AtlasNatureAssetsPage />} />

    {/* EMOTIVE CONTENT PREVIEWS (PILOT V1 HUMAN REVIEW) */}
    <Route path="/broadcast/emotive-previews" element={<EmotiveReviewLab />} />
    <Route path="/emotive-previews" element={<EmotiveReviewLab />} />
    <Route path="/emotive-lab" element={<EmotiveReviewLab />} />

    {/* 8. MÉTRICAS 3M */}
    <Route path="/broadcast/metrics-3m" element={<AtlasMetrics3MPage />} />
    <Route path="/metricas-3m" element={<AtlasMetrics3MPage />} />
    <Route path="/metrics-3m" element={<AtlasMetrics3MPage />} />

    {/* 9. CONFIGURACIÓN */}
    <Route path="/broadcast/settings" element={<AtlasSettingsPage />} />
    <Route path="/settings" element={<AtlasSettingsPage />} />
    <Route path="/configuracion" element={<AtlasSettingsPage />} />

    {/* HERRAMIENTAS SECUNDARIAS / IMAGE DISCOVERY & CTA LINK */}
    <Route path="/tools/image-discovery" element={<AtlasImageDiscoveryPage />} />
    <Route path="/buscar-imagenes" element={<AtlasImageDiscoveryPage />} />
    <Route path="/tools/cta-link" element={<AtlasCtaLinkPage />} />
    <Route path="/links-publicacion" element={<AtlasCtaLinkPage />} />
    <Route path="/recomendados" element={<MercadoLibreCreatorHub />} />
    <Route path="/productos-recomendados" element={<MercadoLibreCreatorHub />} />

    {/* Atlas Admin Control Suite */}
    <Route path="/admin/atlas" element={<ProtectedRoute><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/knowledge" element={<ProtectedRoute><AdminLayout><AdminKnowledgeUniverse /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/persons" element={<ProtectedRoute><AdminLayout><AdminPersons /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/companies" element={<ProtectedRoute><AdminLayout><AdminCompanies /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/opportunities" element={<ProtectedRoute><AdminLayout><AdminOpportunities /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/signals" element={<ProtectedRoute><AdminLayout><AdminSignals /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/channels" element={<ProtectedRoute><AdminLayout><AdminChannels /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/evidence" element={<ProtectedRoute><AdminLayout><AdminEvidence /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/reputation" element={<ProtectedRoute><AdminLayout><AdminReputation /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/system" element={<ProtectedRoute><AdminLayout><AdminSystem /></AdminLayout></ProtectedRoute>} />
    <Route path="/admin/atlas/factory" element={<ProtectedRoute><AdminLayout><AdminSearchFactory /></AdminLayout></ProtectedRoute>} />
  </Route>
);

export default renderAtlasRoutes;
