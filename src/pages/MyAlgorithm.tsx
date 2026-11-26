import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, type AlgorithmProfile } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import {
  Sparkles,
  Plus,
  Search,
  ArrowRight,
  SlidersHorizontal,
  ShieldCheck,
  X,
  Play
} from 'lucide-react';

type AlgoThemeId = 'autumn' | 'keynote' | 'marble' | 'midnight';

const ALGO_THEMES: Record<
  AlgoThemeId,
  {
    label: string;
    swatch: string;
    accent: string;
    accentGlow: string;
    bgStyle: React.CSSProperties;
    veilBg: string;
  }
> = {
  autumn: {
    label: 'Otoño',
    swatch: 'linear-gradient(135deg, #d97706, #b91c1c)',
    accent: '#fbbf24',
    accentGlow: 'rgba(251, 191, 36, 0.45)',
    bgStyle: {
      backgroundColor: '#1c120d',
      backgroundImage: "url('/my-algorithm-autumn-bg.png')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: 'brightness(0.84) contrast(1.06)'
    },
    veilBg:
      'linear-gradient(180deg, rgba(18, 10, 6, 0.18) 0%, rgba(16, 10, 8, 0.14) 50%, rgba(12, 8, 6, 0.36) 100%)'
  },
  keynote: {
    label: 'Inicio',
    swatch: 'linear-gradient(135deg, #38bdf8, #1d4ed8)',
    accent: '#64d2ff',
    accentGlow: 'rgba(100, 210, 255, 0.45)',
    bgStyle: {
      backgroundColor: '#16293a',
      backgroundImage: "url('/home-keynote-stage-bg.jpg')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: 'brightness(0.76) contrast(1.08)'
    },
    veilBg:
      'linear-gradient(180deg, rgba(18, 22, 30, 0.24) 0%, rgba(22, 26, 34, 0.16) 48%, rgba(14, 18, 26, 0.38) 100%)'
  },
  marble: {
    label: 'Mármol',
    swatch: 'linear-gradient(135deg, #eab308, #18181b)',
    accent: '#facc15',
    accentGlow: 'rgba(250, 204, 21, 0.4)',
    bgStyle: {
      backgroundColor: '#0c0b09',
      backgroundImage:
        'radial-gradient(ellipse 60% 45% at 20% 25%, rgba(234, 179, 8, 0.26) 0%, transparent 65%), radial-gradient(ellipse 50% 55% at 82% 72%, rgba(217, 119, 6, 0.24) 0%, transparent 68%), linear-gradient(135deg, #09090b 0%, #1c1917 48%, #09090b 100%)'
    },
    veilBg: 'linear-gradient(180deg, rgba(0, 0, 0, 0.16) 0%, rgba(0, 0, 0, 0.32) 100%)'
  },
  midnight: {
    label: 'Noche',
    swatch: 'linear-gradient(135deg, #6366f1, #0f172a)',
    accent: '#818cf8',
    accentGlow: 'rgba(129, 140, 248, 0.45)',
    bgStyle: {
      backgroundColor: '#090d16',
      backgroundImage:
        'radial-gradient(ellipse 55% 48% at 24% 22%, rgba(99, 102, 241, 0.32) 0%, transparent 65%), radial-gradient(ellipse 52% 48% at 78% 76%, rgba(14, 165, 233, 0.24) 0%, transparent 68%), linear-gradient(155deg, #070a12 0%, #111827 52%, #070a12 100%)'
    },
    veilBg: 'linear-gradient(180deg, rgba(6, 10, 18, 0.2) 0%, rgba(6, 10, 18, 0.38) 100%)'
  }
};

type PreviewCandidate = {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
  bucket: 'noticias' | 'rock' | 'documentales' | 'streaming';
};

const RadarChart = ({
  weights,
  accent,
  accentGlow
}: {
  weights: AlgorithmProfile['weights'];
  accent: string;
  accentGlow: string;
}) => {
  const width = 360;
  const height = 276;
  const cx = width / 2;
  const cy = height / 2 + 6;
  const radius = 84;

  const data = [
    { label: 'AFINIDAD', value: weights.afinidad },
    { label: 'ACTUALIDAD', value: weights.actualidad },
    { label: 'DIVERSIDAD', value: weights.diversidad },
    { label: 'DESCUBRIR', value: weights.nuevosCreadores },
    { label: 'POPULARIDAD', value: weights.popularidad }
  ];

  const getPoint = (i: number, value: number, rScale = radius) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const r = (value / 100) * rScale;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const polygonPoints = data
    .map((d, i) => {
      const p = getPoint(i, d.value);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="ma-radar-box">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: 380, overflow: 'visible' }}
        aria-label="Gráfico de tu algoritmo"
      >
        {[25, 50, 75, 100].map((lvl) => {
          const pts = data
            .map((_, i) => {
              const p = getPoint(i, lvl);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={lvl}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1"
            />
          );
        })}

        {data.map((_, i) => {
          const end = getPoint(i, 100);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
            />
          );
        })}

        <polygon
          points={polygonPoints}
          fill={accent}
          fillOpacity="0.26"
          stroke={accent}
          strokeWidth="2.4"
          style={{ filter: `drop-shadow(0 0 12px ${accentGlow})` }}
        />

        {data.map((d, i) => {
          const p = getPoint(i, d.value);
          const lblPos = getPoint(i, 100, radius + 34);
          const anchor =
            Math.abs(lblPos.x - cx) < 12 ? 'middle' : lblPos.x > cx ? 'start' : 'end';
          return (
            <g key={d.label}>
              <circle cx={p.x} cy={p.y} r="4.5" fill={accent} stroke="#ffffff" strokeWidth="1.4" />
              <text
                x={lblPos.x}
                y={lblPos.y - 3}
                textAnchor={anchor}
                fill="rgba(255,255,255,0.88)"
                fontSize="9.5"
                fontWeight="500"
                letterSpacing="1.2"
              >
                {d.label}
              </text>
              <text
                x={lblPos.x}
                y={lblPos.y + 11}
                textAnchor={anchor}
                fill={accent}
                fontSize="11.5"
                fontWeight="700"
              >
                {d.value}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const WEIGHT_CONTROLS: Array<{
  key: keyof AlgorithmProfile['weights'];
  label: string;
  desc: string;
}> = [
  { key: 'afinidad', label: 'Afinidad', desc: 'Prioriza tus búsquedas recientes y videos con Me gusta.' },
  { key: 'actualidad', label: 'Actualidad', desc: 'Sube noticias de hoy de tu región y estrenos recientes.' },
  { key: 'diversidad', label: 'Diversidad', desc: 'Mezcla más rubros distintos y evita repetir canales.' },
  { key: 'nuevosCreadores', label: 'Descubrimiento', desc: 'Te muestra canales y voces nuevas de tu base.' },
  { key: 'popularidad', label: 'Popularidad', desc: 'Prioriza los videos con más vistas reales.' }
];

const RULE_CONTROLS: Array<{
  key: keyof AlgorithmProfile['rules'];
  label: string;
  desc: string;
}> = [
  { key: 'prioridadArgentina', label: 'Prioridad Argentina y LATAM', desc: 'Muestra primero noticias y creadores de tu región.' },
  { key: 'noRepetido', label: 'No repetir videos', desc: 'Evita volver a recomendarte videos que ya miraste.' },
  { key: 'max30Min', label: 'Videos de hasta 30 min', desc: 'Prioriza contenidos más ágiles y concretos.' },
  { key: 'masDocumentalesNoche', label: 'Más documentales e historia', desc: 'Da más lugar a documentales largos y cultura.' },
  { key: 'menosNoticias24h', label: 'Menos noticias continuas', desc: 'Reduce la carga de noticieros en tu portada.' }
];

const THEME_STORAGE_KEY = 'youapp_algo_theme_v1';

export default function MyAlgorithm() {
  const navigate = useNavigate();
  const { savedAlgorithms, activeAlgorithmId, setActiveAlgorithmId, updateAlgorithm, addAlgorithm } = useStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [previewPool, setPreviewPool] = useState<PreviewCandidate[]>([]);
  const [themeId, setThemeId] = useState<AlgoThemeId>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as AlgoThemeId | null;
      return saved && ALGO_THEMES[saved] ? saved : 'autumn';
    } catch {
      return 'autumn';
    }
  });

  const activeAlgo = savedAlgorithms.find((a) => a.id === activeAlgorithmId) || savedAlgorithms[0];
  const theme = ALGO_THEMES[themeId];

  const handleSelectTheme = (next: AlgoThemeId) => {
    setThemeId(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  // Cargar muestra real de 24 videos para la vista previa EN VIVO de cómo queda tu portada
  useEffect(() => {
    let active = true;
    const cols = 'video_id,title,creator_name,thumbnail_url,thumbnail,views,published_at';
    void (async () => {
      try {
        const [notRes, rockRes, docRes, streamRes] = await Promise.all([
          supabase.from('youapp_index').select(cols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'noticias']).order('published_at', { ascending: false }).limit(12),
          supabase.from('youapp_index').select(cols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'rock-curado']).order('views', { ascending: false }).limit(12),
          supabase.from('youapp_index').select(cols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'documentales-curados']).order('views', { ascending: false }).limit(12),
          supabase.from('youapp_index').select(cols).eq('provider', 'youtube').contains('tags', ['atlas-pointer-compact', 'es-curado', 'streaming']).order('views', { ascending: false }).limit(12)
        ]);
        if (!active) return;
        const mapRows = (arr: any, bucket: PreviewCandidate['bucket']): PreviewCandidate[] =>
          (Array.isArray(arr) ? arr : [])
            .filter((r: any) => /^[A-Za-z0-9_-]{11}$/.test(String(r?.video_id || '')))
            .map((r: any) => ({
              videoId: String(r.video_id),
              title: String(r.title || 'Video'),
              channelName: String(r.creator_name || 'YouTube'),
              thumbnail: String(r.thumbnail_url || r.thumbnail || `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`),
              views: Number(r.views || 0),
              publishedAt: String(r.published_at || ''),
              bucket
            }));

        setPreviewPool([
          ...mapRows(notRes.data, 'noticias'),
          ...mapRows(rockRes.data, 'rock'),
          ...mapRows(docRes.data, 'documentales'),
          ...mapRows(streamRes.data, 'streaming')
        ]);
      } catch {
        // ignore network errors
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Recalcular EN TIEMPO REAL las 4 tarjetas de vista previa al mover cualquier slider o regla
  const livePreviewItems = useMemo(() => {
    if (!activeAlgo || previewPool.length === 0) return [];
    const w = activeAlgo.weights;
    const rules = activeAlgo.rules;
    const nowMs = Date.now();

    const scored = previewPool.map((item, idx) => {
      const popNorm = item.views > 0 ? Math.min(1, Math.log10(item.views + 10) / 8) : 0.2;
      const pubMs = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
      const ageDays = pubMs > 0 && !Number.isNaN(pubMs) ? Math.max(0, (nowMs - pubMs) / 86_400_000) : 180;
      const recencyNorm = ageDays <= 2 ? 1 : ageDays <= 10 ? 0.72 : ageDays <= 45 ? 0.35 : 0.08;

      const isNews = item.bucket === 'noticias';
      const isRock = item.bucket === 'rock';
      const isDoc = item.bucket === 'documentales';
      const isStream = item.bucket === 'streaming';

      // Peso sensible y real para que mover cada barra cambie visiblemente los 4 videos en vivo
      const actualidadScore = (isNews ? 1.35 : recencyNorm * 0.55) * (w.actualidad ?? 50);
      const afinidadScore = (isRock ? 1.25 : isStream ? 0.85 : 0.2) * (w.afinidad ?? 50);
      const descubrirScore = (isDoc ? 1.35 : isStream ? 0.75 : 0.15) * (w.nuevosCreadores ?? 50);
      const popularidadScore = (popNorm * 1.4 - (w.popularidad < 35 ? popNorm * 1.6 : 0)) * Math.max(15, w.popularidad ?? 50);
      const ruleBonus =
        (isNews && rules.menosNoticias24h ? -95 : 0) +
        (isDoc && rules.masDocumentalesNoche ? 85 : 0) +
        (isStream && rules.prioridadArgentina ? 25 : 0);

      // Semilla determinística por cada paso de cualquier barra para que los 4 videos roten en vivo mientras arrastrás
      const sliderStep = Math.floor(
        ((w.actualidad ?? 50) +
          (w.afinidad ?? 50) * 2 +
          (w.diversidad ?? 50) * 3 +
          (w.nuevosCreadores ?? 50) * 5 +
          (w.popularidad ?? 50) * 7 +
          (activeAlgo.aiControl ?? 50) * 11) /
          5
      );
      const rotationBoost = (((idx * 7 + sliderStep * 3) % 12) - 5.5) * 6.5;

      return {
        item,
        score: actualidadScore + afinidadScore + descubrirScore + popularidadScore + ruleBonus + rotationBoost
      };
    });

    scored.sort((a, b) => b.score - a.score);

    // Diversidad real: >65% fuerza 1 por rubro; 35–65% permite hasta 2 del rubro dominante; <35% deja hasta 4 del dominante
    const div = w.diversidad ?? 50;
    const maxPerBucket = div >= 65 ? 1 : div >= 35 ? 2 : 4;
    const bucketCounts = new Map<string, number>();
    const out: PreviewCandidate[] = [];

    for (const s of scored) {
      const used = bucketCounts.get(s.item.bucket) || 0;
      if (used >= maxPerBucket) continue;
      bucketCounts.set(s.item.bucket, used + 1);
      out.push(s.item);
      if (out.length >= 4) break;
    }
    return out;
  }, [activeAlgo, previewPool]);

  const handleUpdateWeight = (key: keyof AlgorithmProfile['weights'], value: number) => {
    if (!activeAlgo) return;
    updateAlgorithm(activeAlgo.id, {
      weights: { ...activeAlgo.weights, [key]: value }
    });
  };

  const handleUpdateRule = (key: keyof AlgorithmProfile['rules'], value: boolean) => {
    if (!activeAlgo) return;
    updateAlgorithm(activeAlgo.id, {
      rules: { ...activeAlgo.rules, [key]: value }
    });
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newName.trim();
    if (!clean) return;
    const created: AlgorithmProfile = {
      id: `algo-custom-${Date.now()}`,
      name: clean,
      description: 'Perfil creado a tu medida en YOUAPP.',
      icon: 'Target',
      color: theme.accent,
      weights: {
        afinidad: 70,
        creadores: 60,
        actualidad: 65,
        diversidad: 60,
        nuevosCreadores: 55,
        popularidad: 65,
        recomendacionesHumanas: 50,
        profundidad: 50,
        contenidoLocal: 70
      },
      rules: {
        max30Min: false,
        creadoresNuevos20: false,
        prioridadArgentina: true,
        noRepetido: true,
        noPolitica: false,
        menosNoticias24h: false,
        masDocumentalesNoche: false
      },
      aiControl: 40,
      lastUsed: 'Recién creado'
    };
    addAlgorithm(created);
    setActiveAlgorithmId(created.id);
    setNewName('');
    setCreating(false);
  };

  if (!activeAlgo) return null;

  return (
    <div
      className="ma-page"
      style={
        {
          '--ma-accent': theme.accent,
          '--ma-accent-glow': theme.accentGlow
        } as React.CSSProperties
      }
    >
      <div className="ma-stage-bg" style={theme.bgStyle} aria-hidden="true" />
      <div className="ma-stage-veil" style={{ background: theme.veilBg }} aria-hidden="true" />

      {/* BARRA SUPERIOR UNIFICADA EN MAYÚSCULAS */}
      <header className="ma-topbar">
        <div className="ma-topbar-left">
          <button type="button" className="ma-logo-btn" onClick={() => navigate('/')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="ma-brand-pill">MI ALGORITMO</span>
        </div>

        <nav className="ma-nav">
          <button type="button" className="ma-nav-btn" onClick={() => navigate('/misenal1')}>MI SEÑAL</button>
          <button type="button" className="ma-nav-btn" onClick={() => navigate('/mitv')}>MITV</button>
          <button type="button" className="ma-nav-btn" onClick={() => navigate('/youmusic')}>YOU MUSIC</button>
          <button type="button" className="ma-nav-btn" onClick={() => navigate('/reels')}>REELS</button>
          <button type="button" className="ma-nav-btn" onClick={() => navigate('/lecturas')}>LECTURAS</button>
          <button type="button" className="ma-nav-btn" onClick={() => navigate('/my-lists')}>MIS LISTAS</button>
          <button
            type="button"
            className="ma-nav-btn"
            onClick={() => navigate('/search')}
            title="Buscar en YOUAPP"
            aria-label="Buscar"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px' }}
          >
            <Search size={16} />
          </button>
        </nav>

        <TvUserSessionMenu variant="glass" />
      </header>

      {/* UNA SOLA COLUMNA CENTRADA Y LIMPIA */}
      <main className="ma-main">
        <section className="ma-hero">
          <div className="ma-hero-top">
            <div className="ma-hero-badge">
              <Sparkles size={13} /> Control total sobre lo que ves
            </div>
            <div className="ma-theme-switcher" aria-label="Cambiar ambiente">
              {(Object.keys(ALGO_THEMES) as AlgoThemeId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`ma-theme-dot ${themeId === id ? 'active' : ''}`}
                  style={{ background: ALGO_THEMES[id].swatch }}
                  onClick={() => handleSelectTheme(id)}
                  title={`Ambiente ${ALGO_THEMES[id].label}`}
                  aria-label={`Ambiente ${ALGO_THEMES[id].label}`}
                />
              ))}
            </div>
          </div>
          <h1>Mi Algoritmo</h1>
          <p>
            Vos decidís cómo se arma tu portada en Buscar. Mové las barras y los cambios se aplican al instante.
          </p>
        </section>

        {/* 1. PERFILES */}
        <section className="ma-glass-card">
          <div className="ma-card-head">
            <h2>Perfil activo</h2>
            <button
              type="button"
              className="ma-small-btn"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? <X size={14} /> : <Plus size={14} />}
              <span>{creating ? 'Cancelar' : 'Nuevo perfil'}</span>
            </button>
          </div>

          <div className="ma-profiles-row">
            {savedAlgorithms.map((algo) => (
              <button
                key={algo.id}
                type="button"
                className={`ma-profile-pill ${activeAlgo.id === algo.id ? 'active' : ''}`}
                onClick={() => setActiveAlgorithmId(algo.id)}
              >
                {algo.name}
              </button>
            ))}
          </div>

          {creating && (
            <form className="ma-create-form" onSubmit={handleCreateProfile}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de tu perfil (ej. Noche de Documentales)…"
                maxLength={32}
                autoFocus
              />
              <button type="submit" className="ma-primary-btn">
                Crear
              </button>
            </form>
          )}

          <p className="ma-active-desc">{activeAlgo.description}</p>
        </section>

        {/* 2. RADAR + VISTA PREVIA EN VIVO + CONTROLES SIN CAJAS INTERNAS */}
        <section className="ma-glass-card">
          <div className="ma-card-head">
            <h2>
              <SlidersHorizontal size={16} /> Pesos de tu algoritmo
            </h2>
          </div>

          <RadarChart
            weights={activeAlgo.weights}
            accent={theme.accent}
            accentGlow={theme.accentGlow}
          />

          {livePreviewItems.length > 0 && (
            <div className="ma-live-preview">
              <div className="ma-live-preview-head">
                <span>ASÍ QUEDA TU PORTADA EN VIVO</span>
                <em>{livePreviewItems.length} DESTACADOS</em>
              </div>
              <div className="ma-live-preview-grid">
                {livePreviewItems.map((vid) => (
                  <button
                    key={vid.videoId}
                    type="button"
                    className="ma-mini-card"
                    onClick={() => navigate('/search')}
                    title={`${vid.title} · ${vid.channelName}`}
                  >
                    <div className="ma-mini-thumb">
                      <img src={vid.thumbnail} alt={vid.title} loading="lazy" />
                      <span className="ma-mini-tag">
                        {vid.bucket === 'noticias'
                          ? 'NOTICIAS'
                          : vid.bucket === 'rock'
                            ? 'ROCK'
                            : vid.bucket === 'documentales'
                              ? 'DOCU'
                              : 'STREAM'}
                      </span>
                      <span className="ma-mini-play">
                        <Play size={11} fill="#ffffff" color="#ffffff" />
                      </span>
                    </div>
                    <strong className="ma-mini-title">{vid.title}</strong>
                    <span className="ma-mini-ch">{vid.channelName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ma-sliders-list">
            {WEIGHT_CONTROLS.map((ctrl) => {
              const val = activeAlgo.weights[ctrl.key] ?? 50;
              return (
                <div key={ctrl.key} className="ma-slider-row">
                  <div className="ma-slider-top">
                    <div>
                      <strong>{ctrl.label}</strong>
                      <span>{ctrl.desc}</span>
                    </div>
                    <em className="ma-pct">{val}%</em>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={val}
                    onChange={(e) => handleUpdateWeight(ctrl.key, Number(e.target.value))}
                    className="ma-range"
                    style={{ '--val': `${val}%` } as React.CSSProperties}
                  />
                </div>
              );
            })}

            <div className="ma-slider-row">
              <div className="ma-slider-top">
                <div>
                  <strong>Yo decido vs. IA</strong>
                  <span>
                    Vos decidís {100 - activeAlgo.aiControl}% · IA sugiere {activeAlgo.aiControl}%
                  </span>
                </div>
                <em className="ma-pct">{100 - activeAlgo.aiControl}%</em>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={activeAlgo.aiControl}
                onChange={(e) => updateAlgorithm(activeAlgo.id, { aiControl: Number(e.target.value) })}
                className="ma-range"
                style={{ '--val': `${activeAlgo.aiControl}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </section>

        {/* 3. REGLAS SIMPLES CON SWITCHES ESTILO iOS */}
        <section className="ma-glass-card">
          <div className="ma-card-head">
            <h2>
              <ShieldCheck size={16} /> Reglas rápidas
            </h2>
          </div>

          <div className="ma-rules-list">
            {RULE_CONTROLS.map((rule) => {
              const checked = Boolean(activeAlgo.rules[rule.key]);
              return (
                <div
                  key={rule.key}
                  className="ma-rule-row"
                  onClick={() => handleUpdateRule(rule.key, !checked)}
                >
                  <div className="ma-rule-text">
                    <strong>{rule.label}</strong>
                    <span>{rule.desc}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={rule.label}
                    className={`ma-ios-switch ${checked ? 'on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateRule(rule.key, !checked);
                    }}
                  >
                    <span className="ma-ios-knob" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA FINAL */}
        <div className="ma-cta-wrap">
          <button type="button" className="ma-cta-btn" onClick={() => navigate('/search')}>
            <span>Aplicar y ver mi feed en Buscar</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </main>

      <style>{`
        .ma-page {
          position: relative;
          min-height: 100dvh;
          background-color: #14161a;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          padding-bottom: 68px;
          overflow-x: clip;
          isolation: isolate;
        }
        .ma-stage-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          opacity: 1;
          pointer-events: none;
          transition: background-image 0.35s ease, filter 0.35s ease;
        }
        .ma-stage-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }
        .ma-topbar,
        .ma-main {
          position: relative;
          z-index: 2;
        }
        .ma-topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 22px;
          background: rgba(24, 26, 30, 0.44);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        }
        .ma-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .ma-logo-btn {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }
        .ma-brand-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.36);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          white-space: nowrap;
        }
        .ma-nav {
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 6px;
          min-width: 0;
        }
        .ma-nav-btn {
          background: transparent;
          border: 1px solid transparent;
          color: rgba(245, 245, 247, 0.88);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ma-nav-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.38);
          color: #ffffff;
        }

        .ma-main {
          max-width: 780px;
          margin: 0 auto;
          padding: 26px 20px 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .ma-hero {
          text-align: center;
          padding: 4px 8px;
        }
        .ma-hero-top {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
        }
        .ma-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.34);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .ma-theme-switcher {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.24);
        }
        .ma-theme-dot {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1.5px solid rgba(255, 255, 255, 0.45);
          cursor: pointer;
          padding: 0;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .ma-theme-dot:hover {
          transform: scale(1.14);
        }
        .ma-theme-dot.active {
          border-color: #ffffff;
          transform: scale(1.16);
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
        }
        .ma-hero h1 {
          margin: 0 0 10px;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', sans-serif);
          font-size: clamp(32px, 5vw, 46px);
          font-weight: 300;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #ffffff;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.38);
        }
        .ma-hero p {
          margin: 0 auto;
          max-width: 560px;
          padding: 4px 12px;
          background: transparent;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.92);
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
        }

        /* Tarjeta Glassmorphism Realista: vidrio ultra claro + bordes luminosos más marcados en los vértices (sin sombras internas oscuras) */
        .ma-glass-card {
          position: relative;
          border-radius: 26px;
          padding: 26px 28px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.12) 0%,
            rgba(255, 255, 255, 0.03) 50%,
            rgba(255, 255, 255, 0.09) 100%
          );
          backdrop-filter: blur(22px) saturate(140%) brightness(1.06);
          -webkit-backdrop-filter: blur(22px) saturate(140%) brightness(1.06);
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.55),
            inset 0 -1px 2px rgba(255, 255, 255, 0.35),
            inset 0 0 22px rgba(255, 255, 255, 0.08),
            0 16px 40px rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          gap: 18px;
          overflow: hidden;
        }
        /* Brillo interior diagonal muy sutil */
        .ma-glass-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(circle at 4% 4%, rgba(255, 255, 255, 0.26) 0%, transparent 32%),
            radial-gradient(circle at 96% 96%, rgba(255, 255, 255, 0.22) 0%, transparent 32%);
          pointer-events: none;
        }
        /* Bisel blanco grueso (2.2px) con mayor luminosidad en los vértices */
        .ma-glass-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 2.2px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.96) 0%,
            rgba(255, 255, 255, 0.52) 18%,
            rgba(255, 255, 255, 0.16) 50%,
            rgba(255, 255, 255, 0.52) 82%,
            rgba(255, 255, 255, 0.96) 100%
          );
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
          z-index: 2;
        }
        .ma-glass-card > * {
          position: relative;
          z-index: 1;
        }
        .ma-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ma-card-head h2 {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 19px;
          font-weight: 300;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #ffffff;
        }
        .ma-small-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .ma-small-btn:hover {
          background: rgba(255, 255, 255, 0.24);
        }

        .ma-profiles-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ma-profile-pill {
          padding: 8px 16px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }
        .ma-profile-pill.active,
        .ma-profile-pill:hover {
          background: rgba(255, 255, 255, 0.92);
          border-color: #ffffff;
          color: #16181f;
        }
        .ma-active-desc {
          margin: 0;
          font-size: 11.5px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.84);
        }
        .ma-create-form {
          display: flex;
          gap: 8px;
        }
        .ma-create-form input {
          flex: 1;
          min-width: 0;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(10, 14, 22, 0.42);
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .ma-primary-btn {
          padding: 9px 18px;
          border-radius: 999px;
          border: 1px solid #ffffff;
          background: rgba(255, 255, 255, 0.92);
          color: #16181f;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }

        .ma-radar-box {
          display: flex;
          justify-content: center;
          padding: 4px 0 0;
        }

        /* Vista previa EN VIVO */
        .ma-live-preview {
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.16);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ma-live-preview-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10.5px;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.78);
        }
        .ma-live-preview-head em {
          font-style: normal;
          font-weight: 700;
          color: var(--ma-accent);
        }
        .ma-live-preview-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .ma-mini-card {
          background: transparent;
          border: none;
          padding: 0;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 5px;
          color: #ffffff;
        }
        .ma-mini-thumb {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(0, 0, 0, 0.35);
        }
        .ma-mini-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.22s ease;
        }
        .ma-mini-card:hover .ma-mini-thumb img {
          transform: scale(1.05);
        }
        .ma-mini-play {
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.45);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ma-mini-tag {
          position: absolute;
          left: 6px;
          top: 6px;
          padding: 2px 6px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.68);
          border: 1px solid rgba(255, 255, 255, 0.32);
          color: #ffffff;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
        }
        .ma-mini-title {
          font-size: 11px;
          font-weight: 600;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ma-mini-ch {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.68);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Sliders flotando sobre el vidrio (sin cajas pesadas) */
        .ma-sliders-list {
          display: flex;
          flex-direction: column;
        }
        .ma-slider-row {
          padding: 14px 2px;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ma-slider-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .ma-slider-top strong {
          display: block;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #ffffff;
        }
        .ma-slider-top span {
          display: block;
          font-size: 10.5px;
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.76);
          margin-top: 3px;
        }
        .ma-pct {
          font-style: normal;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--ma-accent);
          font-variant-numeric: tabular-nums;
        }

        /* Barra fina luminosa + perilla de cristal */
        .ma-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            var(--ma-accent) 0%,
            var(--ma-accent) var(--val, 50%),
            rgba(255, 255, 255, 0.22) var(--val, 50%),
            rgba(255, 255, 255, 0.22) 100%
          );
          outline: none;
          cursor: pointer;
        }
        .ma-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ffffff;
          border: 2px solid var(--ma-accent);
          box-shadow: 0 0 12px var(--ma-accent-glow), 0 2px 8px rgba(0, 0, 0, 0.4);
          cursor: pointer;
          transition: transform 0.14s ease;
        }
        .ma-range::-webkit-slider-thumb:hover {
          transform: scale(1.14);
        }
        .ma-range::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ffffff;
          border: 2px solid var(--ma-accent);
          box-shadow: 0 0 12px var(--ma-accent-glow), 0 2px 8px rgba(0, 0, 0, 0.4);
          cursor: pointer;
        }

        /* Reglas flotantes + Switch iOS */
        .ma-rules-list {
          display: flex;
          flex-direction: column;
        }
        .ma-rule-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 2px;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          cursor: pointer;
        }
        .ma-rule-row:first-child {
          border-top: none;
          padding-top: 4px;
        }
        .ma-rule-text strong {
          display: block;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #ffffff;
        }
        .ma-rule-text span {
          display: block;
          font-size: 10.5px;
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.76);
          margin-top: 3px;
        }
        .ma-ios-switch {
          position: relative;
          width: 46px;
          height: 26px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.16);
          padding: 0;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .ma-ios-switch.on {
          background: var(--ma-accent);
          border-color: #ffffff;
          box-shadow: 0 0 14px var(--ma-accent-glow);
        }
        .ma-ios-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          transition: transform 0.2s ease;
        }
        .ma-ios-switch.on .ma-ios-knob {
          transform: translateX(20px);
        }

        .ma-cta-wrap {
          display: flex;
          justify-content: center;
          padding-top: 8px;
        }
        .ma-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 30px;
          border-radius: 999px;
          border: 1.5px solid #ffffff;
          background: rgba(255, 255, 255, 0.92);
          color: #16181f;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42);
          transition: transform 0.16s ease, background 0.16s ease;
        }
        .ma-cta-btn:hover {
          background: #ffffff;
          transform: translateY(-1px);
        }

        @media (max-width: 960px) {
          .ma-topbar {
            padding: 10px 14px;
          }
          .ma-nav {
            display: none;
          }
          .ma-glass-card {
            padding: 20px 18px;
          }
          .ma-live-preview-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
