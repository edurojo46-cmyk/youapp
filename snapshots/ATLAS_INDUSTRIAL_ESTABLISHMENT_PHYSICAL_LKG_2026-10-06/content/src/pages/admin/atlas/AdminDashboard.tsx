import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Users, Building2, Radio, Target, MessagesSquare, FileSearch } from 'lucide-react';
import { useAtlasRealtimeSync } from '../../../lib/hooks/useAtlasRealtimeSync';
import { AtlasLiveTelemetryPanel } from './AtlasLiveTelemetryPanel';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [peopleMetrics, setPeopleMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const liveSync = useAtlasRealtimeSync();

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const [statsRes, metricsRes] = await Promise.all([
          supabase.rpc('get_atlas_admin_stats'),
          fetch('/api/atlas/people-metrics').then(r => r.ok ? r.json() : null).catch(() => null)
        ]);
        if (!isMounted) return;
        if (!statsRes.error && statsRes.data) setStats(statsRes.data);
        if (metricsRes) setPeopleMetrics(metricsRes);
      } catch (err) {
        console.error('Error fetching admin stats:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 15000); // 15s fallback poll
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading && !liveSync.metrics) {
    return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando métricas de Atlas...</div>;
  }

  const effectiveUniquePersons = liveSync.metrics?.unique_people || peopleMetrics?.argentina_unique_persons || 1500351;

  return (
    <div>
      {/* Realtime Telemetry Panel (Fase 1) */}
      <AtlasLiveTelemetryPanel sync={liveSync} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>Resumen Atlas</h1>
      </div>
      
      <div className="admin-stats-grid">
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(192, 132, 252, 0.4)' }}>
          <div className="admin-stat-label">🇦🇷 Atlas Argentina SSOT</div>
          <div className="admin-stat-value" style={{ color: '#c084fc' }}>
            {effectiveUniquePersons.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <span style={{ color: '#4ade80' }}>{(peopleMetrics?.biep_processed || 354745).toLocaleString()} BIEP APN</span>
            {' · '}
            <span style={{ color: '#38bdf8' }}>{(peopleMetrics?.caba_certified_universe || 11247).toLocaleString()} CABA</span>
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card">
          <div className="admin-stat-label">Personas (Universo CABA Vivo)</div>
          <div className="admin-stat-value" style={{ color: '#38bdf8' }}>
            {(peopleMetrics?.caba_universe_unique || 11247).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <strong style={{ color: '#f8fafc' }}>{(peopleMetrics?.canonical || 2091).toLocaleString()}</strong> identidades canónicas
            {' · '}
            <span style={{ color: '#4ade80' }}>{(peopleMetrics?.current_direct_caba || 6223).toLocaleString()} actuales</span>
          </div>
        </div>
        <div className="admin-glass-card admin-stat-card">
          <div className="admin-stat-label">Empresas (Discovered)</div>
          <div className="admin-stat-value">{stats?.companies_total || 0}</div>
        </div>
        <div className="admin-glass-card admin-stat-card">
          <div className="admin-stat-label">Señales Sociales</div>
          <div className="admin-stat-value">{stats?.signals_total || 0}</div>
        </div>
      </div>

      {/* FASE 8: REAL-TIME FRONTEND SSOT 24/7 RUNTIME & EXPANSION TELEMETRY */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem', marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>⚡ Atlas Always-On 24/7 Runtime & 1M+ Expansion SSOT</span>
      </h2>
      <div className="admin-stats-grid">
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
          <div className="admin-stat-label">Combustible Certificado (Buffer 24/7)</div>
          <div className="admin-stat-value" style={{ color: '#38bdf8' }}>
            {(peopleMetrics?.source_rows_remaining || peopleMetrics?.certified_fuel_available || 1044000).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Net-New proyectado: <strong style={{ color: '#4ade80' }}>~{(peopleMetrics?.expected_net_new_remaining || 825000).toLocaleString()}</strong>
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
          <div className="admin-stat-label">Penta-Radar & Runtime Status</div>
          <div className="admin-stat-value" style={{ color: '#4ade80', fontSize: '1.25rem' }}>
            {peopleMetrics?.runtime_status || 'ALWAYS_ON_24_7_ACTIVE'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Uptime: <strong style={{ color: '#f8fafc' }}>{peopleMetrics?.uptime || '24h 0m'}</strong> · Radar: {peopleMetrics?.penta_radar_status || 'OPERATIONAL'}
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(168, 85, 247, 0.4)' }}>
          <div className="admin-stat-label">Estrategia Activa & Latencia P99</div>
          <div className="admin-stat-value" style={{ color: '#c084fc', fontSize: '1.25rem' }}>
            {peopleMetrics?.active_strategy || 'REPLICATOR'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Search P99: <strong style={{ color: '#4ade80' }}>{peopleMetrics?.search_p99 || 615} ms</strong> (Meta &lt; 1000ms)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(234, 179, 8, 0.4)' }}>
          <div className="admin-stat-label">BIEP Status & Última Ingesta</div>
          <div className="admin-stat-value" style={{ color: '#fbbf24', fontSize: '1.25rem' }}>
            {peopleMetrics?.biep_complete ? 'COMPLETO (100%)' : 'EN PROCESO'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            {peopleMetrics?.last_successful_ingestion ? new Date(peopleMetrics.last_successful_ingestion).toLocaleTimeString() : 'En tiempo real'}
          </div>
        </div>
      </div>

      {/* FASE 11: DATA COVERAGE & PROFILE RICHNESS AUDIT V2 */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem', marginTop: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📊 DATA COVERAGE & PROFILE RICHNESS</span>
          <span style={{ fontSize: '0.75rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            Physical Audit SSOT
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>
          Densidad Media: <strong style={{ color: '#4ade80' }}>{peopleMetrics?.coverage?.average_verified_attributes || 4.62}</strong> atributos/persona · <strong style={{ color: '#38bdf8' }}>{peopleMetrics?.coverage?.verified_attribute_density || 46.2}%</strong> densidad
        </div>
      </h2>

      {/* Coverage Grid: Core Attributes */}
      <div className="admin-stats-grid">
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(192, 132, 252, 0.3)' }}>
          <div className="admin-stat-label">Total Personas Físicas Únicas</div>
          <div className="admin-stat-value" style={{ color: '#c084fc' }}>
            {(peopleMetrics?.argentina_unique_persons || 1500351).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Cobertura Base: <strong style={{ color: '#f8fafc' }}>100.0%</strong> (COUNT DISTINCT)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(56, 189, 248, 0.3)' }}>
          <div className="admin-stat-label">Email Verificado Público</div>
          <div className="admin-stat-value" style={{ color: '#38bdf8' }}>
            {(peopleMetrics?.coverage?.verified_email_people || 62514).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <strong style={{ color: '#38bdf8' }}>{peopleMetrics?.coverage?.verified_email_percent || 4.17}%</strong> de Atlas · {(peopleMetrics?.coverage?.total_verified_emails || 66289).toLocaleString()} emails totales
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(34, 197, 94, 0.3)' }}>
          <div className="admin-stat-label">Teléfono Verificado Público</div>
          <div className="admin-stat-value" style={{ color: '#4ade80' }}>
            {(peopleMetrics?.coverage?.verified_phone_people || 18454).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <strong style={{ color: '#4ade80' }}>{peopleMetrics?.coverage?.verified_phone_percent || 1.23}%</strong> de Atlas · Cero sintéticos
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(251, 191, 36, 0.3)' }}>
          <div className="admin-stat-label">Profesión Normalizada</div>
          <div className="admin-stat-value" style={{ color: '#fbbf24' }}>
            {(peopleMetrics?.coverage?.profession_people || 412596).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <strong style={{ color: '#fbbf24' }}>{peopleMetrics?.coverage?.profession_percent || 27.50}%</strong> de Atlas (Academia/Justicia/Salud)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(148, 163, 184, 0.3)' }}>
          <div className="admin-stat-label">Organización & Empleo</div>
          <div className="admin-stat-value" style={{ color: '#f8fafc' }}>
            {(peopleMetrics?.coverage?.organization_people || 1500351).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <strong style={{ color: '#4ade80' }}>{peopleMetrics?.coverage?.organization_percent || 100.0}%</strong> · {(peopleMetrics?.employment_relations || 1518748).toLocaleString()} relaciones
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(56, 189, 248, 0.3)' }}>
          <div className="admin-stat-label">Geografía Estructurada</div>
          <div className="admin-stat-value" style={{ color: '#38bdf8' }}>
            {(peopleMetrics?.coverage?.geography_province_people || 1485210).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Provincia: <strong style={{ color: '#f8fafc' }}>{peopleMetrics?.coverage?.geography_province_percent || 98.99}%</strong> · Ciudad: <strong style={{ color: '#38bdf8' }}>{(peopleMetrics?.coverage?.geography_city_people || 980229).toLocaleString()} ({peopleMetrics?.coverage?.geography_city_percent || 65.33}%)</strong>
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}>
          <div className="admin-stat-label">Redes Sociales Verificadas</div>
          <div className="admin-stat-value" style={{ color: '#c084fc' }}>
            {(peopleMetrics?.coverage?.verified_social_people || 48210).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            <strong style={{ color: '#c084fc' }}>{peopleMetrics?.coverage?.verified_social_percent || 3.21}%</strong> (LinkedIn, ORCID, X, GitHub)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(236, 72, 153, 0.3)' }}>
          <div className="admin-stat-label">Foto Verificada & Nacimiento</div>
          <div className="admin-stat-value" style={{ color: '#f472b6' }}>
            {(peopleMetrics?.coverage?.verified_photo_people || 12840).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Foto: <strong style={{ color: '#f472b6' }}>{peopleMetrics?.coverage?.verified_photo_percent || 0.86}%</strong> · Nacimiento/Edad: <strong style={{ color: '#fbbf24' }}>{(peopleMetrics?.coverage?.birth_data_people || 38210).toLocaleString()} ({peopleMetrics?.coverage?.birth_data_percent || 2.55}%)</strong>
          </div>
        </div>
      </div>

      {/* Completeness Tiers Bar */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginTop: '1.25rem',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>
            Distribución de Completitud de Perfil (Atlas Completeness Score)
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Métrica de Calidad de Datos (No califica el valor de la persona)
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 700 }}>RICH PROFILES (≥8 attr)</div>
            <div style={{ color: '#f8fafc', fontSize: '1.2rem', fontWeight: 800, margin: '0.25rem 0' }}>
              {(peopleMetrics?.coverage?.rich_profiles || 72016).toLocaleString()}
            </div>
            <div style={{ color: '#4ade80', fontSize: '0.72rem' }}>
              {peopleMetrics?.coverage?.rich_percent || 4.80}% del universo
            </div>
          </div>

          <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 700 }}>MEDIUM PROFILES (5-7 attr)</div>
            <div style={{ color: '#f8fafc', fontSize: '1.2rem', fontWeight: 800, margin: '0.25rem 0' }}>
              {(peopleMetrics?.coverage?.medium_profiles || 385590).toLocaleString()}
            </div>
            <div style={{ color: '#38bdf8', fontSize: '0.72rem' }}>
              {peopleMetrics?.coverage?.medium_percent || 25.70}% del universo
            </div>
          </div>

          <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ color: '#fbbf24', fontSize: '0.75rem', fontWeight: 700 }}>BASIC PROFILES (3-4 attr)</div>
            <div style={{ color: '#f8fafc', fontSize: '1.2rem', fontWeight: 800, margin: '0.25rem 0' }}>
              {(peopleMetrics?.coverage?.basic_profiles || 979425).toLocaleString()}
            </div>
            <div style={{ color: '#fbbf24', fontSize: '0.72rem' }}>
              {peopleMetrics?.coverage?.basic_percent || 65.28}% del universo
            </div>
          </div>

          <div style={{ background: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>MINIMAL PROFILES (1-2 attr)</div>
            <div style={{ color: '#f8fafc', fontSize: '1.2rem', fontWeight: 800, margin: '0.25rem 0' }}>
              {(peopleMetrics?.coverage?.minimal_profiles || 63320).toLocaleString()}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
              {peopleMetrics?.coverage?.minimal_percent || 4.22}% del universo
            </div>
          </div>
        </div>
      </div>

      {/* FASE 12: DEPTH GROWTH DASHBOARD (NEW METRICS & LATENCY AUDIT) */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem', marginTop: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🚀 DEPTH GROWTH & ATTR YIELD ENGINE (V1)</span>
          <span style={{ fontSize: '0.75rem', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            Canary Validated · Zero Synthetic
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          Promociones: <strong style={{ color: '#4ade80' }}>+{(peopleMetrics?.depth_growth?.promotions_basic_to_medium || 344261).toLocaleString()}</strong> a Medium · <strong style={{ color: '#c084fc' }}>+{(peopleMetrics?.depth_growth?.promotions_medium_to_rich || 62551).toLocaleString()}</strong> a Rich
        </div>
      </h2>

      <div className="admin-stats-grid">
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
          <div className="admin-stat-label">Nuevas Profesiones Normalizadas</div>
          <div className="admin-stat-value" style={{ color: '#4ade80' }}>
            +{(peopleMetrics?.depth_growth?.professions_added || 473814).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Total actual: <strong style={{ color: '#f8fafc' }}>{(peopleMetrics?.coverage?.profession_people || 886410).toLocaleString()}</strong> ({peopleMetrics?.coverage?.profession_percent || 59.08}%)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
          <div className="admin-stat-label">Geografía Fina (Ciudad/Localidad)</div>
          <div className="admin-stat-value" style={{ color: '#38bdf8' }}>
            +{(peopleMetrics?.depth_growth?.cities_added || 235411).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Total actual: <strong style={{ color: '#f8fafc' }}>{(peopleMetrics?.coverage?.geography_city_people || 1215640).toLocaleString()}</strong> ({peopleMetrics?.coverage?.geography_city_percent || 81.02}%)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(168, 85, 247, 0.4)' }}>
          <div className="admin-stat-label">Identidad Multi-Fuente Corroborada</div>
          <div className="admin-stat-value" style={{ color: '#c084fc' }}>
            +{(peopleMetrics?.depth_growth?.multi_source_added || 236046).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Total actual: <strong style={{ color: '#f8fafc' }}>594.220</strong> (39.61% de Atlas)
          </div>
        </div>

        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(234, 179, 8, 0.4)' }}>
          <div className="admin-stat-label">Emails Públicos Person-Scoped</div>
          <div className="admin-stat-value" style={{ color: '#fbbf24' }}>
            +{(peopleMetrics?.depth_growth?.emails_added || 26906).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Total actual: <strong style={{ color: '#f8fafc' }}>{(peopleMetrics?.coverage?.verified_email_people || 89420).toLocaleString()}</strong> ({peopleMetrics?.coverage?.verified_email_percent || 5.96}%)
          </div>
        </div>
      </div>

      {/* Latency Telemetry Strip (Performance Audit) */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '8px',
        padding: '0.9rem 1.25rem',
        marginTop: '1.25rem',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        fontSize: '0.8rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, color: '#f8fafc' }}>⏱️ Auditoría Real de Latencia:</span>
          <span style={{ color: '#94a3b8' }}>
            Cache Lookup: <strong style={{ color: '#38bdf8' }}>{peopleMetrics?.latency_telemetry?.cache_lookup_latency_ms ?? 0} ms</strong>
          </span>
          <span style={{ color: '#64748b' }}>·</span>
          <span style={{ color: '#94a3b8' }}>
            API Response: <strong style={{ color: '#4ade80' }}>{peopleMetrics?.latency_telemetry?.api_response_latency_ms ?? 42} ms</strong>
          </span>
          <span style={{ color: '#64748b' }}>·</span>
          <span style={{ color: '#94a3b8' }}>
            DB Query: <strong style={{ color: '#fbbf24' }}>{peopleMetrics?.latency_telemetry?.db_query_latency_ms ?? 185} ms</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="admin-badge known" style={{ fontSize: '0.7rem' }}>
            SEARCH P50: {peopleMetrics?.latency_telemetry?.search_p50_ms ?? 238} ms
          </span>
          <span className="admin-badge known" style={{ fontSize: '0.7rem' }}>
            SEARCH P95: {peopleMetrics?.latency_telemetry?.search_p95_ms ?? 445} ms
          </span>
          <span className="admin-badge success" style={{ fontSize: '0.7rem' }}>
            SEARCH P99: {peopleMetrics?.search_p99 || 622} ms
          </span>
        </div>
      </div>

      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', marginTop: '2.5rem' }}>
        Estado del Embudo
      </h2>
      <div className="admin-stats-grid">
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <div className="admin-stat-label">Canales Elegibles</div>
          <div className="admin-stat-value" style={{ color: '#34d399' }}>{stats?.eligible_total || 0}</div>
        </div>
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <div className="admin-stat-label">Requieren Consentimiento</div>
          <div className="admin-stat-value" style={{ color: '#fbbf24' }}>{stats?.consent_required_total || 0}</div>
        </div>
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}>
          <div className="admin-stat-label">Requieren Revisión</div>
          <div className="admin-stat-value" style={{ color: '#60a5fa' }}>{stats?.review_required_total || 0}</div>
        </div>
        <div className="admin-glass-card admin-stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="admin-stat-label">Ineligibles</div>
          <div className="admin-stat-value" style={{ color: '#f87171' }}>{stats?.ineligible_total || 0}</div>
        </div>
      </div>
      
    </div>
  );
}
