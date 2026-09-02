import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle, Loader } from 'lucide-react';

import { parseQuery } from '../lib/search/queryEngine';
import { analyzeQuery } from '../lib/search/intentDetector';
import { routeQuery } from '../lib/search/capabilityRouter';
import { lookupQueryMemory } from '../lib/search/query/queryMemory';
import { normalizeItems } from '../lib/search/normalizationEngine';
import { deduplicateItems } from '../lib/search/deduplicationEngine';
import { calculateQualityScore } from '../lib/search/qualityEngine';
import { supabase } from '../lib/supabase';
import { executeSearch } from '../lib/search/searchEngine';

// ── Direct provider probes ────────────────────────────────────────────────────

async function probeSupabaseIndex(queryStr: string, source?: string) {
  const start = Date.now();
  try {
    let q = supabase
      .from('youapp_index')
      .select('id, title, source, provider', { count: 'exact' })
      .or(`title.ilike.%${queryStr}%,description.ilike.%${queryStr}%`)
      .limit(5);
    if (source) q = q.eq('source', source);
    const { data, count, error } = await q;
    return { attempted: true, latency: Date.now() - start, count: count || 0, sample: data?.slice(0, 3) || [], error: error?.message };
  } catch (e: any) {
    return { attempted: true, latency: Date.now() - start, count: 0, sample: [], error: e.message };
  }
}

async function probeLocalSupabase(queryStr: string) {
  // Check all content in youapp_index regardless of source
  const start = Date.now();
  try {
    const { count } = await supabase.from('youapp_index').select('*', { count: 'exact', head: true });
    return { attempted: true, latency: Date.now() - start, totalRows: count || 0, error: null };
  } catch (e: any) {
    return { attempted: true, latency: Date.now() - start, totalRows: 0, error: e.message };
  }
}

async function probeEdgeFunction(fnName: string, body: object, signal?: AbortSignal) {
  const start = Date.now();
  try {
    const { data, error } = await (supabase.functions as any).invoke(fnName, { body, signal });
    return {
      attempted: true, latency: Date.now() - start,
      count: data?.items?.length || 0,
      sample: data?.items?.slice(0, 2) || [],
      error: error?.message || null,
      deployed: !error
    };
  } catch (e: any) {
    return { attempted: true, latency: Date.now() - start, count: 0, sample: [], error: e.message, deployed: false };
  }
}

async function probeYouTubeRadar(queryStr: string) {
  const start = Date.now();
  try {
    const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || 'AIzaSyBMhLs1XEBfInBFB7vQ3DjMZfP-2OCM1xw';
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(queryStr)}&type=video&maxResults=5&key=${API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (data.error) return { attempted: true, latency: Date.now() - start, count: 0, error: data.error.message, quota_ok: false };
    return { attempted: true, latency: Date.now() - start, count: data.items?.length || 0, quota_ok: true, error: null };
  } catch (e: any) {
    return { attempted: true, latency: Date.now() - start, count: 0, error: e.message, quota_ok: false };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineResult {
  query: string;
  step1_parse: any;
  step2_intent: any;
  step3_memory: any;
  step4_router: any;
  step5_index_total: any;
  step5_publishers: any;
  step5_discover: any;
  step5_vimeo: any;
  step5_video_mesh: any;
  step5_radar: any;
  step6_searchEngine: {
    count: number;
    latency: number;
    error?: string;
    providers: string[];
    trace?: any;
    results?: any[];
  };
}

// ── Step Display ──────────────────────────────────────────────────────────────

function StepCard({ num, title, status, children }: {
  num: string; title: string; status: 'ok' | 'warn' | 'error' | 'info';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const colors = { ok: '#10b981', warn: '#f59e0b', error: '#ef4444', info: '#2563eb' };
  const icons = {
    ok: <CheckCircle size={16} color="#10b981" />,
    warn: <AlertTriangle size={16} color="#f59e0b" />,
    error: <XCircle size={16} color="#ef4444" />,
    info: <CheckCircle size={16} color="#2563eb" />
  };
  return (
    <div style={{ border: `1px solid ${colors[status]}22`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', background: `${colors[status]}11`, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px'
      }}>
        <span style={{ fontWeight: 700, color: colors[status], fontSize: 13, minWidth: 28 }}>{num}</span>
        {icons[status]}
        <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', flex: 1, textAlign: 'left' }}>{title}</span>
        {open ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </button>
      {open && <div style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace', background: 'white' }}>{children}</div>}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: 'ok' | 'warn' | 'error' }) {
  const colors = { ok: '#10b981', warn: '#f59e0b', error: '#ef4444' };
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'flex-start' }}>
      <span style={{ color: '#64748b', minWidth: 180, fontWeight: 500 }}>{label}:</span>
      <span style={{ color: highlight ? colors[highlight] : '#0f172a', fontWeight: highlight ? 700 : 400 }}>
        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—')}
      </span>
    </div>
  );
}

function ProviderRow({ name, result }: { name: string; result: any }) {
  const ok = (result.count || 0) > 0;
  const deployed = result.deployed !== false;
  return (
    <div style={{
      border: `1px solid ${ok ? '#bbf7d0' : '#fee2e2'}`,
      borderRadius: 8, padding: '10px 14px', marginBottom: 8,
      background: ok ? '#f0fdf4' : deployed ? '#fff7ed' : '#fef2f2'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{name}</span>
        <span style={{
          fontWeight: 700, fontSize: 16,
          color: ok ? '#10b981' : '#ef4444'
        }}>{result.count ?? 0} resultados</span>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
        <span>⏱ {result.latency}ms</span>
        {result.error && <span style={{ color: '#ef4444' }}>⚠ {result.error}</span>}
        {!result.error && !ok && <span style={{ color: '#f59e0b' }}>⊘ Sin resultados (no error)</span>}
        {result.deployed === false && <span style={{ color: '#ef4444' }}>🚫 Edge Function no desplegada</span>}
      </div>
      {result.sample?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
          Muestra: {result.sample.map((s: any) => s.title || s.id).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PipelineDebugger() {
  const navigate = useNavigate();
  const [inputQuery, setInputQuery] = useState('Messi');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const runDiagnostic = useCallback(async () => {
    if (!inputQuery.trim()) return;
    setLoading(true);
    setResult(null);

    const q = inputQuery.trim();
    const parsed = parseQuery(q);
    const intent = analyzeQuery(q);
    const routing = routeQuery(parsed, intent);
    const memory = await lookupQueryMemory(q).catch(() => ({ found: false, atlasCoverage: 0 }));

    // Probe each layer independently
    const [indexTotal, publishers, discover, vimeo, videoMesh, radar, engineResult] = await Promise.all([
      probeLocalSupabase(q),
      probeSupabaseIndex(q, 'publisher'),
      probeSupabaseIndex(q, 'discover'),
      probeEdgeFunction('vimeo-provider', { query: q, limit: 5, ingest: false }),
      probeEdgeFunction('video-mesh', { query: q, providers: ['archive', 'peertube'], limit: 5, ingest: false }),
      probeYouTubeRadar(q),
      (async () => {
        const start = Date.now();
        try {
          const { all, trace } = await executeSearch(q, { forceExternal: false });
          const providers = [...new Set(all.map((c: any) => c.provider || 'unknown'))];
          return { count: all.length, latency: Date.now() - start, providers, trace, results: all };
        } catch (e: any) {
          return { count: 0, latency: Date.now() - start, error: e.message, providers: [] };
        }
      })()
    ]);

    setResult({
      query: q,
      step1_parse: parsed,
      step2_intent: intent,
      step3_memory: memory,
      step4_router: routing,
      step5_index_total: indexTotal,
      step5_publishers: publishers,
      step5_discover: discover,
      step5_vimeo: vimeo,
      step5_video_mesh: videoMesh,
      step5_radar: radar,
      step6_searchEngine: engineResult
    });
    setLoading(false);
  }, [inputQuery]);

  // --- BENCHMARK RUNNER ---
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkResults, setBenchmarkResults] = useState<any[]>([]);
  
  const QUERIES = [
    "Messi",
    "dólar hoy argentina",
    "OpenAI noticias recientes",
    "elecciones EEUU 2024",
    "Oscar 2024",
    "París 2024",
    "macroeconomía global análisis",
    "derechos humanos noticias",
    "Taylor Swift",
    "Mundial 2026"
  ];

  const runBenchmark = async () => {
    setBenchmarking(true);
    setBenchmarkResults([]);
    
    const results = [];
    for (const q of QUERIES) {
      try {
        const { all, trace } = await executeSearch(q, { forceExternal: false });
        // R@5 Mock: we check if the top 5 have relevanceScore >= 60
        const top5 = all.slice(0, 5);
        const rAt5 = top5.filter(c => (c.relevanceScore || 0) >= 60).length;
        
        results.push({
          query: q,
          path: trace.path,
          raw: trace.funnel.raw,
          gt60: trace.funnel.qualified,
          final: trace.funnel.final,
          rat5: `${rAt5}/5`,
          radar: trace.retrievalStats.radar,
          latency: trace.latencyMs
        });
      } catch (err: any) {
        results.push({ query: q, path: 'error', error: err.message });
      }
      setBenchmarkResults([...results]);
    }
    
    setBenchmarking(false);
  };

  const r = result;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => navigate('/lab/search-test')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>← Search Test</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>🔬 Pipeline Debugger</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Diagnóstico completo paso a paso del motor de búsqueda</p>
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
        {/* Input */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <input
            value={inputQuery}
            onChange={e => setInputQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runDiagnostic()}
            placeholder='Ej: "Messi", "últimas noticias argentina"'
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
              fontSize: 15, outline: 'none'
            }}
          />
          <button
            onClick={runDiagnostic}
            disabled={loading || benchmarking}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
              background: '#2563eb', color: 'white', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: (loading || benchmarking) ? 'wait' : 'pointer'
            }}
          >
            {loading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
            {loading ? 'Analizando...' : 'Diagnosticar'}
          </button>
          
          <button
            onClick={runBenchmark}
            disabled={loading || benchmarking}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
              background: '#475569', color: 'white', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: (loading || benchmarking) ? 'wait' : 'pointer'
            }}
          >
            {benchmarking ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
            {benchmarking ? 'Corriendo...' : 'Correr Benchmark (10)'}
          </button>
        </div>

        {benchmarking && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            <Loader size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <div>Corriendo benchmark... ({benchmarkResults.length}/{QUERIES.length})</div>
          </div>
        )}

        {benchmarkResults.length > 0 && !loading && (
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', padding: 20, marginBottom: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Resultados del Benchmark</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Query</th>
                  <th style={{ padding: '8px 12px' }}>Path</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Raw</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>≥60</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Final</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>R@5</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Radar</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Lat (ms)</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkResults.map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.query}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {b.path === 'fast' && <span style={{ color: '#10b981', fontWeight: 700 }}>FAST</span>}
                      {b.path === 'discovery' && <span style={{ color: '#3b82f6', fontWeight: 700 }}>DISC</span>}
                      {b.path === 'radar' && <span style={{ color: '#f59e0b', fontWeight: 700 }}>RADAR</span>}
                      {b.error && <span style={{ color: '#ef4444' }}>ERROR</span>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{b.raw ?? '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{b.gt60 ?? '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{b.final ?? '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: b.rat5 === '5/5' ? '#10b981' : '#f59e0b' }}>{b.rat5 ?? '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: b.radar > 0 ? '#ef4444' : '#64748b' }}>{b.radar ?? '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: b.latency > 1500 ? 700 : 400, color: b.latency > 1500 ? '#ef4444' : '#64748b' }}>{b.latency ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔬</div>
            <div>Probando cada capa del pipeline...</div>
          </div>
        )}

        {r && (
          <>
            {/* VEREDICTO */}
            <div style={{
              background: r.step6_searchEngine.count > 0 ? '#f0fdf4' : '#fef2f2',
              border: `2px solid ${r.step6_searchEngine.count > 0 ? '#10b981' : '#ef4444'}`,
              borderRadius: 12, padding: '16px 20px', marginBottom: 24
            }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: r.step6_searchEngine.count > 0 ? '#10b981' : '#ef4444', marginBottom: 4 }}>
                {r.step6_searchEngine.count > 0 ? '✅ Motor funcionando' : '❌ Motor retorna 0 resultados'}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                searchEngine("{r.query}") → {r.step6_searchEngine.count} resultados en {r.step6_searchEngine.latency}ms
                {r.step6_searchEngine.providers.length > 0 && ` · Providers: ${r.step6_searchEngine.providers.join(', ')}`}
              </div>
              {/* Quick index health */}
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: r.step5_index_total.totalRows > 0 ? '#f59e0b' : '#ef4444' }}>
                📦 youapp_index total: {r.step5_index_total.totalRows} filas
                {r.step5_index_total.totalRows === 0 && ' ← ⚠️ TABLA VACÍA — Este es el problema raíz'}
                {r.step5_index_total.totalRows > 0 && r.step5_index_total.totalRows < 100 && ' ← Pocos registros'}
              </div>
            </div>

            {/* Step 1: Parse */}
            <StepCard num="1" title="Query Parse" status="info">
              <Row label="rawQuery" value={r.step1_parse.rawQuery} />
              <Row label="normalizedQuery" value={r.step1_parse.normalizedQuery} />
              <Row label="freshness" value={r.step1_parse.freshness} />
              <Row label="forceExternal" value={String(r.step1_parse.forceExternal)} />
            </StepCard>

            {/* Step 2: Intent */}
            <StepCard num="2" title={`Intent Detection → ${r.step2_intent.primaryIntent}`} status="info">
              <Row label="primaryIntent" value={r.step2_intent.primaryIntent} />
              <Row label="confidence" value={r.step2_intent.confidence} />
              <Row label="entities" value={r.step2_intent.entities?.join(', ') || '—'} />
              <Row label="temporal" value={r.step2_intent.temporalContext || '—'} />
            </StepCard>

            {/* Step 3: Query Memory */}
            <StepCard num="3" title={`Query Memory → ${r.step3_memory.found ? 'HIT' : 'MISS'}`} status={r.step3_memory.found ? 'ok' : 'warn'}>
              <Row label="found" value={String(r.step3_memory.found)} highlight={r.step3_memory.found ? 'ok' : 'warn'} />
              <Row label="atlasCoverage" value={`${r.step3_memory.atlasCoverage || 0}%`} />
              {r.step3_memory.meaning && <Row label="canonicalQuery" value={r.step3_memory.meaning.canonicalQuery} />}
            </StepCard>

            {/* Step 4: Router */}
            <StepCard num="4" title="Capability Router — Static vs Shadow Dynamic" status={
              r.step4_router.filter((d: any) => d.shouldActivate && d.provider !== 'youtube').length === 0 ? 'error' :
              r.step4_router.some((d: any) => d.fallbackActivated) ? 'warn' : 'ok'
            }>
              {r.step4_router.some((d: any) => d.fallbackActivated) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                  ⚠ <strong>GENERAL FALLBACK activado</strong> — Intent UNKNOWN o confianza baja. Se activaron providers por defecto para no devolver candidatos vacíos.
                </div>
              )}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* STATIC DECISIONS */}
                <div>
                  <div style={{ fontWeight: 700, color: '#334155', marginBottom: 12, borderBottom: '1px solid #cbd5e1', paddingBottom: 4 }}>
                    STATIC DECISION (Real)
                  </div>
                  {r.step4_router.map((d: any) => (
                    <div key={`static-${d.provider}`} style={{
                      display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8,
                      opacity: d.shouldActivate ? 1 : 0.4
                    }}>
                      <span style={{ color: d.shouldActivate ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 14, minWidth: 20 }}>
                        {d.shouldActivate ? '✅' : '❌'}
                      </span>
                      <span style={{ minWidth: 90, fontWeight: 600, textTransform: 'capitalize' }}>{d.provider}</span>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>Score: {d.score}</span>
                      {d.shouldActivate && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>SELECT</span>}
                      {!d.shouldActivate && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>SKIP</span>}
                    </div>
                  ))}
                </div>

                {/* SHADOW DYNAMIC DECISIONS */}
                <div style={{ borderLeft: '1px dashed #cbd5e1', paddingLeft: 16 }}>
                  <div style={{ fontWeight: 700, color: '#8b5cf6', marginBottom: 12, borderBottom: '1px solid #cbd5e1', paddingBottom: 4 }}>
                    SHADOW DYNAMIC (Hipotético)
                  </div>
                  {r.step4_router.map((d: any) => {
                    const wouldSelect = (d.dynamicScore || 0) >= 30; // Threshold = 30
                    const disagreement = d.shouldActivate !== wouldSelect;
                    return (
                      <div key={`dynamic-${d.provider}`} style={{
                        marginBottom: 12, padding: 8, borderRadius: 6,
                        background: disagreement ? '#fffbeb' : 'transparent',
                        border: disagreement ? '1px solid #fde68a' : '1px solid transparent'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{d.provider}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: wouldSelect ? '#10b981' : '#ef4444' }}>
                            {wouldSelect ? 'WOULD SELECT' : 'WOULD SKIP'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px', gap: 2, fontSize: 11, color: '#64748b', paddingLeft: 8 }}>
                          <span>Static Fit:</span> <span style={{ textAlign: 'right', fontWeight: 600 }}>{d.staticFit}</span>
                          <span>Learned Utility:</span> <span style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(d.learnedUtility)}</span>
                          <span>Health:</span> <span style={{ textAlign: 'right', fontWeight: 600 }}>{d.healthScore}</span>
                          <span style={{ color: '#8b5cf6', fontWeight: 600, marginTop: 4 }}>Dynamic Score:</span> 
                          <span style={{ color: '#8b5cf6', fontWeight: 700, textAlign: 'right', marginTop: 4 }}>{d.dynamicScore}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </StepCard>

            {/* Step 5: Providers */}
            <StepCard
              num="5"
              title="Providers — Resultado de cada fuente"
              status={
                r.step5_index_total.totalRows === 0 ? 'error' :
                (r.step5_publishers.count + r.step5_discover.count + r.step5_vimeo.count + r.step5_video_mesh.count) > 0 ? 'ok' : 'warn'
              }
            >
              {/* Index total */}
              <div style={{ background: r.step5_index_total.totalRows === 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: r.step5_index_total.totalRows === 0 ? '#ef4444' : '#10b981' }}>
                  📦 youapp_index — {r.step5_index_total.totalRows} filas totales
                  {r.step5_index_total.totalRows === 0 && ' ← TABLA VACÍA'}
                </div>
                {r.step5_index_total.error && <div style={{ color: '#ef4444', fontSize: 12 }}>{r.step5_index_total.error}</div>}
              </div>

              <ProviderRow name="📰 Publishers (youapp_index source=publisher)" result={r.step5_publishers} />
              <ProviderRow name="🌐 Discover (youapp_index source=discover)" result={r.step5_discover} />
              <ProviderRow name="🎬 Vimeo (Edge Function: vimeo-provider)" result={r.step5_vimeo} />
              <ProviderRow name="🏛 Video Mesh / Archive (Edge Function: video-mesh)" result={r.step5_video_mesh} />

              {/* YouTube Radar */}
              <div style={{
                border: `1px solid ${r.step5_radar.quota_ok ? '#fef9c3' : '#fee2e2'}`,
                borderRadius: 8, padding: '10px 14px', marginBottom: 8,
                background: r.step5_radar.quota_ok ? '#fefce8' : '#fef2f2'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>🔭 YouTube Radar (API directa)</span>
                  <span style={{ fontWeight: 700, color: r.step5_radar.count > 0 ? '#10b981' : '#f59e0b' }}>
                    {r.step5_radar.count} resultados
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  <span>Cuota OK: {r.step5_radar.quota_ok ? '✅' : '❌'}</span>
                  <span style={{ marginLeft: 12 }}>⏱ {r.step5_radar.latency}ms</span>
                  {r.step5_radar.error && <span style={{ color: '#ef4444', marginLeft: 12 }}>⚠ {r.step5_radar.error}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Nota: Esto prueba la API de YouTube directamente (bypassing QuotaBrain). El motor lo usa solo como último recurso.
                </div>
              </div>
            </StepCard>

            {/* Step 6: searchEngine final */}
            <StepCard
              num="6"
              title={`searchEngine() Final → ${r.step6_searchEngine.count} resultados`}
              status={r.step6_searchEngine.count > 0 ? 'ok' : 'error'}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Panel izquierdo: Diagnóstico */}
                <div>
                  <Row label="Resultado final" value={`${r.step6_searchEngine.count} videos`} highlight={r.step6_searchEngine.count > 0 ? 'ok' : 'error'} />
                  <Row label="Latencia total" value={`${r.step6_searchEngine.latency}ms`} />
                  <Row label="Providers (content)" value={r.step6_searchEngine.providers.join(', ') || 'Ninguno'} highlight={r.step6_searchEngine.providers.length > 0 ? 'ok' : 'error'} />
                  {r.step6_searchEngine.error && <Row label="Error" value={r.step6_searchEngine.error} highlight="error" />}

                  {/* Diagnosis */}
                  {r.step6_searchEngine.count === 0 && (
                    <div style={{ marginTop: 12, padding: '12px 16px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                      <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>🔍 Diagnóstico automático:</div>
                      <ul style={{ margin: 0, paddingLeft: 20, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {r.step5_index_total.totalRows === 0 && (
                          <li style={{ color: '#dc2626', fontWeight: 600 }}>
                            ❌ youapp_index está VACÍA — publishers y discover no tienen contenido que servir.
                            Necesitás correr el seed manager o ingestar contenido primero.
                          </li>
                        )}
                        {!r.step5_vimeo.deployed && (
                          <li style={{ color: '#dc2626' }}>❌ Edge Function "vimeo-provider" no está desplegada en Supabase.</li>
                        )}
                        {!r.step5_video_mesh.deployed && (
                          <li style={{ color: '#dc2626' }}>❌ Edge Function "video-mesh" no está desplegada en Supabase.</li>
                        )}
                        {!r.step5_radar.quota_ok && (
                          <li style={{ color: '#f59e0b' }}>⚠ YouTube Radar API falló — revisar API key o cuota agotada.</li>
                        )}
                        {r.step5_index_total.totalRows > 0 && r.step5_vimeo.deployed && r.step5_video_mesh.deployed && r.step5_radar.quota_ok && (
                          <li>El problema está en el pipeline de normalización o deduplicación — ver consola del navegador.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Panel derecho: Trace y Funnel */}
                {r.step6_searchEngine.trace && (
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: 13 }}>
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: 12, borderBottom: '1px solid #cbd5e1', paddingBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>EXECUTION TRACE</span>
                      <span style={{ 
                        background: r.step6_searchEngine.trace.path === 'fast' ? '#dcfce7' : '#dbeafe', 
                        color: r.step6_searchEngine.trace.path === 'fast' ? '#166534' : '#1e40af', 
                        padding: '2px 8px', borderRadius: 12, fontSize: 11 
                      }}>
                        {r.step6_searchEngine.trace.path?.toUpperCase()} PATH
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Granular Latencies (ms):</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px', paddingLeft: 12, gap: 2 }}>
                          <span>parse:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.parse}</span>
                          <span>intent:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.intent}</span>
                          <span>memory:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.memory}</span>
                          <span>atlas:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.atlas}</span>
                          <span>providers:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.providers}</span>
                          <span>normalize:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.normalize}</span>
                          <span>dedup:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.dedup}</span>
                          <span>relevance:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.relevance}</span>
                          <span>quality:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.quality}</span>
                          <span>rank:</span><span style={{ textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.rank}</span>
                          <span style={{ fontWeight: 600, borderTop: '1px solid #cbd5e1', paddingTop: 2, marginTop: 2 }}>total:</span>
                          <span style={{ fontWeight: 600, borderTop: '1px solid #cbd5e1', paddingTop: 2, marginTop: 2, textAlign: 'right' }}>{r.step6_searchEngine.trace.latencies?.total}</span>
                        </div>
                      </div>

                      <div>
                        <div style={{ color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Source Breakdown:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px', gap: 4, fontSize: 11, borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 4 }}>
                          <span></span><span style={{ textAlign: 'right', color: '#94a3b8' }}>Acq.</span><span style={{ textAlign: 'right', color: '#94a3b8' }}>Fin.</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px', paddingLeft: 4, gap: 4 }}>
                          <span>Atlas</span>
                          <span style={{ textAlign: 'right', color: '#64748b' }}>{r.step6_searchEngine.trace.acquisitionStats?.atlas}</span>
                          <span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.retrievalStats.atlas}</span>
                          
                          <span>Vimeo</span>
                          <span style={{ textAlign: 'right', color: '#64748b' }}>{r.step6_searchEngine.trace.acquisitionStats?.vimeo}</span>
                          <span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.retrievalStats.vimeo}</span>
                          
                          <span>Dailymotion</span>
                          <span style={{ textAlign: 'right', color: '#64748b' }}>{r.step6_searchEngine.trace.acquisitionStats?.dailymotion}</span>
                          <span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.retrievalStats.dailymotion}</span>
                          
                          <span>Radar</span>
                          <span style={{ textAlign: 'right', color: '#64748b' }}>{r.step6_searchEngine.trace.acquisitionStats?.radar}</span>
                          <span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.retrievalStats.radar}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Funnel:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px', paddingLeft: 12, gap: 4, marginBottom: 12 }}>
                      <span>Raw</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.funnel.raw}</span>
                      <span>Dedup</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.funnel.dedup}</span>
                      <span>YouScore ≥60</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{r.step6_searchEngine.trace.funnel.qualified}</span>
                      <span style={{ color: '#2563eb' }}>Final Top</span><span style={{ fontWeight: 700, color: '#2563eb', textAlign: 'right' }}>{r.step6_searchEngine.trace.funnel.final}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: 8, marginTop: 4 }}>
                      <span>Independence (Final):</span>
                      {r.step6_searchEngine.trace.independenceRate === -1 ? (
                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>⚠ N/A</span>
                      ) : (
                        <span style={{ fontWeight: 700, color: r.step6_searchEngine.trace.independenceRate === 100 ? '#10b981' : '#f59e0b' }}>
                          {r.step6_searchEngine.trace.independenceRate}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* NUEVO: Result Provenance (Top 3) */}
              {r.step6_searchEngine.count > 0 && (
                <div style={{ marginTop: 24, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔍 Result Provenance (Top 3)
                  </h4>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {(r.step6_searchEngine.results || []).slice(0, 3).map((res: any, idx: number) => (
                      <div key={res.id || idx} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: 6, padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          #{idx + 1} {res.title}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, color: '#64748b' }}>
                          <span>contentProvider:</span> <span style={{ fontWeight: 500, color: '#0f172a' }}>{res.provider || 'unknown'}</span>
                          <span>retrievalSource:</span> <span style={{ fontWeight: 500, color: '#0f172a' }}>{res.retrievalSource || 'unknown'}</span>
                          <span>debugOrigin:</span> <span style={{ fontWeight: 500, color: '#8b5cf6' }}>{res.debugOrigin}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </StepCard>
          </>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
