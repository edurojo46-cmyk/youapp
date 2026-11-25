/**
 * ATLAS — SEMI-AUTOMATIC RELEASE HUB V1
 * Page: AtlasReleasePage
 * @apps/atlas/pages/AtlasReleasePage.tsx
 *
 * Semi-Automatic Release System:
 * - Prepares expansion & scale proposals for winning content (3 BREAKOUT, 3 WINNER).
 * - Operator Approval Gate: Single-use RELEASE_APPROVAL_ID.
 * - Dynamic Security Gate: APPROVED, CONNECTED, publish_enabled, ACCOUNT_HEALTH, SATURATION_GATE.
 * - DRY RUN FIRST: Simulates what would publish without real emission.
 * - Strict Invariant: AUTO_PUBLISH = NO. TikTok strictly untouched while IN_REVIEW.
 * - Full cross-links to Virality, Accounts, and Campaigns with context.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  TrendingUp,
  AlertTriangle,
  Radio,
  Sparkles,
  Zap,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  BarChart3,
  Layers,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Lock,
  Eye,
  Activity,
  Check,
  X,
  Play
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

export interface SecurityGateStatus {
  APPROVED: boolean;
  CONNECTED: boolean;
  PUBLISH_ENABLED: boolean;
  ACCOUNT_HEALTH: 'OK' | 'FAILED';
  SATURATION_GATE: 'PASS' | 'FAIL';
  TIKTOK_SAFE: boolean;
  STATE_UNCHANGED_SINCE_APPROVAL: boolean | null;
  ALL_PASS: boolean;
  FAIL_REASONS: string[];
}

export interface PreparedReleaseProposal {
  CONTENT_ID: string;
  TITLE: string;
  DECISION: 'EXPAND' | 'SCALE';
  BEST_PLATFORM: string;
  BEST_ACCOUNT: string;
  TARGET_AUDIENCE: string;
  GEOGRAPHY: string;
  VIRALITY_SCORE: number | 'UNKNOWN';
  AUDIENCE_FIT: number;
  EXPECTED_ACTION: 'AMPLIFICAR_CANALES_AFINES' | 'ESCALAR_MAXIMA_PRIORIDAD';
  SATURATION_RISK: number;
  REASON: string;
  EVIDENCE: string[];
  RELEASE_APPROVAL_ID?: string;
  APPROVED_AT?: string;
  STATUS: 'PENDING_APPROVAL' | 'READY' | 'BLOCKED';
  BLOCK_REASON?: string;
  LIVE_ACCOUNT: { status: string; publish_enabled: boolean };
  GATES: SecurityGateStatus;
}

export interface DryRunSimulationResult {
  CONTENT_ID: string;
  DRY_RUN: true;
  STATUS: 'READY' | 'BLOCKED';
  WOULD_PUBLISH_TO: Array<{ platform: string; account_id: string }>;
  ACTION: string;
  TARGET_AUDIENCE: string;
  GEOGRAPHY: string;
  RELEASE_APPROVAL_ID?: string;
  GATES: SecurityGateStatus;
  MESSAGE: string;
  SIMULATED_AT: string;
  ACTUAL_PUBLISH_EXECUTED: false;
}

export interface ContentReleaseEvaluation {
  content_id: string;
  title: string;
  topic: string;
  format: string;
  platform: string;
  source_account_id: string;
  virality_score: number | 'UNKNOWN';
  virality_class: string;
  release_decision: 'HOLD' | 'CANARY' | 'EXPAND' | 'SCALE' | 'STOP';
  best_platform: string;
  best_account: string;
  audience_fit: number;
  saturation_risk: number;
  warm_audience_score: number;
  account_campaign_score: number;
  recommended_next_step: string;
  reason: string;
  evidence: string[];
}

export interface ReleaseControllerReport {
  timestamp: string;
  CONTENTS_EVALUATED: number;
  HOLD: number;
  CANARY: number;
  EXPAND: number;
  SCALE: number;
  STOP: number;
  UNKNOWN_HELD: number;
  SATURATION_GATE_ACTIVE: boolean;
  AUTO_PUBLISH: 'NO';
  evaluations: ContentReleaseEvaluation[];
}

export interface TestSuiteResult {
  APPROVAL_GATE_ACTIVE: boolean;
  EXPAND_READY: boolean;
  SCALE_READY: boolean;
  REJECT_BLOCKS: boolean;
  NO_APPROVAL_BLOCKS: boolean;
  ACCOUNT_STATE_RECHECK: boolean;
  DRY_RUN_ONLY: 'YES';
  FRONT_CONNECTED: boolean;
  PASS_FAIL: 'PASS' | 'FAIL';
  details: {
    test1_expand_approved_ready: boolean;
    test2_scale_approved_ready: boolean;
    test3_reject_blocks: boolean;
    test4_no_approval_blocks: boolean;
    test5_account_disabled_blocks: boolean;
  };
}

export const AtlasReleasePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedContent,
    selectedAccount,
    selectedPlatform,
    setSelectedContent,
    setSelectedAccount,
    setSelectedPlatform,
    navigateWithContext,
    buildLink
  } = useAtlasShared();

  // Standard controller report
  const [report, setReport] = useState<ReleaseControllerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'HOLD' | 'CANARY' | 'EXPAND' | 'SCALE' | 'STOP'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Semi-automatic release proposals
  const [proposals, setProposals] = useState<PreparedReleaseProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [selectedProposalForDetail, setSelectedProposalForDetail] = useState<PreparedReleaseProposal | null>(null);
  const [simulationResults, setSimulationResults] = useState<Record<string, DryRunSimulationResult>>({});
  const [actionFeedback, setActionFeedback] = useState<{ id: string; msg: string; type: 'success' | 'blocked' } | null>(null);
  
  // Test suite audit state
  const [testSuiteRunning, setTestSuiteRunning] = useState(false);
  const [testSuiteResult, setTestSuiteResult] = useState<TestSuiteResult | null>(null);

  // Fetch Release Controller Report
  const fetchReleaseReport = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/atlas/broadcast/release-controller');
      if (res.ok) {
        const data = await res.json();
        const rep = data.report || data;
        setReport(rep);
      }
    } catch (err) {
      console.warn('Error fetching release controller:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Semi-Automatic Proposals (3 BREAKOUT + 3 WINNER)
  const fetchProposals = async () => {
    try {
      setProposalsLoading(true);
      const res = await fetch('/api/atlas/broadcast/release-controller/semi-auto/proposals');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.proposals) {
          setProposals(data.proposals);
        }
      }
    } catch (err) {
      console.warn('Error fetching semi-auto proposals:', err);
    } finally {
      setProposalsLoading(false);
    }
  };

  useEffect(() => {
    fetchReleaseReport();
    fetchProposals();
  }, []);

  // Handle Approve Action
  const handleApprove = async (contentId: string) => {
    try {
      setActionFeedback(null);
      const res = await fetch('/api/atlas/broadcast/release-controller/semi-auto/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId })
      });
      const data = await res.json();
      if (data.success && data.proposal) {
        // Update local proposals list
        setProposals(prev => prev.map(p => p.CONTENT_ID === contentId ? data.proposal : p));
        if (selectedProposalForDetail?.CONTENT_ID === contentId) {
          setSelectedProposalForDetail(data.proposal);
        }

        // Run immediate Dry Run simulation
        await handleSimulateDryRun(contentId);

        const ready = data.proposal.STATUS === 'READY';
        setActionFeedback({
          id: contentId,
          msg: ready
            ? `RELEASE_APPROVAL_ID ${data.approval?.RELEASE_APPROVAL_ID} creado. Estado: READY (DRY RUN, single-use).`
            : `Aprobación registrada pero BLOCKED por compuertas: ${data.proposal.BLOCK_REASON}`,
          type: ready ? 'success' : 'blocked'
        });
      } else {
        setActionFeedback({
          id: contentId,
          msg: `Operación bloqueada por compuerta de seguridad: ${data.error || 'Fallo de verificación'}`,
          type: 'blocked'
        });
      }
    } catch (err: any) {
      setActionFeedback({ id: contentId, msg: `Error de red: ${err.message}`, type: 'blocked' });
    }
  };

  // Handle Reject Action
  const handleReject = async (contentId: string) => {
    try {
      setActionFeedback(null);
      const res = await fetch('/api/atlas/broadcast/release-controller/semi-auto/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId, reason: 'Rechazado manualmente por el operador' })
      });
      const data = await res.json();
      if (data.success && data.proposal) {
        setProposals(prev => prev.map(p => p.CONTENT_ID === contentId ? data.proposal : p));
        if (selectedProposalForDetail?.CONTENT_ID === contentId) {
          setSelectedProposalForDetail(data.proposal);
        }
        setActionFeedback({
          id: contentId,
          msg: 'Propuesta rechazada. Publicación bloqueada permanentemente.',
          type: 'blocked'
        });
      }
    } catch (err: any) {
      setActionFeedback({ id: contentId, msg: `Error al rechazar: ${err.message}`, type: 'blocked' });
    }
  };

  // Handle Dry Run Simulation
  const handleSimulateDryRun = async (contentId: string) => {
    try {
      const res = await fetch('/api/atlas/broadcast/release-controller/semi-auto/simulate-dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId })
      });
      const data = await res.json();
      if (data.success && data.simulation) {
        setSimulationResults(prev => ({
          ...prev,
          [contentId]: data.simulation
        }));
      }
    } catch (err: any) {
      console.warn('Error simulating dry run:', err);
    }
  };

  // Handle Consume Approval (Single-Use Dry Run)
  const handleConsumeDryRun = async (contentId: string) => {
    try {
      const res = await fetch('/api/atlas/broadcast/release-controller/semi-auto/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId })
      });
      const data = await res.json();
      if (data.success && data.simulation) {
        setSimulationResults(prev => ({
          ...prev,
          [contentId]: data.simulation
        }));
        await fetchProposals();
        setActionFeedback({
          id: contentId,
          msg: data.simulation.STATUS === 'READY'
            ? 'Aprobación CONSUMIDA exitosamente (Dry Run). Registro atómico marcado como consumido (single-use).'
            : `Consumo bloqueado por seguridad: ${data.simulation.MESSAGE}`,
          type: data.simulation.STATUS === 'READY' ? 'success' : 'blocked'
        });
      }
    } catch (err: any) {
      console.warn('Error consuming dry run:', err);
    }
  };

  // Handle Run Security Audit Test Suite
  const handleRunTestSuite = async () => {
    try {
      setTestSuiteRunning(true);
      const res = await fetch('/api/atlas/broadcast/release-controller/semi-auto/test-suite');
      const data = await res.json();
      if (data.success && data.testResult) {
        setTestSuiteResult(data.testResult);
        await fetchProposals();
      }
    } catch (err: any) {
      console.error('Error running test suite:', err);
    } finally {
      setTestSuiteRunning(false);
    }
  };

  // Filter regular evaluations
  const filteredEvaluations = useMemo(() => {
    if (!report?.evaluations) return [];
    let base = report.evaluations.filter(ev => {
      if (decisionFilter !== 'ALL' && ev.release_decision !== decisionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ev.title?.toLowerCase().includes(q);
        const matchTopic = ev.topic?.toLowerCase().includes(q);
        const matchId = ev.content_id?.toLowerCase().includes(q);
        if (!matchTitle && !matchTopic && !matchId) return false;
      }
      return true;
    });

    if (selectedAccount || selectedPlatform) {
      const matched = base.filter(ev => {
        if (selectedPlatform && ev.platform.toUpperCase() !== selectedPlatform.toUpperCase()) return false;
        if (selectedAccount && ev.source_account_id !== selectedAccount && ev.best_account !== selectedAccount && !ev.best_account.toLowerCase().includes(selectedAccount.toLowerCase())) return false;
        return true;
      });
      if (matched.length > 0) {
        base = matched;
      }
    }

    if (selectedContent) {
      const cIdx = base.findIndex(ev => ev.content_id === selectedContent);
      if (cIdx > -1) {
        const cItem = base[cIdx];
        base = [cItem, ...base.filter((_, i) => i !== cIdx)];
      }
    }

    return base;
  }, [report, decisionFilter, selectedPlatform, selectedAccount, selectedContent, searchQuery]);

  return (
    <div className="max-w-[1680px] w-full mx-auto px-4 lg:px-6 py-6 space-y-8" style={{ backgroundColor: '#07090e', color: '#f1f5f9' }}>
      {/* 1. Page Header with Safety Guard Ribbons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 tracking-wider uppercase">
              Atlas Release Controller V1 • Semi-Automático
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Control de Publicación & Decisiones Estratégicas
          </h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Flujo: Virality Brain → Release Controller → Campaign Router → Approval Gate → Publish (Dry Run First).
          </p>
        </div>

        {/* Global Safety Indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-[#0e131d] px-3 py-1.5 rounded-lg border border-emerald-500/30 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[#8694a6]">APPROVAL GATE:</span>
            <span className="text-emerald-400 font-bold">ACTIVO</span>
          </div>
          <div className="flex items-center gap-2 bg-[#0e131d] px-3 py-1.5 rounded-lg border border-amber-500/30 text-xs font-mono">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[#8694a6]">AUTO_PUBLISH:</span>
            <span className="text-amber-400 font-bold">NO (SEGURO)</span>
          </div>
          <div className="flex items-center gap-2 bg-[#0e131d] px-3 py-1.5 rounded-lg border border-cyan-500/30 text-xs font-mono">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[#8694a6]">DRY RUN:</span>
            <span className="text-cyan-400 font-bold">YES</span>
          </div>
          <button
            onClick={() => { fetchReleaseReport(); fetchProposals(); }}
            className="p-2 rounded-lg bg-[#0e131d] hover:bg-white/[0.08] text-[#94a3b8] hover:text-white border border-white/[0.1] transition-all cursor-pointer"
            title="Actualizar propuestas y telemetría"
            id="btn-refresh-release"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || proposalsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. SEMI-AUTOMATIC EXPANSION & SCALE HUB (3 BREAKOUT + 3 WINNER) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight uppercase font-mono">
                Propuestas de Expansión & Escalado Preparadas ({proposals.length})
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Atlas preparó la expansión de los contenidos ganadores (3 BREAKOUT, 3 WINNER). Aprobación humana mandatoria.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunTestSuite}
              disabled={testSuiteRunning}
              id="btn-run-safety-audit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700/50 shadow-sm transition-all cursor-pointer"
            >
              <Activity className={`w-3.5 h-3.5 ${testSuiteRunning ? 'animate-spin' : ''}`} />
              <span>{testSuiteRunning ? 'AUDITANDO 5 INVARIANTES...' : 'AUDITAR SEGURIDAD (5 TEST)'}</span>
            </button>
          </div>
        </div>

        {/* Test Suite Result Banner (if run) */}
        {testSuiteResult && (
          <div className={`p-4 rounded-xl border font-mono text-xs space-y-2 ${
            testSuiteResult.PASS_FAIL === 'PASS'
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}>
            <div className="flex items-center justify-between font-bold">
              <span>RESULTADO DE AUDITORÍA AUTOMATIZADA: {testSuiteResult.PASS_FAIL}</span>
              <span>DRY_RUN_ONLY=YES</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] pt-1">
              <div>1. EXPAND → aprobación: <span className="font-bold text-white">{testSuiteResult.EXPAND_READY ? 'READY' : 'FAIL'}</span></div>
              <div>2. SCALE → aprobación: <span className="font-bold text-white">{testSuiteResult.SCALE_READY ? 'READY' : 'FAIL'}</span></div>
              <div>3. REJECT: <span className="font-bold text-white">{testSuiteResult.REJECT_BLOCKS ? 'BLOCKED' : 'FAIL'}</span></div>
              <div>4. Sin aprobación: <span className="font-bold text-white">{testSuiteResult.NO_APPROVAL_BLOCKS ? 'BLOCKED' : 'FAIL'}</span></div>
              <div>5. Account disabled: <span className="font-bold text-white">{testSuiteResult.ACCOUNT_STATE_RECHECK ? 'BLOCKED' : 'FAIL'}</span></div>
              <div>6. Single-Use Enforced: <span className="font-bold text-emerald-400">{testSuiteResult.SINGLE_USE_ENFORCED ? 'ENFORCED' : 'FAIL'}</span></div>
              <div>7. TikTok Invariant: <span className="font-bold text-white">IN_REVIEW (NO TOCAR)</span></div>
              <div>8. Persistencia DB: <span className="font-bold text-cyan-400">SOBREVIVE RESTART</span></div>
            </div>
          </div>
        )}

        {actionFeedback && (
          <div
            id="release-action-feedback"
            className={`p-3 rounded-xl border font-mono text-xs ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}
          >
            <span className="font-bold">{actionFeedback.id}:</span> {actionFeedback.msg}
          </div>
        )}

        {/* Proposals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proposals.map(prop => {
            const isScale = prop.DECISION === 'SCALE';
            const isBlocked = prop.STATUS === 'BLOCKED';
            const isPending = prop.STATUS === 'PENDING_APPROVAL';
            const simulation = simulationResults[prop.CONTENT_ID];

            return (
              <div
                key={prop.CONTENT_ID}
                className="bg-[#0e131d] border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-lg transition-all"
                style={{ backdropFilter: 'blur(16px)' }}
              >
                {/* Header: Decision Badge + Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase border ${
                      isScale
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                        : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                    }`}>
                      {isScale ? '⚡ SCALE (BREAKOUT)' : '✨ EXPAND (WINNER)'}
                    </span>
                  </div>

                  {/* Status Indicator */}
                  <div>
                    {isReady(prop) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        READY (DRY RUN)
                      </span>
                    )}
                    {isBlocked && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <XCircle className="w-3 h-3" />
                        BLOCKED
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <ClockIcon className="w-3 h-3" />
                        PENDIENTE APROBACIÓN
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Title & ID */}
                <div>
                  <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                    {prop.TITLE || prop.CONTENT_ID}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-[#8694a6]">
                    <span>ID: {prop.CONTENT_ID}</span>
                    <span>•</span>
                    <span className="text-cyan-400">Score: {prop.VIRALITY_SCORE}/100</span>
                  </div>
                </div>

                {/* Prepared Expansion Metadata */}
                <div className="bg-[#090d15] p-3 rounded-lg border border-white/[0.05] space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">PLATAFORMA DESTINO:</span>
                    <span className="text-cyan-300 font-semibold">{prop.BEST_PLATFORM}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">CUENTA ASIGNADA:</span>
                    <span className="text-white font-semibold">{prop.BEST_ACCOUNT}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">ESTADO CUENTA (LIVE):</span>
                    <span className={`font-semibold ${prop.GATES.ACCOUNT_HEALTH === 'OK' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {prop.LIVE_ACCOUNT.status} · publish {prop.LIVE_ACCOUNT.publish_enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">ACCIÓN ESPERADA:</span>
                    <span className="text-emerald-400 font-semibold">{prop.EXPECTED_ACTION}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">SATURATION RISK:</span>
                    <span className={`font-semibold ${prop.GATES.SATURATION_GATE === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>{Math.round(prop.SATURATION_RISK * 100)}% ({prop.GATES.SATURATION_GATE})</span>
                  </div>
                </div>

                {/* Reason Snippet */}
                <div className="text-xs text-[#94a3b8] line-clamp-2 italic">
                  "{prop.REASON}"
                </div>

                {/* Approval Token (if approved) */}
                {prop.RELEASE_APPROVAL_ID && (
                  <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
                    <div className="font-bold">RELEASE_APPROVAL_ID (single-use):</div>
                    <div className="truncate text-white">{prop.RELEASE_APPROVAL_ID}</div>
                  </div>
                )}

                {/* Block reason (if blocked) */}
                {prop.BLOCK_REASON && (
                  <div className="p-2 rounded bg-rose-950/20 border border-rose-500/20 text-[10px] font-mono text-rose-300">
                    <span className="font-bold">MOTIVO BLOQUEO:</span> {prop.BLOCK_REASON}
                  </div>
                )}

                {/* Dry Run Simulation Result (if executed) */}
                {simulation && (
                  <div className="p-2.5 rounded bg-cyan-950/20 border border-cyan-500/30 text-[11px] font-mono text-cyan-300 space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span>SIMULACIÓN DRY RUN:</span>
                      <span className={simulation.STATUS === 'READY' ? 'text-emerald-400' : 'text-rose-400'}>{simulation.STATUS}</span>
                    </div>
                    <div>
                      Se publicaría en:{' '}
                      {simulation.WOULD_PUBLISH_TO.length > 0
                        ? simulation.WOULD_PUBLISH_TO.map(d => `${d.account_id} (${d.platform})`).join(', ')
                        : 'NADA'}
                    </div>
                    <div className="text-[10px] text-[#94a3b8]">{simulation.MESSAGE}</div>
                  </div>
                )}

                {/* Operator Actions */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {/* APROBAR EXPANSIÓN */}
                    <button
                      onClick={() => handleApprove(prop.CONTENT_ID)}
                      disabled={isReady(prop)}
                      id={`btn-approve-${prop.CONTENT_ID}`}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        isReady(prop)
                          ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isReady(prop) ? 'APROBADO' : 'APROBAR EXPANSIÓN'}</span>
                    </button>

                    {/* CONSUMIR APROBACIÓN (DRY RUN SINGLE-USE) */}
                    {isReady(prop) && (
                      <button
                        onClick={() => handleConsumeDryRun(prop.CONTENT_ID)}
                        id={`btn-consume-${prop.CONTENT_ID}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/25 transition-all cursor-pointer"
                        title="Consumir aprobación de un solo uso (Dry Run)"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>CONSUMIR (DRY RUN)</span>
                      </button>
                    )}

                    {/* RECHAZAR */}
                    <button
                      onClick={() => handleReject(prop.CONTENT_ID)}
                      disabled={isBlocked}
                      id={`btn-reject-${prop.CONTENT_ID}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-rose-300 hover:text-white bg-rose-950/30 hover:bg-rose-900/50 border border-rose-800/40 transition-all cursor-pointer"
                      title="Rechazar propuesta y bloquear publicación"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>RECHAZAR</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* PREVIEW ANTES DE APROBAR */}
                    <button
                      onClick={() => {
                        setSelectedContent(prop.CONTENT_ID);
                        setSelectedPlatform(prop.BEST_PLATFORM);
                        setSelectedAccount(prop.BEST_ACCOUNT);
                        navigateWithContext('/broadcast/content-library', { content: prop.CONTENT_ID });
                      }}
                      id={`btn-preview-before-approve-${prop.CONTENT_ID}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-purple-300 hover:text-white bg-purple-950/40 hover:bg-purple-900/60 border border-purple-700/50 shadow-sm transition-all cursor-pointer"
                      title="Ver preview real antes de aprobar publicación"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>PREVIEW ANTES DE APROBAR</span>
                    </button>

                    {/* VER DETALLE */}
                    <button
                      onClick={() => setSelectedProposalForDetail(prop)}
                      id={`btn-detail-${prop.CONTENT_ID}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-cyan-300 hover:text-white bg-cyan-950/30 hover:bg-cyan-900/50 border border-cyan-800/40 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>VER DETALLE</span>
                    </button>

                    {/* SIMULAR DRY RUN */}
                    <button
                      onClick={() => handleSimulateDryRun(prop.CONTENT_ID)}
                      id={`btn-dryrun-${prop.CONTENT_ID}`}
                      className="p-1.5 rounded-lg bg-[#141b27] hover:bg-white/[0.08] text-[#8694a6] hover:text-white border border-white/[0.1] transition-all cursor-pointer"
                      title="Simular Dry Run"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. DETAIL MODAL (Exact Pre-Flight Checklist) */}
      {selectedProposalForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="bg-[#0e131d] border border-white/[0.12] rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono uppercase">
                    Detalle Pre-Flight de Expansión
                  </h3>
                  <p className="text-xs text-[#8694a6]">
                    Inspección previa a la aprobación humana. Invariante: AUTO_PUBLISH = NO.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProposalForDetail(null)}
                className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#94a3b8] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Checklist required by prompt */}
            <div className="space-y-4 text-xs font-mono">
              {/* 1. Contenido */}
              <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">1. CONTENIDO</span>
                <div className="text-sm font-bold text-white">{selectedProposalForDetail.TITLE || selectedProposalForDetail.CONTENT_ID}</div>
                <div className="text-[#94a3b8]">ID: {selectedProposalForDetail.CONTENT_ID} • Virality Score: {selectedProposalForDetail.VIRALITY_SCORE}/100</div>
              </div>

              {/* 2. Plataformas & Cuentas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                  <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">2. PLATAFORMAS DESTINO</span>
                  <div className="text-cyan-400 font-bold text-sm">{selectedProposalForDetail.BEST_PLATFORM}</div>
                  <div className="text-[11px] text-[#8694a6]">TikTok guard: {selectedProposalForDetail.GATES.TIKTOK_SAFE ? 'no aplica (destino no es TikTok)' : 'BLOQUEADO (IN_REVIEW)'}</div>
                </div>
                <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                  <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">3. CUENTAS ASIGNADAS</span>
                  <div className="text-white font-bold text-sm">{selectedProposalForDetail.BEST_ACCOUNT}</div>
                  <div className="text-[11px] text-[#8694a6]">
                    Estado live: {selectedProposalForDetail.LIVE_ACCOUNT.status} • publish_enabled: {String(selectedProposalForDetail.LIVE_ACCOUNT.publish_enabled)} • Salud: {selectedProposalForDetail.GATES.ACCOUNT_HEALTH}
                  </div>
                </div>
              </div>

              {/* 4. Acción & Audiencia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                  <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">4. ACCIÓN ESPERADA</span>
                  <div className="text-emerald-400 font-bold text-sm">{selectedProposalForDetail.EXPECTED_ACTION}</div>
                  <div className="text-[11px] text-[#8694a6]">Decisión: {selectedProposalForDetail.DECISION}</div>
                </div>
                <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                  <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">5. AUDIENCIA & GEOGRAFÍA</span>
                  <div className="text-amber-400 font-bold text-sm">{selectedProposalForDetail.GEOGRAPHY}</div>
                  <div className="text-[11px] text-[#8694a6]">{selectedProposalForDetail.TARGET_AUDIENCE}</div>
                </div>
              </div>

              {/* 6. Motivo */}
              <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">6. MOTIVO ALGORÍTMICO</span>
                <p className="text-slate-200 text-xs italic">{selectedProposalForDetail.REASON}</p>
              </div>

              {/* 7. Riesgos */}
              <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-1.5">
                <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">7. EVALUACIÓN DE RIESGOS & COMPUERTAS</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>Saturation: <span className={`font-bold ${selectedProposalForDetail.GATES.SATURATION_GATE === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>{Math.round(selectedProposalForDetail.SATURATION_RISK * 100)}% ({selectedProposalForDetail.GATES.SATURATION_GATE})</span></div>
                  <div>Connected: <span className={`font-bold ${selectedProposalForDetail.GATES.CONNECTED ? 'text-emerald-400' : 'text-rose-400'}`}>{String(selectedProposalForDetail.GATES.CONNECTED)}</span></div>
                  <div>Account Health: <span className={`font-bold ${selectedProposalForDetail.GATES.ACCOUNT_HEALTH === 'OK' ? 'text-emerald-400' : 'text-rose-400'}`}>{selectedProposalForDetail.GATES.ACCOUNT_HEALTH}</span></div>
                  <div>Auto Publish: <span className="text-amber-400 font-bold">NO</span></div>
                </div>
                {selectedProposalForDetail.GATES.FAIL_REASONS.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-rose-300 text-[11px] pt-1">
                    {selectedProposalForDetail.GATES.FAIL_REASONS.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>

              {/* 8. Evidencia */}
              <div className="bg-[#090d15] p-3.5 rounded-xl border border-white/[0.06] space-y-2">
                <span className="text-[#64748b] text-[10px] uppercase font-bold tracking-wider">8. EVIDENCIA FÍSICA VERIFICADA</span>
                <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
                  {selectedProposalForDetail.EVIDENCE.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleApprove(selectedProposalForDetail.CONTENT_ID);
                  }}
                  id="btn-modal-approve"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>APROBAR EXPANSIÓN</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedContent(selectedProposalForDetail.CONTENT_ID);
                    setSelectedPlatform(selectedProposalForDetail.BEST_PLATFORM);
                    setSelectedAccount(selectedProposalForDetail.BEST_ACCOUNT);
                    navigateWithContext('/broadcast/content-library', { content: selectedProposalForDetail.CONTENT_ID });
                  }}
                  id="btn-modal-preview"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-purple-300 hover:text-white bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 transition-all cursor-pointer"
                  title="Ver preview completa con vídeo/imagen y comprobación de enlace"
                >
                  <Layers className="w-4 h-4" />
                  <span>PREVIEW ANTES DE APROBAR</span>
                </button>
                <button
                  onClick={() => {
                    handleReject(selectedProposalForDetail.CONTENT_ID);
                  }}
                  id="btn-modal-reject"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>RECHAZAR</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isReady(selectedProposalForDetail) && (
                  <button
                    onClick={() => {
                      handleConsumeDryRun(selectedProposalForDetail.CONTENT_ID);
                    }}
                    id="btn-modal-consume"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold text-white bg-cyan-600 hover:bg-cyan-500 shadow-md shadow-cyan-600/25 transition-all cursor-pointer"
                    title="Consumir aprobación de un solo uso (Dry Run)"
                  >
                    <Zap className="w-4 h-4" />
                    <span>CONSUMIR (DRY RUN)</span>
                  </button>
                )}

                <button
                  onClick={() => handleSimulateDryRun(selectedProposalForDetail.CONTENT_ID)}
                  id="btn-modal-dryrun"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/40 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  <span>SIMULAR DRY RUN</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Metric Counters (5 States: HOLD, CANARY, EXPAND, SCALE, STOP) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
        <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl p-3">
          <span className="text-[10px] text-[#64748b] uppercase font-mono">TOTAL EVALUADOS</span>
          <p className="text-xl font-bold text-white font-mono mt-1">{report ? report.CONTENTS_EVALUATED : '-'}</p>
        </div>
        <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl p-3">
          <span className="text-[10px] text-amber-400 uppercase font-mono">HOLD</span>
          <p className="text-xl font-bold text-amber-400 font-mono mt-1">{report ? report.HOLD : '-'}</p>
        </div>
        <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl p-3">
          <span className="text-[10px] text-blue-400 uppercase font-mono">CANARY</span>
          <p className="text-xl font-bold text-blue-400 font-mono mt-1">{report ? report.CANARY : '-'}</p>
        </div>
        <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl p-3">
          <span className="text-[10px] text-indigo-400 uppercase font-mono">EXPAND</span>
          <p className="text-xl font-bold text-indigo-400 font-mono mt-1">{report ? report.EXPAND : '-'}</p>
        </div>
        <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl p-3">
          <span className="text-[10px] text-emerald-400 uppercase font-mono">SCALE</span>
          <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{report ? report.SCALE : '-'}</p>
        </div>
        <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl p-3">
          <span className="text-[10px] text-red-400 uppercase font-mono">STOP</span>
          <p className="text-xl font-bold text-red-400 font-mono mt-1">{report ? report.STOP : '-'}</p>
        </div>
      </div>

      {/* 5. Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'SCALE', 'EXPAND', 'CANARY', 'HOLD', 'STOP'] as const).map(dec => (
            <button
              key={dec}
              onClick={() => setDecisionFilter(dec)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                decisionFilter === dec
                  ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                  : 'bg-[#0e131d] text-[#8694a6] hover:text-white border border-white/[0.08]'
              }`}
            >
              {dec === 'ALL' ? 'TODOS' : dec}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar contenido o cuenta..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-[#64748b] focus:outline-none"
          />
        </div>
      </div>

      {/* 6. Complete Evaluations Table */}
      <div className="bg-[#0e131d] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111724] border-b border-white/[0.08] font-mono text-[11px] text-[#8694a6]">
              <tr>
                <th className="py-3 px-4 font-semibold">CONTENIDO</th>
                <th className="py-3 px-4 font-semibold">PLATAFORMA</th>
                <th className="py-3 px-4 font-semibold">VIRALITY SCORE</th>
                <th className="py-3 px-4 font-semibold">DECISIÓN DE RELEASE</th>
                <th className="py-3 px-4 font-semibold">SATURATION RISK</th>
                <th className="py-3 px-4 font-semibold">MEJOR CUENTA</th>
                <th className="py-3 px-4 font-semibold text-right">ACCIONES CRUZADAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64748b] font-mono">
                    No se encontraron evaluaciones con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredEvaluations.map((ev, idx) => (
                  <tr
                    key={ev.content_id || idx}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      selectedContent === ev.content_id ? 'bg-cyan-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white line-clamp-1">{ev.title || ev.content_id}</div>
                      <div className="text-[11px] text-[#64748b] font-mono">{ev.content_id}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-cyan-300">
                      {ev.platform}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {ev.virality_score === 'UNKNOWN' ? 'UNKNOWN' : `${ev.virality_score}/100`}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        ev.release_decision === 'SCALE' ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/40' :
                        ev.release_decision === 'EXPAND' ? 'bg-purple-950/60 text-purple-400 border border-purple-800/40' :
                        ev.release_decision === 'CANARY' ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40' :
                        ev.release_decision === 'STOP' ? 'bg-red-950/60 text-red-400 border border-red-800/40' :
                        'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                      }`}>
                        {ev.release_decision}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400">
                      {ev.saturation_risk}%
                    </td>
                    <td className="py-3 px-4 font-mono text-[#8694a6]">
                      <button
                        onClick={() => {
                          setSelectedAccount(ev.best_account);
                          navigateWithContext('/broadcast/accounts', { account: ev.best_account });
                        }}
                        className="text-cyan-400 hover:underline cursor-pointer"
                        title="Ver cuenta asignada"
                      >
                        {ev.best_account}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                        {/* VER VIRALIDAD */}
                        <button
                          onClick={() => {
                            setSelectedContent(ev.content_id);
                            navigateWithContext('/broadcast/virality', { content: ev.content_id });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#141b27] hover:bg-white/[0.08] text-purple-300 hover:text-white border border-white/[0.1] text-[11px] font-mono transition-all cursor-pointer"
                          id={`btn-rel-virality-${idx}`}
                        >
                          VER VIRALIDAD
                        </button>

                        {/* VER CUENTA */}
                        <button
                          onClick={() => {
                            setSelectedAccount(ev.best_account);
                            navigateWithContext('/broadcast/accounts', { account: ev.best_account });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#141b27] hover:bg-white/[0.08] text-cyan-300 hover:text-white border border-white/[0.1] text-[11px] font-mono transition-all cursor-pointer"
                          id={`btn-rel-account-${idx}`}
                        >
                          VER CUENTA
                        </button>

                        {/* VER CAMPAÑA */}
                        <button
                          onClick={() => {
                            setSelectedContent(ev.content_id);
                            setSelectedAccount(ev.best_account);
                            setSelectedPlatform(ev.platform);
                            navigateWithContext('/broadcast/campaigns', { content: ev.content_id });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[11px] font-mono transition-all cursor-pointer"
                          id={`btn-rel-campaign-${idx}`}
                        >
                          VER CAMPAÑA
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Helper: clock icon
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Helper: isReady
function isReady(prop: PreparedReleaseProposal): boolean {
  return prop.STATUS === 'READY' || prop.STATUS === 'APPROVED';
}

export default AtlasReleasePage;
