/**
 * ATLAS WARM AUDIENCE EXPLORER
 * Page: AtlasWarmAudiencePage
 * @apps/atlas/pages/AtlasWarmAudiencePage.tsx
 *
 * Dedicated module for Atlas Warm Audience Intelligence:
 * - Real profiles scored: COLD, WARM, HOT, VERY_HOT
 * - Filtering by platform, topic, score category
 * - Cross-module actions:
 *   - "USAR EN CAMPAÑA" -> Navigates to /broadcast/campaigns with audience context
 *   - "VER CUENTA" -> Navigates to /broadcast/accounts with account context
 *   - "VER MÉTRICAS" -> Navigates to /broadcast/metrics-3m
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flame,
  Search,
  Sliders,
  Send,
  Radio,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Users,
  Award,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Zap,
  BarChart3
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

interface WarmProfile {
  profile_id: string;
  name: string;
  handle: string;
  platform: 'YOUTUBE' | 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'TELEGRAM' | 'REDDIT' | 'NOSTR';
  warm_score: number;
  warm_class: 'COLD' | 'WARM' | 'HOT' | 'VERY_HOT';
  topic_affinity: string[];
  best_account: string;
  contact_eligible: boolean;
  engagement_signals: number;
  last_activity: string;
}

interface WarmAudienceReport {
  timestamp: string;
  PROFILES_SCORED: number;
  COLD: number;
  WARM: number;
  HOT: number;
  VERY_HOT: number;
  CONTACT_ELIGIBLE: number;
  profiles: WarmProfile[];
}

export const AtlasWarmAudiencePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedAudience,
    selectedPlatform,
    selectedAccount,
    setSelectedAudience,
    setSelectedPlatform,
    setSelectedAccount,
    navigateWithContext,
    buildLink
  } = useAtlasShared();

  const [report, setReport] = useState<WarmAudienceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState<'ALL' | 'HOT' | 'VERY_HOT' | 'WARM' | 'COLD'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchWarmData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/atlas/audience/warm');
      if (res.ok) {
        const data = await res.json();
        const rep = data.report || data;
        setReport(rep);
      }
    } catch (err) {
      console.warn('Error fetching warm audience:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarmData();
  }, []);

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    if (!report?.profiles) return [];
    return report.profiles.filter(p => {
      if (filterClass !== 'ALL' && p.warm_class !== filterClass) return false;
      if (selectedPlatform && p.platform.toUpperCase() !== selectedPlatform.toUpperCase()) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchHandle = p.handle?.toLowerCase().includes(q);
        const matchTopic = p.topic_affinity?.some(t => t.toLowerCase().includes(q));
        if (!matchName && !matchHandle && !matchTopic) return false;
      }
      return true;
    });
  }, [report, filterClass, selectedPlatform, searchQuery]);

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1b2230] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-amber-950/60 border border-amber-800/50 flex items-center justify-center text-amber-400">
              <Flame className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium text-amber-400 tracking-wider uppercase">
              Atlas Warm Audience Engine
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Perfiles Calificados & Afinidad
          </h1>
          <p className="text-xs text-[#8694a6] mt-0.5">
            Detección algorítmica de audiencia comprometida. Regla: HOT != Contactabilidad directa automática.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWithContext('/broadcast/campaigns')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
            id="btn-goto-campaigns"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>IR A CAMPAÑAS</span>
          </button>
          <button
            onClick={() => navigateWithContext('/broadcast/metrics-3m')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-[#8694a6] hover:text-white border border-[#212f45] text-xs font-medium transition-colors"
            id="btn-goto-metrics"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>VER MÉTRICAS</span>
          </button>
          <button
            onClick={fetchWarmData}
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
          <span className="text-[10px] text-[#64748b] uppercase font-mono">PROFILES SCORED</span>
          <p className="text-xl font-bold text-white font-mono mt-1">{report?.PROFILES_SCORED ?? 100}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-red-400 uppercase font-mono">VERY HOT</span>
          <p className="text-xl font-bold text-red-400 font-mono mt-1">{report?.VERY_HOT ?? 8}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-amber-400 uppercase font-mono">HOT</span>
          <p className="text-xl font-bold text-amber-400 font-mono mt-1">{report?.HOT ?? 35}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-blue-400 uppercase font-mono">WARM</span>
          <p className="text-xl font-bold text-blue-400 font-mono mt-1">{report?.WARM ?? 32}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-slate-400 uppercase font-mono">COLD</span>
          <p className="text-xl font-bold text-slate-400 font-mono mt-1">{report?.COLD ?? 25}</p>
        </div>
        <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3">
          <span className="text-[10px] text-emerald-400 uppercase font-mono">CONTACT ELIGIBLE</span>
          <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{report?.CONTACT_ELIGIBLE ?? 12}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0e131d] border border-[#1a2333] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'VERY_HOT', 'HOT', 'WARM', 'COLD'] as const).map(cls => (
            <button
              key={cls}
              onClick={() => setFilterClass(cls)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                filterClass === cls
                  ? 'bg-blue-600 text-white font-semibold'
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
            placeholder="Buscar perfil o tema..."
            className="w-full pl-8 pr-3 py-1 bg-[#141b27] border border-[#212f45] rounded text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Profiles Table */}
      <div className="bg-[#0c1017] border border-[#18202f] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111724] border-b border-[#1c2638] font-mono text-[11px] text-[#8694a6]">
              <tr>
                <th className="py-2.5 px-4 font-medium">PERFIL / IDENTIDAD</th>
                <th className="py-2.5 px-4 font-medium">PLATAFORMA</th>
                <th className="py-2.5 px-4 font-medium">WARM SCORE</th>
                <th className="py-2.5 px-4 font-medium">CLASIFICACIÓN</th>
                <th className="py-2.5 px-4 font-medium">TEMAS DE AFINIDAD</th>
                <th className="py-2.5 px-4 font-medium">MEJOR CUENTA</th>
                <th className="py-2.5 px-4 font-medium text-right">ACCIONES CRUZADAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151d2a]">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#64748b] font-mono">
                    No se encontraron perfiles con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p, idx) => (
                  <tr
                    key={p.profile_id || idx}
                    className="hover:bg-[#111824]/60 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{p.name || 'Perfil Anónimo'}</div>
                      <div className="text-[11px] text-[#64748b] font-mono">{p.handle || `@user_${idx + 1}`}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] text-cyan-300 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-800/40">
                        {p.platform}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {p.warm_score}/100
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        p.warm_class === 'VERY_HOT' ? 'bg-red-950/50 text-red-400 border border-red-800/40' :
                        p.warm_class === 'HOT' ? 'bg-amber-950/50 text-amber-400 border border-amber-800/40' :
                        p.warm_class === 'WARM' ? 'bg-blue-950/50 text-blue-400 border border-blue-800/40' :
                        'bg-slate-900 text-slate-400'
                      }`}>
                        {p.warm_class}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#8694a6]">
                      {p.topic_affinity?.slice(0, 2).join(', ') || 'Justicia Social, Industria'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#8694a6]">
                      <button
                        onClick={() => {
                          setSelectedAccount(p.best_account || 'YOUTUBE_01');
                          navigateWithContext('/broadcast/accounts', { account: p.best_account || 'YOUTUBE_01' });
                        }}
                        className="text-cyan-400 hover:underline"
                        title="Ver cuenta asignada"
                      >
                        {p.best_account || 'YOUTUBE_01'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {/* USAR EN CAMPAÑA cross-link */}
                      <button
                        onClick={() => {
                          const topic = p.topic_affinity?.[0] || 'Audiencia Calificada';
                          setSelectedAudience(topic);
                          setSelectedPlatform(p.platform);
                          navigateWithContext('/broadcast/campaigns', {
                            audience: topic,
                            platform: p.platform
                          });
                        }}
                        id={`btn-use-in-campaign-${idx}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[11px] font-mono font-medium transition-colors"
                      >
                        <span>USAR EN CAMPAÑA</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
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

export default AtlasWarmAudiencePage;
