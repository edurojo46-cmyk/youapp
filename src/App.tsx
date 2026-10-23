import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ToastHost } from './components/ui/ToastHost';
import { ModalHost } from './components/ui/ModalHost';
import { useAtlasAuthStore } from './store/atlas/atlasAuthStore';
import { renderAtlasRoutes } from './routes/AtlasRoutes';
import { renderIndustrialRoutes } from './routes/IndustrialRoutes';
import { renderYouAppRoutes } from './routes/YouAppRoutes';
import MercadoLibreCreatorHub from './pages/MercadoLibreCreatorHub';

function App() {
  const { initAuth } = useAtlasAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Interceptar URL compartida desde Web Share Target API
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
    <div className="app-root">
      <Routes>
        {/* PUBLIC MERCADO LIBRE CREATOR HUB (CANONICAL YOUTUBE PROFILE URL) */}
        <Route path="/recomendados" element={<MercadoLibreCreatorHub />} />
        <Route path="/productos-recomendados" element={<MercadoLibreCreatorHub />} />

        {/* 1. ATLAS PLATFORM BOUNDARY */}
        {renderAtlasRoutes()}

        {/* 2. BUSCA INDUSTRIAL VERTICAL BOUNDARY */}
        {renderIndustrialRoutes()}

        {/* 3. YOUAPP STREAMING PRODUCT BOUNDARY */}
        {renderYouAppRoutes()}
      </Routes>

      <ToastHost />
      <ModalHost />
    </div>
  );
}

export default App;
