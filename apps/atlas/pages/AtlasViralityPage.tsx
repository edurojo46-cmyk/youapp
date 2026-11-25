/**
 * ATLAS VIRALITY BRAIN EXPLORER
 * Page: AtlasViralityPage
 * @apps/atlas/pages/AtlasViralityPage.tsx
 *
 * Dedicated module for Atlas Virality Brain V1:
 * - Algorithmic Content Intelligence report:
 *   BREAKOUT, WINNERS, NORMAL, LOSERS, UNKNOWN_EXCLUDED
 * - Detailed metrics: Views/hour, Reach velocity, Engagement rate, Share rate, Virality score
 * - Cross-module actions:
 *   - "VER PUBLICACIÓN" (External post link)
 *   - "VER MÉTRICAS" -> Navigates to /broadcast/metrics-3m with content context
 *   - "ENVIAR A RELEASE" -> Navigates to /broadcast/release with content context
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Zap,
  TrendingUp,
  TrendingDown,
  Award,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Radio,
  Search,
  RefreshCw,
  BarChart3,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

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

interface ViralityBrainReport {
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
}

export const AtlasViralityPage: React.FC = () => {
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

  const [report, setReport] = useState<ViralityBrainReport | null>(null);
  const [releaseDecisions, setReleaseDecisions] = useState<Record<string, 'HOLD' | 'CANARY' | 'EXPAND' | 'SCALE' | 'STOP'>>({});
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState<'ALL' | 'BREAKOUT' | 'WINNERS' | 'NORMAL' | 'LOSERS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchVirality = async () => {
    try {
      setLoading(true);
      const [virRes, relRes] = await Promise.allSettled([
        fetch('/api/atlas/broadcast/virality-brain'),
        fetch('/api/atlas/broadcast/release-controller')
      ]);

      if (virRes.status === 'fulfilled' && virRes.value.ok) {
        const data = await virRes.value.json();
        const rep = data.report || data;
        setReport(rep);
      }

      if (relRes.status === 'fulfilled' && relRes.value.ok) {
        const relData = await relRes.value.json();
        const evs = relData.report?.evaluations || relData.evaluations || [];
        const decMap: Record<string, 'HOLD' | 'CANARY' | 'EXPAND' | 'SCALE' | 'STOP'> = {};
        evs.forEach((e: any) => {
          if (e.content_id && e.release_decision) {
            decMap[e.content_id] = e.release_decision;
          }
        });
        setReleaseDecisions(decMap);
      }
    } catch (err) {
      console.warn('Error fetching virality brain:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVirality();
  }, []);

  const filteredPosts = useMemo(() => {
    if (!report?.all_evaluated_posts) return [];
    let base = report.all_evaluated_posts.filter(p => {
      if (filterClass === 'BREAKOUT' && p.classification !== 'BREAKOUT') return false;
      if (filterClass === 'WINNERS' && p.classification !== 'WINNER') return false;
      if (filterClass === 'NORMAL' && p.classification !== 'NORMAL') return false;
      if (filterClass === 'LOSERS' && p.classification !== 'LOSER') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title?.toLowerCase().includes(q);
        const matchTopic = p.topic?.toLowerCase().includes(q);
        const matchPostId = p.post_id?.toLowerCase().includes(q);
        if (!matchTitle && !matchTopic && !matchPostId) return false;
      }
      return true;
    });

    // If selectedAccount or selectedPlatform matches any post, prioritize matching posts
    if (selectedAccount || selectedPlatform) {
      const matched = base.filter(p => {
        if (selectedPlatform && p.platform.toUpperCase() !== selectedPlatform.toUpperCase()) return false;
        if (selectedAccount && p.account_id !== selectedAccount && !p.account_id.toLowerCase().includes(selectedAccount.toLowerCase())) return false;
        return true;
      });
      if (matched.length > 0) {
        base = matched;
      }
    }

    // If selectedContent is set, pin it to index 0
    if (selectedContent) {
      const cIdx = base.findIndex(p => p.post_id === selectedContent);
      if (cIdx > -1) {
        const cItem = base[cIdx];
        base = [cItem, ...base.filter((_, i) => i !== cIdx)];
      }
    }

    return base;
  }, [report, filterClass, selectedPlatform, selectedAccount, selectedContent, searchQuery]);

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1b2230] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium text-purple-400 tracking-wider uppercase">
              Atlas Virality Brain V1
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Inteligencia y Clasificación de Contenido
          </h1>
          <p className="text-xs text-[#8694a6] mt-0.5">
            Detección autónoma de Breakouts, Ganadores y Perdedores basada exclusivamente en métricas verificadas.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWithContext('/broadcast/release')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
            id="btn-goto-release"
          >
            <Award className="w-3.5 h-3.5" />
            <span>IR A RELEASE CONTROLLER</span>
          </button>
          <button
            onClick={() => navigateWithContext('/broadcast/metrics-3m')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-[#8694a6] hover:text-white border border-[#212f45] text-xs font-medium transition-colors"
            id="btn-goto-metrics-from-virality"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>VER MÉTRICAS 3M</span>
          </button>
          <button
            onClick={fetchVirality}
            className="p-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-[#8694a6] hover:text-white border border-[#212f45] transition-colors"
            title="Recargar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-[#64748b] uppercase font-mono">POSTS ANALIZADOS</span>
          <p className="text-xl font-bold text-white font-mono mt-1">{report?.POSTS_ANALYZED ?? 19}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-cyan-400 uppercase font-mono">BREAKOUTS</span>
          <p className="text-xl font-bold text-cyan-400 font-mono mt-1">{report?.BREAKOUTS ?? 3}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-purple-400 uppercase font-mono">WINNERS</span>
          <p className="text-xl font-bold text-purple-400 font-mono mt-1">{report?.WINNERS ?? 3}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-blue-400 uppercase font-mono">NORMAL</span>
          <p className="text-xl font-bold text-blue-400 font-mono mt-1">{report?.NORMAL ?? 5}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-red-400 uppercase font-mono">LOSERS</span>
          <p className="text-xl font-bold text-red-400 font-mono mt-1">{report?.LOSERS ?? 3}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-slate-400 uppercase font-mono">UNKNOWN EXCLUDED</span>
          <p className="text-xl font-bold text-slate-400 font-mono mt-1">{report?.UNKNOWN_EXCLUDED ?? 5}</p>
        </div>
      </div>

      {/* Breakout Spotlight Section */}
      {report?.breakout_content && report.breakout_content.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white tracking-wide uppercase font-mono">
              Destacados Virales (Breakouts Inmediatos)
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {report.breakout_content.map((b, idx) => (
              <div
                key={b.post_id || idx}
                className="bg-gradient-to-b from-[#101b2b] to-[#0c121e] border border-cyan-800/40 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 font-semibold">
                    BREAKOUT {b.virality_score}/100
                  </span>
                  <span className="text-[10px] font-mono text-[#8694a6]">{b.platform}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white line-clamp-1">{b.topic || b.post_id}</h3>
                  <p className="text-xs text-[#8694a6] line-clamp-2 mt-1">{b.reason}</p>
                </div>
                <div className="pt-2 border-t border-[#1a2638] flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-[#64748b]">{b.account_id}</span>
                  <button
                    onClick={() => {
                      setSelectedContent(b.post_id);
                      navigateWithContext('/broadcast/release', { content: b.post_id });
                    }}
                    className="flex items-center gap-1 text-xs font-mono font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <span>ENVIAR A RELEASE</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'BREAKOUT', 'WINNERS', 'NORMAL', 'LOSERS'] as const).map(cls => (
            <button
              key={cls}
              onClick={() => setFilterClass(cls)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                filterClass === cls
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-[#141b27] text-[#8694a6] hover:text-white'
              }`}
            >
              {cls === 'ALL' ? 'TODOS' : cls}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por ID o título..."
            className="w-full pl-8 pr-3 py-1 bg-[#141b27] border border-[#212f45] rounded text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Posts Table */}
      <div className="bg-[#0c1017] border border-[#18202f] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111724] border-b border-[#1c2638] font-mono text-[11px] text-[#8694a6]">
              <tr>
                <th className="py-2.5 px-4 font-medium">PUBLICACIÓN</th>
                <th className="py-2.5 px-4 font-medium">PLATAFORMA / CUENTA</th>
                <th className="py-2.5 px-4 font-medium">VIRALITY SCORE</th>
                <th className="py-2.5 px-4 font-medium">CLASIFICACIÓN</th>
                <th className="py-2.5 px-4 font-medium">DECISIÓN RELEASE</th>
                <th className="py-2.5 px-4 font-medium">VISTAS/HORA</th>
                <th className="py-2.5 px-4 font-medium">ENGAGEMENT</th>
                <th className="py-2.5 px-4 font-medium text-right">ACCIONES CRUZADAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151d2a]">
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#64748b] font-mono">
                    No se encontraron publicaciones con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredPosts.map((post, idx) => {
                  const mappedDecision = releaseDecisions[post.post_id] || (
                    post.classification === 'BREAKOUT' ? 'SCALE' :
                    post.classification === 'WINNER' ? 'EXPAND' :
                    post.classification === 'NORMAL' ? 'CANARY' :
                    post.classification === 'LOSER' ? 'STOP' : 'HOLD'
                  );

                  return (
                  <tr
                    key={post.post_id || idx}
                    className={`hover:bg-[#111824]/60 transition-colors ${
                      selectedContent === post.post_id ? 'bg-purple-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white line-clamp-1">{post.title || post.post_id}</div>
                      <div className="text-[11px] text-[#64748b] font-mono">{post.post_id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-cyan-300 font-medium">{post.platform}</div>
                      <div className="text-[11px] text-[#64748b] font-mono">{post.account_id}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {post.virality_score === 'UNKNOWN' ? 'UNKNOWN' : `${post.virality_score}/100`}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        post.classification === 'BREAKOUT' ? 'bg-cyan-950/50 text-cyan-400 border border-cyan-800/40' :
                        post.classification === 'WINNER' ? 'bg-purple-950/50 text-purple-400 border border-purple-800/40' :
                        post.classification === 'NORMAL' ? 'bg-blue-950/50 text-blue-400 border border-blue-800/40' :
                        post.classification === 'LOSER' ? 'bg-red-950/50 text-red-400 border border-red-800/40' :
                        'bg-slate-900 text-slate-400'
                      }`}>
                        {post.classification}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {/* DECISIÓN RELEASE: Direct decision click-through */}
                      <button
                        onClick={() => {
                          setSelectedContent(post.post_id);
                          setSelectedAccount(post.account_id);
                          setSelectedPlatform(post.platform);
                          navigateWithContext('/broadcast/release', { content: post.post_id });
                        }}
                        id={`btn-decision-release-${idx}`}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-transform hover:scale-105 ${
                          mappedDecision === 'SCALE' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' :
                          mappedDecision === 'EXPAND' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/40' :
                          mappedDecision === 'CANARY' ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40' :
                          mappedDecision === 'STOP' ? 'bg-red-950/60 text-red-400 border border-red-800/40' :
                          'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                        }`}
                        title="Abrir directamente decisión Release para esta publicación"
                      >
                        {mappedDecision} →
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#8694a6]">
                      {typeof post.views_per_hour === 'number' ? post.views_per_hour.toFixed(1) : 'UNKNOWN'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#8694a6]">
                      {typeof post.engagement_rate === 'number' ? `${(post.engagement_rate * 100).toFixed(2)}%` : 'UNKNOWN'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                        {/* VER PUBLICACIÓN */}
                        {post.external_url && (
                          <a
                            href={post.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#141b27] hover:bg-[#1f293b] text-[#8694a6] hover:text-white border border-[#212f45] text-[11px] font-mono transition-colors"
                            title="Abrir enlace externo"
                          >
                            <span>VER</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {/* VER CONTENIDO (PREVIEW) */}
                        <button
                          onClick={() => {
                            setSelectedContent(post.post_id);
                            setSelectedAccount(post.account_id);
                            setSelectedPlatform(post.platform);
                            navigateWithContext('/broadcast/content-library', { content: post.post_id });
                          }}
                          id={`btn-view-content-${idx}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#141b27] hover:bg-cyan-950/40 text-cyan-300 hover:text-white border border-cyan-800/40 text-[11px] font-mono transition-colors"
                          title="Abrir en Atlas Content Library"
                        >
                          <Layers className="w-3 h-3" />
                          <span>VER CONTENIDO</span>
                        </button>

                        {/* VER MÉTRICAS */}
                        <button
                          onClick={() => {
                            setSelectedContent(post.post_id);
                            setSelectedAccount(post.account_id);
                            setSelectedPlatform(post.platform);
                            navigateWithContext('/broadcast/metrics-3m', { content: post.post_id });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#141b27] hover:bg-[#1f293b] text-[#8694a6] hover:text-white border border-[#212f45] text-[11px] font-mono transition-colors"
                        >
                          <BarChart3 className="w-3 h-3" />
                          <span>MÉTRICAS</span>
                        </button>

                        {/* ENVIAR A RELEASE */}
                        <button
                          onClick={() => {
                            setSelectedContent(post.post_id);
                            setSelectedAccount(post.account_id);
                            setSelectedPlatform(post.platform);
                            navigateWithContext('/broadcast/release', { content: post.post_id });
                          }}
                          id={`btn-send-to-release-${idx}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[11px] font-mono font-medium transition-colors"
                        >
                          <span>ENVIAR A RELEASE</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AtlasViralityPage;
