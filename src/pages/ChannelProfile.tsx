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
  Pencil,
  Play,
  Radio,
  Search,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Wand2
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
import { SOCIAL_GRAPH_CHANGED_EVENT, loadSocialGraph } from '../lib/tv/youappSocialStore';
import {
  COUNTRY_CHANGED_EVENT,
  getActiveCountryProfile,
  type CountryProfile
} from '../lib/geo/userCountry';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { CountrySelectorPill } from '../components/ui/CountrySelectorPill';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import { AtlasBuildSignalBox } from '../components/tv/AtlasBuildSignalBox';

type ProfileTab = 'senales' | 'armar' | 'seguir' | 'actividad';

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export default function ChannelProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAtlasAuthStore();
  const entriesByScope = useWatchContinuityStore((s) => s.entriesByScope);
  const getLatestForUser = useWatchContinuityStore((s) => s.getLatestForUser);
  void entriesByScope;
  const recentCheckpoints = getLatestForUser(user?.id, 8);

  const activeSignal = useSignalStore((s) => s.activeSignal);
  const savedSignalsById = useSignalStore((s) => s.savedSignalsById);

  const [activeTab, setActiveTab] = useState<ProfileTab>('senales');
  const [activeCountry, setActiveCountry] = useState<CountryProfile>(() => getActiveCountryProfile());
  const [userSignals, setUserSignals] = useState<UserSignalSummary[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteSignalIds());
  const [followedCount, setFollowedCount] = useState<number>(
    () => (loadSocialGraph().followedCreatorsMeta || []).length
  );

  const [profileCoverUrl, setProfileCoverUrl] = useState<string>(() => readStorage('youapp_profile_cover_v1'));
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>(() => readStorage('youapp_profile_avatar_v1'));
  const [profileBio, setProfileBio] = useState<string>(() => readStorage('youapp_profile_bio_v1'));
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');

  const [notifItems, setNotifItems] = useState<
    Array<{ id: string; title: string; creator: string; thumb: string; publishedAt?: string | null }>
  >([]);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  );

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onCountryChange = () => setActiveCountry(getActiveCountryProfile());
    const syncFavs = () => setFavoriteIds(loadFavoriteSignalIds());
    const syncSocial = () => setFollowedCount((loadSocialGraph().followedCreatorsMeta || []).length);
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
    window.addEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
    window.addEventListener(SOCIAL_GRAPH_CHANGED_EVENT, syncSocial);
    return () => {
      window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
      window.removeEventListener(FAVORITE_SIGNALS_CHANGED_EVENT, syncFavs);
      window.removeEventListener(SOCIAL_GRAPH_CHANGED_EVENT, syncSocial);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void listSwitchableSignals()
      .then((list) => {
        if (alive && Array.isArray(list)) setUserSignals(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
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

  const handleImageUpload = (kind: 'cover' | 'avatar', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      if (kind === 'cover') {
        setProfileCoverUrl(dataUrl);
        try {
          localStorage.setItem('youapp_profile_cover_v1', dataUrl);
        } catch {
          // ignore
        }
      } else {
        setProfileAvatarUrl(dataUrl);
        try {
          localStorage.setItem('youapp_profile_avatar_v1', dataUrl);
        } catch {
          // ignore
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBio = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = bioDraft.trim().slice(0, 140);
    setProfileBio(cleaned);
    try {
      localStorage.setItem('youapp_profile_bio_v1', cleaned);
    } catch {
      // ignore
    }
    setIsEditingBio(false);
  };

  const handleEnableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await window.Notification.requestPermission();
      setBrowserPerm(perm);
    } catch {
      // ignore
    }
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
  const resolvedAvatar = profileAvatarUrl || user?.avatarUrl || '';
  const ambientBackdropUrl = profileCoverUrl || profileSignals[0]?.thumb || '';
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  return (
    <div className="fbp-page">
      <div
        className="fbp-bg"
        aria-hidden="true"
        style={ambientBackdropUrl ? { backgroundImage: `url(${ambientBackdropUrl})` } : undefined}
      />
      <div className="fbp-bg-veil" aria-hidden="true" />

      {/* BARRA SUPERIOR ESCRITORIO */}
      <header className="fbp-topbar">
        <div className="fbp-topbar-left">
          <button type="button" className="fbp-logo-btn" onClick={() => navigate('/')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="fbp-brand-pill">MI PERFIL</span>
        </div>

        <nav className="fbp-nav">
          <button type="button" className="fbp-nav-btn" onClick={() => navigate('/senales')}>SEÑALES</button>
          <button type="button" className="fbp-nav-btn" onClick={() => navigate('/mitv')}>MITV</button>
          <button type="button" className="fbp-nav-btn" onClick={() => navigate('/youmusic')}>YOU MUSIC</button>
          <button type="button" className="fbp-nav-btn" onClick={() => navigate('/reels')}>REELS</button>
          <button type="button" className="fbp-nav-btn" onClick={() => navigate('/lecturas')}>LECTURAS</button>
          <button type="button" className="fbp-nav-btn" onClick={() => navigate('/my-lists')}>MIS LISTAS</button>
          <button type="button" className="fbp-nav-btn active" onClick={() => navigate('/perfil')}>MI PERFIL</button>
          <button
            type="button"
            className="fbp-nav-btn"
            onClick={() => navigate('/search')}
            aria-label="Buscar"
            style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 10px' }}
          >
            <Search size={15} />
          </button>
        </nav>

        <TvUserSessionMenu variant="glass" />
      </header>

      <main className="fbp-shell">
        {/* ENCABEZADO TIPO FACEBOOK (PORTADA PANORÁMICA + AVATAR SUPERPUESTO + ACCIONES + PESTAÑAS) */}
        <section className="fbp-hero-card">
          <div
            className="fbp-cover"
            style={profileCoverUrl ? { backgroundImage: `url(${profileCoverUrl})` } : undefined}
          >
            <div className="fbp-cover-scrim" />
            <button
              type="button"
              className="fbp-cover-edit"
              onClick={() => coverInputRef.current?.click()}
            >
              <Camera size={13} />
              <span>{profileCoverUrl ? 'Editar portada' : 'Agregar portada'}</span>
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleImageUpload('cover', e)}
            />
          </div>

          <div className="fbp-header-body">
            <div className="fbp-identity-top">
              <div className="fbp-avatar-wrap">
                {resolvedAvatar ? (
                  <img src={resolvedAvatar} alt={displayName} className="fbp-avatar" />
                ) : (
                  <div className="fbp-avatar fbp-avatar-initials">{initials}</div>
                )}
                <button
                  type="button"
                  className="fbp-avatar-cam"
                  onClick={() => avatarInputRef.current?.click()}
                  title="Cambiar foto de perfil"
                  aria-label="Cambiar foto de perfil"
                >
                  <Camera size={13} />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleImageUpload('avatar', e)}
                />
              </div>

              <div className="fbp-name-block">
                <div className="fbp-name-row">
                  <h1>{displayName}</h1>
                  <span className="fbp-role-badge">
                    {isGuest ? 'Invitado' : 'Creador YOUAPP'}
                  </span>
                </div>

                {isEditingBio ? (
                  <form className="fbp-bio-form" onSubmit={handleSaveBio}>
                    <input
                      type="text"
                      value={bioDraft}
                      onChange={(e) => setBioDraft(e.target.value)}
                      placeholder="Contá de qué tratan tus señales…"
                      maxLength={140}
                      autoFocus
                    />
                    <button type="submit" className="fbp-bio-save">
                      <Check size={13} />
                    </button>
                  </form>
                ) : (
                  <div className="fbp-bio-row">
                    <p>
                      {profileBio ||
                        (isGuest
                          ? 'Tu estudio personal de señales en YOUAPP TV.'
                          : user?.email || 'Creador de señales temáticas en YOUAPP TV.')}
                    </p>
                    <button
                      type="button"
                      className="fbp-bio-edit-btn"
                      onClick={() => {
                        setBioDraft(profileBio);
                        setIsEditingBio(true);
                      }}
                      title="Editar presentación"
                      aria-label="Editar presentación"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}

                <div className="fbp-stats">
                  <span className="fbp-stat-chip">
                    <Radio size={11} color="#64d2ff" />
                    <strong>{profileSignals.length}</strong>{' '}
                    {profileSignals.length === 1 ? 'señal' : 'señales'}
                  </span>
                  <span className="fbp-stat-chip">
                    <Star size={11} fill="#fbbf24" color="#fbbf24" />
                    <strong>{favoriteIds.length}</strong> favoritas
                  </span>
                  <span className="fbp-stat-chip">
                    <strong>{followedCount}</strong> seguidos
                  </span>
                </div>
              </div>

              <div className="fbp-cta-bar">
                <button
                  type="button"
                  className="fbp-btn-primary"
                  onClick={() => setActiveTab('armar')}
                >
                  <Wand2 size={14} />
                  <span>+ Armar señal</span>
                </button>
                <button
                  type="button"
                  className="fbp-btn-secondary"
                  onClick={() => {
                    const primarySig = profileSignals[0];
                    const shareUrl = primarySig?.shareUrl || `${window.location.origin}/senales`;
                    void shareContentUniversal({
                      title: `${displayName} · Señales en YOUAPP TV`,
                      text: profileBio || `Mirá las señales de ${displayName} en YOUAPP TV`,
                      url: shareUrl,
                      thumbnailUrl: profileCoverUrl || primarySig?.thumb || '',
                      subtitle: `${profileSignals.length} señales · YOUAPP TV`,
                      badge: 'PERFIL YOUAPP TV'
                    });
                  }}
                >
                  <Share2 size={13} />
                  <span>Compartir</span>
                </button>
                <CountrySelectorPill />
              </div>
            </div>

            {/* BARRA DE PESTAÑAS ESTILO FACEBOOK */}
            <div className="fbp-tabs" role="tablist" aria-label="Secciones de Mi Perfil">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'senales'}
                className={`fbp-tab ${activeTab === 'senales' ? 'active' : ''}`}
                onClick={() => setActiveTab('senales')}
              >
                <Radio size={14} />
                <span>Mis Señales</span>
                <em>{profileSignals.length}</em>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'armar'}
                className={`fbp-tab ${activeTab === 'armar' ? 'active' : ''}`}
                onClick={() => setActiveTab('armar')}
              >
                <Sparkles size={14} />
                <span>Armar con ATLAS</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'seguir'}
                className={`fbp-tab ${activeTab === 'seguir' ? 'active' : ''}`}
                onClick={() => setActiveTab('seguir')}
              >
                <Clock size={14} />
                <span>Seguir viendo</span>
                {recentCheckpoints.length > 0 && <em>{recentCheckpoints.length}</em>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'actividad'}
                className={`fbp-tab ${activeTab === 'actividad' ? 'active' : ''}`}
                onClick={() => setActiveTab('actividad')}
              >
                <Bell size={14} />
                <span>Actividad</span>
              </button>
            </div>
          </div>
        </section>

        {/* CONTENIDO DE LA PESTAÑA ACTIVA */}
        {activeTab === 'senales' && (
          <section className="fbp-panel">
            <div className="fbp-panel-head">
              <div>
                <h2>Tus señales ({profileSignals.length})</h2>
                <span>Señales propias y favoritas listas para emitir y compartir</span>
              </div>
              <button type="button" className="fbp-link-pill" onClick={() => navigate('/senales')}>
                <Sparkles size={12} />
                <span>Explorar 100 señales</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {profileSignals.length === 0 ? (
              <div className="fbp-empty">
                <Radio size={28} color="#64d2ff" />
                <strong>Tu grilla de señales está lista</strong>
                <p>Armá tu primera señal temática en 3 segundos con ATLAS o fijá tus favoritas de las 100 señales.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="fbp-btn-primary" onClick={() => setActiveTab('armar')}>
                    <Wand2 size={14} /> Armar con ATLAS
                  </button>
                  <button type="button" className="fbp-btn-secondary" onClick={() => navigate('/senales')}>
                    Ver las 100 señales
                  </button>
                </div>
              </div>
            ) : (
              <div className="fbp-signals-grid">
                {profileSignals.map((sig) => (
                  <div
                    key={sig.id}
                    className="fbp-sig-card"
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
                    <div className="fbp-sig-cover">
                      {sig.thumb ? (
                        <img src={sig.thumb} alt={sig.name} loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="fbp-sig-fallback">
                          <Radio size={26} color="#7dd3fc" />
                        </div>
                      )}
                      <div className="fbp-sig-scrim" />
                      <span className="fbp-sig-badge">
                        {sig.isFav ? (
                          <Star size={10} fill="#fbbf24" color="#fbbf24" />
                        ) : (
                          <Radio size={10} color="#64d2ff" />
                        )}
                        <span>{sig.isFav ? 'Favorita' : 'Mi Señal'}</span>
                      </span>
                      <button
                        type="button"
                        className="fbp-sig-share"
                        title="Compartir señal"
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
                      <div className="fbp-sig-footer">
                        <div className="fbp-sig-info">
                          <strong>{sig.name}</strong>
                          <span>{sig.subtitle}</span>
                        </div>
                        <span className="fbp-sig-play">
                          <Play size={13} fill="#fff" color="#fff" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'armar' && (
          <div className="fbp-armar-wrap">
            <AtlasBuildSignalBox />
          </div>
        )}

        {activeTab === 'seguir' && (
          <section className="fbp-panel">
            <div className="fbp-panel-head">
              <div>
                <h2>Seguir viendo</h2>
                <span>Retomá exactamente donde dejaste cada video</span>
              </div>
              <button type="button" className="fbp-link-pill" onClick={() => navigate('/my-lists')}>
                <span>Ir a Mis Listas</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {recentCheckpoints.length === 0 ? (
              <div className="fbp-empty">
                <Clock size={26} color="#64d2ff" />
                <strong>Sin reproducción pendiente</strong>
                <p>Cuando mires un video en Señales o MiTV, va a aparecer acá para retomarlo en 1 toque.</p>
              </div>
            ) : (
              <div className="fbp-continue-grid">
                {recentCheckpoints.map((cp) => {
                  const pct =
                    cp.durationSec > 0
                      ? Math.min(100, Math.max(4, Math.round((cp.positionSec / cp.durationSec) * 100)))
                      : 15;
                  return (
                    <button
                      key={`${cp.signalId}-${cp.blockId}`}
                      type="button"
                      className="fbp-continue-card"
                      onClick={() => navigate(cp.route || '/misenal1')}
                    >
                      <div className="fbp-continue-thumb">
                        {cp.thumbnailUrl ? (
                          <img src={cp.thumbnailUrl} alt={cp.blockTitle} loading="lazy" />
                        ) : (
                          <div className="fbp-sig-fallback">
                            <Play size={18} />
                          </div>
                        )}
                        <span className="fbp-continue-time">{formatTime(cp.positionSec)}</span>
                        <div className="fbp-continue-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <strong className="fbp-continue-title">{cp.blockTitle}</strong>
                      <span className="fbp-continue-sub">{cp.signalName}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'actividad' && (
          <div className="fbp-activity-stack">
            <section className="fbp-panel">
              <div className="fbp-panel-head">
                <div>
                  <h2>Novedades en {activeCountry.name}</h2>
                  <span>Videos recientes detectados por ATLAS</span>
                </div>
                {browserPerm === 'default' && (
                  <button type="button" className="fbp-link-pill" onClick={() => void handleEnableBrowserAlerts()}>
                    <BellRing size={12} />
                    <span>Activar alertas</span>
                  </button>
                )}
              </div>

              {notifItems.length > 0 && (
                <div className="fbp-notif-list">
                  {notifItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="fbp-notif-row"
                      onClick={() => navigate(`/mitv?add=${encodeURIComponent(`https://www.youtube.com/watch?v=${it.id}`)}`)}
                    >
                      <img src={it.thumb} alt={it.title} loading="lazy" referrerPolicy="no-referrer" />
                      <div>
                        <strong>{it.title}</strong>
                        <span>{it.creator}</span>
                      </div>
                      <ChevronRight size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="fbp-panel">
              <div className="fbp-panel-head">
                <div>
                  <h2>Herramientas y cuenta</h2>
                  <span>Accesos directos de tu estudio YOUAPP</span>
                </div>
              </div>
              <div className="fbp-shortcuts">
                <button type="button" className="fbp-shortcut-btn" onClick={() => navigate('/repetidoras')}>
                  <Link2 size={15} color="#64d2ff" />
                  <span>Repetidoras</span>
                </button>
                <button type="button" className="fbp-shortcut-btn" onClick={() => navigate('/my-algorithm')}>
                  <SlidersHorizontal size={15} color="#64d2ff" />
                  <span>Mi Algoritmo</span>
                </button>
                <button type="button" className="fbp-shortcut-btn" onClick={() => navigate('/my-lists')}>
                  <Bookmark size={15} color="#64d2ff" />
                  <span>Mis Listas</span>
                </button>
                <button type="button" className="fbp-shortcut-btn" onClick={() => navigate('/remote')}>
                  <Smartphone size={15} color="#64d2ff" />
                  <span>YOU Remote</span>
                </button>
              </div>

              <div className="fbp-session-row">
                {isGuest ? (
                  <button
                    type="button"
                    className="fbp-btn-primary"
                    onClick={() => navigate(`/login?returnTo=${returnTo}`)}
                  >
                    <LogIn size={14} />
                    <span>Iniciar sesión para guardar en la nube</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fbp-btn-danger"
                    onClick={() => void signOut()}
                  >
                    <LogOut size={14} />
                    <span>Cerrar sesión</span>
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <style>{`
        .fbp-page {
          position: relative;
          min-height: 100dvh;
          background: #0c1018;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          padding-bottom: 64px;
          overflow-x: clip;
        }
        .fbp-bg {
          position: fixed;
          inset: -24px;
          z-index: 0;
          background: radial-gradient(circle at 20% 0%, rgba(0, 113, 227, 0.34), transparent 46%),
            radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.16), transparent 40%),
            #0b0f18;
          background-size: cover;
          background-position: center;
          filter: blur(42px) saturate(165%) brightness(0.42);
          transform: scale(1.08);
          pointer-events: none;
        }
        .fbp-bg-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(180deg, rgba(10, 14, 24, 0.35) 0%, rgba(10, 14, 24, 0.86) 100%);
          pointer-events: none;
        }
        .fbp-topbar,
        .fbp-shell {
          position: relative;
          z-index: 2;
        }
        .fbp-topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 22px;
          background: rgba(14, 18, 28, 0.72);
          backdrop-filter: saturate(180%) blur(22px);
          -webkit-backdrop-filter: saturate(180%) blur(22px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .fbp-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .fbp-logo-btn {
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
        }
        .fbp-brand-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.26);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #d8f3ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .fbp-nav {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fbp-nav-btn {
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
        .fbp-nav-btn:hover,
        .fbp-nav-btn.active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(100, 210, 255, 0.45);
          color: #ffffff;
        }
        .fbp-shell {
          max-width: 980px;
          margin: 0 auto;
          padding: 14px 16px 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .fbp-hero-card {
          border-radius: 24px;
          overflow: hidden;
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.14) 0%,
            rgba(18, 24, 38, 0.72) 55%,
            rgba(255, 255, 255, 0.08) 100%
          );
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 18px 46px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
        }
        .fbp-cover {
          position: relative;
          height: 210px;
          background: linear-gradient(135deg, #0f172a 0%, #0071e3 52%, #0ea5e9 100%);
          background-size: cover;
          background-position: center;
        }
        .fbp-cover-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.16) 0%, rgba(12, 16, 24, 0.72) 100%);
        }
        .fbp-cover-edit {
          position: absolute;
          right: 14px;
          bottom: 12px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(12, 16, 24, 0.76);
          color: #ffffff;
          font-size: 12px;
          font-weight: 680;
          cursor: pointer;
          backdrop-filter: blur(8px);
        }
        .fbp-cover-edit:hover {
          background: rgba(0, 113, 227, 0.85);
        }
        .fbp-header-body {
          padding: 0 22px;
        }
        .fbp-identity-top {
          display: flex;
          align-items: flex-end;
          gap: 18px;
          flex-wrap: wrap;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }
        .fbp-avatar-wrap {
          position: relative;
          margin-top: -54px;
          flex-shrink: 0;
          z-index: 3;
        }
        .fbp-avatar {
          width: 112px;
          height: 112px;
          border-radius: 999px;
          object-fit: cover;
          border: 4px solid #141926;
          box-shadow: 0 0 0 2px rgba(100, 210, 255, 0.7), 0 10px 26px rgba(0, 0, 0, 0.45);
          background: linear-gradient(135deg, #0071e3 0%, #38bdf8 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fbp-avatar-initials {
          font-size: 34px;
          font-weight: 800;
          color: #ffffff;
        }
        .fbp-avatar-cam {
          position: absolute;
          right: 2px;
          bottom: 4px;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 2px solid #141926;
          background: #273043;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .fbp-avatar-cam:hover {
          background: #0071e3;
        }
        .fbp-name-block {
          flex: 1;
          min-width: 200px;
          padding-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .fbp-name-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .fbp-name-row h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.15;
        }
        .fbp-role-badge {
          font-size: 10.5px;
          font-weight: 750;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(100, 210, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.42);
          color: #bae6fd;
        }
        .fbp-bio-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fbp-bio-row p {
          margin: 0;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.76);
        }
        .fbp-bio-edit-btn {
          border: 0;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.78);
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .fbp-bio-form {
          display: flex;
          align-items: center;
          gap: 6px;
          max-width: 360px;
        }
        .fbp-bio-form input {
          flex: 1;
          padding: 5px 10px;
          border-radius: 9px;
          border: 1px solid #64d2ff;
          background: rgba(10, 14, 24, 0.7);
          color: #ffffff;
          font-size: 12.5px;
          outline: none;
        }
        .fbp-bio-save {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 0;
          background: #0071e3;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .fbp-stats {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }
        .fbp-stat-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.16);
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.84);
        }
        .fbp-stat-chip strong {
          color: #ffffff;
          font-weight: 760;
        }
        .fbp-cta-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .fbp-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 15px;
          border-radius: 10px;
          border: 0;
          background: linear-gradient(135deg, #0071e3 0%, #0a84ff 100%);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 720;
          cursor: pointer;
          white-space: nowrap;
        }
        .fbp-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 13px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 680;
          cursor: pointer;
          white-space: nowrap;
        }
        .fbp-btn-danger {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 15px;
          border-radius: 10px;
          border: 1px solid rgba(255, 69, 58, 0.45);
          background: rgba(255, 69, 58, 0.16);
          color: #ffb4ae;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .fbp-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 0 12px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .fbp-tabs::-webkit-scrollbar {
          display: none;
        }
        .fbp-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(245, 245, 247, 0.82);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
        }
        .fbp-tab em {
          font-style: normal;
          font-size: 10.5px;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
        }
        .fbp-tab.active {
          background: rgba(255, 255, 255, 0.94);
          border-color: #ffffff;
          color: #0f172a;
          box-shadow: 0 4px 14px rgba(255, 255, 255, 0.18);
        }
        .fbp-tab.active em {
          background: rgba(15, 23, 42, 0.12);
          color: #0f172a;
        }
        .fbp-panel {
          border-radius: 22px;
          padding: 16px 18px;
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.12) 0%,
            rgba(18, 24, 38, 0.68) 100%
          );
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 12px 32px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .fbp-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .fbp-panel-head h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 760;
          color: #ffffff;
        }
        .fbp-panel-head span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.68);
        }
        .fbp-link-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.42);
          background: rgba(0, 113, 227, 0.22);
          color: #e0f2fe;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .fbp-empty {
          padding: 28px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          border-radius: 16px;
          background: rgba(10, 14, 24, 0.45);
          border: 1px dashed rgba(255, 255, 255, 0.18);
        }
        .fbp-empty p {
          margin: 0;
          font-size: 12.5px;
          color: rgba(245, 245, 247, 0.72);
          max-width: 380px;
        }
        .fbp-signals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 10px;
        }
        .fbp-sig-card {
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.09);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
          color: #ffffff;
          padding: 0;
          cursor: pointer;
          text-align: left;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .fbp-sig-card:hover {
          transform: translateY(-2px);
          border-color: rgba(100, 210, 255, 0.58);
        }
        .fbp-sig-cover {
          position: relative;
          width: 100%;
          height: 112px;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
        }
        .fbp-sig-cover > img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.3s ease;
        }
        .fbp-sig-card:hover .fbp-sig-cover > img {
          transform: scale(1.03);
        }
        .fbp-sig-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(8, 10, 14, 0.12) 0%, rgba(8, 10, 14, 0.86) 100%);
        }
        .fbp-sig-footer {
          position: relative;
          z-index: 1;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
        }
        .fbp-sig-fallback {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #111827 0%, #1d4ed8 100%);
        }
        .fbp-sig-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.08) 42%, rgba(0, 0, 0, 0.85) 100%);
        }
        .fbp-sig-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.78);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
        }
        .fbp-sig-share {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(10, 14, 22, 0.76);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 3;
        }
        .fbp-sig-footer {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 9px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 8px;
        }
        .fbp-sig-info {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .fbp-sig-info strong {
          font-size: 13px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fbp-sig-info span {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.78);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fbp-sig-play {
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
        .fbp-continue-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 12px;
        }
        .fbp-continue-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          padding: 8px;
          background: rgba(10, 14, 24, 0.5);
          text-align: left;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 6px;
          cursor: pointer;
        }
        .fbp-continue-thumb {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 10px;
          overflow: hidden;
          background: #000;
        }
        .fbp-continue-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .fbp-continue-time {
          position: absolute;
          right: 6px;
          bottom: 8px;
          padding: 2px 6px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.78);
          font-size: 10px;
          font-weight: 700;
        }
        .fbp-continue-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.22);
        }
        .fbp-continue-bar span {
          display: block;
          height: 100%;
          background: #0a84ff;
        }
        .fbp-continue-title {
          font-size: 12.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fbp-continue-sub {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.68);
        }
        .fbp-activity-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .fbp-notif-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fbp-notif-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(10, 14, 24, 0.5);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
        }
        .fbp-notif-row img {
          width: 68px;
          height: 42px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .fbp-notif-row div {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .fbp-notif-row strong {
          font-size: 12.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fbp-notif-row span {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.68);
        }
        .fbp-shortcuts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
        }
        .fbp-shortcut-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 680;
          cursor: pointer;
        }
        .fbp-shortcut-btn:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .fbp-session-row {
          display: flex;
          justify-content: flex-start;
          padding-top: 4px;
        }
        @media (max-width: 960px) {
          .fbp-topbar {
            display: none;
          }
        }
        @media (max-width: 640px) {
          .fbp-shell {
            padding: 10px 10px 0;
          }
          .fbp-cover {
            height: 152px;
          }
          .fbp-header-body {
            padding: 0 14px;
          }
          .fbp-identity-top {
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 10px;
          }
          .fbp-avatar-wrap {
            margin-top: -48px;
          }
          .fbp-avatar {
            width: 96px;
            height: 96px;
          }
          .fbp-name-block {
            align-items: center;
            padding-top: 2px;
          }
          .fbp-name-row {
            justify-content: center;
          }
          .fbp-name-row h1 {
            font-size: 21px;
          }
          .fbp-bio-row {
            justify-content: center;
          }
          .fbp-stats {
            justify-content: center;
          }
          .fbp-cta-bar {
            justify-content: center;
          }
          .fbp-signals-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
