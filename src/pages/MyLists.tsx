import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Clock,
  Heart,
  Tv,
  Play,
  Search,
  Radio,
  Music,
  Film,
  Bookmark,
  Trash2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { type UniversalChannel } from '../lib/universalChannels';
import { useStore } from '../store/useStore';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { loadYouReelsWorkspace } from '../lib/tv/youReelsStore';
import { loadSocialGraph } from '../lib/tv/youappSocialStore';
import { loadYouMusicWorkspace } from '../lib/tv/youMusicPlaylistStore';
import { loadLecturasWorkspace } from '../lib/tv/youLecturasStore';
import { loadMiTvWorkspace } from '../lib/tv/miTvStore';
import { useSignalStore } from '../lib/tv/signalStore';
import { listSwitchableSignals, type UserSignalSummary } from '../lib/tv/associationsService';
import { loadCloudBranding } from '../lib/tv/signalPersistence';
import {
  CompleteSignalShareCard,
  type CompleteSignalVisualData
} from '../components/tv/CompleteSignalShareCard';

type SignalBrandingEntry = {
  avatarDataUrl?: string;
  coverDataUrl?: string;
};

function readLocalSignalBranding(): Record<string, SignalBrandingEntry> {
  try {
    const raw = localStorage.getItem('youapp_signal_branding_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

type SavedMomentEntry = {
  id: string;
  contentId: string;
  providerId?: string;
  title: string;
  channelTitle: string;
  startSec: number;
  shareUrl?: string;
  savedAt: string;
};

function readSavedMoments(): SavedMomentEntry[] {
  try {
    const raw = localStorage.getItem('youapp_saved_moments_v1');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function MyLists() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'listas' | 'guardados' | 'momentos'>('listas');
  const [savedChannels, setSavedChannels] = useState<UniversalChannel[]>([]);
  const [userSignals, setUserSignals] = useState<UserSignalSummary[]>([]);
  const [signalBranding, setSignalBranding] = useState<Record<string, SignalBrandingEntry>>(() =>
    readLocalSignalBranding()
  );
  const [savedMoments, setSavedMoments] = useState<SavedMomentEntry[]>(() => readSavedMoments());
  const { savedContent, unsaveContent } = useStore();
  const activeSignal = useSignalStore((s) => s.activeSignal);

  const reelsWorkspace = loadYouReelsWorkspace();
  const totalReelsCount = reelsWorkspace.collections.reduce((acc, col) => acc + col.items.length, 0);
  const socialGraph = loadSocialGraph();
  const totalLikesCount = socialGraph.likedVideoKeys.length;
  const musicWorkspace = useMemo(() => loadYouMusicWorkspace(), []);
  const lecturasWorkspace = useMemo(() => loadLecturasWorkspace(), []);
  const mitvWorkspace = useMemo(() => loadMiTvWorkspace(), []);

  const completeSignalVisualData = useMemo<CompleteSignalVisualData>(() => {
    const primarySignalId = activeSignal?.id || userSignals[0]?.id || 'justicia-social-signal-1';
    const primarySignalName = activeSignal?.name || userSignals[0]?.name || 'Mi Señal YOUAPP';
    const primaryBranding = signalBranding[primarySignalId] || {};

    const channelThumbs: Array<{ title: string; thumb: string }> = [];
    const seenThumbs = new Set<string>();
    const pushChannelThumb = (title: string, thumb?: string) => {
      const clean = String(thumb || '').trim();
      if (!clean || seenThumbs.has(clean)) return;
      seenThumbs.add(clean);
      channelThumbs.push({ title, thumb: clean });
    };

    for (const sig of userSignals) {
      const b = signalBranding[sig.id];
      pushChannelThumb(sig.name, b?.coverDataUrl || b?.avatarDataUrl);
    }
    for (const blk of activeSignal?.schedule || []) {
      const ci = blk?.contentItem as any;
      const thumb =
        ci?.thumbnail ||
        ci?.thumbnailUrl ||
        (ci?.providerId && /^[A-Za-z0-9_-]{11}$/.test(ci.providerId)
          ? `https://i.ytimg.com/vi/${ci.providerId}/hqdefault.jpg`
          : '');
      pushChannelThumb(ci?.title || activeSignal?.name || 'Canal', thumb);
    }
    for (const ch of savedChannels) {
      const chAny = ch as any;
      pushChannelThumb(ch.name, chAny.coverUrl || chAny.thumbnail || ch.logo);
    }

    const allMiTvItems = (mitvWorkspace.channels || []).flatMap((ch) =>
      (ch.items || []).map((it) => ({
        title: it.title || ch.name || 'MiTV',
        thumb:
          it.thumbnailUrl ||
          (it.liveVideoId && /^[A-Za-z0-9_-]{11}$/.test(it.liveVideoId)
            ? `https://i.ytimg.com/vi/${it.liveVideoId}/hqdefault.jpg`
            : it.providerId && /^[A-Za-z0-9_-]{11}$/.test(it.providerId)
              ? `https://i.ytimg.com/vi/${it.providerId}/hqdefault.jpg`
              : '')
      }))
    );
    const mitvThumbs = allMiTvItems.filter((it) => Boolean(it.thumb));

    const allMusicItems = musicWorkspace.playlists.flatMap((pl) => pl.items || []);
    const musicThumbs = allMusicItems
      .map((it) => ({
        title: it.title || it.author || 'Música',
        thumb:
          it.thumbnailUrl ||
          (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '')
      }))
      .filter((it) => Boolean(it.thumb));

    const lecturas = (lecturasWorkspace.items || []).map((it) => ({
      title: it.title || it.sourceName || it.domain,
      source: it.sourceName || it.domain || 'Lectura',
      thumb: it.thumbnailUrl || it.faviconUrl || ''
    }));

    const reelThumbs = reelsWorkspace.collections
      .flatMap((col) => col.items || [])
      .map((it: any) => ({
        title: it.title || 'Reel',
        thumb:
          it.thumbnailUrl ||
          it.thumbnail ||
          (it.providerId && /^[A-Za-z0-9_-]{11}$/.test(it.providerId)
            ? `https://i.ytimg.com/vi/${it.providerId}/hqdefault.jpg`
            : '')
      }))
      .filter((it) => Boolean(it.thumb));

    const savedThumbs = savedContent
      .map((it) => ({
        title: it.title || 'Video guardado',
        thumb: it.thumbnail || ''
      }))
      .filter((it) => Boolean(it.thumb));

    return {
      signalId: primarySignalId,
      signalName: primarySignalName,
      avatarUrl: primaryBranding.avatarDataUrl,
      heroCoverUrl: primaryBranding.coverDataUrl || channelThumbs[0]?.thumb,
      channelThumbs,
      mitvThumbs,
      mitvChannelsCount: (mitvWorkspace.channels || []).length,
      mitvItemsCount: allMiTvItems.length,
      musicThumbs,
      musicCount: allMusicItems.length,
      lecturas,
      lecturasCount: lecturas.length,
      reelsAndSavedThumbs: [...reelThumbs, ...savedThumbs],
      reelsAndSavedCount: totalReelsCount + savedContent.length,
      signalsCount: Math.max(userSignals.length, savedChannels.length, activeSignal ? 1 : 0)
    };
  }, [
    activeSignal,
    userSignals,
    signalBranding,
    savedChannels,
    musicWorkspace,
    lecturasWorkspace,
    mitvWorkspace,
    reelsWorkspace,
    savedContent,
    totalReelsCount
  ]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('youapp_saved_custom_channels');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSavedChannels(parsed);
      }
    } catch {
      // ignore storage errors
    }

    let active = true;
    void listSwitchableSignals()
      .then((list) => {
        if (active && Array.isArray(list)) setUserSignals(list);
      })
      .catch(() => {});

    void loadCloudBranding()
      .then((cloudMap) => {
        if (!active || !cloudMap || Object.keys(cloudMap).length === 0) return;
        setSignalBranding((prev) => ({ ...cloudMap, ...prev }));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handlePlayChannel = (channel: UniversalChannel) => {
    localStorage.setItem('youapp_tune_channel_payload', JSON.stringify(channel));
    localStorage.setItem('youapp_active_channel_id', channel.id);
    navigate('/live');
  };

  const handleDeleteMoment = (id: string) => {
    const next = savedMoments.filter((m) => m.id !== id);
    setSavedMoments(next);
    try {
      localStorage.setItem('youapp_saved_moments_v1', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  return (
    <div className="ml-page">
      <div className="ml-stage-bg" aria-hidden="true" />
      <div className="ml-stage-veil" aria-hidden="true" />

      {/* BARRA SUPERIOR UNIFICADA EN MAYÚSCULAS */}
      <header className="ml-topbar">
        <div className="ml-topbar-left">
          <button type="button" className="ml-logo-btn" onClick={() => navigate('/')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="ml-brand-pill">MIS LISTAS</span>
        </div>

        <nav className="ml-nav">
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/misenal1')}>MI SEÑAL</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/mitv')}>MITV</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/youmusic')}>YOU MUSIC</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/reels')}>REELS</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/lecturas')}>LECTURAS</button>
          <button type="button" className="ml-nav-btn" onClick={() => navigate('/dial')}>YOU DIAL</button>
          <button type="button" className="ml-nav-btn active" onClick={() => navigate('/my-lists')}>MIS LISTAS</button>
          <button
            type="button"
            className="ml-nav-btn"
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

      <main className="ml-main">
        {/* ENCABEZADO + ACCIÓN */}
        <section className="ml-hero">
          <div className="ml-hero-text">
            <h1>Mis Listas</h1>
            <p>Tus señales, colecciones, videos guardados y momentos clave en un solo lugar.</p>
          </div>
          <button type="button" className="ml-cta-btn" onClick={() => navigate('/create-signal')}>
            <Plus size={15} />
            <span>Nueva señal</span>
          </button>
        </section>

        {/* SEÑAL COMPLETA VISUAL COMPACTA PARA COMPARTIR */}
        <CompleteSignalShareCard data={completeSignalVisualData} />

        {/* PESTAÑAS */}
        <div className="ml-tabs" role="tablist" aria-label="Secciones de Mis Listas">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'listas'}
            className={`ml-tab ${activeTab === 'listas' ? 'active' : ''}`}
            onClick={() => setActiveTab('listas')}
          >
            Mis Listas y Señales
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'guardados'}
            className={`ml-tab ${activeTab === 'guardados' ? 'active' : ''}`}
            onClick={() => setActiveTab('guardados')}
          >
            Guardados ({savedContent.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'momentos'}
            className={`ml-tab ${activeTab === 'momentos' ? 'active' : ''}`}
            onClick={() => setActiveTab('momentos')}
          >
            Momentos ({savedMoments.length})
          </button>
        </div>

        {/* TAB 1: MIS LISTAS Y SEÑALES */}
        {activeTab === 'listas' && (
          <div className="ml-sections">
            <section className="ml-glass-card">
              <div className="ml-section-head">
                <h2>Tus espacios en YOUAPP</h2>
              </div>
              <div className="ml-grid">
                <button type="button" className="ml-row-card" onClick={() => navigate('/misenal1')}>
                  <div className="ml-icon-box blue">
                    <Radio size={20} />
                  </div>
                  <div className="ml-row-info">
                    <strong>Mi Señal</strong>
                    <span>Tu canal propio en vivo y programación</span>
                  </div>
                  <ChevronRight size={17} className="ml-chev" />
                </button>

                <button type="button" className="ml-row-card" onClick={() => navigate('/mitv')}>
                  <div className="ml-icon-box cyan">
                    <Tv size={20} />
                  </div>
                  <div className="ml-row-info">
                    <strong>MITV</strong>
                    <span>Tus grillas y canales de TV personalizados</span>
                  </div>
                  <ChevronRight size={17} className="ml-chev" />
                </button>

                <button type="button" className="ml-row-card" onClick={() => navigate('/youmusic')}>
                  <div className="ml-icon-box purple">
                    <Music size={20} />
                  </div>
                  <div className="ml-row-info">
                    <strong>YOU MUSIC</strong>
                    <span>Tus listas y señales musicales</span>
                  </div>
                  <ChevronRight size={17} className="ml-chev" />
                </button>

                <button type="button" className="ml-row-card" onClick={() => navigate('/reels')}>
                  <div className="ml-icon-box pink">
                    <Film size={20} />
                  </div>
                  <div className="ml-row-info">
                    <strong>Colecciones de Reels</strong>
                    <span>
                      {reelsWorkspace.collections.length}{' '}
                      {reelsWorkspace.collections.length === 1 ? 'colección' : 'colecciones'} · {totalReelsCount} guardados
                    </span>
                  </div>
                  <ChevronRight size={17} className="ml-chev" />
                </button>

                <button type="button" className="ml-row-card" onClick={() => setActiveTab('guardados')}>
                  <div className="ml-icon-box red">
                    <Heart size={20} />
                  </div>
                  <div className="ml-row-info">
                    <strong>Favoritos y Guardados</strong>
                    <span>
                      {savedContent.length} guardados · {totalLikesCount} me gusta
                    </span>
                  </div>
                  <ChevronRight size={17} className="ml-chev" />
                </button>

                <button type="button" className="ml-row-card" onClick={() => setActiveTab('momentos')}>
                  <div className="ml-icon-box amber">
                    <Clock size={20} />
                  </div>
                  <div className="ml-row-info">
                    <strong>Momentos clave</strong>
                    <span>{savedMoments.length} fragmentos guardados al segundo</span>
                  </div>
                  <ChevronRight size={17} className="ml-chev" />
                </button>
              </div>
            </section>

            {userSignals.length > 0 && (
              <section className="ml-glass-card">
                <div className="ml-section-head">
                  <h2>Mis señales ({userSignals.length})</h2>
                </div>
                <div className="ml-grid">
                  {userSignals.map((sig) => {
                    const branding = signalBranding[sig.id] || {};
                    const coverSrc = branding.coverDataUrl || branding.avatarDataUrl || '';
                    return (
                      <button
                        key={sig.id}
                        type="button"
                        className={`ml-row-card ${coverSrc ? 'has-cover' : ''}`}
                        onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
                      >
                        {coverSrc ? (
                          <div className="ml-signal-cover-banner">
                            <img src={coverSrc} alt={`Portada de ${sig.name}`} loading="lazy" />
                            <div className="ml-signal-cover-scrim" />
                            <div className="ml-signal-cover-footer">
                              <div className="ml-row-info">
                                <strong>{sig.name}</strong>
                                <span>Abrir señal</span>
                              </div>
                              <span className="ml-play-circle">
                                <Play size={14} fill="#ffffff" color="#ffffff" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="ml-icon-box blue">
                              <Radio size={20} />
                            </div>
                            <div className="ml-row-info">
                              <strong>{sig.name}</strong>
                              <span>Señal en Mi Señal</span>
                            </div>
                            <span className="ml-play-circle">
                              <Play size={14} fill="#ffffff" color="#ffffff" />
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {savedChannels.length > 0 && (
              <section className="ml-glass-card">
                <div className="ml-section-head">
                  <h2>Tus señales creadas ({savedChannels.length})</h2>
                </div>
                <div className="ml-grid">
                  {savedChannels.map((channel) => {
                    const chAny = channel as any;
                    const branding = signalBranding[channel.id] || {};
                    const coverSrc =
                      branding.coverDataUrl ||
                      branding.avatarDataUrl ||
                      chAny.coverUrl ||
                      chAny.bannerUrl ||
                      chAny.thumbnail ||
                      channel.logo ||
                      '';
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={`ml-row-card ${coverSrc ? 'has-cover' : ''}`}
                        onClick={() => handlePlayChannel(channel)}
                      >
                        {coverSrc ? (
                          <div className="ml-signal-cover-banner">
                            <img src={coverSrc} alt={`Portada de ${channel.name}`} loading="lazy" />
                            <div className="ml-signal-cover-scrim" />
                            <div className="ml-signal-cover-footer">
                              <div className="ml-row-info">
                                <strong>{channel.name}</strong>
                                <span>Señal personalizada</span>
                              </div>
                              <span className="ml-play-circle">
                                <Play size={14} fill="#ffffff" color="#ffffff" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="ml-icon-box purple">
                              <Tv size={20} />
                            </div>
                            <div className="ml-row-info">
                              <strong>{channel.name}</strong>
                              <span>Señal personalizada</span>
                            </div>
                            <span className="ml-play-circle">
                              <Play size={14} fill="#ffffff" color="#ffffff" />
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: VIDEOS GUARDADOS */}
        {activeTab === 'guardados' && (
          <section className="ml-glass-card">
            <div className="ml-section-head">
              <h2>Videos guardados ({savedContent.length})</h2>
            </div>

            {savedContent.length === 0 ? (
              <div className="ml-empty">
                <Bookmark size={28} />
                <p>Todavía no guardaste videos. Podés buscar y guardar desde Buscar o Mi Señal.</p>
                <button type="button" className="ml-cta-btn" onClick={() => navigate('/search')}>
                  <Search size={14} /> Ir a Buscar
                </button>
              </div>
            ) : (
              <div className="ml-saved-list">
                {savedContent.map((item) => (
                  <div key={item.id} className="ml-saved-row">
                    {item.thumbnail && (
                      <img src={item.thumbnail} alt={item.title} className="ml-saved-thumb" loading="lazy" />
                    )}
                    <div className="ml-row-info">
                      <strong>{item.title}</strong>
                      <span>{item.channelTitle || 'YouTube'}</span>
                    </div>
                    <div className="ml-row-actions">
                      <button
                        type="button"
                        className="ml-icon-action"
                        title="Sumar a Mi Señal"
                        onClick={() =>
                          navigate(
                            `/misenal1?add=${encodeURIComponent(`https://www.youtube.com/watch?v=${item.providerId || item.id}`)}&t=${encodeURIComponent(item.title)}`
                          )
                        }
                      >
                        <Play size={14} />
                      </button>
                      <button
                        type="button"
                        className="ml-icon-action danger"
                        title="Quitar de guardados"
                        onClick={() => unsaveContent(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: MOMENTOS GUARDADOS */}
        {activeTab === 'momentos' && (
          <section className="ml-glass-card">
            <div className="ml-section-head">
              <h2>Momentos guardados ({savedMoments.length})</h2>
            </div>

            {savedMoments.length === 0 ? (
              <div className="ml-empty">
                <Clock size={28} />
                <p>Todavía no guardaste momentos. Usá el botón «Momentos» en la Barra Inteligente mientras mirás un video.</p>
              </div>
            ) : (
              <div className="ml-saved-list">
                {savedMoments.map((m) => {
                  const watchUrl =
                    m.shareUrl ||
                    `https://www.youtube.com/watch?v=${m.providerId || m.contentId}&t=${Math.floor(m.startSec)}s`;
                  return (
                    <div key={m.id} className="ml-saved-row">
                      <div className="ml-time-badge">{formatSec(m.startSec)}</div>
                      <div className="ml-row-info">
                        <strong>{m.title}</strong>
                        <span>{m.channelTitle}</span>
                      </div>
                      <div className="ml-row-actions">
                        <a
                          href={watchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-icon-action"
                          title="Abrir momento en YouTube"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          type="button"
                          className="ml-icon-action danger"
                          title="Eliminar momento"
                          onClick={() => handleDeleteMoment(m.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      <style>{`
        .ml-page {
          position: relative;
          min-height: 100dvh;
          background-color: #14161a;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          padding-bottom: 64px;
          overflow-x: clip;
          isolation: isolate;
        }
        .ml-stage-bg {
          position: fixed;
          inset: -16px;
          z-index: 0;
          background-color: #18140d;
          background-image: url('/my-lists-autumn-lake-bg.png');
          background-size: cover;
          background-position: center;
          filter: blur(10px) brightness(0.8) contrast(1.06);
          transform: scale(1.04) translateZ(0);
          pointer-events: none;
        }
        .ml-stage-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            rgba(18, 14, 8, 0.2) 0%,
            rgba(16, 14, 10, 0.16) 50%,
            rgba(12, 10, 8, 0.42) 100%
          );
          pointer-events: none;
        }
        .ml-topbar,
        .ml-main {
          position: relative;
          z-index: 2;
        }
        .ml-topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 22px;
          background: rgba(24, 26, 30, 0.48);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ml-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .ml-logo-btn {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }
        .ml-brand-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.5);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .ml-nav {
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 6px;
          min-width: 0;
        }
        .ml-nav-btn {
          background: transparent;
          border: 1px solid transparent;
          color: rgba(245, 245, 247, 0.84);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ml-nav-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(100, 210, 255, 0.45);
          color: #ffffff;
        }

        .ml-main {
          max-width: 1040px;
          margin: 0 auto;
          padding: 28px 24px 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .ml-hero {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }
        .ml-hero-text h1 {
          margin: 0 0 6px;
          font-family: var(--you-font-display, 'Space Grotesk', sans-serif);
          font-size: clamp(28px, 4vw, 38px);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #ffffff;
        }
        .ml-hero-text p {
          margin: 0;
          font-size: 14px;
          color: rgba(245, 245, 247, 0.78);
        }
        .ml-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 18px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.6);
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0, 113, 227, 0.36);
        }
        .ml-cta-btn:hover {
          background: #0a84ff;
        }

        .ml-tabs {
          display: inline-flex;
          flex-wrap: wrap;
          align-self: flex-start;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .ml-tab {
          padding: 7px 16px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .ml-tab.active,
        .ml-tab:hover {
          background: #0071e3;
          color: #ffffff;
        }

        .ml-sections {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .ml-glass-card {
          position: relative;
          border-radius: 24px;
          padding: 22px 24px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.12) 0%,
            rgba(255, 255, 255, 0.04) 55%,
            rgba(255, 255, 255, 0.08) 100%
          );
          backdrop-filter: blur(22px) saturate(140%);
          -webkit-backdrop-filter: blur(22px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.48),
            0 16px 40px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow: hidden;
        }
        .ml-glass-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 2px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.9) 0%,
            rgba(255, 255, 255, 0.35) 20%,
            rgba(255, 255, 255, 0.12) 50%,
            rgba(255, 255, 255, 0.35) 80%,
            rgba(255, 255, 255, 0.9) 100%
          );
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .ml-glass-card > * {
          position: relative;
          z-index: 1;
        }
        .ml-section-head h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.9);
        }

        .ml-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 12px;
        }
        .ml-row-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
          transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
        }
        .ml-row-card:hover {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(100, 210, 255, 0.5);
          transform: translateY(-1px);
        }
        .ml-row-card.has-cover {
          padding: 0;
          overflow: hidden;
          min-height: 118px;
          position: relative;
        }
        .ml-signal-cover-banner {
          position: relative;
          width: 100%;
          height: 118px;
          display: flex;
          align-items: flex-end;
        }
        .ml-signal-cover-banner > img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.25s ease;
        }
        .ml-row-card.has-cover:hover .ml-signal-cover-banner > img {
          transform: scale(1.04);
        }
        .ml-signal-cover-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(8, 10, 14, 0.12) 0%,
            rgba(8, 10, 14, 0.45) 45%,
            rgba(8, 10, 14, 0.88) 100%
          );
        }
        .ml-signal-cover-footer {
          position: relative;
          z-index: 1;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
        }
        .ml-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ml-icon-box.blue { background: rgba(0, 113, 227, 0.25); color: #7dd3fc; }
        .ml-icon-box.cyan { background: rgba(6, 182, 212, 0.24); color: #67e8f9; }
        .ml-icon-box.purple { background: rgba(139, 92, 246, 0.25); color: #c4b5fd; }
        .ml-icon-box.pink { background: rgba(236, 72, 153, 0.24); color: #f9a8d4; }
        .ml-icon-box.red { background: rgba(239, 68, 68, 0.24); color: #fca5a5; }
        .ml-icon-box.amber { background: rgba(245, 158, 11, 0.24); color: #fcd34d; }

        .ml-row-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .ml-row-info strong {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ml-row-info span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ml-chev {
          color: rgba(255, 255, 255, 0.55);
          flex-shrink: 0;
        }
        .ml-play-circle {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #0071e3;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .ml-saved-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ml-saved-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ml-saved-thumb {
          width: 76px;
          aspect-ratio: 16 / 9;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .ml-time-badge {
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #d8f3ff;
          font-size: 12px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .ml-row-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ml-icon-action {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          text-decoration: none;
        }
        .ml-icon-action:hover {
          background: #0071e3;
          border-color: #64d2ff;
        }
        .ml-icon-action.danger:hover {
          background: rgba(239, 68, 68, 0.45);
          border-color: rgba(252, 165, 165, 0.7);
        }

        .ml-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 36px 16px;
          text-align: center;
          color: rgba(245, 245, 247, 0.76);
        }
        .ml-empty p {
          margin: 0;
          max-width: 420px;
          font-size: 13.5px;
        }

        @media (max-width: 960px) {
          .ml-topbar {
            padding: 10px 14px;
          }
          .ml-nav {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
