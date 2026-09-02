import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Square, RotateCcw, Download, CheckCircle,
  XCircle, AlertCircle, Zap, Target, Shield, Database,
  Clock, Award, BarChart2, ChevronDown, ChevronUp
} from 'lucide-react';
import { runSearchTest, TEST_QUERIES, type QueryResult, type TestSummary } from '../lib/search/searchTestRunner';
import { supabase } from '../lib/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (n: number) => `${n}%`;

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const w = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, sub, color
}: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,.08)', border: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
        <Icon size={16} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SearchTestPage() {
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(TEST_QUERIES.length);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [showFailed, setShowFailed] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [sampleSize, setSampleSize] = useState(50);
  const [routingMode, setRoutingMode] = useState<'static' | 'shadow' | 'dynamic'>('shadow');

  const [shadowStats, setShadowStats] = useState<{ disagreementRate: number, highMedEvidence: number, predictedLift: number } | null>(null);

  React.useEffect(() => {
    const fetchShadowStats = async () => {
      try {
        const { data, error } = await supabase.from('shadow_routing_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (data && data.length > 0) {
          const cleanData = data.filter(r => !r.exploration_triggered);
          if (cleanData.length === 0) return;
          
          const disagreedCount = cleanData.filter(r => r.disagreed).length;
          const disagreementRate = Math.round((disagreedCount / cleanData.length) * 1000) / 10;
          
          let highMedCount = 0;
          cleanData.filter(r => r.disagreed).forEach(r => {
             const hasGoodEvidence = (r.dynamic_decision || []).some((d: any) => d.confidence === 'HIGH' || d.confidence === 'MEDIUM');
             if (hasGoodEvidence) highMedCount++;
          });
          const highMedEvidence = disagreedCount > 0 ? Math.round((highMedCount / disagreedCount) * 100) : 0;
          
          const avgLift = cleanData.reduce((acc, r) => acc + (r.predicted_utility_lift || 0), 0) / cleanData.length;
          
          setShadowStats({ disagreementRate, highMedEvidence, predictedLift: Math.round(avgLift * 10) / 10 });
        }
      } catch (e) {
        console.warn('Failed to fetch shadow stats', e);
      }
    };
    fetchShadowStats();
  }, []);

  const handleStart = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setResults([]);
    setSummary(null);
    setProgress(0);

    abortRef.current = new AbortController();
    const queries = TEST_QUERIES.slice(0, sampleSize).map((q: any) => typeof q === 'string' ? q : q.query);
    setTotal(queries.length);

    try {
      const { results: r, summary: s } = await runSearchTest(
        queries,
        (current, total, lastResult, partial) => {
          setProgress(current);
          setLastQuery(lastResult.query);
          setResults(prev => [...prev, lastResult]);
          setSummary(partial);
        },
        abortRef.current.signal,
        2,  // concurrency
        routingMode
      );
      setResults(r);
      setSummary(s);
    } finally {
      setRunning(false);
      setDone(true);
    }
  }, [sampleSize]);

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setDone(true);
  };

  const handleReset = () => {
    setResults([]);
    setSummary(null);
    setDone(false);
    setProgress(0);
    setLastQuery('');
  };

  const handleExport = () => {
    const data = { summary, results, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youapp-search-test-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif",
      paddingBottom: 80
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <button onClick={() => navigate('/lab/search')} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
            ← Volver al Lab
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
            🧪 YouApp Search Test 1.0
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Prueba de fuego del motor de búsqueda — {TEST_QUERIES.length} queries reales en 9 categorías
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#64748b' }}>Muestra:</label>
            <select
              value={sampleSize}
              onChange={e => setSampleSize(Number(e.target.value))}
              disabled={running}
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
            >
              <option value={10}>10 queries (rápido)</option>
              <option value={50}>50 queries</option>
              <option value={100}>100 queries</option>
              <option value={200}>200 queries</option>
              <option value={TEST_QUERIES.length}>Todas ({TEST_QUERIES.length})</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#64748b' }}>Router:</label>
            <select
              value={routingMode}
              onChange={e => setRoutingMode(e.target.value as any)}
              disabled={running}
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
            >
              <option value="static">Static (Base)</option>
              <option value="shadow">Shadow (Log Dynamic)</option>
              <option value="dynamic">Dynamic (Learned)</option>
            </select>
          </div>

          {done && (
            <>
              <button onClick={handleExport} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, cursor: 'pointer'
              }}>
                <Download size={15} /> Exportar JSON
              </button>
              <button onClick={handleReset} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, cursor: 'pointer'
              }}>
                <RotateCcw size={15} /> Reset
              </button>
            </>
          )}

          {running ? (
            <button onClick={handleStop} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
              background: '#ef4444', color: 'white', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>
              <Square size={16} /> Detener
            </button>
          ) : (
            <button onClick={handleStart} disabled={done} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
              background: done ? '#94a3b8' : '#2563eb', color: 'white', border: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: done ? 'default' : 'pointer'
            }}>
              <Play size={16} /> {done ? 'Completado' : 'Iniciar Test'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Progress Bar */}
        {(running || done) && (
          <div style={{ background: 'white', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                {running ? '🔄 Ejecutando...' : '✅ Test completado'}
              </span>
              <span style={{ color: '#64748b', fontSize: 14 }}>{progress}/{total} queries ({progressPct}%)</span>
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: 6, height: 12, overflow: 'hidden' }}>
              <div style={{
                width: `${progressPct}%`, height: '100%',
                background: done ? '#10b981' : 'linear-gradient(90deg, #2563eb, #7c3aed)',
                borderRadius: 6, transition: 'width 0.3s'
              }} />
            </div>
            {running && lastQuery && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>
                🔍 Evaluando: <em>"{lastQuery}"</em>
              </div>
            )}
          </div>
        )}

        {/* Idle State */}
        {!running && !done && (
          <div style={{ textAlign: 'center', padding: '80px 32px', color: '#64748b' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>🧪</div>
            <h2 style={{ color: '#0f172a', marginBottom: 12 }}>YouApp Search Test 1.0</h2>
            <p style={{ maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.6 }}>
              Seleccioná la muestra y hacé clic en <strong>Iniciar Test</strong>.<br />
              El runner ejecuta cada query contra el motor real y mide 10 métricas clave.
            </p>
            <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 800, margin: '0 auto' }}>
              {[
                { icon: '✅', label: 'Top20 Success Rate' },
                { icon: '🎯', label: 'Relevant@5' },
                { icon: '🛡️', label: 'Eligibility Rate' },
                { icon: '⚡', label: 'Avg Latency' },
                { icon: '⭐', label: 'Avg YouScore' },
                { icon: '📊', label: 'Provider Diversity' },
              ].map(m => (
                <div key={m.label} style={{ background: 'white', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0', fontSize: 13 }}>
                  {m.icon} {m.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shadow Analytics */}
        {shadowStats && (
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#0f172a' }}>Shadow Rollout Analytics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <MetricCard 
                icon={Target} label="Shadow Disagreement" 
                value={`${shadowStats.disagreementRate}%`} 
                sub="Dynamic elige distinto a Static" color="#ef4444" 
              />
              <MetricCard 
                icon={Award} label="Evidence Quality" 
                value={`${shadowStats.highMedEvidence}%`} 
                sub="Disagreements con HIGH/MEDIUM confidence" color="#10b981" 
              />
              <MetricCard 
                icon={Zap} label="Predicted Utility Lift" 
                value={shadowStats.predictedLift > 0 ? `+${shadowStats.predictedLift}` : shadowStats.predictedLift} 
                sub="Predicted, no resultado real" color="#8b5cf6" 
              />
              <MetricCard 
                icon={Shield} label="Shadow Win Rate" 
                value="TBD" 
                sub="Hasta tener Gold replay" color="#64748b" 
              />
            </div>
          </div>
        )}

        {/* Summary Metrics */}
        {summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              <MetricCard icon={CheckCircle} label="Success Rate" value={`${summary.successRate}%`} sub="Queries con ≥1 resultado" color={summary.successRate >= 80 ? '#10b981' : '#f59e0b'} />
              <MetricCard icon={Target} label="Avg Relevant@5" value={summary.avgRelevantAt5} sub="Relevancia >= 55 en Top 5" color={summary.avgRelevantAt5 >= 4 ? '#10b981' : '#f59e0b'} />
              <MetricCard icon={Shield} label="Avg Eligibility" value={`${summary.avgEligibilityRate}%`} sub="% pasan quality/relevance floor" color={summary.avgEligibilityRate >= 60 ? '#10b981' : '#f59e0b'} />
              <MetricCard icon={BarChart2} label="Quality Top20" value={`${summary.avgQualityTop20Coverage}%`} sub="Llenado Top20 post-filtros" color={summary.avgQualityTop20Coverage >= 80 ? '#10b981' : '#ef4444'} />
              <MetricCard icon={Clock} label="Avg Latency" value={`${summary.avgLatencyMs}ms`} sub="Tiempo promedio por query" color={summary.avgLatencyMs <= 3000 ? '#10b981' : '#f59e0b'} />
              <MetricCard icon={Award} label="Avg YouScore" value={summary.avgYouScore} sub="Score de ranking promedio" color="#7c3aed" />
              <MetricCard icon={Database} label="Avg Metadata" value={`${summary.avgMetadataCompleteness}%`} sub="Completitud de metadatos" color={summary.avgMetadataCompleteness >= 60 ? '#10b981' : '#f59e0b'} />
              <MetricCard icon={XCircle} label="0-Result Rate" value={`${summary.zeroResultRate}%`} sub="Queries sin resultados" color={summary.zeroResultRate <= 10 ? '#10b981' : '#ef4444'} />
            </div>

            {/* Provider Distribution */}
            <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#0f172a' }}>📦 Distribución de Proveedores</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(summary.providerDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([provider, count]) => {
                    const pctVal = Math.round((count / summary.completedQueries) * 100);
                    const colors: Record<string, string> = {
                      youtube: '#ef4444', atlas: '#2563eb', vimeo: '#1db7ea',
                      dailymotion: '#0066dc', archive: '#7c3aed', peertube: '#f59e0b',
                      twitch: '#a855f7', discover: '#10b981', publisher: '#f97316', mock: '#94a3b8'
                    };
                    return (
                      <div key={provider} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 90, fontSize: 13, fontWeight: 500, color: '#0f172a', textTransform: 'capitalize' }}>{provider}</span>
                        <ScoreBar value={pctVal} color={colors[provider] || '#64748b'} />
                        <span style={{ width: 50, fontSize: 13, color: '#64748b', textAlign: 'right' }}>{pctVal}%</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>({count})</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Category Breakdown */}
            <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#0f172a' }}>📂 Por Categoría</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {Object.entries(summary.categoryBreakdown).map(([cat, data]) => (
                  <div key={cat} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8, textTransform: 'capitalize' }}>{cat}</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
                      <span>✅ {data.success}/{data.total}</span>
                      <span>⊘ {Math.round((data.success / data.total) * 100)}%</span>
                      <span>avg {data.avgResults} resultados</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Failed Queries */}
            {summary.failedQueries.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)', border: '1px solid #fecaca' }}>
                <button
                  onClick={() => setShowFailed(!showFailed)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}
                >
                  <h3 style={{ margin: 0, fontSize: 15, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={16} /> {summary.failedQueries.length} Queries sin resultados
                  </h3>
                  {showFailed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showFailed && (
                  <ul style={{ margin: '16px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {summary.failedQueries.map(q => (
                      <li key={q} style={{ fontSize: 13, color: '#64748b' }}>{q}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Individual Results */}
            <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)', border: '1px solid #e2e8f0' }}>
              <button
                onClick={() => setShowResults(!showResults)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}
              >
                <h3 style={{ margin: 0, fontSize: 15, color: '#0f172a' }}>
                  📋 Resultados individuales ({results.length} queries)
                </h3>
                {showResults ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showResults && (
                <div style={{ marginTop: 16, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Query', 'Cat', 'Intent', 'Resultados', 'Eligibles', 'Relevant@5', 'Latency', 'YouScore'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: r.success ? 'transparent' : '#fef2f2' }}>
                          <td style={{ padding: '8px 12px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.query}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{r.category}</td>
                          <td style={{ padding: '8px 12px', color: r.detectedIntent === r.expectedIntent ? '#10b981' : '#f59e0b', fontWeight: 500 }}>{r.detectedIntent || '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: r.resultCount === 0 ? '#ef4444' : r.resultCount >= 20 ? '#10b981' : '#f59e0b' }}>{r.resultCount}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{r.qualifiedCandidates} ({r.eligibilityRate}%)</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: r.relevantAt5 >= 4 ? '#10b981' : r.relevantAt5 >= 2 ? '#f59e0b' : '#ef4444' }}>{r.relevantAt5}/5</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{r.latencyMs}ms</td>
                          <td style={{ padding: '8px 12px', color: '#7c3aed' }}>{r.avgYouScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
