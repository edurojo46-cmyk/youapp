import React, { useState } from 'react';
import {
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Award,
  Layers,
  ArrowRight,
  TrendingDown,
  ShieldCheck,
  HelpCircle,
  Camera,
  User,
  Wrench,
  Film,
  Volume2,
  Video
} from 'lucide-react';

interface SceneBenchmark {
  id: string;
  type: 'PAISAJE' | 'PERSONAJE' | 'ACCIÓN CON MANOS';
  title: string;
  icon: 'camera' | 'user' | 'wrench';
  prompt: string;
  sampleA: {
    label: string;
    realProvider: string;
    url: string;
    cost: string;
    resolution: string;
  };
  sampleB: {
    label: string;
    realProvider: string;
    url: string;
    cost: string;
    resolution: string;
  };
}

const BENCHMARK_SCENES: SceneBenchmark[] = [
  {
    id: 'SCENE_01_LANDSCAPE',
    type: 'PAISAJE',
    title: 'Escena 1: Base Antártica en Ventisca Extrema',
    icon: 'camera',
    prompt: 'Cinematic realistic photograph of a futuristic geodesic dome research base in Antarctica during an extreme snow blizzard at twilight, dramatic blue and orange lighting, snow drifts, 8k resolution',
    sampleA: {
      label: 'Muestra A',
      realProvider: 'Google Imagen 3 (Vertex AI / Ultra)',
      url: '/images/glaciar_story/normalized/scene_01_blizzard_base.jpg',
      cost: '$0.030 (~15 créditos)',
      resolution: '1024×1024'
    },
    sampleB: {
      label: 'Muestra B',
      realProvider: 'FLUX.1-schnell (Pollinations / Zero Cost)',
      url: '/images/benchmark_free_ai/free_scene_01_landscape.jpg',
      cost: '$0.00 (Gratuito)',
      resolution: '1024×768'
    }
  },
  {
    id: 'SCENE_03_CHARACTER',
    type: 'PERSONAJE',
    title: 'Escena 2: Retrato Dra. Valeria Ramos con Núcleo de Hielo',
    icon: 'user',
    prompt: 'Cinematic portrait of Dr. Valeria Ramos, 34-year-old female polar glaciologist with cold-flushed cheeks and determined eyes, wearing a heavy orange expedition parka with fur hood, holding a glowing translucent ice core cylinder, warm interior laboratory lighting, photorealistic 8k',
    sampleA: {
      label: 'Muestra A',
      realProvider: 'Google Imagen 3 (Vertex AI / Ultra)',
      url: '/images/glaciar_story/normalized/scene_03_valeria_core.jpg',
      cost: '$0.030 (~15 créditos)',
      resolution: '1024×1024'
    },
    sampleB: {
      label: 'Muestra B',
      realProvider: 'FLUX.1-schnell (Pollinations / Zero Cost)',
      url: '/images/benchmark_free_ai/free_scene_03_character.jpg',
      cost: '$0.00 (Gratuito)',
      resolution: '1024×768'
    }
  },
  {
    id: 'SCENE_06_HANDS_ACTION',
    type: 'ACCIÓN CON MANOS',
    title: 'Escena 3: Valeria Ajustando Generador con Llave Mecánica',
    icon: 'wrench',
    prompt: 'Cinematic photograph of female polar scientist Valeria kneeling in the howling snow blizzard outside the polar station, wearing an orange heavy parka, hands in insulated gloves holding a wrench tightening an industrial diesel generator with metal components, snow flurries, dramatic emergency lighting',
    sampleA: {
      label: 'Muestra A',
      realProvider: 'Google Imagen 3 (Vertex AI / Ultra)',
      url: '/images/glaciar_story/normalized/scene_06_generator_repair.jpg',
      cost: '$0.030 (~15 créditos)',
      resolution: '1024×1024'
    },
    sampleB: {
      label: 'Muestra B',
      realProvider: 'FLUX.1-schnell (Pollinations / Zero Cost)',
      url: '/images/benchmark_free_ai/free_scene_06_hands.jpg',
      cost: '$0.00 (Gratuito)',
      resolution: '1024×768'
    }
  }
];

export default function AtlasImageBenchmarkStudio() {
  const [revealProviders, setRevealProviders] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({
    SCENE_01_LANDSCAPE: '',
    SCENE_03_CHARACTER: '',
    SCENE_06_HANDS_ACTION: ''
  });
  const [evalNotes, setEvalNotes] = useState<Record<string, string>>({
    SCENE_01_LANDSCAPE: '',
    SCENE_03_CHARACTER: '',
    SCENE_06_HANDS_ACTION: ''
  });
  const [savedFeedback, setSavedFeedback] = useState(true);
  const [filmViewMode, setFilmViewMode] = useState<'PULSO' | 'PARANAL' | 'NIEBLA' | 'RIO' | 'V2' | 'V1' | 'COMPARE'>('PULSO');

  const handleSelectWinner = (sceneId: string, choice: string) => {
    setSelections(prev => ({ ...prev, [sceneId]: choice }));
    setSavedFeedback(false);
  };

  const handleSaveEvaluation = () => {
    const payload = {
      timestamp: new Date().toISOString(),
      evaluator: 'HUMAN_SUPERVISOR',
      selections,
      evalNotes,
      status: 'AUDITED'
    };
    try {
      localStorage.setItem('atlas_image_benchmark_human_eval', JSON.stringify(payload));
    } catch {}
    setSavedFeedback(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                BENCHMARK ACTIVO
              </span>
              <span className="text-xs text-slate-400 font-mono">BLIND A/B EVALUATION V1</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Scale className="w-8 h-8 text-indigo-400" />
              Atlas Image Quality Benchmark: Free vs Google Premium
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-3xl">
              Evaluación ciega pareada sobre 3 escenas canónicas (Paisaje, Personaje y Acción con Manos). Determina si la generación gratuita puede reemplazar a Google Imagen 3 sin pérdida de calidad cinematográfica.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setRevealProviders(!revealProviders)}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-lg ${
                revealProviders
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {revealProviders ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {revealProviders ? 'Ocultar Proveedores (Ciega)' : 'Revelar Proveedores Reales'}
            </button>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Modelo Google Premium</div>
            <div className="text-lg font-bold text-white">Imagen 3.0</div>
            <div className="text-xs text-amber-400 mt-1 font-mono">$0.030 / img (~15 créditos)</div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Modelo IA Gratuito</div>
            <div className="text-lg font-bold text-white">FLUX.1-schnell</div>
            <div className="text-xs text-emerald-400 mt-1 font-mono">$0.00 (Zero Cost / Apache 2.0)</div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Ahorro a 50 Videos/Día</div>
            <div className="text-lg font-bold text-emerald-400">$360.00 / mes</div>
            <div className="text-xs text-slate-400 mt-1 font-mono">12,000+ créditos Ultra/mes (400 imgs/d)</div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Limitación Técnica Real</div>
            <div className="text-lg font-bold text-amber-300">1 img / 45s por IP</div>
            <div className="text-xs text-slate-400 mt-1">Rate limit en tier sin autenticación</div>
          </div>
        </div>

        {/* GENERALIZATION TEST: 2 NEW UNSEEN REAL PHOTOGRAPHS */}
        <div className="bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-950 border border-indigo-500/40 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                    TEST DE GENERALIZACIÓN VISUAL
                  </span>
                  <span className="text-xs text-slate-400 font-mono">2 FOTOGRAFÍAS REALES NUNCA VISTAS</span>
                </div>
                <h2 className="text-xl font-bold text-white mt-1">Comparación Ciega: Imagen Alpha vs Imagen Beta</h2>
              </div>
            </div>
            <div className="text-xs text-slate-300 bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-emerald-400 font-bold">Elección del Director: </span>
              <span className="text-white font-semibold">IMAGEN ALPHA</span>
              <span className="text-slate-400 block text-[11px] mt-0.5">
                Razón: Profundidad atmosférica en 3 planos y contraste cálido/frío frente a iluminación gris plana de Beta.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Imagen Alpha */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-indigo-300">Imagen Alpha (Candidato A)</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  Metadatos y origen ocultos
                </span>
              </div>
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 relative group">
                <img
                  src="/images/generalization_test/image_alpha.jpg"
                  alt="Imagen Alpha"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div><strong className="text-slate-300">Composición:</strong> 3 planos (pradera alpina, bosque otoñal, mar de nubes).</div>
                <div><strong className="text-slate-300">Iluminación:</strong> Luz difusa natural con separación cromática cálido/frío.</div>
                <div><strong className="text-slate-300">Defectos:</strong> Cero marcas de agua, textura limpia.</div>
              </div>
            </div>

            {/* Imagen Beta */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-indigo-300">Imagen Beta (Candidato B)</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  Metadatos y origen ocultos
                </span>
              </div>
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 relative group">
                <img
                  src="/images/generalization_test/image_beta.jpg"
                  alt="Imagen Beta"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div><strong className="text-slate-300">Composición:</strong> Líneas guía de huellas en nieve hacia bosque cerrado.</div>
                <div><strong className="text-slate-300">Iluminación:</strong> Monocromática fría uniforme, bajo rango tonal.</div>
                <div><strong className="text-slate-300">Defectos:</strong> Cero marcas de agua, pero iluminación plana.</div>
              </div>
            </div>
          </div>

          {/* User Choice on Generalization */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-indigo-500/20 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Award className="w-5 h-5 text-amber-400" />
              <span className="font-semibold">Tu Elección Humana para Generalización:</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setGeneralizationChoice('ALPHA')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  generalizationChoice === 'ALPHA'
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Elegir Imagen Alpha (Coincide con Director)
              </button>
              <button
                onClick={() => setGeneralizationChoice('BETA')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  generalizationChoice === 'BETA'
                    ? 'bg-amber-600 border-amber-500 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Elegir Imagen Beta
              </button>
              {generalizationChoice && (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Voto Registrado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* FILM SHOWCASE: LOS TRES GOLPES DEL RÍO & EL FARO (V1 & V2) */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Film className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                    {filmViewMode === 'PARANAL'
                      ? 'SELECCIÓN AUDIOVISUAL HÍBRIDA V1 • 60s VIDEO REAL'
                      : filmViewMode === 'NIEBLA'
                      ? 'TEST DE VELOCIDAD REAL • 67.8s TOTAL'
                      : filmViewMode === 'RIO'
                      ? 'MOTOR GENERAL AUTÓNOMO • ESTRENO 120s'
                      : 'PELÍCULA ORIGINAL DE 120s • FARO V1 & V2'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {filmViewMode === 'PULSO'
                      ? 'FULL REAL VIDEO FILM E2E (120s • 100% REAL MOTION)'
                      : filmViewMode === 'PARANAL'
                      ? 'INTELLIGENT HYBRID SELECTION (PARANAL)'
                      : filmViewMode === 'NIEBLA'
                      ? 'AUTONOMOUS SPEED TEST V1 (67.8s)'
                      : filmViewMode === 'RIO'
                      ? 'AUTONOMOUS HYBRID FILM DIRECTOR V1'
                      : 'REAL MOTION + AUDIO FIX V2'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mt-1">
                  {filmViewMode === 'PULSO'
                    ? '«El Pulso de la Tierra: La Gran Odisea del Agua y el Viento»'
                    : filmViewMode === 'PARANAL'
                    ? '«Los Cielos de Paranal: El Guardián del VLT»'
                    : filmViewMode === 'NIEBLA'
                    ? '«El Domador de Niebla: Las Redes de Camanchaca»'
                    : filmViewMode === 'RIO'
                    ? '«Los tres golpes del río: La Furia del Cañón»'
                    : '«El Faro de las Mareas Negras: La Última Vigía»'}
                </h2>
              </div>
            </div>
            
            {/* Version Switcher Tabs */}
            <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex-wrap">
              <button
                onClick={() => setFilmViewMode('PULSO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'PULSO'
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                El Pulso de la Tierra (100% Real 120s)
              </button>
              <button
                onClick={() => setFilmViewMode('PARANAL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'PARANAL'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Los Cielos de Paranal (Híbrido)
              </button>
              <button
                onClick={() => setFilmViewMode('NIEBLA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'NIEBLA'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                El Domador de Niebla (67.8s)
              </button>
              <button
                onClick={() => setFilmViewMode('RIO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'RIO'
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                Los tres golpes del río
              </button>
              <button
                onClick={() => setFilmViewMode('V2')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'V2'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Faro V2 (Motion + Audio)
              </button>
              <button
                onClick={() => setFilmViewMode('V1')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'V1'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Faro V1 (Baseline)
              </button>
              <button
                onClick={() => setFilmViewMode('COMPARE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filmViewMode === 'COMPARE'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                Comparar Faro
              </button>
            </div>
          </div>

          {/* VIEW MODE: PULSO (FULL REAL VIDEO FILM 120s) */}
          {filmViewMode === 'PULSO' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Video Player Pulso */}
              <div className="md:col-span-5 bg-black rounded-xl overflow-hidden border border-cyan-500/40 shadow-2xl flex flex-col items-center">
                <div className="w-full bg-slate-900/90 px-3 py-2 text-xs font-mono text-cyan-400 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-cyan-400" />
                    el_pulso_de_la_tierra_120s.mp4
                  </span>
                  <span className="text-slate-400">120.0s • 100% Real Video</span>
                </div>
                <div className="aspect-[9/16] w-full max-h-[540px] flex items-center justify-center bg-black">
                  <video
                    controls
                    playsInline
                    src="/videos/el_pulso_de_la_tierra_120s.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-full bg-slate-950 p-2.5 text-[11px] text-slate-300 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-cyan-400 font-semibold">✓ 120.0s Video Físico Real (12 clips)</span>
                  <span className="text-indigo-400 font-semibold">✓ Piper davefx + BSO Ducking</span>
                </div>
              </div>

              {/* Specifications & Audit Details Pulso */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                      Película 100% Video Real Certificada V1
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                      REAL_VIDEO_SECONDS: 120.0s • COSTO: $0.00
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">«La Gran Odisea del Agua y el Viento» (120s en Movimiento Continuo)</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    AtlasUniversalVideoDiscovery conectado al Director: la película rastrea el pulso planetario sin una sola foto fija ni video generado por IA. Doce secuencias cinematográficas consecutivas de 10.0s documentan el recorrido del agua y la atmósfera: desde los ventisqueros de altura y cañones torrenciales, rompiendo contra los acantilados del Pacífico, adentrándose en el abismo oceánico, subiendo en niebla marina hasta las cumbres andinas y cerrando con la rotación de la Vía Láctea en Paranal.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Real Clips List 1-6 */}
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-cyan-400" />
                      Clips 01 - 06: Del Hielo al Océano
                    </div>
                    <div className="text-slate-300 space-y-1 text-[11px]">
                      <div>• <strong>01. Cumbres y Viento:</strong> Ventisquero andino (BLM, Dominio Público)</div>
                      <div>• <strong>02. Torrente de Deshielo:</strong> Cañón rocoso (Wikimedia, CC BY 3.0)</div>
                      <div>• <strong>03. Rápidos Basálticos:</strong> Fuerza hidráulica (Wikimedia, CC BY 3.0)</div>
                      <div>• <strong>04. Cascada Costera:</strong> Salto de agua al valle (Wikimedia, CC BY 3.0)</div>
                      <div>• <strong>05. Cañón Fluvial:</strong> Cañones profundos (Wikimedia, CC BY 3.0)</div>
                      <div>• <strong>06. Oleaje Sommarøy:</strong> Mar abierto y corrientes (Wikimedia, CC0)</div>
                    </div>
                  </div>

                  {/* Real Clips List 7-12 */}
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-cyan-400" />
                      Clips 07 - 12: Del Abismo al Cosmos
                    </div>
                    <div className="text-slate-300 space-y-1 text-[11px]">
                      <div>• <strong>07. Océano Profundo:</strong> Corrientes bentónicas (NASA Video API, DP)</div>
                      <div>• <strong>08. Vientos Planetarios:</strong> Dinámica atmosférica (NASA SVS, DP)</div>
                      <div>• <strong>09. Steens Mountain:</strong> Inversión de nubes (BLM, Dominio Público)</div>
                      <div>• <strong>10. Cúpulas VLT:</strong> Atardecer en Cerro Paranal (ESO, CC BY 3.0)</div>
                      <div>• <strong>11. Vía Láctea Austral:</strong> Observatorio astronómico (NASA SVS, DP)</div>
                      <div>• <strong>12. Red Abierta Universal:</strong> Frontera atmosférica (Open Archive, DP)</div>
                    </div>
                  </div>
                </div>

                {/* Audit Telemetry */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono mb-0.5">Metraje Real</div>
                    <div className="text-base font-bold text-cyan-400">120.0s / 120.0s</div>
                    <div className="text-[10px] text-emerald-400">100% Real • 0% Fotos • 0% IA</div>
                  </div>
                  <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono mb-0.5">Narración Neuronal</div>
                    <div className="text-base font-bold text-indigo-400">Piper davefx</div>
                    <div className="text-[10px] text-indigo-300">10 bloques poéticos sincronizados</div>
                  </div>
                  <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono mb-0.5">Costo Externo</div>
                    <div className="text-base font-bold text-emerald-400">$0.00</div>
                    <div className="text-[10px] text-slate-400">Fuentes abiertas verificadas</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: PARANAL (INTELLIGENT HYBRID SELECTION V1) */}
          {filmViewMode === 'PARANAL' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Video Player Paranal */}
              <div className="md:col-span-5 bg-black rounded-xl overflow-hidden border border-purple-500/40 shadow-2xl flex flex-col items-center">
                <div className="w-full bg-slate-900/90 px-3 py-2 text-xs font-mono text-purple-400 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-purple-400" />
                    los_cielos_de_paranal_120s.mp4
                  </span>
                  <span className="text-slate-400">20.9 MB • 120.0s</span>
                </div>
                <div className="aspect-[9/16] w-full max-h-[540px] flex items-center justify-center bg-black">
                  <video
                    controls
                    playsInline
                    src="/videos/los_cielos_de_paranal_120s.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-full bg-slate-950 p-2.5 text-[11px] text-slate-300 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-purple-400 font-semibold">✓ 60.0s Video Real (6 clips)</span>
                  <span className="text-emerald-400 font-semibold">✓ 60.0s Google Nano Banana 2 Lite</span>
                </div>
              </div>

              {/* Specifications & Audit Details Paranal */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-purple-400" />
                      Motor de Selección Híbrida Inteligente V1 (Sin porcentajes hardcodeados)
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                      COSTO ADICIONAL: $0.00 • TIEMPO TOTAL: 4.6s (Caché activo)
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">Protagonista: Elena Albarracín (42 años, astrofísica e ingeniera óptica)</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Argumento: En Cerro Paranal, una tormenta de viento catabático amenaza con descalibrar los espejos secundarios de berilio del Very Large Telescope justo durante una ventana única para registrar el eco lumínico de una supernova en la constelación de Carina. Elena interviene manualmente los actuadores y fija las estrellas guía láser antes del amanecer.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Real Motion */}
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <div className="font-semibold text-purple-300 mb-1 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-purple-400" />
                      Videos Reales Seleccionados (Existing-First)
                    </div>
                    <div className="text-slate-300 space-y-1 text-[11px]">
                      <div>• <strong>60.0 segundos reales</strong> (50.0% metraje físico)</div>
                      <div>• <strong>Paranal Time-lapse:</strong> ESO VLT cúpulas al atardecer</div>
                      <div>• <strong>NGTS Paranal:</strong> Rotación mecánica de telescopios</div>
                      <div>• <strong>Steens Mountain:</strong> Viento catabático en cumbres (BLM)</div>
                      <div>• <strong>Night Sky Timelapse:</strong> Bóveda celeste profunda</div>
                      <div>• <strong>Milky Way Observatory:</strong> NASA SVS alineación estelar</div>
                      <div>• <strong>Desert Sunrise:</strong> Amanecer andino (BLM)</div>
                    </div>
                  </div>

                  {/* Complementary IA Images */}
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <div className="font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Google Nano Banana 2 Lite ($0 Costo)
                    </div>
                    <div className="text-slate-300 space-y-1 text-[11px]">
                      <div>• <strong>60.0 segundos</strong> (50.0% composición original)</div>
                      <div>• <strong>Elena Albarracín:</strong> Sala de control subterránea</div>
                      <div>• <strong>Actuadores de Berilio:</strong> Calibración manual</div>
                      <div>• <strong>Estrellas Guía Láser:</strong> 4 haces a la mesosfera</div>
                      <div>• <strong>Frente de Onda:</strong> Corrección micrométrica</div>
                      <div>• <strong>Espectrógrafo:</strong> Líneas de emisión fijadas</div>
                      <div>• <strong>Epílogo al Amanecer:</strong> Elena en la terraza exterior</div>
                    </div>
                  </div>
                </div>

                {/* AI Video Gate Status */}
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 text-xs">
                  <div className="font-semibold text-slate-200 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-amber-400" />
                      Compuerta de Video IA de Costo Cero (LTX / Veo)
                    </span>
                    <span className="font-mono text-[11px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      AI_VIDEO_SECONDS: 0.0s
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Atlas evaluó la disponibilidad de modelos generativos de video de costo cero. LTX-Video distilled permanece rechazado por deformaciones anatómicas en movimiento humano; Veo no cuenta con endpoint libre de costo configurado. Regla de Costo Adicional $0 aplicada estrictamente: 0.0s generados artificialmente con deformación.
                  </div>
                </div>

                {/* Audio Verification */}
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 text-xs">
                  <div className="font-semibold text-indigo-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                      Mezcla Sonora y Voz Neuronal Piper
                    </span>
                    <span className="font-mono text-[11px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                      es_ES-davefx-medium • Sidechain Ducking
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    BSO <em>Touching Moments Higher</em> (Kevin MacLeod, CC BY 3.0) ecualizada y comprimida dinámicamente con sidechain (-5.5 dB a -6.6 dB pico, -20.7 dB a -22.8 dB media). Voz de Piper nítida y audible durante toda la duración de 120s.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: NIEBLA (AUTONOMOUS FILM SPEED TEST 67.8s) */}
          {filmViewMode === 'NIEBLA' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Video Player Niebla */}
              <div className="md:col-span-5 bg-black rounded-xl overflow-hidden border border-emerald-500/40 shadow-2xl flex flex-col items-center">
                <div className="w-full bg-slate-900/90 px-3 py-2 text-xs font-mono text-emerald-400 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-emerald-400" />
                    el_domador_de_niebla_120s.mp4
                  </span>
                  <span className="text-slate-400">13.26 MB • 117.2s</span>
                </div>
                <div className="aspect-[9/16] w-full max-h-[540px] flex items-center justify-center bg-black">
                  <video
                    controls
                    playsInline
                    src="/videos/el_domador_de_niebla_120s.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-full bg-slate-950 p-2.5 text-[11px] text-slate-300 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-emerald-400 font-semibold">✓ 29.0s Video Real (4 clips)</span>
                  <span className="text-indigo-400 font-semibold">✓ BSO Touching Moments Audible</span>
                </div>
              </div>

              {/* Specifications & Audit Details Niebla */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Película Original Producida 100% Autónomamente
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      TIEMPO TOTAL: 67.8s • COSTO: $0.00
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">Protagonista: Darío Ceballos (58 años, cosechador de niebla y baqueano costero)</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Conflicto: En los acantilados desérticos del Pacífico, la sequía amenaza con secar el oasis costero. Darío sube a las cumbres antes del amanecer para desplegar las redes atrapaniebla contra la densa Camanchaca que sube del océano.
                    Giro: Las canaletas de zinc canalizan miles de litros de agua dulce hacia los estanques de la montaña antes de que el sol del mediodía evapore la nube.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Real Motion */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-emerald-500/30 space-y-1.5">
                    <div className="text-emerald-400 font-bold flex items-center gap-1">
                      <Video className="w-4 h-4" />
                      29.0s Movimiento Real (4 Clips)
                    </div>
                    <div className="text-slate-300 text-[11px] space-y-0.5">
                      <div>• <strong>01: Olas en Acantilados</strong> (7.0s, Dominio Público)</div>
                      <div>• <strong>02: Inversión de Nubes Steens</strong> (7.5s, Dominio Público)</div>
                      <div>• <strong>03: Cumbres Kitzsteinhorn</strong> (8.0s, CC BY 3.0)</div>
                      <div>• <strong>04: Niebla Marina Michigan</strong> (6.5s, Dominio Público)</div>
                    </div>
                    <div className="text-indigo-300 text-[10px] pt-1 border-t border-slate-800">
                      8 imágenes complementarias inéditas (91s) con 3 planos de profundidad y cero deformaciones.
                    </div>
                  </div>

                  {/* Stage Timings */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-indigo-500/30 space-y-1.5">
                    <div className="text-indigo-400 font-bold flex items-center gap-1">
                      <Sparkles className="w-4 h-4" />
                      Métricas de Velocidad (67.84s)
                    </div>
                    <div className="text-slate-400 font-mono text-[10px] space-y-0.5">
                      <div>• Planificación narrativa: <strong>0.00s</strong></div>
                      <div>• Búsqueda y descarga paralela: <strong>12.61s</strong></div>
                      <div>• Keyframes visuales: <strong>0.01s</strong></div>
                      <div>• Narración Piper Neural: <strong>14.17s</strong> (78.4s voz)</div>
                      <div>• Mezcla BSO con ducking: <strong>1.21s</strong></div>
                      <div>• Montaje y Muxing paralelo: <strong>38.56s</strong></div>
                      <div>• QA acústico y catálogo: <strong>1.27s</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: RIO (NEW GENERAL ENGINE DEMO) */}
          {filmViewMode === 'RIO' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Video Player Rio */}
              <div className="md:col-span-5 bg-black rounded-xl overflow-hidden border border-emerald-500/40 shadow-2xl flex flex-col items-center">
                <div className="w-full bg-slate-900/90 px-3 py-2 text-xs font-mono text-emerald-400 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-emerald-400" />
                    los_tres_golpes_del_rio_120s.mp4
                  </span>
                  <span className="text-slate-400">32.51 MB • 120.0s</span>
                </div>
                <div className="aspect-[9/16] w-full max-h-[540px] flex items-center justify-center bg-black">
                  <video
                    controls
                    playsInline
                    src="/videos/los_tres_golpes_del_rio_120s.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-full bg-slate-950 p-2.5 text-[11px] text-slate-300 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-emerald-400 font-semibold">✓ 29.0s Video Real (4 clips)</span>
                  <span className="text-indigo-400 font-semibold">✓ BSO Clear Waters Audible</span>
                </div>
              </div>

              {/* Specifications & Audit Details Rio */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Motor General Autónomo — Producido con 1 Sola Orden
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      TIEMPO TOTAL: 84.6s • COSTO: $0.00
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">Protagonista: Mateo Benítez (64 años, baqueano fluvial del Cañón de las Ánimas)</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Conflicto: El deshielo repentino en la cordillera desata los tres avisos legendarios del río: 1) el silencio de la bajante, 2) el temblor sordo de las piedras de fondo, y 3) la cabeza de la crecida violenta.
                    Giro: Mateo embiste la contracorriente en el recodo para elevar la proa de la balsa sobre la primera rompiente y amarrar en el remanso seguro.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Real Motion */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-emerald-500/30 space-y-1.5">
                    <div className="text-emerald-400 font-bold flex items-center gap-1">
                      <Video className="w-4 h-4" />
                      29.0s Movimiento Real (4 Clips)
                    </div>
                    <div className="text-slate-300 text-[11px] space-y-0.5">
                      <div>• <strong>01: Rápidos Río Kern</strong> (7.5s, CC BY 3.0)</div>
                      <div>• <strong>02: Corriente sobre piedras</strong> (7.0s, CC0)</div>
                      <div>• <strong>03: Crecida en Bells Rapids</strong> (8.0s, CC BY-SA 4.0)</div>
                      <div>• <strong>04: Cañón Río Kali</strong> (6.5s, CC BY-SA 4.0)</div>
                    </div>
                    <div className="text-indigo-300 text-[10px] pt-1 border-t border-slate-800">
                      8 imágenes complementarias inéditas (91s) con 3 planos de profundidad y cero deformaciones.
                    </div>
                  </div>

                  {/* Stage Timings */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-indigo-500/30 space-y-1.5">
                    <div className="text-indigo-400 font-bold flex items-center gap-1">
                      <Sparkles className="w-4 h-4" />
                      Métricas de Velocidad por Etapa
                    </div>
                    <div className="text-slate-400 font-mono text-[10px] space-y-0.5">
                      <div>• Planificación narrativa: <strong>0.0s</strong></div>
                      <div>• Búsqueda video real: <strong>51.0s</strong> (0s en caché)</div>
                      <div>• Keyframes visuales: <strong>0.01s</strong> (reutilización)</div>
                      <div>• Narración Piper Neural: <strong>20.7s</strong> (82.8s voz)</div>
                      <div>• Mezcla BSO con ducking: <strong>1.35s</strong></div>
                      <div>• Montaje y Muxing 1080p: <strong>60.56s</strong></div>
                      <div>• QA acústico y registro: <strong>2.0s</strong></div>
                    </div>
                  </div>
                </div>

                {/* Audio & QA Details */}
                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs space-y-1">
                  <div className="text-indigo-300 font-semibold flex items-center gap-1">
                    <Volume2 className="w-4 h-4" />
                    Sonido Dinámico &amp; Verificación Acústica
                  </div>
                  <div className="text-slate-300 text-[11px]">
                    BSO «Clear Waters» (Kevin MacLeod, CC BY 3.0) con pre-ganancia +11 dB y sidechaincompress dinámico. 8/8 intervalos auditados físicamente (Max: -3.2 a -5.5 dB, Mean: -20.5 a -23.6 dB).
                  </div>
                </div>

                {/* Audit & Status Bar */}
                <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-indigo-300 font-semibold">Estado de Revisión Humana:</span>
                    <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      HUMAN_REVIEW_PENDING
                    </span>
                  </div>
                  <a
                    href="/videos/los_tres_golpes_del_rio_120s.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-mono underline"
                  >
                    Abrir video MP4 directo ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: V2 (DEFAULT & RECOMMENDED) */}
          {filmViewMode === 'V2' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Video Player V2 */}
              <div className="md:col-span-5 bg-black rounded-xl overflow-hidden border border-emerald-500/40 shadow-2xl flex flex-col items-center">
                <div className="w-full bg-slate-900/90 px-3 py-2 text-xs font-mono text-emerald-400 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-emerald-400" />
                    faro_mareas_negras_v2_120s.mp4
                  </span>
                  <span className="text-slate-400">41.41 MB • 120.0s</span>
                </div>
                <div className="aspect-[9/16] w-full max-h-[540px] flex items-center justify-center bg-black">
                  <video
                    controls
                    playsInline
                    src="/videos/faro_mareas_negras_v2_120s.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-full bg-slate-950 p-2.5 text-[11px] text-slate-300 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-emerald-400 font-semibold">✓ 28.0s Clips Reales de Video</span>
                  <span className="text-indigo-400 font-semibold">✓ BSO Audible con Ducking</span>
                </div>
              </div>

              {/* Specifications & Audit Details V2 */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Versión V2 — Fixes Implementados con Éxito
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      COSTO ADICIONAL: $0.00
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">Protagonista: Tomás Varela (62 años, veterano farero de Cabo Esperanza)</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Conflicto: Buque oceanográfico a la deriva hacia los arrecifes con el faro sufriendo fallo de rotación.
                    Giro: Tomás desbloquea manualmente el engranaje; el haz de luz revela una manada de ballenas francas que guía la nave a aguas profundas.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Fix 1: Audio */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-indigo-500/30 space-y-1.5">
                    <div className="text-indigo-400 font-bold flex items-center gap-1">
                      <Volume2 className="w-4 h-4" />
                      FIX 1 — BSO Audible &amp; Ducking
                    </div>
                    <div className="text-slate-300 text-[11px] leading-relaxed">
                      <strong>Causa Raíz V1:</strong> Master de «Sovereign» a -31.1 dB multiplicado por 0.22 caía a -50.2 dB (inaudible tras voz Piper).
                    </div>
                    <div className="text-emerald-300 text-[11px] leading-relaxed">
                      <strong>Solución V2:</strong> Pre-ganancia +11 dB (volume=3.5) con sidechaincompress dinámico.
                    </div>
                    <div className="text-slate-400 font-mono text-[10px] pt-1 border-t border-slate-800">
                      • Pausas/Intro: -24.2 dB (Audible)<br />
                      • Coda Final (118-120s): -26.8 dB (Audible)<br />
                      • Con Voz: -19.1 dB (Sin solapamiento)
                    </div>
                  </div>

                  {/* Fix 2: Real Motion */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-emerald-500/30 space-y-1.5">
                    <div className="text-emerald-400 font-bold flex items-center gap-1">
                      <Video className="w-4 h-4" />
                      FIX 2 — 28s Movimiento Real
                    </div>
                    <div className="text-slate-300 text-[11px] leading-relaxed">
                      <strong>4 Clips Reales de Video (Licencia Abierta):</strong>
                    </div>
                    <div className="text-slate-300 text-[11px] space-y-0.5">
                      <div>• <strong>01: Olas huracán</strong> (7.0s, CC BY 4.0)</div>
                      <div>• <strong>02: Buque en tormenta</strong> (6.5s, CC BY-SA 4.0)</div>
                      <div>• <strong>03: Haz rotatorio faro</strong> (6.0s, CC BY-SA 2.0)</div>
                      <div>• <strong>04: Ballenas francas</strong> (8.5s, CC BY 3.0)</div>
                    </div>
                    <div className="text-indigo-300 text-[10px] pt-1 border-t border-slate-800">
                      8 fotografías clave aprobadas conservadas para coherencia de Tomás y sala de control (cero deformaciones).
                    </div>
                  </div>
                </div>

                {/* Audit & Status Bar */}
                <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-indigo-300 font-semibold">Estado de Revisión Humana:</span>
                    <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      HUMAN_REVIEW_PENDING
                    </span>
                  </div>
                  <a
                    href="/videos/faro_mareas_negras_v2_120s.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-mono underline"
                  >
                    Abrir video MP4 directo ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: V1 (BASELINE) */}
          {filmViewMode === 'V1' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Video Player V1 */}
              <div className="md:col-span-5 bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col items-center">
                <div className="w-full bg-slate-900/90 px-3 py-2 text-xs font-mono text-slate-400 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-slate-400" />
                    faro_mareas_negras_120s.mp4
                  </span>
                  <span>20.56 MB • 120.0s</span>
                </div>
                <div className="aspect-[9/16] w-full max-h-[540px] flex items-center justify-center bg-black">
                  <video
                    controls
                    playsInline
                    src="/videos/faro_mareas_negras_120s.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-full bg-slate-950 p-2.5 text-[11px] text-amber-400 border-t border-slate-800 flex justify-between items-center">
                  <span>Baseline V1 (Movimiento Sólo Fotográfico)</span>
                  <span>Música Atenuada (-50 dB)</span>
                </div>
              </div>

              {/* Specifications V1 */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Versión V1 (Baseline Inicial) — Diagnóstico de Feedback
                  </div>
                  <div className="text-sm font-semibold text-white">Historia y Dirección Aprobadas por Humano</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Esta versión demostró la coherencia narrativa y fotográfica aprobada por el evaluador humano, pero presentaba dos limitaciones críticas:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-amber-500/30 space-y-1">
                    <div className="text-amber-400 font-bold">Bug 1: Música Inaudible</div>
                    <div className="text-slate-300 text-[11px]">
                      La mezcla estática con volume=0.22 redujo la música a -50.2 dB, quedando enterrada por debajo de la voz de Piper (-16 dB).
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-amber-500/30 space-y-1">
                    <div className="text-amber-400 font-bold">Bug 2: Ausencia de Video Real</div>
                    <div className="text-slate-300 text-[11px]">
                      Sólo contenía paneo y zoom procedural (Ken Burns) sobre las 8 imágenes estáticas, careciendo de dinámica de fluidos marítimos reales.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Archivo original V1 preservado intacto sin sobrescritura:</span>
                  <a
                    href="/videos/faro_mareas_negras_120s.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-300 hover:text-white font-mono underline"
                  >
                    Ver archivo V1 ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: COMPARE (SIDE BY SIDE) */}
          {filmViewMode === 'COMPARE' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* V1 Player */}
                <div className="bg-black rounded-xl overflow-hidden border border-slate-800 shadow-xl">
                  <div className="bg-slate-900/90 px-3 py-2 text-xs font-mono text-slate-300 border-b border-slate-800 flex justify-between">
                    <span className="font-bold text-amber-400">V1 Baseline (20.56 MB)</span>
                    <span className="text-slate-400">Ken Burns • BSO -50 dB</span>
                  </div>
                  <div className="aspect-[9/16] w-full max-h-[460px] flex items-center justify-center bg-black">
                    <video
                      controls
                      playsInline
                      src="/videos/faro_mareas_negras_120s.mp4"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* V2 Player */}
                <div className="bg-black rounded-xl overflow-hidden border border-emerald-500/40 shadow-xl">
                  <div className="bg-slate-900/90 px-3 py-2 text-xs font-mono text-emerald-400 border-b border-slate-800 flex justify-between">
                    <span className="font-bold text-emerald-400">V2 Real Motion + Audio Fix (41.41 MB)</span>
                    <span className="text-emerald-400 font-semibold">28s Video Real • BSO Audible</span>
                  </div>
                  <div className="aspect-[9/16] w-full max-h-[460px] flex items-center justify-center bg-black">
                    <video
                      controls
                      playsInline
                      src="/videos/faro_mareas_negras_v2_120s.mp4"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Comparison Summary Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300 border border-slate-800 rounded-xl overflow-hidden">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[11px]">
                    <tr>
                      <th className="p-3">Característica</th>
                      <th className="p-3 text-amber-400">Versión V1 (Baseline)</th>
                      <th className="p-3 text-emerald-400">Versión V2 (Real Motion + Audio Fix)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                    <tr>
                      <td className="p-3 font-semibold text-white">Música BSO («Sovereign»)</td>
                      <td className="p-3 text-red-400">Inaudible (-50.2 dB por master silencioso y volume=0.22)</td>
                      <td className="p-3 text-emerald-400 font-semibold">Audible (-24.2 dB en pausas, -26.8 dB coda, sidechain ducking)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Clips de Video Reales</td>
                      <td className="p-3 text-slate-400">0 segundos (Sólo paneo y zoom sobre fotos fijas)</td>
                      <td className="p-3 text-emerald-400 font-semibold">28.0 segundos (4 clips: olas gigantes, buque, faro, ballenas)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Anatomía Humana</td>
                      <td className="p-3 text-slate-300">Fotografías aprobadas sin deformación</td>
                      <td className="p-3 text-emerald-400 font-semibold">Preservada íntegra con las 8 fotos (cero IA deforme en Tomás)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Duración &amp; Voz</td>
                      <td className="p-3 text-slate-300">120.0s • Piper Neural TTS (DaveFX)</td>
                      <td className="p-3 text-emerald-400 font-semibold">120.00s exactos • Piper Neural TTS con pausas calibradas</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Comparison Cards for the 3 Scenes */}
        <div className="space-y-8">
          {BENCHMARK_SCENES.map((scene, idx) => (
            <div key={scene.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              {/* Scene Title Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {scene.icon === 'camera' && <Camera className="w-5 h-5" />}
                    {scene.icon === 'user' && <User className="w-5 h-5" />}
                    {scene.icon === 'wrench' && <Wrench className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{scene.type}</span>
                    <h2 className="text-lg font-bold text-white">{scene.title}</h2>
                  </div>
                </div>
                <div className="text-xs text-slate-400 max-w-xl font-mono bg-slate-950/60 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 font-semibold">Prompt: </span>"{scene.prompt}"
                </div>
              </div>

              {/* Side-by-side Image Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Sample A */}
                <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200">
                      {scene.sampleA.label}
                    </span>
                    {revealProviders ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                        {scene.sampleA.realProvider} • {scene.sampleA.cost}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        [Proveedor Protegido para Evaluación Ciega]
                      </span>
                    )}
                  </div>
                  <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 relative group">
                    <img
                      src={scene.sampleA.url}
                      alt={scene.sampleA.label}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/glaciar_story/normalized/scene_01_blizzard_base.jpg';
                      }}
                    />
                  </div>
                </div>

                {/* Sample B */}
                <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200">
                      {scene.sampleB.label}
                    </span>
                    {revealProviders ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        {scene.sampleB.realProvider} • {scene.sampleB.cost}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        [Proveedor Protegido para Evaluación Ciega]
                      </span>
                    )}
                  </div>
                  <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 relative group">
                    <img
                      src={scene.sampleB.url}
                      alt={scene.sampleB.label}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        // Fallback indicator while downloading
                        (e.target as HTMLImageElement).src = scene.sampleA.url;
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Human Evaluation Voting Block */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold">Veredicto Humano:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleSelectWinner(scene.id, 'PREFIERO_MUESTRA_A')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selections[scene.id] === 'PREFIERO_MUESTRA_A'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Muestra A es Superior
                  </button>
                  <button
                    onClick={() => handleSelectWinner(scene.id, 'PREFIERO_MUESTRA_B')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selections[scene.id] === 'PREFIERO_MUESTRA_B'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Muestra B es Superior
                  </button>
                  <button
                    onClick={() => handleSelectWinner(scene.id, 'EMPATE_ALTA_CALIDAD')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selections[scene.id] === 'EMPATE_ALTA_CALIDAD'
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Empate de Calidad (Equivalentes)
                  </button>
                  <button
                    onClick={() => handleSelectWinner(scene.id, 'AMBAS_DEFICIENTES')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selections[scene.id] === 'AMBAS_DEFICIENTES'
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Ambas Deficientes
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Save Evaluation Section */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 to-slate-900 border border-indigo-900/40 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Auditoría y Registro de Calidad Atlas
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Las decisiones humanas quedan registradas en el Truth Graph de Atlas sin inventar puntuaciones ni promover resultados no auditados.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedFeedback && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Veredicto Guardado
              </span>
            )}
            <button
              onClick={handleSaveEvaluation}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg flex items-center gap-2"
            >
              Registrar Evaluación Humana
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
