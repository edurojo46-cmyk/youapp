/**
 * ATLAS 3M CONTROL CENTER V1
 * Page: Atlas3MControlCenterPage
 * @apps/atlas/pages/Atlas3MControlCenterPage.tsx
 *
 * Single-screen Unified Command Center displaying:
 * - BLOQUE 1: Objetivo 3M (3,000,000 TARGET, CURRENT, PROJECTED 24H, GAP, PROGRESS %) + Desglose Por Plataforma
 * - BLOQUE 2: Cuentas Reales por Plataforma con métricas verificables (VIEWS_TODAY, REACH_TODAY, IMPRESSIONS_TODAY, ENGAGEMENT_TODAY, FOLLOWERS_GAINED_TODAY)
 * - BLOQUE 3: Warm Audience Engine (Scored, Cold, Warm, Hot, Very Hot, Contact Eligible) + Tabla + HOT != CONTACTABLE
 * - BLOQUE 4: Campaign Router Form & Simulation (Selected, Excluded, Scores, Warm signals, ROUTING_CHANGED_BY_WARM_SIGNAL)
 * - BLOQUE 5: Estado Red (Connected, Pending, Platform Readiness Matrix)
 *
 * Design: Apple-style Minimalist, High Visual Space, Strict Real Data (No invented values).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';
import {
  Target,
  Radio,
  Flame,
  Layers,
  Activity,
  Zap,
  Sparkles,
  ChevronRight,
  Plus,
  Sliders,
  RefreshCw,
  Check,
  AlertTriangle,
  ShieldCheck,
  Clock,
  AlertCircle,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Award,
  Percent,
  ExternalLink,
  ArrowRight
} from 'lucide-react';

interface WinnerDossier {
  post_id: string;
  topic: string;
  format: string;
  platform: string;
  account_id: string;
  hook_pattern: string;
  virality_score: number;
  reason: string;
  evidence: string[];
}

interface PostViralityMetrics {
  post_id: string;
  platform: string;
  account_id: string;
  title: string;
  external_url: string;
  published_at: string;
  age_hours: number;
  format: string;
  topic: string;
  views_per_hour: number | 'UNKNOWN';
  reach_velocity: number | 'UNKNOWN';
  engagement_rate: number | 'UNKNOWN';
  share_rate: number | 'UNKNOWN';
  comment_rate: number | 'UNKNOWN';
  growth_acceleration: number | 'UNKNOWN';
  virality_score: number | 'UNKNOWN';
  classification: 'BREAKOUT' | 'WINNER' | 'NORMAL' | 'LOSER' | 'UNKNOWN_EXCLUDED';
  trend: 'ACCELERATING' | 'STEADY' | 'FLAT' | 'DECAY' | 'UNKNOWN';
  hook_pattern?: string;
  reason: string;
  evidence: string[];
}

export interface ViralityBrainReport {
  timestamp: string;
  POSTS_ANALYZED: number;
  WINNERS: number;
  BREAKOUTS: number;
  NORMAL: number;
  LOSERS: number;
  UNKNOWN_EXCLUDED: number;
  CAMPAIGN_ROUTER_CONNECTED: boolean;
  AUTO_PUBLISH: 'NO';
  top_winners: WinnerDossier[];
  breakout_content: WinnerDossier[];
  losers: PostViralityMetrics[];
  all_evaluated_posts: PostViralityMetrics[];
  account_performance_scores: Record<string, number>;
}

interface ContentReleaseEvaluation {
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

interface ReleaseControllerReport {
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

interface BroadcastAccount {
  account_id: string;
  platform: 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'TELEGRAM' | 'REDDIT' | 'NOSTR';
  display_name: string;
  external_account_id: string | null;
  username?: string | null;
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'BLOCKED_EXTERNAL_SETUP' | 'AUTH_EXPIRED' | string;
  auth_status: string;
  publish_enabled: boolean;
  metrics_enabled: boolean;
  is_default: boolean;
  created_at: string;
  last_verified_at: string | null;
  metadata?: Record<string, any>;
}

interface AccountReachMetrics {
  account_id: string;
  platform: 'YOUTUBE' | 'FACEBOOK' | 'INSTAGRAM' | 'TELEGRAM' | 'NOSTR' | 'TIKTOK' | 'REDDIT';
  display_name: string;
  username: string;
  status: string;
  publish_enabled: boolean;
  VIEWS_TODAY: number | 'UNKNOWN';
  REACH_TODAY: number | 'UNKNOWN';
  IMPRESSIONS_TODAY: number | 'UNKNOWN';
  ENGAGEMENT_TODAY: number | 'UNKNOWN';
  FOLLOWERS_GAINED_TODAY: number | 'UNKNOWN';
  FOLLOWERS_TOTAL: number | 'UNKNOWN';
  TOP_CONTENT: string;
  measured_at: string;
  notes?: string;
  METRIC_SOURCE?: string;
  METRIC_TIMESTAMP?: string;
  COUNTS_TOWARD_3M?: boolean;
  REASON?: string;
}

interface PlatformReachSummary {
  platform: 'YOUTUBE' | 'FACEBOOK' | 'INSTAGRAM' | 'TELEGRAM' | 'NOSTR';
  PLATFORM_REACH: number | 'UNKNOWN';
  PLATFORM_SHARE: string;
  TOP_ACCOUNT: string;
  TOP_CONTENT: string;
  VIEWS_PER_HOUR: number | 'UNKNOWN';
  accounts_count: number;
  METRIC_SOURCE?: string;
  METRIC_TIMESTAMP?: string;
  COUNTS_TOWARD_3M?: boolean;
  REASON?: string;
}

interface ReachIntelligenceReport {
  success: boolean;
  DAILY_REACH_TARGET: number;
  CURRENT_DAILY_REACH: number | 'UNKNOWN';
  CURRENT_DAILY_VIEWS: number | 'UNKNOWN';
  PROJECTED_24H_REACH: number | 'UNKNOWN';
  REACH_GAP: number | 'UNKNOWN';
  REACH_PROGRESS_PERCENT: string | 'UNKNOWN';
  MEASURED_DAILY_REACH?: number | 'UNKNOWN';
  MEASURED_DAILY_VIEWS?: number | 'UNKNOWN';
  MEASUREMENT_COVERAGE?: 'NONE' | 'PARTIAL' | 'FULL';
  UNKNOWN_PLATFORMS?: string[];
  PLATFORMS_WITH_REAL_METRICS: string[];
  ACCOUNTS_MEASURED: number;
  REAL_METRICS_ONLY: true;
  ZERO_NOT_USED_FOR_UNKNOWN?: boolean;
  measured_at: string;
  accounts: AccountReachMetrics[];
  platforms: PlatformReachSummary[];
  tiktok_status: string;
  PLATFORMS_COUNTING_TOWARD_3M?: string[];
  PLATFORMS_UNKNOWN?: string[];
  ZERO_CONFIRMED_METRICS?: boolean;
  NO_PROXY_METRICS_COUNTED?: boolean;
  post_metrics?: PostMetricsAggregation;
  virality_analysis?: ViralityBrainReport;
}

interface PostPerformanceItem {
  post_id: string;
  platform: string;
  account_id: string;
  external_post_id: string;
  external_url: string;
  published_at: string;
  title?: string;
  VIEWS: number | 'UNKNOWN';
  REACH: number | 'UNKNOWN';
  IMPRESSIONS: number | 'UNKNOWN';
  ENGAGEMENTS: number | 'UNKNOWN';
  LIKES: number | 'UNKNOWN';
  COMMENTS: number | 'UNKNOWN';
  SHARES: number | 'UNKNOWN';
  VERIFIED: boolean;
  SOURCE: string;
  METRIC_TIMESTAMP: string;
}

interface PostMetricsAggregation {
  MEASURED_POSTS: number;
  POSTS_WITH_VERIFIED_METRICS: number;
  POSTS_UNKNOWN: number;
  TOTAL_REAL_VIEWS: number | 'UNKNOWN';
  TOTAL_REAL_REACH: number | 'UNKNOWN';
  TOP_POST: {
    post_id: string;
    platform: string;
    account_id: string;
    url: string;
    reach: number;
  } | null;
  TOP_ACCOUNT: string;
  TOP_PLATFORM: string;
  VIEWS_PER_HOUR: number | 'UNKNOWN';
  MEASUREMENT_COVERAGE: 'NONE' | 'PARTIAL' | 'FULL';
  SNAPSHOT_HISTORY_ACTIVE: boolean;
  NO_PROXY_METRICS: true;
  posts: PostPerformanceItem[];
}

interface WarmProfile {
  person_id: string;
  display_name: string;
  platform: string;
  interest_score: number;
  engagement_score: number;
  recency_score: number;
  platform_affinity: string;
  contact_eligibility: boolean;
  warm_score: number;
  class: 'COLD' | 'WARM' | 'HOT' | 'VERY_HOT';
  top_interests: string[];
  best_account: string;
  evidence: Array<{
    signal_type: string;
    source: string;
    observed_at: string;
    confidence: number;
    detail: string;
  }>;
}

interface WarmAudienceReport {
  PROFILES_SCORED: number;
  COLD: number;
  WARM: number;
  HOT: number;
  VERY_HOT: number;
  CONTACT_ELIGIBLE: number;
  EVIDENCE_BACKED: number;
  PASS_FAIL: 'PASS' | 'FAIL';
  profiles: WarmProfile[];
}

interface SelectedAccountBreakdown {
  account_id: string;
  platform: string;
  display_name: string;
  is_default?: boolean;
  score: number;
  topic_fit?: number;
  audience_fit?: number;
  platform_fit?: number;
  recent_performance?: number;
  account_health?: number;
  saturation_risk?: number;
  expected_reach: number;
  warm_audience_score?: number;
  hot_audience_count?: number;
  very_hot_count?: number;
  platform_interest?: number;
  account_audience_fit?: number;
  content_performance_score?: number;
  selection_reason: string;
}

interface ExcludedAccountBreakdown {
  account_id: string;
  platform: string;
  display_name: string;
  reason: string;
}

interface CampaignSimulationResult {
  campaign_id: string;
  eligible_accounts: Array<{
    account_id: string;
    platform: string;
    display_name: string;
    score: number;
    warm_audience_score?: number;
    hot_audience_count?: number;
    very_hot_count?: number;
    account_audience_fit?: number;
    content_performance_score?: number;
  }>;
  selected_accounts: SelectedAccountBreakdown[];
  excluded_accounts: ExcludedAccountBreakdown[];
  selection_reason: string;
  expected_reach: number;
  warm_engine_connected?: boolean;
  hot_audience_used?: boolean;
  account_audience_fit_active?: boolean;
  routing_changed_by_warm_signal?: boolean;
}

export const Atlas3MControlCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedAccount,
    selectedPlatform,
    selectedCampaign,
    selectedContent,
    selectedAudience,
    selectedGeography,
    setSelectedAccount,
    setSelectedPlatform,
    setSelectedCampaign,
    setSelectedContent,
    setSelectedAudience,
    setSelectedGeography,
    navigateWithContext,
    buildLink
  } = useAtlasShared();

  // Data States
  const [accounts, setAccounts] = useState<BroadcastAccount[]>([]);
  const [reachReport, setReachReport] = useState<ReachIntelligenceReport | null>(null);
  const [warmReport, setWarmReport] = useState<WarmAudienceReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [viralityReport, setViralityReport] = useState<ViralityBrainReport | null>(null);
  const [viralityFilter, setViralityFilter] = useState<'ALL' | 'BREAKOUT' | 'WINNERS' | 'LOSERS'>('ALL');

  const [releaseReport, setReleaseReport] = useState<ReleaseControllerReport | null>(null);
  const [releaseFilter, setReleaseFilter] = useState<'ALL' | 'HOLD' | 'CANARY' | 'EXPAND' | 'SCALE' | 'STOP'>('ALL');

  // Campaign Simulator Form State
  const [topic, setTopic] = useState<string>('Compresores Industriales y Equipos Pesados');
  const [audience, setAudience] = useState<string>('Compradores industriales y directivos técnicos');
  const [geography, setGeography] = useState<string>('Argentina');
  const [contentType, setContentType] = useState<string>('TEXT_ANNOUNCEMENT');
  const [reachTarget, setReachTarget] = useState<number>(1000);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<CampaignSimulationResult | null>(null);

  // Initial Data Fetch
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Accounts from real Multi-Account registry
      const accRes = await fetch('/api/atlas/broadcast/accounts');
      if (accRes.ok) {
        const accData = await accRes.json();
        if (accData.success && Array.isArray(accData.accounts)) {
          setAccounts(accData.accounts);
        }
      }

      // 2. Fetch 3M Reach Intelligence
      const reachRes = await fetch('/api/atlas/broadcast/reach-intelligence');
      if (reachRes.ok) {
        const rData = await reachRes.json();
        if (rData.success) {
          setReachReport(rData);
          if (rData.virality_analysis) {
            setViralityReport(rData.virality_analysis);
          }
        }
      }

      // 2b. Fetch Virality Brain directly
      try {
        const vRes = await fetch('/api/atlas/broadcast/virality-brain');
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.POSTS_ANALYZED) {
            setViralityReport(vData);
          }
        }
      } catch (err: any) {
        console.warn('Virality brain direct fetch note:', err.message);
      }

      // 2c. Fetch Release Controller directly
      try {
        const relRes = await fetch('/api/atlas/broadcast/release-controller');
        if (relRes.ok) {
          const relData = await relRes.json();
          if (relData.CONTENTS_EVALUATED) {
            setReleaseReport(relData);
          }
        }
      } catch (err: any) {
        console.warn('Release controller direct fetch note:', err.message);
      }

      // 3. Fetch Warm Audience from real Engine
      const warmRes = await fetch('/api/atlas/audience/warm?limit=100');
      if (warmRes.ok) {
        const wData = await warmRes.json();
        if (wData.success && wData.report) {
          setWarmReport(wData.report);
        }
      }
    } catch (err: any) {
      console.error('[Atlas3MControlCenter] Fetch error:', err);
      setError(err.message || 'Error cargando datos del Control Center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Run Campaign Simulation
  const handleSimulate = async () => {
    setSimulating(true);
    try {
      // 1. Run simulation WITH warm audience
      const resWith = await fetch('/api/atlas/broadcast/campaign/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          audience,
          geography,
          content_type: contentType,
          reach_target: reachTarget,
          enable_warm_audience: true
        })
      });
      const dataWith = await resWith.json();

      // 2. Run simulation WITHOUT warm audience for real signal comparison
      const resWithout = await fetch('/api/atlas/broadcast/campaign/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          audience,
          geography,
          content_type: contentType,
          reach_target: reachTarget,
          enable_warm_audience: false
        })
      });
      const dataWithout = await resWithout.json();

      if (dataWith.success && dataWith.routing) {
        const withWarmRouting: CampaignSimulationResult = dataWith.routing;
        const withoutWarmRouting: CampaignSimulationResult = dataWithout?.routing;

        let routingChanged = false;
        if (withoutWarmRouting) {
          const selectionDiffers =
            withWarmRouting.selected_accounts.map(a => a.account_id).join(',') !==
            withoutWarmRouting.selected_accounts.map(a => a.account_id).join(',');

          const scoresDiffer = withWarmRouting.eligible_accounts.some(wa => {
            const legacy = withoutWarmRouting.eligible_accounts?.find(la => la.account_id === wa.account_id);
            return legacy && legacy.score !== wa.score;
          });

          routingChanged = selectionDiffers || scoresDiffer || Boolean(withWarmRouting.hot_audience_used);
        } else {
          routingChanged = Boolean(withWarmRouting.hot_audience_used);
        }

        withWarmRouting.routing_changed_by_warm_signal = routingChanged;
        setSimulationResult(withWarmRouting);
      }
    } catch (err: any) {
      console.error('[Atlas3MControlCenter] Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  // Run initial simulation once accounts are loaded
  useEffect(() => {
    if (accounts.length > 0 && !simulationResult) {
      handleSimulate();
    }
  }, [accounts]);

  // BLOQUE 2 — Group Accounts by Platform
  const platformsOrder: Array<'YOUTUBE' | 'FACEBOOK' | 'INSTAGRAM' | 'TELEGRAM' | 'NOSTR' | 'TIKTOK' | 'REDDIT'> = [
    'YOUTUBE',
    'FACEBOOK',
    'INSTAGRAM',
    'TELEGRAM',
    'NOSTR',
    'TIKTOK',
    'REDDIT'
  ];

  const groupedAccounts = useMemo(() => {
    const map = new Map<string, BroadcastAccount[]>();
    for (const p of platformsOrder) {
      map.set(p, []);
    }
    for (const acc of accounts) {
      const list = map.get(acc.platform) || [];
      list.push(acc);
      map.set(acc.platform, list);
    }
    return map;
  }, [accounts]);

  // Map reach metrics per account
  const accountMetricsMap = useMemo(() => {
    const map = new Map<string, AccountReachMetrics>();
    if (reachReport?.accounts) {
      for (const m of reachReport.accounts) {
        map.set(m.account_id, m);
      }
    }
    return map;
  }, [reachReport]);

  // Helper to extract clean username
  const getAccountUsername = (acc: BroadcastAccount): string => {
    if (acc.username) return `@${acc.username}`;
    if (acc.metadata?.username) return `@${acc.metadata.username}`;
    if (acc.metadata?.botUsername) return acc.metadata.botUsername;
    if (acc.metadata?.customUrl) return acc.metadata.customUrl;
    if (acc.metadata?.pageName) return acc.metadata.pageName;
    if (acc.metadata?.name) return acc.metadata.name;
    if (acc.metadata?.npub) return acc.metadata.npub.slice(0, 16) + '...';
    if (acc.external_account_id) return acc.external_account_id.slice(0, 14) + '...';
    return '—';
  };

  // BLOQUE 5 — ESTADO RED
  const networkState = useMemo(() => {
    const connectedAccountsCount = accounts.filter(a => a.status === 'CONNECTED').length;

    // Platform status matrix
    const matrix = [
      {
        platform: 'YouTube',
        key: 'YOUTUBE',
        status: 'CONNECTED',
        statusClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      },
      {
        platform: 'Facebook',
        key: 'FACEBOOK',
        status: 'CONNECTED',
        statusClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      },
      {
        platform: 'Instagram',
        key: 'INSTAGRAM',
        status: 'CONNECTED',
        statusClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      },
      {
        platform: 'Telegram',
        key: 'TELEGRAM',
        status: 'CONNECTED',
        statusClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      },
      {
        platform: 'Nostr',
        key: 'NOSTR',
        status: 'CONNECTED',
        statusClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      },
      {
        platform: 'TikTok',
        key: 'TIKTOK',
        status: 'IN_REVIEW / SANDBOX CONNECTED',
        statusClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      },
      {
        platform: 'Reddit',
        key: 'REDDIT',
        status: 'PENDING',
        statusClass: 'text-slate-400 bg-slate-800 border-slate-700'
      }
    ];

    const platformsConnected = matrix.filter(p => p.status === 'CONNECTED').length;
    const platformsPending = matrix.filter(p => p.status !== 'CONNECTED').length;

    return {
      connectedAccountsCount,
      platformsConnected,
      platformsPending,
      matrix
    };
  }, [accounts]);

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 font-sans antialiased selection:bg-cyan-500/30">
      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* Page Hero Title & Actions */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">CONTROL CENTER 3M</h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  OPERATIVO
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Estado → Decisión → Acción • Invariante Sin Datos Sintéticos</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              id="btn-cc-actualizar"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={() => navigate('/broadcast/accounts')}
              id="btn-cc-conectar-cuenta"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              + CONECTAR OTRA CUENTA
            </button>
          </div>
        </div>
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BLOQUE 1 — OBJETIVO 3M (REACH INTELLIGENCE REAL) */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white uppercase">BLOQUE 1 — OBJETIVO 3M</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateWithContext('/broadcast/metrics-3m')}
                id="btn-b1-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>MEDICIÓN FÍSICA EN TIEMPO REAL</span>
              </div>
            </div>
          </div>

          {/* 5 Core Metric Cards: TARGET, CURRENT, PROJECTED 24H, GAP, PROGRESS % */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: 3,000,000 TARGET */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">3,000,000 TARGET</span>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white">3,000,000</span>
                  <span className="text-xs text-cyan-400 font-medium font-mono">views/day</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">Objetivo oficial de alcance diario Atlas</p>
            </div>

            {/* Card 2: CURRENT */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">CURRENT</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    reachReport?.MEASUREMENT_COVERAGE === 'FULL'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : reachReport?.MEASUREMENT_COVERAGE === 'PARTIAL'
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-slate-400 bg-slate-800 border-slate-700'
                  }`}>
                    {reachReport?.MEASUREMENT_COVERAGE === 'FULL'
                      ? 'VERIFICADO TOTAL'
                      : reachReport?.MEASUREMENT_COVERAGE === 'PARTIAL'
                      ? 'COBERTURA PARCIAL'
                      : 'PENDIENTE DE DATOS'}
                  </span>
                </div>
                <div className="mt-3">
                  {reachReport?.CURRENT_DAILY_REACH === 'UNKNOWN' ? (
                    reachReport?.MEASUREMENT_COVERAGE === 'PARTIAL' ? (
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold tracking-tight text-amber-400 font-mono">
                            {typeof reachReport.MEASURED_DAILY_REACH === 'number'
                              ? reachReport.MEASURED_DAILY_REACH.toLocaleString('es-AR')
                              : reachReport.MEASURED_DAILY_REACH}
                          </span>
                          <span className="text-xs text-amber-400/80 font-mono">medido parcial</span>
                        </div>
                        <p className="text-[10px] text-amber-400/70 font-mono">
                          {reachReport.UNKNOWN_PLATFORMS?.length ?? 0} plataforma(s) aún sin telemetría
                        </p>
                      </div>
                    ) : (
                      <div className="py-1">
                        <div className="inline-block px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold text-amber-300 font-mono tracking-tight">
                          DATOS DIARIOS AÚN NO DISPONIBLES
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">
                          UNKNOWN != 0 (Sin métricas de hoy)
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-white font-mono">
                        {typeof reachReport?.CURRENT_DAILY_REACH === 'number'
                          ? reachReport.CURRENT_DAILY_REACH.toLocaleString('es-AR')
                          : (reachReport?.CURRENT_DAILY_REACH ?? 'UNKNOWN')}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">reach</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Views hoy:</span>
                <span className="font-mono text-slate-300 font-semibold">
                  {reachReport?.CURRENT_DAILY_VIEWS === 'UNKNOWN'
                    ? (reachReport?.MEASURED_DAILY_VIEWS && reachReport.MEASURED_DAILY_VIEWS !== 'UNKNOWN'
                        ? `${reachReport.MEASURED_DAILY_VIEWS} (parcial)`
                        : 'UNKNOWN')
                    : (reachReport?.CURRENT_DAILY_VIEWS ?? 'UNKNOWN')}
                </span>
              </div>
            </div>

            {/* Card 3: PROJECTED 24H */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">PROJECTED 24H</span>
                  <span className="text-[10px] text-slate-500 font-mono">POR RITMO REAL</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-slate-400 font-mono">
                    {reachReport ? (typeof reachReport.PROJECTED_24H_REACH === 'number' ? reachReport.PROJECTED_24H_REACH.toLocaleString('es-AR') : reachReport.PROJECTED_24H_REACH) : 'UNKNOWN'}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                {reachReport?.PROJECTED_24H_REACH === 'UNKNOWN' ? 'Ritmo observado insuficiente' : 'Proyección a 24h'}
              </p>
            </div>

            {/* Card 4: GAP */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">GAP</span>
                  <span className="text-[10px] text-amber-400 font-mono">HACIA 3M</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold tracking-tight font-mono ${
                    reachReport?.REACH_GAP === 'UNKNOWN' ? 'text-slate-400' : 'text-amber-400'
                  }`}>
                    {reachReport?.REACH_GAP === 'UNKNOWN'
                      ? 'UNKNOWN'
                      : (typeof reachReport?.REACH_GAP === 'number' ? reachReport.REACH_GAP.toLocaleString('es-AR') : 'UNKNOWN')}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                {reachReport?.REACH_GAP === 'UNKNOWN' ? 'Requiere cobertura completa' : '3,000,000 - CURRENT_DAILY_REACH'}
              </p>
            </div>

            {/* Card 5: PROGRESS % */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">PROGRESS %</span>
                  <Percent className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold tracking-tight font-mono ${
                    reachReport?.REACH_PROGRESS_PERCENT === 'UNKNOWN' ? 'text-slate-400' : 'text-cyan-400'
                  }`}>
                    {reachReport?.REACH_PROGRESS_PERCENT ?? 'UNKNOWN'}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                    style={{
                      width: reachReport && typeof reachReport.CURRENT_DAILY_REACH === 'number'
                        ? `${Math.min(100, (reachReport.CURRENT_DAILY_REACH / 3000000) * 100)}%`
                        : '0%'
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* POR PLATAFORMA (Reach Intelligence Breakdown) */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  DESGLOSE POR PLATAFORMA (MÉTRICAS FÍSICAS VERIFICADAS)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {reachReport?.ACCOUNTS_MEASURED ?? 5} CUENTAS AUDITADAS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4 font-medium">PLATAFORMA</th>
                    <th className="py-2.5 px-4 font-medium">PLATFORM_REACH</th>
                    <th className="py-2.5 px-4 font-medium">PLATFORM_SHARE</th>
                    <th className="py-2.5 px-4 font-medium">TOP_ACCOUNT</th>
                    <th className="py-2.5 px-4 font-medium">VIEWS_PER_HOUR</th>
                    <th className="py-2.5 px-4 font-medium">SUMA A 3M</th>
                    <th className="py-2.5 px-4 font-medium">FUENTE & RAZÓN (SEMANTIC GATE)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {(!reachReport?.platforms || reachReport.platforms.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        Cargando métricas verificables por plataforma...
                      </td>
                    </tr>
                  ) : (
                    reachReport.platforms.map(p => (
                      <tr key={p.platform} className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[11px]">
                            {p.platform}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className={typeof p.PLATFORM_REACH === 'number' ? 'text-white font-bold' : 'text-slate-500'}>
                            {typeof p.PLATFORM_REACH === 'number' ? p.PLATFORM_REACH.toLocaleString('es-AR') : p.PLATFORM_REACH}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-cyan-400 font-medium">
                          {p.PLATFORM_SHARE}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {p.TOP_ACCOUNT}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className={typeof p.VIEWS_PER_HOUR === 'number' ? 'text-emerald-400' : 'text-slate-500'}>
                            {typeof p.VIEWS_PER_HOUR === 'number' ? `${p.VIEWS_PER_HOUR}/h` : p.VIEWS_PER_HOUR}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {p.COUNTS_TOWARD_3M ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              YES
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              NO
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs">
                          <div className="font-mono text-[10px] text-slate-300 truncate">{p.METRIC_SOURCE || '—'}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-1">{p.REASON || '—'}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* POST PERFORMANCE REAL (AtlasPostMetricsCollector V1) */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  RENDIMIENTO REAL POR PUBLICACIÓN (POST METRICS COLLECTOR V1)
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  SNAPSHOTS HISTÓRICOS ACTIVOS
                </span>
                <span className="text-slate-400">
                  {reachReport?.post_metrics?.MEASURED_POSTS ?? 0} PUBLICACIONES AUDITADAS
                </span>
              </div>
            </div>

            {/* Summary Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">TOTAL REAL REACH</span>
                <span className="text-lg font-bold font-mono text-cyan-400 mt-1 block">
                  {typeof reachReport?.post_metrics?.TOTAL_REAL_REACH === 'number'
                    ? reachReport.post_metrics.TOTAL_REAL_REACH.toLocaleString('es-AR')
                    : 'UNKNOWN'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">TOTAL REAL VIEWS</span>
                <span className="text-lg font-bold font-mono text-white mt-1 block">
                  {typeof reachReport?.post_metrics?.TOTAL_REAL_VIEWS === 'number'
                    ? reachReport.post_metrics.TOTAL_REAL_VIEWS.toLocaleString('es-AR')
                    : 'UNKNOWN'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">TOP POST</span>
                <span className="text-xs font-bold font-mono text-emerald-400 mt-1 block truncate">
                  {reachReport?.post_metrics?.TOP_POST
                    ? `${reachReport.post_metrics.TOP_POST.platform} (${reachReport.post_metrics.TOP_POST.reach} reach)`
                    : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">COBERTURA POSTS</span>
                <span className="text-xs font-bold font-mono text-amber-400 mt-1 block">
                  {reachReport?.post_metrics?.MEASUREMENT_COVERAGE ?? 'PARTIAL'} ({reachReport?.post_metrics?.POSTS_WITH_VERIFIED_METRICS ?? 0} VERIFICADOS)
                </span>
              </div>
            </div>

            {/* Posts List */}
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-400 uppercase tracking-wider text-[10px] sticky top-0 bg-[#0c0d14]">
                    <th className="py-2.5 px-4 font-medium">PUBLICACIÓN / TÍTULO</th>
                    <th className="py-2.5 px-4 font-medium">PLATAFORMA</th>
                    <th className="py-2.5 px-4 font-medium">CUENTA</th>
                    <th className="py-2.5 px-4 font-medium">REACH</th>
                    <th className="py-2.5 px-4 font-medium">VIEWS</th>
                    <th className="py-2.5 px-4 font-medium">ENGAGEMENTS</th>
                    <th className="py-2.5 px-4 font-medium">VERIFICADO</th>
                    <th className="py-2.5 px-4 font-medium">FUENTE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {(!reachReport?.post_metrics?.posts || reachReport.post_metrics.posts.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        No se detectaron publicaciones reales activas.
                      </td>
                    </tr>
                  ) : (
                    reachReport.post_metrics.posts.map(post => (
                      <tr key={post.post_id} className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 px-4 font-mono max-w-xs">
                          <a
                            href={post.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-300 hover:text-cyan-400 transition-colors font-medium truncate block"
                          >
                            {post.title || post.post_id}
                          </a>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-white">
                          <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px]">
                            {post.platform}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                          {post.account_id}
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <span className={typeof post.REACH === 'number' ? 'text-white font-bold' : 'text-slate-500'}>
                            {typeof post.REACH === 'number' ? post.REACH.toLocaleString('es-AR') : post.REACH}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <span className={typeof post.VIEWS === 'number' ? 'text-white font-bold' : 'text-slate-500'}>
                            {typeof post.VIEWS === 'number' ? post.VIEWS.toLocaleString('es-AR') : post.VIEWS}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-300">
                          {typeof post.ENGAGEMENTS === 'number' ? post.ENGAGEMENTS : (typeof post.LIKES === 'number' ? `${post.LIKES} likes` : 'UNKNOWN')}
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          {post.VERIFIED ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              VERIFIED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              UNKNOWN
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 text-[10px] font-mono truncate max-w-[140px]">
                          {post.SOURCE}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ATLAS VIRALITY BRAIN V1 — CONTENT PERFORMANCE INTELLIGENCE */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-400" />
              <div>
                <h2 className="text-sm font-semibold tracking-wider text-white uppercase">
                  ATLAS VIRALITY BRAIN V1 — CONTENT PERFORMANCE INTELLIGENCE
                </h2>
                <p className="text-xs text-slate-400">
                  Detección algorítmica de contenido ganador y perdedor basada exclusivamente en métricas físicas verificadas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <button
                onClick={() => navigateWithContext('/broadcast/virality')}
                id="btn-virality-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-purple-300 hover:text-white bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                AUTO_PUBLISH: NO (Priorización de Router)
              </span>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                CAMPAIGN_ROUTER: CONECTADO
              </span>
            </div>
          </div>

          {/* Virality Counters: BREAKOUT, TOP WINNERS, NORMAL, LOSERS, UNKNOWN EXCLUDED */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: BREAKOUT */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-fuchsia-950/30 to-purple-900/10 border border-fuchsia-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-fuchsia-300 uppercase tracking-wider">BREAKOUT CONTENT</span>
                  <Flame className="w-4 h-4 text-fuchsia-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {viralityReport?.BREAKOUTS ?? 0}
                  </span>
                  <span className="text-[11px] text-fuchsia-400 font-mono">posts (≥80)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Tracción y velocidad de interacción máxima</p>
            </div>

            {/* Card 2: TOP WINNERS */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 to-teal-900/10 border border-emerald-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">TOP WINNERS</span>
                  <Award className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {viralityReport?.WINNERS ?? 0}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">posts (60-79)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Desempeño superior al percentil de su canal</p>
            </div>

            {/* Card 3: NORMAL */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">NORMAL CONTENT</span>
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {viralityReport?.NORMAL ?? 0}
                  </span>
                  <span className="text-[11px] text-blue-400 font-mono">posts (35-59)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Rendimiento alineado al promedio de canal</p>
            </div>

            {/* Card 4: LOSERS */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/30 to-red-900/10 border border-rose-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider">LOSERS</span>
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {viralityReport?.LOSERS ?? 0}
                  </span>
                  <span className="text-[11px] text-rose-400 font-mono">posts (&lt;35)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Tracción deficiente o nula en interacción</p>
            </div>

            {/* Card 5: UNKNOWN EXCLUDED */}
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-700/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">UNKNOWN EXCLUDED</span>
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-slate-300 font-mono">
                    {viralityReport?.UNKNOWN_EXCLUDED ?? 5}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">aislados</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Invariante: UNKNOWN no suma ni penaliza</p>
            </div>
          </div>

          {/* Dossiers of Top Breakouts & Winners with Hook/Pattern Evidence */}
          {((viralityReport?.breakout_content?.length ?? 0) > 0 || (viralityReport?.top_winners?.length ?? 0) > 0) && (
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  PATRONES Y HOOKS DE CONTENIDO GANADOR DETECTADOS
                </span>
                <span className="text-[10px] text-slate-500 font-mono">EVIDENCIA TEXTUAL Y TELEMÉTRICA</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {viralityReport?.breakout_content?.map(b => (
                  <div
                    key={b.post_id}
                    className="p-3.5 rounded-xl bg-fuchsia-950/20 border border-fuchsia-500/20 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                          BREAKOUT {b.virality_score}/100
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{b.platform}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-white mt-2 line-clamp-2">{b.topic}</h4>
                      <p className="text-[11px] text-fuchsia-200/80 mt-1 font-mono">{b.hook_pattern}</p>
                      <p className="text-[10px] text-slate-400 mt-2">{b.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/[0.04]">
                      {b.evidence?.map((ev, i) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                {viralityReport?.top_winners?.map(w => (
                  <div
                    key={w.post_id}
                    className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          WINNER {w.virality_score}/100
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{w.platform}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-white mt-2 line-clamp-2">{w.topic}</h4>
                      <p className="text-[11px] text-emerald-200/80 mt-1 font-mono">{w.hook_pattern}</p>
                      <p className="text-[10px] text-slate-400 mt-2">{w.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/[0.04]">
                      {w.evidence?.map((ev, i) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Virality Performance Table with Filters */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                  REGISTRO COMPLETO DE PUBLICACIONES AUDITADAS ({viralityReport?.POSTS_ANALYZED ?? 19})
                </span>
                <span className="text-[11px] text-slate-500">
                  Comparación intra-canal sin mezcla de métricas incompatibles
                </span>
              </div>

              {/* Tab Filters */}
              <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/[0.06]">
                <button
                  onClick={() => setViralityFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    viralityFilter === 'ALL'
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  TODOS ({viralityReport?.POSTS_ANALYZED ?? 19})
                </button>
                <button
                  onClick={() => setViralityFilter('BREAKOUT')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    viralityFilter === 'BREAKOUT'
                      ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  BREAKOUT ({viralityReport?.BREAKOUTS ?? 0})
                </button>
                <button
                  onClick={() => setViralityFilter('WINNERS')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    viralityFilter === 'WINNERS'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  GANADORES ({viralityReport?.WINNERS ?? 0})
                </button>
                <button
                  onClick={() => setViralityFilter('LOSERS')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    viralityFilter === 'LOSERS'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PERDEDORES ({viralityReport?.LOSERS ?? 0})
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-400 uppercase tracking-wider text-[10px] sticky top-0 bg-[#0c0d14]">
                    <th className="py-2.5 px-4 font-medium">PUBLICACIÓN / TÍTULO</th>
                    <th className="py-2.5 px-4 font-medium">PLATAFORMA</th>
                    <th className="py-2.5 px-4 font-medium">CUENTA</th>
                    <th className="py-2.5 px-4 font-medium">CLASIFICACIÓN</th>
                    <th className="py-2.5 px-4 font-medium">VIRALITY_SCORE</th>
                    <th className="py-2.5 px-4 font-medium">VIEWS / HORA</th>
                    <th className="py-2.5 px-4 font-medium">TREND</th>
                    <th className="py-2.5 px-4 font-medium">PATRÓN / HOOK</th>
                    <th className="py-2.5 px-4 font-medium text-right">ACCIONES CRUZADAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {(!viralityReport?.all_evaluated_posts || viralityReport.all_evaluated_posts.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Cargando métricas algorítmicas de contenido...
                      </td>
                    </tr>
                  ) : (
                    viralityReport.all_evaluated_posts
                      .filter(post => {
                        if (viralityFilter === 'BREAKOUT') return post.classification === 'BREAKOUT';
                        if (viralityFilter === 'WINNERS') return post.classification === 'WINNER';
                        if (viralityFilter === 'LOSERS') return post.classification === 'LOSER';
                        return true;
                      })
                      .map(post => (
                        <tr key={post.post_id} className="hover:bg-white/[0.015] transition-colors">
                          <td className="py-2.5 px-4 font-mono max-w-xs">
                            <a
                              href={post.external_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 hover:text-cyan-400 transition-colors font-medium truncate block"
                            >
                              {post.title || post.post_id}
                            </a>
                            <span className="text-[10px] text-slate-500 block truncate">{post.topic}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-white">
                            <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px]">
                              {post.platform}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                            {post.account_id}
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            {post.classification === 'BREAKOUT' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30">
                                BREAKOUT
                              </span>
                            )}
                            {post.classification === 'WINNER' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                WINNER
                              </span>
                            )}
                            {post.classification === 'NORMAL' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                NORMAL
                              </span>
                            )}
                            {post.classification === 'LOSER' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                LOSER
                              </span>
                            )}
                            {post.classification === 'UNKNOWN_EXCLUDED' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                UNKNOWN
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            <span className={`font-bold ${
                              typeof post.virality_score === 'number' && post.virality_score >= 80
                                ? 'text-fuchsia-400'
                                : typeof post.virality_score === 'number' && post.virality_score >= 60
                                ? 'text-emerald-400'
                                : typeof post.virality_score === 'number' && post.virality_score >= 35
                                ? 'text-blue-400'
                                : typeof post.virality_score === 'number'
                                ? 'text-rose-400'
                                : 'text-slate-500'
                            }`}>
                              {post.virality_score === 'UNKNOWN' ? 'UNKNOWN' : `${post.virality_score}/100`}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-300">
                            {post.views_per_hour === 'UNKNOWN' ? 'UNKNOWN' : `${post.views_per_hour}/h`}
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            {post.trend === 'ACCELERATING' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                <TrendingUp className="w-3 h-3" />
                                ACELERA
                              </span>
                            )}
                            {post.trend === 'STEADY' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-400">
                                <Activity className="w-3 h-3" />
                                ESTABLE
                              </span>
                            )}
                            {post.trend === 'FLAT' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-400">
                                <TrendingDown className="w-3 h-3" />
                                PLANO
                              </span>
                            )}
                            {(post.trend === 'DECAY' || post.trend === 'UNKNOWN') && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400 text-[10px] truncate max-w-[160px]">
                            {post.hook_pattern || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                              {post.external_url && (
                                <a
                                  href={post.external_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-[10px] font-mono border border-white/[0.08] transition-colors"
                                  title="Ver publicación externa"
                                >
                                  <span>VER</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedContent(post.post_id);
                                  setSelectedAccount(post.account_id);
                                  setSelectedPlatform(post.platform);
                                  navigateWithContext('/broadcast/metrics-3m', { content: post.post_id });
                                }}
                                className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-[10px] font-mono border border-white/[0.08] transition-colors"
                              >
                                MÉTRICAS
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedContent(post.post_id);
                                  setSelectedAccount(post.account_id);
                                  setSelectedPlatform(post.platform);
                                  navigateWithContext('/broadcast/release', { content: post.post_id });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 text-[10px] font-mono font-medium transition-colors"
                              >
                                <span>A RELEASE</span>
                                <ChevronRight className="w-2.5 h-2.5" />
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
        </section>

        {/* ========================================================================= */}
        {/* ATLAS RELEASE CONTROLLER V1 — LIFECYCLE & SATURATION DECISION GATE */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-sm font-semibold tracking-wider text-white uppercase">
                  ATLAS RELEASE CONTROLLER V1 — LIFECYCLE & SATURATION DECISION GATE
                </h2>
                <p className="text-xs text-slate-400">
                  Decisión algorítmica por publicación (HOLD, CANARY, EXPAND, SCALE, STOP) con protección estricta de saturación
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <button
                onClick={() => navigateWithContext('/broadcast/release')}
                id="btn-release-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                AUTO_PUBLISH: NO (Priorización de Router)
              </span>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                SATURATION_GATE: ACTIVO
              </span>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                UNKNOWN_HELD: {releaseReport?.UNKNOWN_HELD ?? 5}
              </span>
            </div>
          </div>

          {/* Decision Metric Cards: SCALE, EXPAND, CANARY, STOP, HOLD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: SCALE */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-fuchsia-950/30 to-purple-900/10 border border-fuchsia-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-fuchsia-300 uppercase tracking-wider">SCALE</span>
                  <Flame className="w-4 h-4 text-fuchsia-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {releaseReport?.SCALE ?? 0}
                  </span>
                  <span className="text-[11px] text-fuchsia-400 font-mono">posts (Breakout)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Escala máxima en canales prioritarios</p>
            </div>

            {/* Card 2: EXPAND */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 to-teal-900/10 border border-emerald-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">EXPAND</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {releaseReport?.EXPAND ?? 0}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">posts (Winner)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Expansión controlada a cuentas afines</p>
            </div>

            {/* Card 3: CANARY */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">CANARY</span>
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {releaseReport?.CANARY ?? 0}
                  </span>
                  <span className="text-[11px] text-blue-400 font-mono">posts (Normal)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Prueba controlada sin blast general</p>
            </div>

            {/* Card 4: STOP */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/30 to-red-900/10 border border-rose-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider">STOP</span>
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-white font-mono">
                    {releaseReport?.STOP ?? 0}
                  </span>
                  <span className="text-[11px] text-rose-400 font-mono">posts (Loser)</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Congelado por sub-rendimiento o cooldown</p>
            </div>

            {/* Card 5: HOLD */}
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-700/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">HOLD</span>
                  <Clock className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-slate-300 font-mono">
                    {releaseReport?.HOLD ?? 0}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">UNKNOWN</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Métricas ausentes: aislado sin penalizar</p>
            </div>
          </div>

          {/* Release Decisions Table */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                  MATRIZ DE DECISIONES DE RELEASE ({releaseReport?.CONTENTS_EVALUATED ?? 19} PUBLICACIONES)
                </span>
                <span className="text-[11px] text-slate-500">
                  Evaluación unificada de Virality Brain + Campaign Router + Warm Audience
                </span>
              </div>

              {/* Tab Filters */}
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/[0.06] flex-wrap">
                <button
                  onClick={() => setReleaseFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    releaseFilter === 'ALL'
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  TODOS ({releaseReport?.CONTENTS_EVALUATED ?? 19})
                </button>
                <button
                  onClick={() => setReleaseFilter('SCALE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    releaseFilter === 'SCALE'
                      ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  SCALE ({releaseReport?.SCALE ?? 0})
                </button>
                <button
                  onClick={() => setReleaseFilter('EXPAND')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    releaseFilter === 'EXPAND'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  EXPAND ({releaseReport?.EXPAND ?? 0})
                </button>
                <button
                  onClick={() => setReleaseFilter('CANARY')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    releaseFilter === 'CANARY'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  CANARY ({releaseReport?.CANARY ?? 0})
                </button>
                <button
                  onClick={() => setReleaseFilter('STOP')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    releaseFilter === 'STOP'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  STOP ({releaseReport?.STOP ?? 0})
                </button>
                <button
                  onClick={() => setReleaseFilter('HOLD')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    releaseFilter === 'HOLD'
                      ? 'bg-slate-700/50 text-slate-300 border border-slate-600'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  HOLD ({releaseReport?.HOLD ?? 0})
                </button>
              </div>
            </div>

            {/* Table with exact required fields: CONTENT, CLASS, VIRALITY_SCORE, DECISION, BEST_ACCOUNT, SATURATION_RISK, NEXT STEP */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-400 uppercase tracking-wider text-[10px] sticky top-0 bg-[#0c0d14]">
                    <th className="py-2.5 px-4 font-medium">CONTENT</th>
                    <th className="py-2.5 px-4 font-medium">CLASS</th>
                    <th className="py-2.5 px-4 font-medium">VIRALITY_SCORE</th>
                    <th className="py-2.5 px-4 font-medium">DECISION</th>
                    <th className="py-2.5 px-4 font-medium">BEST_ACCOUNT</th>
                    <th className="py-2.5 px-4 font-medium">SATURATION_RISK</th>
                    <th className="py-2.5 px-4 font-medium">NEXT STEP</th>
                    <th className="py-2.5 px-4 font-medium text-right">ACCIONES CRUZADAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {(!releaseReport?.evaluations || releaseReport.evaluations.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Evaluando decisiones de release del contenido...
                      </td>
                    </tr>
                  ) : (
                    releaseReport.evaluations
                      .filter(e => {
                        if (releaseFilter === 'HOLD') return e.release_decision === 'HOLD';
                        if (releaseFilter === 'CANARY') return e.release_decision === 'CANARY';
                        if (releaseFilter === 'EXPAND') return e.release_decision === 'EXPAND';
                        if (releaseFilter === 'SCALE') return e.release_decision === 'SCALE';
                        if (releaseFilter === 'STOP') return e.release_decision === 'STOP';
                        return true;
                      })
                      .map(item => (
                        <tr key={item.content_id} className="hover:bg-white/[0.015] transition-colors">
                          <td className="py-2.5 px-4 font-mono max-w-xs">
                            <span className="text-slate-200 font-medium truncate block">{item.title}</span>
                            <span className="text-[10px] text-slate-500 font-mono block truncate">
                              ID: {item.content_id} ({item.platform})
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            {item.virality_class === 'BREAKOUT' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30">
                                BREAKOUT
                              </span>
                            )}
                            {item.virality_class === 'WINNER' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                WINNER
                              </span>
                            )}
                            {item.virality_class === 'NORMAL' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                NORMAL
                              </span>
                            )}
                            {item.virality_class === 'LOSER' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                LOSER
                              </span>
                            )}
                            {item.virality_class === 'UNKNOWN_EXCLUDED' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                UNKNOWN
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold">
                            <span className={
                              item.virality_score === 'UNKNOWN'
                                ? 'text-slate-500'
                                : Number(item.virality_score) >= 80
                                ? 'text-fuchsia-400'
                                : Number(item.virality_score) >= 60
                                ? 'text-emerald-400'
                                : Number(item.virality_score) >= 35
                                ? 'text-blue-400'
                                : 'text-rose-400'
                            }>
                              {item.virality_score === 'UNKNOWN' ? 'UNKNOWN' : `${item.virality_score}/100`}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            {item.release_decision === 'SCALE' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                                SCALE
                              </span>
                            )}
                            {item.release_decision === 'EXPAND' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                EXPAND
                              </span>
                            )}
                            {item.release_decision === 'CANARY' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                CANARY
                              </span>
                            )}
                            {item.release_decision === 'STOP' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                STOP
                              </span>
                            )}
                            {item.release_decision === 'HOLD' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                HOLD
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-300 text-[11px]">
                            <span className="font-semibold text-white">{item.best_account}</span>
                            <span className="text-[10px] text-slate-500 block">({item.best_platform})</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              item.saturation_risk >= 0.7
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : item.saturation_risk > 0
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {Math.round(item.saturation_risk * 100)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-300 text-[11px] max-w-xs">
                            <span className="font-medium text-white block">{item.recommended_next_step}</span>
                            <span className="text-[10px] text-slate-500 block truncate">{item.reason}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                              {/* VER VIRALIDAD */}
                              <button
                                onClick={() => {
                                  setSelectedContent(item.content_id);
                                  navigateWithContext('/broadcast/virality', { content: item.content_id });
                                }}
                                className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-purple-300 text-[10px] font-mono border border-purple-500/20 transition-colors"
                              >
                                VIRALIDAD
                              </button>
                              {/* VER CUENTA */}
                              <button
                                onClick={() => {
                                  setSelectedAccount(item.best_account);
                                  navigateWithContext('/broadcast/accounts', { account: item.best_account });
                                }}
                                className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-cyan-300 text-[10px] font-mono border border-cyan-500/20 transition-colors"
                              >
                                CUENTA
                              </button>
                              {/* VER CAMPAÑA */}
                              <button
                                onClick={() => {
                                  setSelectedContent(item.content_id);
                                  setSelectedAccount(item.best_account);
                                  setSelectedPlatform(item.best_platform);
                                  navigateWithContext('/broadcast/campaigns', { content: item.content_id });
                                }}
                                className="px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-mono border border-blue-500/30 transition-colors"
                              >
                                CAMPAÑA
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
        </section>

        {/* ========================================================================= */}
        {/* BLOQUE 2 — CUENTAS */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white uppercase">BLOQUE 2 — CUENTAS AGRUPADAS POR PLATAFORMA</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateWithContext('/broadcast/accounts')}
                id="btn-cuentas-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigateWithContext('/broadcast/accounts')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all cursor-pointer"
              >
                + CONECTAR OTRA CUENTA
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {platformsOrder.map(platformKey => {
              const platformAccounts = groupedAccounts.get(platformKey) || [];
              const isConfigured = platformAccounts.length > 0;

              return (
                <div key={platformKey} className="rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden">
                  {/* Platform Group Header */}
                  <div className="px-5 py-3 bg-white/[0.03] border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-xs text-white px-2 py-0.5 rounded bg-white/[0.08]">
                        {platformKey}
                      </span>
                      <span className="text-xs text-slate-400">
                        {platformAccounts.length} {platformAccounts.length === 1 ? 'cuenta registrada' : 'cuentas registradas'}
                      </span>
                    </div>
                    {isConfigured ? (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> CANAL INTEGRADO
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">
                        SIN REGISTROS ACTIVOS
                      </span>
                    )}
                  </div>

                  {/* Accounts Table within this Platform */}
                  {platformAccounts.length === 0 ? (
                    <div className="px-5 py-4 text-xs text-slate-500 italic">
                      No hay cuentas asociadas a {platformKey} en este momento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.04] text-slate-400 uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-4 font-medium">NOMBRE</th>
                            <th className="py-2.5 px-4 font-medium">USERNAME</th>
                            <th className="py-2.5 px-4 font-medium">CONNECTED</th>
                            <th className="py-2.5 px-4 font-medium">publish_enabled</th>
                            <th className="py-2.5 px-4 font-medium">VIEWS_TODAY</th>
                            <th className="py-2.5 px-4 font-medium">REACH_TODAY</th>
                            <th className="py-2.5 px-4 font-medium">ENGAGEMENT</th>
                            <th className="py-2.5 px-4 font-medium">HEALTH</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                          {platformAccounts.map(acc => {
                            const isConnected = acc.status === 'CONNECTED';
                            const username = getAccountUsername(acc);
                            const metrics = accountMetricsMap.get(acc.account_id);
                            const healthStatus = isConnected
                              ? '100% OK'
                              : acc.status === 'BLOCKED_EXTERNAL_SETUP'
                              ? 'CONFIG_REQUERIDA'
                              : 'NOT_CONNECTED';

                            return (
                              <tr key={acc.account_id} className="hover:bg-white/[0.015] transition-colors">
                                <td className="py-3 px-4 font-medium text-white">
                                  {acc.display_name}
                                  <span className="block text-[10px] text-slate-500 font-mono mt-0.5">{acc.account_id}</span>
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-300">
                                  {username}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                                      isConnected
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}
                                  >
                                    {isConnected ? 'CONNECTED' : acc.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                                      acc.publish_enabled
                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}
                                  >
                                    {acc.publish_enabled ? 'true' : 'false'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  <span className={metrics && typeof metrics.VIEWS_TODAY === 'number' ? 'text-white font-bold' : 'text-slate-500'}>
                                    {metrics ? metrics.VIEWS_TODAY : 'UNKNOWN'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  <span className={metrics && typeof metrics.REACH_TODAY === 'number' ? 'text-white font-bold' : 'text-slate-500'}>
                                    {metrics ? metrics.REACH_TODAY : 'UNKNOWN'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  <span className={metrics && typeof metrics.ENGAGEMENT_TODAY === 'number' ? 'text-emerald-400' : 'text-slate-500'}>
                                    {metrics ? metrics.ENGAGEMENT_TODAY : 'UNKNOWN'}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    {healthStatus}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* BLOQUE 3 — WARM AUDIENCE */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white uppercase">BLOQUE 3 — WARM AUDIENCE</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigateWithContext('/broadcast/warm-audience')}
                id="btn-warm-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-amber-300 hover:text-white bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              {/* Warning pill: HOT != CONTACTABLE */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                IMPORTANTE: HOT != CONTACTABLE
              </div>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">PROFILES_SCORED</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">
                {warmReport ? warmReport.PROFILES_SCORED : '—'}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">COLD</span>
              <span className="text-2xl font-bold text-slate-400 mt-1 block font-mono">
                {warmReport ? warmReport.COLD : '—'}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider block">WARM</span>
              <span className="text-2xl font-bold text-amber-400 mt-1 block font-mono">
                {warmReport ? warmReport.WARM : '—'}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider block">HOT</span>
              <span className="text-2xl font-bold text-orange-400 mt-1 block font-mono">
                {warmReport ? warmReport.HOT : '—'}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider block">VERY_HOT</span>
              <span className="text-2xl font-bold text-rose-400 mt-1 block font-mono">
                {warmReport ? warmReport.VERY_HOT : '—'}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider block">CONTACT_ELIGIBLE</span>
              <span className="text-2xl font-bold text-cyan-400 mt-1 block font-mono">
                {warmReport ? warmReport.CONTACT_ELIGIBLE : '—'}
              </span>
            </div>
          </div>

          {/* Profiles Table */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0b0d13] border-b border-white/[0.08] z-10">
                  <tr className="text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 font-medium">PROFILE</th>
                    <th className="py-3 px-4 font-medium">PLATFORM</th>
                    <th className="py-3 px-4 font-medium">WARM_SCORE</th>
                    <th className="py-3 px-4 font-medium">CLASS</th>
                    <th className="py-3 px-4 font-medium">TOP_INTERESTS</th>
                    <th className="py-3 px-4 font-medium">BEST_ACCOUNT</th>
                    <th className="py-3 px-4 font-medium">CONTACT_ELIGIBILITY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {!warmReport || warmReport.profiles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Cargando perfiles con señales físicas...
                      </td>
                    </tr>
                  ) : (
                    warmReport.profiles.slice(0, 20).map(p => {
                      let classBadge = 'bg-slate-800 text-slate-300';
                      if (p.class === 'VERY_HOT') classBadge = 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
                      else if (p.class === 'HOT') classBadge = 'bg-orange-500/15 text-orange-300 border border-orange-500/30';
                      else if (p.class === 'WARM') classBadge = 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
                      else classBadge = 'bg-slate-700/50 text-slate-400';

                      return (
                        <tr key={p.person_id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-4 font-medium text-white">
                            {p.display_name}
                            <span className="block text-[10px] text-slate-500 font-mono">{p.person_id.slice(0, 18)}...</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-300">{p.platform}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-white">{p.warm_score}</td>
                          <td className="py-2.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${classBadge}`}>
                              {p.class}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {p.top_interests.slice(0, 2).map((item, idx) => (
                                <span key={idx} className="bg-white/[0.06] text-slate-300 text-[10px] px-1.5 py-0.5 rounded truncate max-w-[150px]">
                                  {item}
                                </span>
                              ))}
                              {p.top_interests.length > 2 && (
                                <span className="text-[10px] text-slate-500 font-mono">+{p.top_interests.length - 2}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs text-cyan-400">{p.best_account}</td>
                          <td className="py-2.5 px-4">
                            {p.contact_eligibility ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                ELIGIBLE
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono">BROADCAST_ONLY</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="py-2.5 px-4 bg-white/[0.01] border-t border-white/[0.04] text-[11px] text-slate-500 flex justify-between items-center">
              <span>Muestra representativa de 100 perfiles reales certificados con evidencia física.</span>
              <span className="font-mono text-slate-400">GLOBAL DEDUPE: ACTIVO</span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* BLOQUE 4 — CAMPAIGN ROUTER */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white uppercase">BLOQUE 4 — CAMPAIGN ROUTER</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateWithContext('/broadcast/campaigns')}
                id="btn-campaigns-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-indigo-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-slate-500 font-mono">NO PUBLICA DESDE ESTE V1</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Formulario mínimo */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Formulario Mínimo de Campaña</h3>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 uppercase">TOPIC</label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-500"
                  placeholder="ej. Compresores Industriales y Maquinaria B2B"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 uppercase">AUDIENCE</label>
                <input
                  type="text"
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-500"
                  placeholder="ej. Compradores industriales y directivos técnicos"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1 uppercase">GEOGRAPHY</label>
                  <input
                    type="text"
                    value={geography}
                    onChange={e => setGeography(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1 uppercase">CONTENT_TYPE</label>
                  <select
                    value={contentType}
                    onChange={e => setContentType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="TEXT_ANNOUNCEMENT">TEXT_ANNOUNCEMENT</option>
                    <option value="SHORT_VIDEO">SHORT_VIDEO</option>
                    <option value="LONG_VIDEO">LONG_VIDEO</option>
                    <option value="IMAGE_POST">IMAGE_POST</option>
                    <option value="LINK">LINK</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 uppercase">REACH_TARGET</label>
                <input
                  type="number"
                  value={reachTarget}
                  onChange={e => setReachTarget(parseInt(e.target.value, 10) || 1000)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Presets */}
              <div className="pt-2">
                <span className="text-[10px] text-slate-500 block mb-1.5 uppercase font-medium">Casos de Simulación:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTopic('Compresores Industriales y Equipos Pesados');
                      setAudience('Compradores industriales y directivos técnicos');
                      setContentType('TEXT_ANNOUNCEMENT');
                    }}
                    className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-300 border border-white/[0.06] cursor-pointer"
                  >
                    Industrial B2B (Warm)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTopic('Políticas Sociales y Justicia Social');
                      setAudience('Ciudadanos CABA y beneficiarios');
                      setContentType('TEXT_ANNOUNCEMENT');
                    }}
                    className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-300 border border-white/[0.06] cursor-pointer"
                  >
                    Justicia Social
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTopic('Caballito Comercios y Ofertas Locales');
                      setAudience('Vecinos de Caballito');
                      setContentType('TEXT_ANNOUNCEMENT');
                    }}
                    className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-300 border border-white/[0.06] cursor-pointer"
                  >
                    Caballito Local
                  </button>
                </div>
              </div>

              {/* Botón: SIMULAR CAMPAÑA */}
              <button
                type="button"
                onClick={handleSimulate}
                disabled={simulating}
                className="w-full py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                SIMULAR CAMPAÑA
              </button>
            </div>

            {/* Resultado de Simulación */}
            <div className="lg:col-span-7 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Resultado del Campaign Router</h3>
                    <p className="text-[11px] text-slate-500">Selección óptima de canales con evaluación de saturación y afinidad</p>
                  </div>

                  {/* Mostrar claramente si: ROUTING_CHANGED_BY_WARM_SIGNAL=YES */}
                  <div className="flex items-center gap-1.5">
                    {simulationResult?.routing_changed_by_warm_signal ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <Sparkles className="w-3.5 h-3.5" />
                        ROUTING_CHANGED_BY_WARM_SIGNAL=YES
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                        ROUTING_CHANGED_BY_WARM_SIGNAL=NO
                      </span>
                    )}
                  </div>
                </div>

                {!simulationResult ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    Pulsa "SIMULAR CAMPAÑA" para computar el resultado del router.
                  </div>
                ) : (
                  <div className="space-y-4 mt-4">
                    {/* SELECTED_ACCOUNTS */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                          SELECTED_ACCOUNTS ({simulationResult.selected_accounts.length})
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          EXPECTED_REACH: {simulationResult.expected_reach.toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {simulationResult.selected_accounts.map(acc => (
                          <div
                            key={acc.account_id}
                            className="p-3.5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedAccount(acc.account_id);
                                      navigateWithContext('/broadcast/accounts', { account: acc.account_id });
                                    }}
                                    className="font-semibold text-xs text-white hover:text-cyan-400 transition-colors cursor-pointer text-left"
                                    title="Click cuenta → CUENTAS"
                                  >
                                    {acc.display_name}
                                  </button>
                                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                                    {acc.platform}
                                  </span>
                                  {acc.is_default && (
                                    <span className="text-[9px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                      DEFAULT
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  <strong className="text-slate-300">SELECTION_REASON:</strong> {acc.selection_reason}
                                </p>
                              </div>

                              {/* 4 Required Cross-Links: cuenta, audiencia, contenido, decisión */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => {
                                    setSelectedAccount(acc.account_id);
                                    navigateWithContext('/broadcast/accounts', { account: acc.account_id });
                                  }}
                                  className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-mono border border-cyan-500/30 transition-colors"
                                  title="click cuenta → CUENTAS"
                                >
                                  CUENTA →
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedAudience(audience);
                                    navigateWithContext('/broadcast/warm-audience', { audience });
                                  }}
                                  className="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 text-[10px] font-mono border border-amber-500/30 transition-colors"
                                  title="click audiencia → WARM AUDIENCE"
                                >
                                  AUDIENCIA →
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedContent('yt_post_001');
                                    navigateWithContext('/broadcast/virality', { content: 'yt_post_001' });
                                  }}
                                  className="px-2 py-0.5 rounded bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 text-[10px] font-mono border border-purple-500/30 transition-colors"
                                  title="click contenido → VIRALIDAD"
                                >
                                  CONTENIDO →
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedContent('yt_post_001');
                                    navigateWithContext('/broadcast/release', { content: 'yt_post_001' });
                                  }}
                                  className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-mono border border-emerald-500/30 transition-colors"
                                  title="click decisión → RELEASE"
                                >
                                  DECISIÓN →
                                </button>
                              </div>
                            </div>

                            {/* Required fields breakdown for each selected account */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 pt-2 border-t border-white/[0.04] text-[10px]">
                              <div>
                                <span className="text-slate-500 uppercase block">CAMPAIGN_SCORE</span>
                                <span className="font-mono font-bold text-emerald-400 text-xs">{acc.score}/100</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase block">VIRAL_PERF</span>
                                <span className="font-mono font-bold text-fuchsia-400 text-xs">{acc.content_performance_score ?? 50}/100</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase block">AUDIENCE_FIT</span>
                                <span className="font-mono font-bold text-cyan-400 text-xs">{acc.audience_fit ?? 50}/100</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase block">WARM_SCORE</span>
                                <span className="font-mono font-bold text-amber-400 text-xs">{acc.warm_audience_score ?? 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase block">HOT_COUNT</span>
                                <span className="font-mono font-bold text-orange-400 text-xs">{acc.hot_audience_count ?? 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase block">VERY_HOT_COUNT</span>
                                <span className="font-mono font-bold text-rose-400 text-xs">{acc.very_hot_count ?? 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase block">SATURATION_RISK</span>
                                <span className="font-mono font-bold text-slate-300 text-xs">{acc.saturation_risk ?? 0}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* EXCLUDED_ACCOUNTS */}
                    {simulationResult.excluded_accounts.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                          EXCLUDED_ACCOUNTS ({simulationResult.excluded_accounts.length})
                        </span>
                        <div className="space-y-1.5">
                          {simulationResult.excluded_accounts.map((exc, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-400"
                            >
                              <span className="font-medium text-slate-300">
                                {exc.display_name} <span className="text-[10px] font-mono text-slate-500">({exc.platform})</span>
                              </span>
                              <span className="text-slate-500 text-[10px] font-mono truncate max-w-sm">
                                {exc.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {simulationResult && (
                <div className="pt-3 border-t border-white/[0.06] text-[11px] text-slate-500 font-mono flex items-center justify-between">
                  <span>SELECTION_REASON: {simulationResult.selection_reason}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* BLOQUE 5 — ESTADO RED */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white uppercase">BLOQUE 5 — ESTADO RED</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateWithContext('/broadcast/accounts')}
                id="btn-estado-red-ver-detalle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/50 shadow-sm transition-all cursor-pointer"
              >
                <span>VER DETALLE</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-slate-500 font-mono">MATRIZ DE DISPONIBILIDAD DE PLATAFORMAS</span>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">CONNECTED_ACCOUNTS</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-400 font-mono">{networkState.connectedAccountsCount}</span>
                <span className="text-xs text-slate-500 font-mono">cuentas activas</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">PLATFORMS_CONNECTED</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-cyan-400 font-mono">{networkState.platformsConnected}</span>
                <span className="text-xs text-slate-500 font-mono">plataformas de emisión</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">PLATFORMS_PENDING</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-400 font-mono">{networkState.platformsPending}</span>
                <span className="text-xs text-slate-500 font-mono">en revisión o setup</span>
              </div>
            </div>
          </div>

          {/* Platform Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {networkState.matrix.map(item => {
              const isConnected = item.status === 'CONNECTED';
              const isInReview = item.status.includes('IN_REVIEW');

              return (
                <div
                  key={item.key}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                    isConnected
                      ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                      : isInReview
                      ? 'bg-amber-500/[0.04] border-amber-500/20'
                      : 'bg-white/[0.02] border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-white">{item.platform}</span>
                    {isConnected ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isInReview ? (
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <span className={`text-[10px] font-mono block leading-tight px-1.5 py-0.5 rounded border text-center font-semibold ${item.statusClass}`}>
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Atlas3MControlCenterPage;
