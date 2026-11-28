import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Radio, Search, Share2, Star, Tv } from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { AtlasBuildSignalBox } from '../components/tv/AtlasBuildSignalBox';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import {
  FAVORITE_SIGNALS_CHANGED_EVENT,
  SIGNALS_100_CATALOG,
  SIGNALS_100_THEMES,
  findSignal100ById,
  loadFavoriteSignalIds,
  toggleFavoriteSignalId,
  type Signal100ThemeId
} from '../lib/tv/signals100Catalog';
import { findCuratedSignalById } from '../lib/tv/curatedSignalsCatalog';
import { listSwitchableSignals, type UserSignalSummary } from '../lib/tv/associationsService';
import { useSignalStore } from '../lib/tv/signalStore';
import { loadCloudBranding } from '../lib/tv/signalPersistence';

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

export default function SignalsDirectoryPage() {
  const navigate = useNavigate();
  const activeSignal = useSignalStore((s) => s.activeSignal);
  const savedSignalsById = useSignalStore((s) => s.savedSignalsById);

  const [userSignals, setUserSignals] = useState<UserSignalSummary[]>([]);
  const [signalBranding, setSignalBranding] = useState<Record<string, SignalBrandingEntry>>(() =>
    readLocalSignalBranding()
  );
  const [themeFilter, setThemeFilter] = useState<'all' | 'favorites' | Signal100ThemeId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteSignalIds());

  useEffect(() => {
    const syncFavs = () => setFavoriteIds(loadFavoriteSignalIds());
    window.addEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
    return () => window.removeEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
  }, []);

  const favoriteSignals = useMemo(
    () =>
      favoriteIds
        .map((id) => SIGNALS_100_CATALOG.find((s) => s.id === id))
        .filter((s): s is (typeof SIGNALS_100_CATALOG)[number] => Boolean(s)),
    [favoriteIds]
  );

  useEffect(() => {
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

  const getOwnSignalThumb = (sig: UserSignalSummary): string => {
    const branding = signalBranding[sig.id] || signalBranding[sig.clientSignalId] || {};
    if (branding.coverDataUrl) return branding.coverDataUrl;
    if (branding.avatarDataUrl) return branding.avatarDataUrl;
    const stored =
      savedSignalsById?.[sig.id] ||
      savedSignalsById?.[sig.clientSignalId] ||
      (activeSignal && (activeSignal.id === sig.id || activeSignal.id === sig.clientSignalId)
        ? activeSignal
        : null);
    const firstItem = stored?.schedule?.[0]?.contentItem as
      | { thumbnailUrl?: string; thumbnail?: string; providerId?: string; id?: string }
      | undefined;
    if (firstItem?.thumbnailUrl) return firstItem.thumbnailUrl;
    if (firstItem?.thumbnail) return firstItem.thumbnail;
    const ytId = firstItem?.providerId || firstItem?.id || '';
    if (/^[A-Za-z0-9_-]{11}$/.test(ytId)) {
      return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    }
    const curated = findCuratedSignalById(sig.id) || findCuratedSignalById(sig.name);
    if (curated?.coverVideoId) return `https://i.ytimg.com/vi/${curated.coverVideoId}/hqdefault.jpg`;
    const cat100 = findSignal100ById(sig.id) || findSignal100ById(sig.name);
    if (cat100?.coverVideoId) return `https://i.ytimg.com/vi/${cat100.coverVideoId}/hqdefault.jpg`;
    return '';
  };

  const filteredSignals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SIGNALS_100_CATALOG.filter((s) => {
      if (themeFilter === 'favorites' && !favoriteIds.includes(s.id)) return false;
      if (themeFilter !== 'all' && themeFilter !== 'favorites' && s.theme !== themeFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.videos.some(
          (v) => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q)
        )
      );
    });
  }, [themeFilter, searchQuery, favoriteIds]);

  return (
    <div className="sd-page">
      <div className="sd-bg" aria-hidden="true" />
      <div className="sd-veil" aria-hidden="true" />

      <header className="sd-topbar">
        <div className="sd-topbar-left">
          <button
            type="button"
            className="sd-logo-btn"
            onClick={() => navigate('/')}
            title="Inicio YOUAPP TV"
          >
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="sd-brand-pill">SEÑALES</span>
        </div>

        <nav className="sd-nav" aria-label="Navegación principal">
          <button type="button" className="sd-nav-btn" onClick={() => navigate('/misenal1')}>
            MI SEÑAL
          </button>
          <button type="button" className="sd-nav-btn active" onClick={() => navigate('/senales')}>
            SEÑALES
          </button>
          <button type="button" className="sd-nav-btn" onClick={() => navigate('/mitv')}>
            MITV
          </button>
          <button type="button" className="sd-nav-btn" onClick={() => navigate('/youmusic')}>
            YOU MUSIC
          </button>
          <button type="button" className="sd-nav-btn" onClick={() => navigate('/lecturas')}>
            LECTURAS
          </button>
          <button type="button" className="sd-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button
            type="button"
            className="sd-nav-btn"
            onClick={() => navigate('/search')}
            aria-label="Buscar"
            style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 10px' }}
          >
            <Search size={15} />
          </button>
        </nav>

        <TvUserSessionMenu variant="glass" />
      </header>

      <main className="sd-main">
        {/* 1. PROTAGONISTA ARRIBA DE TODO: ARMÁ TU SEÑAL CON ATLAS */}
        <AtlasBuildSignalBox />

        {/* 1B. SEÑALES FAVORITAS FIJADAS */}
        {favoriteSignals.length > 0 && (
          <section className="sd-section" aria-label="Tus señales favoritas">
            <div className="sd-sec-head">
              <h2>⭐ Tus señales favoritas ({favoriteSignals.length})</h2>
              <span>Fijadas arriba para entrar en 1 toque</span>
            </div>
            <div className="sd-grid">
              {favoriteSignals.map((sig) => {
                const coverSrc = sig.coverVideoId
                  ? `https://i.ytimg.com/vi/${sig.coverVideoId}/hqdefault.jpg`
                  : '';
                return (
                  <div
                    key={`fav-${sig.id}`}
                    className="sd-card has-cover"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`);
                      }
                    }}
                  >
                    <div className="sd-card-cover">
                      {coverSrc && (
                        <img src={coverSrc} alt={sig.title} loading="lazy" referrerPolicy="no-referrer" />
                      )}
                      <div className="sd-card-scrim" />
                      <span className="sd-badge-left" style={{ borderColor: sig.accent }}>
                        <Radio size={11} color="#64d2ff" />
                        <span>Favorita</span>
                      </span>
                      <button
                        type="button"
                        className="sd-fav-btn is-fav"
                        aria-label={`Quitar ${sig.title} de favoritas`}
                        title="Quitar de favoritas"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavoriteIds(toggleFavoriteSignalId(sig.id).ids);
                        }}
                      >
                        <Star size={12} fill="#fbbf24" color="#fbbf24" />
                      </button>
                      <div className="sd-card-footer">
                        <div className="sd-card-info">
                          <strong>{sig.title}</strong>
                          <span>{sig.subtitle}</span>
                        </div>
                        <span className="sd-play-circle">
                          <Play size={13} fill="#fff" color="#fff" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. TUS SEÑALES PROPIAS (si tiene) */}
        {userSignals.length > 0 && (
          <section className="sd-section" aria-label="Tus señales propias">
            <div className="sd-sec-head">
              <h2>Tus señales ({userSignals.length})</h2>
              <span>Tocá para volver a tu señal en vivo</span>
            </div>
            <div className="sd-grid">
              {userSignals.map((sig) => {
                const coverSrc = getOwnSignalThumb(sig);
                return (
                  <button
                    key={sig.id}
                    type="button"
                    className={`sd-card ${coverSrc ? 'has-cover' : ''}`}
                    onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
                  >
                    {coverSrc ? (
                      <div className="sd-card-cover">
                        <img src={coverSrc} alt={sig.name} loading="lazy" referrerPolicy="no-referrer" />
                        <div className="sd-card-scrim" />
                        <span className="sd-badge-left">
                          <Radio size={11} color="#64d2ff" />
                          <span>Mi Señal</span>
                        </span>
                        <div className="sd-card-footer">
                          <div className="sd-card-info">
                            <strong>{sig.name}</strong>
                            <span>{sig.mainTopic || 'Tu señal personal'}</span>
                          </div>
                          <span className="sd-play-circle">
                            <Play size={13} fill="#fff" color="#fff" />
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="sd-card-plain">
                        <div className="sd-plain-ico">
                          <Tv size={18} />
                        </div>
                        <div className="sd-card-info">
                          <strong>{sig.name}</strong>
                          <span>Mi Señal</span>
                        </div>
                        <span className="sd-play-circle">
                          <Play size={13} fill="#fff" color="#fff" />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. CATÁLOGO DE 100 SEÑALES TEMÁTICAS */}
        <section className="sd-section" aria-label="100 Señales Temáticas">
          <div className="sd-sec-head">
            <h2>100 Señales Temáticas ({filteredSignals.length})</h2>
            <span>3 temáticas complementarias · 10 videos reales por señal</span>
          </div>

          <div className="sd-chips" role="tablist" aria-label="Filtrar por temática">
            <button
              type="button"
              role="tab"
              aria-selected={themeFilter === 'all'}
              className={`sd-chip ${themeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setThemeFilter('all')}
            >
              <span>Todas</span>
              <em>{SIGNALS_100_CATALOG.length}</em>
            </button>
            {favoriteIds.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={themeFilter === 'favorites'}
                className={`sd-chip ${themeFilter === 'favorites' ? 'active' : ''}`}
                onClick={() => setThemeFilter('favorites')}
              >
                <Star size={11} fill="#fbbf24" color="#fbbf24" />
                <span>Favoritas</span>
                <em>{favoriteSignals.length}</em>
              </button>
            )}
            {SIGNALS_100_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={themeFilter === t.id}
                className={`sd-chip ${themeFilter === t.id ? 'active' : ''}`}
                onClick={() => setThemeFilter(t.id)}
              >
                <span>{t.shortLabel}</span>
                <em>{t.count}</em>
              </button>
            ))}
          </div>

          <div className="sd-search">
            <Search size={14} color="rgba(245,245,247,0.58)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar entre las 100 señales (ej. Roma, Rock Nacional, Fútbol, Cocina…)"
              aria-label="Buscar señales"
            />
          </div>

          <div className="sd-grid">
            {filteredSignals.map((sig) => {
              const coverSrc = sig.coverVideoId
                ? `https://i.ytimg.com/vi/${sig.coverVideoId}/hqdefault.jpg`
                : '';
              const themeLabel =
                sig.theme === 'cultura'
                  ? 'Cultura & Saber'
                  : sig.theme === 'musica'
                    ? 'Música & Escena'
                    : 'Deportes & Mundo';
              const isFav = favoriteIds.includes(sig.id);
              return (
                <div
                  key={sig.id}
                  role="button"
                  tabIndex={0}
                  className="sd-card has-cover"
                  onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/misenal1?signal=${encodeURIComponent(sig.id)}`);
                    }
                  }}
                  title={`${sig.title} · ${sig.subtitle}`}
                >
                  <div className="sd-card-cover">
                    {coverSrc && (
                      <img src={coverSrc} alt={sig.title} loading="lazy" referrerPolicy="no-referrer" />
                    )}
                    <div className="sd-card-scrim" />
                    <span className="sd-badge-left" style={{ borderColor: sig.accent }}>
                      <Radio size={11} color="#64d2ff" />
                      <span>{themeLabel}</span>
                    </span>
                    <div className="sd-top-actions">
                      <button
                        type="button"
                        className="sd-fav-btn"
                        aria-label={`Compartir señal ${sig.title}`}
                        title="Compartir esta señal"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `${window.location.origin}/misenal1?signal=${encodeURIComponent(sig.id)}&sharedSignal=1`;
                          void shareContentUniversal({
                            title: `${sig.title} · Señal en YOUAPP`,
                            text: sig.subtitle,
                            url,
                            thumbnailUrl: coverSrc,
                            subtitle: `${sig.videos.length} videos · YOUAPP TV`,
                            badge: 'MI SEÑAL EN YOUAPP'
                          });
                        }}
                      >
                        <Share2 size={12} color="#ffffff" />
                      </button>
                      <button
                        type="button"
                        className={`sd-fav-btn ${isFav ? 'is-fav' : ''}`}
                        aria-label={isFav ? `Quitar ${sig.title} de favoritas` : `Fijar ${sig.title} en favoritas`}
                        title={isFav ? 'Quitar de favoritas' : 'Fijar en favoritas'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavoriteIds(toggleFavoriteSignalId(sig.id).ids);
                        }}
                      >
                        <Star size={12} fill={isFav ? '#fbbf24' : 'none'} color={isFav ? '#fbbf24' : '#ffffff'} />
                      </button>
                    </div>
                    <div className="sd-card-footer">
                      <div className="sd-card-info">
                        <strong>{sig.title}</strong>
                        <span>{sig.subtitle}</span>
                      </div>
                      <span className="sd-play-circle">
                        <Play size={13} fill="#fff" color="#fff" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <style>{`
        .sd-page {
          position: relative;
          min-height: 100dvh;
          background: #0d111a;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          padding-bottom: 64px;
          overflow-x: clip;
        }
        .sd-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: radial-gradient(circle at 18% 12%, rgba(0, 113, 227, 0.28), transparent 45%),
            radial-gradient(circle at 82% 24%, rgba(16, 185, 129, 0.16), transparent 42%),
            #0b0f18;
          pointer-events: none;
        }
        .sd-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(180deg, rgba(10, 14, 24, 0.25) 0%, rgba(10, 14, 24, 0.72) 100%);
          pointer-events: none;
        }
        .sd-topbar,
        .sd-main {
          position: relative;
          z-index: 2;
        }
        .sd-topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 22px;
          background: rgba(16, 20, 30, 0.65);
          backdrop-filter: saturate(180%) blur(22px);
          -webkit-backdrop-filter: saturate(180%) blur(22px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .sd-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .sd-logo-btn {
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }
        .sd-brand-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .sd-nav {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sd-nav-btn {
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
        }
        .sd-nav-btn:hover,
        .sd-nav-btn.active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(100, 210, 255, 0.45);
          color: #ffffff;
        }
        .sd-main {
          max-width: 1060px;
          margin: 0 auto;
          padding: 16px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .sd-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sd-sec-head h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 760;
          color: #ffffff;
        }
        .sd-sec-head span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.7);
        }
        .sd-chips {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 2px;
        }
        .sd-chips::-webkit-scrollbar {
          display: none;
        }
        .sd-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.88);
          font-size: 12px;
          font-weight: 650;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
        }
        .sd-chip em {
          font-style: normal;
          font-size: 10.5px;
          opacity: 0.75;
        }
        .sd-chip.active {
          background: #ffffff;
          border-color: #ffffff;
          color: #111827;
        }
        .sd-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .sd-search input {
          flex: 1;
          min-width: 0;
          border: 0;
          background: transparent;
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .sd-search input::placeholder {
          color: rgba(245, 245, 247, 0.55);
        }
        .sd-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
          gap: 12px;
        }
        .sd-card {
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 16px;
          overflow: hidden;
          background: rgba(20, 26, 38, 0.62);
          cursor: pointer;
          text-align: left;
          color: #ffffff;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .sd-card:hover {
          transform: translateY(-2px);
          border-color: rgba(100, 210, 255, 0.52);
        }
        .sd-card-cover {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #0b101b;
        }
        .sd-card-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .sd-card-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.08) 42%, rgba(0,0,0,0.82) 100%);
        }
        .sd-badge-left {
          position: absolute;
          top: 8px;
          left: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.78);
          border: 1px solid rgba(100, 210, 255, 0.48);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          backdrop-filter: blur(6px);
        }
        .sd-badge-right {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.86);
          color: #ffffff;
          font-size: 10px;
          font-weight: 750;
        }
        .sd-top-actions {
          position: absolute;
          top: 8px;
          right: 8px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          z-index: 3;
        }
        .sd-top-actions .sd-fav-btn {
          position: static;
        }
        .sd-fav-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(10, 14, 22, 0.72);
          backdrop-filter: blur(8px);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 3;
          transition: transform 0.14s ease, background 0.14s ease, border-color 0.14s ease;
        }
        .sd-fav-btn:hover {
          transform: scale(1.08);
          background: rgba(10, 14, 22, 0.9);
        }
        .sd-fav-btn.is-fav {
          border-color: rgba(251, 191, 36, 0.7);
          background: rgba(251, 191, 36, 0.22);
        }
        .sd-card-footer {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 9px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 8px;
        }
        .sd-card-info {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sd-card-info strong {
          font-size: 13.5px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sd-card-info span {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.78);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sd-play-circle {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.92);
          border: 1.5px solid rgba(255, 255, 255, 0.5);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .sd-card-plain {
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sd-plain-ico {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: rgba(0, 113, 227, 0.24);
          color: #64d2ff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        @media (max-width: 960px) {
          .sd-topbar {
            display: none;
          }
          .sd-main {
            padding: 12px 12px 0;
          }
        }
        @media (max-width: 640px) {
          .sd-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
