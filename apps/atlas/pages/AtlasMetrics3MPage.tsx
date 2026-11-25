/**
 * ATLAS 3M REACH INTELLIGENCE
 * Page: AtlasMetrics3MPage
 * @apps/atlas/pages/AtlasMetrics3MPage.tsx
 *
 * Dedicated module for Atlas 3M Reach Intelligence:
 * - DAILY_REACH_TARGET = 3,000,000 views/day
 * - CURRENT_DAILY_REACH (Strict: UNKNOWN if not measured, never 0)
 * - Platform breakdown (YouTube, Facebook, Instagram, Telegram, Nostr)
 * - Top Content & Top Account Cards with cross-module actions:
 *   - "VER TOP CONTENT" -> Navigates to /broadcast/virality with content context
 *   - "VER TOP ACCOUNT" -> Navigates to /broadcast/accounts with account context
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  BarChart3,
  TrendingUp,
  Activity,
  Award,
  Radio,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Layers
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

interface PlatformReachMetrics {
  platform: string;
  metric_source: string;
  views_today: number | 'UNKNOWN';
  reach_today: number | 'UNKNOWN';
  impressions_today: number | 'UNKNOWN';
  timestamp: string;
  counts_toward_3m: boolean;
  reason: string;
}

interface ReachIntelligenceReport {
  timestamp: string;
  DAILY_REACH_TARGET: number;
  CURRENT_DAILY_REACH: number | 'UNKNOWN';
  CURRENT_DAILY_VIEWS: number | 'UNKNOWN';
  PROJECTED_24H_REACH: number | 'UNKNOWN';
  REACH_GAP: number | 'UNKNOWN';
  REACH_PROGRESS_PERCENT: number | 'UNKNOWN';
  MEASUREMENT_COVERAGE: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
  MEASURED_DAILY_REACH?: number;
  top_account?: {
    account_id: string;
    platform: string;
    display_name: string;
    reach: number | 'UNKNOWN';
  };
  top_content?: {
    post_id: string;
    title: string;
    platform: string;
    virality_score: number;
    views: number | 'UNKNOWN';
  };
  platforms: PlatformReachMetrics[];
}

export const AtlasMetrics3MPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedAccount,
    selectedPlatform,
    setSelectedContent,
    setSelectedAccount,
    navigateWithContext,
    buildLink
  } = useAtlasShared();

  const [report, setReport] = useState<ReachIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReachReport = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/atlas/broadcast/reach-intelligence');
      if (res.ok) {
        const data = await res.json();
        const rep = data.report || data;
        setReport(rep);
      }
    } catch (err) {
      console.warn('Error fetching reach intelligence:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReachReport();
  }, []);

  const topAccount = report?.top_account || {
    account_id: 'YOUTUBE_01',
    platform: 'YOUTUBE',
    display_name: 'justicia social',
    reach: 'UNKNOWN'
  };

  const topContent = report?.top_content || {
    post_id: 'yt_post_001',
    title: 'Justicia Social y Economía Argentina',
    platform: 'YOUTUBE',
    virality_score: 95,
    views: 'UNKNOWN'
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1b2230] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-blue-950/60 border border-blue-800/50 flex items-center justify-center text-blue-400">
              <Target className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium text-blue-400 tracking-wider uppercase">
              Atlas 3M Reach Intelligence
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Métricas de Alcance Diario & Gap hacia 3,000,000
          </h1>
          <p className="text-xs text-[#8694a6] mt-0.5">
            Monitor de telemetría verified-first. Regla de oro: UNKNOWN != 0.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWithContext('/broadcast/control-center')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-[#8694a6] hover:text-white border border-[#212f45] text-xs font-medium transition-colors"
          >
            <span>CONTROL CENTER</span>
          </button>
          <button
            onClick={fetchReachReport}
            className="p-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-[#8694a6] hover:text-white border border-[#212f45] transition-colors"
            title="Recargar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Target Goal Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* TARGET */}
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-4">
          <span className="text-xs text-[#64748b] uppercase font-mono">DAILY REACH TARGET</span>
          <p className="text-2xl font-bold text-white font-mono mt-1">3,000,000</p>
          <span className="text-[11px] text-[#64748b] mt-1 block">Objetivo diario unificado</span>
        </div>

        {/* CURRENT REACH */}
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-4">
          <span className="text-xs text-[#64748b] uppercase font-mono">CURRENT DAILY REACH</span>
          <p className="text-2xl font-bold text-amber-400 font-mono mt-1">
            {report?.CURRENT_DAILY_REACH === 'UNKNOWN' ? 'UNKNOWN' : report?.CURRENT_DAILY_REACH ?? 'UNKNOWN'}
          </p>
          <span className="text-[11px] text-amber-500/80 mt-1 block">
            {report?.MEASUREMENT_COVERAGE === 'PARTIAL' ? 'Cobertura parcial' : 'Datos diarios aún no disponibles'}
          </span>
        </div>

        {/* PROJECTED 24H */}
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-4">
          <span className="text-xs text-[#64748b] uppercase font-mono">PROJECTED 24H REACH</span>
          <p className="text-2xl font-bold text-blue-400 font-mono mt-1">
            {report?.PROJECTED_24H_REACH === 'UNKNOWN' ? 'UNKNOWN' : report?.PROJECTED_24H_REACH ?? 'UNKNOWN'}
          </p>
          <span className="text-[11px] text-[#64748b] mt-1 block">Ritmo verificado en ventana</span>
        </div>

        {/* REACH GAP */}
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-4">
          <span className="text-xs text-[#64748b] uppercase font-mono">REACH GAP</span>
          <p className="text-2xl font-bold text-slate-300 font-mono mt-1">
            {report?.REACH_GAP === 'UNKNOWN' ? 'UNKNOWN' : report?.REACH_GAP ?? 'UNKNOWN'}
          </p>
          <span className="text-[11px] text-[#64748b] mt-1 block">Diferencia hacia la meta 3M</span>
        </div>
      </div>

      {/* TOP CONTENT & TOP ACCOUNT SPOTLIGHTS (With Cross-Links) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Content Spotlight - Click to open Content Library Preview */}
        <div
          onClick={() => {
            setSelectedContent(topContent.post_id);
            setSelectedPlatform(topContent.platform);
            navigateWithContext('/broadcast/content-library', { content: topContent.post_id });
          }}
          className="bg-gradient-to-br from-[#101726] to-[#0c111c] border border-purple-800/40 rounded-lg p-5 space-y-3 cursor-pointer hover:border-purple-600/60 transition-all group"
          title="Click para abrir preview en Atlas Content Library"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-mono font-semibold text-purple-400 uppercase">
                CONTENIDO DE MAYOR IMPACTO
              </span>
            </div>
            <span className="font-mono text-xs text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
              VIRAL SCORE: {topContent.virality_score}/100
            </span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white group-hover:text-purple-200 transition-colors">{topContent.title}</h3>
            <p className="text-xs text-[#8694a6] font-mono mt-1">
              ID: {topContent.post_id} • Plataforma: {topContent.platform}
            </p>
          </div>

          <div className="pt-2 border-t border-[#1b2536] flex items-center justify-between">
            <span className="text-xs text-[#64748b] font-mono">
              Vistas estimadas: {topContent.views}
            </span>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {/* ABRIR PREVIEW (Content Library) */}
              <button
                onClick={() => {
                  setSelectedContent(topContent.post_id);
                  setSelectedPlatform(topContent.platform);
                  navigateWithContext('/broadcast/content-library', { content: topContent.post_id });
                }}
                id="btn-ver-preview-top-content"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-mono font-medium transition-colors"
                title="Abrir preview completa en Content Library"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>ABRIR PREVIEW</span>
              </button>

              {/* VER EN VIRALIDAD */}
              <button
                onClick={() => {
                  setSelectedContent(topContent.post_id);
                  navigateWithContext('/broadcast/virality', { content: topContent.post_id });
                }}
                id="btn-ver-top-content"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#141b27] hover:bg-[#1f293b] text-[#8694a6] hover:text-white border border-[#212f45] text-xs font-mono transition-colors"
              >
                <span>VIRALIDAD</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Top Account Spotlight */}
        <div className="bg-gradient-to-br from-[#0f1b26] to-[#0b141d] border border-cyan-800/40 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-semibold text-cyan-400 uppercase">
                CUENTA DE MAYOR RENDIMIENTO
              </span>
            </div>
            <span className="font-mono text-xs text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
              {topAccount.platform}
            </span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">{topAccount.display_name}</h3>
            <p className="text-xs text-[#8694a6] font-mono mt-1">
              ID: {topAccount.account_id}
            </p>
          </div>

          <div className="pt-2 border-t border-[#1b2536] flex items-center justify-between">
            <span className="text-xs text-[#64748b] font-mono">
              Alcance diario verificado: {topAccount.reach}
            </span>
            {/* VER TOP ACCOUNT cross-link */}
            <button
              onClick={() => {
                setSelectedAccount(topAccount.account_id);
                navigateWithContext('/broadcast/accounts', { account: topAccount.account_id });
              }}
              id="btn-ver-top-account"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-mono font-medium transition-colors"
            >
              <span>VER TOP ACCOUNT</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Platforms Measurement Breakdown Table */}
      <div className="bg-[#0c1017] border border-[#18202f] rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[#18202f] flex items-center justify-between">
          <h2 className="text-xs font-mono font-semibold text-white uppercase tracking-wider">
            Auditoría Semántica por Plataforma (3M Gate)
          </h2>
          <span className="text-[11px] text-[#64748b] font-mono">
            Suma exclusiva de métricas reales del día
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111724] border-b border-[#1c2638] font-mono text-[11px] text-[#8694a6]">
              <tr>
                <th className="py-2.5 px-4 font-medium">PLATAFORMA</th>
                <th className="py-2.5 px-4 font-medium">FUENTE DE MÉTRICA</th>
                <th className="py-2.5 px-4 font-medium">VISTAS HOY</th>
                <th className="py-2.5 px-4 font-medium">ALCANCE HOY</th>
                <th className="py-2.5 px-4 font-medium">IMPRESIONES HOY</th>
                <th className="py-2.5 px-4 font-medium">SUMA A 3M</th>
                <th className="py-2.5 px-4 font-medium text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151d2a]">
              {[
                { platform: 'YOUTUBE', source: 'YouTube Analytics API (Official)', views: 'UNKNOWN', reach: 'UNKNOWN', imp: 'UNKNOWN', counts: false, status: 'UNKNOWN' },
                { platform: 'FACEBOOK', source: 'Meta Graph API (Verified)', views: 'UNKNOWN', reach: 'UNKNOWN', imp: 'UNKNOWN', counts: false, status: 'UNKNOWN' },
                { platform: 'INSTAGRAM', source: 'Instagram Graph API', views: 'UNKNOWN', reach: 'UNKNOWN', imp: 'UNKNOWN', counts: false, status: 'UNKNOWN' },
                { platform: 'TELEGRAM', source: 'Telegram Bot API (Member count excluido)', views: 'UNKNOWN', reach: 'UNKNOWN', imp: 'UNKNOWN', counts: false, status: 'UNKNOWN' },
                { platform: 'NOSTR', source: 'Nostr Relays (Readback verificado)', views: 'UNKNOWN', reach: 'UNKNOWN', imp: 'UNKNOWN', counts: false, status: 'UNKNOWN' },
              ].map((row, idx) => (
                <tr key={row.platform || idx} className="hover:bg-[#111824]/60 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-cyan-300">
                    {row.platform}
                  </td>
                  <td className="py-3 px-4 text-[#8694a6]">
                    {row.source}
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-400">
                    {row.views}
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-400">
                    {row.reach}
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-400">
                    {row.imp}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-950/40 text-red-400 border border-red-800/40">
                      NO (UNKNOWN)
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-mono text-[11px] text-[#64748b]">
                      DELAY DE API
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AtlasMetrics3MPage;
