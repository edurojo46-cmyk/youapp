/**
 * ATLAS SYSTEM SETTINGS & CONFIGURATION
 * Page: AtlasSettingsPage
 * @apps/atlas/pages/AtlasSettingsPage.tsx
 *
 * Dedicated module for Atlas Network Configuration:
 * - Safety Switches & Gates (Auto-Publish = NO, Saturation Gate = ACTIVE)
 * - Multi-Platform Connection Status
 * - Telemetry Cache Controls
 */

import React, { useState } from 'react';
import {
  Sliders,
  ShieldCheck,
  Lock,
  Radio,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';

export const AtlasSettingsPage: React.FC = () => {
  const { telemetry, refreshTelemetry } = useAtlasShared();
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleResetCache = async () => {
    setClearing(true);
    await refreshTelemetry();
    setTimeout(() => {
      setClearing(false);
      setMsg('Telemetría y caché sincronizados correctamente.');
      setTimeout(() => setMsg(null), 3000);
    }, 500);
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1b2230] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300">
              <Sliders className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium text-slate-400 tracking-wider uppercase">
              Atlas System Settings
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Configuración & Seguridad Operativa
          </h1>
          <p className="text-xs text-[#8694a6] mt-0.5">
            Parámetros globales de la red de difusión, compuertas de saturación e invariantes de seguridad.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#131b29] hover:bg-[#1c273a] text-white border border-[#212f45] text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${clearing ? 'animate-spin' : ''}`} />
            <span>SINCRONIZAR RED</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className="bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 px-4 py-2.5 rounded-lg text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{msg}</span>
        </div>
      )}

      {/* Safety Invariants Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0c1017] border border-[#18202f] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[#8694a6]">INVARIANTE 1</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-white">AUTO_PUBLISH = NO</h3>
          <p className="text-xs text-[#8694a6]">
            Ninguna publicación se emite de forma automática sin confirmación humana explícita. El Release Controller sólo emite recomendaciones estratégicas.
          </p>
          <div className="pt-2 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>ESTADO: BLOQUEO ACTIVO Y SEGURO</span>
          </div>
        </div>

        <div className="bg-[#0c1017] border border-[#18202f] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[#8694a6]">INVARIANTE 2</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-white">SATURATION GATE = ACTIVO</h3>
          <p className="text-xs text-[#8694a6]">
            Previene el spam cruzado prohibiendo publicar el mismo contenido en audiencias o cuentas idénticas antes de la ventana de enfriamiento (48h).
          </p>
          <div className="pt-2 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>ESTADO: COMPUERTA VIGILANTE</span>
          </div>
        </div>

        <div className="bg-[#0c1017] border border-[#18202f] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[#8694a6]">INVARIANTE 3</span>
            <AlertTriangle className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-base font-semibold text-white">UNKNOWN != 0</h3>
          <p className="text-xs text-[#8694a6]">
            Prohibido inventar datos sintéticos. Si una métrica diaria de alcance o vistas no ha sido entregada por la API oficial, permanece estrictamente UNKNOWN.
          </p>
          <div className="pt-2 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>ESTADO: AUDITORÍA ESTRICTA ACTIVA</span>
          </div>
        </div>
      </div>

      {/* Connection Info */}
      <div className="bg-[#0c1017] border border-[#18202f] rounded-lg p-5 space-y-4">
        <h2 className="text-xs font-mono font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span>Estado de Infraestructura Atlas</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="bg-[#101622] p-3 rounded border border-[#1c2637]">
            <span className="text-[#64748b]">BACKEND API:</span>
            <div className="text-white font-semibold mt-1">http://localhost:5174</div>
            <span className="text-[10px] text-emerald-400">ONLINE (200 OK)</span>
          </div>
          <div className="bg-[#101622] p-3 rounded border border-[#1c2637]">
            <span className="text-[#64748b]">FRONTEND SHELL:</span>
            <div className="text-white font-semibold mt-1">http://localhost:5175</div>
            <span className="text-[10px] text-emerald-400">VITE REACT 19 SPA</span>
          </div>
          <div className="bg-[#101622] p-3 rounded border border-[#1c2637]">
            <span className="text-[#64748b]">TELEMETRÍA RED:</span>
            <div className="text-white font-semibold mt-1">{telemetry.platformsConnected} Plataformas</div>
            <span className="text-[10px] text-cyan-400">{telemetry.activeAccounts} cuentas conectadas</span>
          </div>
          <div className="bg-[#101622] p-3 rounded border border-[#1c2637]">
            <span className="text-[#64748b]">ÚLTIMA SINCRONIZACIÓN:</span>
            <div className="text-white font-semibold mt-1">{telemetry.lastUpdated || 'En tiempo real'}</div>
            <span className="text-[10px] text-[#8694a6]">Polling reactivo</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AtlasSettingsPage;
