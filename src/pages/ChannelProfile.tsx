import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Clock,
  Link2,
  LogIn,
  LogOut,
  Play,
  Radio,
  Search,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAtlasAuthStore } from '../store/atlas/atlasAuthStore';
import { useWatchContinuityStore } from '../lib/tv/watchContinuityStore';
import { useSignalStore } from '../lib/tv/signalStore';
import { listSwitchableSignals, type UserSignalSummary } from '../lib/tv/associationsService';
import {
  FAVORITE_SIGNALS_CHANGED_EVENT,
  SIGNALS_100_CATALOG,
  findSignal100ById,
  loadFavoriteSignalIds
} from '../lib/tv/signals100Catalog';
import { findCuratedSignalById } from '../lib/tv/curatedSignalsCatalog';
import { buildShareableSignalUrl } from '../lib/tv/atlasSignalBuilder';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import { AtlasBuildSignalBox } from '../components/tv/AtlasBuildSignalBox';
import {
  COUNTRY_CHANGED_EVENT,
  getActiveCountryProfile,
  type CountryProfile
} from '../lib/geo/userCountry';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { CountrySelectorPill } from '../components/ui/CountrySelectorPill';

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function ChannelProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAtlasAuthStore();
  const entriesByScope = useWatchContinuityStore((s) => s.entriesByScope);
  const getLatestForUser = useWatchContinuityStore((s) => s.getLatestForUser);
  void entriesByScope;
  const recentCheckpoints = getLatestForUser(user?.id, 6);
  const [activeCountry, setActiveCountry] = useState<CountryProfile>(() => getActiveCountryProfile());
  const [notifItems, setNotifItems] = useState<
    Array<{ id: string; title: string; creator: string; thumb: string; publishedAt?: string | null }>
  >([]);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  );
  const activeSignal = useSignalStore((s) => s.activeSignal);
  const savedSignalsById = useSignalStore((s) => s.savedSignalsById);
  const [userSignals, setUserSignals] = useState<UserSignalSummary[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteSignalIds());
  const [profileCoverUrl, setProfileCoverUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('youapp_profile_cover_v1') || '';
    } catch {
      return '';
    }
  });
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    void listSwitchableSignals()
      .then((list) => {
        if (alive && Array.isArray(list)) setUserSignals(list);
      })
      .catch(() => {});
    const syncFavs = () => setFavoriteIds(loadFavoriteSignalIds());
    window.addEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
    return () => {
      alive = false;
      window.removeEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
    };
  }, []);

  const handleUploadProfileCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      setProfileCoverUrl(dataUrl);
      try {
        localStorage.setItem('youapp_profile_cover_v1', dataUrl);
      } catch {
        // ignore quota
      }
    };
    reader.readAsDataURL(file);
  };

  const profileSignals = useMemo(() => {
    const out: Array<{
      id: string;
      name: string;
      subtitle: string;
      thumb: string;
      isFav: boolean;
      shareUrl: string;
    }> = [];
    const seen = new Set<string>();

    const localBranding = (() => {
      try {
        const raw = localStorage.getItem('youapp_signal_branding_v1');
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })();

    for (const sig of userSignals) {
      if (!sig?.id || seen.has(sig.id)) continue;
      seen.add(sig.id);
      const b = localBranding[sig.id] || localBranding[sig.clientSignalId] || {};
      const stored =
        savedSignalsById?.[sig.id] ||
        savedSignalsById?.[sig.clientSignalId] ||
        (activeSignal?.id === sig.id ? activeSignal : null);
      const firstItem = stored?.schedule?.[0]?.contentItem as
        | { thumbnailUrl?: string; thumbnail?: string; providerId?: string; id?: string }
        | undefined;
      const ytId = firstItem?.providerId || firstItem?.id || '';
      const curated = findCuratedSignalById(sig.id) || findCuratedSignalById(sig.name);
      const cat100 = findSignal100ById(sig.id) || findSignal100ById(sig.name);
      const thumb =
        b.coverDataUrl ||
        b.avatarDataUrl ||
        firstItem?.thumbnailUrl ||
        firstItem?.thumbnail ||
        (/^[A-Za-z0-9_-]{11}$/.test(ytId) ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '') ||
        (curated?.coverVideoId ? `https://i.ytimg.com/vi/${curated.coverVideoId}/hqdefault.jpg` : '') ||
        (cat100?.coverVideoId ? `https://i.ytimg.com/vi/${cat100.coverVideoId}/hqdefault.jpg` : '');
      const shareUrl = stored
        ? buildShareableSignalUrl({ id: stored.id, name: stored.name, schedule: stored.schedule })
        : `${window.location.origin}/misenal1?signal=${encodeURIComponent(sig.id)}&sharedSignal=1`;
      out.push({
        id: sig.id,
        name: sig.name,
        subtitle: sig.mainTopic || 'Mi Señal',
        thumb,
        isFav: favoriteIds.includes(sig.id),
        shareUrl
      });
    }

    for (const favId of favoriteIds) {
      if (seen.has(favId)) continue;
      const cat = SIGNALS_100_CATALOG.find((s) => s.id === favId);
      if (!cat) continue;
      seen.add(favId);
      out.push({
        id: cat.id,
        name: cat.title,
        subtitle: cat.subtitle,
        thumb: cat.coverVideoId ? `https://i.ytimg.com/vi/${cat.coverVideoId}/hqdefault.jpg` : '',
        isFav: true,
        shareUrl: `${window.location.origin}/misenal1?signal=${encodeURIComponent(cat.id)}&sharedSignal=1`
      });
    }

    return out;
  }, [userSignals, savedSignalsById, activeSignal, favoriteIds]);

  useEffect(() => {
    const onCountryChange = () => setActiveCountry(getActiveCountryProfile());
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
    return () => window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('youapp_index')
          .select('video_id, title, creator_name, thumbnail_url, published_at')
          .eq('provider', 'youtube')
          .contains('tags', ['atlas-pointer-compact', activeCountry.tag])
          .not('published_at', 'is', null)
          .order('published_at', { ascending: false })
          .limit(4);
        if (!alive || !Array.isArray(data)) return;
        setNotifItems(
          data
            .filter((r: any) => r?.video_id)
            .map((r: any) => ({
              id: String(r.video_id),
              title: String(r.title || 'Nuevo video'),
              creator: String(r.creator_name || activeCountry.name),
              thumb: String(r.thumbnail_url || `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`),
              publishedAt: r.published_at || null
            }))
        );
      } catch {
        // silent
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeCountry]);

  const handleEnableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await window.Notification.requestPermission();
      setBrowserPerm(perm);
    } catch {
      // ignore
    }
  };

  const isGuest = !user || Boolean(user.isAnonymous || !user.email);
  const displayName = isGuest
    ? user?.name || 'Invitado YOUAPP'
    : user?.name || user?.email?.split('@')[0] || 'Mi Cuenta';
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'TV';

  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  return (
    <div className="mp-page">
      <div className="mp-bg" aria-hidden="true" />
      <div className="mp-veil" aria-hidden="true" />

      {/* BARRA SUPERIOR UNIFICADA */}
      <header className="mp-topbar">
        <div className="mp-topbar-left">
          <button type="button" className="mp-logo-btn" onClick={() => navigate('/')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="mp-brand-pill">MI PERFIL</span>
        </div>

        <nav className="mp-nav">
          <button type="button" className="mp-nav-btn" onClick={() => navigate('/senales')}>SEÑALES</button>
          <button type="button" className="mp-nav-btn" onClick={() => navigate('/mitv')}>MITV</button>
          <button type="button" className="mp-nav-btn" onClick={() => navigate('/youmusic')}>YOU MUSIC</button>
          <button type="button" className="mp-nav-btn" onClick={() => navigate('/reels')}>REELS</button>
          <button type="button" className="mp-nav-btn" onClick={() => navigate('/lecturas')}>LECTURAS</button>
          <button type="button" className="mp-nav-btn" onClick={() => navigate('/my-lists')}>MIS LISTAS</button>
          <button
            type="button"
            className="mp-nav-btn"
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

      {/* UNA SOLA COLUMNA LIMPIA Y SERENA */}
      <main className="mp-main">
        {/* TARJETA DE IDENTIDAD CON PORTADA EDITABLE */}
        <section className="mp-glass-card mp-identity-card mp-identity-with-cover">
          <div
            className="mp-profile-cover"
            style={profileCoverUrl ? { backgroundImage: `url(${profileCoverUrl})` } : undefined}
          >
            <div className="mp-profile-cover-scrim" />
            <span className="mp-profile-air-pill">
              <Radio size={11} color="#64d2ff" />
              <span>PERFIL DE SEÑALES</span>
            </span>
            <button
              type="button"
              className="mp-cover-btn"
              onClick={() => coverInputRef.current?.click()}
            >
              <Camera size={12} />
              <span>{profileCoverUrl ? 'Cambiar portada' : 'Subir portada'}</span>
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleUploadProfileCover}
            />
          </div>

          <div className="mp-identity-row mp-identity-row-padded">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} className="mp-avatar" />
            ) : (
              <div className="mp-avatar mp-avatar-initials" aria-hidden="true">
                {initials}
              </div>
            )}

            <div className="mp-user-copy">
              <span className="mp-kicker">{isGuest ? 'MODO INVITADO' : 'CUENTA YOUAPP'}</span>
              <h1>{displayName}</h1>
              <p>
                {isGuest
                  ? 'Tu progreso se guarda en este dispositivo. Iniciá sesión para sincronizarlo en la nube.'
                  : user?.email}
              </p>
            </div>

            <div className="mp-identity-actions">
              <CountrySelectorPill />
              {isGuest ? (
                <button
                  type="button"
                  className="mp-primary-btn"
                  onClick={() => navigate(`/login?returnTo=${returnTo}`)}
                >
                  <LogIn size={14} />
                  <span>Iniciar sesión</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="mp-primary-btn"
                  onClick={() => navigate('/misenal1')}
                >
                  <Radio size={14} />
                  <span>Ir a Mi Señal</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* TODAS TUS SEÑALES ADENTRO DE MI PERFIL */}
        <section className="mp-glass-card">
          <div className="mp-sec-head">
            <h2>
              <Radio size={14} color="#64d2ff" /> Mis Señales ({profileSignals.length})
            </h2>
            <button type="button" className="mp-link-btn" onClick={() => navigate('/senales')}>
              <Sparkles size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              Ver las 100 señales
            </button>
          </div>

          {profileSignals.length === 0 ? (
            <div className="mp-empty-signals">
              <span>Todavía no fijaste ni creaste señales. Armá una en 3 segundos abajo o explorá las 100 señales temáticas.</span>
            </div>
          ) : (
            <div className="mp-signals-grid">
              {profileSignals.map((sig) => (
                <div
                  key={sig.id}
                  className="mp-sig-card"
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
                  <div className="mp-sig-cover">
                    {sig.thumb ? (
                      <img src={sig.thumb} alt={sig.name} loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="mp-sig-fallback">
                        <Radio size={22} color="#64d2ff" />
                      </div>
                    )}
                    <div className="mp-sig-scrim" />
                    <span className="mp-sig-badge">
                      {sig.isFav ? <Star size={10} fill="#fbbf24" color="#fbbf24" /> : <Radio size={10} color="#64d2ff" />}
                      <span>{sig.isFav ? 'Favorita' : 'Señal'}</span>
                    </span>
                    <button
                      type="button"
                      className="mp-sig-share"
                      title="Compartir esta señal"
                      aria-label={`Compartir ${sig.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void shareContentUniversal({
                          title: `${sig.name} · Mi señal en YOUAPP`,
                          text: sig.subtitle,
                          url: sig.shareUrl,
                          thumbnailUrl: sig.thumb,
                          subtitle: 'YOUAPP TV',
                          badge: 'MI SEÑAL EN YOUAPP'
                        });
                      }}
                    >
                      <Share2 size={12} color="#ffffff" />
                    </button>
                    <div className="mp-sig-footer">
                      <div className="mp-sig-info">
                        <strong>{sig.name}</strong>
                        <span>{sig.subtitle}</span>
                      </div>
                      <span className="mp-sig-play">
                        <Play size={12} fill="#fff" color="#fff" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ARMÁ TU SEÑAL CON ATLAS DESDE TU PERFIL */}
        <AtlasBuildSignalBox compact />

        {/* SEGUIR VIENDO (SOLO SI HAY HISTORIAL REAL EN CURSO) */}
        {recentCheckpoints.length > 0 && (
          <section className="mp-glass-card">
            <div className="mp-sec-head">
              <h2>
                <Clock size={14} /> Seguir viendo
              </h2>
              <button type="button" className="mp-link-btn" onClick={() => navigate('/my-lists')}>
                Ver todo
              </button>
            </div>
            <div className="mp-continue-grid">
              {recentCheckpoints.slice(0, 4).map((cp) => {
                const pct =
                  cp.durationSec > 0
                    ? Math.min(100, Math.max(4, Math.round((cp.positionSec / cp.durationSec) * 100)))
                    : 15;
                return (
                  <button
                    key={`${cp.signalId}-${cp.blockId}`}
                    type="button"
                    className="mp-continue-card"
                    onClick={() => navigate(cp.route || '/misenal1')}
                  >
                    <div className="mp-continue-thumb">
                      {cp.thumbnailUrl ? (
                        <img src={cp.thumbnailUrl} alt={cp.blockTitle} loading="lazy" />
                      ) : (
                        <div className="mp-continue-fallback">
                          <Play size={18} />
                        </div>
                      )}
                      <span className="mp-continue-time">{formatTime(cp.positionSec)}</span>
                      <div className="mp-continue-bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <strong className="mp-continue-title">{cp.blockTitle}</strong>
                    <span className="mp-continue-sub">{cp.signalName}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* NOTIFICACIONES Y NOVEDADES */}
        <section className="mp-glass-card">
          <div className="mp-sec-head">
            <h2>
              {browserPerm === 'granted' ? <BellRing size={14} /> : <Bell size={14} />} Notificaciones ·{' '}
              {activeCountry.flag} {activeCountry.name}
            </h2>
            {browserPerm === 'default' && (
              <button
                type="button"
                className="mp-link-btn"
                onClick={() => void handleEnableBrowserAlerts()}
              >
                Activar avisos web
              </button>
            )}
            {browserPerm === 'granted' && (
              <span className="mp-notif-ok">
                <Check size={12} /> Activadas
              </span>
            )}
          </div>

          {notifItems.length === 0 ? (
            <p className="mp-notif-empty">
              Estás al día. Acá vas a ver los nuevos estrenos y noticias de {activeCountry.name}.
            </p>
          ) : (
            <div className="mp-notif-list">
              {notifItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="mp-notif-row"
                  onClick={() =>
                    navigate(`/?v=${encodeURIComponent(n.id)}&title=${encodeURIComponent(n.title.slice(0, 80))}`)
                  }
                >
                  <div className="mp-notif-thumb">
                    <img src={n.thumb} alt={n.title} loading="lazy" />
                  </div>
                  <div className="mp-notif-copy">
                    <strong>{n.title}</strong>
                    <span>{n.creator}</span>
                  </div>
                  <ChevronRight size={15} className="mp-chev" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 4 ACCESOS ESENCIALES EN GRILLA LIMPIA */}
        <section className="mp-glass-card">
          <div className="mp-sec-head">
            <h2>Tu espacio</h2>
          </div>
          <div className="mp-shortcuts-grid">
            <button type="button" className="mp-shortcut" onClick={() => navigate('/my-lists')}>
              <span className="mp-ico blue">
                <Bookmark size={18} />
              </span>
              <span className="mp-shortcut-text">
                <strong>Mis Listas y Señales</strong>
                <span>Tu señal compartible, guardados y momentos</span>
              </span>
              <ChevronRight size={16} className="mp-chev" />
            </button>

            <button type="button" className="mp-shortcut" onClick={() => navigate('/my-algorithm')}>
              <span className="mp-ico cyan">
                <SlidersHorizontal size={18} />
              </span>
              <span className="mp-shortcut-text">
                <strong>Mi Algoritmo</strong>
                <span>Ajustá qué contenidos prioriza YOUAPP</span>
              </span>
              <ChevronRight size={16} className="mp-chev" />
            </button>

            <button type="button" className="mp-shortcut" onClick={() => navigate('/redes')}>
              <span className="mp-ico purple">
                <Link2 size={18} />
              </span>
              <span className="mp-shortcut-text">
                <strong>Redes conectadas</strong>
                <span>Publicación y presencia en tus cuentas</span>
              </span>
              <ChevronRight size={16} className="mp-chev" />
            </button>

            <button type="button" className="mp-shortcut" onClick={() => navigate('/remote')}>
              <span className="mp-ico amber">
                <Smartphone size={18} />
              </span>
              <span className="mp-shortcut-text">
                <strong>Control remoto TV</strong>
                <span>Vinculá tu celular con tu televisor</span>
              </span>
              <ChevronRight size={16} className="mp-chev" />
            </button>
          </div>
        </section>

        {/* SESIÓN */}
        <div className="mp-session-footer">
          {isGuest ? (
            <button
              type="button"
              className="mp-session-btn"
              onClick={() => navigate(`/login?returnTo=${returnTo}`)}
            >
              <LogIn size={15} />
              <span>Iniciar sesión o crear cuenta</span>
            </button>
          ) : (
            <button
              type="button"
              className="mp-session-btn danger"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              <LogOut size={15} />
              <span>Cerrar sesión</span>
            </button>
          )}
        </div>
      </main>

      <style>{`
        .mp-page {
          position: relative;
          min-height: 100dvh;
          background-color: #16181f;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          padding-bottom: 84px;
          overflow-x: clip;
          isolation: isolate;
        }
        .mp-bg {
          position: fixed;
          inset: -18px;
          z-index: 0;
          background-color: #1b1812;
          background-image: url('/my-lists-autumn-lake-bg.png');
          background-size: cover;
          background-position: center;
          filter: blur(12px) brightness(0.86) contrast(1.05) saturate(1.06);
          transform: scale(1.04) translateZ(0);
          pointer-events: none;
        }
        .mp-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            rgba(18, 20, 26, 0.24) 0%,
            rgba(16, 18, 24, 0.34) 55%,
            rgba(12, 14, 20, 0.56) 100%
          );
          pointer-events: none;
        }

        .mp-topbar {
          position: sticky;
          top: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 12px 24px;
          background: rgba(24, 26, 30, 0.56);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .mp-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .mp-logo-btn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .mp-brand-pill {
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #e5f3ff;
          white-space: nowrap;
        }
        .mp-nav {
          display: flex;
          align-items: center;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
          flex-wrap: nowrap;
        }
        .mp-nav::-webkit-scrollbar { display: none; }
        .mp-nav-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 11.5px;
          font-weight: 650;
          letter-spacing: 0.06em;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .mp-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        .mp-main {
          position: relative;
          z-index: 2;
          max-width: 780px;
          margin: 28px auto 0;
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .mp-glass-card {
          position: relative;
          border-radius: 26px;
          padding: 22px 24px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(22px) saturate(155%);
          -webkit-backdrop-filter: blur(22px) saturate(155%);
          box-shadow: 0 20px 44px rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .mp-glass-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.8px;
          background:
            radial-gradient(220px circle at 0% 0%, rgba(255, 255, 255, 0.85), transparent 56%),
            radial-gradient(200px circle at 100% 0%, rgba(125, 211, 252, 0.62), transparent 56%),
            radial-gradient(220px circle at 100% 100%, rgba(255, 255, 255, 0.65), transparent 56%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .mp-glass-card > * { position: relative; z-index: 1; }

        .mp-identity-row {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
        }
        .mp-avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(125, 211, 252, 0.65);
          box-shadow: 0 10px 26px rgba(0, 113, 227, 0.28);
          flex-shrink: 0;
        }
        .mp-avatar-initials {
          background: linear-gradient(135deg, #0071e3 0%, #38bdf8 100%);
          color: #ffffff;
          font-size: 24px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mp-user-copy {
          flex: 1;
          min-width: 200px;
        }
        .mp-kicker {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: rgba(125, 211, 252, 0.9);
          margin-bottom: 3px;
        }
        .mp-user-copy h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        .mp-user-copy p {
          margin: 4px 0 0;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.72);
          line-height: 1.45;
        }
        .mp-identity-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .mp-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 16px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.55);
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .mp-primary-btn:hover {
          background: #0a84ff;
          transform: translateY(-1px);
        }

        .mp-sec-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .mp-sec-head h2 {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(245, 245, 247, 0.85);
        }
        .mp-link-btn {
          border: none;
          background: transparent;
          color: #64d2ff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }

        .mp-continue-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .mp-continue-card {
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
        .mp-continue-thumb {
          position: relative;
          aspect-ratio: 16 / 9;
          border-radius: 14px;
          overflow: hidden;
          background: #10131d;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .mp-continue-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .mp-continue-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.55);
        }
        .mp-continue-time {
          position: absolute;
          right: 6px;
          bottom: 8px;
          padding: 2px 6px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.78);
          font-size: 10px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .mp-continue-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.2);
        }
        .mp-continue-bar span {
          display: block;
          height: 100%;
          background: #38bdf8;
        }
        .mp-continue-title {
          font-size: 12.5px;
          font-weight: 700;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .mp-continue-sub {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.62);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mp-shortcuts-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .mp-shortcut {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
          transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
        }
        .mp-shortcut:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(125, 211, 252, 0.58);
          transform: translateY(-1px);
        }
        .mp-ico {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .mp-ico.blue { background: rgba(0, 113, 227, 0.25); color: #7dd3fc; }
        .mp-ico.cyan { background: rgba(6, 182, 212, 0.24); color: #67e8f9; }
        .mp-ico.purple { background: rgba(139, 92, 246, 0.24); color: #d8b4fe; }
        .mp-ico.amber { background: rgba(245, 158, 11, 0.24); color: #fde68a; }

        .mp-shortcut-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .mp-shortcut-text strong {
          font-size: 13.5px;
          font-weight: 700;
          color: #ffffff;
        }
        .mp-shortcut-text span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mp-chev {
          color: rgba(255, 255, 255, 0.45);
          flex-shrink: 0;
        }
        .mp-notif-ok {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          font-weight: 700;
          color: #6ee7b7;
        }
        .mp-notif-empty {
          margin: 0;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.72);
        }
        .mp-notif-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mp-notif-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 11px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .mp-notif-row:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(125, 211, 252, 0.52);
        }
        .mp-notif-thumb {
          width: 78px;
          height: 46px;
          border-radius: 10px;
          overflow: hidden;
          background: #0d1018;
          flex-shrink: 0;
        }
        .mp-notif-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .mp-notif-copy {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .mp-notif-copy strong {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mp-notif-copy span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.7);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mp-session-footer {
          display: flex;
          justify-content: center;
          padding-top: 6px;
        }
        .mp-session-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(245, 245, 247, 0.88);
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .mp-session-btn:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .mp-session-btn.danger:hover {
          background: rgba(255, 69, 58, 0.16);
          border-color: rgba(255, 69, 58, 0.45);
          color: #ff9a94;
        }

        .mp-identity-with-cover {
          padding: 0 !important;
          overflow: hidden;
        }
        .mp-profile-cover {
          position: relative;
          height: 118px;
          background: linear-gradient(135deg, #0f172a 0%, #0071e3 55%, #0ea5e9 100%);
          background-size: cover;
          background-position: center;
        }
        .mp-profile-cover-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(10, 14, 24, 0.72) 100%);
        }
        .mp-profile-air-pill {
          position: absolute;
          top: 10px;
          left: 12px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.74);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #e0f2fe;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .mp-cover-btn {
          position: absolute;
          top: 10px;
          right: 12px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(10, 14, 22, 0.68);
          color: #ffffff;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
          backdrop-filter: blur(8px);
        }
        .mp-identity-row-padded {
          padding: 14px 18px 18px;
        }
        .mp-empty-signals {
          font-size: 12.5px;
          color: rgba(245, 245, 247, 0.72);
          padding: 6px 0;
        }
        .mp-signals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 10px;
        }
        .mp-sig-card {
          border-radius: 15px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: #0b101b;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .mp-sig-card:hover {
          transform: translateY(-2px);
          border-color: rgba(100, 210, 255, 0.5);
        }
        .mp-sig-cover {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
        }
        .mp-sig-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .mp-sig-fallback {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #111827 0%, #1d4ed8 100%);
        }
        .mp-sig-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.1) 42%, rgba(0, 0, 0, 0.84) 100%);
        }
        .mp-sig-badge {
          position: absolute;
          top: 7px;
          left: 7px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.76);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
        }
        .mp-sig-share {
          position: absolute;
          top: 7px;
          right: 7px;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(10, 14, 22, 0.74);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 3;
        }
        .mp-sig-footer {
          position: absolute;
          left: 9px;
          right: 9px;
          bottom: 8px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 8px;
        }
        .mp-sig-info {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .mp-sig-info strong {
          font-size: 12.5px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mp-sig-info span {
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.78);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mp-sig-play {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.92);
          border: 1.5px solid rgba(255, 255, 255, 0.5);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        @media (max-width: 680px) {
          .mp-topbar { padding: 10px 14px; }
          .mp-nav { display: none; }
          .mp-shortcuts-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
