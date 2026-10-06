import React, { useState, useEffect } from 'react';
import { Search, ShieldCheck, Database, RefreshCw, AlertTriangle, CheckCircle, ExternalLink, Zap, Lock, BookOpen } from 'lucide-react';
import { AtlasKnowledgeUniverse, type AtlasKnowledgeAnswer } from '../../../lib/search/AtlasKnowledgeUniverse';
import { SourceCapabilityRegistry, type RegisteredSource } from '../../../lib/search/SourceCapabilityRegistry';
import { AtlasQueryDecisionMemory, type DecisionMemoryRecord } from '../../../lib/search/AtlasQueryDecisionMemory';
import { AtlasSourceRankingEngine } from '../../../lib/search/AtlasSourceRankingEngine';
import { AtlasPromotionGate } from '../../../lib/atlasSemantic/AtlasPromotionGate';

export default function AdminKnowledgeUniverse() {
  const [queryInput, setQueryInput] = useState('Decano Ricardo Pahlen Acuña en UBA');
  const [freshnessToggle, setFreshnessToggle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<AtlasKnowledgeAnswer | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<DecisionMemoryRecord[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // Source strategy breakdown
  const [strategyCounts, setStrategyCounts] = useState<{
    indexFull: number;
    indexMetadata: number;
    liveQuery: number;
    blocked: number;
    total: number;
  }>({ indexFull: 0, indexMetadata: 0, liveQuery: 0, blocked: 0, total: 0 });

  useEffect(() => {
    loadSourceMetrics();
    refreshDecisions();
  }, []);

  const loadSourceMetrics = () => {
    const all = SourceCapabilityRegistry.getAllSources();
    let full = 0;
    let meta = 0;
    let live = 0;
    let blk = 0;

    for (const s of all) {
      const strat = SourceCapabilityRegistry.resolveRetrievalStrategy(s);
      if (strat === 'INDEX_FULL') full++;
      else if (strat === 'INDEX_METADATA') meta++;
      else if (strat === 'LIVE_QUERY') live++;
      else if (strat === 'BLOCKED') blk++;
    }

    setStrategyCounts({
      indexFull: full,
      indexMetadata: meta,
      liveQuery: live,
      blocked: blk,
      total: all.length
    });
  };

  const refreshDecisions = () => {
    setRecentDecisions(AtlasQueryDecisionMemory.getDecisionMemory().slice(0, 10));
  };

  const handleExecuteQuery = async () => {
    if (!queryInput.trim()) return;
    setLoading(true);
    try {
      // Provide mock local candidate if query targets Pahlen for realistic local demonstration
      const localCandidates = queryInput.includes('Pahlen') ? [
        {
          display_name: 'Ricardo Pahlen Acuña',
          role: 'Decano',
          organization: 'Facultad de Ciencias Económicas - UBA',
          source_id: 'UBA_ECONOMICAS_AUTORIDADES',
          person_source_url: 'https://www.economicas.uba.ar/institucional/autoridades/'
        }
      ] : [];

      const answer = await AtlasKnowledgeUniverse.executeQuery(queryInput, {
        freshnessRequired: freshnessToggle,
        localCandidates
      });

      setLastAnswer(answer);
      refreshDecisions();
    } catch (err) {
      console.error('Hybrid retrieval query error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Database size={24} color="var(--admin-accent)" />
            Atlas Knowledge Universe — Observabilidad Híbrida
          </h1>
          <p style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
            Auditoría de Retrieval Híbrido, Estrategias de Fuentes, Query Decision Memory & Outcome Learning
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', color: '#10b981' }}>
            CANONICAL_DB_DELTA = 0
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', color: '#60a5fa' }}>
            BASELINE V4.7.1 (2.091 CANONICAL)
          </div>
        </div>
      </div>

      {/* Strategy Breakdown Grid */}
      <div className="admin-stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="admin-glass-card admin-stat-card">
          <div className="admin-stat-label">Fuentes Registradas</div>
          <div className="admin-stat-value">{strategyCounts.total}</div>
        </div>
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
          <div className="admin-stat-label">INDEX_FULL (Enumerables)</div>
          <div className="admin-stat-value" style={{ color: '#10b981' }}>{strategyCounts.indexFull}</div>
        </div>
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}>
          <div className="admin-stat-label">LIVE_QUERY (On-Demand)</div>
          <div className="admin-stat-value" style={{ color: '#60a5fa' }}>{strategyCounts.liveQuery}</div>
        </div>
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div className="admin-stat-label">BLOCKED (Login / Captcha)</div>
          <div className="admin-stat-value" style={{ color: '#ef4444' }}>{strategyCounts.blocked}</div>
        </div>
      </div>

      {/* Interactive Hybrid Query Console */}
      <div className="admin-glass-card" style={{ padding: '1.5rem', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Zap size={18} color="#fbbf24" />
          Consola Interactiva de Consulta Híbrida
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ flex: '1 1 400px', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', padding: '0 0.75rem' }}>
            <Search size={16} color="var(--admin-text-muted)" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Escribe una consulta para probar la decisión híbrida de Atlas..."
              style={{ flex: 1, background: 'none', border: 'none', color: '#fff', padding: '0.6rem 0.75rem', outline: 'none', fontSize: '0.9rem' }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={freshnessToggle}
              onChange={(e) => setFreshnessToggle(e.target.checked)}
            />
            <span>Requerir Frescura 2026 (Live)</span>
          </label>
          <button
            onClick={handleExecuteQuery}
            disabled={loading}
            style={{
              background: 'var(--admin-accent)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.5rem',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? <RefreshCw className="admin-spin" size={16} /> : <Zap size={16} />}
            <span>{loading ? 'Planificando...' : 'Evaluar Plan y Resolver'}</span>
          </button>
        </div>

        {/* Query Result Card */}
        {lastAnswer && (
          <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1.25rem', marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>Modo de Decisión:</span>
                <span className={`admin-badge ${
                  lastAnswer.decision_mode === 'LOCAL_ONLY' ? 'success' :
                  lastAnswer.decision_mode === 'LOCAL_PLUS_LIVE' ? 'info' :
                  lastAnswer.decision_mode === 'LIVE_ONLY' ? 'warning' : 'danger'
                }`} style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                  {lastAnswer.decision_mode}
                </span>
                {lastAnswer.cache_hit && (
                  <span className="admin-badge neutral" style={{ fontSize: '0.7rem' }}>CACHE_HIT</span>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                Llamadas Externas Ejecutadas: <strong style={{ color: lastAnswer.external_calls_executed === 0 ? '#10b981' : '#fbbf24' }}>{lastAnswer.external_calls_executed}</strong>
              </div>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: '#e2e8f0', lineHeight: 1.4 }}>
              <strong>Resumen Atlas:</strong> {lastAnswer.summary}
            </p>

            {/* Evidence items */}
            {lastAnswer.evidence.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-secondary)', marginBottom: '0.4rem' }}>
                  Evidencias Fundamentadas ({lastAnswer.evidence.length}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {lastAnswer.evidence.map((ev, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      <div>{ev.claim}</div>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                        <span>Fuente: <strong>{ev.source_id}</strong></span>
                        <span>Dominio: <strong>{ev.domain}</strong></span>
                        <span style={{ color: ev.temporal_status === 'CURRENT_EVIDENCE' ? '#10b981' : '#fbbf24' }}>{ev.temporal_status}</span>
                        <span>Confianza: <strong>{(ev.confidence * 100).toFixed(0)}%</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Entities */}
            {lastAnswer.resolved_entities.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-secondary)', marginBottom: '0.4rem' }}>
                  Entidades Resueltas ({lastAnswer.resolved_entities.length}):
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {lastAnswer.resolved_entities.map((ent, i) => (
                    <div key={i} style={{ background: 'rgba(109, 40, 217, 0.1)', border: '1px solid rgba(109, 40, 217, 0.3)', borderRadius: '6px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                      <strong>{ent.name}</strong> — {ent.role || 'Profesional'} en {ent.organization || 'CABA'}
                      <div style={{ fontSize: '0.7rem', color: ent.cross_source_verified ? '#10b981' : '#94a3b8', marginTop: '0.2rem' }}>
                        {ent.cross_source_verified ? '✓ Verificado Cross-Source (>=2 dominios)' : 'Fuente única'} ({ent.domains.join(', ')})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Decision Memory & Audit Log */}
      <div className="admin-glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={18} color="var(--admin-accent)" />
            Memoria de Decisiones de Retrieval (Query Decision Memory)
          </h2>
          <button onClick={refreshDecisions} style={{ background: 'none', border: 'none', color: 'var(--admin-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID Decisión</th>
                <th>Modo</th>
                <th>Fuentes Seleccionadas</th>
                <th>Autoridad / Frescura / Geo</th>
                <th>Resultado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {recentDecisions.map((d) => (
                <tr key={d.decision_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                    {d.decision_id}
                  </td>
                  <td>
                    <span className={`admin-badge ${
                      d.decision_type === 'LOCAL_ONLY' ? 'success' :
                      d.decision_type === 'LOCAL_PLUS_LIVE' ? 'info' :
                      d.decision_type === 'LIVE_ONLY' ? 'warning' : 'danger'
                    }`}>
                      {d.decision_type}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {d.selected_sources.join(', ') || 'NINGUNA'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)' }}>
                    Aut: {d.reason_codes.authority_score ?? 15} | Fresh: {d.reason_codes.freshness_score ?? 15} | Geo: {d.reason_codes.geographic_fit_score ?? 25}
                  </td>
                  <td>
                    <span className="admin-badge neutral" style={{ fontSize: '0.75rem' }}>
                      {d.result}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedAuditId(selectedAuditId === d.decision_id ? null : d.decision_id)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      {selectedAuditId === d.decision_id ? 'Ocultar' : 'Auditoría'}
                    </button>
                  </td>
                </tr>
              ))}
              {recentDecisions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                    No hay decisiones registradas aún. Ejecuta una consulta arriba para generar memoria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Audit Explanation View Modal/Block */}
        {selectedAuditId && (
          <div style={{ marginTop: '1.5rem', background: '#0a0a0c', border: '1px solid rgba(109, 40, 217, 0.4)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--admin-accent)' }}>Explicación Auditada de Decisión</strong>
              <button onClick={() => setSelectedAuditId(null)} style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer' }}>×</button>
            </div>
            <pre style={{ margin: 0, padding: '0.5rem', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', fontSize: '0.75rem', color: '#a7f3d0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {AtlasQueryDecisionMemory.getAuditExplanation(selectedAuditId)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
