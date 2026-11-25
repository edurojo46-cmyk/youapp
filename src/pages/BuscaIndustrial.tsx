import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import IndustrialGlobalHeader from '../components/IndustrialGlobalHeader';
import IndustrialDiscoveryModal from '../components/industrial/IndustrialDiscoveryModal';
import './BuscaIndustrial.css';

const QUICK_SEARCHES = [
  'Válvulas industriales',
  'Motores eléctricos',
  'Sensores de presión',
  'Acero inoxidable',
  'Proveedores en México',
];

const STATS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    value: '12,4 M+',
    label: 'Productos indexados',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
    value: '38.600+',
    label: 'Proveedores verificados',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    value: '2,1 M+',
    label: 'Fichas técnicas',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    value: '195',
    label: 'Fuentes globales',
  },
];

export default function BuscaIndustrial() {
  const [query, setQuery] = useState('');
  const [geography, setGeography] = useState('ARG_CABA');
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'ATLAS' | 'DISCOVERY'>('ATLAS');
  const [activeMissionSnippet, setActiveMissionSnippet] = useState<{ id: string; certified: number; target: number; status: string } | null>(null);
  const [missionResults, setMissionResults] = useState<any[]>([]);
  const [apiResultsCount, setApiResultsCount] = useState<number>(0);
  const [showResultsList, setShowResultsList] = useState<boolean>(false);
  const [knownMissionId, setKnownMissionId] = useState<string | null>(null);
  const [isMissionRunning, setIsMissionRunning] = useState<boolean>(false);
  const navigate = useNavigate();

  // Fast decoupled results polling: Directly query /api/industrial/missions/:missionId/results
  useEffect(() => {
    if (!knownMissionId) return;
    let isMounted = true;
    let inFlight = false;

    async function fetchResultsDirect() {
      if (inFlight || !isMounted || !knownMissionId) return;
      inFlight = true;
      try {
        const resultsRes = await fetch(`/api/industrial/missions/${encodeURIComponent(knownMissionId)}/results?limit=50`);
        if (resultsRes.ok && isMounted) {
          const rData = await resultsRes.json();
          const rows = Array.isArray(rData.results) ? rData.results : [];
          const count = rData.totalCount !== undefined ? rData.totalCount : rows.length;

          setApiResultsCount(count);
          setMissionResults(rows);
          if (rows.length > 0) {
            setShowResultsList(true);
          }
        }
      } catch (_) {
        // silent
      } finally {
        inFlight = false;
      }
    }

    // Fetch immediately upon knowing missionId
    fetchResultsDirect();

    // Adaptive reasonable polling: only poll while running, otherwise idle (10000ms)
    if (!isMissionRunning) return;
    const interval = setInterval(fetchResultsDirect, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [knownMissionId, isMissionRunning]);

  // Decoupled status check for mission lifecycle and metadata (adaptive interval)
  useEffect(() => {
    let isMounted = true;
    async function checkMissionStatus() {
      try {
        let mission: any = null;

        // If missionId is already known, query it directly to avoid unnecessary sequential /active requests
        if (knownMissionId) {
          const res = await fetch(`/api/industrial/missions/${encodeURIComponent(knownMissionId)}`);
          if (res.ok) {
            const data = await res.json();
            mission = data.mission;
          }
        }

        if (!mission) {
          const res = await fetch('/api/industrial/missions/active');
          if (res.ok) {
            const data = await res.json();
            mission = data.mission;
          }
        }

        if (!mission || mission.status === 'READY') {
          const listRes = await fetch('/api/industrial/missions');
          if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.missions && listData.missions.length > 0) {
              const activeOrLatest = listData.missions.find((m: any) => m.status !== 'READY') || listData.missions[0];
              if (activeOrLatest) mission = activeOrLatest;
            }
          }
        }

        if (isMounted && mission) {
          if (mission.mission_id !== knownMissionId) {
            setKnownMissionId(mission.mission_id);
          }
          const running = mission.status === 'RUNNING' || mission.status === 'STARTING' || mission.status === 'WAITING_NEXT_GENERATION';
          setIsMissionRunning(running);
          setActiveMissionSnippet({
            id: mission.mission_id,
            certified: mission.certified_new_searchable || 0,
            target: mission.target_new_records || 1000,
            status: mission.status
          });
        }
      } catch (e) {
        // silent
      }
    }

    checkMissionStatus();
    // Adaptive interval: 8s if running, 20s if idle/finished
    const interval = setInterval(checkMissionStatus, isMissionRunning ? 8000 : 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [knownMissionId, isMissionRunning]);

  const handleSearch = () => {
    if (query.trim()) {
      const mid = activeMissionSnippet?.id ? `&mission_id=${encodeURIComponent(activeMissionSnippet.id)}` : '';
      navigate(`/buscaindustrial/resultados?q=${encodeURIComponent(query.trim())}&geo=${encodeURIComponent(geography)}${mid}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="bi-root">
      {/* Background — silky wave image */}
      <div className="bi-bg" />

      {/* Navbar */}
      <IndustrialGlobalHeader />

      {/* Hero */}
      <main className="bi-hero">
        <p className="bi-eyebrow">INTELIGENCIA PARA LA INDUSTRIA</p>

        <h1 className="bi-heading">
          Buscador <span className="bi-heading-accent">Industrial</span>
        </h1>

        <p className="bi-subheading">
          Encuentra productos, proveedores, especificaciones y conocimiento<br />
          en toda la industria, en un solo lugar.
        </p>

        {/* Distinct Two Modes Pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
          <div style={{
            display: 'inline-flex',
            background: 'rgba(255, 255, 255, 0.12)',
            padding: '4px',
            borderRadius: '24px',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <button
              onClick={() => setActiveMode('ATLAS')}
              style={{
                background: activeMode === 'ATLAS' ? '#ffffff' : 'transparent',
                color: activeMode === 'ATLAS' ? '#0f172a' : '#ffffff',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🔍</span> Buscar en Atlas
            </button>
            <button
              id="bi-ampliar-base-tab"
              onClick={() => {
                setActiveMode('DISCOVERY');
                setIsDiscoveryOpen(true);
              }}
              style={{
                background: activeMode === 'DISCOVERY' ? '#2563eb' : 'transparent',
                color: '#ffffff',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>⚡</span> Ampliar Atlas Core
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="bi-search-wrapper">
          <div className="bi-search-bar">
            <svg className="bi-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              id="bi-search-input"
              type="text"
              className="bi-search-input"
              placeholder="Busca productos, proveedores, normas, catálogos..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <select
              id="bi-geography-select"
              value={geography}
              onChange={e => setGeography(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: '16px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
                marginRight: '8px'
              }}
            >
              <option value="ARG_CABA" style={{ background: '#0f172a', color: '#fff' }}>CABA</option>
              <option value="ARG_NACIONAL" style={{ background: '#0f172a', color: '#fff' }}>Argentina</option>
              <option value="ARG_BUENOS_AIRES" style={{ background: '#0f172a', color: '#fff' }}>Buenos Aires</option>
              <option value="ARG_CORDOBA" style={{ background: '#0f172a', color: '#fff' }}>Córdoba</option>
              <option value="ARG_SANTA_FE" style={{ background: '#0f172a', color: '#fff' }}>Santa Fe</option>
              <option value="ARG_MENDOZA" style={{ background: '#0f172a', color: '#fff' }}>Mendoza</option>
            </select>
            <button className="bi-mic-btn" aria-label="Buscar por voz">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={20} height={20}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>
            <button
              className="bi-buscar-btn"
              onClick={handleSearch}
              id="bi-buscar-btn"
            >
              Buscar
            </button>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={() => navigate('/productos')}
            style={{ padding: '10px 22px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '24px', cursor: 'pointer', fontSize: '14px', backdropFilter: 'blur(10px)', transition: 'all 0.2s', fontWeight: 500 }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            Explorar catálogo industrial
          </button>

          <button
            id="bi-ampliar-base-btn"
            onClick={() => setIsDiscoveryOpen(true)}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.9) 0%, rgba(29, 78, 216, 0.9) 100%)',
              border: '1px solid rgba(96, 165, 250, 0.4)',
              color: 'white',
              borderRadius: '24px',
              cursor: 'pointer',
              fontSize: '14px',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <span>⚡</span> Ampliar Atlas Core (Adquisición Persistente)
          </button>
        </div>

        {/* Ver Resultados & Mission Banner */}
        {apiResultsCount > 0 && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              id="bi-btn-ver-resultados"
              className="bi-btn-ver-resultados"
              onClick={() => setShowResultsList(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                border: '1px solid rgba(52, 211, 153, 0.5)',
                borderRadius: '24px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                transition: 'all 0.2s ease'
              }}
            >
              <span>🔍</span> Ver resultados ({apiResultsCount.toLocaleString('es-AR')})
            </button>
            {activeMissionSnippet && (
              <button
                onClick={() => setIsDiscoveryOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  borderRadius: '24px',
                  color: '#60a5fa',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
              >
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                Misión: {activeMissionSnippet.certified.toLocaleString('es-AR')} certificados ({activeMissionSnippet.status})
              </button>
            )}
          </div>
        )}

        {/* Embedded Scrollable Results List */}
        {showResultsList && missionResults.length > 0 && (
          <div 
            id="bi-results-container" 
            className="bi-results-container"
            style={{
              width: '100%',
              maxWidth: '920px',
              margin: '24px auto',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(20px)',
              zIndex: 10
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px' }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>
                  Resultados Certificados en Atlas Core ({missionResults.length.toLocaleString('es-AR')})
                </h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Total en API: {apiResultsCount.toLocaleString('es-AR')} · Misión: {activeMissionSnippet?.id || 'Actual'}
                </span>
              </div>
              <button
                onClick={() => setShowResultsList(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            <div 
              id="bi-results-list" 
              className="bi-results-list" 
              style={{
                maxHeight: '480px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '6px',
                scrollbarWidth: 'thin',
                scrollbarColor: '#3b82f6 rgba(30, 41, 59, 0.5)'
              }}
            >
              {missionResults.map((r, idx) => (
                <div 
                  key={r.id || idx} 
                  id={`bi-result-item-${idx}`} 
                  className="bi-result-card bi-result-item"
                  style={{
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'left'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
                      {idx + 1}. {r.COMPANY_NAME || r.name || 'Establecimiento'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                      📍 {r.CITY || r.PROVINCE ? `${r.CITY || ''}, ${r.PROVINCE || ''}` : (r.ADDRESS || 'Argentina')}
                      {r.ADDRESS ? ` (${r.ADDRESS})` : ''}
                      {r.TAX_ID ? ` · CUIT: ${r.TAX_ID}` : ''}
                      {r.CATEGORY ? ` · ${r.CATEGORY}` : ''}
                    </div>
                  </div>
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '12px',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}>
                    CERTIFICADO
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick searches */}
        <div className="bi-quick-searches">
          {QUICK_SEARCHES.map(term => (
            <button
              key={term}
              className="bi-quick-tag"
              onClick={() => {
                setQuery(term);
                const mid = activeMissionSnippet?.id ? `&mission_id=${encodeURIComponent(activeMissionSnippet.id)}` : '';
                navigate(`/buscaindustrial/resultados?q=${encodeURIComponent(term)}${mid}`);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={13} height={13}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              {term}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="bi-stats">
          {STATS.map(stat => (
            <div key={stat.value} className="bi-stat-card">
              <div className="bi-stat-icon">{stat.icon}</div>
              <div className="bi-stat-content">
                <span className="bi-stat-value">{stat.value}</span>
                <span className="bi-stat-label">{stat.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Scroll cue */}
        <div className="bi-scroll-cue">
          <p className="bi-scroll-label">DESCUBRE TODO</p>
          <p className="bi-scroll-sublabel">LO QUE LA INDUSTRIA MUEVE</p>
          <div className="bi-scroll-dot" />
          <svg className="bi-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>

        {/* Discovery Mission Modal */}
        <IndustrialDiscoveryModal
          isOpen={isDiscoveryOpen}
          onClose={() => setIsDiscoveryOpen(false)}
          initialObjective={query}
          onMissionStarted={(mid) => {
            setKnownMissionId(mid);
            setIsMissionRunning(true);
          }}
        />
      </main>
    </div>
  );
}
