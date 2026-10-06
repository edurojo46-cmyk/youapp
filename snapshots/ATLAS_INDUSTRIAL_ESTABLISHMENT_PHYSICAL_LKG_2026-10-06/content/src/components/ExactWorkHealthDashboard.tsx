import React, { useState, useEffect } from 'react';
import { ExactWorkCoverageMemory, type ExactWorkCoverageRecord } from '../lib/search/exactWorkCoverageMemory';
import { CANONICAL_WORKS_ONTOLOGY } from '../lib/search/canonicalWorksCatalog';

export const ExactWorkHealthDashboard: React.FC = () => {
  const [records, setRecords] = useState<ExactWorkCoverageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await ExactWorkCoverageMemory.getAllRecords();
    setRecords(data);
    setLoading(false);
  };

  const totalMonitored = CANONICAL_WORKS_ONTOLOGY.length;
  const recordedCount = records.length;
  const unmeasuredCount = Math.max(0, totalMonitored - recordedCount);

  const count80Plus = records.filter(r => r.exactEntityWorkCoverageAt10 >= 80).length;
  const count60To79 = records.filter(r => r.exactEntityWorkCoverageAt10 >= 60 && r.exactEntityWorkCoverageAt10 < 80).length;
  const count30To59 = records.filter(r => r.exactEntityWorkCoverageAt10 >= 30 && r.exactEntityWorkCoverageAt10 < 60).length;
  const countSub30 = records.filter(r => r.exactEntityWorkCoverageAt10 < 30).length;

  const criticalGapsCount = records.filter(r => r.priorityTier === 'CRITICA').length;
  const avgEntityWorkCoverage = recordedCount > 0
    ? Math.round(records.reduce((acc, r) => acc + r.exactEntityWorkCoverageAt10, 0) / recordedCount)
    : 0;
  const avgWorkCoverage = recordedCount > 0
    ? Math.round(records.reduce((acc, r) => acc + r.workCoverageAt10, 0) / recordedCount)
    : 0;

  return (
    <div style={{ padding: '24px', background: '#090d16', color: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', borderBottom: '1px solid #1e293b', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🏛</span> ATLAS EXACT ENTITY WORK HEALTH & DISCOVERY PRIORITY
        </h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
          Distinción rigurosa entre cobertura de obra (WorkCoverage) y cobertura estricta del artista original (ExactEntityWorkCoverage)
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Works Scope</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', marginTop: '6px' }}>
            {recordedCount} / {totalMonitored}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {unmeasuredCount} awaiting sample
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #166534', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EntityWork ≥ 80%</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#22c55e', marginTop: '6px' }}>{count80Plus}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Strong Fast Path Ready</div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e40af', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EntityWork 60–79%</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#3b82f6', marginTop: '6px' }}>{count60To79}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Fast Path + Backfill</div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #854d0e', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EntityWork 30–59%</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#eab308', marginTop: '6px' }}>{count30To59}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Hybrid Fallback</div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #991b1b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EntityWork &lt; 30%</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444', marginTop: '6px' }}>{countSub30}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Déficit Crítico de Artista</div>
        </div>

        <div style={{ background: '#180e29', border: '1px solid #7c3aed', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Critical Gaps</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#a855f7', marginTop: '6px' }}>{criticalGapsCount}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Demanda × Déficit</div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Promedios @10</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
            {avgEntityWorkCoverage}% <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>(Work: {avgWorkCoverage}%)</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Precisión: 100%</div>
        </div>
      </div>

      {/* Discovery Opportunities Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              🎯 TOP DISCOVERY OPPORTUNITIES (Ordered by Gap Priority)
            </h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Priority = Demand × EntityImportance × ExactEntityWorkDeficit × OriginalArtistDeficit × SourceOpportunity × CoverPenalty
            </div>
          </div>
          <button
            onClick={loadData}
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            {loading ? 'Refrescando...' : '🔄 Refrescar'}
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#131c31', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
              <th style={{ padding: '12px 16px' }}>#</th>
              <th style={{ padding: '12px 16px' }}>Obra Canónica</th>
              <th style={{ padding: '12px 16px' }}>Artista Principal</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Atlas Físico</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Federados</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>EntityWork@10</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>WorkCov@10</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Covers</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Demanda 7d</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Prioridad</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  {loading ? 'Cargando datos de cobertura...' : 'No hay registros de obras aún. Ejecuta una búsqueda para inicializar la memoria.'}
                </td>
              </tr>
            ) : (
              records.map((r, i) => {
                const tierColor =
                  r.priorityTier === 'CRITICA' ? '#ef4444' :
                  r.priorityTier === 'ALTA' ? '#f59e0b' :
                  r.priorityTier === 'MEDIA' ? '#3b82f6' : '#10b981';

                const covColor =
                  r.exactEntityWorkCoverageAt10 >= 80 ? '#22c55e' :
                  r.exactEntityWorkCoverageAt10 >= 60 ? '#3b82f6' :
                  r.exactEntityWorkCoverageAt10 >= 30 ? '#eab308' : '#ef4444';

                return (
                  <tr key={r.workId} style={{ borderBottom: '1px solid #1e293b', background: i % 2 === 0 ? 'transparent' : '#0c1322' }}>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{i + 1}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>{r.canonicalTitle}</td>
                    <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{r.artist}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#38bdf8', fontWeight: 600 }}>{r.atlasPhysicalCount}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#c084fc' }}>{r.federatedExactCount}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: `${covColor}22`, color: covColor, fontWeight: 700 }}>
                        {r.exactEntityWorkCoverageAt10}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>{r.workCoverageAt10}%</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>{r.coverCount}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>{r.queryDemand7d}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#f8fafc' }}>
                      {r.priorityScore}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: `${tierColor}22`, color: tierColor, border: `1px solid ${tierColor}55` }}>
                        {r.priorityTier}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};


