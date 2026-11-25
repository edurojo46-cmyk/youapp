import { useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, Film, Home, Radio, Search } from 'lucide-react';

const HIDDEN_PREFIXES = ['/login', '/embed/', '/antena/', '/remote', '/tools/', '/timeline-pilot', '/motion-voice'];

export function MobileBottomBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const tabs = [
    { id: 'home', label: 'Inicio', path: '/', icon: Home, match: (p: string) => p === '/' },
    { id: 'search', label: 'Buscar', path: '/search', icon: Search, match: (p: string) => p.startsWith('/search') || p.startsWith('/channels-search') },
    { id: 'signal', label: 'Mi Señal', path: '/misenal1', icon: Radio, match: (p: string) => p.startsWith('/misenal1') || p.startsWith('/mitv') },
    { id: 'reels', label: 'Reels', path: '/reels', icon: Film, match: (p: string) => p.startsWith('/reels') },
    { id: 'lists', label: 'Listas', path: '/my-lists', icon: Bookmark, match: (p: string) => p.startsWith('/my-lists') || p.startsWith('/favorites') }
  ];

  return (
    <>
      <nav className="ymbb-bar" aria-label="Navegación móvil rápida">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <button
              key={tab.id}
              type="button"
              className={`ymbb-btn ${active ? 'active' : ''}`}
              onClick={() => navigate(tab.path)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .ymbb-bar {
          display: none;
        }
        @media (max-width: 768px) {
          .ymbb-bar {
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: max(10px, env(safe-area-inset-bottom));
            z-index: 95;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            align-items: center;
            padding: 6px 6px;
            border-radius: 22px;
            background: rgba(16, 18, 24, 0.84);
            backdrop-filter: saturate(180%) blur(24px);
            -webkit-backdrop-filter: saturate(180%) blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.16);
          }
          .ymbb-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            padding: 6px 2px;
            border: none;
            border-radius: 14px;
            background: transparent;
            color: rgba(245, 245, 247, 0.68);
            font-size: 10px;
            font-weight: 650;
            letter-spacing: 0.02em;
            cursor: pointer;
            transition: color 0.15s ease, background 0.15s ease;
          }
          .ymbb-btn.active {
            color: #64d2ff;
            background: rgba(100, 210, 255, 0.14);
          }
        }
      `}</style>
    </>
  );
}
