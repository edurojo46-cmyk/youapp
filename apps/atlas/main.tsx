import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AtlasApp from './App.tsx';
import '../../src/index.css';
import './styles/atlas-theme.css';

if (typeof window !== 'undefined' && window.opener && window.location.pathname.startsWith('/broadcast/accounts')) {
  const params = new URLSearchParams(window.location.search);
  if (params.has('connected') || params.has('error')) {
    try {
      window.opener.postMessage({
        type: 'YOUAPP_OAUTH_POPUP_DONE',
        connected: params.get('connected'),
        error: params.get('error')
      }, '*');
    } catch {}
    window.close();
  }
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <BrowserRouter>
      <AtlasApp />
    </BrowserRouter>
  );
}
