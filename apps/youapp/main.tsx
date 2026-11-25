import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import YouAppApp from './App.tsx';
import '../../src/index.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <BrowserRouter>
      <YouAppApp />
    </BrowserRouter>
  );
}
