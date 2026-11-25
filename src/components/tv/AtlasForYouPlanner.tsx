import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Film,
  Loader2,
  Music,
  Newspaper,
  Play,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store/useStore';
import { useSignalStore } from '../../lib/tv/signalStore';
import { loadYouMusicWorkspace } from '../../lib/tv/youMusicPlaylistStore';
import { loadMiTvWorkspace } from '../../lib/tv/miTvStore';
import {
  COUNTRY_CHANGED_EVENT,
  getActiveCountryProfile,
  type CountryProfile
} from '../../lib/geo/userCountry';
import { passesCategoryGate } from '../../lib/search/categoryGate';
import type { CustomSignal, ScheduleBlock } from '../../lib/tv/signalTypes';

type MoodId = 'watch' | 'news' | 'music' | 'docs';

interface PlannedVideo {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  durationSec: number;
  source: string;
}

function formatDurationMin(sec: number): string {
  const s = Math.max(60, Math.round(sec || 300));
  const m = Math.round(s / 60);
  return `${m} min`;
}

function packToTargetMinutes(pool: PlannedVideo[], targetMinutes: number, seedOffset: number): PlannedVideo[] {
  if (pool.length === 0) return [];
  const rotated = [...pool.slice(seedOffset % pool.length), ...pool.slice(0, seedOffset % pool.length)];
  const targetSec = targetMinutes * 60;
  const maxSec = targetSec + 180;
  const picked: PlannedVideo[] = [];
  const seenCh = new Set<string>();
  let acc = 0;

  for (const item of rotated) {
    const chKey = item.channelName.toLowerCase().trim();
    if (seenCh.has(chKey) && picked.length < 4) continue;
    const dur = item.durationSec > 0 ? item.durationSec : 420;
    if (picked.length > 0 && acc + dur > maxSec) continue;
    picked.push(item);
    seenCh.add(chKey);
    acc += dur;
    if (acc >= targetSec * 0.85 || picked.length >= 6) break;
  }

  if (picked.length === 0) return rotated.slice(0, 3);
  return picked;
}

export function AtlasForYouPlanner() {
  const navigate = useNavigate();
  const { savedContent } = useStore();
  const setSignal = useSignalStore((s) => s.setSignal);

  const [country, setCountry] = useState<CountryProfile>(() => getActiveCountryProfile());
  const [mood, setMood] = useState<MoodId>('watch');
  const [targetMin, setTargetMin] = useState<15 | 30 | 60>(30);
  const [pool, setPool] = useState<PlannedVideo[]>([]);
  const [plan, setPlan] = useState<PlannedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    const onCountry = () => setCountry(getActiveCountryProfile());
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountry);
    return () => window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountry);
  }, []);

  const buildPool = useCallback(
    async (selectedMood: MoodId, activeCountry: CountryProfile): Promise<PlannedVideo[]> => {
      const out: PlannedVideo[] = [];
      const seen = new Set<string>();
      const push = (item: PlannedVideo) => {
        if (!/^[A-Za-z0-9_-]{11}$/.test(item.videoId) || seen.has(item.videoId)) return;
        seen.add(item.videoId);
        out.push(item);
      };

      // 1. Primero reutilizar la propia biblioteca del usuario (0 cuota, 0 ms)
      if (selectedMood === 'watch') {
        const mitv = loadMiTvWorkspace();
        for (const ch of mitv.channels || []) {
          for (const it of ch.items || []) {
            const vid = it.liveVideoId || it.providerId;
            if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) {
              push({
                videoId: vid,
                title: it.title || ch.name,
                channelName: it.author || ch.name,
                thumbnail: it.thumbnailUrl || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                durationSec: 480,
                source: 'Tu MiTV'
              });
            }
          }
        }
        for (const sc of savedContent) {
          if (sc.id && /^[A-Za-z0-9_-]{11}$/.test(sc.id)) {
            push({
              videoId: sc.id,
              title: sc.title,
              channelName: sc.channelTitle || 'Guardado',
              thumbnail: sc.thumbnail || `https://i.ytimg.com/vi/${sc.id}/hqdefault.jpg`,
              durationSec: 420,
              source: 'Guardados'
            });
          }
        }
      } else if (selectedMood === 'music') {
        const musicWs = loadYouMusicWorkspace();
        for (const pl of musicWs.playlists || []) {
          for (const it of pl.items || []) {
            push({
              videoId: it.videoId,
              title: it.title,
              channelName: it.author || pl.name,
              thumbnail: it.thumbnailUrl || `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
              durationSec: 240,
              source: 'Tu YOU MUSIC'
            });
          }
        }
      }

      // 2. Completar con `youapp_index` real (0 cuota, adaptado al país activo)
      const tagFilter =
        selectedMood === 'news'
          ? ['atlas-pointer-compact', activeCountry.tag, 'noticias']
          : selectedMood === 'music'
            ? ['atlas-pointer-compact', 'rock-curado']
            : selectedMood === 'docs'
              ? ['atlas-pointer-compact', 'documentales-curados']
              : ['atlas-pointer-compact', activeCountry.tag];

      const fetchByTags = async (tags: string[], orderCol: 'published_at' | 'views') => {
        const { data } = await supabase
          .from('youapp_index')
          .select('video_id, title, creator_name, thumbnail_url, duration_seconds, embeddable, tags')
          .eq('provider', 'youtube')
          .contains('tags', tags)
          .not('published_at', 'is', null)
          .order(orderCol, { ascending: false })
          .limit(36);
        return Array.isArray(data) ? data : [];
      };

      let rows = await fetchByTags(tagFilter, selectedMood === 'news' ? 'published_at' : 'views');
      if (rows.length < 10 && selectedMood === 'news') {
        const extra = await fetchByTags(['atlas-pointer-compact', 'es-curado', 'noticias'], 'published_at');
        rows = [...rows, ...extra];
      }

      const gateCat =
        selectedMood === 'news'
          ? 'noticias'
          : selectedMood === 'music'
            ? 'musica'
            : selectedMood === 'docs'
              ? 'documentales'
              : 'entretenimiento';

      for (const r of rows) {
        if ((r as any)?.embeddable === false) continue;
        if (!passesCategoryGate(r, gateCat)) continue;
        const vid = String((r as any)?.video_id || '').trim();
        const dur = Number((r as any)?.duration_seconds || 0);
        const fallbackDur = selectedMood === 'music' ? 240 : selectedMood === 'docs' ? 1200 : 480;
        push({
          videoId: vid,
          title: String((r as any)?.title || 'Video'),
          channelName: String((r as any)?.creator_name || activeCountry.name),
          thumbnail: String((r as any)?.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`),
          durationSec: dur >= 45 && dur <= 7200 ? dur : fallbackDur,
          source: `${activeCountry.flag} ${activeCountry.name}`
        });
      }

      return out;
    },
    [savedContent]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void buildPool(mood, country).then((loaded) => {
      if (!alive) return;
      setPool(loaded);
      setPlan(packToTargetMinutes(loaded, targetMin, 0));
      setSeed(0);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [mood, country, buildPool, targetMin]);

  const handleShuffle = () => {
    const nextSeed = seed + 3;
    setSeed(nextSeed);
    setPlan(packToTargetMinutes(pool, targetMin, nextSeed));
  };

  const handleLaunchPlan = () => {
    if (plan.length === 0) return;
    const moodTitle =
      mood === 'news'
        ? `Informativo ${country.name} (${targetMin} min)`
        : mood === 'music'
          ? `Sesión Musical (${targetMin} min)`
          : mood === 'docs'
            ? `Noche de Documentales (${targetMin} min)`
            : `Mi Noche ATLAS (${targetMin} min)`;

    let cursor = 0;
    const schedule: ScheduleBlock[] = plan.map((v, idx) => {
      const block: ScheduleBlock = {
        id: `atlas-plan-${v.videoId}-${idx}`,
        position: idx,
        startOffsetSec: cursor,
        durationSec: v.durationSec,
        topic: v.source,
        role: idx === 0 ? 'anchor' : 'main',
        contentItem: {
          id: v.videoId,
          provider: 'youtube',
          providerId: v.videoId,
          title: v.title,
          channelTitle: v.channelName,
          thumbnail: v.thumbnail,
          videoUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          durationSec: v.durationSec
        } as any
      };
      cursor += v.durationSec;
      return block;
    });

    const sigId = `atlas-para-vos-${mood}-${targetMin}`;
    const builtSignal: CustomSignal = {
      id: sigId,
      name: moodTitle,
      prompt: `Programación armada por ATLAS PARA VOS (${targetMin} min · ${country.name})`,
      duration_target: targetMin,
      visibility: 'private',
      status: 'ready',
      createdAt: new Date().toISOString(),
      schedule
    } as any;

    setSignal(builtSignal);
    navigate(`/misenal1?signal=${encodeURIComponent(sigId)}`);
  };

  const totalPlanMin = Math.max(
    1,
    Math.round(plan.reduce((acc, it) => acc + (it.durationSec || 420), 0) / 60)
  );

  return (
    <section className="afy-root" aria-label="ATLAS PARA VOS — Organizame mi noche">
      <div className="afy-card">
        <div className="afy-head">
          <div className="afy-copy">
            <span className="afy-kicker">
              <Sparkles size={12} /> ATLAS PARA VOS · {country.flag} {country.name}
            </span>
            <h2>¿Qué tenés ganas de hacer hoy?</h2>
          </div>

          <div className="afy-time-pills" role="group" aria-label="Tiempo disponible">
            <Clock size={13} className="afy-clock-ico" />
            {([15, 30, 60] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`afy-time-btn ${targetMin === m ? 'active' : ''}`}
                onClick={() => setTargetMin(m)}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>

        {/* 4 EXPERIENCIAS CLAVE */}
        <div className="afy-moods">
          <button
            type="button"
            className={`afy-mood-btn ${mood === 'watch' ? 'active' : ''}`}
            onClick={() => setMood('watch')}
          >
            <Play size={14} /> Mirar algo ahora
          </button>
          <button
            type="button"
            className={`afy-mood-btn ${mood === 'news' ? 'active' : ''}`}
            onClick={() => setMood('news')}
          >
            <Newspaper size={14} /> Informarme hoy
          </button>
          <button
            type="button"
            className={`afy-mood-btn ${mood === 'music' ? 'active' : ''}`}
            onClick={() => setMood('music')}
          >
            <Music size={14} /> Escuchar música
          </button>
          <button
            type="button"
            className={`afy-mood-btn ${mood === 'docs' ? 'active' : ''}`}
            onClick={() => setMood('docs')}
          >
            <Film size={14} /> Documentales
          </button>
        </div>

        {/* GRILLA ARMADA AL INSTANTE */}
        {loading ? (
          <div className="afy-loading">
            <Loader2 size={18} className="afy-spin" />
            <span>Armando tu programación de {targetMin} minutos…</span>
          </div>
        ) : (
          <>
            <div className="afy-plan-grid">
              {plan.map((item) => (
                <button
                  key={item.videoId}
                  type="button"
                  className="afy-item"
                  onClick={() =>
                    navigate(`/?v=${encodeURIComponent(item.videoId)}&title=${encodeURIComponent(item.title.slice(0, 80))}`)
                  }
                >
                  <div className="afy-thumb">
                    <img src={item.thumbnail} alt={item.title} loading="lazy" />
                    <span className="afy-dur">{formatDurationMin(item.durationSec)}</span>
                  </div>
                  <strong className="afy-item-title">{item.title}</strong>
                  <span className="afy-item-sub">
                    {item.channelName} · {item.source}
                  </span>
                </button>
              ))}
            </div>

            <div className="afy-footer">
              <span className="afy-summary">
                {plan.length} videos seleccionados · ~{totalPlanMin} min totales
              </span>
              <div className="afy-cta-row">
                <button
                  type="button"
                  className="afy-secondary-btn"
                  onClick={handleShuffle}
                  disabled={pool.length <= plan.length}
                >
                  <RefreshCw size={13} /> Otra combinación
                </button>
                <button
                  type="button"
                  className="afy-primary-btn"
                  onClick={handleLaunchPlan}
                  disabled={plan.length === 0}
                >
                  <Play size={13} fill="#ffffff" /> Reproducir programación
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .afy-root {
          max-width: 1240px;
          margin: 18px auto 24px;
          padding: 0 32px;
        }
        .afy-card {
          position: relative;
          border-radius: 26px;
          padding: 22px 24px;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(22px) saturate(150%);
          -webkit-backdrop-filter: blur(22px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.32);
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: #f5f5f7;
        }
        .afy-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .afy-kicker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #7dd3fc;
          margin-bottom: 4px;
        }
        .afy-copy h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        .afy-time-pills {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 6px 4px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .afy-clock-ico { color: rgba(245, 245, 247, 0.65); }
        .afy-time-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.78);
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .afy-time-btn.active {
          background: #0071e3;
          color: #ffffff;
        }

        .afy-moods {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .afy-mood-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(245, 245, 247, 0.88);
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .afy-mood-btn:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .afy-mood-btn.active {
          background: rgba(100, 210, 255, 0.2);
          border-color: rgba(100, 210, 255, 0.65);
          color: #ffffff;
        }

        .afy-loading {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 24px 0;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.75);
        }
        .afy-spin { animation: afySpin 0.9s linear infinite; color: #64d2ff; }
        @keyframes afySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .afy-plan-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 12px;
        }
        .afy-item {
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          color: #ffffff;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .afy-thumb {
          position: relative;
          aspect-ratio: 16 / 9;
          border-radius: 14px;
          overflow: hidden;
          background: #0d1018;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .afy-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.25s ease;
        }
        .afy-item:hover .afy-thumb img { transform: scale(1.04); }
        .afy-dur {
          position: absolute;
          right: 7px;
          bottom: 7px;
          padding: 2px 7px;
          border-radius: 7px;
          background: rgba(8, 10, 16, 0.8);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .afy-item-title {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .afy-item-sub {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.65);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .afy-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }
        .afy-summary {
          font-size: 12px;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.72);
        }
        .afy-cta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .afy-secondary-btn,
        .afy-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 15px;
          border-radius: 999px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .afy-secondary-btn {
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
        }
        .afy-secondary-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
        .afy-secondary-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .afy-primary-btn {
          border: 1px solid rgba(100, 210, 255, 0.55);
          background: #0071e3;
          color: #ffffff;
        }
        .afy-primary-btn:hover:not(:disabled) {
          background: #0a84ff;
          transform: translateY(-1px);
        }

        @media (max-width: 768px) {
          .afy-root { padding: 0 14px; }
          .afy-card { padding: 16px; }
        }
      `}</style>
    </section>
  );
}
