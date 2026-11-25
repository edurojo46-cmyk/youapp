import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Check, Clock, Play, Radio } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  COUNTRY_CHANGED_EVENT,
  getActiveCountryProfile,
  type CountryProfile
} from '../../lib/geo/userCountry';
import { useAtlasAuthStore } from '../../store/atlas/atlasAuthStore';
import { formatWatchTime, useWatchContinuityStore } from '../../lib/tv/watchContinuityStore';

interface NotificationItem {
  id: string;
  kind: 'country_new' | 'continue';
  title: string;
  subtitle: string;
  thumb?: string;
  timeLabel: string;
  route: string;
}

const LAST_READ_KEY = 'youapp_notif_last_read_ts_v1';

function relativeTimeEs(iso?: string | null): string {
  if (!iso) return 'Reciente';
  const diffMin = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 60) return `hace ${diffMin} min`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export function NotificationBellPopover({ variant = 'glass' }: { variant?: 'light' | 'glass' }) {
  const isGlass = variant === 'glass';
  const navigate = useNavigate();
  const { user } = useAtlasAuthStore();
  const entriesByScope = useWatchContinuityStore((s) => s.entriesByScope);
  const getLatestForUser = useWatchContinuityStore((s) => s.getLatestForUser);
  void entriesByScope;

  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<CountryProfile>(() => getActiveCountryProfile());
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState<boolean>(() => {
    try {
      const last = Number(localStorage.getItem(LAST_READ_KEY) || 0);
      return Date.now() - last > 1000 * 60 * 30;
    } catch {
      return true;
    }
  });
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  );

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onCountryChange = () => setCountry(getActiveCountryProfile());
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setHasUnread(false);
    try {
      localStorage.setItem(LAST_READ_KEY, String(Date.now()));
    } catch {
      // ignore
    }

    (async () => {
      const built: NotificationItem[] = [];

      // 1. Continuidad real (último video en curso)
      const latestCp = getLatestForUser(user?.id, 1)[0];
      if (latestCp) {
        built.push({
          id: `cp-${latestCp.key}`,
          kind: 'continue',
          title: latestCp.blockTitle || latestCp.topic || 'Continuar viendo',
          subtitle: `Quedaste en ${formatWatchTime(latestCp.positionSec)} · ${latestCp.signalName}`,
          thumb: latestCp.thumbnailUrl,
          timeLabel: 'En curso',
          route: latestCp.route || '/misenal1'
        });
      }

      // 2. Novedades recientes reales del país activo en `youapp_index` (0 cuota)
      try {
        const { data } = await supabase
          .from('youapp_index')
          .select('video_id, title, creator_name, thumbnail_url, published_at')
          .eq('provider', 'youtube')
          .contains('tags', ['atlas-pointer-compact', country.tag])
          .not('published_at', 'is', null)
          .order('published_at', { ascending: false })
          .limit(5);

        if (Array.isArray(data)) {
          for (const r of data) {
            const vid = String(r?.video_id || '').trim();
            if (!vid) continue;
            built.push({
              id: `yt-${vid}`,
              kind: 'country_new',
              title: String(r?.title || 'Nuevo video'),
              subtitle: `${country.flag} ${String(r?.creator_name || country.name)}`,
              thumb: String(r?.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`),
              timeLabel: relativeTimeEs(r?.published_at),
              route: `/?v=${encodeURIComponent(vid)}&title=${encodeURIComponent(String(r?.title || '').slice(0, 80))}`
            });
          }
        }
      } catch {
        // silent fallback
      }

      if (alive) {
        setItems(built);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, country, user?.id, getLatestForUser]);

  const handleEnableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await window.Notification.requestPermission();
      setBrowserPerm(perm);
    } catch {
      // ignore
    }
  };

  return (
    <div ref={wrapRef} className="ynb-wrap">
      <button
        type="button"
        className={`ynb-trigger ${isGlass ? 'glass' : 'light'} ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        aria-expanded={open}
        title="Notificaciones y novedades"
      >
        {browserPerm === 'granted' ? <BellRing size={16} /> : <Bell size={16} />}
        {hasUnread && <span className="ynb-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className={`ynb-popover ${isGlass ? 'glass' : 'light'}`} role="dialog" aria-label="Notificaciones">
          <div className="ynb-head">
            <span className="ynb-title">Notificaciones</span>
            <span className="ynb-country-tag">
              {country.flag} {country.name}
            </span>
          </div>

          {browserPerm === 'default' && (
            <button type="button" className="ynb-perm-bar" onClick={() => void handleEnableBrowserAlerts()}>
              <BellRing size={13} color="#64d2ff" />
              <span>Activar avisos en este navegador</span>
            </button>
          )}
          {browserPerm === 'granted' && (
            <div className="ynb-perm-ok">
              <Check size={12} color="#34d399" />
              <span>Avisos web activados</span>
            </div>
          )}

          <div className="ynb-list">
            {loading && items.length === 0 ? (
              <div className="ynb-empty">Buscando novedades de {country.name}…</div>
            ) : items.length === 0 ? (
              <div className="ynb-empty">Estás al día. Sin notificaciones nuevas.</div>
            ) : (
              items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="ynb-row"
                  onClick={() => {
                    setOpen(false);
                    navigate(it.route);
                  }}
                >
                  <div className="ynb-thumb">
                    {it.thumb ? (
                      <img src={it.thumb} alt={it.title} loading="lazy" />
                    ) : it.kind === 'continue' ? (
                      <Clock size={16} />
                    ) : (
                      <Radio size={16} />
                    )}
                    <span className="ynb-play-mini">
                      <Play size={9} fill="#ffffff" color="#ffffff" />
                    </span>
                  </div>
                  <div className="ynb-copy">
                    <strong>{it.title}</strong>
                    <span>{it.subtitle}</span>
                    <em>{it.timeLabel}</em>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        .ynb-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .ynb-trigger {
          position: relative;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ynb-trigger.glass {
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          color: #f5f5f7;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .ynb-trigger.glass:hover,
        .ynb-trigger.glass.open {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(100, 210, 255, 0.7);
          color: #ffffff;
        }
        .ynb-trigger.light {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #334155;
        }
        .ynb-trigger.light:hover,
        .ynb-trigger.light.open {
          border-color: #2563eb;
          color: #0f172a;
        }
        .ynb-dot {
          position: absolute;
          top: 7px;
          right: 8px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.85);
        }

        .ynb-popover {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          z-index: 260;
          width: 332px;
          max-width: calc(100vw - 24px);
          max-height: 440px;
          border-radius: 18px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
        }
        .ynb-popover.glass {
          background: rgba(18, 20, 26, 0.92);
          backdrop-filter: blur(28px) saturate(185%);
          -webkit-backdrop-filter: blur(28px) saturate(185%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 24px 54px rgba(0, 0, 0, 0.56);
          color: #f5f5f7;
        }
        .ynb-popover.light {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 44px rgba(15, 23, 42, 0.18);
          color: #0f172a;
        }
        .ynb-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 2px 4px;
        }
        .ynb-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .ynb-country-tag {
          font-size: 11px;
          font-weight: 650;
          opacity: 0.75;
        }
        .ynb-perm-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 11px;
          border: 1px solid rgba(100, 210, 255, 0.35);
          background: rgba(100, 210, 255, 0.12);
          color: inherit;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          text-align: left;
        }
        .ynb-perm-ok {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 4px;
          font-size: 11px;
          opacity: 0.72;
        }
        .ynb-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow-y: auto;
        }
        .ynb-empty {
          padding: 20px 10px;
          text-align: center;
          font-size: 12px;
          opacity: 0.68;
        }
        .ynb-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 8px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: rgba(255, 255, 255, 0.05);
          color: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .ynb-popover.light .ynb-row {
          background: #f8fafc;
        }
        .ynb-row:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(100, 210, 255, 0.4);
        }
        .ynb-popover.light .ynb-row:hover {
          background: #eff6ff;
        }
        .ynb-thumb {
          position: relative;
          width: 72px;
          height: 44px;
          border-radius: 9px;
          overflow: hidden;
          background: #0c0e14;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ynb-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ynb-play-mini {
          position: absolute;
          right: 4px;
          bottom: 4px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(0, 113, 227, 0.9);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ynb-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ynb-copy strong {
          font-size: 12px;
          font-weight: 700;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.25;
        }
        .ynb-copy span {
          font-size: 11px;
          opacity: 0.72;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ynb-copy em {
          font-style: normal;
          font-size: 10px;
          color: #64d2ff;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
