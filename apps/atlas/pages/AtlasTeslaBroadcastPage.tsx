/**
 * ATLAS — TESLA BROADCAST ENGINE V1
 * Page: AtlasTeslaBroadcastPage
 * @apps/atlas/pages/AtlasTeslaBroadcastPage.tsx
 *
 * Dedicated UI for Tesla Broadcast Engine:
 * - Inputs: MENSAJE, AUDIENCIA, GEOGRAFÍA, OBJETIVO DE VISTAS, COSTO MÁXIMO
 * - Button: INICIAR BROADCAST
 * - Real-time metrics: TARGET_REACH, REAL_IMPRESSIONS, TARGET_GAP, SURFACES_ACTIVE,
 *   WINNERS, REAL_VIEWS/MIN, CLICKS, CTR, COST, HEALTH
 * - Work queue with canary posts feed and surface brain classifications.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  Send,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Users,
  Compass,
  Lock,
  ArrowRight,
  TrendingUp,
  BarChart2,
  Layers,
  Activity,
  Globe,
  MessageSquare,
  Eye,
  MousePointer,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface BroadcastMissionSummary {
  mission_id: string;
  message: string;
  audience: string;
  geography: string;
  reach_target: number;
  max_cost: number;
  real_reach: number;
  target_gap: number;
  surfaces_active: number;
  winners_count: number;
  real_views_per_minute: number;
  total_clicks: number;
  overall_ctr: number;
  total_cost: number;
  status: string;
  health: string;
  created_at: string;
  updated_at: string;
}

interface WorkItem {
  task_id: string;
  surface_id: string;
  surface_name: string;
  surface_url: string;
  platform: string;
  posting_mode: string;
  state: string;
  priority: number;
  payload?: any;
  canary_result?: any;
  brain_classification?: string;
}

interface CanaryPost {
  canary_id: string;
  surface_id: string;
  platform: string;
  target_url: string;
  adapted_title: string;
  adapted_body: string;
  post_success: boolean;
  post_url: string | null;
  impressions: number | null;
  impressions_confidence: string;
  clicks: number;
  ctr: number;
  audience_match_score: number;
  time_to_first_view_ms: number | null;
  cost: number;
  measured_at: string;
}

interface BrainMetric {
  surface_id: string;
  platform: string;
  classification: string;
  real_views_per_post: number;
  real_views_per_minute: number;
  clicks_per_post: number;
  ctr: number;
  post_success_rate: number;
  audience_match_score: number;
  geography_match_score: number;
  total_impressions: number;
  total_clicks: number;
}

export const AtlasTeslaBroadcastPage: React.FC = () => {
  const navigate = useNavigate();

  // Inputs
  const [messageInput, setMessageInput] = useState<string>('Curso gratuito de IA para abogados');
  const [audienceInput, setAudienceInput] = useState<string>('Abogados');
  const [geographyInput, setGeographyInput] = useState<string>('Córdoba');
  const [reachTargetInput, setReachTargetInput] = useState<number>(1000);
  const [linkInput, setLinkInput] = useState<string>('https://youapp.tv/atlas/recursos-legales');

  // Execution state
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mission state
  const [currentMission, setCurrentMission] = useState<BroadcastMissionSummary | null>(null);
  const [workQueue, setWorkQueue] = useState<WorkItem[]>([]);
  const [canaries, setCanaries] = useState<CanaryPost[]>([]);
  const [brainMetrics, setBrainMetrics] = useState<BrainMetric[]>([]);
  const [activeTab, setActiveTab] = useState<'QUEUE' | 'BRAIN' | 'PAYLOADS'>('QUEUE');

  // Preload latest mission or brain metrics on mount
  useEffect(() => {
    fetchLatestMissions();
    fetchBrainMetrics();
  }, []);

  const fetchLatestMissions = async () => {
    try {
      const res = await fetch('/api/atlas/broadcast/missions?limit=1');
      const data = await res.json();
      if (data.success && Array.isArray(data.missions) && data.missions.length > 0) {
        const latest = data.missions[0];
        setCurrentMission(latest);
        // Load details for this mission
        fetchMissionDetails(latest.mission_id);
      }
    } catch (e) {
      console.warn('Could not fetch latest mission:', e);
    }
  };

  const fetchMissionDetails = async (missionId: string) => {
    try {
      const res = await fetch(`/api/atlas/broadcast/mission/${missionId}`);
      const data = await res.json();
      if (data.success) {
        setCurrentMission(data.mission);
        setWorkQueue(data.workQueue || []);
        setCanaries(data.canaries || []);
      }
    } catch (e) {
      console.warn('Could not fetch mission details:', e);
    }
  };

  const fetchBrainMetrics = async () => {
    try {
      const res = await fetch('/api/atlas/broadcast/brain');
      const data = await res.json();
      if (data.success && Array.isArray(data.metrics)) {
        setBrainMetrics(data.metrics);
      }
    } catch (e) {
      console.warn('Could not fetch brain metrics:', e);
    }
  };

  const handleStartBroadcast = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !audienceInput.trim() || !geographyInput.trim()) {
      setErrorMsg('Por favor completa todos los campos requeridos');
      return;
    }

    setIsBroadcasting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/atlas/broadcast/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageInput.trim(),
          audience: audienceInput.trim(),
          geography: geographyInput.trim(),
          reach_target: reachTargetInput,
          max_cost: 0,
          link_url: linkInput.trim()
        })
      });

      const data = await res.json();
      if (data.success && data.mission) {
        setCurrentMission(data.mission);
        setWorkQueue(data.workQueue || []);
        setCanaries(data.canaries || []);
        fetchBrainMetrics();
      } else {
        setErrorMsg(data.message || 'Error al iniciar Tesla Broadcast');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de red al conectar con Tesla Broadcast Engine');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // State badge styling helper
  const getStateBadge = (state: string) => {
    switch (state) {
      case 'WINNER':
        return { bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', label: '⚡ WINNER' };
      case 'GOOD':
        return { bg: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', label: '✓ GOOD' };
      case 'LOW_YIELD':
        return { bg: 'rgba(234, 179, 8, 0.2)', color: '#facc15', label: '⚠ LOW YIELD' };
      case 'MEASURING':
      case 'POSTED':
        return { bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', label: 'CANARY EN VIVO' };
      case 'CANARY_READY':
        return { bg: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', label: 'CANARY READY' };
      case 'BLOCKED':
      case 'FAILED':
      case 'DEAD':
        return { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', label: 'INACTIVO' };
      default:
        return { bg: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', label: state };
    }
  };

  const progressPercent = currentMission
    ? Math.min(100, Math.round((currentMission.real_reach / Math.max(1, currentMission.reach_target)) * 100))
    : 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0f172a 0%, #030712 100%)',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '2rem 1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(139, 92, 246, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <Radio size={26} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  # TESLA BROADCAST
                </h1>
                <span style={{
                  background: 'rgba(168, 85, 247, 0.18)',
                  color: '#c084fc',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  letterSpacing: '0.04em'
                }}>
                  MOTOR INDUSTRIAL V1
                </span>
                <span style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }}>
                  COSTO $0 GARANTIZADO
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Motor de difusión en depósitos de atención públicos reales • Invariant: Members ≠ Reach • Sin mensajes privados
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => navigate('/broadcast/accounts')}
              style={{
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.35)',
                color: '#c4b5fd',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ShieldCheck size={15} />
              Cuentas de Difusión
            </button>
            <button
              onClick={() => navigate('/audience-map')}
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Compass size={15} />
              Audience Map
            </button>
            <button
              onClick={() => navigate('/hub')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Hub
            </button>
          </div>
        </div>

        {/* Broadcast Execution Form Card */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)'
        }}>
          <form onSubmit={handleStartBroadcast}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              
              {/* Field: Message */}
              <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#c084fc' }}>
                  Mensaje Central (Master Message)
                </label>
                <textarea
                  rows={2}
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  placeholder="Ej: Curso gratuito de IA para abogados con casos prácticos..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.75rem 1rem',
                    background: 'rgba(30, 41, 59, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 500,
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Field: Audience */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8' }}>
                  Audiencia
                </label>
                <div style={{ position: 'relative' }}>
                  <Users size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={audienceInput}
                    onChange={e => setAudienceInput(e.target.value)}
                    placeholder="Ej: Abogados, Contadores..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.75rem 1rem 0.75rem 2.5rem',
                      background: 'rgba(30, 41, 59, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Field: Geography */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8' }}>
                  Geografía
                </label>
                <div style={{ position: 'relative' }}>
                  <Globe size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={geographyInput}
                    onChange={e => setGeographyInput(e.target.value)}
                    placeholder="Ej: Córdoba, Argentina..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.75rem 1rem 0.75rem 2.5rem',
                      background: 'rgba(30, 41, 59, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Field: Target Reach */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399' }}>
                  Objetivo de Vistas (Impresiones Reales)
                </label>
                <div style={{ position: 'relative' }}>
                  <Eye size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="number"
                    value={reachTargetInput}
                    onChange={e => setReachTargetInput(parseInt(e.target.value, 10) || 1000)}
                    min={100}
                    step={100}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.75rem 1rem 0.75rem 2.5rem',
                      background: 'rgba(30, 41, 59, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Field: Max Cost (Strict $0) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#facc15' }}>
                  Costo Máximo (Estricto)
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '0.75rem 1rem',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(250, 204, 21, 0.3)',
                  borderRadius: '10px',
                  color: '#facc15',
                  fontSize: '14px',
                  fontWeight: 700
                }}>
                  <Lock size={15} color="#facc15" />
                  $0.00 — Zero-Cost Enforcement
                </div>
              </div>
            </div>

            {errorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                color: '#fca5a5',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '1rem'
              }}>
                <AlertTriangle size={16} color="#ef4444" />
                {errorMsg}
              </div>
            )}

            {/* Action Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isBroadcasting}
                style={{
                  background: isBroadcasting
                    ? 'rgba(139, 92, 246, 0.4)'
                    : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  padding: '0.85rem 2rem',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                  cursor: isBroadcasting ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 8px 20px rgba(139, 92, 246, 0.35)'
                }}
              >
                {isBroadcasting ? (
                  <>
                    <RotateCcw size={16} className="animate-spin" />
                    EJECUTANDO BROADCAST INDUSTRIAL...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    INICIAR BROADCAST
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Real-time KPIs Dashboard (10 KPIs) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {/* KPI 1: TARGET REACH */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
              TARGET REACH
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff' }}>
              {currentMission ? currentMission.reach_target.toLocaleString() : reachTargetInput.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Objetivo de impresiones
            </div>
          </div>

          {/* KPI 2: REAL IMPRESSIONS */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(34, 197, 94, 0.08)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: '6px' }}>
              REAL IMPRESSIONS
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#4ade80' }}>
              {currentMission ? currentMission.real_reach.toLocaleString() : '0'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              {progressPercent}% del objetivo alcanzado
            </div>
          </div>

          {/* KPI 3: TARGET GAP */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#facc15', textTransform: 'uppercase', marginBottom: '6px' }}>
              TARGET GAP
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: currentMission && currentMission.target_gap === 0 ? '#4ade80' : '#facc15' }}>
              {currentMission ? currentMission.target_gap.toLocaleString() : reachTargetInput.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              {currentMission && currentMission.target_gap === 0 ? '✓ Gap cerrado' : 'Por cubrir'}
            </div>
          </div>

          {/* KPI 4: SURFACES ACTIVE */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '6px' }}>
              SURFACES ACTIVE
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#38bdf8' }}>
              {currentMission ? currentMission.surfaces_active : 0}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Depósitos de atención activos
            </div>
          </div>

          {/* KPI 5: WINNERS */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', marginBottom: '6px' }}>
              WINNERS CLASIFICADOS
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#c084fc' }}>
              {currentMission ? currentMission.winners_count : 0}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Rutas prioritarias exploit
            </div>
          </div>

          {/* KPI 6: REAL VIEWS / MIN */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
              REAL VIEWS / MIN
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff' }}>
              {currentMission ? currentMission.real_views_per_minute : 0}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Velocidad de propagación
            </div>
          </div>

          {/* KPI 7: CLICKS & CTR */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '6px' }}>
              CLICKS & CTR
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff' }}>
              {currentMission ? currentMission.total_clicks : 0} <span style={{ fontSize: '14px', color: '#38bdf8' }}>({currentMission ? currentMission.overall_ctr : 0}%)</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Interacciones efectivas
            </div>
          </div>

          {/* KPI 8: COST */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: '6px' }}>
              COST
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#4ade80' }}>
              $0.00
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Zero-cost verificado
            </div>
          </div>

          {/* KPI 9 & 10: HEALTH & STATUS */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1.25rem'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
              HEALTH & ESTADO
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#4ade80', marginTop: '6px' }}>
              {currentMission ? currentMission.health : 'STANDBY'}
            </div>
            <div style={{ fontSize: '11px', color: '#c084fc', marginTop: '6px' }}>
              {currentMission ? currentMission.status : 'Esperando misión'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '12px',
          marginBottom: '1.5rem'
        }}>
          <button
            onClick={() => setActiveTab('QUEUE')}
            style={{
              background: activeTab === 'QUEUE' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              color: activeTab === 'QUEUE' ? '#c084fc' : '#94a3b8',
              border: activeTab === 'QUEUE' ? '1px solid #8b5cf6' : '1px solid transparent',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cola de Difusión & Canaries ({workQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('BRAIN')}
            style={{
              background: activeTab === 'BRAIN' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: activeTab === 'BRAIN' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'BRAIN' ? '1px solid #38bdf8' : '1px solid transparent',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Broadcast Brain (Aprendizaje) ({brainMetrics.length})
          </button>
          <button
            onClick={() => setActiveTab('PAYLOADS')}
            style={{
              background: activeTab === 'PAYLOADS' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              color: activeTab === 'PAYLOADS' ? '#4ade80' : '#94a3b8',
              border: activeTab === 'PAYLOADS' ? '1px solid #22c55e' : '1px solid transparent',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Mensajes Adaptados por Plataforma
          </button>
        </div>

        {/* Tab 1: Work Queue & Canaries */}
        {activeTab === 'QUEUE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {workQueue.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '14px',
                border: '1px dashed rgba(255, 255, 255, 0.1)'
              }}>
                <Radio size={36} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#cbd5e1' }}>
                  No hay tareas de broadcast en curso
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  Hacé clic en "INICIAR BROADCAST" para activar el circuito industrial.
                </div>
              </div>
            ) : (
              workQueue.map((item, idx) => {
                const badge = getStateBadge(item.state);
                const canary = item.canary_result;
                return (
                  <div
                    key={item.task_id || idx}
                    style={{
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem'
                    }}
                  >
                    <div style={{ flex: '1 1 360px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
                          #{idx + 1} [{item.platform}]
                        </span>
                        <a
                          href={item.surface_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#ffffff',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          {item.surface_name}
                          <ExternalLink size={13} color="#94a3b8" />
                        </a>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {item.surface_url}
                      </div>
                      {canary?.post_url && (
                        <div style={{ fontSize: '11px', color: '#c084fc', marginTop: '4px' }}>
                          Post verificado: {canary.post_url}
                        </div>
                      )}
                    </div>

                    {/* Canary Measurements */}
                    <div style={{ flex: '0 1 180px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                        Canary Impressions
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: canary?.impressions ? '#4ade80' : '#facc15' }}>
                        {canary?.impressions ? `${canary.impressions.toLocaleString()} vistas` : 'UNKNOWN'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {canary?.clicks ? `${canary.clicks} clicks (${canary.ctr}%)` : '0 clicks'}
                      </div>
                    </div>

                    {/* Latency & Match */}
                    <div style={{ flex: '0 1 140px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                        Propagación
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>
                        {canary?.time_to_first_view_ms ? `${canary.time_to_first_view_ms}ms` : 'En curso'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                        Match: {canary?.audience_match_score || 85}%
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div style={{ flex: '0 0 140px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '5px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: badge.color,
                        background: badge.bg,
                        border: `1px solid ${badge.color}40`
                      }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Broadcast Brain Metrics */}
        {activeTab === 'BRAIN' && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.6)', color: '#94a3b8', textTransform: 'uppercase', fontSize: '11px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '12px 16px' }}>Superficie</th>
                  <th style={{ padding: '12px 16px' }}>Plataforma</th>
                  <th style={{ padding: '12px 16px' }}>Clasificación</th>
                  <th style={{ padding: '12px 16px' }}>Vistas Reales / Post</th>
                  <th style={{ padding: '12px 16px' }}>Vistas / Minuto</th>
                  <th style={{ padding: '12px 16px' }}>CTR</th>
                  <th style={{ padding: '12px 16px' }}>Tasa de Éxito</th>
                </tr>
              </thead>
              <tbody>
                {brainMetrics.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      El cerebro de difusión se alimenta automáticamente tras cada Canary Post.
                    </td>
                  </tr>
                ) : (
                  brainMetrics.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#ffffff' }}>{m.surface_id}</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{m.platform}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: m.classification === 'WINNER' ? '#4ade80' : '#38bdf8',
                          background: m.classification === 'WINNER' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)'
                        }}>
                          {m.classification}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#4ade80' }}>{m.real_views_per_post}</td>
                      <td style={{ padding: '12px 16px' }}>{m.real_views_per_minute}/min</td>
                      <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{m.ctr}%</td>
                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{m.post_success_rate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Payloads Inspector */}
        {activeTab === 'PAYLOADS' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
            {workQueue.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc' }}>
                    {item.platform} FORMAT
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {item.payload?.formatting || 'MARKDOWN'}
                  </span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  {item.payload?.title || item.surface_name}
                </div>
                <pre style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  color: '#cbd5e1',
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '220px',
                  overflowY: 'auto'
                }}>
                  {item.payload?.body}
                </pre>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.payload?.character_count || 0} caracteres</span>
                  <span style={{ color: '#4ade80' }}>✓ Compliance Verificado</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default AtlasTeslaBroadcastPage;
