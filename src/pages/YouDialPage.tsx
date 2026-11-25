import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  ExternalLink,
  Newspaper,
  Pause,
  Play,
  Radio,
  Search,
  Tv
} from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { YouAppPlayer } from '../components/player/YouAppPlayer';
import { useSignalStore } from '../lib/tv/signalStore';
import { CURATED_SIGNALS_PILOT } from '../lib/tv/curatedSignalsCatalog';
import { STARTER_AUDIO_PRESETS } from '../lib/tv/signalMediaSourcesStore';
import {
  fetchArgentinaLiveData,
  type ArgentinaLiveData
} from '../lib/tv/signalStationExtrasStore';

type DialKind = 'tv' | 'radio' | 'news' | 'data';

interface DialStation {
  id: string;
  dialNumber: string;
  bandLabel: string;
  kind: DialKind;
  name: string;
  subtitle: string;
  accent: string;
  openRoute: string;
  videoId?: string;
  videoTitle?: string;
  audioUrl?: string;
  originUrl?: string;
}

interface QuickHeadline {
  outlet: string;
  title: string;
  link: string;
}

export default function YouDialPage() {
  const navigate = useNavigate();
  const { activeSignal, savedSignalsById } = useSignalStore();

  const stations = useMemo<DialStation[]>(() => {
    const list: DialStation[] = [];
    let num = 1;
    const nextNum = () => String(num++).padStart(2, '0');

    // 1. Señal propia activa (y otras señales guardadas propias)
    const ownSignals = Object.values(savedSignalsById || {}).filter(
      (s) => s && !s.id.startsWith('curated-') && s.schedule?.length > 0
    );
    const primaryOwn =
      activeSignal && !activeSignal.id.startsWith('curated-') && activeSignal.schedule?.length > 0
        ? activeSignal
        : ownSignals[0] || null;

    if (primaryOwn) {
      const b0 = primaryOwn.schedule[0];
      list.push({
        id: `dial-own-${primaryOwn.id}`,
        dialNumber: nextNum(),
        bandLabel: 'MI SEÑAL · TV',
        kind: 'tv',
        name: primaryOwn.name,
        subtitle: b0?.contentItem?.title || 'Tu señal personal en vivo',
        accent: '#0071e3',
        openRoute: `/misenal1?signal=${encodeURIComponent(primaryOwn.id)}`,
        videoId: b0?.contentItem?.providerId || b0?.contentItem?.id || '0cjWa3Eizqw',
        videoTitle: b0?.contentItem?.title || primaryOwn.name
      });
    } else {
      list.push({
        id: 'dial-own-default',
        dialNumber: nextNum(),
        bandLabel: 'MI SEÑAL · TV',
        kind: 'tv',
        name: 'Justicia Social TV',
        subtitle: '¿Qué es la Rerum Novarum? · Documental histórico',
        accent: '#0071e3',
        openRoute: '/misenal1',
        videoId: '0cjWa3Eizqw',
        videoTitle: '¿Qué es la Rerum Novarum?'
      });
    }

    // 2. Señales temáticas TV (Fútbol, Historia, Ciencia)
    for (const curated of CURATED_SIGNALS_PILOT) {
      const ch0 = curated.channels[0];
      list.push({
        id: `dial-cur-${curated.id}`,
        dialNumber: nextNum(),
        bandLabel: `${(curated.tags[0] || 'TV').toUpperCase()} · TV`,
        kind: 'tv',
        name: curated.title,
        subtitle: ch0?.videoTitle || curated.subtitle,
        accent: curated.accentColor,
        openRoute: `/misenal1?signal=${encodeURIComponent(curated.id)}`,
        videoId: ch0?.videoId || curated.coverVideoId,
        videoTitle: ch0?.videoTitle || curated.title
      });
    }

    // 3. Radios reales en vivo (200 OK MP3)
    for (const r of STARTER_AUDIO_PRESETS) {
      list.push({
        id: `dial-rad-${r.author.toLowerCase().replace(/\s+/g, '-')}`,
        dialNumber: nextNum(),
        bandLabel: 'FM / AM · RADIO',
        kind: 'radio',
        name: r.title,
        subtitle: `Transmisión en vivo · ${r.author}`,
        accent: '#16a34a',
        openRoute: '/misenal-medios',
        audioUrl: r.streamUrl,
        originUrl: r.originUrl
      });
    }

    // 4. Diarios Argentinos en vivo
    list.push({
      id: 'dial-news-ar',
      dialNumber: nextNum(),
      bandLabel: 'NOTICIAS · AR',
      kind: 'news',
      name: 'Diarios Argentinos en vivo',
      subtitle: 'Infobae · La Nación · Clarín · Ámbito',
      accent: '#ea580c',
      openRoute: '/diarios'
    });

    // 5. Datos en vivo (Clima + Dólar AR)
    list.push({
      id: 'dial-data-ar',
      dialNumber: nextNum(),
      bandLabel: 'DATOS · EN VIVO',
      kind: 'data',
      name: 'Clima y Dólar Argentina',
      subtitle: 'Indicadores actualizados al minuto',
      accent: '#0f766e',
      openRoute: '/misenal1'
    });

    return list;
  }, [activeSignal, savedSignalsById]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [isRadioPlaying, setIsRadioPlaying] = useState(false);
  const [liveData, setLiveData] = useState<ArgentinaLiveData | null>(null);
  const [headlines, setHeadlines] = useState<QuickHeadline[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const current = stations[activeIdx] || stations[0];

  const stepStation = (delta: number) => {
    setActiveIdx((prev) => (prev + delta + stations.length) % stations.length);
  };

  // Navegación con flechas ← / → del teclado
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIdx((prev) => (prev + 1) % stations.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIdx((prev) => (prev - 1 + stations.length) % stations.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stations.length]);

  // Manejo de audio al cambiar de estación
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (current.kind !== 'radio' || !current.audioUrl) {
      el.pause();
      setIsRadioPlaying(false);
      return;
    }
    el.pause();
    el.src = current.audioUrl;
    el.load();
    el.play()
      .then(() => setIsRadioPlaying(true))
      .catch(() => setIsRadioPlaying(false));
  }, [current.id, current.kind, current.audioUrl]);

  // Cargar datos en vivo cuando sintoniza Datos
  useEffect(() => {
    if (current.kind !== 'data' || liveData) return;
    fetchArgentinaLiveData('cordoba', false)
      .then(setLiveData)
      .catch(() => {});
  }, [current.kind, liveData]);

  // Cargar titulares rápidos cuando sintoniza Noticias
  useEffect(() => {
    if (current.kind !== 'news' || headlines.length > 0) return;
    const feeds = [
      ['Infobae', 'https://www.infobae.com/arc/outboundfeeds/rss/'],
      ['La Nación', 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/'],
      ['Clarín', 'https://www.clarin.com/rss/lo-ultimo/'],
      ['Ámbito', 'https://www.ambito.com/rss/pages/home.xml']
    ];
    Promise.all(
      feeds.map(async ([outlet, rss]) => {
        try {
          const r = await fetch(
            `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`
          );
          const j = await r.json();
          return (j.items || []).slice(0, 2).map((it: any) => ({
            outlet,
            title: String(it.title || '').trim(),
            link: it.link || '#'
          }));
        } catch {
          return [];
        }
      })
    )
      .then((groups) => setHeadlines(groups.flat()))
      .catch(() => {});
  }, [current.kind, headlines.length]);

  const toggleRadio = () => {
    const el = audioRef.current;
    if (!el || !current.audioUrl) return;
    if (isRadioPlaying) {
      el.pause();
      setIsRadioPlaying(false);
    } else {
      if (el.src !== current.audioUrl) {
        el.src = current.audioUrl;
        el.load();
      }
      el.play()
        .then(() => setIsRadioPlaying(true))
        .catch(() => setIsRadioPlaying(false));
    }
  };

  return (
    <div className="yd-page">
      <audio
        ref={audioRef}
        onPause={() => setIsRadioPlaying(false)}
        onPlay={() => setIsRadioPlaying(true)}
      />

      {/* Cabecera minimalista */}
      <header className="yd-topnav">
        <div className="yd-left">
          <button type="button" className="yd-back-btn" onClick={() => navigate('/misenal1')}>
            <ArrowLeft size={14} />
            <span>Mi Señal</span>
          </button>
          <div className="yd-divider" />
          <YouAppOfficialLogo theme="dark" size="sm" />
          <span className="yd-dial-tag">YOU DIAL</span>
        </div>

        <div className="yd-right">
          <button
            type="button"
            className="yd-back-btn"
            onClick={() => navigate('/my-lists')}
            title="Mis Listas"
          >
            <span>Mis Listas</span>
          </button>
          <button
            type="button"
            className="yd-back-btn"
            onClick={() => navigate('/search')}
            title="Buscar en YOUAPP"
            aria-label="Buscar"
            style={{ padding: '6px 9px' }}
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            className="yd-open-btn"
            onClick={() => navigate(current.openRoute)}
          >
            <span>Abrir estación</span>
            <ExternalLink size={12} />
          </button>
          <TvUserSessionMenu />
        </div>
      </header>

      {/* Escenario vivo (soporta swipe táctil izquierda / derecha) */}
      <main
        className="yd-stage-wrap"
        onTouchStart={(e) => {
          touchStartXRef.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const startX = touchStartXRef.current;
          touchStartXRef.current = null;
          if (startX === null) return;
          const endX = e.changedTouches[0]?.clientX ?? startX;
          const dx = endX - startX;
          if (Math.abs(dx) > 48) {
            stepStation(dx < 0 ? 1 : -1);
          }
        }}
      >
        <div className="yd-station-banner">
          <div className="yd-freq-badge" style={{ background: current.accent }}>
            <span>CH {current.dialNumber}</span>
            <span>·</span>
            <span>{current.bandLabel}</span>
          </div>
          <h1>{current.name}</h1>
          <p>{current.subtitle}</p>
        </div>

        <div className="yd-screen">
          {/* MODO TV */}
          {current.kind === 'tv' && current.videoId && (
            <div className="yd-video-box">
              <YouAppPlayer
                key={current.id}
                item={{
                  blockId: current.id,
                  provider: 'youtube',
                  providerContentId: current.videoId,
                  playbackUrl: `https://www.youtube.com/watch?v=${current.videoId}`,
                  title: current.videoTitle || current.name,
                  durationSec: 600,
                  autoplay: true,
                  muted: false
                }}
              />
            </div>
          )}

          {/* MODO RADIO */}
          {current.kind === 'radio' && (
            <div className="yd-radio-box">
              <button
                type="button"
                className={`yd-radio-play ${isRadioPlaying ? 'playing' : ''}`}
                onClick={toggleRadio}
                aria-label={isRadioPlaying ? 'Pausar radio' : 'Escuchar radio'}
              >
                {isRadioPlaying ? <Pause size={34} /> : <Play size={34} />}
              </button>
              <div className="yd-radio-status">
                <Radio size={15} />
                <span>{isRadioPlaying ? 'SINTONIZADO EN VIVO' : 'TOCÁ PLAY PARA ESCUCHAR'}</span>
              </div>
              {current.originUrl && (
                <a
                  href={current.originUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="yd-radio-origin"
                >
                  Sitio oficial <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {/* MODO NOTICIAS */}
          {current.kind === 'news' && (
            <div className="yd-news-box">
              {headlines.length === 0 ? (
                <div className="yd-center-msg">Sintonizando titulares en vivo de Argentina…</div>
              ) : (
                <div className="yd-news-grid">
                  {headlines.map((h, i) => (
                    <a
                      key={i}
                      href={h.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="yd-news-card"
                    >
                      <span className="yd-news-outlet">{h.outlet}</span>
                      <strong>{h.title}</strong>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MODO DATOS */}
          {current.kind === 'data' && (
            <div className="yd-data-box">
              <div className="yd-data-weather">
                <CloudSun size={30} color="#2997ff" />
                <div>
                  <span className="yd-data-lbl">CLIMA · {liveData?.cityLabel || 'Córdoba'}</span>
                  <strong>{liveData?.tempC !== null && liveData?.tempC !== undefined ? `${liveData.tempC}°C` : '—'}</strong>
                  <small>{liveData?.weatherLabel || 'Actualizando…'}</small>
                </div>
              </div>
              <div className="yd-data-dollars">
                {(liveData?.dollars || []).map((d) => (
                  <div key={d.casa} className="yd-dollar-tile">
                    <span>Dólar {d.nombre}</span>
                    <strong>${Math.round(d.venta).toLocaleString('es-AR')}</strong>
                    <small>Compra ${Math.round(d.compra).toLocaleString('es-AR')}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DIAL UNIVERSAL ESTILO APPLE / BRAUN */}
      <footer className="yd-dial-dock" aria-label="Dial universal de estaciones">
        <button
          type="button"
          className="yd-step-btn"
          onClick={() => stepStation(-1)}
          aria-label="Estación anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="yd-dial-track">
          {stations.map((st, idx) => {
            const active = idx === activeIdx;
            return (
              <button
                key={st.id}
                type="button"
                className={`yd-dial-tick ${active ? 'active' : ''}`}
                onClick={() => setActiveIdx(idx)}
              >
                <span className="yd-tick-num">{st.dialNumber}</span>
                <span className="yd-tick-ico">
                  {st.kind === 'tv' ? (
                    <Tv size={12} />
                  ) : st.kind === 'radio' ? (
                    <Radio size={12} />
                  ) : st.kind === 'news' ? (
                    <Newspaper size={12} />
                  ) : (
                    <CloudSun size={12} />
                  )}
                </span>
                <span className="yd-tick-name">{st.name}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="yd-step-btn"
          onClick={() => stepStation(1)}
          aria-label="Siguiente estación"
        >
          <ChevronRight size={20} />
        </button>
      </footer>

      <style>{`
        .yd-page {
          min-height: 100dvh;
          background: radial-gradient(circle at 50% 0%, #1a2130 0%, #090b10 72%);
          color: #f5f5f7;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
          display: flex;
          flex-direction: column;
        }
        .yd-topnav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(12, 15, 22, 0.72);
          backdrop-filter: blur(18px);
        }
        .yd-left, .yd-right { display: flex; align-items: center; gap: 10px; }
        .yd-divider { width: 1px; height: 18px; background: rgba(255, 255, 255, 0.14); }
        .yd-dial-tag {
          padding: 3px 9px;
          border-radius: 999px;
          background: rgba(41, 151, 255, 0.18);
          color: #2997ff;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.06em;
        }
        .yd-back-btn, .yd-open-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .yd-open-btn { background: #0071e3; border-color: #0071e3; }
        .yd-stage-wrap {
          flex: 1;
          max-width: 1020px;
          width: 100%;
          margin: 0 auto;
          padding: 18px 18px 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-sizing: border-box;
        }
        .yd-station-banner {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .yd-freq-badge {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 999px;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.04em;
        }
        .yd-station-banner h1 {
          margin: 2px 0 0;
          font-size: 22px;
          font-weight: 750;
          letter-spacing: -0.025em;
        }
        .yd-station-banner p {
          margin: 0;
          font-size: 13px;
          color: #aeaeb2;
        }
        .yd-screen {
          width: 100%;
          min-height: 360px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .yd-video-box {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
        }
        .yd-radio-box {
          flex: 1;
          min-height: 340px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 28px;
        }
        .yd-radio-play {
          width: 92px;
          height: 92px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 12px 34px rgba(0, 113, 227, 0.45);
        }
        .yd-radio-play.playing {
          background: #16a34a;
          box-shadow: 0 12px 34px rgba(22, 163, 74, 0.45);
        }
        .yd-radio-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #2997ff;
        }
        .yd-radio-origin {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #aeaeb2;
          font-size: 12.5px;
          text-decoration: none;
        }
        .yd-news-box { padding: 16px; flex: 1; }
        .yd-center-msg { padding: 60px 20px; text-align: center; color: #aeaeb2; }
        .yd-news-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 10px;
        }
        .yd-news-card {
          padding: 13px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .yd-news-card:hover { background: rgba(255, 255, 255, 0.12); }
        .yd-news-outlet {
          font-size: 10.5px;
          font-weight: 750;
          color: #2997ff;
          text-transform: uppercase;
        }
        .yd-news-card strong { font-size: 13.5px; line-height: 1.35; }
        .yd-data-box {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
          justify-content: center;
        }
        .yd-data-weather {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          border-radius: 18px;
          background: rgba(41, 151, 255, 0.12);
          border: 1px solid rgba(41, 151, 255, 0.25);
        }
        .yd-data-lbl { display: block; font-size: 10.5px; font-weight: 700; color: #aeaeb2; }
        .yd-data-weather strong { font-size: 32px; font-weight: 800; margin-right: 10px; }
        .yd-data-weather small { font-size: 13px; color: #2997ff; font-weight: 600; }
        .yd-data-dollars {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
        }
        .yd-dollar-tile {
          padding: 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .yd-dollar-tile span { display: block; font-size: 11px; color: #aeaeb2; }
        .yd-dollar-tile strong {
          display: block;
          font-size: 24px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          margin: 2px 0;
        }
        .yd-dollar-tile small { font-size: 11px; color: #8e8e93; }
        .yd-dial-dock {
          position: sticky;
          bottom: 0;
          z-index: 30;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px 16px;
          background: rgba(12, 15, 22, 0.9);
          backdrop-filter: blur(22px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .yd-step-btn {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .yd-dial-track {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          padding: 2px 0;
        }
        .yd-dial-track::-webkit-scrollbar { display: none; }
        .yd-dial-tick {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #aeaeb2;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
          transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
        }
        .yd-dial-tick.active {
          background: #ffffff;
          color: #1d1d1f;
          border-color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
        }
        .yd-tick-num {
          font-variant-numeric: tabular-nums;
          font-size: 11px;
          font-weight: 800;
          color: #2997ff;
        }
        .yd-dial-tick.active .yd-tick-num { color: #0071e3; }
        .yd-tick-ico { display: inline-flex; }
        .yd-tick-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}
