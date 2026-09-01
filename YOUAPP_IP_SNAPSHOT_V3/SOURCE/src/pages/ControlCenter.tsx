import React, { useEffect, useState } from 'react';
import { ArrowLeft, Activity, ShieldAlert, BarChart2, Zap, LayoutDashboard, Globe, AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getBudgetRemaining, getDailySummary, getRecentEvents } from '../lib/quotaBrain';
import { useStore } from '../store/useStore';

export default function ControlCenter() {
  const navigate = useNavigate();
  const { user } = useStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState({
    videos: 0, channels: 0, discoverySources: 0
  });

  const [watcherLoading, setWatcherLoading] = useState(false);
  const [watcherResult, setWatcherResult] = useState<any>(null);

  const triggerWatcher = async () => {
    setWatcherLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('rss-watcher', {
        body: { action: 'tick', limit: 25, forceAll: true }
      });
      if (error) throw error;
      setWatcherResult(data?.results);
      fetchData();
    } catch (e: any) {
      alert(`Error ejecutando Watcher: ${e.message}`);
    } finally {
      setWatcherLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const todaySummary = await getDailySummary();
      const recentEvents = await getRecentEvents(20);
      setSummary(todaySummary);
      setEvents(recentEvents);

      // Fetch DB basic stats
      const [vids, chans] = await Promise.all([
        supabase.from('youapp_index').select('id', { count: 'exact', head: true }),
        supabase.from('seed_sources').select('id', { count: 'exact', head: true })
      ]);
      setDbStats({
        videos: vids.count || 0,
        channels: chans.count || 0,
        discoverySources: 0
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalSearches = (summary?.searches_used || 0) + (summary?.searches_avoided || 0);
  const independenceRate = totalSearches > 0 
    ? ((summary?.searches_avoided / totalSearches) * 100).toFixed(1) 
    : '100.0';

  return (
    <div className="cc-page">
      <nav className="cc-nav">
        <button onClick={() => navigate(-1)} className="cc-back">
          <ArrowLeft size={20} /> Volver
        </button>
        <h1 className="cc-title">
          <LayoutDashboard size={24} />
          YOUAPP CONTROL CENTER
        </h1>
        <button onClick={fetchData} className="cc-refresh">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </nav>

      <div className="cc-content">
        {/* TOP KPIs */}
        <div className="cc-kpi-row">
          <div className="cc-kpi-card highlight">
            <h3>YOUAPP INDEPENDENCE</h3>
            <div className="kpi-value">{independenceRate}%</div>
            <p>Búsquedas resueltas sin Radar</p>
          </div>
          <div className="cc-kpi-card">
            <h3>PRESUPUESTO RADAR</h3>
            <div className="kpi-value">
              {summary?.searches_used || 0} / {summary?.internal_budget || 80}
            </div>
            <p>Reserva intacta: 20</p>
          </div>
          <div className="cc-kpi-card">
            <h3>ATLAS VIDEOS</h3>
            <div className="kpi-value">{dbStats.videos.toLocaleString()}</div>
            <p>En youapp_index</p>
          </div>
          <div className="cc-kpi-card" style={{ borderColor: 'rgba(59,130,246,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>📡 WATCHER RSS (0 QUOTA)</h3>
              <button 
                onClick={triggerWatcher} 
                disabled={watcherLoading}
                style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Zap size={14} /> {watcherLoading ? 'Procesando...' : 'Ejecutar'}
              </button>
            </div>
            <div className="kpi-value" style={{ color: '#60a5fa' }}>
              {watcherResult ? `${watcherResult.newVideosFound} nuevos` : `${dbStats.channels} feeds`}
            </div>
            <p style={{ fontSize: '0.75rem' }}>
              {watcherResult ? `Revisados: ${watcherResult.channelsChecked} canales` : 'Frecuencia adaptativa 0 coste de búsqueda'}
            </p>
          </div>
        </div>

        <div className="cc-grid">
          {/* LOG DE EVENTOS */}
          <div className="cc-panel">
            <div className="panel-header">
              <Activity size={18} />
              <h3>Últimos Eventos de QuotaBrain</h3>
            </div>
            <div className="table-container">
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Query</th>
                    <th>Caller</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td style={{opacity: 0.7}}>{new Date(ev.created_at).toLocaleTimeString()}</td>
                      <td><strong>{ev.query}</strong></td>
                      <td><span className="badge">{ev.caller}</span></td>
                      <td>
                        {ev.authorized ? (
                          <span className="status ok">Autorizado ({ev.opportunity_score})</span>
                        ) : (
                          <span className="status error">Denegado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{textAlign:'center', padding:'2rem', opacity:0.5}}>
                        No hay eventos registrados hoy
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cc-page {
          min-height: 100vh;
          background: #0f172a;
          color: #f8fafc;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .cc-nav {
          display: flex;
          align-items: center;
          padding: 20px 30px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          background: #1e293b;
        }
        .cc-back {
          background: none; border: none; color: #94a3b8; cursor: pointer;
          display: flex; align-items: center; gap: 8px; font-weight: 500;
        }
        .cc-back:hover { color: #fff; }
        .cc-title {
          flex: 1; text-align: center; margin: 0; font-size: 1.2rem;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          color: #fff; letter-spacing: 1px;
        }
        .cc-refresh {
          background: #334155; border: none; color: #fff; width: 36px; height: 36px;
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.2s;
        }
        .cc-refresh:hover { background: #475569; }
        .cc-content { padding: 30px; max-width: 1200px; margin: 0 auto; }
        
        .cc-kpi-row {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px; margin-bottom: 30px;
        }
        .cc-kpi-card {
          background: #1e293b; border-radius: 16px; padding: 24px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .cc-kpi-card.highlight {
          background: linear-gradient(135deg, #1e1b4b, #312e81);
          border: 1px solid #4f46e5;
        }
        .cc-kpi-card h3 { margin: 0 0 10px; font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
        .cc-kpi-card.highlight h3 { color: #a5b4fc; }
        .kpi-value { font-size: 2.5rem; font-weight: 700; color: #fff; margin-bottom: 5px; }
        .cc-kpi-card p { margin: 0; color: #64748b; font-size: 0.9rem; }

        .cc-panel {
          background: #1e293b; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .panel-header {
          display: flex; align-items: center; gap: 10px; padding: 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .panel-header h3 { margin: 0; font-size: 1rem; font-weight: 600; }
        
        .table-container { overflow-x: auto; }
        .cc-table { width: 100%; border-collapse: collapse; text-align: left; }
        .cc-table th { padding: 15px 20px; color: #94a3b8; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; }
        .cc-table td { padding: 15px 20px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; }
        .badge {
          background: #334155; color: #cbd5e1; padding: 4px 8px;
          border-radius: 6px; font-size: 0.75rem; font-weight: 600;
        }
        .status { padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
        .status.ok { background: rgba(16, 185, 129, 0.1); color: #34d399; }
        .status.error { background: rgba(239, 68, 68, 0.1); color: #f87171; }
      `}</style>
    </div>
  );
}
