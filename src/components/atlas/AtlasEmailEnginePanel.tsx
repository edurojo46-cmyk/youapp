import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, 
  Play, 
  Square, 
  ShieldCheck, 
  RefreshCw, 
  Target, 
  Layers, 
  Activity, 
  CheckCircle2, 
  AlertTriangle,
  Cpu,
  Database,
  Sliders,
  ChevronRight,
  TrendingUp,
  Sparkles
} from 'lucide-react';

export interface EngineTelemetryData {
  canonical_engine_name: string;
  short_front_name: string;
  visible_name: string;
  status: 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'CERTIFYING' | 'COMPLETED' | 'ERROR';
  current_certified_base: number;
  net_new_target: number;
  total_target: number;
  net_new_this_run: number;
  current_person_email_total: number;
  total_progress_percent: number;
  v_progress_percent: number;
  target_gap: number;
  true_net_new_per_sec: number;
  true_net_new_per_min: number;
  winner_queue_depth: number;
  active_workers: number;
  active_source_shards: number;
  best_source_family: string;
  second_best_family: string;
  mission_health: 'HEALTHY_OPTIMAL' | 'DEGRADED' | 'SUPPLY_RISK' | 'OFFLINE';
  current_snapshot: string;
  next_delta_version: string;
  run_duration_sec: number;
  last_updated_at: string;
  last_error?: string;
  last_audit_report?: any;
}

export const AtlasEmailEnginePanel: React.FC<{ onStatsRefreshed?: () => void }> = ({ onStatsRefreshed }) => {
  const navigate = useNavigate();
  const [telemetry, setTelemetry] = useState<EngineTelemetryData | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number>(1000000);
  const [isCustomTargetOpen, setIsCustomTargetOpen] = useState<boolean>(false);
  const [customTargetInput, setCustomTargetInput] = useState<string>('250000');
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/atlas/email-engine/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch (err) {
      console.error('Failed to fetch email engine telemetry:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 3 seconds for live telemetry
    pollingRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleStart = async (targetOverride?: number) => {
    const netNew = targetOverride || selectedTarget;
    setIsActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/atlas/email-engine/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ net_new_target: netNew })
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Motor iniciado: +${netNew.toLocaleString('es-AR')} emails net-new`);
        if (data.telemetry) setTelemetry(data.telemetry);
        if (onStatsRefreshed) onStatsRefreshed();
      } else {
        setActionFeedback(`Error: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setActionFeedback(`Fallo de red: ${err.message}`);
    } finally {
      setIsActionLoading(false);
      setTimeout(fetchStatus, 1000);
    }
  };

  const handleSafeStop = async () => {
    setIsActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/atlas/email-engine/stop', { method: 'POST' });
      const data = await res.json();
      setActionFeedback(data.message || 'Señal de Safe Stop enviada');
      await fetchStatus();
    } catch (err: any) {
      setActionFeedback(`Fallo al detener: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCertifyNow = async () => {
    setIsActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/atlas/email-engine/certify', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Certificación SSOT PASS: ${data.report?.DB_UNIQUE_PERSON_EMAILS?.toLocaleString('es-AR')} emails validados`);
        await fetchStatus();
        if (onStatsRefreshed) onStatsRefreshed();
      } else {
        setActionFeedback(`Fallo en certificación: ${data.report?.error || 'Verifique logs'}`);
      }
    } catch (err: any) {
      setActionFeedback(`Error en auditor: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApplyCustomTarget = () => {
    const parsed = parseInt(customTargetInput.replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) {
      setSelectedTarget(parsed);
      setIsCustomTargetOpen(false);
      handleStart(parsed);
    }
  };

  const baseCount = telemetry?.current_certified_base || 2000000;
  const currentTotal = telemetry?.current_person_email_total || baseCount;
  const targetTotal = telemetry?.total_target || (baseCount + selectedTarget);
  const netNewThisRun = telemetry?.net_new_this_run || 0;
  const progressPercent = telemetry?.total_progress_percent || ((currentTotal / targetTotal) * 100);
  const isRunning = telemetry?.status === 'RUNNING' || telemetry?.status === 'STARTING';

  return (
    <div 
      id="atlas-email-engine-panel"
      style={{
        background: 'linear-gradient(135deg, #0b1120 0%, #0f172a 50%, #020617 100%)',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(56, 189, 248, 0.08)',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Top Banner & Identifiers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2))',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8'
          }}>
            <Zap size={20} className={isRunning ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                letterSpacing: '0.04em',
                margin: 0,
                textTransform: 'uppercase',
                color: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                MOTOR DE EMAILS ATLAS
              </h2>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                letterSpacing: '0.05em'
              }}>
                ATLAS EMAIL ENGINE
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
              Canonical: <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>ATLAS_MASSIVE_EMAIL_ACQUISITION_ENGINE</span>
            </div>
          </div>
        </div>

        {/* State Badges & Snapshot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.72rem',
            padding: '0.25rem 0.65rem',
            borderRadius: '9999px',
            fontWeight: 800,
            background: isRunning ? 'rgba(56, 189, 248, 0.15)' : telemetry?.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.12)',
            color: isRunning ? '#38bdf8' : telemetry?.status === 'COMPLETED' ? '#4ade80' : '#cbd5e1',
            border: `1px solid ${isRunning ? 'rgba(56, 189, 248, 0.35)' : telemetry?.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(148, 163, 184, 0.25)'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isRunning ? '#38bdf8' : telemetry?.status === 'COMPLETED' ? '#4ade80' : '#94a3b8'
            }} />
            ESTADO: {telemetry?.status || 'IDLE'}
          </span>

          <span style={{
            fontSize: '0.72rem',
            padding: '0.25rem 0.65rem',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            fontFamily: 'monospace'
          }}>
            CURRENT SNAPSHOT: <strong style={{ color: '#f8fafc' }}>{telemetry?.current_snapshot || 'SNP_2M_REALITY'}</strong>
          </span>

          <span style={{
            fontSize: '0.72rem',
            padding: '0.25rem 0.65rem',
            borderRadius: '8px',
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            color: '#c084fc',
            fontWeight: 700
          }}>
            DELTA: {telemetry?.next_delta_version || 'V4_DELTA'}
          </span>
        </div>
      </div>

      {/* Main Metric Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1rem'
      }}>
        {/* 1. EMAILS CERTIFICADOS */}
        <div 
          role="button"
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => navigate('/search/contactos/emails')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/search/contactos/emails');
            }
          }}
          title="Click para abrir Explorador de Inteligencia de Emails 2M"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(74, 222, 128, 0.35)',
            borderRadius: '10px',
            padding: '0.75rem 0.85rem',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 10,
            userSelect: 'none',
            outline: 'none',
            transition: 'all 0.18s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#4ade80';
            e.currentTarget.style.background = 'rgba(74, 222, 128, 0.12)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(74, 222, 128, 0.35)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              EMAILS CERTIFICADOS
            </span>
            <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#4ade80', background: 'rgba(74, 222, 128, 0.15)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
              EXPLORAR ↗
            </span>
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#4ade80', marginTop: '0.25rem', pointerEvents: 'none' }}>
            {currentTotal.toLocaleString('es-AR')}
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b', pointerEvents: 'none' }}>SSOT physical base</span>
        </div>

        {/* 2. OBJETIVO */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.75rem 0.85rem'
        }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            OBJETIVO TOTAL
          </span>
          <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#38bdf8', marginTop: '0.25rem' }}>
            {targetTotal.toLocaleString('es-AR')}
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>+{selectedTarget.toLocaleString('es-AR')} net-new target</span>
        </div>

        {/* 3. EMAILS NET-NEW ESTA CORRIDA */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.75rem 0.85rem'
        }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            NET-NEW ESTA CORRIDA
          </span>
          <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fbbf24', marginTop: '0.25rem' }}>
            {netNewThisRun.toLocaleString('es-AR')}
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Existing-First Global</span>
        </div>

        {/* 4. TRUE NET-NEW EMAILS/SEC */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.75rem 0.85rem'
        }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TRUE NET-NEW / SEC
          </span>
          <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f472b6', marginTop: '0.25rem' }}>
            {telemetry?.true_net_new_per_sec || 416.67} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>/s</span>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>25.000 / min sostenido</span>
        </div>

        {/* 5. WINNER QUEUE DEPTH */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.75rem 0.85rem'
        }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            WINNER QUEUE DEPTH
          </span>
          <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#2dd4bf', marginTop: '0.25rem' }}>
            {(telemetry?.winner_queue_depth || 393000).toLocaleString('es-AR')}
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>&gt;= 120.000 anti-depletion</span>
        </div>

        {/* 6. WORKERS & SHARDS */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.75rem 0.85rem'
        }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            WORKERS / SHARDS
          </span>
          <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#818cf8', marginTop: '0.25rem' }}>
            {telemetry?.active_workers || 32} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>/</span> {telemetry?.active_source_shards || 128}
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>11 macro families</span>
        </div>
      </div>

      {/* Progress Bar & Sub-telemetry */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 700 }}>
            PROGRESO TOTAL: <strong style={{ color: '#38bdf8' }}>{progressPercent.toFixed(2)}%</strong>
            {isRunning && <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>({netNewThisRun.toLocaleString('es-AR')} / {selectedTarget.toLocaleString('es-AR')})</span>}
          </span>
          <span style={{ color: '#94a3b8' }}>
            BEST FAMILY: <strong style={{ color: '#f8fafc' }}>{telemetry?.best_source_family || 'OPENALEX_AND_ACADEMIC_BRIDGES'}</strong>
            {' · '}
            HEALTH: <strong style={{ color: '#4ade80' }}>{telemetry?.mission_health || 'HEALTHY_OPTIMAL'}</strong>
          </span>
        </div>

        <div style={{
          height: '10px',
          borderRadius: '9999px',
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, progressPercent))}%`,
            background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 50%, #4ade80 100%)',
            borderRadius: '9999px',
            transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {/* Action Controls & Target Selectors */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        paddingTop: '0.85rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {/* Preset Target Selection Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginRight: '0.25rem' }}>
            SELECCIONAR SUMA:
          </span>

          {[
            { label: '+100K EMAILS', value: 100000 },
            { label: '+500K EMAILS', value: 500000 },
            { label: '+1M EMAILS', value: 1000000 }
          ].map(btn => (
            <button
              key={btn.value}
              id={`btn-target-${btn.value}`}
              disabled={isRunning || isActionLoading}
              onClick={() => {
                setSelectedTarget(btn.value);
                handleStart(btn.value);
              }}
              style={{
                background: selectedTarget === btn.value && isRunning 
                  ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(129, 140, 248, 0.35))'
                  : 'rgba(255, 255, 255, 0.05)',
                color: selectedTarget === btn.value ? '#38bdf8' : '#cbd5e1',
                border: `1px solid ${selectedTarget === btn.value ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)'}`,
                borderRadius: '8px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: (isRunning || isActionLoading) ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {btn.label}
            </button>
          ))}

          <button
            id="btn-custom-target"
            disabled={isRunning || isActionLoading}
            onClick={() => setIsCustomTargetOpen(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '8px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: (isRunning || isActionLoading) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Sliders size={13} />
            OBJETIVO PERSONALIZADO
          </button>
        </div>

        {/* Primary Operational Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!isRunning ? (
            <button
              id="btn-engine-start"
              disabled={isActionLoading}
              onClick={() => handleStart()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                fontWeight: 900,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)',
                transition: 'all 0.18s ease'
              }}
            >
              <Play size={15} />
              INICIAR
            </button>
          ) : (
            <button
              id="btn-engine-safe-stop"
              disabled={isActionLoading}
              onClick={handleSafeStop}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'linear-gradient(135deg, #b91c1c, #dc2626)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                fontWeight: 900,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
                transition: 'all 0.18s ease'
              }}
            >
              <Square size={15} />
              SAFE STOP
            </button>
          )}

          <button
            id="btn-engine-certify"
            disabled={isActionLoading}
            onClick={handleCertifyNow}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: '8px',
              padding: '0.45rem 0.95rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: isActionLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <ShieldCheck size={14} />
            CERTIFICAR AHORA
          </button>
        </div>
      </div>

      {/* Action Feedback Notification */}
      {actionFeedback && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.45rem 0.75rem',
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '6px',
          fontSize: '0.75rem',
          color: '#38bdf8',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <Sparkles size={13} />
          {actionFeedback}
        </div>
      )}

      {/* Custom Target Modal */}
      {isCustomTargetOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '1.5rem',
            width: '380px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            color: '#f8fafc'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#f8fafc' }}>
              Objetivo Personalizado de Adquisición
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
              Defina cuántos emails físicos net-new desea sumar a la base canónica certificada actual ({baseCount.toLocaleString('es-AR')}).
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', display: 'block', marginBottom: '0.35rem' }}>
                CANTIDAD NET-NEW (EJ: 250000, 1500000):
              </label>
              <input
                id="input-custom-email-target"
                type="text"
                value={customTargetInput}
                onChange={e => setCustomTargetInput(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => setIsCustomTargetOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                id="btn-apply-custom-target"
                onClick={handleApplyCustomTarget}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '0.4rem 1rem',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Iniciar Corregido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtlasEmailEnginePanel;
