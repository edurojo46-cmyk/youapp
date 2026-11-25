/**
 * ATLAS CAMPAIGNS & CAMPAIGN ROUTER
 * Page: AtlasCampaignsPage
 * @apps/atlas/pages/AtlasCampaignsPage.tsx
 *
 * Dedicated module for Atlas Campaigns & Campaign Router:
 * - Algorithmic routing matrix based on Warm Audience, Saturation Risk & Account Health
 * - Inputs pre-filled from Shared Context:
 *   selectedAudience, selectedPlatform, selectedGeography, selectedCampaign, selectedContent
 * - Cross-module click-throughs:
 *   - click cuenta -> CUENTAS (/broadcast/accounts)
 *   - click audiencia -> WARM AUDIENCE (/broadcast/warm-audience)
 *   - click contenido -> VIRALIDAD (/broadcast/virality)
 *   - click decisión -> RELEASE (/broadcast/release)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Radio,
  Flame,
  Globe,
  Award,
  Sparkles,
  Layers,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  BarChart3,
  Sliders,
  Send,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

export const AtlasCampaignsPage: React.FC = () => {
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

  // Campaign Form State
  const [topic, setTopic] = useState(selectedAudience || 'Justicia Social y Empleo');
  const [audience, setAudience] = useState(selectedAudience || 'Emprendedores y Profesionales');
  const [geography, setGeography] = useState(selectedGeography || 'Argentina / AMBA');
  const [platform, setPlatform] = useState(selectedPlatform || 'YOUTUBE');
  const [routingSimulated, setRoutingSimulated] = useState(true);

  // Sync state if context changes externally
  useEffect(() => {
    if (selectedAudience) setAudience(selectedAudience);
    if (selectedGeography) setGeography(selectedGeography);
    if (selectedPlatform) setPlatform(selectedPlatform);
  }, [selectedAudience, selectedGeography, selectedPlatform]);

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1b2230] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-blue-950/60 border border-blue-800/50 flex items-center justify-center text-blue-400">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium text-blue-400 tracking-wider uppercase">
              Atlas Campaign Router & Orquestación
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Campañas de Difusión & Enrutamiento
          </h1>
          <p className="text-xs text-[#8694a6] mt-0.5">
            Optimización multi-cuenta enrutando cada mensaje hacia la cuenta y plataforma con mayor afinidad de audiencia.
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
            onClick={() => navigateWithContext('/broadcast/warm-audience')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-amber-400 hover:text-amber-300 border border-amber-800/40 text-xs font-medium transition-colors"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>VER WARM AUDIENCE</span>
          </button>
        </div>
      </div>

      {/* Campaign Router Interactive Form & Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Inputs */}
        <div className="bg-[#0c1017] border border-[#18202f] rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-mono font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Configuración de Campaña</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-[11px] font-mono text-[#8694a6] block mb-1">TEMA / TOPIC</label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#121824] border border-[#212d40] rounded text-white focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-[#8694a6] block mb-1">AUDIENCIA OBJETIVO</label>
              <input
                type="text"
                value={audience}
                onChange={e => {
                  setAudience(e.target.value);
                  setSelectedAudience(e.target.value);
                }}
                className="w-full px-3 py-1.5 bg-[#121824] border border-[#212d40] rounded text-white focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-[#8694a6] block mb-1">GEOGRAFÍA</label>
              <input
                type="text"
                value={geography}
                onChange={e => {
                  setGeography(e.target.value);
                  setSelectedGeography(e.target.value);
                }}
                className="w-full px-3 py-1.5 bg-[#121824] border border-[#212d40] rounded text-white focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-[#8694a6] block mb-1">PLATAFORMA PREFERIDA</label>
              <select
                value={platform}
                onChange={e => {
                  setPlatform(e.target.value);
                  setSelectedPlatform(e.target.value);
                }}
                className="w-full px-3 py-1.5 bg-[#121824] border border-[#212d40] rounded text-white focus:outline-none focus:border-blue-500 font-mono text-xs"
              >
                <option value="YOUTUBE">YOUTUBE</option>
                <option value="FACEBOOK">FACEBOOK</option>
                <option value="INSTAGRAM">INSTAGRAM</option>
                <option value="TELEGRAM">TELEGRAM</option>
                <option value="NOSTR">NOSTR</option>
                <option value="TIKTOK">TIKTOK</option>
              </select>
            </div>

            <button
              onClick={() => setRoutingSimulated(true)}
              className="w-full mt-2 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono font-medium text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>SIMULAR ENRUTAMIENTO</span>
            </button>
          </div>
        </div>

        {/* Cross-Link Routing Output (Campaign Router Click-throughs) */}
        <div className="lg:col-span-2 bg-[#0c1017] border border-[#18202f] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Resultado de Enrutamiento Inteligente</span>
            </h2>
            <span className="text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded">
              ROUTING_CHANGED_BY_WARM_SIGNAL: SÍ
            </span>
          </div>

          <p className="text-xs text-[#8694a6]">
            Haz clic directamente en cualquier elemento del enrutamiento para navegar al módulo correspondiente conservando el contexto:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Click Cuenta -> CUENTAS */}
            <div
              onClick={() => {
                navigateWithContext('/broadcast/accounts', { account: 'YOUTUBE_01' });
              }}
              id="campaign-route-click-account"
              className="group cursor-pointer bg-[#101622] hover:bg-[#151e2e] border border-[#1e2a3c] hover:border-cyan-500/50 rounded-lg p-4 transition-all"
            >
              <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
                <span className="font-mono uppercase">1. CUENTA RECOMENDADA</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#64748b] group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-base font-semibold text-white font-sans">justicia social</div>
              <div className="text-xs font-mono text-cyan-400 mt-0.5">YOUTUBE_01 (YOUTUBE)</div>
              <div className="text-[11px] text-[#8694a6] mt-2">
                Score: 92/100 • Health: OK • Saturation: 12%
              </div>
              <span className="inline-block mt-2 text-[10px] font-mono text-cyan-400 group-hover:underline">
                → Clic para ver en CUENTAS
              </span>
            </div>

            {/* Click Audiencia -> WARM AUDIENCE */}
            <div
              onClick={() => {
                navigateWithContext('/broadcast/warm-audience', { audience });
              }}
              id="campaign-route-click-audience"
              className="group cursor-pointer bg-[#101622] hover:bg-[#151e2e] border border-[#1e2a3c] hover:border-amber-500/50 rounded-lg p-4 transition-all"
            >
              <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
                <span className="font-mono uppercase">2. AUDIENCIA VINCULADA</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#64748b] group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-base font-semibold text-white font-sans">{audience}</div>
              <div className="text-xs font-mono text-amber-400 mt-0.5">HOT: 35 • VERY_HOT: 8</div>
              <div className="text-[11px] text-[#8694a6] mt-2">
                Afinidad comprobada con tópicos sociales e industriales
              </div>
              <span className="inline-block mt-2 text-[10px] font-mono text-amber-400 group-hover:underline">
                → Clic para ver en WARM AUDIENCE
              </span>
            </div>

            {/* Click Contenido -> VIRALIDAD */}
            <div
              onClick={() => {
                navigateWithContext('/broadcast/virality', { content: 'yt_post_001' });
              }}
              id="campaign-route-click-content"
              className="group cursor-pointer bg-[#101622] hover:bg-[#151e2e] border border-[#1e2a3c] hover:border-purple-500/50 rounded-lg p-4 transition-all"
            >
              <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
                <span className="font-mono uppercase">3. CONTENIDO ASIGNADO</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#64748b] group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-base font-semibold text-white font-sans">Justicia Social y Economía</div>
              <div className="text-xs font-mono text-purple-400 mt-0.5">yt_post_001 (BREAKOUT)</div>
              <div className="text-[11px] text-[#8694a6] mt-2">
                Virality Score: 95/100 • Trend: ACCELERATING
              </div>
              <span className="inline-block mt-2 text-[10px] font-mono text-purple-400 group-hover:underline">
                → Clic para ver en VIRALIDAD
              </span>
            </div>

            {/* Click Decisión -> RELEASE */}
            <div
              onClick={() => {
                navigateWithContext('/broadcast/release', { content: 'yt_post_001' });
              }}
              id="campaign-route-click-decision"
              className="group cursor-pointer bg-[#101622] hover:bg-[#151e2e] border border-[#1e2a3c] hover:border-emerald-500/50 rounded-lg p-4 transition-all"
            >
              <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
                <span className="font-mono uppercase">4. DECISIÓN DE RELEASE</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#64748b] group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-base font-semibold text-white font-sans">EXPAND / SCALE READY</div>
              <div className="text-xs font-mono text-emerald-400 mt-0.5">ESTADO: SCALE</div>
              <div className="text-[11px] text-[#8694a6] mt-2">
                Saturation Gate: APROBADO • Auto-publish: NO
              </div>
              <span className="inline-block mt-2 text-[10px] font-mono text-emerald-400 group-hover:underline">
                → Clic para ver en RELEASE CONTROLLER
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AtlasCampaignsPage;
